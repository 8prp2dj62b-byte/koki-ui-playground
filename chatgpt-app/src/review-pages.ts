import fs from 'node:fs';
import type express from 'express';

const BRAND = '#335CFF';

function esc(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c] || c));
}

function layout(title: string, body: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>${esc(title)} · KOKI</title><style>:root{color-scheme:light dark}*{box-sizing:border-box}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;background:#eef1f5;color:#141820}.wrap{max-width:820px;margin:0 auto;padding:32px 18px 60px}.card{background:#fff;border:1px solid #dee3e9;border-radius:16px;padding:28px}.brand{display:flex;align-items:center;gap:12px;margin-bottom:24px}.logo{width:44px;height:44px;border-radius:11px;background:${BRAND};color:#fff;display:grid;place-items:center;font-size:25px;font-weight:850}.brand b{font-size:18px}.brand span{display:block;color:#707a86;font-size:12px;margin-top:2px}h1{font-size:30px;letter-spacing:-.03em;margin:0 0 16px}h2{font-size:17px;margin:28px 0 8px}p,li{font-size:14px;line-height:1.65}a{color:${BRAND}}.muted{color:#707a86}.nav{display:flex;gap:14px;flex-wrap:wrap;margin-top:28px;padding-top:18px;border-top:1px solid #dee3e9;font-size:13px}@media(prefers-color-scheme:dark){body{background:#141820;color:#fff}.card{background:#20252c;border-color:#4b545e}.muted,.brand span{color:#9aa4af}.nav{border-color:#4b545e}}</style></head><body><main class="wrap"><article class="card"><div class="brand"><div class="logo">K</div><div><b>KOKI</b><span>Marketplace assistant for ChatGPT</span></div></div>${body}<nav class="nav"><a href="/chatgpt/">Home</a><a href="/chatgpt/privacy">Privacy</a><a href="/chatgpt/terms">Terms</a><a href="/chatgpt/support">Support</a></nav></article></main></body></html>`;
}

const privacy = `
<h1>Privacy Policy</h1><p class="muted">Effective 9 September 2026</p>
<p>KOKI is a marketplace assistant that connects ChatGPT to a user's KOKI account and supported third-party marketplaces. This policy explains how information is handled when KOKI is used through ChatGPT.</p>
<h2>Information KOKI processes</h2><p>KOKI may process the minimum information needed for a requested feature, including KOKI account/profile information, marketplace connection status, listing information and images, marketplace conversations, saved search criteria, sale drafts, notifications, automation settings, and technical security/audit information.</p>
<p>KOKI does not return marketplace passwords, cookies, access tokens, API keys or other authentication secrets in ChatGPT tool responses.</p>
<h2>Authentication</h2><p>When a user connects KOKI to ChatGPT, sign-in happens on KOKI's authorization service. KOKI credentials are submitted to KOKI, not to the conversational model. ChatGPT receives authorization tokens needed to call KOKI on the user's behalf.</p>
<h2>How information is used</h2><ul><li>Show listings, searches, conversations and activity.</li><li>Retrieve real source-backed marketplace or property-search results.</li><li>Manage user-requested marketplace conversations and enabled negotiation automation.</li><li>Create, analyze, optimize and publish user-approved sale listings.</li><li>Provide notifications and account controls.</li><li>Prevent abuse, enforce ownership boundaries, debug failures and maintain audit records.</li></ul><p>KOKI does not sell personal information.</p>
<h2>Third-party services</h2><p>KOKI may send task-specific information to services required for the requested workflow, including supported marketplaces such as OLX and Kleinanzeigen, property source imot.bg, and configured AI processing providers such as Google Gemini for classification, analysis, translation or draft generation. Those services process information under their own terms and privacy policies.</p>
<h2>Automated actions</h2><p>If a user enables KOKI automation, KOKI may send marketplace messages or perform other enabled actions according to configured strategy and controls. Users can stop automation or take over a supported conversation.</p>
<h2>Retention and security</h2><p>KOKI keeps data for as long as needed to provide the service, maintain history and security, comply with applicable obligations, or resolve disputes. KOKI uses authenticated tenant-scoped requests, ownership checks, HTTPS transport, server-side marketplace credentials, action auditing and retry/idempotency controls where applicable.</p>
<h2>Children</h2><p>KOKI is intended for adults who are able to enter marketplace transactions and manage marketplace accounts. It is not designed for children.</p>
<h2>Contact</h2><p>For privacy questions or requests, use the <a href="/chatgpt/support">KOKI support page</a>.</p>`;

