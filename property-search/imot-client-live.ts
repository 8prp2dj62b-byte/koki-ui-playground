import * as cheerio from 'cheerio';
import { ImotClient as BaseImotClient, type ListingCache } from './imot-client.js';
import type { PropertyListing, PropertyListingSummary } from './types.js';

/**
 * Production-facing ImotClient.
 *
 * The base parser deliberately stays conservative. imot.bg commonly renders prices using
 * the € symbol, so this layer fills numeric price fields from the SAME source HTML when
 * the base parser did not recognize them. It never rewrites source text or uses AI.
 */
export class ImotClient extends BaseImotClient {
  constructor(cache?: ListingCache, fetchImpl: typeof fetch = fetch) {
    super(cache, fetchImpl);
  }

  override parseSearchPage(html: string, pageUrl: string): PropertyListingSummary[] {
    const rows = super.parseSearchPage(html, pageUrl);
    const $ = cheerio.load(html);

    for (const row of rows) {
      if (row.price != null && row.pricePerM2 != null) continue;
      const anchor = $(`a[href*="/obiava-${cssEscape(row.listingId)}"]`).first();
      if (!anchor.length) continue;
      const card = findCard($, anchor);
      const text = cleanText(card.text());
      if (row.price == null) {
        const price = firstEuroNumber(text, /([0-9][0-9\s.,]*)\s*€/);
        if (price != null) {
          row.price = price;
          row.currency = 'EUR';
        }
      }
      if (row.pricePerM2 == null) {
        row.pricePerM2 = firstEuroNumber(text, /([0-9][0-9\s.,]*)\s*€\s*\/?\s*(?:кв\.?\s*м|m²|m2|м²|м2)/i);
      }
    }
    return rows;
  }

  override parseListingPage(html: string, pageUrl: string, expectedId: string): PropertyListing {
    const listing = super.parseListingPage(html, pageUrl, expectedId);
    if (listing.price != null && listing.pricePerM2 != null) return listing;

    const $ = cheerio.load(html);
    const text = cleanText($('body').text());
    if (listing.price == null) {
      const price = firstEuroNumber(text, /([0-9][0-9\s.,]*)\s*€/);
      if (price != null) {
        listing.price = price;
        listing.currency = 'EUR';
      }
    }
    if (listing.pricePerM2 == null) {
      listing.pricePerM2 = firstEuroNumber(text, /([0-9][0-9\s.,]*)\s*€\s*\/?\s*(?:кв\.?\s*м|m²|m2|м²|м2)/i);
    }
    return listing;
  }
}

function cleanText(value?: string | null) {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function numeric(value: string) {
  const cleaned = value.replace(/\s/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function firstEuroNumber(text: string, re: RegExp) {
  const match = text.match(re);
  return match ? numeric(match[1]) : null;
}

function findCard($: cheerio.CheerioAPI, anchor: cheerio.Cheerio<any>) {
  for (const selector of ['article', 'li', 'tr']) {
    const node = anchor.closest(selector);
    if (node.length) return node;
  }
  return anchor.parent();
}

function cssEscape(value: string) {
  return value.replace(/(["\\])/g, '\\$1');
}
