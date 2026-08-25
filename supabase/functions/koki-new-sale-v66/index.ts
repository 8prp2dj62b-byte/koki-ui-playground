import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {stable,isCatalogicDescription,marketingQuality,buildOfficialPayload,reviewVisibility,normalizeMarketForReview} from "./core.js";
declare const EdgeRuntime:any;

const SU=Deno.env.get('SUPABASE_URL'), SK=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const V28=`${SU}/functions/v1/koki-command-center-staging-v28`, MARKET=`${SU}/functions/v1/koki-command-center-staging-v49`, AI=`${SU}/functions/v1/koki-ai-turn-test-agent-staging-v3`;
const ENGINE='KOKI_NEW_SALE_V66', CONTRACT='KOKI_NEW_SALE_V66', REVIEW='KOKI_NEW_SALE_REVIEW_V1';
const iso=()=>new Date().toISOString(), clean=v=>String(v??'').replace(/\s+/g,' ').trim();
const H=req=>({'Cache-Control':'no-store','Content-Type':'application/json','Access-Control-Allow-Origin':req?.headers.get('origin')||'https://koki.tonyshodling.eu','Access-Control-Allow-Headers':'authorization,content-type,apikey,x-koki-worker','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Vary':'Origin','X-KOKI-New-Sale-Contract':CONTRACT});
const J=(x,s=200,req)=>Response.json(x,{status:s,headers:H(req)});

async function db(path,init={}){const h=new Headers(init.headers);h.set('apikey',SK);h.set('Authorization',`Bearer ${SK}`);if(init.body&&!h.has('Content-Type'))h.set('Content-Type','application/json');const r=await fetch(`${SU}/rest/v1/${path}`,{...init,headers:h,signal:init.signal??AbortSignal.timeout(30000)}),t=await r.text();if(!r.ok)throw Error(`db_${r.status}:${t.slice(0,500)}`);return t?JSON.parse(t):null}
const rpc=(n,b)=>db(`rpc/${n}`,{method:'POST',body:JSON.stringify(b)});
async function wk(){return(await db('koki_worker_config?id=eq.worker_key&select=value&limit=1'))?.[0]?.value||''}
async function workerOK(req){const key=await wk();return!!key&&req.headers.get('x-koki-worker')===key}
const loadDraft=async id=>(await db(`koki_listing_drafts_v3?id=eq.${encodeURIComponent(id)}&select=*&limit=1`))?.[0]||null;
const patchDraft=(id,p)=>db(`koki_listing_drafts_v3?id=eq.${id}`,{method:'PATCH',body:JSON.stringify({...p,updated_at:iso()})});
const patchOp=(id,p)=>db(`koki_new_sale_operations_v1?id=eq.${id}`,{method:'PATCH',body:JSON.stringify({...p,updated_at:iso()})});
async function sha(v){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(typeof v==='string'?v:stable(v)));return[...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('')}
function confirmed(s){const o={};for(const[k,v]of Object.entries(s||{}))if(v?.status==='CONFIRMED'&&v?.value!=null)o[k]=v.value;return o}

async function proxy(req,body){
  const h=new Headers(); h.set('Content-Type','application/json');
  for(const name of ['authorization','apikey','x-koki-worker']){const v=req.headers.get(name);if(v)h.set(name,v)}
  const r=await fetch(V28,{method:'POST',headers:h,body:JSON.stringify(body),signal:AbortSignal.timeout(175000)}),txt=await r.text(); let data=null;try{data=txt?JSON.parse(txt):null}catch{}
  return {status:r.status,ok:r.ok,data,raw:txt};
}

