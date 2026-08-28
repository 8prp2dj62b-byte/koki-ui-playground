import crypto from 'node:crypto';
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

const AUTH0 = 'https://login.kleinanzeigen.de';
const CLIENT_ID = 'uV5j90myVPc2XzEOFuWUD2At17OACEGQ';
const REDIRECT_URI = 'https://login.kleinanzeigen.de/android/com.ebay.kleinanzeigen/callback';
const SCOPE = 'openid email profile offline_access';
const KOKI_ORIGIN = process.env.KOKI_ORIGIN || 'https://koki.tonyshodling.eu';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://aqhdzfsspmuvadnlchvj.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || '';
const STORE_URL = process.env.KLEINANZEIGEN_STORE_URL || '';
const SESSION_SECRET = process.env.BRIDGE_SESSION_SECRET || '';
const BUILD = 'koki-kleinanzeigen-browser-bridge-v1';
const STATE_TTL_MS = 5 * 60 * 1000;

function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin === KOKI_ORIGIN) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Headers', 'authorization,content-type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-KOKI-Kleinanzeigen-Bridge', BUILD);
}

function json(res, status, payload) {
  res.status(status).json(payload);
}

function bearer(req) {
  const value = String(req.headers.authorization || '');
  return /^Bearer\s+/i.test(value) ? value.replace(/^Bearer\s+/i, '').trim() : '';
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

function pkce() {
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  const state = b64url(crypto.randomBytes(16));
  return { verifier, challenge, state };
}

function stateKey() {
  if (!SESSION_SECRET || SESSION_SECRET.length < 32) throw new Error('bridge_session_secret_missing');
  return crypto.createHash('sha256').update(SESSION_SECRET).digest();
}

function sealState(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', stateKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(value));
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [b64url(iv), b64url(tag), b64url(encrypted)].join('.');
}

function openState(token) {
  try {
    const [ivRaw, tagRaw, bodyRaw] = String(token || '').split('.');
    if (!ivRaw || !tagRaw || !bodyRaw) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', stateKey(), Buffer.from(ivRaw, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
    const decoded = Buffer.concat([
      decipher.update(Buffer.from(bodyRaw, 'base64url')),
      decipher.final(),
    ]);
    const value = JSON.parse(decoded.toString('utf8'));
    if (!value?.expiresAt || Number(value.expiresAt) < Date.now()) return null;
    return value;
  } catch {
    return null;
  }
}

async function currentProfileId(accessToken) {
  if (!accessToken || !SUPABASE_PUBLISHABLE_KEY) return null;
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
  const value = await response.json().catch(() => null);
  return typeof value === 'string' && value.length >= 20 ? value : null;
}

function authUrl({ challenge, state }) {
  const query = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPE,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    prompt: 'login',
  });
  return `${AUTH0}/authorize?${query.toString()}`;
}

async function launchBrowser() {
  chromium.setGraphicsMode = false;
  return puppeteer.launch({
    args: chromium.args,
    defaultViewport: { width: 430, height: 932, deviceScaleFactor: 1 },
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  });
}

async function firstSelector(page, selectors, timeout = 12000) {
  const stop = Date.now() + timeout;
  while (Date.now() < stop) {
    for (const selector of selectors) {
      if (await page.$(selector)) return selector;
    }
    await new Promise((resolve) => setTimeout(resolve, 180));
  }
  return null;
}

async function typeInto(page, selector, value) {
  await page.focus(selector);
  await page.evaluate((s) => {
    const el = document.querySelector(s);
    if (el) el.value = '';
  }, selector);
  await page.type(selector, value, { delay: 18 });
}

async function submitClosestForm(page, selector) {
  const navigated = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 12000 }).catch(() => null);
  await page.evaluate((s) => {
    const input = document.querySelector(s);
    const form = input?.closest('form');
    const submit = form?.querySelector('button[type="submit"],input[type="submit"]');
    if (submit) submit.click();
    else if (form?.requestSubmit) form.requestSubmit();
    else form?.submit();
  }, selector);
  await navigated;
}

