import * as cheerio from 'cheerio';
import {
  assertPropertySearchRequest,
  type PropertyListing,
  type PropertyListingSummary,
  type PropertySearchRequest,
  type PropertySearchResult,
  type PropertyType,
} from './types.js';

const BASE = 'https://www.imot.bg';
const MAX_PAGES = 50;

const TYPE_SLUG: Partial<Record<PropertyType, string>> = {
  studio: 'ednostaen',
  '1-room': 'ednostaen',
  '2-room': 'dvustaen',
  '3-room': 'tristaen',
  '4-room': 'chetiristaen',
  'multi-room': 'mnogostaen',
  maisonette: 'mezonet',
  house: 'kashta',
  villa: 'vila',
  land: 'partsel',
  office: 'ofis',
  shop: 'magazin',
  garage: 'garazh',
  'parking-space': 'garazh',
  warehouse: 'sklad',
};

const CITY_ROUTE: Record<string, string> = {
  bansko: 'oblast-blagoevgrad/gr-bansko',
  'банско': 'oblast-blagoevgrad/gr-bansko',
  sofia: 'grad-sofiya',
  'софия': 'grad-sofiya',
  plovdiv: 'grad-plovdiv',
  'пловдив': 'grad-plovdiv',
  varna: 'grad-varna',
  'варна': 'grad-varna',
  burgas: 'grad-burgas',
  'бургас': 'grad-burgas',
};

export interface ListingCache {
  get(listingId: string): Promise<PropertyListing | null>;
  put(listing: PropertyListing): Promise<void>;
}

