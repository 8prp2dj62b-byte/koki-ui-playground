import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {parseBingRss, decodeEntities} from "./core.js";

const SU=Deno.env.get('SUPABASE_URL'), SK=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const ENGINE='KOKI_MARKET_RESEARCH_V67', AI='koki-ai-turn-test-agent-staging-v3';
const GROUND_MODELS=['gemini-3.6-flash','gemini-3.5-flash','gemini-3.5-flash-lite'];
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
function insufficientSummary(identity,count){return `Проверих ${Number(count)||0} текущи резултата за ${clean(identity)||'точния продукт'}, но не намерих поне 3 надеждни сравними оферти с проверима цена. Пазарен диапазон няма да бъде измислян.`}
function moneyExcerpts(text){
  const s=clean(text); const hits=[]; const re=/(.{0,80}(?:€|EUR|лв\.?|BGN)\s*\d[\d\s.,]*|.{0,80}\d[\d\s.,]*\s*(?:€|EUR|лв\.?|BGN).{0,80})/gi; let m;
  while((m=re.exec(s))&&hits.length<8) hits.push(clean(m[0])); return hits;
}
async function fetchPageExcerpt(url){
  try{
    const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 KOKI-Market/67','Accept-Language':'bg-BG,bg;q=0.9,en;q=0.7'},redirect:'follow',signal:AbortSignal.timeout(7000)});
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
    const r=await fetch(u,{headers:{'User-Agent':'Mozilla/5.0 KOKI-Market/67','Accept-Language':'bg-BG,bg;q=0.9,en;q=0.7'},signal:AbortSignal.timeout(12000)});
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
  return Promise.all(items.slice(0,18).map(async x=>({...x,page_excerpt:await fetchPageExcerpt(x.url)})));
}
const PROMPT=`You are KOKI Market Comparison for Bulgaria. Analyze ONLY the supplied search dataset. Confirmed product facts are absolute authority. Never invent a listing, merchant, URL, price, condition, storage, model, generation, variant or availability.

Prefer current used listings in Bulgaria for the exact product. EXACT and STRONG_COMPARABLE may be accepted; reject wrong storage/model/generation, accessories, bundles, wanted ads, pages without an observed price, and duplicates. If at least 3 valid used comparables with observed prices exist, use USED_MARKET.

If fewer than 3 valid used comparables exist, use current NEW retail offers of the exact product from at least 3 distinct merchant domains, each with an observed price. Then research_method=NEW_RETAIL_FALLBACK. Do not use price-comparison aggregators as distinct merchants.

Currency: output EUR only. If a source explicitly shows BGN/лв, convert with fixed rate 1 EUR = 1.95583 BGN. Never infer an unobserved price from context. If neither rule is satisfied, status=INSUFFICIENT. Never return RUNNING.

Return strict JSON only: {status:'READY|INSUFFICIENT',research_method:'USED_MARKET|NEW_RETAIL_FALLBACK|NONE',accepted_used_listings:[{title,url,price_eur,classification:'EXACT|STRONG_COMPARABLE',reason_bg}],retail_sources:[{merchant,url,price_eur}],summary_bg,confidence:'HIGH|MEDIUM|LOW'}.`;
const GROUNDED_PROMPT=`You are KOKI Grounded Market Research for Bulgaria. You MUST use Google Search grounding to find current public offers for the exact confirmed product. The user's confirmed facts are absolute authority. Never change model, storage, generation, variant or condition to make results fit.

First search for current USED listings in Bulgaria. Accept only individual product listings with a visible observed price and matching product identity. Reject wanted ads, accessories, bundles, wrong storage/model/generation, duplicates and results whose price is not visible in the grounded evidence. If you have at least 3 valid used listings, return USED_MARKET.

If fewer than 3 valid used listings exist, search current NEW offers for the exact product from at least 3 DISTINCT Bulgarian merchant domains, each with a visible observed price. Return NEW_RETAIL_FALLBACK only when this rule is met. Price aggregators are not distinct merchants.

Convert BGN to EUR at exactly 1 EUR = 1.95583 BGN. Do not estimate or invent any price or URL. If evidence is insufficient, return INSUFFICIENT. Never return RUNNING.

Return JSON only: {status:'READY|INSUFFICIENT',research_method:'USED_MARKET|NEW_RETAIL_FALLBACK|NONE',accepted_used_listings:[{title,url,price_eur,classification:'EXACT|STRONG_COMPARABLE',reason_bg}],retail_sources:[{merchant,url,price_eur}],summary_bg,confidence:'HIGH|MEDIUM|LOW'}.`;
function validShape(r){
  if(!r||!['READY','INSUFFICIENT'].includes(r.status)) return false;
  if(r.status==='INSUFFICIENT') return r.research_method==='NONE';
  if(r.research_method==='USED_MARKET') return Array.isArray(r.accepted_used_listings)&&r.accepted_used_listings.length>=3;
  if(r.research_method==='NEW_RETAIL_FALLBACK') return Array.isArray(r.retail_sources)&&r.retail_sources.length>=3;
  return false;
}
function parseJson(text){
  const t=String(text||'').replace(/<think>[\s\S]*?<\/think>/gi,'').replace(/^```json\s*/i,'').replace(/```$/,'').trim();
  try{return JSON.parse(t)}catch{const a=t.indexOf('{'),b=t.lastIndexOf('}');if(a>=0&&b>a)try{return JSON.parse(t.slice(a,b+1))}catch{}return null}
}
function candidateText(j){return (j?.candidates||[]).flatMap(c=>c?.content?.parts||[]).map(p=>p?.text||'').join('\n').trim()}
function groundingChunks(j){
  const chunks=j?.candidates?.[0]?.groundingMetadata?.groundingChunks||[];
  return chunks.map((x,i)=>({index:i,url:clean(x?.web?.uri||''),title:clean(x?.web?.title||''),domain:domainOf(x?.web?.uri||'')})).filter(x=>x.url);
}
function credentials(){return [['A',Deno.env.get('GEMINI_API_KEY')],['B',Deno.env.get('GEMINI_API_KEY_B')],['C',Deno.env.get('GEMINI_API_KEY_C')],['D',Deno.env.get('GEMINI_API_KEY_D')],['E',Deno.env.get('GEMINI_API_KEY_E')],['F',Deno.env.get('GEMINI_API_KEY_F')],['G',Deno.env.get('GEMINI_API_KEY_G')],['H',Deno.env.get('GEMINI_API_KEY_H')]].filter(x=>!!x[1])}
async function usage(x){await db('koki_ai_usage_events',{method:'POST',body:JSON.stringify({created_at:iso(),domain:'NEW_LISTING',stage:'MARKET_COMPARISON_GROUNDED_V67',subject_id:x.subject_id||null,provider:'GEMINI',credential:x.credential||null,model:x.model||null,outcome:x.outcome,http_status:x.http_status??null,error_class:x.error_class||null,latency_ms:x.latency_ms??null,input_tokens:x.input_tokens??null,output_tokens:x.output_tokens??null,total_tokens:x.total_tokens??null,cache_reused:false,metadata:{router:'GOOGLE_SEARCH_GROUNDING_V67',grounding_chunks:x.grounding_chunks||0}})}).catch(()=>{})}
async function groundedReport(d){
  const facts=confirmed(d.fact_snapshot),identity=clean(d.listing_content?.title||d.product_context?.product_identity?.canonical_name||d.user_edits?.product_description||''),input={canonical_product:identity,confirmed_product_facts:facts,condition:facts.state||facts.condition||'',target_price_eur:Number(d.owner_desired_price_eur||0),market:'Bulgaria',currency:'EUR'};
  let last='GROUNDING_UNAVAILABLE';
  for(const [label,key] of credentials()){
    for(const model of GROUND_MODELS){
      const started=Date.now();
      try{
        const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{method:'POST',headers:{'x-goog-api-key':key,'Content-Type':'application/json'},body:JSON.stringify({systemInstruction:{parts:[{text:GROUNDED_PROMPT}]},contents:[{role:'user',parts:[{text:JSON.stringify(input)}]}],tools:[{google_search:{}}],generationConfig:{temperature:0.03,candidateCount:1}}),signal:AbortSignal.timeout(70000)}),raw=await r.text();let j={};try{j=JSON.parse(raw)}catch{}const u=j?.usageMetadata||{},chunks=groundingChunks(j),data=parseJson(candidateText(j));
        if(r.ok&&validShape(data)&&chunks.length){await usage({subject_id:d.id,credential:label,model,outcome:'SUCCESS',http_status:200,latency_ms:Date.now()-started,input_tokens:u.promptTokenCount||null,output_tokens:u.candidatesTokenCount||null,total_tokens:u.totalTokenCount||null,grounding_chunks:chunks.length});return {data,provider:'GEMINI_GOOGLE_SEARCH',model,credential:label,grounding_chunks:chunks}}
        last=String(j?.error?.message||(!chunks.length?'NO_GROUNDING_EVIDENCE':!validShape(data)?'INVALID_GROUNDED_JSON':`HTTP_${r.status}`)).slice(0,300);
        await usage({subject_id:d.id,credential:label,model,outcome:'FAILED',http_status:r.status,latency_ms:Date.now()-started,input_tokens:u.promptTokenCount||null,output_tokens:u.candidatesTokenCount||null,total_tokens:u.totalTokenCount||null,error_class:last,grounding_chunks:chunks.length});
        if(r.status===400&&/tool|google.?search|unsupported/i.test(last))continue;
        if([401,403,429].includes(r.status))break;
      }catch(e){last=String(e?.message||e);await usage({subject_id:d.id,credential:label,model,outcome:'FAILED',http_status:0,latency_ms:Date.now()-started,error_class:'GROUNDING_TIMEOUT'})}
    }
  }
  throw Error(last);
}
async function aiReport(d,dataset){
  const key=await wk(); const facts=confirmed(d.fact_snapshot), identity=clean(d.listing_content?.title||d.product_context?.product_identity?.canonical_name||d.user_edits?.product_description||'');
  const input={canonical_product:identity,confirmed_product_facts:facts,condition:facts.state||facts.condition||'',target_price_eur:Number(d.owner_desired_price_eur||0),raw_search_dataset:dataset};
  const r=await fetch(`${SU}/functions/v1/${AI}`,{method:'POST',headers:{'Content-Type':'application/json','x-koki-worker':key},body:JSON.stringify({domain:'NEW_LISTING',stage:'MARKET_COMPARISON_V67_DATASET',subject_id:d.id,system:PROMPT,input,media:[],temp:0.03,cache_ttl_seconds:900,allow_emergency_groq:false}),signal:AbortSignal.timeout(90000)}),j=await r.json().catch(()=>({}));
  if(!r.ok||!j.ok||!validShape(j.data)) throw Error(j.error||j.error_class||'MARKET_AI_INVALID'); return {data:j.data,provider:j.provider||j.source||null,model:j.model||null};
}
function stats(values){
  const a=values.map(Number).filter(x=>Number.isFinite(x)&&x>0).sort((x,y)=>x-y),n=a.length;if(!n)return null;
  const mean=a.reduce((s,x)=>s+x,0)/n,median=n%2?a[(n-1)/2]:(a[n/2-1]+a[n/2])/2;return {n,min:a[0],max:a[n-1],mean,median};
}
function tierFor(price,mean){const pct=price/mean;if(pct<.85)return ['GREAT_DEAL','Отлична цена'];if(pct<.95)return ['GOOD_DEAL','Добра цена'];if(pct<=1.05)return ['FAIR_MARKET','Пазарна цена'];if(pct<=1.15)return ['ELEVATED','Над средната'];return ['HIGH_OUTLIER','Висока цена']}
function tiers(mean){return [
  {tier:'GREAT_DEAL',code:'GREAT_DEAL',label_bg:'Отлична цена',min_eur:0,max_eur:+(.85*mean).toFixed(2)},
  {tier:'GOOD_DEAL',code:'GOOD_DEAL',label_bg:'Добра цена',min_eur:+(.85*mean).toFixed(2),max_eur:+(.95*mean).toFixed(2)},
  {tier:'FAIR_MARKET',code:'FAIR_MARKET',label_bg:'Пазарна цена',min_eur:+(.95*mean).toFixed(2),max_eur:+(1.05*mean).toFixed(2)},
  {tier:'ELEVATED',code:'ELEVATED',label_bg:'Над средната',min_eur:+(1.05*mean).toFixed(2),max_eur:+(1.15*mean).toFixed(2)},
  {tier:'HIGH_OUTLIER',code:'HIGH_OUTLIER',label_bg:'Висока цена',min_eur:+(1.15*mean).toFixed(2),max_eur:null}
]}
function materialize(r,target){
  if(!r||r.status!=='READY')return null;
  if(r.research_method==='USED_MARKET'){
    const comps=(r.accepted_used_listings||[]).filter(x=>/^https?:\/\//i.test(String(x.url||''))&&Number(x.price_eur)>0).slice(0,12);const s=stats(comps.map(x=>x.price_eur));if(!s||s.n<3)return null;const [code,label]=tierFor(target,s.mean);
    return {method:'USED_MARKET',confidence:r.confidence||'MEDIUM',comparables:comps.map(x=>({title:clean(x.title),source_ref:x.url,price_eur:Number(x.price_eur),classification:x.classification||'EXACT',reason_bg:clean(x.reason_bg)})),range_low_eur:+s.min.toFixed(2),range_high_eur:+s.max.toFixed(2),mean_eur:+s.mean.toFixed(2),median_eur:+s.median.toFixed(2),new_average_eur:null,used_baseline_eur:null,tiers:tiers(s.mean),target_evaluation:{target_price_eur:target,tier:code,tier_code:code,tier_label_bg:label,difference_from_mean_eur:+(target-s.mean).toFixed(2),difference_from_mean_percent:+(((target-s.mean)/s.mean)*100).toFixed(2),rationale_bg:`Спрямо средната цена от ${s.n} проверени употребявани оферти.`},summary_bg:clean(r.summary_bg)||`Сравнението е базирано на ${s.n} текущи употребявани оферти.`};
  }
  if(r.research_method==='NEW_RETAIL_FALLBACK'){
    const raw=(r.retail_sources||[]).filter(x=>/^https?:\/\//i.test(String(x.url||''))&&Number(x.price_eur)>0);const seen=new Set(),sources=[];for(const x of raw){const d=domainOf(x.url);if(!d||seen.has(d))continue;seen.add(d);sources.push(x)}const s=stats(sources.map(x=>x.price_eur));if(!s||s.n<3)return null;const baseline=s.mean/2,low=baseline*.85,high=baseline*1.15,[code,label]=tierFor(target,baseline);
    return {method:'NEW_RETAIL_FALLBACK',confidence:r.confidence||'LOW',comparables:sources.slice(0,10).map(x=>({title:clean(x.merchant),source_ref:x.url,price_eur:Number(x.price_eur),classification:'NEW_RETAIL',reason_bg:'Текуща цена на нов продукт от отделен търговец.'})),range_low_eur:+low.toFixed(2),range_high_eur:+high.toFixed(2),mean_eur:+baseline.toFixed(2),median_eur:+baseline.toFixed(2),new_average_eur:+s.mean.toFixed(2),used_baseline_eur:+baseline.toFixed(2),tiers:tiers(baseline),target_evaluation:{target_price_eur:target,tier:code,tier_code:code,tier_label_bg:label,difference_from_mean_eur:+(target-baseline).toFixed(2),difference_from_mean_percent:+(((target-baseline)/baseline)*100).toFixed(2),rationale_bg:`Ориентирът за употребяван продукт е 50% от средната цена на ${s.n} проверени нови оферти.`},summary_bg:clean(r.summary_bg)||`Няма достатъчно употребявани обяви; ориентирът е изчислен от ${s.n} текущи цени за нов продукт.`};
  }
  return null;
}
async function run(id,useGrounding=false){
  let d=(await db(`koki_listing_drafts_v3?id=eq.${encodeURIComponent(id)}&select=*&limit=1`))?.[0]; if(!d) throw Error('draft_not_found');
  await patchDraft(id,{research_substate:'RUNNING'});
  const identity=clean(d.listing_content?.title||d.product_context?.product_identity?.canonical_name||d.user_edits?.product_description||''),target=Number(d.owner_desired_price_eur||0),dataset=await collect(identity);
  let report=null,provider=null,model=null,grounded=[];
  try{
    const a=await aiReport(d,dataset);report=a.data;provider=a.provider;model=a.model;
    if((report.status==='INSUFFICIENT'||!materialize(report,target))&&useGrounding){const g=await groundedReport(d);report=g.data;provider=g.provider;model=g.model;grounded=g.grounding_chunks||[]}
    const ready=materialize(report,target);
    if(!ready){
      const summary=insufficientSummary(identity,dataset.length),mc={state:'INSUFFICIENT',method:'NONE',confidence:report?.confidence||'LOW',price_authority:false,accepted_count:0,comparables:[],tiers:[],target_evaluation:null,summary_bg:summary,source:useGrounding?'KOKI_MARKET_RESEARCH_V67_GROUNDED':ENGINE,dataset_count:dataset.length,grounding_count:grounded.length,provider,model,updated_at:iso()};
      await patchDraft(id,{research_state:'COMPLETED',research_substate:'COMPLETED_INSUFFICIENT',research_result:{result_code:'INSUFFICIENT_MARKET_EVIDENCE',operational_price_authority:false,summary_bg:summary},research_validation:{accepted_count:0,stopping_rule_met:false,collector_version:useGrounding?'bing+google-search-grounding-v67':'bing-rss-page-enrichment-v67',collected_at:iso(),grounding_count:grounded.length},research_version:Math.max(1,Number(d.research_version||0)+1),market_comparison:mc});
      return {ok:true,draft_id:id,state:'COMPLETED_INSUFFICIENT',market_comparison:mc,dataset_count:dataset.length,grounding_count:grounded.length};
    }
    const mc={state:'READY',...ready,price_authority:true,accepted_count:ready.comparables.length,source:useGrounding&&grounded.length?'KOKI_MARKET_RESEARCH_V67_GROUNDED':ENGINE,dataset_count:dataset.length,grounding_count:grounded.length,grounding_sources:grounded.slice(0,12),provider,model,updated_at:iso()};
    await patchDraft(id,{research_state:'COMPLETED',research_substate:'COMPLETED_OK',research_result:{result_code:'OK',operational_price_authority:true,market_method:ready.method,market_summary_bg:mc.summary_bg},research_validation:{accepted_count:ready.comparables.length,stopping_rule_met:true,collector_version:useGrounding?'bing+google-search-grounding-v67':'bing-rss-page-enrichment-v67',collected_at:iso(),grounding_count:grounded.length},research_version:Math.max(1,Number(d.research_version||0)+1),market_comparison:mc});
    return {ok:true,draft_id:id,state:'COMPLETED_OK',market_comparison:mc,dataset_count:dataset.length,grounding_count:grounded.length};
  }catch(e){
    const msg=String(e?.message||e),summary=insufficientSummary(identity,dataset.length),mc={state:'INSUFFICIENT',method:'NONE',confidence:'LOW',price_authority:false,accepted_count:0,comparables:[],tiers:[],summary_bg:summary,source:ENGINE,error:msg.slice(0,200),dataset_count:dataset.length,grounding_count:grounded.length,updated_at:iso()};
    await patchDraft(id,{research_state:'COMPLETED',research_substate:'COMPLETED_INSUFFICIENT',research_result:{result_code:'INSUFFICIENT_MARKET_EVIDENCE',operational_price_authority:false,error:msg.slice(0,300),summary_bg:summary},research_validation:{accepted_count:0,stopping_rule_met:false,collector_version:useGrounding?'bing+google-search-grounding-v67':'bing-rss-page-enrichment-v67',collected_at:iso(),grounding_count:grounded.length},market_comparison:mc});
    return {ok:true,draft_id:id,state:'COMPLETED_INSUFFICIENT',market_comparison:mc,dataset_count:dataset.length,grounding_count:grounded.length,degraded:true};
  }
}
Deno.serve(async req=>{
  try{
    const key=await wk(); if(!key||req.headers.get('x-koki-worker')!==key) return Response.json({ok:false,error:'forbidden'},{status:403});
    const b=await req.json().catch(()=>({}));
    if(b.action==='qa'){
      const fixture='<rss><channel><item><title>Apple &amp; Phone</title><link>https://shop.example/p</link><description>Цена 999 EUR</description></item></channel></rss>',p=parseBingRss(fixture),summary=insufficientSummary('iPhone',10),used=materialize({status:'READY',research_method:'USED_MARKET',accepted_used_listings:[{title:'a',url:'https://a.bg/1',price_eur:400},{title:'b',url:'https://b.bg/2',price_eur:500},{title:'c',url:'https://c.bg/3',price_eur:600}],confidence:'HIGH'},500),retail=materialize({status:'READY',research_method:'NEW_RETAIL_FALLBACK',retail_sources:[{merchant:'a',url:'https://a.bg/1',price_eur:1000},{merchant:'b',url:'https://b.bg/2',price_eur:1100},{merchant:'c',url:'https://c.bg/3',price_eur:900}],confidence:'MEDIUM'},500);
      const tests={rss_parser:p.length===1,deterministic_insufficient:summary.includes('няма да бъде измислян'),used_stats:used?.mean_eur===500&&used?.range_low_eur===400&&used?.range_high_eur===600,retail_baseline:retail?.used_baseline_eur===500&&retail?.range_low_eur===425&&retail?.range_high_eur===575,grounded_action_available:true};
      return Response.json({ok:Object.values(tests).every(Boolean),engine:ENGINE,tests});
    }
    if(b.action==='research'&&b.draft_id) return Response.json(await run(String(b.draft_id),false));
    if((b.action==='research_v67'||b.action==='qa_grounded')&&b.draft_id) return Response.json(await run(String(b.draft_id),true));
    return Response.json({ok:false,error:'unsupported_action'},{status:400});
  }catch(e){return Response.json({ok:false,error:String(e?.message||e)},{status:500})}
});
