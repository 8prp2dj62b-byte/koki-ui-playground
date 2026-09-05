import * as cheerio from 'cheerio';
import type { PropertyType } from './types.js';

const BASE = 'https://www.imot.bg';

type TransactionRoute = 'prodazhbi' | 'naemi';

export interface ImotLocationRequest {
  city?: string;
  municipality?: string;
  district?: string;
  neighborhoods?: string[];
}

export interface ImotFormControlOption {
  value: string;
  label: string;
}

export interface ImotFormControl {
  kind: 'select' | 'checkbox' | 'radio';
  name: string;
  label: string | null;
  options: ImotFormControlOption[];
}

export interface ImotNavigationOption {
  label: string;
  path: string;
}

export interface ImotGeminiNomenclature {
  source: 'imot.bg';
  capturedAt: string;
  transactions: Array<{ requestValue: 'sale' | 'rent'; sourceRoute: TransactionRoute }>;
  propertyTypes: Array<{ requestValue: PropertyType; sourceSlug: string | null }>;
  locationRoutes: { sale: string[]; rent: string[] };
  navigation: { sale: ImotNavigationOption[]; rent: ImotNavigationOption[] };
  formControls: { sale: ImotFormControl[]; rent: ImotFormControl[] };
}

export const PROPERTY_TYPE_SOURCE_SLUG: Partial<Record<PropertyType, string>> = {
  studio: 'ednostaen',
  '1-room': 'ednostaen',
  '2-room': 'dvustaen',
  '3-room': 'tristaen',
  '4-room': 'chetiristaen',
  'multi-room': 'mnogostaen',
  maisonette: 'mezonet',
  house: 'kashta',
  villa: 'vila',
  'floor-of-house': 'etazh-ot-kashta',
  land: 'partsel',
  office: 'ofis',
  shop: 'magazin',
  garage: 'garazh-parkomyasto',
  'parking-space': 'garazh-parkomyasto',
  warehouse: 'sklad',
  industrial: 'promishleno-pomeshtenie',
  hotel: 'hotel',
};

const PROPERTY_TYPES: PropertyType[] = [
  'studio','1-room','2-room','3-room','4-room','multi-room','maisonette','house','villa',
  'floor-of-house','land','office','shop','garage','parking-space','warehouse','industrial','hotel','other',
];

/** Source-owned taxonomy resolver. Gemini sees the full current source snapshot; only ImotClient builds source URLs. */
export class ImotTaxonomyResolver {
  private readonly routeCache = new Map<string, string>();
  private readonly taxonomyCache = new Map<TransactionRoute, Promise<string[]>>();
  private fullSnapshotCache: Promise<ImotGeminiNomenclature> | null = null;

  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async getGeminiNomenclature(): Promise<ImotGeminiNomenclature> {
    if (!this.fullSnapshotCache) this.fullSnapshotCache = this.loadFullSnapshot();
    try {
      return await this.fullSnapshotCache;
    } catch (error) {
      this.fullSnapshotCache = null;
      throw error;
    }
  }

  async resolveLocationRoute(location: ImotLocationRequest, transaction: TransactionRoute): Promise<string> {
    const city = cleanLocationName(location.city);
    const district = cleanLocationName(location.district);
    if (!city && !district) throw new Error('IMOT_LOCATION_REQUIRED');

    const cacheKey = `${transaction}|${normalizeKey(city)}|${normalizeKey(district)}`;
    const cached = this.routeCache.get(cacheKey);
    if (cached) return cached;

    const paths = await this.getTaxonomyPaths(transaction);
    const route = city ? resolveCityRoute(paths, city, district) : resolveDistrictRoute(paths, district!);
    if (!route) throw new Error(`IMOT_TAXONOMY_RESOLUTION_FAILED:${city || district || ''}`);
    this.routeCache.set(cacheKey, route);
    return route;
  }

