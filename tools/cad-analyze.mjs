import fs from 'node:fs/promises';
import path from 'node:path';
import { LibreDwg, Dwg_File_Type } from '@mlightcad/libredwg-web';

const src = process.argv[2] || 'input.dwg';
const out = process.argv[3] || 'cad-summary.json';
const buf = await fs.readFile(src);
const wasmPath = path.join(process.cwd(), 'node_modules', '@mlightcad', 'libredwg-web', 'wasm') + path.sep;
const libredwg = await LibreDwg.create(wasmPath);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const dwg = libredwg.dwg_read_data(ab, Dwg_File_Type.DWG);
if (!dwg) throw new Error('DWG read returned null');
const version = libredwg.dwg_get_version_type(dwg);
const codepage = libredwg.dwg_get_codepage(dwg);
const result = typeof libredwg.convertEx === 'function' ? libredwg.convertEx(dwg) : { database: libredwg.convert(dwg), stats: null };
const db = result.database;
const blocks = db?.tables?.blockRecords ?? [];
const layers = db?.tables?.layers ?? [];
const typeCounts = {};
const texts = [];
const entities = [];
for (const block of blocks) {
  for (const e of block?.entities ?? []) {
    const type = String(e?.type ?? e?.name ?? e?.objectType ?? e?.constructor?.name ?? 'UNKNOWN');
    typeCounts[type] = (typeCounts[type] ?? 0) + 1;
    const layer = e?.layer ?? e?.layerName ?? e?.common?.layer ?? null;
    const text = e?.text ?? e?.textValue ?? e?.string ?? e?.plainText ?? e?.contents ?? null;
    if (text && texts.length < 50000) texts.push({ block: block?.name, type, layer, text });
    if (entities.length < 120000) entities.push({
      block: block?.name,
      type,
      layer,
      start: e?.startPoint ?? e?.start ?? null,
      end: e?.endPoint ?? e?.end ?? null,
      center: e?.center ?? null,
      radius: e?.radius ?? null,
      vertices: e?.vertices ?? e?.points ?? null,
      insertionPoint: e?.insertionPoint ?? e?.insert ?? null,
      blockName: e?.blockName ?? e?.name ?? null,
      text,
    });
  }
}
const summary = {
  ok: true,
  sourceBytes: buf.length,
  version,
  codepage,
  stats: result.stats,
  layers: layers.map(x => ({ name: x?.name, color: x?.color, flags: x?.flags })),
  blocks: blocks.map(x => ({ name: x?.name, entityCount: x?.entities?.length ?? 0 })),
  entityTypeCounts: typeCounts,
  objectCount: db?.objects?.length ?? 0,
  texts,
  entities,
};
await fs.writeFile(out, JSON.stringify(summary));
libredwg.dwg_free(dwg);
console.log(JSON.stringify({ ok: true, bytes: buf.length, layers: summary.layers.length, blocks: summary.blocks.length, entityTypes: typeCounts, texts: texts.length, entities: entities.length }));
