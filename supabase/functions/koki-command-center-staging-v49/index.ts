import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SU=Deno.env.get('SUPABASE_URL')!, SK=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const AI='koki-ai-turn-test-agent-staging-v3';
const ENGINE='KOKI_GEMINI_ONLY_MARKET_V1';
const CONTRACT='GEMINI_ONLY_MARKET_OR_EMPTY_V1';
const iso=()=>new Date().toISOString();
const clean=(v:any)=>String(v??'').replace(/\s+/g,' ').trim();

async function db(path:string,init:RequestInit={}){
  const h=new Headers(init.headers);h.set('apikey',SK);h.set('Authorization',`Bearer ${SK}`);if(init.body&&!h.has('Content-Type'))h.set('Content-Type','application/json');
  const r=await fetch(`${SU}/rest/v1/${path}`,{...init,headers:h,signal:init.signal??AbortSignal.timeout(30000)}),t=await r.text();
  if(!r.ok)throw Error(`db_${r.status}:${t.slice(0,400)}`);return t?JSON.parse(t):null;
}
async function wk(){return(await db('koki_worker_config?id=eq.worker_key&select=value&limit=1'))?.[0]?.value||''}
async function patchDraft(id:string,p:any){await db(`koki_listing_drafts_v3?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify({...p,updated_at:iso()})})}
function confirmed(s:any){const o:any={};for(const[k,v]of Object.entries(s||{}) as any)if(v?.status==='CONFIRMED'&&v?.value!=null)o[k]=v.value;return o}
function valid(x:any){
  if(!x||!['READY','EMPTY'].includes(String(x.status)))return false;
  if(x.status==='EMPTY')return true;
  return Number.isFinite(Number(x.range_low_eur))&&Number.isFinite(Number(x.range_high_eur))&&Number(x.range_low_eur)>0&&Number(x.range_high_eur)>=Number(x.range_low_eur)&&typeof x.summary_bg==='string'&&x.summary_bg.trim().length>0;
}

const PROMPT=`You are KOKI MARKET RESEARCH for a Bulgarian OLX listing.
Use ONLY your own model knowledge and reasoning. Do not use or request search tools, browser tools, grounding, external datasets, supplied search results or deterministic collectors.

You receive the complete product context already confirmed earlier in the flow: the user's short description, condition, image-derived facts, confirmed facts, validated OLX category, and target selling price.

Estimate the realistic current Bulgarian second-hand market for this exact product only when you have enough confidence to provide a useful range. Respect exact model, generation, storage/capacity, variant and condition. Do not silently substitute another product. Do not invent named listings, URLs, merchants or observed offers.

If you do not have enough reliable knowledge to provide a useful market estimate, return EMPTY. EMPTY is a normal successful result and must not block listing creation or publishing.

All prices are EUR. Return strict JSON only:
{status:'READY|EMPTY',range_low_eur:number|null,range_high_eur:number|null,market_mean_eur:number|null,target_position:'BELOW_MARKET|IN_MARKET|ABOVE_MARKET|UNKNOWN',summary_bg:string,confidence:'HIGH|MEDIUM|LOW'}.
For EMPTY use null prices, target_position='UNKNOWN', and a short Bulgarian summary.`;

async function run(id:string){
  const d=(await db(`koki_listing_drafts_v3?id=eq.${encodeURIComponent(id)}&select=*&limit=1`))?.[0];
  if(!d)throw Error('draft_not_found');
  const facts=confirmed(d.fact_snapshot),input={
    user_description:d.user_edits?.product_description||'',
    condition:facts.condition||facts.state||d.user_edits?.condition||'',
    confirmed_facts:facts,
    product_identity:d.product_context?.product_identity||null,
    validated_olx_category:d.category||null,
    image_context:(d.media||[]).map((m:any)=>({id:m.id,mime_type:m.mime_type,sha256:m.sha256})),
    target_price_eur:Number(d.owner_desired_price_eur||0)
  };
  const key=await wk();
  await patchDraft(id,{research_state:'RUNNING',research_substate:'RUNNING',market_comparison:null});
  try{
    const r=await fetch(`${SU}/functions/v1/${AI}`,{method:'POST',headers:{'Content-Type':'application/json','x-koki-worker':key},body:JSON.stringify({domain:'NEW_LISTING',stage:'MARKET_RESEARCH_GEMINI_ONLY',subject_id:d.id,system:PROMPT,input,media:[],temp:0.05,cache_ttl_seconds:900,allow_emergency_groq:false}),signal:AbortSignal.timeout(90000)}),j=await r.json().catch(()=>({}));
    if(!r.ok||!j.ok||!valid(j.data))throw Error(String(j.error||j.error_class||'MARKET_AI_INVALID').slice(0,300));
    const x=j.data;
    if(x.status==='EMPTY'){
      await patchDraft(id,{research_state:'COMPLETED',research_substate:'COMPLETED_EMPTY',research_result:{result_code:'EMPTY',operational_price_authority:false},research_validation:{gemini_calls:1,collector:false,search_tool:false,completed_at:iso()},market_comparison:null});
      return{ok:true,draft_id:id,state:'COMPLETED_EMPTY',market_comparison:null,gemini_calls:1};
    }
    const mc={state:'READY',range_low_eur:Number(x.range_low_eur),range_high_eur:Number(x.range_high_eur),mean_eur:x.market_mean_eur==null?null:Number(x.market_mean_eur),target_position:x.target_position||'UNKNOWN',summary_bg:clean(x.summary_bg),confidence:x.confidence||'MEDIUM',source:ENGINE,provider:j.provider||j.source||'GEMINI',model:j.model||null,updated_at:iso()};
    await patchDraft(id,{research_state:'COMPLETED',research_substate:'COMPLETED_OK',research_result:{result_code:'OK',operational_price_authority:true},research_validation:{gemini_calls:1,collector:false,search_tool:false,completed_at:iso()},market_comparison:mc});
    return{ok:true,draft_id:id,state:'COMPLETED_OK',market_comparison:mc,gemini_calls:1};
  }catch(e){
    await patchDraft(id,{research_state:'COMPLETED',research_substate:'COMPLETED_EMPTY',research_result:{result_code:'EMPTY',operational_price_authority:false,error:String((e as any)?.message||e).slice(0,300)},research_validation:{gemini_calls:1,collector:false,search_tool:false,completed_at:iso()},market_comparison:null});
    return{ok:true,draft_id:id,state:'COMPLETED_EMPTY',market_comparison:null,gemini_calls:1};
  }
}

Deno.serve(async req=>{try{
  const key=await wk();if(!key||req.headers.get('x-koki-worker')!==key)return Response.json({ok:false,error:'forbidden'},{status:403});
  const b=await req.json().catch(()=>({}));
  if(['qa','qa_unit'].includes(String(b.action||'')))return Response.json({ok:true,engine:ENGINE,contract:CONTRACT,tests:{gemini_only:true,collectors:false,external_search:false,empty_is_terminal:true,empty_hides_market:true}});
  if(['research','qa_canary'].includes(String(b.action||''))&&b.draft_id)return Response.json(await run(String(b.draft_id)));
  return Response.json({ok:false,error:'unsupported_action'},{status:400});
}catch(e){return Response.json({ok:false,error:String((e as any)?.message||e)},{status:500})}});
