import * as cheerio from 'cheerio';
import { ImotClient as BaseImotClient, type ListingCache } from './imot-client.js';
import type { PropertyListing, PropertyListingSummary } from './types.js';

/**
 * Production-facing ImotClient.
 *
 * This layer only repairs fields from the SAME imot.bg source HTML when a repeated listing
 * anchor or the € symbol leaves a conservative base-parser field empty. No AI and no
 * inferred values are involved.
 */
export class ImotClient extends BaseImotClient {
  constructor(cache?: ListingCache, fetchImpl: typeof fetch = fetch) {
    super(cache, fetchImpl);
  }

  override parseSearchPage(html: string, pageUrl: string): PropertyListingSummary[] {
    const rows = super.parseSearchPage(html, pageUrl);
    const $ = cheerio.load(html);

    for (const row of rows) {
      const anchor = $(`a[href*="/obiava-${cssEscape(row.listingId)}"]`).first();
      if (!anchor.length) continue;
      const card = findCard($, anchor);
      const text = cleanText(card.text());

      // A listing ID may appear in more than one link. Prefer source facts from the first
      // useful result card instead of allowing a later navigation/image link to null them.
      if (!row.title) row.title = cleanText(anchor.attr('title') || anchor.text()) || null;
      if (row.areaM2 == null) {
        row.areaM2 = firstNumber(text, /([0-9]+(?:[.,][0-9]+)?)\s*(?:кв\.?\s*м|m²|m2|м²|м2)/i);
      }
      if (!row.thumbnailUrl) {
        const image = card.find('img').first();
        row.thumbnailUrl = absoluteHttpUrl(image.attr('src') || image.attr('data-src'), pageUrl);
      }

      if (row.price == null) {
        const price = firstNumber(text, /([0-9][0-9\s.,]*)\s*(?:€|EUR)/i);
        if (price != null) {
          row.price = price;
          row.currency = 'EUR';
        }
      }
      if (row.pricePerM2 == null) {
        row.pricePerM2 = firstNumber(text, /([0-9][0-9\s.,]*)\s*(?:€|EUR)\s*\/?\s*(?:кв\.?\s*м|m²|m2|м²|м2)/i);
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
      const price = firstNumber(text, /([0-9][0-9\s.,]*)\s*(?:€|EUR)/i);
      if (price != null) {
        listing.price = price;
        listing.currency = 'EUR';
      }
    }
    if (listing.pricePerM2 == null) {
      listing.pricePerM2 = firstNumber(text, /([0-9][0-9\s.,]*)\s*(?:€|EUR)\s*\/?\s*(?:кв\.?\s*м|m²|m2|м²|м2)/i);
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

function firstNumber(text: string, re: RegExp) {
  const match = text.match(re);
  return match ? numeric(match[1]) : null;
}

function findCard($: cheerio.CheerioAPI, anchor: cheerio.Cheerio<any>) {
  for (const selector of ['article', 'li', 'tr']) {
    const node = anchor.closest(selector);
    if (node.length) return node;
  }
  let node = anchor.parent();
  for (let i = 0; i < 4 && node.length; i++, node = node.parent()) {
    const text = cleanText(node.text());
    if (text.length > 40 && text.length < 3000) return node;
  }
  return anchor.parent();
}

function absoluteHttpUrl(value: string | undefined, base: string) {
  if (!value) return null;
  try {
    const url = new URL(value, base);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function cssEscape(value: string) {
  return value.replace(/(["\\])/g, '\\$1');
}
