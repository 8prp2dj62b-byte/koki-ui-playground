import test from 'node:test';
import assert from 'node:assert/strict';
import { ImotClient } from '../imot-client-live.js';
import { assertPropertySearchRequest, type PropertySearchRequest } from '../types.js';

const banskoRequest: PropertySearchRequest = {
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

test('Gemini JSON contract is accepted 1:1', () => {
  assert.doesNotThrow(() => assertPropertySearchRequest(banskoRequest));
});

test('contract rejects source-specific URLs from Gemini', () => {
  const bad = { ...banskoRequest, freeTextConstraints: ['https://www.imot.bg/obiavi/foo'] };
  assert.throws(() => assertPropertySearchRequest(bad), /SOURCE_SPECIFIC_VALUE_FORBIDDEN/);
});

test('Bansko 3-room request maps to the known public imot.bg route', () => {
  const client = new ImotClient(undefined, async () => new Response(''));
  assert.equal(
    client.buildSearchUrl(banskoRequest),
    'https://www.imot.bg/obiavi/prodazhbi/oblast-blagoevgrad/gr-bansko/tristaen'
  );
});

test('search parser only returns real /obiava-* links and deduplicates by listing id', () => {
  const client = new ImotClient(undefined, async () => new Response(''));
  const html = `
    <html><body>
      <article>
        <a href="/obiava-1c178281172887622-real-one" title="Тристаен Банско">Тристаен Банско</a>
        <span>120 000 €</span><span>90 м²</span><span>1 333 €/м²</span>
        <img src="https://imotstatic2.focus.bg/imot/photos/test.jpg">
      </article>
      <article><a href="/search/prodazhbi">not a listing</a></article>
      <article><a href="/obiava-1c178281172887622-duplicate">duplicate</a></article>
    </body></html>`;
  const result = client.parseSearchPage(html, 'https://www.imot.bg/obiavi/prodazhbi/oblast-blagoevgrad/gr-bansko/tristaen');
  assert.equal(result.length, 1);
  assert.equal(result[0].listingId, '1c178281172887622');
  assert.equal(result[0].price, 120000);
  assert.equal(result[0].areaM2, 90);
  assert.equal(result[0].pricePerM2, 1333);
});

test('detail parser leaves phone null when source does not expose tel link', () => {
  const client = new ImotClient(undefined, async () => new Response(''));
  const html = `
    <html><head>
      <link rel="canonical" href="https://www.imot.bg/obiava-1c178281172887622-real-one">
      <title>Тристаен апартамент Банско</title>
    </head><body>
      <h1>Тристаен апартамент Банско</h1>
      <div class="description">Реално описание на имота с достатъчно текст за parser-а. Апартаментът е с площ 90 м² и цена 120 000 €. Това е само тестов source HTML.</div>
      <span>120 000 €</span><span>90 м²</span><span>етаж 3</span>
    </body></html>`;
  const listing = client.parseListingPage(
    html,
    'https://www.imot.bg/obiava-1c178281172887622-real-one',
    '1c178281172887622'
  );
  assert.equal(listing.contact.phone, null);
  assert.equal(listing.price, 120000);
  assert.equal(listing.areaM2, 90);
  assert.equal(listing.floor, 3);
});

test('detail parser uses phone only from actual tel: source value', () => {
  const client = new ImotClient(undefined, async () => new Response(''));
  const html = `
    <html><head><link rel="canonical" href="https://www.imot.bg/obiava-abc123-real"></head><body>
      <h1>Тристаен</h1><p>Цена 100 000 €, площ 85 м². Достатъчно описание за тестовата реална страница и контакт.</p>
      <a href="tel:+359888123456">Обади се</a>
    </body></html>`;
  const listing = client.parseListingPage(html, 'https://www.imot.bg/obiava-abc123-real', 'abc123');
  assert.equal(listing.contact.phone, '+359888123456');
});