const terms = `
<h1>Terms of Service</h1><p class="muted">Effective 9 September 2026</p>
<h2>What KOKI does</h2><p>KOKI is a marketplace assistant. Depending on connected services and enabled features, KOKI can search source listings, display marketplace conversations, control negotiation automation, create and optimize sale drafts, publish supported listings, and run property searches.</p>
<p>KOKI is not a marketplace, payment processor, escrow service, broker, real-estate agent or seller of third-party items shown through the service.</p>
<h2>Third-party marketplaces</h2><p>KOKI interacts with third-party services such as OLX, Kleinanzeigen and imot.bg where supported. Use of those services remains subject to their own terms, policies, account restrictions and availability. KOKI is not endorsed by or affiliated with those services unless expressly stated otherwise.</p>
<h2>User responsibility</h2><p>Users remain responsible for the accuracy and legality of information they provide, reviewing prices/listing content/messages before acting, complying with marketplace rules and law, and deciding whether to buy, sell, meet, ship, pay or otherwise complete a transaction.</p>
<h2>Automated actions</h2><p>When automation is enabled, KOKI may send messages or perform supported actions according to configured strategy and limits. Publishing, sending a marketplace message, disconnecting an account, deleting a draft or similar actions can have consequences outside ChatGPT and are exposed as explicit actions.</p>
<h2>Source data and AI assistance</h2><p>KOKI is designed to distinguish source-backed marketplace data from AI-generated analysis or drafting. AI-generated content can include summaries, translations, categorization, pricing analysis, negotiation suggestions and listing copy. AI outputs can be incomplete or incorrect and should be reviewed before reliance.</p>
<h2>No payment execution or guarantee</h2><p>Unless a future feature explicitly states otherwise, KOKI does not transfer money, hold funds, guarantee delivery, guarantee item condition, guarantee counterparty identity or guarantee completion of a transaction.</p>
<h2>Prohibited use</h2><p>Users must not use KOKI to violate law, marketplace rules, third-party rights, security controls or OpenAI policies, including fraud, impersonation, misrepresentation of goods or unauthorized account/system access.</p>
<h2>Availability</h2><p>KOKI depends on third-party marketplaces, network services and AI providers. Features can be delayed, unavailable or changed when an upstream service changes or becomes unavailable.</p>
<h2>Privacy and support</h2><p>See the <a href="/chatgpt/privacy">Privacy Policy</a> and <a href="/chatgpt/support">Support</a>.</p>`;

const support = `
<h1>Support</h1><p>KOKI support covers the ChatGPT plugin, KOKI account connection, marketplace integrations, search, conversations, automation controls and listing workflows.</p>
<h2>Before reporting a problem</h2><p>Note the approximate time, affected marketplace, KOKI listing/search/conversation title and attempted action. Never send passwords, marketplace cookies, API keys or other authentication secrets.</p>
<h2>Common recovery actions</h2><ul><li>If ChatGPT can no longer access KOKI, disconnect and reconnect the KOKI app.</li><li>If a marketplace connection has expired, reconnect it from the KOKI profile.</li><li>If an external action has uncertain status, refresh before repeating it.</li><li>If automation should not send further messages, use Stop KOKI or take over the conversation.</li></ul>
<h2>Privacy and account requests</h2><p>Privacy, access or deletion requests can be initiated through the KOKI account/support workflow. KOKI will not ask for your password in a support request.</p>`;

const home = `
<h1>KOKI Marketplace Assistant</h1><p>KOKI connects ChatGPT to marketplace workflows without moving marketplace credentials into ChatGPT.</p>
<h2>What you can do</h2><ul><li>Review BUY and SELL operations.</li><li>Read marketplace conversations and translations.</li><li>Control KOKI negotiation automation.</li><li>Search real source-backed property listings.</li><li>Create, analyze and optimize sale drafts.</li><li>Publish supported listings after explicit review.</li></ul>
<p>Production MCP endpoint: <code>/chatgpt/mcp</code></p>`;

const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="${BRAND}"/><path fill="#fff" d="M132 108h72v118l105-118h90L278 240l132 164h-91L230 291l-26 28v85h-72V108z"/></svg>`;

export function installReviewPages(app: express.Express, challengeFile = '/data/openai-apps-challenge') {
  app.get('/', (_req, res) => res.type('html').send(layout('Marketplace Assistant', home)));
  app.get('/privacy', (_req, res) => res.type('html').send(layout('Privacy Policy', privacy)));
  app.get('/terms', (_req, res) => res.type('html').send(layout('Terms of Service', terms)));
  app.get('/support', (_req, res) => res.type('html').send(layout('Support', support)));
  app.get('/logo.svg', (_req, res) => res.type('image/svg+xml').send(logoSvg));
  app.get('/.well-known/openai-apps-challenge', (_req, res) => {
    try {
      const token = fs.readFileSync(challengeFile, 'utf8').trim();
      if (!token) return res.status(404).type('text/plain').send('');
      return res.type('text/plain').send(token);
    } catch {
      return res.status(404).type('text/plain').send('');
    }
  });
}