export class ImotClient {
  constructor(
    private readonly cache?: ListingCache,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async search(input: PropertySearchRequest): Promise<PropertySearchResult> {
    assertPropertySearchRequest(input);
    const request = input;
    const baseUrl = this.buildSearchUrl(request);
    const summaries = new Map<string, PropertyListingSummary>();
    let pagesFetched = 0;
    let rejected = 0;

    for (let page = 1; page <= MAX_PAGES; page++) {
      const url = page === 1 ? baseUrl : `${baseUrl}/p-${page}`;
      const html = await this.getText(url);
      pagesFetched++;
      const parsed = this.parseSearchPage(html, url);
      let newOnPage = 0;
      for (const item of parsed) {
        if (!this.summaryMatchesStructuredFilters(item, request)) continue;
        if (!summaries.has(item.listingId)) newOnPage++;
        summaries.set(item.listingId, item);
      }
      if (parsed.length === 0 || (page > 1 && newOnPage === 0)) break;
    }

    const listings: PropertyListing[] = [];
    let detailsFetched = 0;

    for (const summary of summaries.values()) {
      try {
        let listing = await this.cache?.get(summary.listingId) ?? null;
        if (!listing || this.summaryChanged(summary, listing)) {
          listing = await this.getListing(summary.listingId, summary.canonicalUrl);
          detailsFetched++;
          await this.cache?.put(listing);
        }
        if (!this.detailMatchesDeterministicConstraints(listing, request)) continue;
        listings.push(listing);
      } catch {
        rejected++;
      }
    }

    return {
      source: 'imot.bg',
      request,
      fetchedAt: new Date().toISOString(),
      listings,
      stats: {
        pagesFetched,
        summariesFound: summaries.size,
        detailsFetched,
        rejected,
      },
    };
  }

  async getListing(listingId: string, canonicalUrl?: string): Promise<PropertyListing> {
    if (!/^[a-z0-9]+$/i.test(listingId)) throw new Error('INVALID_LISTING_ID');
    const url = canonicalUrl ?? `${BASE}/obiava-${listingId}`;
    const parsed = new URL(url);
    if (parsed.hostname !== 'www.imot.bg' && parsed.hostname !== 'imot.bg') {
      throw new Error('INVALID_LISTING_HOST');
    }
    const html = await this.getText(parsed.toString());
    return this.parseListingPage(html, parsed.toString(), listingId);
  }

  buildSearchUrl(request: PropertySearchRequest): string {
    if (!request.transaction) throw new Error('IMOT_TRANSACTION_REQUIRED');
    if (request.propertyTypes.length !== 1) throw new Error('IMOT_V1_REQUIRES_ONE_PROPERTY_TYPE');
    const city = request.location.city?.trim().toLocaleLowerCase('bg-BG');
    if (!city) throw new Error('IMOT_CITY_REQUIRED');
    const cityRoute = CITY_ROUTE[city];
    if (!cityRoute) throw new Error(`IMOT_TAXONOMY_RESOLUTION_FAILED:${request.location.city}`);
    const typeRoute = TYPE_SLUG[request.propertyTypes[0]];
    if (!typeRoute) throw new Error(`IMOT_PROPERTY_TYPE_UNSUPPORTED:${request.propertyTypes[0]}`);
    const transaction = request.transaction === 'sale' ? 'prodazhbi' : 'naemi';
    return `${BASE}/obiavi/${transaction}/${cityRoute}/${typeRoute}`;
  }

  parseSearchPage(html: string, pageUrl: string): PropertyListingSummary[] {
    const $ = cheerio.load(html);
    const found = new Map<string, PropertyListingSummary>();
    $('a[href*="/obiava-"]').each((_, node) => {
      const a = $(node);
      const href = a.attr('href');
      if (!href) return;
      let canonicalUrl: string;
      try { canonicalUrl = new URL(href, pageUrl).toString(); } catch { return; }
      const id = extractListingId(canonicalUrl);
      if (!id) return;
      const host = new URL(canonicalUrl).hostname;
      if (host !== 'www.imot.bg' && host !== 'imot.bg') return;

      const card = closestUsefulCard($, a);
      const text = cleanText(card.text());
      const title = cleanText(a.attr('title') || a.text()) || null;
      const price = firstNumber(text, /([0-9][0-9\s.,]*)\s*(?:€|EUR)\b/i);
      const area = firstNumber(text, /([0-9]+(?:[.,][0-9]+)?)\s*(?:кв\.?\s*м|m²|m2|м²|м2)/i);
      const ppm = firstNumber(text, /([0-9][0-9\s.,]*)\s*(?:€|EUR)\s*\/?\s*(?:кв\.?\s*м|m²|m2|м²|м2)/i);
      const img = card.find('img').first();
      const thumbnail = absoluteHttpUrl(img.attr('src') || img.attr('data-src'), pageUrl);

      found.set(id, {
        source: 'imot.bg',
        listingId: id,
        canonicalUrl,
        title,
        price,
        currency: price == null ? null : 'EUR',
        areaM2: area,
        pricePerM2: ppm,
        locationText: inferLocationText(text),
        thumbnailUrl: thumbnail,
        fetchedAt: new Date().toISOString(),
      });
    });
    return [...found.values()];
  }

  parseListingPage(html: string, pageUrl: string, expectedId: string): PropertyListing {
    const $ = cheerio.load(html);
    const canonical = absoluteHttpUrl($('link[rel="canonical"]').attr('href'), pageUrl) ?? pageUrl;
    const id = extractListingId(canonical) ?? extractListingId(pageUrl);
    if (!id || id !== expectedId) throw new Error('LISTING_ID_MISMATCH');

    const bodyText = cleanText($('body').text());
    const h1 = cleanText($('h1').first().text());
    const title = h1 || cleanText($('title').text()) || null;
    const description = pickDescription($);
    const price = firstNumber(bodyText, /([0-9][0-9\s.,]*)\s*(?:€|EUR)\b/i);
    const area = firstNumber(bodyText, /([0-9]+(?:[.,][0-9]+)?)\s*(?:кв\.?\s*м|m²|m2|м²|м2)/i);
    const ppm = firstNumber(bodyText, /([0-9][0-9\s.,]*)\s*(?:€|EUR)\s*\/?\s*(?:кв\.?\s*м|m²|m2|м²|м2)/i);
    const floor = firstInteger(bodyText, /(?:етаж|ет\.)\s*[:\-]?\s*([0-9]+)/i);
    const totalFloors = firstInteger(bodyText, /(?:от|\/|общо)\s*([0-9]+)\s*(?:етажа|ет\.)/i);
    const year = firstInteger(bodyText, /(?:година|г\.)\s*[:\-]?\s*((?:19|20)[0-9]{2})/i);
    const constructionType = firstMatch(bodyText, /(тухла|панел|епк|гредоред|ново строителство)/i);

    const tel = $('a[href^="tel:"]').first().attr('href');
    const phone = tel ? tel.replace(/^tel:/i, '').trim() || null : null;
    const inquiry = $('a').filter((_, el) => /запитване|изпрати съобщение|контакт/i.test(cleanText($(el).text()))).first().attr('href');
    const inquiryUrl = absoluteHttpUrl(inquiry, pageUrl);

    const agencyLink = $('a[href*="agency"],a[href*="agenc"]').first();
    const agencyName = cleanText(agencyLink.text()) || null;
    const sellerType: 'agency' | 'private' | 'unknown' = agencyName
      ? 'agency'
      : /частно лице|собственик/i.test(bodyText) ? 'private' : 'unknown';

    const images = new Set<string>();
    $('img').each((_, el) => {
      const src = absoluteHttpUrl($(el).attr('src') || $(el).attr('data-src'), pageUrl);
      if (!src) return;
      try {
        const host = new URL(src).hostname.toLowerCase();
        if ((host.includes('imot') || host.includes('focus.bg')) && !/logo|icon|sprite/i.test(src)) images.add(src);
      } catch {}
    });

    const summary: PropertyListing = {
      source: 'imot.bg',
      listingId: id,
      canonicalUrl: canonical,
      title,
      price,
      currency: price == null ? null : 'EUR',
      areaM2: area,
      pricePerM2: ppm,
      locationText: inferLocationText(bodyText),
      thumbnailUrl: images.values().next().value ?? null,
      fetchedAt: new Date().toISOString(),
      description,
      propertyType: inferPropertyType(title || bodyText),
      floor,
      totalFloors,
      constructionType: constructionType ? constructionType.toLocaleLowerCase('bg-BG') : null,
      constructionYear: year,
      seller: { type: sellerType, name: agencyName },
      contact: { phone, inquiryUrl },
      imageUrls: [...images],
      publishedAt: inferPublishedDate(bodyText),
    };

    validateListing(summary);
    return summary;
  }

  private summaryMatchesStructuredFilters(item: PropertyListingSummary, request: PropertySearchRequest) {
    if (request.price?.min != null && item.price != null && item.price < request.price.min) return false;
    if (request.price?.max != null && item.price != null && item.price > request.price.max) return false;
    if (request.area?.min != null && item.areaM2 != null && item.areaM2 < request.area.min) return false;
    if (request.area?.max != null && item.areaM2 != null && item.areaM2 > request.area.max) return false;
    return true;
  }

  private detailMatchesDeterministicConstraints(item: PropertyListing, request: PropertySearchRequest) {
    if (!this.summaryMatchesStructuredFilters(item, request)) return false;
    if (request.floor?.min != null && item.floor != null && item.floor < request.floor.min) return false;
    if (request.floor?.max != null && item.floor != null && item.floor > request.floor.max) return false;
    if (item.floor != null && request.floor?.exclude?.includes(item.floor)) return false;

    const sourceText = normalize(`${item.title ?? ''} ${item.description ?? ''}`);
    for (const excluded of request.excludedFeatures) {
      if (containsConstraint(sourceText, excluded)) return false;
    }
    for (const required of request.requiredFeatures) {
      if (!containsConstraint(sourceText, required)) return false;
    }
    for (const constraint of request.freeTextConstraints ?? []) {
      if (!containsConstraint(sourceText, constraint)) return false;
    }
    // preferredFeatures intentionally do not exclude listings.
    return true;
  }

  private summaryChanged(summary: PropertyListingSummary, cached: PropertyListing) {
    return summary.price !== cached.price || summary.areaM2 !== cached.areaM2 || summary.title !== cached.title;
  }

  private async getText(url: string) {
    const parsed = new URL(url);
    if (parsed.hostname !== 'www.imot.bg' && parsed.hostname !== 'imot.bg') throw new Error('IMOT_HOST_FORBIDDEN');
    const res = await this.fetchImpl(url, {
      method: 'GET',
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'bg-BG,bg;q=0.9,en;q=0.7',
        'user-agent': 'KOKI-PropertySearch/1.0 (+personal search assistant; low-rate crawler)',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 429) throw new Error('IMOT_RATE_LIMITED');
    if (!res.ok) throw new Error(`IMOT_HTTP_${res.status}`);
    return await res.text();
  }
}

function extractListingId(url: string) {
  const m = url.match(/\/obiava-([a-z0-9]+)/i);
  return m?.[1] ?? null;
}

function closestUsefulCard($: cheerio.CheerioAPI, a: cheerio.Cheerio<any>) {
  for (const selector of ['article','li','tr']) {
    const x = a.closest(selector);
    if (x.length && cleanText(x.text()).length < 6000) return x;
  }
  let x = a.parent();
  for (let i = 0; i < 4 && x.length; i++, x = x.parent()) {
    const t = cleanText(x.text());
    if (t.length > 40 && t.length < 3000) return x;
  }
  return a.parent();
}

function cleanText(value?: string | null) {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function numeric(value: string) {
  const cleaned = value.replace(/\s/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function firstNumber(text: string, re: RegExp) {
  const m = text.match(re);
  return m ? numeric(m[1]) : null;
}

function firstInteger(text: string, re: RegExp) {
  const m = text.match(re);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) ? n : null;
}

function firstMatch(text: string, re: RegExp) {
  return text.match(re)?.[1] ?? null;
}

function absoluteHttpUrl(value: string | undefined, base: string) {
  if (!value) return null;
  try {
    const u = new URL(value, base);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch { return null; }
}

function pickDescription($: cheerio.CheerioAPI) {
  const candidates: string[] = [];
  $('[class*="descr"],[id*="descr"],[class*="description"],[id*="description"]').each((_, el) => {
    const t = cleanText($(el).text());
    if (t.length >= 80) candidates.push(t);
  });
  if (!candidates.length) {
    $('p').each((_, el) => {
      const t = cleanText($(el).text());
      if (t.length >= 120) candidates.push(t);
    });
  }
  candidates.sort((a, b) => b.length - a.length);
  return candidates[0] ?? null;
}

function inferLocationText(text: string) {
  const m = text.match(/(?:гр\.?|град)\s*[А-ЯA-Z][^|,;]{1,60}/i);
  return m ? cleanText(m[0]) : null;
}

function inferPropertyType(text: string) {
  const m = text.match(/(едностаен|двустаен|тристаен|четиристаен|многостаен|мезонет|къща|вила|парцел|офис|магазин|гараж|склад)/i);
  return m?.[1]?.toLocaleLowerCase('bg-BG') ?? null;
}

function inferPublishedDate(text: string) {
  const m = text.match(/(?:публикувана|коригирана|добавена)[^0-9]{0,20}([0-3]?\d[.\/-][01]?\d[.\/-](?:20)?\d{2})/i);
  return m?.[1] ?? null;
}

function normalize(value: string) {
  return value.toLocaleLowerCase('bg-BG').replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
}

function containsConstraint(normalizedSourceText: string, rawConstraint: string) {
  const tokens = normalize(rawConstraint).split(' ').filter(t => t.length >= 3);
  if (!tokens.length) return true;
  return tokens.every(token => normalizedSourceText.includes(token));
}

function validateListing(item: PropertyListing) {
  if (item.source !== 'imot.bg') throw new Error('LISTING_SOURCE_INVALID');
  if (!item.listingId) throw new Error('LISTING_ID_REQUIRED');
  const u = new URL(item.canonicalUrl);
  if (u.hostname !== 'www.imot.bg' && u.hostname !== 'imot.bg') throw new Error('LISTING_URL_INVALID');
  if (item.price != null && item.price <= 0) throw new Error('LISTING_PRICE_INVALID');
  if (item.areaM2 != null && item.areaM2 <= 0) throw new Error('LISTING_AREA_INVALID');
}