const MARKETING=`You are KOKI MASTER LISTING V66. Rewrite the public OLX listing in natural, concise Bulgarian sales language using ONLY confirmed facts and the existing validated listing. Do not invent condition details, functionality, warranty, ownership history, repairs, accessories, authenticity, urgency, scarcity, quality claims or reliability claims. Never say the item is ready for use unless explicitly confirmed. Never use a catalog-like section titled "Основни характеристики" and do not dump facts as a bullet list. Write 2-3 short natural paragraphs that sound like a real private seller, informative but not exaggerated. Keep useful confirmed specifics such as exact model, storage and battery health when present. No phone/e-mail. title <=150 chars. Return strict JSON only: {title:string,description:string}.`;
function deterministicMarketing(d){
  const f=confirmed(d.fact_snapshot),brand=clean(f.brand||''),model=clean(f.model||d.product_context?.product_identity?.canonical_name||d.user_edits?.product_description||'продукта'),storage=clean(f.storage_capacity||f.internal_memory||''),bh=clean(f.battery_health||''),state=clean(f.state||f.condition||'used');
  const name=clean([brand,model].filter(Boolean).join(' '))||clean(d.listing_content?.title)||'Продукт';
  const details=[]; if(storage)details.push(`${storage}${/^\d+$/.test(storage)?'GB':''} памет`); if(bh)details.push(`Battery Health ${String(bh).replace(/%$/,'')}%`);
  const first=`Продавам ${state==='used'?'използван ':''}${name}${details.length?` с ${details.join(' и ')}`:''}.`;
  const second='Обявата е за конкретния артикул от снимките. Посочени са само потвърдените данни, без предположения за състояние, история или комплектовка.';
  const third='При интерес можеш да пишеш за допълнителни въпроси преди сделката.';
  return {title:clean(d.listing_content?.title||name).slice(0,150),description:`${first}\n\n${second}\n\n${third}`,source:'DETERMINISTIC_TRUTHFUL_FALLBACK_V66'};
}
async function improveMarketing(d){
  if(d.listing_content?.source==='MASTER_LISTING_V66'&&marketingQuality(d.listing_content?.description||'').valid)return d;
  const key=await wk(),input={confirmed_facts:confirmed(d.fact_snapshot),validated_category:d.category,current_listing:{title:d.listing_content?.title,description:d.listing_content?.description},media_count:(d.media||[]).length}; let chosen=null,last='';
  for(let i=0;i<2;i++){
    try{
      const r=await fetch(AI,{method:'POST',headers:{'Content-Type':'application/json','x-koki-worker':key},body:JSON.stringify({domain:'NEW_LISTING',stage:'MASTER_LISTING_V66',subject_id:d.id,system:i?MARKETING+' Previous draft failed the structural or truthfulness quality gate; make it natural prose and remove unsupported promotional claims.':MARKETING,input,media:[],temp:.08,cache_ttl_seconds:120,allow_emergency_groq:false}),signal:AbortSignal.timeout(80000)}),j=await r.json().catch(()=>({}));
      if(r.ok&&j.ok&&j.data?.title&&j.data?.description){const q=marketingQuality(j.data.description);if(q.valid){chosen={title:clean(j.data.title).slice(0,150),description:String(j.data.description).trim(),source:'MASTER_LISTING_V66',provider:j.provider||j.source||null,model:j.model||null};break}last=q.reasons.join(',')}
      else last=String(j.error||j.error_class||`AI_${r.status}`);
    }catch(e){last=String(e?.message||e)}
  }
  if(!chosen)chosen={...deterministicMarketing(d),warning:`AI_REWRITE_FALLBACK:${last.slice(0,120)}`};
  const q=marketingQuality(chosen.description); if(!q.valid)throw Error(`V66_MARKETING_QUALITY_FAILED:${q.reasons.join(',')}`);
  const content={...(d.listing_content||{}),title:chosen.title,description:chosen.description,source:chosen.source,quality_valid:true,quality_guard:{valid:true,reasons:[],version:'V66_NATURAL_COPY_TRUTHFUL'},v66_provider:chosen.provider||null,v66_model:chosen.model||null,v66_warning:chosen.warning||null};
  await patchDraft(d.id,{listing_content:content,listing_authority:'MASTER_LISTING',listing_content_version:Number(d.listing_content_version||0)+1,draft_version:Number(d.draft_version||0)+1});
  return await loadDraft(d.id);
}
async function runMarket(id){const key=await wk(),r=await fetch(MARKET,{method:'POST',headers:{'Content-Type':'application/json','x-koki-worker':key},body:JSON.stringify({action:'research',draft_id:id}),signal:AbortSignal.timeout(150000)}),j=await r.json().catch(()=>({}));if(!r.ok||!j.ok)throw Error(j.error||`MARKET_${r.status}`);return j}
function markerOf(d){return d?.user_edits?.v66_review_finalization||{}}
function reviewMarket(d){return d?.review_payload?.market_comparison||null}
function markerMatches(d){const m=markerOf(d),rm=reviewMarket(d);return m.state==='DONE'&&Number(m.review_version)===Number(d.review_version)&&['READY','INSUFFICIENT'].includes(String(rm?.state||''))}
async function mark(d,state,extra={}){await patchDraft(d.id,{user_edits:{...(d.user_edits||{}),v66_review_finalization:{state,engine:ENGINE,at:iso(),...extra}}})}
async function finalizeReview(id){
  let d=await loadDraft(id); if(!d)return; const startReview=Number(d.review_version||0); await mark(d,'RUNNING',{source_review_version:startReview});
  try{
    d=await improveMarketing(d);
    await rpc('koki_enrich_listing_location_v1',{p_draft_id:d.id});
    const marketResult=await runMarket(d.id);
    d=await loadDraft(d.id);
    const ctx=await rpc('koki_enrich_listing_location_v1',{p_draft_id:d.id});
    d=await loadDraft(d.id); const publishCtx=(ctx&&ctx.location)?ctx:d.publish_context;
    const payload=buildOfficialPayload(d,publishCtx),ph=await sha(payload),rv=Number(d.review_version||0)+1,market=normalizeMarketForReview(marketResult?.market_comparison||{}),researchSubstate=market.state==='READY'?'COMPLETED_OK':'COMPLETED_INSUFFICIENT';
    const prior=d.review_payload||{},review={...prior,contract:REVIEW,draft_id:d.id,review_version:rv,payload_preview_hash:ph,listing:{...(d.listing_content||{}),authority:d.listing_authority,content_version:Number(d.listing_content_version||0)},publish_context:publishCtx,market_comparison:market,workflow_state:'REVIEW_READY',readiness:{...(prior.readiness||{}),state:'REVIEW_READY'}};
    const edits={...(d.user_edits||{}),research_authority:'KOKI_MARKET_RESEARCH_V66',v66_review_finalization:{state:'DONE',engine:ENGINE,at:iso(),source_review_version:startReview,review_version:rv,market_state:researchSubstate,marketing_source:d.listing_content?.source||null,market_snapshot_state:market.state}};
    await patchDraft(d.id,{publish_context:publishCtx,review_version:rv,review_payload:review,payload_preview_hash:ph,workflow_state:'REVIEW_READY',workflow_error:{},research_state:'COMPLETED',research_substate:researchSubstate,market_comparison:market,user_edits:edits});
    const opId=review.operation_id||prior.operation_id; if(opId)await patchOp(opId,{review_version:rv,payload_preview_hash:ph,workflow_state:'REVIEW_READY',progress_label_bg:'Обявата е готова за преглед.',error:{},failed_stage:null});
  }catch(e){
    d=await loadDraft(id); const msg=String(e?.message||e); if(d)await patchDraft(id,{workflow_error:{code:'V66_FINALIZATION_FAILED',message:msg.slice(0,300),retryable:true},user_edits:{...(d.user_edits||{}),v66_review_finalization:{state:'FAILED_RETRYABLE',engine:ENGINE,at:iso(),source_review_version:startReview,error:msg.slice(0,220)}}});
  }
}
function startFinalizeIfNeeded(d){
  const m=markerOf(d); const stale=m.state==='RUNNING'&&Date.now()-Date.parse(m.at||0)>180000;
  if(markerMatches(d)|| (m.state==='RUNNING'&&!stale))return false;
  const p=finalizeReview(d.id); try{EdgeRuntime?.waitUntil?.(p)}catch{} return true;
}
async function maskUntilFinal(j){
  const id=j?.draft_id||j?.draft?.id; if(!id)return j; const d=await loadDraft(id); if(!d||String(j.workflow_state||j?.operation?.workflow_state||d.workflow_state)!=='REVIEW_READY')return j;
  const state=markerMatches(d)?'REVIEW_READY':reviewVisibility(markerOf(d).state,d.research_substate); if(state==='REVIEW_READY'){
    const fresh=await loadDraft(id),market=reviewMarket(fresh)||normalizeMarketForReview(fresh.market_comparison||{}),researchState=market.state==='READY'?'COMPLETED_OK':'COMPLETED_INSUFFICIENT'; return {...j,workflow_state:'REVIEW_READY',progress_label_bg:'Обявата е готова за преглед.',review:{...(fresh.review_payload||{}),market_comparison:market},draft:j.draft?{...j.draft,review_payload:{...(fresh.review_payload||{}),market_comparison:market},payload_preview_hash:fresh.payload_preview_hash,review_version:fresh.review_version,research_substate:researchState,market_comparison:market}:j.draft,research:{state:researchState,market_comparison:market}};
  }
  if(state==='FAILED_RETRYABLE')return {...j,workflow_state:'FAILED_RETRYABLE',review:null,progress_label_bg:'Не успях да финализирам анализа. Опитай отново.',error:d.workflow_error||{code:'V66_FINALIZATION_FAILED',retryable:true}};
  startFinalizeIfNeeded(d); return {...j,workflow_state:'GENERATING_LISTING',review:null,progress_label_bg:'Сравнявам пазара и финализирам обявата…',research:{state:'RUNNING',market_comparison:{}}};
}
function coreUnit(){
  const dry='Основни характеристики:\n- Марка: Apple\n- Модел: iPhone\n- Памет: 512GB';
  const natural='Продавам използван iPhone 16 Pro с 512GB памет. Обявата е за конкретния телефон от снимките. При интерес можеш да пишеш за допълнителни въпроси преди сделката.';
  const unsafe='Телефонът е готов за употреба и е надеждно устройство с доказаното качество на Apple.';
  const p=buildOfficialPayload({id:'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',listing_content:{title:'T',description:'D',attributes:{}},category:{id:454},media:[],owner_desired_price_eur:500},{advertiser_type:'private',contact:{name:'Koki'},location:{city_id:8771,district_id:1393}});
  const terminalReview={review_version:4,review_payload:{market_comparison:{state:'INSUFFICIENT'}},user_edits:{v66_review_finalization:{state:'DONE',review_version:4}}};
  const tests={catalog_rejected:isCatalogicDescription(dry)&&!marketingQuality(dry).valid,natural_passes:marketingQuality(natural).valid,unsupported_promo_rejected:!marketingQuality(unsafe).valid,district_in_payload:p.location.district_id===1393,review_snapshot_fences_legacy_running:markerMatches(terminalReview)};
  return {tests,passed:Object.values(tests).filter(Boolean).length,total:Object.keys(tests).length};
}
Deno.serve(async req=>{
  try{
    if(req.method==='OPTIONS')return new Response(null,{status:204,headers:H(req)}); const b=await req.json().catch(()=>({})),action=String(b.action||'');
    if(action==='qa'||action==='qa_unit'){
      if(!await workerOK(req))return J({ok:false,error:'forbidden'},403,req); const u=coreUnit(); return J({ok:u.passed===u.total,engine:ENGINE,contract:CONTRACT,upstream:'koki-command-center-staging-v28',market_engine:'koki-command-center-staging-v49',unit:u},200,req);
    }
    if(action==='qa_finalize'){
      if(!await workerOK(req))return J({ok:false,error:'forbidden'},403,req); const d=await loadDraft(String(b.draft_id||'')); if(!d)return J({ok:false,error:'draft_not_found'},404,req); await finalizeReview(d.id); const f=await loadDraft(d.id),market=reviewMarket(f)||normalizeMarketForReview(f.market_comparison||{}); return J({ok:markerMatches(f),draft_id:f.id,review_version:f.review_version,payload_preview_hash:f.payload_preview_hash,research_substate:market.state==='READY'?'COMPLETED_OK':'COMPLETED_INSUFFICIENT',market_comparison:market,listing_content:f.listing_content,publish_context:f.publish_context,marker:markerOf(f),external_write:false},200,req);
    }
    if(action==='publish'){
      const vr=await proxy(req,{action:'get',draft_id:b.draft_id}); if(!vr.ok)return J(vr.data||{ok:false,error:{code:'AUTHENTICATION_REQUIRED'}},vr.status,req); const d=await loadDraft(String(b.draft_id||'')); if(!d||!markerMatches(d))return J({ok:false,error:{code:'REVIEW_FINALIZATION_REQUIRED',retryable:true},action:'RELOAD_REVIEW'},409,req);
      const r=await proxy(req,b); if(!r.ok&&r.data?.error?.code==='INTERNAL_ERROR'&&String(r.data?.error?.message||'').includes('LOCATION_PAYLOAD_REFRESH_REQUIRED'))return J({ok:false,error:{code:'LOCATION_PAYLOAD_REFRESH_REQUIRED',retryable:true},action:'RELOAD_REVIEW'},409,req); return J(r.data??{ok:r.ok},r.status,req);
    }
    const r=await proxy(req,b); if(!r.data)return new Response(r.raw,{status:r.status,headers:H(req)}); const data=await maskUntilFinal(r.data); return J(data,r.status,req);
  }catch(e){return J({ok:false,error:{code:'V66_INTERNAL_ERROR',message:String(e?.message||e).slice(0,400),retryable:true}},500,req)}
});