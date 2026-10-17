import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import cors from 'cors';
import express from 'express';
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from '@modelcontextprotocol/ext-apps/server';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

import { KokiApiClient } from './koki-client.js';
import type { KokiActionResult, KokiView, KokiWidgetPayload } from './types.js';

const SERVER_VERSION = '0.1.0';
const WIDGET_URI = 'ui://koki/koki-app.html';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.resolve(ROOT_DIR, 'dist');
const PORT = finitePort(process.env.PORT, 8787);

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;
const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true, openWorldHint: false } as const;

function readWidgetHtml() {
  const file = path.resolve(DIST_DIR, 'index.html');
  if (!fs.existsSync(file)) {
    throw new Error(`KOKI widget build missing at ${file}. Run npm run build before npm start.`);
  }
  return fs.readFileSync(file, 'utf8');
}

function parseOrigins() {
  const candidates = [
    process.env.KOKI_API_BASE_URL,
    process.env.PUBLIC_BASE_URL,
    ...(process.env.KOKI_UPLOAD_ORIGINS || '').split(','),
  ];
  const origins = new Set<string>();
  for (const candidate of candidates) {
    const value = String(candidate || '').trim();
    if (!value) continue;
    try { origins.add(new URL(value).origin); } catch { /* ignore invalid optional origin */ }
  }
  return [...origins];
}

function payload(action: string, view: KokiView, data: unknown, title?: string): KokiWidgetPayload {
  return {
    app: 'koki', version: 1, action, view, title, data, generatedAt: new Date().toISOString(),
  };
}

function toolResult(action: string, view: KokiView, result: KokiActionResult, title?: string) {
  if (!result.ok) {
    const errorPayload = payload(action, 'error', {
      code: result.error || 'KOKI_ACTION_FAILED',
      status: result.status || 500,
      recoverable: (result.status || 500) >= 500,
      requestedView: view,
    }, title || 'Коки не успя да изпълни действието');
    return {
      isError: true as const,
      content: [{ type: 'text' as const, text: `${action} failed: ${result.error || 'KOKI_ACTION_FAILED'}` }],
      structuredContent: errorPayload as unknown as Record<string, unknown>,
    };
  }

  const okPayload = payload(action, view, result.data ?? {}, title);
  return {
    content: [{ type: 'text' as const, text: `KOKI ${action} completed. The interactive KOKI UI contains the current result and controls.` }],
    structuredContent: okPayload as unknown as Record<string, unknown>,
  };
}

type ToolSpec = {
  name: string;
  title: string;
  description: string;
  view: KokiView;
  inputSchema?: Record<string, z.ZodTypeAny>;
  annotations?: typeof READ_ONLY | typeof WRITE | typeof DESTRUCTIVE;
  action?: string;
};

function registerGeneric(server: McpServer, client: KokiApiClient, spec: ToolSpec) {
  registerAppTool(
    server,
    spec.name,
    {
      title: spec.title,
      description: spec.description,
      inputSchema: spec.inputSchema || {},
      annotations: spec.annotations || READ_ONLY,
      _meta: { ui: { resourceUri: WIDGET_URI } },
    },
    async (args) => {
      const result = await client.action(spec.action || spec.name, (args || {}) as Record<string, unknown>);
      return toolResult(spec.name, spec.view, result, spec.title);
    },
  );
}

