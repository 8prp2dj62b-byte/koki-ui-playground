export function stable(v){
  if(v===null||typeof v!=='object')return JSON.stringify(v);
  if(Array.isArray(v))return '['+v.map(stable).join(',')+']';
  return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';
}

export function isCatalogicDescription(desc=''){
  const s=String(desc||'').trim();
  const bullets=(s.match(/(^|\n)\s*[-•]\s+/g)||[]).length;
  const labels=(s.match(/(^|\n)\s*[-•]?\s*(марка|модел|памет|състояние|цвят|батерия)\s*:/gi)||[]).length;
  return /основни\s+характеристики\s*:/i.test(s)||bullets>=3||labels>=3;
}

export function marketingQuality(desc=''){
  const s=String(desc||'').trim(),reasons=[];
  if(s.length<80)reasons.push('DESCRIPTION_TOO_SHORT');
  if(isCatalogicDescription(s))reasons.push('FACT_LIST_STYLE');
  if(/като нов|перфектн|без забележк|гаранци|оригинал|100% изправ|готов[а-я\s]*за употреба|надеждн[а-я]*\s+(?:устройство|телефон|продукт)|доказан(?:ото|о)?\s+качество/i.test(s))reasons.push('UNSUPPORTED_SALES_CLAIM_RISK');
  return{valid:reasons.length===0,reasons};
}

export function attrsFromObject(src={}){
  return Object.entries(src||{}).flatMap(([code,value])=>value==null||value===''?[]:Array.isArray(value)?[{code,values:value.map(String)}]:[{code,value:String(value)}]);
}

export function buildOfficialPayload(d,ctx=d.publish_context||{}){
  const contact={name:ctx?.contact?.name};if(ctx?.contact?.phone)contact.phone=String(ctx.contact.phone);
  const location={city_id:Number(ctx?.location?.city_id)};if(ctx?.location?.district_id)location.district_id=Number(ctx.location.district_id);
  return{title:String(d?.listing_content?.title||'').replace(/\s+/g,' ').trim(),description:String(d?.listing_content?.description||'').trim(),category_id:Number(d?.category?.id),advertiser_type:ctx?.advertiser_type,external_id:`koki-${String(d?.id||'').replace(/-/g,'').slice(0,27)}`,contact,location,images:(d?.media||[]).slice().sort((a,b)=>Number(a.order||0)-Number(b.order||0)).map(m=>({url:m.url})),price:{value:Number(d?.owner_desired_price_eur),currency:'EUR',negotiable:ctx?.negotiable!==false,trade:false,budget:false},attributes:attrsFromObject(d?.listing_content?.attributes||{})};
}

export function optionalMarket(m){
  return m&&m.state==='READY'&&Number.isFinite(Number(m.range_low_eur))&&Number.isFinite(Number(m.range_high_eur))?m:null;
}
