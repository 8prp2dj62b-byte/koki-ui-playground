import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { chromium } from 'playwright';

const CLIENT_ID='uV5j90myVPc2XzEOFuWUD2At17OACEGQ';
const REDIRECT_URI='https://login.kleinanzeigen.de/android/com.ebay.kleinanzeigen/callback';
const AUTH='https://login.kleinanzeigen.de';
const BRIDGE='https://aqhdzfsspmuvadnlchvj.supabase.co/functions/v1/koki-command-center-staging-v30/report';
const AUD='koki-kleinanzeigen-bridge';
let sessionId=String(process.env.SESSION_ID||'').trim();
if(!sessionId){try{sessionId=(await fs.readFile('.github/kleinanzeigen-session-id','utf8')).trim()}catch{}}
if(!/^[0-9a-f-]{36}$/i.test(sessionId))throw new Error('bridge_session_missing');
const tunnelUrl=String(process.env.TUNNEL_URL||'');
const tunnelPassword=String(process.env.VNC_PASSWORD||'');

function b64url(buf){return Buffer.from(buf).toString('base64url')}
async function oidc(){
  const base=process.env.ACTIONS_ID_TOKEN_REQUEST_URL,token=process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if(!base||!token)throw new Error('github_oidc_unavailable');
  const u=new URL(base);u.searchParams.set('audience',AUD);
  const r=await fetch(u,{headers:{Authorization:`bearer ${token}`}});if(!r.ok)throw new Error(`github_oidc_${r.status}`);
  const j=await r.json();if(!j.value)throw new Error('github_oidc_missing');return j.value;
}
async function report(stage,payload={}){
  const r=await fetch(BRIDGE,{method:'POST',headers:{Authorization:`Bearer ${await oidc()}`,'Content-Type':'application/json'},body:JSON.stringify({session_id:sessionId,stage,...payload})});
  if(!r.ok)throw new Error(`bridge_report_${stage}_${r.status}`);
}
function directTunnelUrl(){
  const u=new URL(tunnelUrl);
  const frag=new URLSearchParams((u.hash||'').replace(/^#/,''));
  frag.set('autoconnect','true');frag.set('resize','scale');frag.set('password',tunnelPassword);
  u.hash=frag.toString();return u.toString();
}
function callbackFrom(value){try{const u=new URL(value);return u.origin===AUTH&&u.pathname==='/android/com.ebay.kleinanzeigen/callback'?u:null}catch{return null}}

let browser;
try{
  if(!tunnelUrl||tunnelPassword.length<8)throw new Error('runner_endpoint_missing');
  await report('runner_ready',{tunnel_url:directTunnelUrl(),tunnel_password:tunnelPassword});

  const verifier=b64url(crypto.randomBytes(32));
  const challenge=b64url(crypto.createHash('sha256').update(verifier).digest());
  const state=b64url(crypto.randomBytes(16));
  const p=new URLSearchParams({client_id:CLIENT_ID,response_type:'code',redirect_uri:REDIRECT_URI,scope:'openid email profile offline_access',code_challenge:challenge,code_challenge_method:'S256',state,prompt:'login'});

  browser=await chromium.launch({headless:false,executablePath:process.env.CHROME_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--disable-blink-features=AutomationControlled','--window-size=1280,900']});
  const context=await browser.newContext({viewport:{width:1280,height:820},locale:'de-DE'});
  const page=await context.newPage();
  let captured='';
  page.on('request',r=>{const cb=callbackFrom(r.url());if(cb)captured=cb.toString()});
  page.on('framenavigated',f=>{if(f===page.mainFrame()){const cb=callbackFrom(f.url());if(cb)captured=cb.toString()}});
  const nav=await page.goto(`${AUTH}/authorize?${p.toString()}`,{waitUntil:'domcontentloaded',timeout:60000});
  if(nav&&nav.status()>=400)throw new Error(`auth_page_http_${nav.status()}`);
  if(!String(page.url()).startsWith(AUTH))throw new Error('auth_page_unexpected_origin');
  await report('auth_page_ready');

  const deadline=Date.now()+25*60*1000;
  while(Date.now()<deadline&&!captured){
    const cb=callbackFrom(page.url());if(cb){captured=cb.toString();break}
    await page.waitForTimeout(250);
  }
  if(!captured)throw new Error('callback_timeout');
  const callback=new URL(captured);
  if(callback.searchParams.get('state')!==state)throw new Error('oauth_state_mismatch');
  const remoteError=callback.searchParams.get('error');if(remoteError)throw new Error(`oauth_${remoteError}`);
  const code=callback.searchParams.get('code');if(!code)throw new Error('oauth_code_missing');

  const body=new URLSearchParams({grant_type:'authorization_code',client_id:CLIENT_ID,code,code_verifier:verifier,redirect_uri:REDIRECT_URI});
  const tr=await fetch(`${AUTH}/oauth/token`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json','User-Agent':'Kleinanzeigen Android 2026.31.2'},body,signal:AbortSignal.timeout(30000)});
  const tj=await tr.json().catch(()=>({}));
  if(!tr.ok||!tj.refresh_token||!tj.access_token)throw new Error(`token_exchange_${tr.status}`);

  await report('connected',{refresh_token:tj.refresh_token,access_token:tj.access_token,id_token:tj.id_token||'',expires_in:Number(tj.expires_in||600)});
  await page.setContent('<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#0b141d;color:white;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center"><h1>Свързването е готово</h1><p>Можеш да затвориш този прозорец.</p></div></body></html>');
  await new Promise(r=>setTimeout(r,5000));
}catch(e){
  try{await report('failed',{error_code:String(e?.message||e).slice(0,80)})}catch{}
  process.exitCode=1;
}finally{
  if(browser)await browser.close().catch(()=>{});
}