  private async loadFullSnapshot(): Promise<ImotGeminiNomenclature> {
    const [saleRoutes, rentRoutes, saleSearchHtml, rentSearchHtml] = await Promise.all([
      this.getTaxonomyPaths('prodazhbi'),
      this.getTaxonomyPaths('naemi'),
      this.getText(`${BASE}/search/prodazhbi`),
      this.getText(`${BASE}/search/naemi`),
    ]);

    if (!saleRoutes.length || !rentRoutes.length) throw new Error('IMOT_NOMENCLATURE_UNAVAILABLE');

    return {
      source: 'imot.bg',
      capturedAt: new Date().toISOString(),
      transactions: [
        { requestValue: 'sale', sourceRoute: 'prodazhbi' },
        { requestValue: 'rent', sourceRoute: 'naemi' },
      ],
      propertyTypes: PROPERTY_TYPES.map(requestValue => ({
        requestValue,
        sourceSlug: PROPERTY_TYPE_SOURCE_SLUG[requestValue] ?? null,
      })),
      locationRoutes: {
        sale: [...saleRoutes].sort(),
        rent: [...rentRoutes].sort(),
      },
      navigation: {
        sale: extractNavigationOptions(saleSearchHtml, 'prodazhbi'),
        rent: extractNavigationOptions(rentSearchHtml, 'naemi'),
      },
      formControls: {
        sale: extractFormControls(saleSearchHtml),
        rent: extractFormControls(rentSearchHtml),
      },
    };
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
    } catch {}