function callbackFrom(url) {
  try {
    const parsed = new URL(url);
    if (parsed.origin !== AUTH0 || parsed.pathname !== '/android/com.ebay.kleinanzeigen/callback') return null;
    const code = parsed.searchParams.get('code');
    const state = parsed.searchParams.get('state');
    return code && state ? { url, code, state } : null;
  } catch {
    return null;
  }
}

async function visibleText(page) {
  return page.evaluate(() => String(document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 1200)).catch(() => '');
}

async function detectOtp(page) {
  return firstSelector(page, [
    'input[autocomplete="one-time-code"]',
    'input[name*="otp" i]',
    'input[name*="code" i]',
    'input[inputmode="numeric"]',
  ], 1200);
}

async function waitOutcome(page, captured, expectedState, timeout = 18000) {
  const stop = Date.now() + timeout;
  while (Date.now() < stop) {
    const callback = callbackFrom(captured.value) || callbackFrom(page.url());
    if (callback) {
      if (callback.state !== expectedState) return { type: 'error', error: 'state_mismatch' };
      return { type: 'callback', callback };
    }
    const otpSelector = await detectOtp(page);
    if (otpSelector) return { type: 'otp', otpSelector };
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const text = (await visibleText(page)).toLowerCase();
  if (/passwort|password/.test(text) && /falsch|incorrect|ungültig|invalid/.test(text)) {
    return { type: 'error', error: 'invalid_credentials' };
  }
  if (/captcha|sicherheitsüberprüfung|security check|robot/.test(text)) {
    return { type: 'error', error: 'security_challenge_required' };
  }
  return { type: 'error', error: 'login_not_completed' };
}

async function exchangeCode(code, verifier) {
  const response = await fetch(`${AUTH0}/oauth/token`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'Kleinanzeigen Android 2026.25.0',
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      code,
      code_verifier: verifier,
      redirect_uri: REDIRECT_URI,
    }),
    signal: AbortSignal.timeout(30000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.access_token || !data?.refresh_token) throw new Error('token_exchange_failed');
  return data;
}

function idTokenEmail(idToken) {
  try {
    const payload = String(idToken || '').split('.')[1];
    if (!payload) return null;
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return claims?.email ? String(claims.email) : null;
  } catch {
    return null;
  }
}

