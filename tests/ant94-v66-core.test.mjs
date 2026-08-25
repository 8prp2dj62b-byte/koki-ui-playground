import test from 'node:test';
import assert from 'node:assert/strict';
import {parseBingRss,isCatalogicDescription,marketingQuality,buildOfficialPayload,reviewVisibility} from '../supabase/functions/koki-new-sale-v66/core.js';

test('Bing RSS parser extracts and decodes results',()=>{
  const xml='<rss><channel><item><title>iPhone &amp; case</title><link>https://example.com/a</link><description>Цена 500 EUR</description></item></channel></rss>';
  const r=parseBingRss(xml);
  assert.equal(r.length,1); assert.equal(r[0].title,'iPhone & case'); assert.equal(r[0].url,'https://example.com/a');
});

test('catalog-style fact dump is rejected',()=>{
  const d='Основни характеристики:\n- Марка: Apple\n- Модел: iPhone\n- Памет: 512GB\n- Състояние: използвано';
  assert.equal(isCatalogicDescription(d),true);
  assert.equal(marketingQuality(d).valid,false);
});

test('natural truthful copy passes structural quality gate',()=>{
  const d='Продавам използван iPhone 16 Pro с 512GB памет. Телефонът е подходящ за човек, който търси конкретния модел с повече място за снимки и приложения. Състоянието е използвано; останалите детайли са видими на снимките.';
  assert.equal(marketingQuality(d).valid,true);
});

test('official publish payload carries canonical district',()=>{
  const d={id:'62b8c9e3-9a10-4d08-9f7c-7618680f503f',listing_content:{title:'T',description:'D',attributes:{model:'iphone16-pro'}},category:{id:454},media:[{url:'https://x/i.jpg',order:0}],owner_desired_price_eur:500};
  const p=buildOfficialPayload(d,{advertiser_type:'private',contact:{name:'Koki'},location:{city_id:8771,district_id:1393},negotiable:true});
  assert.deepEqual(p.location,{city_id:8771,district_id:1393});
});

test('review remains hidden until market finalization is terminal',()=>{
  assert.equal(reviewVisibility('RUNNING','RUNNING'),'FINALIZING_REVIEW');
  assert.equal(reviewVisibility('DONE','COMPLETED_OK'),'REVIEW_READY');
  assert.equal(reviewVisibility('DONE','COMPLETED_INSUFFICIENT'),'REVIEW_READY');
});
