import crypto from 'node:crypto';
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

const AUTH0 = 'https://login.kleinanzeigen.de';
const CLIENT_ID = 'uV5j90myVPc2XzEOFuWUD2At17OACEGQ';
const REDIRECT_URI = 'https://login.kleinanzeigen.de/android/com.ebay.kleinanzeigen/callback';
const SCOPE = 'openid email profile offline_access';
const KOKI_ORIGIN = 'https://koki.tonyshodling.eu';
const SUPABASE_URL = 'https://aqhdzfsspmuvadnlchvj.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_WJ_rzmuZWm6fvNep3cUMlw_LD86ncn9';
const COMPLETE_URL = `${SUPABASE_URL}/functions/v1/koki-command-center-staging-v30/complete-code`;
const BUILD = 'koki-kleinanzeigen-browser-link-v2';
const CONTINUATION_TTL_MS = 5 * 60 * 1000;

function setHeaders(req, res) {
  const origin = req.headers.origin;
  if (origin === KOKI_ORIGIN) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Headers', 'authorization,content-type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Vary', 'Origin');
  res.setHeader('X-KOKI-Kleinanzeigen-Bridge', BUILD);
}

function reply(res, status, body) {
  return res.status(status).json(body);
}

function bearer(req) {
  const value = String(req.headers.authorization || '');
  return /^Bearer\s+/i.test(value) ? value.replace(/^Bearer\s+/i, '').trim() : '';
}

function keyFor(accessToken) {
  return crypto.createHash('sha256').update(`${accessToken}|${BUILD}|continuation`).digest();
}

function seal(value, accessToken) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyFor(accessToken), iv);
  const encrypted = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(value))), cipher.final()]);
  return [iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}

function open(token, accessToken) {
  try {
    const [ivRaw, tagRaw, bodyRaw] = String(token || '').split('.');
    if (!ivRaw || !tagRaw || !bodyRaw) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', keyFor(accessToken), Buffer.from(ivRaw, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
    const clear = Buffer.concat([decipher.update(Buffer.from(bodyRaw, 'base64url')), decipher.final()]);
    const value = JSON.parse(clear.toString('utf8'));
    return Number(value?.expiresAt || 0) > Date.now() ? value : null;
  } catch {
    return null;
  }
}