function createKokiServer(requestAuthorization = '') {
  const client = new KokiApiClient({ requestBearer: requestAuthorization });
  const server = new McpServer({ name: 'koki', version: SERVER_VERSION });
  const connectDomains = parseOrigins();

  registerAppResource(
    server,
    'KOKI interactive application',
    WIDGET_URI,
    { description: 'Full KOKI frontend for ChatGPT', mimeType: RESOURCE_MIME_TYPE },
    async () => ({
      contents: [{
        uri: WIDGET_URI,
        mimeType: RESOURCE_MIME_TYPE,
        text: readWidgetHtml(),
        _meta: { ui: { csp: { connectDomains, resourceDomains: [] } } },
      }],
    }),
  );

  const genericTools: ToolSpec[] = [
    {
      name: 'open_koki', title: 'Отвори Коки', view: 'dashboard', annotations: READ_ONLY,
      description: 'Opens the KOKI application dashboard. Use when the user asks to open KOKI or wants an overview.',
      action: 'get_dashboard',
    },
    {
      name: 'get_dashboard', title: 'KOKI Dashboard', view: 'dashboard', annotations: READ_ONLY,
      description: 'Returns the KOKI dashboard: current autonomous activity, decisions, unread items and up to three recent active operations.',
    },
    {
      name: 'get_status', title: 'KOKI status', view: 'status', annotations: READ_ONLY,
      description: 'Returns operational health and integration status for KOKI.',
    },
    {
      name: 'list_buy', title: 'Купува', view: 'buy', annotations: READ_ONLY,
      description: 'Lists BUY operations and active purchase negotiations in KOKI.',
      inputSchema: { status: z.string().optional(), limit: z.number().int().min(1).max(100).optional() },
    },
    {
      name: 'list_sell', title: 'Продава', view: 'sell', annotations: READ_ONLY,
      description: 'Lists user SELL listings, drafts and active sale operations in KOKI.',
      inputSchema: { status: z.string().optional(), limit: z.number().int().min(1).max(100).optional() },
    },
    {
      name: 'get_listing', title: 'Обява', view: 'listing', annotations: READ_ONLY,
      description: 'Returns one KOKI listing with marketplace data, price analysis, strategy and conversation summary.',
      inputSchema: { listingId: z.string().min(1) },
    },
    {
      name: 'refresh_listings', title: 'Обнови обявите', view: 'sell', annotations: WRITE,
      description: 'Requests a manual marketplace refresh. It must not create or publish listings.',
      inputSchema: { direction: z.enum(['BUY', 'SELL']).optional(), marketplace: z.string().optional() },
    },
    {
      name: 'get_conversations', title: 'Разговори', view: 'conversations', annotations: READ_ONLY,
      description: 'Lists KOKI conversations with BUY/SELL classification, marketplace, unread state, latest message and automation state.',
      inputSchema: { direction: z.enum(['BUY', 'SELL']).optional(), unreadOnly: z.boolean().optional(), status: z.string().optional() },
    },
    {
      name: 'get_conversation', title: 'Разговор', view: 'conversation', annotations: READ_ONLY,
      description: 'Returns a full conversation, translations, strategy, offer state, temperature and KOKI automation ownership.',
      inputSchema: { conversationId: z.string().min(1) },
    },
    {
      name: 'refresh_conversation', title: 'Обнови разговора', view: 'conversation', annotations: WRITE,
      description: 'Manually refreshes one marketplace conversation without sending a message.',
      inputSchema: { conversationId: z.string().min(1) },
    },
    {
      name: 'send_message', title: 'Изпрати съобщение', view: 'conversation', annotations: WRITE,
      description: 'Sends a user-approved message to the marketplace conversation through the existing KOKI integration. Never use for drafting only.',
      inputSchema: { conversationId: z.string().min(1), text: z.string().min(1).max(5000) },
    },
    {
      name: 'start_negotiation', title: 'Стартирай Коки', view: 'conversation', annotations: WRITE,
      description: 'Starts KOKI autonomous negotiation for a conversation using the existing KOKI strategy engine.',
      inputSchema: { conversationId: z.string().min(1) },
    },
    {
      name: 'stop_negotiation', title: 'Спри Коки', view: 'conversation', annotations: WRITE,
      description: 'Persistently stops KOKI autonomous replies for the selected conversation.',
      inputSchema: { conversationId: z.string().min(1) },
    },
    {
      name: 'take_over_conversation', title: 'Поеми разговора', view: 'conversation', annotations: WRITE,
      description: 'Transfers conversation control from KOKI automation to the human owner.',
      inputSchema: { conversationId: z.string().min(1) },
    },
    {
      name: 'return_to_koki', title: 'Върни към Коки', view: 'conversation', annotations: WRITE,
      description: 'Returns a human-controlled conversation to KOKI automation under the existing strategy.',
      inputSchema: { conversationId: z.string().min(1) },
    },
    {
      name: 'archive_conversation', title: 'Архивирай разговора', view: 'conversations', annotations: DESTRUCTIVE,
      description: 'Archives a conversation and stops its automation while preserving history and audit context.',
      inputSchema: { conversationId: z.string().min(1) },
    },
    {
      name: 'get_decisions', title: 'За решение', view: 'decisions', annotations: READ_ONLY,
      description: 'Lists conversations and operations waiting for an explicit owner decision.',
    },
    {
      name: 'resolve_decision', title: 'Вземи решение', view: 'conversation', annotations: WRITE,
      description: 'Applies an explicit owner decision such as accept, counter, continue KOKI or archive.',
      inputSchema: {
        decisionId: z.string().min(1),
        decision: z.enum(['ACCEPT', 'COUNTER', 'CONTINUE_KOKI', 'ARCHIVE']),
        counterAmount: z.number().positive().optional(),
        note: z.string().max(2000).optional(),
      },
    },
    {
      name: 'list_property_searches', title: 'Търся', view: 'searches', annotations: READ_ONLY,
      description: 'Lists saved KOKI property search profiles and their new-result counts.',
    },
    {
      name: 'create_sell_draft', title: 'Нова продажба', view: 'sell-draft', annotations: WRITE,
      description: 'Creates a new empty SELL draft for OLX or Kleinanzeigen. It does not publish.',
      inputSchema: { marketplace: z.enum(['OLX', 'KLEINANZEIGEN']), text: z.string().optional(), condition: z.enum(['NEW', 'USED']).optional() },
    },
    {
      name: 'get_sell_draft', title: 'Чернова', view: 'sell-draft', annotations: READ_ONLY,
      description: 'Returns the current SELL draft, images, AI stages, category, market analysis and readiness state.',
      inputSchema: { draftId: z.string().min(1) },
    },
    {
      name: 'update_sell_draft', title: 'Промени чернова', view: 'sell-draft', annotations: WRITE,
      description: 'Updates owner-confirmed SELL draft fields without publishing.',
      inputSchema: { draftId: z.string().min(1), patch: z.record(z.unknown()) },
    },
    {
      name: 'prepare_sell_upload', title: 'Подготви снимки', view: 'sell-draft', annotations: WRITE,
      description: 'Creates temporary upload targets for up to five SELL images. It does not publish the listing.',
      inputSchema: { draftId: z.string().min(1), files: z.array(z.object({ name: z.string(), type: z.string(), size: z.number().int().positive() })).min(1).max(5) },
    },
    {
      name: 'analyze_sell_draft', title: 'Анализирай продукта', view: 'sell-draft', annotations: WRITE,
      description: 'Runs the existing KOKI AI-first product/category analysis for a SELL draft.',
      inputSchema: { draftId: z.string().min(1) },
    },
    {
      name: 'analyze_market', title: 'Анализирай цената', view: 'sell-draft', annotations: WRITE,
      description: 'Runs the existing KOKI market-price analysis and returns the five-tier price scale.',
      inputSchema: { draftId: z.string().min(1) },
    },
    {
      name: 'optimize_sell_draft', title: 'Оптимизирай обявата', view: 'sell-draft', annotations: WRITE,
      description: 'Generates separate KOKI title and description optimization proposals. It does not silently apply them.',
      inputSchema: { draftId: z.string().min(1), fields: z.array(z.enum(['TITLE', 'DESCRIPTION'])).default(['TITLE', 'DESCRIPTION']) },
    },
    {
      name: 'validate_sell_draft', title: 'Провери обявата', view: 'sell-draft', annotations: READ_ONLY,
      description: 'Validates current category, required marketplace attributes, review version and publish readiness.',
      inputSchema: { draftId: z.string().min(1) },
    },
    {
      name: 'publish_sell_draft', title: 'Публикувай обявата', view: 'sell-draft', annotations: WRITE,
      description: 'Publishes a reviewed SELL draft through the existing KOKI marketplace client. Requires explicit user intent to publish.',
      inputSchema: { draftId: z.string().min(1), reviewVersion: z.number().int().positive().optional() },
    },
    {
      name: 'delete_sell_draft', title: 'Изтрий черновата', view: 'sell', annotations: DESTRUCTIVE,
      description: 'Permanently deletes a SELL draft. Never call without explicit user intent.',
      inputSchema: { draftId: z.string().min(1) },
    },
    {
      name: 'get_notifications', title: 'Известия', view: 'notifications', annotations: READ_ONLY,
      description: 'Returns KOKI notifications and unread state.',
      inputSchema: { unreadOnly: z.boolean().optional(), limit: z.number().int().min(1).max(100).optional() },
    },
    {
      name: 'mark_notifications_read', title: 'Маркирай като прочетено', view: 'notifications', annotations: WRITE,
      description: 'Marks selected or all KOKI notifications as read idempotently.',
      inputSchema: { ids: z.array(z.string()).optional(), all: z.boolean().optional() },
    },
    {
      name: 'get_profile', title: 'Профил', view: 'profile', annotations: READ_ONLY,
      description: 'Returns the KOKI user profile and connected marketplace profile summaries.',
    },
    {
      name: 'update_profile', title: 'Промени профила', view: 'profile', annotations: WRITE,
      description: 'Updates KOKI-owned editable profile fields. Externally owned marketplace fields remain read-only.',
      inputSchema: { patch: z.record(z.unknown()) },
    },
    {
      name: 'get_connections', title: 'Свързани платформи', view: 'profile', annotations: READ_ONLY,
      description: 'Returns OLX and Kleinanzeigen connection status without exposing credentials.',
    },
    {
      name: 'connect_marketplace', title: 'Свържи платформа', view: 'profile', annotations: WRITE,
      description: 'Starts the existing KOKI marketplace connection flow and returns an authorization URL/state.',
      inputSchema: { marketplace: z.enum(['OLX', 'KLEINANZEIGEN']) },
    },
    {
      name: 'disconnect_marketplace', title: 'Откачи платформа', view: 'profile', annotations: DESTRUCTIVE,
      description: 'Disconnects a marketplace from KOKI without deleting KOKI history. Requires explicit intent.',
      inputSchema: { marketplace: z.enum(['OLX', 'KLEINANZEIGEN']) },
    },
    {
      name: 'get_settings', title: 'Настройки', view: 'settings', annotations: READ_ONLY,
      description: 'Returns KOKI automation and notification settings.',
    },
    {
      name: 'update_settings', title: 'Промени настройки', view: 'settings', annotations: WRITE,
      description: 'Updates KOKI user settings but cannot override hard safety/risk controls.',
      inputSchema: { patch: z.record(z.unknown()) },
    },
  ];

  for (const spec of genericTools) registerGeneric(server, client, spec);

  // Existing imot.bg module contract: Human language -> Gemini strict request ->
  // KOKI imot client -> source-backed results. No model-created listings.
  registerAppTool(server, 'create_property_search', {
    title: 'Ново търсене на имот',
    description: 'Creates a KOKI imot.bg search from Bulgarian natural language using the existing Gemini compiler. Returns only source-backed results.',
    inputSchema: { text: z.string().min(2).max(5000), title: z.string().max(200).optional() },
    annotations: WRITE,
    _meta: { ui: { resourceUri: WIDGET_URI } },
  }, async ({ text, title }) => toolResult('create_property_search', 'search-results', await client.createPropertySearch(text, title), 'Търсене на имот'));

  registerAppTool(server, 'get_property_search', {
    title: 'Търсене на имот', description: 'Returns one saved property search profile.',
    inputSchema: { searchId: z.string().min(1) }, annotations: READ_ONLY,
    _meta: { ui: { resourceUri: WIDGET_URI } },
  }, async ({ searchId }) => toolResult('get_property_search', 'search-results', await client.getPropertySearch(searchId), 'Търсене на имот'));

  registerAppTool(server, 'get_property_results', {
    title: 'Резултати от имоти', description: 'Returns the currently verified imot.bg results for a saved search.',
    inputSchema: { searchId: z.string().min(1) }, annotations: READ_ONLY,
    _meta: { ui: { resourceUri: WIDGET_URI } },
  }, async ({ searchId }) => toolResult('get_property_results', 'search-results', await client.getPropertyResults(searchId), 'Резултати'));

  registerAppTool(server, 'refresh_property_search', {
    title: 'Обнови търсенето', description: 'Refreshes an active imot.bg search and reconciles new/changed source listings.',
    inputSchema: { searchId: z.string().min(1) }, annotations: WRITE,
    _meta: { ui: { resourceUri: WIDGET_URI } },
  }, async ({ searchId }) => toolResult('refresh_property_search', 'search-results', await client.refreshPropertySearch(searchId), 'Обновено търсене'));

  registerAppTool(server, 'add_property_criterion', {
    title: 'Добави критерий', description: 'Adds natural-language criteria to an existing property search using the current strict Gemini compiler.',
    inputSchema: { searchId: z.string().min(1), text: z.string().min(1).max(3000) }, annotations: WRITE,
    _meta: { ui: { resourceUri: WIDGET_URI } },
  }, async ({ searchId, text }) => toolResult('add_property_criterion', 'search-results', await client.addPropertyCriterion(searchId, text), 'Обновени критерии'));

  registerAppTool(server, 'set_property_search_status', {
    title: 'Статус на търсенето', description: 'Pauses, resumes or archives a property search.',
    inputSchema: { searchId: z.string().min(1), status: z.enum(['active', 'paused', 'archived']) }, annotations: WRITE,
    _meta: { ui: { resourceUri: WIDGET_URI } },
  }, async ({ searchId, status }) => toolResult('set_property_search_status', 'search-results', await client.setPropertySearchStatus(searchId, status), 'Статус на търсенето'));

  registerAppTool(server, 'set_property_result_state', {
    title: 'Състояние на резултат', description: 'Marks a real imot.bg result as seen, saved or dismissed.',
    inputSchema: { searchId: z.string().min(1), listingId: z.string().min(1), state: z.enum(['SEEN', 'SAVED', 'DISMISSED']) }, annotations: WRITE,
    _meta: { ui: { resourceUri: WIDGET_URI } },
  }, async ({ searchId, listingId, state }) => toolResult('set_property_result_state', 'search-results', await client.setPropertyResultState(searchId, listingId, state), 'Резултат'));

  return server;
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.post('/mcp', async (req, res) => {
  const server = createKokiServer(String(req.headers.authorization || ''));
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on('close', () => transport.close());
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.get('/mcp', async (req, res) => {
  const server = createKokiServer(String(req.headers.authorization || ''));
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on('close', () => transport.close());
  await server.connect(transport);
  await transport.handleRequest(req, res);
});

app.delete('/mcp', (_req, res) => res.status(405).end());

app.get('/health', async (req, res) => {
  const client = new KokiApiClient({ requestBearer: String(req.headers.authorization || '') });
  const upstream = await client.health();
  res.status(upstream.ok ? 200 : 503).json({
    ok: upstream.ok,
    service: 'koki-chatgpt-app',
    version: SERVER_VERSION,
    widgetBuilt: fs.existsSync(path.resolve(DIST_DIR, 'index.html')),
    upstreamConfigured: client.isConfigured(),
    upstream: upstream.ok ? upstream.data : { error: upstream.error },
  });
});

app.listen(PORT, () => {
  console.log(`KOKI ChatGPT App listening on http://localhost:${PORT}`);
  console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
});

function finitePort(value: string | undefined, fallback: number) {
  const n = Number(value || fallback);
  return Number.isFinite(n) && n > 0 && n < 65536 ? n : fallback;
}
