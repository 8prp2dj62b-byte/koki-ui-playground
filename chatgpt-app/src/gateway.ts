import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import express from 'express';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = finitePort(process.env.PORT, 8787);
const INTERNAL_PORT = finitePort(process.env.MCP_INTERNAL_PORT, 8788);
const PUBLIC_BASE = String(process.env.PUBLIC_BASE_URL || 'https://koki.tonyshodling.eu/chatgpt').replace(/\/+$/, '');
const RESOURCE = `${PUBLIC_BASE}/mcp`;
const KOKI_API = String(process.env.KOKI_API_BASE_URL || '').replace(/\/+$/, '');
const DATA_DIR = String(process.env.KOKI_CHATGPT_DATA_DIR || '/data');
const CLIENT_FILE = path.join(DATA_DIR, 'oauth-clients.json');
const CODE_TTL_MS = 5 * 60_000;
const TOKEN_CACHE_MS = 60_000;

interface OAuthClient {
  client_id: string;
  client_name?: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: string;
  client_id_issued_at: number;
}
interface AuthCode {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  resource: string;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  createdAt: number;
}

const codes = new Map<string, AuthCode>();
const validTokens = new Map<string, number>();

function ensureDataDir() {
  try { fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 }); } catch { /* read-only dev mode */ }
}
function loadClients(): Record<string, OAuthClient> {
  try { return JSON.parse(fs.readFileSync(CLIENT_FILE, 'utf8')); } catch { return {}; }
}
function saveClients(clients: Record<string, OAuthClient>) {
  ensureDataDir();
  const tmp = `${CLIENT_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(clients, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, CLIENT_FILE);
}
function base64url(input: Buffer) { return input.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_'); }
export function pkceChallenge(verifier: string) { return base64url(crypto.createHash('sha256').update(verifier).digest()); }
function tokenKey(token: string) { return crypto.createHash('sha256').update(token).digest('hex'); }
function safeRedirect(uri: string) {
  try { const u = new URL(uri); return ['https:', 'http:'].includes(u.protocol); } catch { return false; }
}
function pruneCodes() {
  const now = Date.now();
  for (const [key, value] of codes) if (now - value.createdAt > CODE_TTL_MS) codes.delete(key);
}

async function kokiAuth(pathname: string, body: unknown) {
  if (!KOKI_API) throw new Error('KOKI_API_NOT_CONFIGURED');
  const r = await fetch(`${KOKI_API}/functions/v1/koki-command-center-staging-fe${pathname}`, {
    method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(15_000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j?.access_token) throw new Error(String(j?.error || `KOKI_AUTH_${r.status}`));
  return j as { access_token: string; refresh_token: string; expires_in: number; profile?: unknown };
}

async function validateBearer(value: string) {
  const token = String(value || '').replace(/^Bearer\s+/i, '').trim();
  if (!token || !KOKI_API) return false;
  const key = tokenKey(token), cached = validTokens.get(key);
  if (cached && cached > Date.now()) return true;
  try {
    const r = await fetch(`${KOKI_API}/functions/v1/koki-command-center-staging-fe?format=summary`, {
      headers: { authorization: `Bearer ${token}`, accept: 'application/json' }, signal: AbortSignal.timeout(12_000),
    });
    if (!r.ok) return false;
    validTokens.set(key, Date.now() + TOKEN_CACHE_MS);
    return true;
  } catch { return false; }
}

function unauthorized(res: express.Response) {
  const meta = `${PUBLIC_BASE}/.well-known/oauth-protected-resource`;
  res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${meta}"`);
  return res.status(401).json({ error: 'unauthorized', resource_metadata: meta });
}

function proxyMcp(req: express.Request, res: express.Response) {
  const headers = { ...req.headers, host: `127.0.0.1:${INTERNAL_PORT}` } as http.OutgoingHttpHeaders;
  delete headers['content-length'];
  const upstream = http.request({ hostname: '127.0.0.1', port: INTERNAL_PORT, path: '/mcp', method: req.method, headers }, (r) => {
    res.statusCode = r.statusCode || 502;
    for (const [k, v] of Object.entries(r.headers)) if (v !== undefined) res.setHeader(k, v as any);
    r.pipe(res);
  });
  upstream.on('error', () => { if (!res.headersSent) res.status(502).json({ error: 'mcp_upstream_unavailable' }); else res.end(); });
  req.pipe(upstream);
}

