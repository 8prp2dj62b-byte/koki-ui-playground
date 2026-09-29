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

const slivenHouseRequest: PropertySearchRequest = {
  operation: 'search_properties',
  transaction: 'sale',
  propertyTypes: ['house'],
  location: { city: 'Сливен' },
  requiredFeatures: [],
  preferredFeatures: [],
  excludedFeatures: [],
  freeTextConstraints: [],
};

const popovoHouseRequest: PropertySearchRequest = {
  operation: 'search_properties',
  transaction: 'sale',
  propertyTypes: ['house'],
  location: { city: 'Попово' },
  requiredFeatures: [],
  preferredFeatures: [],
  excludedFeatures: [],
  freeTextConstraints: [],
};

const taxonomyHtml = `
  <html><body>
    <a href="/obiavi/prodazhbi/grad-sliven">Имоти град Сливен</a>
    <a href="/obiavi/prodazhbi/oblast-sliven">Имоти област Сливен</a>
    <a href="/obiavi/prodazhbi/oblast-sliven/gr-sliven">гр. Сливен в област Сливен</a>
    <a href="/obiavi/prodazhbi/oblast-blagoevgrad/gr-bansko">гр. Банско</a>
  </body></html>`;

const taxonomyFetch: typeof fetch = async (input) => {
  const url = String(input);
  if (url.includes('/sitemap/obiavi/prodazhbi')) return new Response(taxonomyHtml, { status: 200 });
  if (url === 'https://www.imot.bg/obiavi/prodazhbi') return new Response(taxonomyHtml, { status: 200 });
  return new Response('', { status: 200 });
};

const popovoDiscoveryFetch: typeof fetch = async (input) => {
  const url = String(input);
  if (url.includes('/sitemap/obiavi/prodazhbi')) {
    return new Response('<a href="/obiavi/prodazhbi/oblast-targovishte">област Търговище</a>', { status: 200 });
  }
  if (url === 'https://www.imot.bg/obiavi/prodazhbi') {
    return new Response('<a href="/obiavi/prodazhbi/oblast-targovishte">област Търговище</a>', { status: 200 });
  }
  if (url === 'https://www.imot.bg/obiavi/prodazhbi/oblast-targovishte') {
    return new Response(`
      <a href="/obiavi/prodazhbi/oblast-targovishte/gr-omurtag">гр. Омуртаг</a>
      <a href="/obiavi/prodazhbi/oblast-targovishte/gr-popovo">гр. Попово</a>
    `, { status: 200 });
  }
  return new Response('', { status: 200 });
};

test('Gemini JSON contract is accepted 1:1', () => {
  assert.doesNotThrow(() => assertPropertySearchRequest(banskoRequest));
});

test('contract rejects source-specific URLs from Gemini', () => {
  const bad = { ...banskoRequest, freeTextConstraints: ['https://www.imot.bg/obiavi/foo'] };
  assert.throws(() => assertPropertySearchRequest(bad), /SOURCE_SPECIFIC_VALUE_FORBIDDEN/);
});

test('Bansko 3-room request maps through imot.bg taxonomy to the public route', async () => {
  const client = new ImotClient(undefined, taxonomyFetch);
  assert.equal(
    await client.buildSearchUrl(banskoRequest),
    'https://www.imot.bg/obiavi/prodazhbi/oblast-blagoevgrad/gr-bansko/tristaen'
  );
});

test('Sliven house request resolves dynamically instead of failing hardcoded city taxonomy', async () => {
  const client = new ImotClient(undefined, taxonomyFetch);
  assert.equal(
    await client.buildSearchUrl(slivenHouseRequest),
    'https://www.imot.bg/obiavi/prodazhbi/grad-sliven/kashta'
  );
});

test('Popovo is discovered from the live oblast taxonomy even when absent from sitemap/root', async () => {
  const client = new ImotClient(undefined, popovoDiscoveryFetch);
  assert.equal(
    await client.buildSearchUrl(popovoHouseRequest),
    'https://www.imot.bg/obiavi/prodazhbi/oblast-targovishte/gr-popovo/kashta'
  );
});

test('search parser only returns real /obiava-* links and deduplicates by listing id', () => {
  const client = new ImotClient(undefined, async () => new Response(''));
  const html = `
    <html><body>
      <article>
        <a href="/obiava-1c178281172887622-real-one" title="Тристаен Банско">Тристаен Банско</a>
        <span>120 000 €</span><span>90 м²</span><span>1 333 €/m²</span>
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
