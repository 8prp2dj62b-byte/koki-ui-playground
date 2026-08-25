export function stable(v){
  if(v===null||typeof v!=='object') return JSON.stringify(v);
  if(Array.isArray(v)) return '['+v.map(stable).join(',')+']';
  return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';
}

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

export function attrsFromObject(src={}){
  return Object.entries(src||{}).flatMap(([code,value])=>{
    if(value==null||value==='') return [];
    return Array.isArray(value)?[{code,values:value.map(String)}]:[{code,value:String(value)}];
  });
}

export function isCatalogicDescription(desc=''){
  const s=String(desc||'').trim();
  const bullets=(s.match(/(^|\n)\s*[-•]\s+/g)||[]).length;
  const catalogHeader=/основни\s+характеристики\s*:/i.test(s);
  const factLabels=(s.match(/(^|\n)\s*[-•]?\s*(марка|модел|вътрешна памет|памет|състояние|цвят|батерия)\s*:/gi)||[]).length;
  return catalogHeader||bullets>=3||factLabels>=3;
}

export function marketingQuality(desc=''){
  const s=String(desc||'').trim();
  const reasons=[];
  if(s.length<90) reasons.push('DESCRIPTION_TOO_SHORT');
  if(isCatalogicDescription(s)) reasons.push('FACT_LIST_STYLE');
  if(/като нов|перфектн|без забележк|гаранци|оригинал|100% изправ/i.test(s)) reasons.push('UNSUPPORTED_SALES_CLAIM_RISK');
  return {valid:reasons.length===0,reasons};
}

export function buildOfficialPayload(d,ctx=d.publish_context||{}){
  const contact={name:ctx?.contact?.name};
  if(ctx?.contact?.phone) contact.phone=String(ctx.contact.phone);
  const location={city_id:Number(ctx?.location?.city_id)};
  if(ctx?.location?.district_id) location.district_id=Number(ctx.location.district_id);
  return {
    title:String(d?.listing_content?.title||'').replace(/\s+/g,' ').trim(),
    description:String(d?.listing_content?.description||'').replace(/\s+/g,' ').trim(),
    category_id:Number(d?.category?.id), advertiser_type:ctx?.advertiser_type,
    external_id:`koki-${String(d?.id||'').replace(/-/g,'').slice(0,27)}`,
    contact, location,
    images:(d?.media||[]).slice().sort((a,b)=>Number(a.order||0)-Number(b.order||0)).map(m=>({url:m.url})),
    price:{value:Number(d?.owner_desired_price_eur),currency:'EUR',negotiable:ctx?.negotiable!==false,trade:false,budget:false},
    attributes:attrsFromObject(d?.listing_content?.attributes||{})
  };
}

export function reviewVisibility(finalizationState,researchSubstate){
  if(finalizationState==='DONE'&&['COMPLETED_OK','COMPLETED_INSUFFICIENT'].includes(String(researchSubstate))) return 'REVIEW_READY';
  if(finalizationState==='FAILED_RETRYABLE') return 'FAILED_RETRYABLE';
  return 'FINALIZING_REVIEW';
}

export function normalizeMarketForReview(m={}){
  if(m?.state==='READY') return m;
  if(m?.state==='INSUFFICIENT') return {...m,state:'INSUFFICIENT',summary_bg:m.summary_bg||'Не намерих достатъчно надеждни сравними оферти за коректен пазарен диапазон.'};
  return {...m,state:'INSUFFICIENT',confidence:'LOW',price_authority:false,comparables:[],summary_bg:'Не намерих достатъчно надеждни сравними оферти за коректен пазарен диапазон.'};
}