async function currentProfileId(accessToken) {
  if (!accessToken) return null;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/koki_current_profile_id`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) return null;
  const profileId = await response.json().catch(() => null);
  return typeof profileId === 'string' && profileId.length >= 20 ? profileId : null;
}

function b64url(value) {
  return Buffer.from(value).toString('base64url');
}

function oauthState() {
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  const state = b64url(crypto.randomBytes(16));
  return { verifier, challenge, state };
}

function authorizationUrl(oauth) {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPE,
    code_challenge: oauth.challenge,
    code_challenge_method: 'S256',
    state: oauth.state,
    prompt: 'login',
  });
  return `${AUTH0}/authorize?${params}`;
}

async function launch() {
  chromium.setGraphicsMode = false;
  return puppeteer.launch({
    args: chromium.args,
    defaultViewport: { width: 430, height: 932, deviceScaleFactor: 1 },
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  });
}

async function firstSelector(page, selectors, timeout = 12000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    for (const selector of selectors) if (await page.$(selector)) return selector;
    await new Promise((resolve) => setTimeout(resolve, 180));
  }
  return null;
}

async function type(page, selector, value) {
  await page.focus(selector);
  await page.evaluate((s) => {
    const element = document.querySelector(s);
    if (element) element.value = '';
  }, selector);
  await page.type(selector, value, { delay: 18 });
}

async function submit(page, selector) {
  const navigation = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 12000 }).catch(() => null);
  await page.evaluate((s) => {
    const input = document.querySelector(s);
    const form = input?.closest('form');
    const button = form?.querySelector('button[type="submit"],input[type="submit"]');
    if (button) button.click();
    else if (form?.requestSubmit) form.requestSubmit();
    else form?.submit();
  }, selector);
  await navigation;
}

function parseCallback(url) {
  try {
    const parsed = new URL(url);
    if (parsed.origin !== AUTH0 || parsed.pathname !== '/android/com.ebay.kleinanzeigen/callback') return null;
    const code = parsed.searchParams.get('code');
    const state = parsed.searchParams.get('state');
    return code && state ? { code, state } : null;
  } catch {
    return null;
  }
}

async function otpSelector(page) {
  return firstSelector(page, [
    'input[autocomplete="one-time-code"]',
    'input[name*="otp" i]',
    'input[name*="code" i]',
    'input[inputmode="numeric"]',
  ], 1000);
}

async function bodyText(page) {
  return page.evaluate(() => String(document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 1200)).catch(() => '');
}

async function waitForResult(page, capture, expectedState, timeout = 18000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const callback = parseCallback(capture.url) || parseCallback(page.url());
    if (callback) return callback.state === expectedState ? { type: 'callback', callback } : { type: 'error', error: 'state_mismatch' };
    const otp = await otpSelector(page);
    if (otp) return { type: 'otp', selector: otp };
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const text = (await bodyText(page)).toLowerCase();
  if (/passwort|password/.test(text) && /falsch|incorrect|ungültig|invalid/.test(text)) return { type: 'error', error: 'invalid_credentials' };
  if (/captcha|sicherheitsüberprüfung|security check|robot/.test(text)) return { type: 'error', error: 'security_challenge_required' };
  return { type: 'error', error: 'login_not_completed' };
}

async function finish(accessToken, code, verifier) {
  const response = await fetch(COMPLETE_URL, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ authorization_code: code, code_verifier: verifier }),
    signal: AbortSignal.timeout(30000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok !== true) throw new Error(data?.error || 'token_store_failed');
  return { ok: true, connected: true, account: data.account || null };
}

async function beginLogin({ email, password, profileId, accessToken }) {
  const oauth = oauthState();
  let browser;
  try {
    browser = await launch();
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36');
    const capture = { url: '' };
    page.on('request', (request) => {
      if (parseCallback(request.url())) capture.url = request.url();
    });
    await page.goto(authorizationUrl(oauth), { waitUntil: 'domcontentloaded', timeout: 25000 });

    const username = await firstSelector(page, ['input[name="username"]', 'input[type="email"]', 'input[autocomplete="username"]']);
    if (!username) throw new Error('identifier_form_missing');
    await type(page, username, email);
    await submit(page, username);

    const passwordInput = await firstSelector(page, ['input[name="password"]', 'input[type="password"]', 'input[autocomplete="current-password"]']);
    if (!passwordInput) throw new Error('password_form_missing');
    await type(page, passwordInput, password);
    await submit(page, passwordInput);

    const outcome = await waitForResult(page, capture, oauth.state);
    if (outcome.type === 'callback') return finish(accessToken, outcome.callback.code, oauth.verifier);
    if (outcome.type === 'otp') {
      const cookies = await browser.defaultBrowserContext().cookies();
      return {
        ok: true,
        mfa_required: true,
        continuation: seal({
          version: 2,
          profileId,
          expiresAt: Date.now() + CONTINUATION_TTL_MS,
          url: page.url(),
          cookies,
          verifier: oauth.verifier,
          oauthState: oauth.state,
        }, accessToken),
      };
    }
    throw new Error(outcome.error || 'login_failed');
  } finally {
    await browser?.close().catch(() => {});
  }
}

async function enterOtp(page, code) {
  const selector = await firstSelector(page, [
    'input[autocomplete="one-time-code"]',
    'input[name*="otp" i]',
    'input[name*="code" i]',
    'input[inputmode="numeric"]',
  ], 10000);
  if (!selector) throw new Error('otp_form_missing');
  const inputs = await page.$$(selector);
  if (inputs.length > 1 && inputs.length === code.length) {
    for (let i = 0; i < inputs.length; i += 1) await inputs[i].type(code[i], { delay: 30 });
    const navigation = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 12000 }).catch(() => null);
    await page.evaluate(() => {
      const active = document.activeElement;
      const form = active?.closest?.('form') || document.querySelector('form');
      const button = form?.querySelector('button[type="submit"],input[type="submit"]');
      if (button) button.click(); else if (form?.requestSubmit) form.requestSubmit();
    });
    await navigation;
  } else {
    await type(page, selector, code);
    await submit(page, selector);
  }
}

async function continueMfa({ continuation, code, profileId, accessToken }) {
  const saved = open(continuation, accessToken);
  if (!saved || saved.profileId !== profileId) throw new Error('continuation_invalid');
  let browser;
  try {
    browser = await launch();
    const context = browser.defaultBrowserContext();
    if (Array.isArray(saved.cookies) && saved.cookies.length) await context.setCookie(...saved.cookies);
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36');
    const capture = { url: '' };
    page.on('request', (request) => {
      if (parseCallback(request.url())) capture.url = request.url();
    });
    await page.goto(saved.url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await enterOtp(page, code);
    const outcome = await waitForResult(page, capture, saved.oauthState);
    if (outcome.type === 'callback') return finish(accessToken, outcome.callback.code, saved.verifier);
    if (outcome.type === 'otp') {
      return {
        ok: true,
        mfa_required: true,
        error: 'otp_not_accepted',
        continuation: seal({
          ...saved,
          expiresAt: Date.now() + CONTINUATION_TTL_MS,
          url: page.url(),
          cookies: await context.cookies(),
        }, accessToken),
      };
    }
    throw new Error(outcome.error || 'mfa_failed');
  } finally {
    await browser?.close().catch(() => {});
  }
}

function safeError(error) {
  const value = String(error?.message || error || 'integration_unavailable');
  return new Set([
    'invalid_credentials',
    'security_challenge_required',
    'login_not_completed',
    'identifier_form_missing',
    'password_form_missing',
    'otp_form_missing',
    'continuation_invalid',
    'state_mismatch',
    'token_exchange_failed',
    'token_store_failed',
  ]).has(value) ? value : 'integration_unavailable';
}

export default async function handler(req, res) {
  setHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method === 'GET') return reply(res, 200, { ok: true, build: BUILD });
  if (req.method !== 'POST') return reply(res, 405, { ok: false, error: 'method_not_allowed' });
  if (req.headers.origin && req.headers.origin !== KOKI_ORIGIN) return reply(res, 403, { ok: false, error: 'origin_not_allowed' });

  const accessToken = bearer(req);
  const profileId = await currentProfileId(accessToken).catch(() => null);
  if (!profileId) return reply(res, 401, { ok: false, error: 'authentication_required' });

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  try {
    if (body.action === 'otp') {
      const continuation = String(body.continuation || '');
      const code = String(body.code || '').replace(/\s+/g, '');
      if (!continuation || !/^\d{4,10}$/.test(code)) return reply(res, 400, { ok: false, error: 'invalid_otp_input' });
      return reply(res, 200, await continueMfa({ continuation, code, profileId, accessToken }));
    }

    const email = String(body.email || '').trim();
    const password = String(body.password || '');
    if (!email || !email.includes('@') || email.length > 320 || !password || password.length > 512) {
      return reply(res, 400, { ok: false, error: 'invalid_credentials_input' });
    }
    return reply(res, 200, await beginLogin({ email, password, profileId, accessToken }));
  } catch (error) {
    return reply(res, 502, { ok: false, error: safeError(error) });
  }
}
