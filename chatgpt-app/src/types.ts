export type KokiView =
  | 'dashboard'
  | 'buy'
  | 'sell'
  | 'listing'
  | 'conversations'
  | 'conversation'
  | 'decisions'
  | 'searches'
  | 'search-results'
  | 'sell-draft'
  | 'notifications'
  | 'profile'
  | 'settings'
  | 'status'
  | 'error';

export interface KokiWidgetPayload<T = unknown> {
  app: 'koki';
  version: 1;
  action: string;
  view: KokiView;
  title?: string;
  data: T;
  generatedAt: string;
}

export interface KokiActionResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  status?: number;
}

export type Marketplace = 'OLX' | 'KLEINANZEIGEN' | 'IMOT_BG' | string;

export interface ListingSummary {
  id: string;
  title: string;
  marketplace?: Marketplace;
  direction?: 'BUY' | 'SELL';
  price?: number | null;
  currency?: string;
  targetPrice?: number | null;
  status?: string;
  imageUrl?: string | null;
  unreadCount?: number;
  lastInteractionAt?: string | null;
  originalUrl?: string | null;
}

export interface ConversationSummary {
  id: string;
  title: string;
  marketplace?: Marketplace;
  direction?: 'BUY' | 'SELL';
  status?: string;
  lastMessage?: string;
  lastInteractionAt?: string | null;
  unreadCount?: number;
  offer?: number | null;
  targetPrice?: number | null;
  temperature?: number | null;
  automationState?: string;
}

export interface ConversationMessage {
  id: string;
  sender?: 'USER' | 'COUNTERPARTY' | 'KOKI' | string;
  text?: string;
  translatedText?: string | null;
  createdAt?: string;
  imageUrl?: string | null;
}

export interface PropertySearchResult {
  id?: string;
  listingId?: string;
  title?: string;
  price?: number | null;
  currency?: string;
  area?: number | null;
  rooms?: number | string | null;
  location?: string | null;
  url?: string | null;
  imageUrl?: string | null;
  state?: 'NEW' | 'SEEN' | 'SAVED' | 'DISMISSED' | string;
  score?: number | null;
  pros?: string[];
  cons?: string[];
  raw?: unknown;
}
