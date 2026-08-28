import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import http from 'node:http';
import { chromium } from 'playwright';

const CLIENT_ID='uV5j90myVPc2XzEOFuWUD2At17OACEGQ';
const REDIRECT_URI='https://login.kleinanzeigen.de/android/com.ebay.kleinanzeigen/callback';
const AUTH='https://login.kleinanzeigen.de';
const BRIDGE='https://aqhdzfsspmuvadnlchvj.supabase.co/functions/v1/koki-command-center-staging-v30/report';
const AUD='koki-kleinanzeigen-bridge';
const KOKI_ORIGIN='https://koki.tonyshodling.eu';
const CONTROL_PORT=Number(process.env.CONTROL_PORT||6090);
const CONTROL_TOKEN=String(process.env.CONTROL_TOKEN||'');
const AUTH0_PRIMARY="button[type='submit'][data-action-button-primary='true']:not([disabled]):not([aria-disabled='true'])";
const AUTH0_CAPTCHA="[data-captcha-provider],.recaptcha,.hcaptcha,.captcha-challenge,[class*='auth0-v2'],[class*='auth0_v2'],.friendly-captcha,.frc-captcha,.arkose,.cf-turnstile,.g-recaptcha,iframe[src*='google.com/recaptcha'],iframe[src*='recaptcha.net'],iframe[src*='hcaptcha.com'],iframe[src*='challenges.cloudflare.com'],iframe[src*='arkoselabs.com'],iframe[src*='funcaptcha.com']";
let sessionId=String(process.env.SESSION_ID||'').trim();
if(!sessionId){try{sessionId=(await fs.readFile('.github/kleinanzeigen-session-id','utf8')).trim()}catch{}}
if(!/^[0-9a-f-]{36}$/i.test(sessionId))throw new Error('bridge_session_missing');
if(CONTROL_TOKEN.length<16)throw new Error('control_token_missing');

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
function callbackFrom(value){try{const u=new URL(value);return u.origin===AUTH&&u.pathname==='/android/com.ebay.kleinanzeigen/callback'?u:null}catch{return null}}
function send(res,status,body){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':KOKI_ORIGIN,'Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type,X-Control-Token','Vary':'Origin'});res.end(JSON.stringify(body))}
async function readJson(req){return await new Promise((resolve,reject)=>{let b='';req.on('data',c=>{b+=c;if(b.length>20000)reject(new Error('body_too_large'))});req.on('end',()=>{try{resolve(JSON.parse(b||'{}'))}catch(e){reject(e)}});req.on('error',reject)})}

let browser,page,captured='',connected=false,lastError='',lastHttp=null,configured=false;
const verifier=b64url(crypto.randomBytes(32));
const challenge=b64url(crypto.createHash('sha256').update(verifier).digest());
const state=b64url(crypto.randomBytes(16));
const params=new URLSearchParams({client_id:CLIENT_ID,response_type:'code',redirect_uri:REDIRECT_URI,scope:'openid email profile offline_access',code_challenge:challenge,code_challenge_method:'S256',state,prompt:'login'});

async function snapshot(){
  if(connected)return {ok:true,status:'connected',title:'Свързано',text:'Kleinanzeigen профилът е свързан.',inputs:[],buttons:[]};
  if(!page)return {ok:true,status:'starting',title:'Подготвям Kleinanzeigen',text:'Browser сесията се стартира.',inputs:[],buttons:[]};
  const data=await page.evaluate(()=>{
    const labelFor=(el)=>{
      const id=el.id||'';
      const explicit=id?document.querySelector(`label[for="${CSS.escape(id)}"]`):null;
      const wrapped=el.closest('label');
      return (explicit?.innerText||wrapped?.innerText||el.getAttribute('aria-label')||el.getAttribute('placeholder')||el.name||'Поле').trim().slice(0,100);
    };
    const inputs=[...document.querySelectorAll('input')].filter(el=>{
      const t=(el.type||'text').toLowerCase();
      const r=el.getBoundingClientRect();
      return !el.disabled&&!el.readOnly&&r.width>0&&r.height>0&&['text','email','password','tel','number'].includes(t);
    }).slice(0,4).map((el,i)=>({key:el.name||el.id||`field_${i}`,type:(el.type||'text').toLowerCase(),label:labelFor(el),autocomplete:el.autocomplete||'',value:el.type==='password'?'':el.value||''}));
    const buttons=[...document.querySelectorAll("button[type='submit'][data-action-button-primary='true'],button,input[type='submit']")].filter(el=>{const r=el.getBoundingClientRect();return !el.disabled&&r.width>0&&r.height>0}).slice(0,4).map((el,i)=>({key:el.id||el.name||`button_${i}`,text:(el.innerText||el.value||'Продължи').trim().slice(0,100),type:'submit'}));
    return {title:(document.title||'Kleinanzeigen').trim(),text:(document.body?.innerText||'').replace(/\s+/g,' ').trim().slice(0,600),inputs,buttons};
  }).catch(()=>({title:'Kleinanzeigen',text:'',inputs:[],buttons:[]}));
  return {ok:true,status:lastError?'blocked':'ready',url:new URL(page.url()).pathname,title:data.title,text:data.text,inputs:data.inputs,buttons:data.buttons,last_http:lastHttp,error:lastError||null};
}

async function hasCaptcha(){
  try{return await page.locator(AUTH0_CAPTCHA).count()>0}catch{return false}
}
async function captchaTokenReady(){
  try{return await page.evaluate(()=>String(document.querySelector("input[name='captcha']")?.value||'').length>0)}catch{return false}
}
async function waitCaptchaToken(ms=7000){
  const deadline=Date.now()+ms;
  while(Date.now()<deadline){if(await captchaTokenReady())return true;await page.waitForTimeout(250)}
  return false;
}
async function clickAuth0Primary(){
  const b=page.locator(AUTH0_PRIMARY).first();
  if(!(await b.count()))throw new Error('auth0_primary_submit_missing');
  await b.click({noWaitAfter:true,timeout:3500});
}
async function settle(before,ms=5000){
  const deadline=Date.now()+ms;
  while(Date.now()<deadline){
    if(captured||page.url()!==before||lastHttp===403)break;
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(350);
}

async function act(body){
  if(!page)throw new Error('browser_not_ready');
  if(connected)return snapshot();
  const fields=body&&typeof body.fields==='object'?body.fields:{};
  const visible=await page.locator('input').evaluateAll(els=>els.map((el,i)=>({i,key:el.name||el.id||`field_${i}`,type:(el.type||'text').toLowerCase(),visible:!!(el.offsetWidth||el.offsetHeight||el.getClientRects().length)})).filter(x=>x.visible&&['text','email','password','tel','number'].includes(x.type)));
  for(const item of visible){
    if(!Object.prototype.hasOwnProperty.call(fields,item.key))continue;
    const value=String(fields[item.key]??'');
    const loc=page.locator('input').nth(item.i);
    await loc.click();
    await page.keyboard.press('Control+A').catch(()=>{});
    await page.keyboard.type(value,{delay:item.type==='password'?55:35});
  }
  lastError='';lastHttp=null;
  const before=page.url();
  const isPassword=before.includes('/u/login/password');

  if(isPassword&&await hasCaptcha()){
    const ready=await waitCaptchaToken(7000);
    if(!ready){lastError='Kleinanzeigen security challenge изисква потвърждение';return snapshot()}
  }

  await clickAuth0Primary();
  await settle(before,isPassword?5000:1800);

  if(!isPassword&&page.url().includes('/u/login/identifier')){
    await page.waitForTimeout(800);
    if(await hasCaptcha()){
      const ready=await waitCaptchaToken(7000);
      if(!ready){lastError='Kleinanzeigen security challenge изисква потвърждение';return snapshot()}
      const again=page.url();
      await clickAuth0Primary();
      await settle(again,5000);
    }
  }
  return snapshot();
}

const server=http.createServer(async(req,res)=>{
  try{
    const u=new URL(req.url||'/',`http://127.0.0.1:${CONTROL_PORT}`);
    if(req.method==='OPTIONS')return send(res,204,{});
    const authorized=req.headers['x-control-token']===CONTROL_TOKEN||u.searchParams.get('k')===CONTROL_TOKEN;
    if(!authorized)return send(res,403,{ok:false,error:'forbidden'});
    if(req.method==='GET'&&u.pathname==='/health')return send(res,200,{ok:true});
    if(req.method==='GET'&&u.pathname==='/state')return send(res,200,await snapshot());
    if(req.method==='POST'&&u.pathname==='/action')return send(res,200,await act(await readJson(req)));
    if(req.method==='POST'&&u.pathname==='/configure'){
      const b=await readJson(req),url=String(b.tunnel_url||'');
      if(!/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/i.test(url))return send(res,400,{ok:false,error:'invalid_tunnel'});
      if(!configured){configured=true;const publicUrl=`${url}/?k=${encodeURIComponent(CONTROL_TOKEN)}`;await report('runner_ready',{tunnel_url:publicUrl,tunnel_password:CONTROL_TOKEN});if(page)await report('auth_page_ready')}
      return send(res,200,{ok:true});
    }
    return send(res,404,{ok:false,error:'not_found'});
  }catch(e){return send(res,500,{ok:false,error:String(e?.message||e).slice(0,120)})}
});
server.listen(CONTROL_PORT,'127.0.0.1');

try{
  browser=await chromium.launch({headless:false,executablePath:process.env.CHROME_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--disable-blink-features=AutomationControlled','--window-size=1280,900']});
  const context=await browser.newContext({viewport:{width:1280,height:820},locale:'de-DE'});
  page=await context.newPage();
  page.on('request',r=>{const cb=callbackFrom(r.url());if(cb)captured=cb.toString()});
  page.on('framenavigated',f=>{if(f===page.mainFrame()){const cb=callbackFrom(f.url());if(cb)captured=cb.toString()}});
  page.on('response',r=>{try{if(r.request().isNavigationRequest()&&r.url().includes('login.kleinanzeigen.de')){lastHttp=r.status();if(r.status()===403)lastError='HTTP 403 от Kleinanzeigen'}}catch{}});
  const nav=await page.goto(`${AUTH}/authorize?${params.toString()}`,{waitUntil:'domcontentloaded',timeout:60000});
  if(nav&&nav.status()>=400)throw new Error(`auth_page_http_${nav.status()}`);
  if(!String(page.url()).startsWith(AUTH))throw new Error('auth_page_unexpected_origin');

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
  connected=true;
  await report('connected',{refresh_token:tj.refresh_token,access_token:tj.access_token,id_token:tj.id_token||'',expires_in:Number(tj.expires_in||600)});
  await new Promise(r=>setTimeout(r,5000));
}catch(e){
  lastError=String(e?.message||e).slice(0,120);
  try{await report('failed',{error_code:lastError.slice(0,80)})}catch{}
  process.exitCode=1;
}finally{
  server.close();
  if(browser)await browser.close().catch(()=>{});
}
