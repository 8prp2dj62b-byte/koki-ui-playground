import path from 'node:path';
import { LibreDwg, Dwg_File_Type } from '@mlightcad/libredwg-web';

function summarizeDb(db) {
  const blockRecords = db?.tables?.blockRecords ?? [];
  const layers = db?.tables?.layers ?? [];
  const entityTypeCounts = {};
  const texts = [];
  const entities = [];
  for (const block of blockRecords) {
    for (const e of block?.entities ?? []) {
      const type = String(e?.type ?? e?.name ?? e?.objectType ?? e?.constructor?.name ?? 'UNKNOWN');
      entityTypeCounts[type] = (entityTypeCounts[type] ?? 0) + 1;
      const layer = e?.layer ?? e?.layerName ?? e?.common?.layer ?? null;
      const text = e?.text ?? e?.textValue ?? e?.string ?? e?.plainText ?? e?.contents ?? null;
      if (text && texts.length < 30000) texts.push({ block: block?.name, type, layer, text });
      if (entities.length < 80000) entities.push({
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
  return {
    header: db?.header ?? null,
    layers: layers.map(x => ({ name: x?.name, color: x?.color, flags: x?.flags })),
    blocks: blockRecords.map(x => ({ name: x?.name, entityCount: x?.entities?.length ?? 0 })),
    entityTypeCounts,
    texts,
    entities,
    objectCount: db?.objects?.length ?? 0,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const sourceUrl = String(req.body?.sourceUrl ?? '');
    if (!sourceUrl.startsWith('https://')) return res.status(400).json({ error: 'sourceUrl required' });
    const fileResp = await fetch(sourceUrl);
    if (!fileResp.ok) return res.status(502).json({ error: 'source fetch failed', status: fileResp.status });
    const fileContent = await fileResp.arrayBuffer();

    const wasmPath = path.join(process.cwd(), 'node_modules', '@mlightcad', 'libredwg-web', 'wasm') + path.sep;
    const libredwg = await LibreDwg.create(wasmPath);
    const dwg = libredwg.dwg_read_data(fileContent, Dwg_File_Type.DWG);
    if (!dwg) return res.status(422).json({ error: 'DWG read returned null' });
    const version = libredwg.dwg_get_version_type(dwg);
    const codepage = libredwg.dwg_get_codepage(dwg);
    const result = typeof libredwg.convertEx === 'function' ? libredwg.convertEx(dwg) : { database: libredwg.convert(dwg), stats: null };
    const summary = summarizeDb(result.database);
    libredwg.dwg_free(dwg);
    return res.status(200).json({ ok: true, bytes: fileContent.byteLength, version, codepage, stats: result.stats, summary });
  } catch (e) {
    return res.status(500).json({ error: String(e), stack: e?.stack ?? null });
  }
}
