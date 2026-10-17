import path from 'node:path';
import { LibreDwg, Dwg_File_Type } from '@mlightcad/libredwg-web';

const SOURCE_URL = 'https://at.adobe.com/xvBYzpWVu1Glq0cC';
const SB = 'https://aqhdzfsspmuvadnlchvj.supabase.co';
const KEY = 'sb_publishable_WJ_rzmuZWm6fvNep3cUMlw_LD86ncn9';
const JOB = 'cad_15_axo_220826_v2';
const headers = { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'application/json', prefer: 'return=minimal' };

function p(v) { if (!v || typeof v !== 'object') return null; return { x:v.x ?? v[0] ?? null, y:v.y ?? v[1] ?? null, z:v.z ?? v[2] ?? null }; }
function vertices(v) { return Array.isArray(v) ? v.slice(0,10000).map(p) : null; }
async function insert(table, rows) {
  const r = await fetch(`${SB}/rest/v1/${table}`, {method:'POST',headers,body:JSON.stringify(rows)});
  if (!r.ok) throw new Error(`${table} ${r.status}: ${await r.text()}`);
}

const fr = await fetch(SOURCE_URL); if (!fr.ok) throw new Error(`download ${fr.status}`);
const ab = await fr.arrayBuffer();
const wasmPath = path.join(process.cwd(),'node_modules','@mlightcad','libredwg-web','wasm') + path.sep;
const lib = await LibreDwg.create(wasmPath);
const ptr = lib.dwg_read_data(ab,Dwg_File_Type.DWG); if (!ptr) throw new Error('DWG read returned null');
const version = lib.dwg_get_version_type(ptr); const codepage=lib.dwg_get_codepage(ptr);
const db = lib.convert(ptr);
const dbKeys = Object.keys(db ?? {});
const tableKeys = Object.keys(db?.tables ?? {});
const blocks = db?.tables?.blockRecords ?? [];
const layers = db?.tables?.layers ?? [];
const rows=[]; const typeCounts={};
for (const block of blocks) for (const e of (block?.entities ?? [])) {
  const type=String(e?.type ?? e?.objectType ?? e?.constructor?.name ?? 'UNKNOWN'); typeCounts[type]=(typeCounts[type]??0)+1;
  const layer=e?.layer?.name ?? e?.layerName ?? e?.layer ?? e?.common?.layer ?? null;
  const text=e?.text ?? e?.textValue ?? e?.string ?? e?.plainText ?? e?.contents ?? e?.value ?? null;
  rows.push({job_id:JOB,block_name:block?.name??null,entity_type:type,layer_name:typeof layer==='string'?layer:JSON.stringify(layer),text_value:text==null?null:String(text),geom:{start:p(e?.startPoint??e?.start),end:p(e?.endPoint??e?.end),center:p(e?.center),radius:e?.radius??null,length:e?.length??null,vertices:vertices(e?.vertices??e?.points),insertionPoint:p(e?.insertionPoint??e?.insert),blockName:e?.blockName??e?.name??null,rotation:e?.rotation??null,scale:e?.scale??null,keys:Object.keys(e??{}).slice(0,150)}});
}
for(let i=0;i<rows.length;i+=250) await insert('_tmp_cad_entity_220826',rows.slice(i,i+250));
await insert('_tmp_cad_meta_220826',[{job_id:JOB,payload:{sourceBytes:ab.byteLength,version,codepage,dbKeys,tableKeys,typeCounts,objectCount:db?.objects?.length??null,layers:layers.map(x=>({name:x?.name??null,color:x?.color??null,keys:Object.keys(x??{})})),blocks:blocks.map(x=>({name:x?.name??null,entityCount:x?.entities?.length??0,keys:Object.keys(x??{})})),entityRows:rows.length,headerKeys:Object.keys(db?.header??{}),classCount:db?.classes?.length??null}}]);
lib.dwg_free(ptr);
console.log(`CAD_V2_OK entities=${rows.length} dbKeys=${dbKeys} tableKeys=${tableKeys}`);
