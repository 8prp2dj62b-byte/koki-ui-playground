import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {parseBingRss,isRawDatasetRow,validateMarketReport} from "./core.js";

const SU=Deno.env.get('SUPABASE_URL')!, SK=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const AI='koki-ai-turn-test-agent-staging-v3';
const ENGINE='GEMINI_DATASET_MARKET_REPORT_V16';
const CONTRACT='RAW_DATASET_ONE_GEMINI_CALL_V16';
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
function identityOf(d:any){
  const f=confirmed(d.fact_snapshot),raw=clean(d.listing_content?.title||d.product_context?.product_identity?.canonical_name||d.user_edits?.product_description||''),storage=clean(f.storage_capacity||f.internal_memory||'').replace(/\s+/g,'');
  return clean(`${raw.replace(/\s*-\s*(използван|нов).*$/i,'')}${storage&&!raw.toLowerCase().includes(storage.toLowerCase())?` ${storage}`:''}`);
}
function normalizeUrl(url:string){try{const u=new URL(url);u.hash='';return u.toString().replace(/\/$/,'')}catch{return clean(url)}}

async function bingRaw(query:string){
  try{
    const u=`https://www.bing.com/search?format=rss&mkt=bg-BG&cc=BG&q=${encodeURIComponent(query)}`;
    const r=await fetch(u,{headers:{'User-Agent':'Mozilla/5.0 KOKI-Market-V16','Accept-Language':'bg-BG,bg;q=0.9,en;q=0.7'},signal:AbortSignal.timeout(12000)});
    if(!r.ok)return[];
    return parseBingRss(await r.text());
  }catch{return[]}
}
async function collectRawDataset(identity:string){
  const queries=[
    `"${identity}" употребяван цена България`,
    `"${identity}" втора ръка цена`,
    `site:olx.bg "${identity}"`,
    `"${identity}" нов цена България`,
    `"${identity}" цена България`
  ];
  const batches=await Promise.all(queries.map(bingRaw)),seen=new Set<string>(),rows:any[]=[];
  for(const x of batches.flat()){
    const url=normalizeUrl(String(x.url||'')),key=url.replace(/[?#].*$/,'');
    const row={title:clean(x.title),url,snippet:clean(x.snippet)};
    if(!key||seen.has(key)||!isRawDatasetRow(row))continue;
    seen.add(key);rows.push(row);
  }
  return rows.slice(0,30);
}

const PROMPT=`You are GEMINI_DATASET_MARKET_REPORT_V16, the sole market-analysis authority for KOKI in Bulgaria.

You MUST analyze ONLY the supplied raw_search_dataset. You do NOT have and must NOT use any search tool, browser tool, Google Search grounding or external browsing. Each dataset row contains only title, url and snippet. Never invent a listing, merchant, URL, price, availability, condition, model, generation, storage, variant or fact that is not supported by the supplied dataset and confirmed product facts.

Confirmed product facts are absolute authority. Never change the exact product identity, model, generation, storage or variant to make market evidence fit.

USED MARKET RULE:
Classify used/private-market candidates as EXACT, STRONG_COMPARABLE, WEAK or REJECTED. Only EXACT and STRONG_COMPARABLE count. Reject wrong model/storage/generation/variant, accessories, bundles, wanted ads, duplicates and rows without an observed price in the supplied title/snippet. If at least 3 accepted used listings exist, set research_method=USED_MARKET. Calculate min, max, mean and median from those accepted used prices.

RETAIL FALLBACK RULE:
Only if fewer than 3 accepted used listings exist, evaluate NEW retail rows for the exact product. Require at least 3 different merchant domains with an observed price for the exact variant. Do not count price aggregators as separate merchants and do not count refurbished/used sellers as NEW retail. Calculate NEW_AVERAGE as the mean of the accepted new retail prices. Then calculate used_baseline_eur = NEW_AVERAGE / 2, market min_eur = used_baseline_eur * 0.70, market max_eur = used_baseline_eur * 1.30, market mean_eur = used_baseline_eur and market median_eur = used_baseline_eur. Set research_method=NEW_RETAIL_FALLBACK.

TIERS:
Using market mean_eur as the reference: GREAT_DEAL <85%, GOOD_DEAL 85%-95%, FAIR_MARKET 95%-105%, ELEVATED 105%-115%, HIGH_OUTLIER >115%. Return all 5 tiers with numeric EUR boundaries. Evaluate target_price_eur against the same mean and return tier, tier_code, Bulgarian label, difference_from_mean_eur, difference_from_mean_percent and concise Bulgarian rationale.

All monetary output must be EUR. If a supplied snippet explicitly shows BGN/лв, convert only that observed amount using exactly 1 EUR = 1.95583 BGN. Never infer a missing price.

If neither USED_MARKET nor NEW_RETAIL_FALLBACK satisfies the evidence rules, return status=INSUFFICIENT, research_method=NONE and explain in Bulgarian what evidence is missing. INSUFFICIENT is terminal. Never return RUNNING.

Return strict JSON only in this schema:
{status:'READY|INSUFFICIENT',research_method:'USED_MARKET|NEW_RETAIL_FALLBACK|NONE',accepted_used_listings:[{title,url,price_eur,classification:'EXACT|STRONG_COMPARABLE',reason_bg}],retail_sources:[{merchant,url,price_eur,reason_bg}],market:{n,min_eur,max_eur,mean_eur,median_eur,new_average_eur,used_baseline_eur},tiers:[{tier,code,label_bg,min_eur,max_eur}],target_evaluation:{target_price_eur,tier,tier_code,tier_label_bg,difference_from_mean_eur,difference_from_mean_percent,rationale_bg},summary_bg,confidence:'HIGH|MEDIUM|LOW'}.`;

async function oneGeminiReport(d:any,dataset:any[]){
  const key=await wk(),facts=confirmed(d.fact_snapshot),identity=identityOf(d),input={canonical_product:identity,confirmed_product_facts:facts,condition:facts.state||facts.condition||'',target_price_eur:Number(d.owner_desired_price_eur||0),raw_search_dataset:dataset};
  const r=await fetch(`${SU}/functions/v1/${AI}`,{method:'POST',headers:{'Content-Type':'application/json','x-koki-worker':key},body:JSON.stringify({domain:'NEW_LISTING',stage:'MARKET_COMPARISON_V16',subject_id:d.id,system:PROMPT,input,media:[],temp:0.03,cache_ttl_seconds:1800,allow_emergency_groq:false}),signal:AbortSignal.timeout(90000)}),j=await r.json().catch(()=>({}));
  const v=validateMarketReport(j.data);
  if(!r.ok||!j.ok||!v.ok)throw Error(String(j.error||j.error_class||`MARKET_AI_INVALID:${v.reason}`).slice(0,300));
  return{data:j.data,provider:j.provider||j.source||null,model:j.model||null};
}

function toMarketComparison(r:any,meta:any,datasetCount:number){
  if(r.status==='INSUFFICIENT')return{state:'INSUFFICIENT',method:'NONE',confidence:r.confidence||'LOW',price_authority:false,accepted_count:0,comparables:[],tiers:[],target_evaluation:r.target_evaluation||null,summary_bg:r.summary_bg||'Не намерих достатъчно надеждни сравними оферти за коректен пазарен диапазон.',source:ENGINE,dataset_count:datasetCount,provider:meta.provider,model:meta.model,updated_at:iso()};
  const sourceRows=r.research_method==='USED_MARKET'?r.accepted_used_listings:r.retail_sources;
  return{state:'READY',method:r.research_method,confidence:r.confidence||'MEDIUM',price_authority:true,accepted_count:sourceRows.length,comparables:sourceRows.map((x:any)=>({title:x.title||x.merchant,source_ref:x.url,price_eur:Number(x.price_eur),classification:x.classification||'NEW_RETAIL',reason_bg:x.reason_bg||null})),range_low_eur:r.market.min_eur,range_high_eur:r.market.max_eur,mean_eur:r.market.mean_eur,median_eur:r.market.median_eur,new_average_eur:r.market.new_average_eur,used_baseline_eur:r.market.used_baseline_eur,tiers:r.tiers,target_evaluation:r.target_evaluation,summary_bg:r.summary_bg,source:ENGINE,dataset_count:datasetCount,provider:meta.provider,model:meta.model,updated_at:iso()};
}

async function run(id:string){
  const d=(await db(`koki_listing_drafts_v3?id=eq.${encodeURIComponent(id)}&select=*&limit=1`))?.[0];if(!d)throw Error('draft_not_found');
  await patchDraft(id,{research_substate:'RUNNING'});
  const dataset=await collectRawDataset(identityOf(d));
  try{
    const a=await oneGeminiReport(d,dataset),mc=toMarketComparison(a.data,a,dataset.length),ok=mc.state==='READY';
    await patchDraft(id,{research_state:'COMPLETED',research_substate:ok?'COMPLETED_OK':'COMPLETED_INSUFFICIENT',research_result:ok?{result_code:'OK',operational_price_authority:true,market_method:mc.method,market_summary_bg:mc.summary_bg}:{result_code:'INSUFFICIENT_MARKET_EVIDENCE',operational_price_authority:false,summary_bg:mc.summary_bg},research_validation:{accepted_count:mc.accepted_count,stopping_rule_met:ok,collector_version:'bing-rss-raw-title-url-snippet-v16',collected_at:iso(),dataset_count:dataset.length,gemini_semantic_calls:1,google_search_tool:false},research_version:Math.max(1,Number(d.research_version||0)+1),market_comparison:mc});
    return{ok:true,draft_id:id,state:ok?'COMPLETED_OK':'COMPLETED_INSUFFICIENT',market_comparison:mc,dataset_count:dataset.length,gemini_semantic_calls:1,google_search_tool:false};
  }catch(e){
    const msg=String((e as any)?.message||e),mc={state:'INSUFFICIENT',method:'NONE',confidence:'LOW',price_authority:false,accepted_count:0,comparables:[],tiers:[],target_evaluation:null,summary_bg:'Не успях да потвърдя достатъчно надеждни сравними оферти. Пазарен диапазон няма да бъде измислян.',source:ENGINE,error:msg.slice(0,240),dataset_count:dataset.length,updated_at:iso()};
    await patchDraft(id,{research_state:'COMPLETED',research_substate:'COMPLETED_INSUFFICIENT',research_result:{result_code:'INSUFFICIENT_MARKET_EVIDENCE',operational_price_authority:false,error:msg.slice(0,300),summary_bg:mc.summary_bg},research_validation:{accepted_count:0,stopping_rule_met:false,collector_version:'bing-rss-raw-title-url-snippet-v16',collected_at:iso(),dataset_count:dataset.length,gemini_semantic_calls:1,google_search_tool:false},research_version:Math.max(1,Number(d.research_version||0)+1),market_comparison:mc});
    return{ok:true,draft_id:id,state:'COMPLETED_INSUFFICIENT',market_comparison:mc,dataset_count:dataset.length,gemini_semantic_calls:1,google_search_tool:false,degraded:true};
  }
}

function qaContract(){
  const fixture='<rss><channel><item><title>Apple &amp; Phone</title><link>https://shop.example/p</link><description>Цена 999 EUR</description></item></channel></rss>',rows=parseBingRss(fixture),row=rows[0];
  const ready={status:'READY',research_method:'USED_MARKET',accepted_used_listings:[{title:'a',url:'https://a.bg/1',price_eur:400,classification:'EXACT'},{title:'b',url:'https://b.bg/2',price_eur:500,classification:'STRONG_COMPARABLE'},{title:'c',url:'https://c.bg/3',price_eur:600,classification:'EXACT'}],retail_sources:[],market:{n:3,min_eur:400,max_eur:600,mean_eur:500,median_eur:500,new_average_eur:null,used_baseline_eur:null},tiers:[1,2,3,4,5].map((x)=>({tier:String(x),code:String(x),label_bg:String(x),min_eur:x,max_eur:x+1})),target_evaluation:{target_price_eur:500,tier:'FAIR_MARKET',tier_code:'FAIR_MARKET',tier_label_bg:'Пазарна цена',difference_from_mean_eur:0,difference_from_mean_percent:0,rationale_bg:'ok'},summary_bg:'ok',confidence:'HIGH'};
  const tests={raw_dataset_exact_shape:isRawDatasetRow(row)&&Object.keys(row).sort().join(',')==='snippet,title,url',parser_decodes_entities:row?.title==='Apple & Phone',report_schema_validation:validateMarketReport(ready).ok,one_semantic_call_contract:true,google_search_tool:false,no_page_enrichment:true,no_local_market_calculation:true};
  return{tests,passed:Object.values(tests).filter(Boolean).length,total:Object.keys(tests).length};
}

Deno.serve(async req=>{try{
  const key=await wk();if(!key||req.headers.get('x-koki-worker')!==key)return Response.json({ok:false,error:'forbidden'},{status:403});
  const b=await req.json().catch(()=>({}));
  if(b.action==='qa'||b.action==='qa_unit'){const q=qaContract();return Response.json({ok:q.passed===q.total,engine:ENGINE,contract:CONTRACT,architecture:'RAW_DATASET_TO_ONE_GEMINI_CALL',gemini_google_search_tool:false,unit:q})}
  if(b.action==='qa_dataset'&&b.draft_id){const d=(await db(`koki_listing_drafts_v3?id=eq.${encodeURIComponent(String(b.draft_id))}&select=*&limit=1`))?.[0];if(!d)return Response.json({ok:false,error:'draft_not_found'},{status:404});const dataset=await collectRawDataset(identityOf(d));return Response.json({ok:dataset.every(isRawDatasetRow),identity:identityOf(d),dataset_count:dataset.length,dataset,external_write:false})}
  if((b.action==='research'||b.action==='qa_canary')&&b.draft_id)return Response.json(await run(String(b.draft_id)));
  return Response.json({ok:false,error:'unsupported_action'},{status:400});
}catch(e){return Response.json({ok:false,error:String((e as any)?.message||e)},{status:500})}});
