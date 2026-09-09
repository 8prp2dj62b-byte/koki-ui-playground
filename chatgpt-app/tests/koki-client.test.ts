import assert from 'node:assert/strict';
import test from 'node:test';
import { KokiApiClient } from '../src/koki-client.js';

test('mock dashboard exposes KOKI operational state', async () => {
  const client = new KokiApiClient({ mockMode: true });
  const result = await client.action<any>('get_dashboard');
  assert.equal(result.ok, true);
  assert.ok(Array.isArray((result.data as any)?.activeOperations));
  assert.ok((result.data as any)?.counts?.decisions >= 0);
});

test('mock conversation keeps strategy and messages together', async () => {
  const client = new KokiApiClient({ mockMode: true });
  const result = await client.action<any>('get_conversation', { conversationId: 'conv-1' });
  assert.equal(result.ok, true);
  assert.equal((result.data as any)?.id, 'conv-1');
  assert.ok(Array.isArray((result.data as any)?.messages));
  assert.ok((result.data as any)?.strategy?.targetPrice);
});

test('mock property search returns source-shaped results', async () => {
  const client = new KokiApiClient({ mockMode: true });
  const result = await client.createPropertySearch('Тристаен в Банско до 140 000 евро');
  assert.equal(result.ok, true);
  const data = result.data as any;
  assert.equal(data?.search?.status, 'active');
  assert.ok(Array.isArray(data?.results));
  assert.equal(data?.results?.[0]?.state, 'NEW');
});

test('unconfigured production client fails closed', async () => {
  const oldBase = process.env.KOKI_API_BASE_URL;
  const oldMock = process.env.KOKI_MOCK_MODE;
  delete process.env.KOKI_API_BASE_URL;
  delete process.env.KOKI_MOCK_MODE;
  try {
    const client = new KokiApiClient({ baseUrl: '', mockMode: false, serviceToken: '' });
    const result = await client.action('send_message', { conversationId: 'x', text: 'hello' });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'KOKI_API_NOT_CONFIGURED');
  } finally {
    if (oldBase === undefined) delete process.env.KOKI_API_BASE_URL; else process.env.KOKI_API_BASE_URL = oldBase;
    if (oldMock === undefined) delete process.env.KOKI_MOCK_MODE; else process.env.KOKI_MOCK_MODE = oldMock;
  }
});