function htmlEsc(s: unknown) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c] || c)); }
function loginPage(params: Record<string,string>, error = '') {
  const hidden = Object.entries(params).map(([k,v]) => `<input type="hidden" name="${htmlEsc(k)}" value="${htmlEsc(v)}">`).join('');
  return `<!doctype html><html lang="bg"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>Свържи KOKI с ChatGPT</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0;background:#eef1f5;color:#141820}.w{max-width:420px;margin:10vh auto;padding:16px}.c{background:#fff;border:1px solid #dee3e9;border-radius:14px;padding:22px}.logo{width:40px;height:40px;border-radius:10px;background:#335cff;color:#fff;display:grid;place-items:center;font-weight:800}h1{font-size:20px;margin:14px 0 5px}p{font-size:12px;color:#707a86;line-height:1.5}.f{display:grid;gap:6px;margin-top:12px}label{font-size:11px;font-weight:700}input{height:44px;border:1px solid #c5ccd5;border-radius:7px;padding:0 11px;font-size:15px}button{height:44px;border:0;border-radius:7px;background:#335cff;color:#fff;font-weight:750;margin-top:14px;width:100%}.e{font-size:11px;color:#b83c49;margin-top:10px}.n{font-size:10px;color:#707a86;margin-top:12px}</style></head><body><main class="w"><section class="c"><div class="logo">K</div><h1>Свържи KOKI с ChatGPT</h1><p>Влез в своя KOKI профил. Данните за вход се изпращат директно към KOKI и не се предоставят на ChatGPT.</p>${error?`<div class="e">${htmlEsc(error)}</div>`:''}<form method="post" action="${PUBLIC_BASE}/oauth/authorize">${hidden}<div class="f"><label>E-mail</label><input name="email" type="email" autocomplete="username" required></div><div class="f"><label>Парола</label><input name="password" type="password" autocomplete="current-password" required></div><button type="submit">Свържи KOKI</button></form><div class="n">Достъпът може да бъде прекратен от KOKI профила или от настройките на ChatGPT.</div></section></main></body></html>`;
}

const app = express();
app.disable('x-powered-by');
app.use('/oauth', express.urlencoded({ extended: false, limit: '32kb' }));
app.use('/oauth/register', express.json({ limit: '32kb' }));

app.get('/.well-known/oauth-protected-resource', (_req, res) => res.json({
  resource: RESOURCE,
  authorization_servers: [PUBLIC_BASE],
  bearer_methods_supported: ['header'],
  scopes_supported: ['koki'],
  resource_documentation: `${PUBLIC_BASE}/health`,
}));
app.get('/.well-known/oauth-protected-resource/mcp', (_req, res) => res.json({ resource: RESOURCE, authorization_servers: [PUBLIC_BASE], bearer_methods_supported: ['header'], scopes_supported: ['koki'] }));
app.get('/.well-known/oauth-authorization-server', (_req, res) => res.json({
  issuer: PUBLIC_BASE,
  authorization_endpoint: `${PUBLIC_BASE}/oauth/authorize`,
  token_endpoint: `${PUBLIC_BASE}/oauth/token`,
  registration_endpoint: `${PUBLIC_BASE}/oauth/register`,
  response_types_supported: ['code'],
  grant_types_supported: ['authorization_code', 'refresh_token'],
  token_endpoint_auth_methods_supported: ['none'],
  code_challenge_methods_supported: ['S256'],
  scopes_supported: ['koki'],
}));

app.post('/oauth/register', (req, res) => {
  const redirects = Array.isArray(req.body?.redirect_uris) ? req.body.redirect_uris.map(String).filter(safeRedirect) : [];
  if (!redirects.length) return res.status(400).json({ error: 'invalid_redirect_uris' });
  const id = `koki_${crypto.randomBytes(18).toString('hex')}`;
  const client: OAuthClient = { client_id:id, client_name:String(req.body?.client_name||'ChatGPT'), redirect_uris:redirects, grant_types:['authorization_code','refresh_token'], response_types:['code'], token_endpoint_auth_method:'none', client_id_issued_at:Math.floor(Date.now()/1000) };
  const clients=loadClients(); clients[id]=client; saveClients(clients); return res.status(201).json(client);
});

