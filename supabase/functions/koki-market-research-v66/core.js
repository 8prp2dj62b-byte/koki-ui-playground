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
