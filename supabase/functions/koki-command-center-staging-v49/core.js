export function decodeEntities(s=''){
  return String(s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1')
    .replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'")
    .replace(/&lt;/g,'<').replace(/&gt;/g,'>')
    .replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)))
    .replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
}

export function parseBingRss(xml=''){
  const out=[];
  const itemRe=/<item>([\s\S]*?)<\/item>/gi;
  const tag=(chunk,name)=>{
    const m=chunk.match(new RegExp(`<${name}>([\\s\\S]*?)<\\/${name}>`,'i'));
    return m?decodeEntities(m[1]):'';
  };
  let m;
  while((m=itemRe.exec(String(xml)))&&out.length<20){
    const title=tag(m[1],'title'),url=tag(m[1],'link'),snippet=tag(m[1],'description');
    if(/^https?:\/\//i.test(url)&&title) out.push({title,url,snippet});
  }
  return out;
}

export function isRawDatasetRow(x){
  if(!x||typeof x!=='object'||Array.isArray(x)) return false;
  const keys=Object.keys(x).sort();
  return keys.length===3&&keys[0]==='snippet'&&keys[1]==='title'&&keys[2]==='url'&&typeof x.title==='string'&&typeof x.url==='string'&&typeof x.snippet==='string'&&/^https?:\/\//i.test(x.url);
}

function domainOf(url){try{return new URL(String(url)).hostname.replace(/^www\./,'').toLowerCase()}catch{return''}}

export function validateMarketReport(r){
  if(!r||!['READY','INSUFFICIENT'].includes(r.status)) return {ok:false,reason:'STATUS'};
  if(r.status==='INSUFFICIENT') return {ok:r.research_method==='NONE',reason:r.research_method==='NONE'?'OK':'INSUFFICIENT_METHOD'};
  if(!['USED_MARKET','NEW_RETAIL_FALLBACK'].includes(r.research_method)) return {ok:false,reason:'METHOD'};
  const m=r.market||{};
  if(![m.min_eur,m.max_eur,m.mean_eur,m.median_eur].every(Number.isFinite)) return {ok:false,reason:'MARKET_NUMBERS'};
  if(!Array.isArray(r.tiers)||r.tiers.length!==5) return {ok:false,reason:'TIERS'};
  if(!r.target_evaluation||!Number.isFinite(Number(r.target_evaluation.target_price_eur))) return {ok:false,reason:'TARGET'};
  if(r.research_method==='USED_MARKET'){
    const a=Array.isArray(r.accepted_used_listings)?r.accepted_used_listings:[];
    const seen=new Set();
    for(const x of a){
      if(!['EXACT','STRONG_COMPARABLE'].includes(x?.classification)||!(Number(x?.price_eur)>0)||!/^https?:\/\//i.test(String(x?.url||''))) return {ok:false,reason:'USED_ITEM'};
      const u=String(x.url).replace(/[?#].*$/,'').replace(/\/$/,'');
      if(seen.has(u)) return {ok:false,reason:'USED_DUP'};
      seen.add(u);
    }
    return {ok:a.length>=3,reason:a.length>=3?'OK':'USED_LT3'};
  }
  const a=Array.isArray(r.retail_sources)?r.retail_sources:[],domains=new Set();
  for(const x of a){
    const d=domainOf(x?.url);
    if(!d||!(Number(x?.price_eur)>0)||!/^https?:\/\//i.test(String(x?.url||''))) return {ok:false,reason:'RETAIL_ITEM'};
    domains.add(d);
  }
  return {ok:a.length>=3&&domains.size>=3,reason:a.length>=3&&domains.size>=3?'OK':'RETAIL_LT3_DOMAINS'};
}