function authorizeParams(input: any) {
  return {
    client_id:String(input.client_id||''), redirect_uri:String(input.redirect_uri||''), response_type:String(input.response_type||''),
    scope:String(input.scope||'koki'), state:String(input.state||''), code_challenge:String(input.code_challenge||''),
    code_challenge_method:String(input.code_challenge_method||''), resource:String(input.resource||RESOURCE),
  };
}
function validateAuthorize(p: ReturnType<typeof authorizeParams>) {
  const client=loadClients()[p.client_id];
  if(!client) return 'Невалиден OAuth клиент.';
  if(!client.redirect_uris.includes(p.redirect_uri)) return 'Невалиден redirect URI.';
  if(p.response_type!=='code') return 'Поддържа се само authorization code.';
  if(p.code_challenge_method!=='S256'||!p.code_challenge) return 'PKCE S256 е задължителен.';
  if(p.resource!==RESOURCE) return 'Невалиден MCP resource.';
  return '';
}
app.get('/oauth/authorize', (req,res) => {
  const p=authorizeParams(req.query), err=validateAuthorize(p);
  if(err) return res.status(400).send(loginPage(p,err));
  res.setHeader('cache-control','no-store'); return res.send(loginPage(p));
});
app.post('/oauth/authorize', async (req,res) => {
  const p=authorizeParams(req.body), err=validateAuthorize(p);
  if(err) return res.status(400).send(loginPage(p,err));
  try {
    const s=await kokiAuth('/auth/login',{email:String(req.body.email||''),password:String(req.body.password||'')});
    pruneCodes(); const code=base64url(crypto.randomBytes(32));
    codes.set(code,{clientId:p.client_id,redirectUri:p.redirect_uri,codeChallenge:p.code_challenge,resource:p.resource,accessToken:s.access_token,refreshToken:s.refresh_token,expiresIn:Number(s.expires_in||3600),createdAt:Date.now()});
    const u=new URL(p.redirect_uri);u.searchParams.set('code',code);if(p.state)u.searchParams.set('state',p.state);return res.redirect(302,u.toString());
  } catch { return res.status(401).send(loginPage(p,'Невалиден e-mail или парола.')); }
});

app.post('/oauth/token', async (req,res) => {
  res.setHeader('cache-control','no-store');
  const grant=String(req.body?.grant_type||'');
  if(grant==='authorization_code'){
    pruneCodes(); const code=String(req.body.code||''), item=codes.get(code); codes.delete(code);
    if(!item) return res.status(400).json({error:'invalid_grant'});
    if(String(req.body.client_id||'')!==item.clientId||String(req.body.redirect_uri||'')!==item.redirectUri) return res.status(400).json({error:'invalid_grant'});
    if(pkceChallenge(String(req.body.code_verifier||''))!==item.codeChallenge) return res.status(400).json({error:'invalid_grant'});
    return res.json({access_token:item.accessToken,token_type:'Bearer',expires_in:item.expiresIn,refresh_token:item.refreshToken,scope:'koki',resource:item.resource});
  }
  if(grant==='refresh_token'){
    try { const s=await kokiAuth('/auth/refresh',{refresh_token:String(req.body.refresh_token||'')}); return res.json({access_token:s.access_token,token_type:'Bearer',expires_in:Number(s.expires_in||3600),refresh_token:s.refresh_token,scope:'koki',resource:RESOURCE}); }
    catch { return res.status(400).json({error:'invalid_grant'}); }
  }
  return res.status(400).json({error:'unsupported_grant_type'});
});

app.all('/mcp', async (req,res) => {
  if(!await validateBearer(String(req.headers.authorization||''))) return unauthorized(res);
  return proxyMcp(req,res);
});
app.get('/health', async (_req,res) => {
  let internal=false, backend=false;
  try { internal=(await fetch(`http://127.0.0.1:${INTERNAL_PORT}/health`,{signal:AbortSignal.timeout(3000)})).ok; } catch {}
  try { backend=(await fetch(`${KOKI_API}/functions/v1/koki-property-search-v1?health=1`,{signal:AbortSignal.timeout(5000)})).ok; } catch {}
  res.status(internal&&backend?200:503).json({ok:internal&&backend,service:'koki-chatgpt-gateway',oauth:'pkce-s256',mcp:internal,koki_backend:backend,resource:RESOURCE});
});

const child = spawn(process.execPath,[path.resolve(__dirname,'server.js')],{env:{...process.env,PORT:String(INTERNAL_PORT)},stdio:'inherit'});
child.on('exit',(code,signal)=>{console.error(`KOKI MCP internal exited code=${code} signal=${signal}`);process.exit(code??1);});
process.on('SIGTERM',()=>{child.kill('SIGTERM');process.exit(0)});
process.on('SIGINT',()=>{child.kill('SIGINT');process.exit(0)});

app.listen(PORT,()=>console.log(`KOKI OAuth/MCP gateway listening on :${PORT}; public resource ${RESOURCE}`));

function finitePort(value:string|undefined,fallback:number){const n=Number(value||fallback);return Number.isFinite(n)&&n>0&&n<65536?n:fallback;}
