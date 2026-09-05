import path from 'node:path';
import { LibreDwg, Dwg_File_Type } from '@mlightcad/libredwg-web';

const SOURCE_URL = 'https://at.adobe.com/xvBYzpWVu1Glq0cC';
const SB = 'https://aqhdzfsspmuvadnlchvj.supabase.co';
const KEY = 'sb_publishable_WJ_rzmuZWm6fvNep3cUMlw_LD86ncn9';
const JOB = 'cad_15_axo_220826';

const headers = {
  apikey: KEY,
  authorization: `Bearer ${KEY}`,
  'content-type': 'application/json',
  prefer: 'return=minimal',
};

function point(p) {
  if (!p || typeof p !== 'object') return null;
  return { x: p.x ?? p[0] ?? null, y: p.y ?? p[1] ?? null, z: p.z ?? p[2] ?? null };
}

function cleanVertices(v) {
  if (!Array.isArray(v)) return null;
  return v.slice(0, 10000).map(point);
}

async function insert(table, rows) {
  const r = await fetch(`${SB}/rest/v1/${table}`, { method: 'POST', headers, body: JSON.stringify(rows) });
  if (!r.ok) throw new Error(`${table} insert ${r.status}: ${await r.text()}`);
}

const fileResp = await fetch(SOURCE_URL);
if (!fileResp.ok) throw new Error(`DWG download failed ${fileResp.status}`);
const fileContent = await fileResp.arrayBuffer();
console.log(`DWG bytes=${fileContent.byteLength}`);

const wasmPath = path.join(process.cwd(), 'node_modules', '@mlightcad', 'libredwg-web', 'wasm') + path.sep;
const libredwg = await LibreDwg.create(wasmPath);
const dwg = libredwg.dwg_read_data(fileContent, Dwg_File_Type.DWG);
if (!dwg) throw new Error('DWG read returned null');
const version = libredwg.dwg_get_version_type(dwg);
const codepage = libredwg.dwg_get_codepage(dwg);
const result = typeof libredwg.convertEx === 'function' ? libredwg.convertEx(dwg) : { database: libredwg.convert(dwg), stats: null };
const db = result.database;
const blocks = db?.tables?.blockRecords ?? [];
const layers = db?.tables?.layers ?? [];

const typeCounts = {};
const rows = [];
for (const block of blocks) {
  for (const e of block?.entities ?? []) {
    const type = String(e?.type ?? e?.objectType ?? e?.constructor?.name ?? 'UNKNOWN');
    typeCounts[type] = (typeCounts[type] ?? 0) + 1;
    const layer = e?.layer?.name ?? e?.layerName ?? e?.layer ?? e?.common?.layer ?? null;
    const text = e?.text ?? e?.textValue ?? e?.string ?? e?.plainText ?? e?.contents ?? e?.value ?? null;
    const geom = {
      start: point(e?.startPoint ?? e?.start),
      end: point(e?.endPoint ?? e?.end),
      center: point(e?.center),
      radius: e?.radius ?? null,
      length: e?.length ?? null,
      vertices: cleanVertices(e?.vertices ?? e?.points),
      insertionPoint: point(e?.insertionPoint ?? e?.insert),
      blockName: e?.blockName ?? e?.name ?? null,
      rotation: e?.rotation ?? null,
      scale: e?.scale ?? null,
      keys: Object.keys(e ?? {}).slice(0, 120),
    };
    rows.push({
      job_id: JOB,
      block_name: block?.name ?? null,
      entity_type: type,
      layer_name: typeof layer === 'string' ? layer : JSON.stringify(layer),
      text_value: text == null ? null : String(text),
      geom,
    });
  }
}

await fetch(`${SB}/rest/v1/_tmp_cad_entity_220826?job_id=eq.${JOB}`, { method: 'DELETE', headers });
await fetch(`${SB}/rest/v1/_tmp_cad_meta_220826?job_id=eq.${JOB}`, { method: 'DELETE', headers });

for (let i = 0; i < rows.length; i += 250) await insert('_tmp_cad_entity_220826', rows.slice(i, i + 250));
const meta = [{
  job_id: JOB,
  payload: {
    sourceBytes: fileContent.byteLength,
    version,
    codepage,
    stats: result.stats ?? null,
    typeCounts,
    objectCount: db?.objects?.length ?? 0,
    layers: layers.map(x => ({ name: x?.name ?? null, color: x?.color ?? null, flags: x?.flags ?? null })),
    blocks: blocks.map(x => ({ name: x?.name ?? null, entityCount: x?.entities?.length ?? 0 })),
    entityRows: rows.length,
  },
}];
await insert('_tmp_cad_meta_220826', meta);
libredwg.dwg_free(dwg);
console.log(`CAD_ANALYSIS_OK entities=${rows.length} types=${JSON.stringify(typeCounts)}`);
