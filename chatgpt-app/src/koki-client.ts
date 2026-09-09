import type { KokiActionResult } from './types.js';

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

interface KokiClientOptions {
  baseUrl?: string;
  requestBearer?: string;
  serviceToken?: string;
  ownerKey?: string;
  timeoutMs?: number;
  mockMode?: boolean;
}

export class KokiApiClient {
  private readonly baseUrl: string;
  private readonly bearer: string;
  private readonly ownerKey: string;
  private readonly timeoutMs: number;
  private readonly mockMode: boolean;

  constructor(options: KokiClientOptions = {}) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl || process.env.KOKI_API_BASE_URL || '');
    this.bearer = extractBearer(options.requestBearer || '') || String(options.serviceToken || process.env.KOKI_SERVICE_TOKEN || '').trim();
    this.ownerKey = String(options.ownerKey || process.env.KOKI_OWNER_KEY || '').trim();
    this.timeoutMs = options.timeoutMs || Number(process.env.KOKI_API_TIMEOUT_MS || 20_000);
    this.mockMode = options.mockMode ?? process.env.KOKI_MOCK_MODE === '1';
  }

  isConfigured() {
    return Boolean(this.baseUrl) || this.mockMode;
  }

  async health(): Promise<KokiActionResult> {
    if (this.mockMode) return { ok: true, data: { status: 'mock', source: 'KOKI_MOCK_MODE' } };
    if (!this.baseUrl) return { ok: false, error: 'KOKI_API_NOT_CONFIGURED', status: 503 };
    return this.request('GET', '/health');
  }

  /**
   * Stable ChatGPT adapter contract. The plugin never calls marketplace APIs
   * directly and never embeds KOKI business logic. KOKI backend owns action
   * semantics and returns the same domain state used by the PWA.
   */
  async action<T = unknown>(name: string, args: Record<string, unknown> = {}): Promise<KokiActionResult<T>> {
    if (this.mockMode) return this.mockAction(name, args) as KokiActionResult<T>;
    if (!this.baseUrl) return { ok: false, error: 'KOKI_API_NOT_CONFIGURED', status: 503 };
    return this.request<T>('POST', '/api/chatgpt/v1/actions', { action: name, arguments: args });
  }

  // imot.bg property-search module already has a concrete HTTP contract in
  // this repository. These methods preserve that contract 1:1.
  async createPropertySearch(text: string, title?: string) {
    if (this.mockMode) return this.mockAction('create_property_search', { text, title });
    return this.request('POST', '/api/property-search/searches', { text, title });
  }

  async getPropertySearch(searchId: string) {
    if (this.mockMode) return this.mockAction('get_property_search', { searchId });
    return this.request('GET', `/api/property-search/searches/${encodeURIComponent(searchId)}`);
  }

  async getPropertyResults(searchId: string) {
    if (this.mockMode) return this.mockAction('get_property_results', { searchId });
    return this.request('GET', `/api/property-search/searches/${encodeURIComponent(searchId)}/results`);
  }

  async refreshPropertySearch(searchId: string) {
    if (this.mockMode) return this.mockAction('refresh_property_search', { searchId });
    return this.request('POST', `/api/property-search/searches/${encodeURIComponent(searchId)}/refresh`);
  }

  async addPropertyCriterion(searchId: string, text: string) {
    if (this.mockMode) return this.mockAction('add_property_criterion', { searchId, text });
    return this.request('POST', `/api/property-search/searches/${encodeURIComponent(searchId)}/criteria`, { text });
  }

  async setPropertySearchStatus(searchId: string, status: 'active' | 'paused' | 'archived') {
    if (this.mockMode) return this.mockAction('set_property_search_status', { searchId, status });
    return this.request('PATCH', `/api/property-search/searches/${encodeURIComponent(searchId)}/status`, { status });
  }

  async setPropertyResultState(searchId: string, listingId: string, state: 'SEEN' | 'SAVED' | 'DISMISSED') {
    if (this.mockMode) return this.mockAction('set_property_result_state', { searchId, listingId, state });
    return this.request(
      'PATCH',
      `/api/property-search/searches/${encodeURIComponent(searchId)}/results/${encodeURIComponent(listingId)}`,
      { state },
    );
  }

  private async request<T = unknown>(method: HttpMethod, path: string, body?: unknown): Promise<KokiActionResult<T>> {
    if (!this.baseUrl) return { ok: false, error: 'KOKI_API_NOT_CONFIGURED', status: 503 };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const headers: Record<string, string> = {
        accept: 'application/json',
        'x-koki-client': 'chatgpt-app',
        'x-koki-client-version': '1',
      };
      if (body !== undefined) headers['content-type'] = 'application/json';
      if (this.bearer) headers.authorization = `Bearer ${this.bearer}`;
      if (this.ownerKey) headers['x-koki-owner'] = this.ownerKey;

      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });

      const raw = await response.text();
      let parsed: any = null;
      if (raw) {
        try { parsed = JSON.parse(raw); } catch { parsed = { raw }; }
      }

      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          error: String(parsed?.error || parsed?.message || `KOKI_UPSTREAM_${response.status}`),
          data: parsed,
        };
      }

      if (parsed && typeof parsed === 'object' && 'ok' in parsed) {
        if (parsed.ok === false) {
          return {
            ok: false,
            status: response.status,
            error: String(parsed.error || 'KOKI_UPSTREAM_ERROR'),
            data: parsed,
          };
        }
        const { ok: _ok, ...rest } = parsed;
        return { ok: true, status: response.status, data: rest as T };
      }

      return { ok: true, status: response.status, data: parsed as T };
    } catch (error) {
      const code = error instanceof Error && error.name === 'AbortError'
        ? 'KOKI_UPSTREAM_TIMEOUT'
        : error instanceof Error
          ? error.message
          : 'KOKI_UPSTREAM_FAILED';
      return { ok: false, error: code, status: 502 };
    } finally {
      clearTimeout(timeout);
    }
  }

  private mockAction(name: string, args: Record<string, unknown>): KokiActionResult {
    const now = new Date().toISOString();
    const listing = (id: string, title: string, direction: 'BUY' | 'SELL', price: number) => ({
      id, title, direction, price, currency: 'EUR', marketplace: direction === 'SELL' ? 'OLX' : 'OLX',
      status: 'Active', lastInteractionAt: now, unreadCount: direction === 'SELL' ? 1 : 0,
      targetPrice: direction === 'SELL' ? 330 : 280,
    });

    switch (name) {
      case 'get_dashboard':
      case 'open_koki':
        return { ok: true, data: {
          activeOperations: [
            listing('sell-1', 'Греди 10x10', 'SELL', 349),
            listing('buy-1', 'Kumho Ecsta 245/40 R19', 'BUY', 350),
          ],
          counts: { decisions: 2, unread: 3, newSearchResults: 4, sleeping: 1 },
          system: { status: 'Operational' },
        } };
      case 'list_buy': return { ok: true, data: { items: [listing('buy-1', 'Kumho Ecsta 245/40 R19', 'BUY', 350)] } };
      case 'list_sell': return { ok: true, data: { items: [listing('sell-1', 'Греди 10x10', 'SELL', 349)] } };
      case 'get_conversations': return { ok: true, data: { conversations: [{
        id: 'conv-1', title: 'Греди 10x10', marketplace: 'OLX', direction: 'SELL', status: 'Active',
        lastMessage: '320 и ги взимам утре.', unreadCount: 1, offer: 320, targetPrice: 330,
        temperature: 78, automationState: 'ACTIVE', lastInteractionAt: now,
      }] } };
      case 'get_conversation': return { ok: true, data: {
        id: String(args.conversationId || 'conv-1'), title: 'Греди 10x10', marketplace: 'OLX', direction: 'SELL',
        automationState: 'ACTIVE', strategy: { targetPrice: 330, currentOffer: 320, temperature: 78 },
        messages: [
          { id: 'm1', sender: 'COUNTERPARTY', text: 'Здравейте, 300 евро?', createdAt: now },
          { id: 'm2', sender: 'KOKI', text: 'Здравейте. Мога да направя 340 €.', createdAt: now },
          { id: 'm3', sender: 'COUNTERPARTY', text: '320 и ги взимам утре.', createdAt: now },
        ],
      } };
      case 'get_decisions': return { ok: true, data: { decisions: [{
        id: 'decision-1', conversationId: 'conv-1', title: 'Греди 10x10', offer: 320, targetPrice: 330,
        recommendation: 'Приеми', reason: 'Разликата е €10 и купувачът предлага взимане утре.',
      }] } };
      case 'get_notifications': return { ok: true, data: { notifications: [
        { id: 'n1', type: 'MESSAGE', title: 'Ново съобщение', subtitle: 'Греди 10x10', unread: true, createdAt: now },
        { id: 'n2', type: 'SEARCH', title: 'Нова обява', subtitle: '3-стаен Банско', unread: true, createdAt: now },
      ] } };
      case 'get_profile': return { ok: true, data: { name: 'KOKI user', connections: [
        { platform: 'OLX', status: 'connected' }, { platform: 'KLEINANZEIGEN', status: 'connected' },
      ] } };
      case 'get_settings': return { ok: true, data: { automation: true, push: true, newMessages: true, decisions: true, searchResults: true } };
      case 'list_property_searches': return { ok: true, data: { searches: [{ id: 'search-1', title: '3-стаен Банско', status: 'active', newCount: 4 }] } };
      case 'create_property_search':
      case 'get_property_search':
      case 'get_property_results':
      case 'refresh_property_search':
      case 'add_property_criterion':
        return { ok: true, data: {
          search: { id: String(args.searchId || 'search-1'), title: '3-стаен Банско', status: 'active' },
          results: [{ listingId: 'imot-1', title: '3-стаен апартамент', price: 118000, currency: 'EUR', area: 92, rooms: 3, location: 'Банско', state: 'NEW', score: 8.4, pros: ['Под бюджета', 'Добра площ'], cons: ['Няма паркомясто'], url: 'https://www.imot.bg/' }],
        } };
      default:
        return { ok: true, data: { action: name, arguments: args, mock: true, updatedAt: now } };
    }
  }
}

function normalizeBaseUrl(value: string) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function extractBearer(value: string) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  return trimmed.toLowerCase().startsWith('bearer ') ? trimmed.slice(7).trim() : '';
}
