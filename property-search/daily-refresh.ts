import { PropertySearchService } from './service.js';

const service = new PropertySearchService();
const startedAt = new Date().toISOString();

try {
  const runs = await service.refreshAllActive();
  const failed = runs.filter(r => !r.ok);
  console.log(JSON.stringify({
    ok: failed.length === 0,
    startedAt,
    finishedAt: new Date().toISOString(),
    searches: runs.length,
    failed: failed.length,
    runs,
  }));
  if (failed.length) process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    startedAt,
    finishedAt: new Date().toISOString(),
    error: error instanceof Error ? error.message : 'UNKNOWN_ERROR',
  }));
  process.exitCode = 1;
}