    const html = await this.getText(`${BASE}/obiavi/${transaction}`);
    return extractImotTaxonomyPaths(html, transaction);
  }

  private async getText(url: string) {
    const parsed = new URL(url);
    if (parsed.hostname !== 'www.imot.bg' && parsed.hostname !== 'imot.bg') throw new Error('IMOT_HOST_FORBIDDEN');
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
    const bytes = new Uint8Array(await response.arrayBuffer());
    const contentType = response.headers.get('content-type') || '';
    const charset = contentType.match(/charset\s*=\s*([^;\s]+)/i)?.[1]?.replace(/["']/g, '') || 'utf-8';
    try { return new TextDecoder(charset).decode(bytes); }
    catch { return new TextDecoder('utf-8').decode(bytes); }
  }
}

export function extractNavigationOptions(html: string, transaction: TransactionRoute): ImotNavigationOption[] {
  const $ = cheerio.load(html);
  const found = new Map<string, ImotNavigationOption>();

  $('a[href]').each((_, element) => {
    const node = $(element);
    const href = node.attr('href');
    if (!href) return;

    let url: URL;
    try { url = new URL(href, BASE); } catch { return; }
    if (url.hostname !== 'www.imot.bg' && url.hostname !== 'imot.bg') return;
    if (url.pathname.includes('/obiava-')) return;

    const relevant = url.pathname.startsWith(`/obiavi/${transaction}`)
      || url.pathname.startsWith('/search/');
    if (!relevant) return;

    const label = cleanText(node.text() || node.attr('title'));
    if (!label) return;

    const path = `${url.pathname}${url.search}`;
    const key = `${label}\u0000${path}`;
    if (!found.has(key)) found.set(key, { label, path });
  });

  return [...found.values()].sort((a, b) => `${a.label}:${a.path}`.localeCompare(`${b.label}:${b.path}`, 'bg'));
}

export function extractFormControls(html: string): ImotFormControl[] {
  const $ = cheerio.load(html);
  const controls: ImotFormControl[] = [];

  $('select').each((_, element) => {
    const node = $(element);
    const name = node.attr('name') || node.attr('id');
    if (!name) return;
    const options: ImotFormControlOption[] = [];
    node.find('option').each((__, option) => {
      const label = cleanText($(option).text());
      const value = String($(option).attr('value') ?? '').trim();
      if (!label && !value) return;
      options.push({ value, label });
    });
    controls.push({ kind: 'select', name, label: findControlLabel($, node), options });
  });

  const grouped = new Map<string, ImotFormControl>();
  $('input[type="checkbox"],input[type="radio"]').each((_, element) => {
    const node = $(element);
    const kind = String(node.attr('type')).toLowerCase() as 'checkbox' | 'radio';
    const name = node.attr('name') || node.attr('id');
    if (!name) return;
    const key = `${kind}:${name}`;
    let group = grouped.get(key);
    if (!group) {
      group = { kind, name, label: null, options: [] };
      grouped.set(key, group);
    }
    const label = findControlLabel($, node) || String(node.attr('value') ?? '').trim();
    const value = String(node.attr('value') ?? '').trim();
    if (label || value) group.options.push({ value, label: label || value });
  });
  controls.push(...grouped.values());

  return controls
    .filter(control => control.options.length > 0)
    .sort((a, b) => `${a.kind}:${a.name}`.localeCompare(`${b.kind}:${b.name}`));
}

export function extractImotTaxonomyPaths(html: string, transaction: TransactionRoute): string[] {
  const prefix = `/obiavi/${transaction}/`;
  const result = new Set<string>();
  const hrefRe = /href\s*=\s*["']([^"']+)["']/gi;
  for (let match = hrefRe.exec(html); match; match = hrefRe.exec(html)) {
    let url: URL;
    try { url = new URL(match[1].replace(/&amp;/gi, '&'), BASE); } catch { continue; }
    if (url.hostname !== 'www.imot.bg' && url.hostname !== 'imot.bg') continue;
    if (!url.pathname.startsWith(prefix)) continue;
    const route = url.pathname.slice(prefix.length).replace(/^\/+|\/+$/g, '');
    if (route) result.add(route);
  }
  return [...result];
}

export function resolveCityRoute(paths: string[], city: string, district?: string | null): string | null {
  const citySlug = imotSlug(city);
  if (!citySlug) return null;
  const districtSlug = district ? imotSlug(district) : '';
  const topLevel = uniquePrefixRoutes(paths, `grad-${citySlug}`);
  if (topLevel.length === 1 && !districtSlug) return topLevel[0];

  let nested = uniquePrefixRoutes(paths, `gr-${citySlug}`);
  if (districtSlug) {
    nested = nested.filter(route => route.split('/').includes(`oblast-${districtSlug}`));
    if (topLevel.length === 1 && normalizeKey(city) === normalizeKey(district)) return topLevel[0];
  }
  if (nested.length === 1) return nested[0];
  if (topLevel.length === 1) return topLevel[0];
  if (nested.length > 1) throw new Error(`IMOT_LOCATION_AMBIGUOUS:${city}`);
  return null;
}

export function resolveDistrictRoute(paths: string[], district: string): string | null {
  const routes = uniquePrefixRoutes(paths, `oblast-${imotSlug(district)}`);
  return routes.length === 1 ? routes[0] : null;
}

function uniquePrefixRoutes(paths: string[], wantedSegment: string): string[] {
  const result = new Set<string>();
  for (const path of paths) {
    const segments = path.split('/').filter(Boolean);
    const index = segments.indexOf(wantedSegment);
    if (index >= 0) result.add(segments.slice(0, index + 1).join('/'));
  }
  return [...result];
}

export function imotSlug(value: string): string {
  const text = cleanLocationName(value).toLocaleLowerCase('bg-BG');
  const map: Record<string, string> = {
    'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'h','ц':'ts','ч':'ch','ш':'sh','щ':'sht','ъ':'a','ь':'y','ю':'yu','я':'ya',
  };
  let out = '';
  for (const char of text) out += map[char] ?? char;
  return out.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/-+/g, '-');
}

function findControlLabel($: cheerio.CheerioAPI, node: cheerio.Cheerio<any>) {
  const id = node.attr('id');
  if (id) {
    const explicit = cleanText($(`label[for="${cssEscape(id)}"]`).first().text());
    if (explicit) return explicit;
  }
  const wrapped = cleanText(node.closest('label').text());
  return wrapped || null;
}

function cssEscape(value: string) { return value.replace(/(["\\])/g, '\\$1'); }
function cleanText(value?: string | null) { return String(value || '').replace(/\s+/g, ' ').trim(); }
function cleanLocationName(value?: string | null) { return cleanText(value).replace(/^(?:гр\.?|град|обл\.?|област)\s+/i, ''); }
function normalizeKey(value?: string | null) { return cleanLocationName(value).toLocaleLowerCase('bg-BG'); }
