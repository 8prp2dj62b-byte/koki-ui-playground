import { PropertySearchService } from './service.js';

export function createPropertySearchHttpHandler(service: PropertySearchService) {
  return async function handle(req: Request): Promise<Response> {
    try {
      const url = new URL(req.url);
      const path = url.pathname.replace(/\/+$/, '');
      const base = '/api/property-search';
      if (!path.startsWith(base)) return json({ ok: false, error: 'NOT_FOUND' }, 404);

      if (req.method === 'GET' && path === `${base}/health`) {
        return json({ ok: true, module: 'property-search', source: 'imot.bg' });
      }

      if (req.method === 'POST' && path === `${base}/searches`) {
        const body = await readJson(req);
        const result = await service.createSearch({
          text: requiredString(body.text, 'SEARCH_TEXT_REQUIRED'),
          title: optionalString(body.title),
        });
        return json({ ok: true, ...result }, 201);
      }

      const match = path.match(/^\/api\/property-search\/searches\/([^/]+)(?:\/(.*))?$/);
      if (!match) return json({ ok: false, error: 'NOT_FOUND' }, 404);
      const searchId = decodeURIComponent(match[1]);
      const tail = match[2] || '';

      if (req.method === 'GET' && tail === '') {
        return json({ ok: true, search: service.getSearch(searchId) });
      }
      if (req.method === 'GET' && tail === 'results') {
        return json({ ok: true, results: service.listResults(searchId) });
      }
      if (req.method === 'POST' && tail === 'refresh') {
        return json({ ok: true, ...(await service.refreshSearch(searchId)) });
      }
      if (req.method === 'POST' && tail === 'criteria') {
        const body = await readJson(req);
        const result = await service.addCriterion(searchId, requiredString(body.text, 'CRITERION_TEXT_REQUIRED'));
        return json({ ok: true, ...result });
      }
      if (req.method === 'PATCH' && tail === 'status') {
        const body = await readJson(req);
        if (!['active','paused','archived'].includes(body.status)) throw new Error('INVALID_SEARCH_STATUS');
        return json({ ok: true, search: service.setSearchStatus(searchId, body.status) });
      }

      const resultMatch = tail.match(/^results\/([^/]+)$/);
      if (req.method === 'PATCH' && resultMatch) {
        const body = await readJson(req);
        if (!['SEEN','SAVED','DISMISSED'].includes(body.state)) throw new Error('INVALID_RESULT_STATE');
        const listingId = decodeURIComponent(resultMatch[1]);
        return json({ ok: true, results: service.setResultState(searchId, listingId, body.state) });
      }

      return json({ ok: false, error: 'NOT_FOUND' }, 404);
    } catch (error) {
      const code = error instanceof Error ? error.message : 'UNKNOWN_ERROR';
      const status = code === 'SEARCH_NOT_FOUND' ? 404
        : code.includes('REQUIRED') || code.startsWith('INVALID_') ? 400
        : code === 'IMOT_RATE_LIMITED' ? 429
        : code.startsWith('GEMINI_') || code.startsWith('IMOT_') ? 502
        : 500;
      return json({ ok: false, error: code }, status);
    }
  };
}

async function readJson(req: Request): Promise<any> {
  const type = req.headers.get('content-type') || '';
  if (!type.includes('application/json')) throw new Error('INVALID_CONTENT_TYPE');
  return await req.json();
}

function requiredString(value: unknown, error: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(error);
  return value.trim();
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
    },
  });
}
