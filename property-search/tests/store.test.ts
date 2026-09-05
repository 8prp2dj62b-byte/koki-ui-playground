import test from 'node:test';
import assert from 'node:assert/strict';
import { PropertySearchStore, listingSourceFingerprint } from '../store.js';
import type { PropertyListing, PropertySearchRequest } from '../types.js';

const request: PropertySearchRequest = {
  operation: 'search_properties',
  transaction: 'sale',
  propertyTypes: ['3-room'],
  location: { city: 'Банско' },
  price: { max: 140000, currency: 'EUR' },
  area: { min: 80 },
  floor: { exclude: [1] },
  requiredFeatures: [],
  preferredFeatures: [],
  excludedFeatures: [],
  freeTextConstraints: [],
};

function listing(overrides: Partial<PropertyListing> = {}): PropertyListing {
  return {
    source: 'imot.bg',
    listingId: '1c178281172887622',
    canonicalUrl: 'https://www.imot.bg/obiava-1c178281172887622-real',
    title: 'Тристаен апартамент Банско',
    price: 120000,
    currency: 'EUR',
    areaM2: 90,
    pricePerM2: 1333,
    locationText: 'гр. Банско',
    thumbnailUrl: null,
    fetchedAt: '2026-09-05T10:00:00.000Z',
    description: 'Описание',
    propertyType: 'тристаен',
    floor: 3,
    totalFloors: 5,
    constructionType: 'тухла',
    constructionYear: 2020,
    seller: { type: 'agency', name: 'Agency' },
    contact: { phone: '+359888123456', inquiryUrl: null },
    imageUrls: [],
    publishedAt: null,
    ...overrides,
  };
}

test('fetch time alone never produces a source change', () => {
  const a = listing({ fetchedAt: '2026-09-05T10:00:00.000Z' });
  const b = listing({ fetchedAt: '2026-09-06T10:00:00.000Z' });
  assert.equal(listingSourceFingerprint(a), listingSourceFingerprint(b));
});

test('real source price change changes fingerprint', () => {
  assert.notEqual(
    listingSourceFingerprint(listing({ price: 120000 })),
    listingSourceFingerprint(listing({ price: 115000 }))
  );
});

test('saved searches are isolated by KOKI owner', () => {
  const store = new PropertySearchStore(':memory:');
  const created = store.createSearch({
    ownerKey: 'koki-profile-a',
    title: '3-room Bansko',
    originalText: '3-стаен в Банско',
    request,
  });

  assert.equal(store.getSearch('koki-profile-a', created.id)?.id, created.id);
  assert.equal(store.getSearch('koki-profile-b', created.id), null);
});
