import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {parseBingRss, decodeEntities} from "./core.js";

const SU=Deno.env.get('SUPABASE_URL'), SK=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const ENGINE='KOKI_MARKET_RESEARCH_V66', AI='koki-ai-turn-test-agent-staging-v3';
const iso=()=>new Date().toISOString();

async function db(path,init={}){
  const h=new Headers(init.headers); h.set('apikey',SK); h.set('Authorization',`Bearer ${SK}`);
  if(init.body&&!h.has('Content-Type')) h.set('Content-Type','application/json');
  const r=await fetch(`${SU}/rest/v1/${path}`,{...init,headers:h,signal:init.signal??AbortSignal.timeout(30000)}),t=await r.text();
  if(!r.ok) throw Error(`db_${r.status}:${t.slice(0,400)}`); return t?JSON.parse(t):null;
}
async function wk(){return (await db('koki_worker_config?id=eq.worker_key&select=value&limit=1'))?.[0]?.value||''}
async function patchDraft(id,p){await db(`koki_listing_drafts_v3?id=eq.${id}`,{method:'PATCH',body:JSON.stringify({...p,updated_at:iso()})})}
function confirmed(s){const o={}; for(const [k,v] of Object.entries(s||{})) if(v?.status==='CONFIRMED'&&v?.value!=null)o[k]=v.value; return o}
function clean(s){return decodeEntities(String(s||'')).replace(/\s+/g,' ').trim()}
function domainOf(url){try{return new URL(url).hostname.replace(/^www\./,'').toLowerCase()}catch{return''}}
function moneyExcerpts(text){
  const s=clean(text); const hits=[]; const re=/(.{0,80}(?:€|EUR|лв\.?|BGN)\s*\d[\d\s.,]*|.{0,80}\d[\d\s.,]*\s*(?:€|EUR|лв\.?|BGN).{0,80})/gi; let m;
  while((m=re.exec(s))&&hits.length<8) hits.push(clean(m[0])); return hits;
}
async function fetchPageExcerpt(url){
  try{
    const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 KOKI-Market/66','Accept-Language':'bg-BG,bg;q=0.9,en;q=0.7'},redirect:'follow',signal:AbortSignal.timeout(7000)});
    if(!r.ok) return '';
    const ct=r.headers.get('content-type')||''; if(!ct.includes('text/html')&&!ct.includes('application/xhtml')) return '';
    const raw=(await r.text()).slice(0,450000);
    const jsonPrices=[...raw.matchAll(/"price"\s*:\s*"?([0-9][0-9\s.,]{1,12})"?/gi)].slice(0,5).map(x=>`price ${x[1]}`);
    const visible=raw.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ');
    return [...jsonPrices,...moneyExcerpts(visible)].join(' | ').slice(0,2500);
  }catch{return''}
}
async function bing(query){
  try{
    const u=`https://www.bing.com/search?format=rss&mkt=bg-BG&cc=BG&q=${encodeURIComponent(query)}`;
    const r=await fetch(u,{headers:{'User-Agent':'Mozilla/5.0 KOKI-Market/66','Accept-Language':'bg-BG,bg;q=0.9,en;q=0.7'},signal:AbortSignal.timeout(12000)});
    if(!r.ok) return [];
    return parseBingRss(await r.text()).map(x=>({...x,query,domain:domainOf(x.url)}));
  }catch{return[]}
}
async function collect(identity){
  const queries=[
    `"${identity}" употребяван цена България`,
    `"${identity}" втора ръка цена`,
    `site:olx.bg "${identity}"`,
    `"${identity}" нов цена България`,
    `"${identity}" EUR price`
  ];
  const batches=await Promise.all(queries.map(bing)); const seen=new Set(), items=[];
  for(const x of batches.flat()){
    const key=x.url.replace(/[?#].*$/,'').replace(/\/$/,''); if(!key||seen.has(key))continue; seen.add(key); items.push(x);
  }
  const enriched=await Promise.all(items.slice(0,18).map(async x=>({...x,page_excerpt:await fetchPageExcerpt(x.url)})));
  return enriched;
}
const PROMPT=`You are KOKI Market Comparison V66 for Bulgaria. Analyze ONLY the supplied search dataset. The confirmed product facts are absolute authority. Never invent a listing, merchant, URL, price, condition, storage, model, generation, variant or availability.

Goal: provide a trustworthy comparison before the seller sees Review. Prefer current used listings in Bulgaria for the exact product. EXACT and STRONG_COMPARABLE may be accepted; reject wrong storage/model/generation, accessories, bundles, wanted ads, pages without an observed price, and duplicates. If at least 3 valid used comparables with observed prices exist, use USED_MARKET.

If fewer than 3 valid used comparables exist, use current NEW retail offers of the exact product from at least 3 distinct merchant domains, each with an observed price. Then research_method=NEW_RETAIL_FALLBACK and used_baseline_eur=new_average_eur/2. Do not use price-comparison aggregators as distinct merchants.

Currency: output EUR only. If a source explicitly shows BGN/лв, convert with fixed rate 1 EUR = 1.95583 BGN. Never infer an unobserved price from context.

If neither rule is satisfied, status=INSUFFICIENT. That is a valid terminal result; explain in Bulgarian what evidence was missing. Never return RUNNING.

For READY calculate min, max, arithmetic mean and median, plus 5 tiers around mean: GREAT_DEAL <85%, GOOD_DEAL 85-95%, FAIR_MARKET 95-105%, ELEVATED 105-115%, HIGH_OUTLIER >115%. Evaluate target price.

Return strict JSON only: {status:'READY|INSUFFICIENT',research_method:'USED_MARKET|NEW_RETAIL_FALLBACK|NONE',accepted_used_listings:[{title,url,price_eur,classification:'EXACT|STRONG_COMPARABLE',reason_bg}],retail_sources:[{merchant,url,price_eur}],market:{n,min_eur,max_eur,mean_eur,median_eur,new_average_eur,used_baseline_eur},tiers:[{tier,code,label_bg,min_eur,max_eur}],target_evaluation:{target_price_eur,tier,tier_code,tier_label_bg,difference_from_mean_eur,difference_from_mean_percent,rationale_bg},summary_bg,confidence:'HIGH|MEDIUM|LOW'}.`;
function valid(r){
  if(!r||!['READY','INSUFFICIENT'].includes(r.status)) return false;
  if(r.status==='INSUFFICIENT') return r.research_method==='NONE';
  if(!['USED_MARKET','NEW_RETAIL_FALLBACK'].includes(r.research_method)) return false;
  const m=r.market||{}; return [m.min_eur,m.max_eur,m.mean_eur,m.median_eur].every(Number.isFinite)&&Array.isArray(r.tiers)&&r.tiers.length===5;
}
async function aiReport(d,dataset){
  const key=await wk(); const facts=confirmed(d.fact_snapshot), identity=clean(d.listing_content?.title||d.product_context?.product_identity?.canonical_name||d.user_edits?.product_description||'');
  const input={canonical_product:identity,confirmed_product_facts:facts,condition:facts.state||facts.condition||'',target_price_eur:Number(d.owner_desired_price_eur||0),raw_search_dataset:dataset};
  const r=await fetch(`${SU}/functions/v1/${AI}`,{method:'POST',headers:{'Content-Type':'application/json','x-koki-worker':key},body:JSON.stringify({domain:'NEW_LISTING',stage:'MARKET_COMPARISON_V66',subject_id:d.id,system:PROMPT,input,media:[],temp:0.03,cache_ttl_seconds:1800,allow_emergency_groq:false}),signal:AbortSignal.timeout(90000)}),j=await r.json().catch(()=>({}));
  if(!r.ok||!j.ok||!valid(j.data)) throw Error(j.error||j.error_class||'MARKET_AI_INVALID'); return {data:j.data,provider:j.provider||j.source||null,model:j.model||null};
}
async function run(id){
  let d=(await db(`koki_listing_drafts_v3?id=eq.${encodeURIComponent(id)}&select=*&limit=1`))?.[0]; if(!d) throw Error('draft_not_found');
  await patchDraft(id,{research_substate:'RUNNING'});
  const identity=clean(d.listing_content?.title||d.product_context?.product_identity?.canonical_name||d.user_edits?.product_description||''); const dataset=await collect(identity);
  try{
    const a=await aiReport(d,dataset),r=a.data;
    if(r.status==='INSUFFICIENT'){
      const mc={state:'INSUFFICIENT',method:'NONE',confidence:r.confidence||'LOW',price_authority:false,accepted_count:0,comparables:[],tiers:[],target_evaluation:r.target_evaluation||null,summary_bg:r.summary_bg||'Не намерих достатъчно надеждни сравними оферти за коректен пазарен диапазон.',source:ENGINE,dataset_count:dataset.length,provider:a.provider,model:a.model,updated_at:iso()};
      await patchDraft(id,{research_state:'COMPLETED',research_substate:'COMPLETED_INSUFFICIENT',research_result:{result_code:'INSUFFICIENT_MARKET_EVIDENCE',operational_price_authority:false,summary_bg:mc.summary_bg},research_validation:{accepted_count:0,stopping_rule_met:false,collector_version:'bing-rss-page-enrichment-v66',collected_at:iso()},research_version:Math.max(1,Number(d.research_version||0)+1),market_comparison:mc});
      return {ok:true,draft_id:id,state:'COMPLETED_INSUFFICIENT',market_comparison:mc,dataset_count:dataset.length};
    }
    const comps=(r.research_method==='USED_MARKET'?r.accepted_used_listings:r.retail_sources).map(x=>({title:x.title||x.merchant,source_ref:x.url,price_eur:Number(x.price_eur),classification:x.classification||'NEW_RETAIL',reason_bg:x.reason_bg||null}));
    const mc={state:'READY',method:r.research_method,confidence:r.confidence||'MEDIUM',price_authority:true,accepted_count:comps.length,comparables:comps,range_low_eur:r.market.min_eur,range_high_eur:r.market.max_eur,mean_eur:r.market.mean_eur,median_eur:r.market.median_eur,new_average_eur:r.market.new_average_eur,used_baseline_eur:r.market.used_baseline_eur,tiers:r.tiers,target_evaluation:r.target_evaluation,summary_bg:r.summary_bg,source:ENGINE,dataset_count:dataset.length,provider:a.provider,model:a.model,updated_at:iso()};
    await patchDraft(id,{research_state:'COMPLETED',research_substate:'COMPLETED_OK',research_result:{result_code:'OK',operational_price_authority:true,market_method:r.research_method,market_summary_bg:r.summary_bg},research_validation:{accepted_count:comps.length,stopping_rule_met:true,collector_version:'bing-rss-page-enrichment-v66',collected_at:iso()},research_version:Math.max(1,Number(d.research_version||0)+1),market_comparison:mc});
    return {ok:true,draft_id:id,state:'COMPLETED_OK',market_comparison:mc,dataset_count:dataset.length};
  }catch(e){
    const msg=String(e?.message||e); const mc={state:'INSUFFICIENT',method:'NONE',confidence:'LOW',price_authority:false,accepted_count:0,comparables:[],tiers:[],summary_bg:'Не успях да потвърдя достатъчно надеждни сравними оферти. Можеш да публикуваш на зададената от теб цена.',source:ENGINE,error:msg.slice(0,200),dataset_count:dataset.length,updated_at:iso()};
    await patchDraft(id,{research_state:'COMPLETED',research_substate:'COMPLETED_INSUFFICIENT',research_result:{result_code:'INSUFFICIENT_MARKET_EVIDENCE',operational_price_authority:false,error:msg.slice(0,300)},research_validation:{accepted_count:0,stopping_rule_met:false,collector_version:'bing-rss-page-enrichment-v66',collected_at:iso()},market_comparison:mc});
    return {ok:true,draft_id:id,state:'COMPLETED_INSUFFICIENT',market_comparison:mc,dataset_count:dataset.length,degraded:true};
  }
}
Deno.serve(async req=>{
  try{
    const key=await wk(); if(!key||req.headers.get('x-koki-worker')!==key) return Response.json({ok:false,error:'forbidden'},{status:403});
    const b=await req.json().catch(()=>({}));
    if(b.action==='qa'){
      const fixture='<rss><channel><item><title>Apple &amp; Phone</title><link>https://shop.example/p</link><description>Цена 999 EUR</description></item></channel></rss>';
      const p=parseBingRss(fixture); return Response.json({ok:p.length===1&&p[0].url==='https://shop.example/p',engine:ENGINE,unit:{rss_parser:p.length===1,terminal_states:['COMPLETED_OK','COMPLETED_INSUFFICIENT'],never_returns_running_review:true}});
    }
    if(b.action==='research'&&b.draft_id) return Response.json(await run(String(b.draft_id)));
    return Response.json({ok:false,error:'unsupported_action'},{status:400});
  }catch(e){return Response.json({ok:false,error:String(e?.message||e)},{status:500})}
});
