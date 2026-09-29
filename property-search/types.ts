export type PropertyType =
  | 'studio'
  | '1-room'
  | '2-room'
  | '3-room'
  | '4-room'
  | 'multi-room'
  | 'maisonette'
  | 'house'
  | 'villa'
  | 'floor-of-house'
  | 'land'
  | 'office'
  | 'shop'
  | 'garage'
  | 'parking-space'
  | 'warehouse'
  | 'industrial'
  | 'hotel'
  | 'other';

export interface PropertySearchRequest {
  operation: 'search_properties';
  transaction: 'sale' | 'rent' | null;
  propertyTypes: PropertyType[];
  location: {
    city?: string;
    municipality?: string;
    district?: string;
    neighborhoods?: string[];
  };
  price?: {
    min?: number;
    max?: number;
    currency: 'EUR';
  };
  area?: {
    min?: number;
    max?: number;
  };
  floor?: {
    min?: number;
    max?: number;
    exclude?: number[];
  };
  requiredFeatures: string[];
  preferredFeatures: string[];
  excludedFeatures: string[];
  freeTextConstraints?: string[];
}

export interface PropertyListingSummary {
  source: 'imot.bg';
  listingId: string;
  canonicalUrl: string;
  title: string | null;
  price: number | null;
  currency: 'EUR' | null;
  areaM2: number | null;
  pricePerM2: number | null;
  locationText: string | null;
  thumbnailUrl: string | null;
  fetchedAt: string;
}

export interface PropertyListing extends PropertyListingSummary {
  description: string | null;
  propertyType: string | null;
  floor: number | null;
  totalFloors: number | null;
  constructionType: string | null;
  constructionYear: number | null;
  seller: {
    type: 'agency' | 'private' | 'unknown';
    name: string | null;
  };
  contact: {
    phone: string | null;
    inquiryUrl: string | null;
  };
  imageUrls: string[];
  publishedAt: string | null;
}

export interface PropertySearchResult {
  source: 'imot.bg';
  request: PropertySearchRequest;
  fetchedAt: string;
  listings: PropertyListing[];
  stats: {
    pagesFetched: number;
    summariesFound: number;
    detailsFetched: number;
    rejected: number;
  };
}

export function assertPropertySearchRequest(value: unknown): asserts value is PropertySearchRequest {
  if (!value || typeof value !== 'object') throw new Error('INVALID_SEARCH_REQUEST');
  const v = value as Record<string, unknown>;
  const allowedRoot = new Set([
    'operation','transaction','propertyTypes','location','price','area','floor',
    'requiredFeatures','preferredFeatures','excludedFeatures','freeTextConstraints'
  ]);
  for (const key of Object.keys(v)) {
    if (!allowedRoot.has(key)) throw new Error(`INVALID_SEARCH_REQUEST_FIELD:${key}`);
  }
  if (v.operation !== 'search_properties') throw new Error('INVALID_SEARCH_OPERATION');
  if (v.transaction !== null && v.transaction !== 'sale' && v.transaction !== 'rent') {
    throw new Error('INVALID_SEARCH_TRANSACTION');
  }
  if (!Array.isArray(v.propertyTypes)) throw new Error('INVALID_PROPERTY_TYPES');
  if (!v.location || typeof v.location !== 'object') throw new Error('INVALID_LOCATION');
  for (const key of ['requiredFeatures','preferredFeatures','excludedFeatures']) {
    if (!Array.isArray(v[key])) throw new Error(`INVALID_${key}`);
  }
  const urlLike = /https?:\/\/|www\.|\/api\/|\/pcgi\/|imot\.bg/i;
  const scan = JSON.stringify(v);
  if (urlLike.test(scan)) throw new Error('SOURCE_SPECIFIC_VALUE_FORBIDDEN');
}