async function persistTokens(kokiAccessToken, tokens) {
  if (!STORE_URL) throw new Error('store_url_missing');
  const response = await fetch(STORE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${kokiAccessToken}`,
      apikey: SUPABASE_PUBLISHABLE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      id_token: tokens.id_token || null,
      expires_in: Number(tokens.expires_in || 600),
    }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok !== true) throw new Error('token_store_failed');
  return data;
}

async function finish(kokiAccessToken, code, verifier) {
  const tokens = await exchangeCode(code, verifier);
  await persistTokens(kokiAccessToken, tokens);
  return { ok: true, connected: true, account: { email: idTokenEmail(tokens.id_token) } };
}

async function browserLogin({ email, password, profileId, kokiAccessToken }) {
  const oauth = pkce();
  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36');
    const captured = { value: '' };
    page.on('request', (request) => {
      if (callbackFrom(request.url())) captured.value = request.url();
    });
    await page.goto(authUrl(oauth), { waitUntil: 'domcontentloaded', timeout: 25000 });

    const userSelector = await firstSelector(page, [
      'input[name="username"]',
      'input[type="email"]',
      'input[autocomplete="username"]',
    ]);
    if (!userSelector) throw new Error('identifier_form_missing');
    await typeInto(page, userSelector, email);
    await submitClosestForm(page, userSelector);

    const passwordSelector = await firstSelector(page, [
      'input[name="password"]',
      'input[type="password"]',
      'input[autocomplete="current-password"]',
    ]);
    if (!passwordSelector) throw new Error('password_form_missing');
    await typeInto(page, passwordSelector, password);
    await submitClosestForm(page, passwordSelector);

    const outcome = await waitOutcome(page, captured, oauth.state);
    if (outcome.type === 'callback') return finish(kokiAccessToken, outcome.callback.code, oauth.verifier);
    if (outcome.type === 'otp') {
      const cookies = await browser.defaultBrowserContext().cookies();
      return {
        ok: true,
        mfa_required: true,
        continuation: sealState({
          version: 1,
          profileId,
          expiresAt: Date.now() + STATE_TTL_MS,
          url: page.url(),
          cookies,
          verifier: oauth.verifier,
          oauthState: oauth.state,
        }),
      };
    }
    throw new Error(outcome.error || 'login_failed');
  } finally {
    await browser?.close().catch(() => {});
  }
}

async function fillOtp(page, code) {
  const selectors = [
    'input[autocomplete="one-time-code"]',
    'input[name*="otp" i]',
    'input[name*="code" i]',
    'input[inputmode="numeric"]',
  ];
  const selector = await firstSelector(page, selectors, 10000);
  if (!selector) throw new Error('otp_form_missing');
  const candidates = await page.$$(selector);
  if (candidates.length > 1 && code.length === candidates.length) {
    for (let i = 0; i < candidates.length; i += 1) await candidates[i].type(code[i], { delay: 30 });
  } else {
    await typeInto(page, selector, code);
  }
  await submitClosestForm(page, selector);
}

async function browserOtp({ continuation, code, profileId, kokiAccessToken }) {
  const saved = openState(continuation);
  if (!saved || saved.profileId !== profileId) throw new Error('continuation_invalid');
  let browser;
  try {
    browser = await launchBrowser();
    const context = browser.defaultBrowserContext();
    if (Array.isArray(saved.cookies) && saved.cookies.length) await context.setCookie(...saved.cookies);
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36');
    const captured = { value: '' };
    page.on('request', (request) => {
      if (callbackFrom(request.url())) captured.value = request.url();
    });
    await page.goto(saved.url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await fillOtp(page, code);
    const outcome = await waitOutcome(page, captured, saved.oauthState);
    if (outcome.type === 'callback') return finish(kokiAccessToken, outcome.callback.code, saved.verifier);
    if (outcome.type === 'otp') {
      const cookies = await context.cookies();
      return {
        ok: true,
        mfa_required: true,
        continuation: sealState({ ...saved, expiresAt: Date.now() + STATE_TTL_MS, url: page.url(), cookies }),
        error: 'otp_not_accepted',
      };
    }
    throw new Error(outcome.error || 'mfa_failed');
  } finally {
    await browser?.close().catch(() => {});
  }
}

function publicError(error) {
  const value = String(error?.message || error || 'integration_unavailable');
  const allowed = new Set([
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
    'store_url_missing',
    'bridge_session_secret_missing',
  ]);
  return allowed.has(value) ? value : 'integration_unavailable';
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method === 'GET') return json(res, 200, { ok: true, build: BUILD });
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method_not_allowed' });
  if (req.headers.origin && req.headers.origin !== KOKI_ORIGIN) return json(res, 403, { ok: false, error: 'origin_not_allowed' });

  const kokiAccessToken = bearer(req);
  const profileId = await currentProfileId(kokiAccessToken).catch(() => null);
  if (!profileId) return json(res, 401, { ok: false, error: 'authentication_required' });

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const action = String(body.action || 'login');
  try {
    if (action === 'login') {
      const email = String(body.email || '').trim();
      const password = String(body.password || '');
      if (!email || email.length > 320 || !email.includes('@') || !password || password.length > 512) {
        return json(res, 400, { ok: false, error: 'invalid_credentials_input' });
      }
      const result = await browserLogin({ email, password, profileId, kokiAccessToken });
      return json(res, 200, result);
    }
    if (action === 'otp') {
      const continuation = String(body.continuation || '');
      const code = String(body.code || '').replace(/\s+/g, '');
      if (!continuation || !/^\d{4,10}$/.test(code)) return json(res, 400, { ok: false, error: 'invalid_otp_input' });
      const result = await browserOtp({ continuation, code, profileId, kokiAccessToken });
      return json(res, 200, result);
    }
    return json(res, 400, { ok: false, error: 'unknown_action' });
  } catch (error) {
    return json(res, 502, { ok: false, error: publicError(error) });
  }
}
