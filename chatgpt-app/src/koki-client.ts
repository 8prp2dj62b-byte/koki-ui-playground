import type { KokiActionResult } from './types.js';

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';
type Json = Record<string, any>;

interface KokiClientOptions {
  baseUrl?: string;
  requestBearer?: string;
  serviceToken?: string;
  ownerKey?: string;
  timeoutMs?: number;
  mockMode?: boolean;
}

const FN = {
  command: 'koki-command-center-staging-fe',
  admin: 'koki-admin-control',
  strategy: 'koki-strategy-admin',
  push: 'koki-push-admin',
  property: 'koki-property-search-v1',
  sell: 'koki-context-orchestrator-staging-v3',
} as const;

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
    this.timeoutMs = options.timeoutMs || Number(process.env.KOKI_API_TIMEOUT_MS || 120_000);
    this.mockMode = options.mockMode ?? process.env.KOKI_MOCK_MODE === '1';
  }

  isConfigured() { return Boolean(this.baseUrl) || this.mockMode; }

  async health(): Promise<KokiActionResult> {
    if (this.mockMode) return { ok: true, data: { status: 'mock', source: 'KOKI_MOCK_MODE' } };
    if (!this.baseUrl) return { ok: false, error: 'KOKI_API_NOT_CONFIGURED', status: 503 };
    const admin = await this.functionRequest<Json>(FN.admin, 'GET');
    const property = await this.functionRequest<Json>(FN.property, 'GET', undefined, '?health=1', false);
    return {
      ok: admin.ok && property.ok,
      status: admin.ok && property.ok ? 200 : 503,
      data: { admin: admin.data ?? null, property: property.data ?? null },
      error: admin.ok && property.ok ? undefined : admin.error || property.error || 'KOKI_UPSTREAM_UNHEALTHY',
    };
  }

  /**
   * Live adapter: every mutation delegates to an existing authenticated KOKI
   * domain service. The ChatGPT app never talks to OLX/KA/Gemini directly.
   * Conversation writes are ownership-preflighted through the tenant-filtered
   * command center because some legacy admin actions are intentionally thin.
   */
  async action<T = unknown>(name: string, args: Record<string, unknown> = {}): Promise<KokiActionResult<T>> {
    if (this.mockMode) return this.mockAction(name, args) as KokiActionResult<T>;
    if (!this.baseUrl) return { ok: false, error: 'KOKI_API_NOT_CONFIGURED', status: 503 };

    switch (name) {
      case 'open_koki':
      case 'get_dashboard': return this.dashboard() as Promise<KokiActionResult<T>>;
      case 'get_status': return this.health() as Promise<KokiActionResult<T>>;
      case 'list_buy': return this.listByDirection('BUY', args) as Promise<KokiActionResult<T>>;
      case 'list_sell': return this.listByDirection('SELL', args) as Promise<KokiActionResult<T>>;
      case 'get_listing':
      case 'get_conversation': return this.detail(String(args.listingId || args.conversationId || '')) as Promise<KokiActionResult<T>>;
      case 'get_conversations': return this.conversations(args) as Promise<KokiActionResult<T>>;
      case 'refresh_conversation': return this.detail(String(args.conversationId || '')) as Promise<KokiActionResult<T>>;
      case 'refresh_listings': return this.summary() as Promise<KokiActionResult<T>>;

      case 'send_message': {
        const id = String(args.conversationId || '');
        const owned = await this.ensureConversation(id); if (!owned.ok) return owned as KokiActionResult<T>;
        return this.functionRequest<T>(FN.admin, 'POST', { action: 'admin_send', negotiation_id: id, text: String(args.text || '') });
      }
      case 'stop_negotiation':
      case 'take_over_conversation':
      case 'archive_conversation': {
        const id = String(args.conversationId || '');
        const owned = await this.ensureConversation(id); if (!owned.ok) return owned as KokiActionResult<T>;
        return this.functionRequest<T>(FN.admin, 'POST', { action: 'set_conversation_status', negotiation_id: id, target_status: 'inactive' });
      }
      case 'start_negotiation': {
        const id = String(args.conversationId || '');
        const owned = await this.ensureConversation(id); if (!owned.ok) return owned as KokiActionResult<T>;
        return this.functionRequest<T>(FN.admin, 'POST', { action: 'set_conversation_status', negotiation_id: id, target_status: 'active' });
      }
      case 'return_to_koki': {
        const id = String(args.conversationId || '');
        const owned = await this.ensureConversation(id); if (!owned.ok) return owned as KokiActionResult<T>;
        return this.functionRequest<T>(FN.admin, 'POST', { action: 'return_to_koki', negotiation_id: id });
      }
      case 'update_strategy': {
        const id = String(args.conversationId || args.negotiationId || '');
        const owned = await this.ensureConversation(id); if (!owned.ok) return owned as KokiActionResult<T>;
        if (args.maxPriceEur != null || args.max_price_eur != null) {
          return this.functionRequest<T>(FN.strategy, 'POST', {
            action: 'set_max_price_and_restrategize', negotiation_id: id,
            max_price_eur: Number(args.maxPriceEur ?? args.max_price_eur),
          });
        }
        return this.functionRequest<T>(FN.strategy, 'POST', { action: 'refresh_strategy', negotiation_id: id });
      }
      case 'resolve_decision': return this.resolveDecision(args) as Promise<KokiActionResult<T>>;
      case 'get_decisions': return this.decisions() as Promise<KokiActionResult<T>>;

      case 'list_property_searches':
        return { ok: false, status: 501, error: 'PROPERTY_SEARCH_LIST_REQUIRES_ADAPTER_QUERY' } as KokiActionResult<T>;

      case 'create_sell_draft': return this.createSellDraft(args) as Promise<KokiActionResult<T>>;
      case 'get_sell_draft':
        return { ok: false, status: 501, error: 'SELL_DRAFT_READ_REQUIRES_ADAPTER_QUERY' } as KokiActionResult<T>;
      case 'update_sell_draft': return this.updateSellDraft(args) as Promise<KokiActionResult<T>>;
      case 'prepare_sell_upload':
        return { ok: false, status: 501, error: 'SELL_MEDIA_UPLOAD_REQUIRES_ADAPTER_SERVICE' } as KokiActionResult<T>;
      case 'analyze_sell_draft':
      case 'analyze_market':
      case 'optimize_sell_draft':
      case 'validate_sell_draft':
        return { ok: false, status: 501, error: 'SELL_ANALYSIS_STATE_IS_RETURNED_BY_MASTER_DRAFT' } as KokiActionResult<T>;
      case 'publish_sell_draft': return this.publishSellDraft(args) as Promise<KokiActionResult<T>>;
      case 'delete_sell_draft':
        return { ok: false, status: 501, error: 'SELL_DRAFT_DELETE_REQUIRES_ADAPTER_QUERY' } as KokiActionResult<T>;

      case 'get_notifications': return this.notifications(args) as Promise<KokiActionResult<T>>;
      case 'mark_notifications_read': return this.markNotifications(args) as Promise<KokiActionResult<T>>;
      case 'get_settings': return this.notificationSettings() as Promise<KokiActionResult<T>>;
      case 'update_settings': return this.updateNotificationSettings(args) as Promise<KokiActionResult<T>>;
      case 'get_connections': return this.connections() as Promise<KokiActionResult<T>>;
      case 'get_profile': return this.profile() as Promise<KokiActionResult<T>>;
      case 'connect_marketplace': return this.connectMarketplace(args) as Promise<KokiActionResult<T>>;
      case 'disconnect_marketplace': return this.disconnectMarketplace(args) as Promise<KokiActionResult<T>>;
      case 'update_profile':
        return { ok: false, status: 501, error: 'PROFILE_UPDATE_NOT_EXPOSED_BY_CURRENT_KOKI_API' } as KokiActionResult<T>;
      default: return { ok: false, status: 400, error: `KOKI_ACTION_UNMAPPED:${name}` } as KokiActionResult<T>;
    }
  }

  async createPropertySearch(text: string, _title?: string) {
    if (this.mockMode) return this.mockAction('create_property_search', { text });
    return this.functionRequest(FN.property, 'POST', { action: 'create', text });
  }

  async getPropertySearch(searchId: string) {
    if (this.mockMode) return this.mockAction('get_property_search', { searchId });
    return this.functionRequest(FN.property, 'POST', { action: 'results', search_id: searchId });
  }

  async getPropertyResults(searchId: string) {
    if (this.mockMode) return this.mockAction('get_property_results', { searchId });
    return this.functionRequest(FN.property, 'POST', { action: 'results', search_id: searchId });
  }

  async refreshPropertySearch(searchId: string) {
    if (this.mockMode) return this.mockAction('refresh_property_search', { searchId });
    return this.functionRequest(FN.property, 'POST', { action: 'refresh', search_id: searchId });
  }

  async addPropertyCriterion(searchId: string, text: string) {
    if (this.mockMode) return this.mockAction('add_property_criterion', { searchId, text });
    return this.functionRequest(FN.property, 'POST', { action: 'add_criterion', search_id: searchId, text });
  }

  async setPropertySearchStatus(_searchId: string, _status: 'active' | 'paused' | 'archived') {
    if (this.mockMode) return this.mockAction('set_property_search_status', { searchId: _searchId, status: _status });
    return { ok: false, status: 501, error: 'PROPERTY_SEARCH_STATUS_REQUIRES_ADAPTER_QUERY' } as KokiActionResult;
  }

  async setPropertyResultState(searchId: string, listingId: string, state: 'SEEN' | 'SAVED' | 'DISMISSED') {
    if (this.mockMode) return this.mockAction('set_property_result_state', { searchId, listingId, state });
    return this.functionRequest(FN.property, 'POST', { action: 'set_state', search_id: searchId, listing_id: listingId, state });
  }

  private async summary(): Promise<KokiActionResult<Json>> {
    return this.functionRequest(FN.command, 'GET', undefined, '?format=summary');
  }

  private async detail(id: string): Promise<KokiActionResult<Json>> {
    if (!id) return { ok: false, status: 400, error: 'CONVERSATION_ID_REQUIRED' };
    return this.functionRequest(FN.command, 'GET', undefined, `?format=detail&id=${encodeURIComponent(id)}`);
  }

  private async ensureConversation(id: string): Promise<KokiActionResult<Json>> {
    const d = await this.detail(id);
    if (!d.ok) return { ok: false, status: d.status || 403, error: d.error || 'CONVERSATION_NOT_OWNED' };
    return d;
  }

  private async dashboard(): Promise<KokiActionResult<Json>> {
    const r = await this.summary(); if (!r.ok) return r;
    const d = (r.data || {}) as Json;
    return { ok: true, status: 200, data: {
      activeOperations: Array.isArray(d.active) ? d.active.slice(0, 3) : [],
      counts: {
        decisions: Array.isArray(d.adminq) ? d.adminq.length : Number(d.stats?.admin || 0),
        unread: Number(d.stats?.unread || 0),
        newSearchResults: Number(d.stats?.newSearchResults || 0),
        sleeping: Array.isArray(d.sleeping) ? d.sleeping.length : Number(d.stats?.sleeping || 0),
      },
      stats: d.stats || {}, build: d.build || d.pwa_build || null,
    } };
  }

  private async conversations(args: Record<string, unknown>): Promise<KokiActionResult<Json>> {
    const r = await this.summary(); if (!r.ok) return r;
    const d = (r.data || {}) as Json;
    let rows: Json[] = Array.isArray(d.all) ? d.all : Array.isArray(d.recent) ? d.recent : [];
    const direction = String(args.direction || '').toUpperCase();
    if (direction) rows = rows.filter(x => directionOf(x) === direction);
    if (args.unreadOnly === true) rows = rows.filter(x => unreadOf(x) > 0);
    if (args.status) rows = rows.filter(x => String(x.status || '').toLowerCase() === String(args.status).toLowerCase());
    return { ok: true, data: { conversations: rows.map(normalizeConversation), stats: d.stats || {} } };
  }

  private async listByDirection(direction: 'BUY' | 'SELL', args: Record<string, unknown>): Promise<KokiActionResult<Json>> {
    const c = await this.conversations({ ...args, direction }); if (!c.ok) return c;
    return { ok: true, data: { items: ((c.data as Json)?.conversations || []).map((x: Json) => ({ ...x, direction })) } };
  }

  private async decisions(): Promise<KokiActionResult<Json>> {
    const r = await this.summary(); if (!r.ok) return r;
    const d = (r.data || {}) as Json, rows: Json[] = Array.isArray(d.adminq) ? d.adminq : [];
    return { ok: true, data: { decisions: rows.map(x => ({
      id: String(x.decision?.id || x.id), conversationId: String(x.id), title: x.title || x.advert_title || x.listing_title || 'Разговор',
      offer: x.current_offer_eur ?? x.current_offer ?? null, targetPrice: x.target_price_eur ?? x.target_price ?? x.max_price_eur ?? null,
      recommendation: x.decision?.recommendation || x.decision?.action || x.behavior_context?.handoff_reason || 'Нужно е решение',
      reason: x.decision?.reason || x.behavior_context?.handoff_detail?.reason || x.last_error || null,
    })) } };
  }

  private async resolveDecision(args: Record<string, unknown>): Promise<KokiActionResult<Json>> {
    const id = String(args.conversationId || args.negotiationId || args.decisionId || '');
    const owned = await this.ensureConversation(id); if (!owned.ok) return owned;
    const decision = String(args.decision || '').toUpperCase();
    if (decision === 'CONTINUE_KOKI') return this.functionRequest(FN.admin, 'POST', { action: 'return_to_koki', negotiation_id: id });
    if (decision === 'ARCHIVE') return this.functionRequest(FN.admin, 'POST', { action: 'set_conversation_status', negotiation_id: id, target_status: 'inactive' });
    if ((decision === 'ACCEPT' || decision === 'COUNTER') && String(args.note || '').trim()) {
      return this.functionRequest(FN.admin, 'POST', { action: 'admin_send', negotiation_id: id, text: String(args.note).trim() });
    }
    return { ok: false, status: 409, error: 'DECISION_MESSAGE_MUST_BE_GENERATED_BY_EXISTING_KOKI_AI_FLOW' };
  }

  private async notifications(args: Record<string, unknown>): Promise<KokiActionResult<Json>> {
    const r = await this.functionRequest<Json>(FN.push, 'POST', { action: 'notifications', limit: Number(args.limit || 100) });
    if (!r.ok) return r;
    const d = (r.data || {}) as Json;
    const events = Array.isArray(d.events) ? d.events : [];
    return { ok: true, data: { unread_count: d.unread_count || 0, settings: d.settings || {}, notifications: events.map((e: Json) => ({
      ...e, id: e.id, type: e.event_type, subtitle: e.body, unread: !e.read_at,
    })) } };
  }

  private async markNotifications(args: Record<string, unknown>): Promise<KokiActionResult<Json>> {
    if (args.all === true) return this.functionRequest(FN.push, 'POST', { action: 'mark_all_read' });
    const ids = Array.isArray(args.ids) ? args.ids.map(String).filter(Boolean) : [];
    for (const id of ids) {
      const r = await this.functionRequest(FN.push, 'POST', { action: 'mark_read', id });
      if (!r.ok) return r;
    }
    return { ok: true, data: { updated: ids.length } };
  }

  private async notificationSettings(): Promise<KokiActionResult<Json>> {
    const r = await this.functionRequest<Json>(FN.push, 'POST', { action: 'notifications', limit: 1 });
    if (!r.ok) return r;
    const s = ((r.data || {}) as Json).settings || {};
    return { ok: true, data: { settings: {
      automation: true, push: s.global_enabled !== false, badge: s.type_preferences?.pwa_badge !== false,
      sellerMessages: s.type_preferences?.seller_messages !== false,
      decisions: s.type_preferences?.manual_intervention !== false,
      listingResults: s.type_preferences?.listing_result !== false,
      raw: s,
    } } };
  }

  private async updateNotificationSettings(args: Record<string, unknown>): Promise<KokiActionResult<Json>> {
    const p = (args.patch && typeof args.patch === 'object' ? args.patch : {}) as Json;
    if (typeof p.push === 'boolean') return this.functionRequest(FN.push, 'POST', { action: 'set_notifications', global_enabled: p.push });
    if (typeof p.badge === 'boolean') return this.functionRequest(FN.push, 'POST', { action: 'set_notifications', badge_enabled: p.badge });
    const map: Record<string,string> = { sellerMessages: 'seller_messages', decisions: 'manual_intervention', listingResults: 'listing_result' };
    for (const [key, type] of Object.entries(map)) if (typeof p[key] === 'boolean') return this.functionRequest(FN.push, 'POST', { action: 'set_notifications', type, enabled: p[key] });
    return { ok: false, status: 400, error: 'NO_SUPPORTED_SETTING_CHANGE' };
  }

  private async connections(): Promise<KokiActionResult<Json>> {
    const olx = await this.functionRequest<Json>(FN.command, 'GET', undefined, '/auth/olx/status');
    const connections = [{ platform: 'OLX', status: olx.ok && (olx.data as Json)?.connected ? 'connected' : 'disconnected', ...(olx.data || {}) }];
    return { ok: true, data: { connections } };
  }

  private async profile(): Promise<KokiActionResult<Json>> {
    const c = await this.connections(); if (!c.ok) return c;
    const first = ((c.data as Json)?.connections || [])[0] || {};
    return { ok: true, data: { profile_id: first.profile_id || null, name: 'KOKI', connections: (c.data as Json).connections } };
  }

  private async connectMarketplace(args: Record<string, unknown>): Promise<KokiActionResult<Json>> {
    const market = String(args.marketplace || '').toUpperCase();
    if (market !== 'OLX') return { ok: false, status: 501, error: 'MARKETPLACE_CONNECT_NOT_EXPOSED_BY_CURRENT_KOKI_API' };
    const r = await this.functionRequest<Json>(FN.command, 'POST', {}, '/auth/olx/start');
    if (!r.ok) return r;
    return { ok: true, data: { ...(r.data || {}), authorizationUrl: (r.data as Json)?.authorization_url } };
  }

  private async disconnectMarketplace(args: Record<string, unknown>): Promise<KokiActionResult<Json>> {
    const market = String(args.marketplace || '').toUpperCase();
    if (market !== 'OLX') return { ok: false, status: 501, error: 'MARKETPLACE_DISCONNECT_NOT_EXPOSED_BY_CURRENT_KOKI_API' };
    return this.functionRequest(FN.command, 'POST', {}, '/auth/olx/disconnect');
  }

  private async createSellDraft(args: Record<string, unknown>): Promise<KokiActionResult<Json>> {
    const market = String(args.marketplace || 'OLX').toUpperCase();
    if (market !== 'OLX') return { ok: false, status: 501, error: 'CURRENT_MASTER_SELL_SUPPORTS_OLX_ONLY' };
    return this.functionRequest(FN.sell, 'POST', {
      action: 'draft',
      client_request_id: String(args.clientRequestId || args.client_request_id || crypto.randomUUID()),
      product_description: String(args.text || args.productDescription || ''),
      known_facts: Array.isArray(args.knownFacts) ? args.knownFacts : [],
      image_urls: Array.isArray(args.imageUrls) ? args.imageUrls : [],
      asking_price_eur: args.askingPriceEur ?? args.asking_price_eur ?? undefined,
    });
  }

  private async updateSellDraft(args: Record<string, unknown>): Promise<KokiActionResult<Json>> {
    const patch = (args.patch && typeof args.patch === 'object' ? args.patch : {}) as Json;
    const saleId = String(args.saleId || args.draftId || patch.sale_id || '');
    if (!saleId) return { ok: false, status: 400, error: 'SALE_ID_REQUIRED' };
    return this.functionRequest(FN.sell, 'POST', { action: 'update', confirm_update: true, sale_id: saleId, payload: patch });
  }

  private async publishSellDraft(args: Record<string, unknown>): Promise<KokiActionResult<Json>> {
    const p = (args.payload && typeof args.payload === 'object' ? args.payload : args) as Json;
    const saleId = String(p.saleId || p.sale_id || p.draftId || '');
    if (!saleId) return { ok: false, status: 400, error: 'SALE_ID_REQUIRED' };
    return this.functionRequest(FN.sell, 'POST', {
      action: 'publish', confirm_publish: true, sale_id: saleId,
      title: p.title, description: p.description, category_id: p.categoryId ?? p.category_id,
      city_id: p.cityId ?? p.city_id, district_id: p.districtId ?? p.district_id,
      asking_price_eur: p.askingPriceEur ?? p.asking_price_eur,
      image_urls: p.imageUrls ?? p.image_urls ?? [], advertiser_type: p.advertiserType ?? p.advertiser_type ?? 'private',
      contact_name: p.contactName ?? p.contact_name, contact_phone: p.contactPhone ?? p.contact_phone,
      attributes: p.attributes ?? [], courier: p.courier === true, auto_extend_enabled: p.autoExtendEnabled === true || p.auto_extend_enabled === true,
      negotiable: p.negotiable !== false,
    });
  }

  private async functionRequest<T = unknown>(fn: string, method: HttpMethod, body?: unknown, suffix = '', withBearer = true): Promise<KokiActionResult<T>> {
    const path = suffix.startsWith('/') ? `/functions/v1/${fn}${suffix}` : `/functions/v1/${fn}${suffix}`;
    return this.request<T>(method, path, body, withBearer);
  }

  private async request<T = unknown>(method: HttpMethod, path: string, body?: unknown, withBearer = true): Promise<KokiActionResult<T>> {
    if (!this.baseUrl) return { ok: false, error: 'KOKI_API_NOT_CONFIGURED', status: 503 };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const headers: Record<string, string> = { accept: 'application/json', 'x-koki-client': 'chatgpt-app', 'x-koki-client-version': '1' };
      if (body !== undefined) headers['content-type'] = 'application/json';
      if (withBearer && this.bearer) headers.authorization = `Bearer ${this.bearer}`;
      if (this.ownerKey) headers['x-koki-owner'] = this.ownerKey;
      const response = await fetch(`${this.baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal });
      const raw = await response.text(); let parsed: any = null;
      if (raw) { try { parsed = JSON.parse(raw); } catch { parsed = { raw }; } }
      if (!response.ok) return { ok: false, status: response.status, error: String(parsed?.error || parsed?.message || `KOKI_UPSTREAM_${response.status}`), data: parsed };
      if (parsed && typeof parsed === 'object' && 'ok' in parsed) {
        if (parsed.ok === false) return { ok: false, status: response.status, error: String(parsed.error || 'KOKI_UPSTREAM_ERROR'), data: parsed };
        const { ok: _ok, ...rest } = parsed; return { ok: true, status: response.status, data: rest as T };
      }
      return { ok: true, status: response.status, data: parsed as T };
    } catch (error) {
      const code = error instanceof Error && error.name === 'AbortError' ? 'KOKI_UPSTREAM_TIMEOUT' : error instanceof Error ? error.message : 'KOKI_UPSTREAM_FAILED';
      return { ok: false, error: code, status: 502 };
    } finally { clearTimeout(timeout); }
  }

  private mockAction(name: string, args: Record<string, unknown>): KokiActionResult {
    const now = new Date().toISOString();
    const listing = (id: string, title: string, direction: 'BUY' | 'SELL', price: number) => ({ id, title, direction, price, currency: 'EUR', marketplace: 'OLX', status: 'Active', lastInteractionAt: now, unreadCount: direction === 'SELL' ? 1 : 0, targetPrice: direction === 'SELL' ? 330 : 280 });
    switch (name) {
      case 'get_dashboard': case 'open_koki': return { ok: true, data: { activeOperations: [listing('sell-1','Греди 10x10','SELL',349),listing('buy-1','Kumho Ecsta 245/40 R19','BUY',350)], counts: { decisions: 2, unread: 3, newSearchResults: 4, sleeping: 1 }, system: { status: 'Operational' } } };
      case 'list_buy': return { ok: true, data: { items: [listing('buy-1','Kumho Ecsta 245/40 R19','BUY',350)] } };
      case 'list_sell': return { ok: true, data: { items: [listing('sell-1','Греди 10x10','SELL',349)] } };
      case 'get_conversations': return { ok: true, data: { conversations: [{ id:'conv-1',title:'Греди 10x10',marketplace:'OLX',direction:'SELL',status:'Active',lastMessage:'320 и ги взимам утре.',unreadCount:1,offer:320,targetPrice:330,temperature:78,automationState:'ACTIVE',lastInteractionAt:now }] } };
      case 'get_conversation': return { ok: true, data: { id:String(args.conversationId||'conv-1'),title:'Греди 10x10',marketplace:'OLX',direction:'SELL',automationState:'ACTIVE',strategy:{targetPrice:330,currentOffer:320,temperature:78},messages:[{id:'m1',sender:'COUNTERPARTY',text:'Здравейте, 300 евро?',createdAt:now},{id:'m2',sender:'KOKI',text:'Здравейте. Мога да направя 340 €.',createdAt:now},{id:'m3',sender:'COUNTERPARTY',text:'320 и ги взимам утре.',createdAt:now}] } };
      case 'get_decisions': return { ok: true, data: { decisions: [{ id:'conv-1',conversationId:'conv-1',title:'Греди 10x10',offer:320,targetPrice:330,recommendation:'Приеми',reason:'Разликата е €10.' }] } };
      case 'get_notifications': return { ok: true, data: { notifications: [{id:'n1',type:'MESSAGE',title:'Ново съобщение',subtitle:'Греди 10x10',unread:true,createdAt:now}] } };
      case 'get_profile': return { ok: true, data: { name:'KOKI user',connections:[{platform:'OLX',status:'connected'}] } };
      case 'get_settings': return { ok: true, data: { settings:{automation:true,push:true} } };
      case 'list_property_searches': return { ok: true, data: { searches: [{id:'search-1',title:'3-стаен Банско',status:'active',newCount:4}] } };
      case 'create_property_search': case 'get_property_search': case 'get_property_results': case 'refresh_property_search': case 'add_property_criterion': return { ok: true, data: { search:{id:String(args.searchId||'search-1'),title:'3-стаен Банско',status:'active'},results:[{listingId:'imot-1',title:'3-стаен апартамент',price:118000,currency:'EUR',area:92,rooms:3,location:'Банско',state:'NEW',score:8.4,pros:['Под бюджета'],cons:['Няма паркомясто'],url:'https://www.imot.bg/'}] } };
      default: return { ok: true, data: { action:name,arguments:args,mock:true,updatedAt:now } };
    }
  }
}

function normalizeBaseUrl(value: string) { return String(value || '').trim().replace(/\/+$/, ''); }
function extractBearer(value: string) { const trimmed=String(value||'').trim(); if(!trimmed)return''; return trimmed.toLowerCase().startsWith('bearer ')?trimmed.slice(7).trim():''; }
function directionOf(x: Json): string { return String(x.direction || x.domain || x.behavior_context?.domain || x.transaction_type || '').toUpperCase(); }
function unreadOf(x: Json): number { return Number(x.unreadCount ?? x.unread_count ?? x.metadata?.unread_count ?? 0) || 0; }
function normalizeConversation(x: Json): Json { const events=Array.isArray(x.messages)?x.messages:Array.isArray(x.history)?x.history:Array.isArray(x.events)?x.events:[]; return {
  ...x, id:String(x.id||x.negotiation_id||''), title:x.title||x.advert_title||x.listing_title||x.behavior_context?.advert_snapshot?.title||'Разговор', marketplace:String(x.platform||x.marketplace||'OLX').toUpperCase(), direction:directionOf(x)||undefined,
  lastMessage:x.lastMessage||x.last_message||x.last_message_text||events.at(-1)?.body||events.at(-1)?.text||'', lastInteractionAt:x.lastInteractionAt||x.updated_at||x.last_message_at||x.last_koki_message_at||null,
  unreadCount:unreadOf(x), offer:x.current_offer_eur??x.current_offer??null,targetPrice:x.target_price_eur??x.target_price??x.max_price_eur??null,temperature:x.temperature??x.behavior_context?.temperature??null,
  automationState:x.automationState||x.status||x.behavior_state||null,messages:events,
}; }
