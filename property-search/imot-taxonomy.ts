const BASE = 'https://www.imot.bg';

type TransactionRoute = 'prodazhbi' | 'naemi';

export interface ImotLocationRequest {
  city?: string;
  municipality?: string;
  district?: string;
  neighborhoods?: string[];
}

/**
 * Resolves KOKI's source-neutral location fields to imot.bg's own public route taxonomy.
 *
 * Primary source: imot.bg's public sitemap for the selected transaction.
 * Fallback source: the public transaction index (covers top-level city/oblast routes).
 *
 * The resolver never asks Gemini for source IDs/slugs and never invents a listing fact.
 */
export class ImotTaxonomyResolver {
  private readonly routeCache = new Map<string, string>();
  private readonly taxonomyCache = new Map<TransactionRoute, Promise<string[]>>();

  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async resolveLocationRoute(location: ImotLocationRequest, transaction: TransactionRoute): Promise<string> {
    const city = cleanLocationName(location.city);
    const district = cleanLocationName(location.district);

    if (!city && !district) throw new Error('IMOT_LOCATION_REQUIRED');

    const cacheKey = `${transaction}|${normalizeKey(city)}|${normalizeKey(district)}`;
    const cached = this.routeCache.get(cacheKey);
    if (cached) return cached;

    const paths = await this.getTaxonomyPaths(transaction);
    const route = city
      ? resolveCityRoute(paths, city, district)
      : resolveDistrictRoute(paths, district!);

    if (!route) {
      const unresolved = city || district || '';
      throw new Error(`IMOT_TAXONOMY_RESOLUTION_FAILED:${unresolved}`);
    }

    this.routeCache.set(cacheKey, route);
    return route;
  }

  private getTaxonomyPaths(transaction: TransactionRoute): Promise<string[]> {
    let pending = this.taxonomyCache.get(transaction);
    if (!pending) {
      pending = this.loadTaxonomyPaths(transaction);
      this.taxonomyCache.set(transaction, pending);
    }
    return pending;
  }

  private async loadTaxonomyPaths(transaction: TransactionRoute): Promise<string[]> {
    const sitemapUrl = `${BASE}/sitemap/obiavi/${transaction}`;
    try {
      const html = await this.getText(sitemapUrl);
      const paths = extractImotTaxonomyPaths(html, transaction);
      if (paths.length) return paths;
    } catch {
      // Fall back to the public transaction index. It is sufficient for all top-level
      // imot.bg city/oblast routes and keeps the search functional if sitemap changes.
    }

    const indexUrl = `${BASE}/obiavi/${transaction}`;
    const html = await this.getText(indexUrl);
    return extractImotTaxonomyPaths(html, transaction);
  }

  private async getText(url: string) {
    const parsed = new URL(url);
    if (parsed.hostname !== 'www.imot.bg' && parsed.hostname !== 'imot.bg') {
      throw new Error('IMOT_HOST_FORBIDDEN');
    }

    const response = await this.fetchImpl(url, {
      method: 'GET',
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'bg-BG,bg;q=0.9,en;q=0.7',
        'user-agent': 'KOKI-PropertySearch/1.0 (+personal search assistant; low-rate crawler)',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    });

    if (response.status === 429) throw new Error('IMOT_RATE_LIMITED');
    if (!response.ok) throw new Error(`IMOT_HTTP_${response.status}`);

    // href values in the sitemap are ASCII. Decoding as latin1 makes route extraction
    // robust even if imot.bg serves a legacy Bulgarian charset on the sitemap page.
    const bytes = new Uint8Array(await response.arrayBuffer());
    return new TextDecoder('latin1').decode(bytes);
  }
}

export function extractImotTaxonomyPaths(html: string, transaction: TransactionRoute): string[] {
  const prefix = `/obiavi/${transaction}/`;
  const result = new Set<string>();
  const hrefRe = /href\s*=\s*["']([^"']+)["']/gi;

  for (let match = hrefRe.exec(html); match; match = hrefRe.exec(html)) {
    let url: URL;
    try {
      url = new URL(decodeHtmlAmp(match[1]), BASE);
    } catch {
      continue;
    }

    if (url.hostname !== 'www.imot.bg' && url.hostname !== 'imot.bg') continue;
    if (!url.pathname.startsWith(prefix)) continue;

    const route = url.pathname.slice(prefix.length).replace(/^\/+|\/+$/g, '');
    if (!route) continue;
    result.add(route);
  }

  return [...result];
}

export function resolveCityRoute(paths: string[], city: string, district?: string | null): string | null {
  const citySlug = imotSlug(city);
  if (!citySlug) return null;

  const districtSlug = district ? imotSlug(district) : '';
  const topLevelSegment = `grad-${citySlug}`;
  const nestedSegment = `gr-${citySlug}`;

  // imot.bg exposes oblast centres as dedicated "grad-*" roots. Prefer this route for
  // an unqualified city request (e.g. "Сливен") instead of the similarly named oblast.
  const topLevel = uniquePrefixRoutes(paths, topLevelSegment);
  if (topLevel.length === 1 && !districtSlug) return topLevel[0];

  let nested = uniquePrefixRoutes(paths, nestedSegment);
  if (districtSlug) {
    const districtSegment = `oblast-${districtSlug}`;
    nested = nested.filter(route => route.split('/').includes(districtSegment));

    if (topLevel.length === 1 && normalizeKey(city) === normalizeKey(district)) {
      return topLevel[0];
    }
  }

  if (nested.length === 1) return nested[0];
  if (topLevel.length === 1) return topLevel[0];

  if (nested.length > 1) {
    throw new Error(`IMOT_LOCATION_AMBIGUOUS:${city}`);
  }
  return null;
}

export function resolveDistrictRoute(paths: string[], district: string): string | null {
  const slug = imotSlug(district);
  if (!slug) return null;
  const segment = `oblast-${slug}`;
  const routes = uniquePrefixRoutes(paths, segment);
  return routes.length === 1 ? routes[0] : null;
}

function uniquePrefixRoutes(paths: string[], wantedSegment: string): string[] {
  const result = new Set<string>();
  for (const path of paths) {
    const segments = path.split('/').filter(Boolean);
    const index = segments.indexOf(wantedSegment);
    if (index < 0) continue;
    result.add(segments.slice(0, index + 1).join('/'));
  }
  return [...result];
}

export function imotSlug(value: string): string {
  const text = cleanLocationName(value).toLocaleLowerCase('bg-BG');
  const map: Record<string, string> = {
    'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ж':'zh','з':'z','и':'i','й':'y',
    'к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f',
    'х':'h','ц':'ts','ч':'ch','ш':'sh','щ':'sht','ъ':'a','ь':'y','ю':'yu','я':'ya',
  };

  let out = '';
  for (const char of text) out += map[char] ?? char;
  return out
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

function cleanLocationName(value?: string | null) {
  return String(value || '')
    .trim()
    .replace(/^(?:гр\.?|град|обл\.?|област)\s+/i, '')
    .replace(/\s+/g, ' ');
}

function normalizeKey(value?: string | null) {
  return cleanLocationName(value).toLocaleLowerCase('bg-BG');
}

function decodeHtmlAmp(value: string) {
  return value.replace(/&amp;/gi, '&');
}
