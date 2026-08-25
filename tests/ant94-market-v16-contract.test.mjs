import test from 'node:test';
import assert from 'node:assert/strict';
import {parseBingRss,isRawDatasetRow,validateMarketReport} from '../supabase/functions/koki-command-center-staging-v49/core.js';

test('raw dataset contains exactly title/url/snippet',()=>{
  const xml='<rss><channel><item><title>Apple &amp; Phone</title><link>https://shop.example/p</link><description>Цена 999 EUR</description></item></channel></rss>';
  const [row]=parseBingRss(xml);
  assert.deepEqual(Object.keys(row).sort(),['snippet','title','url']);
  assert.equal(isRawDatasetRow(row),true);
  assert.equal(row.title,'Apple & Phone');
});

test('READY used report is validated, not recalculated',()=>{
  const report={status:'READY',research_method:'USED_MARKET',accepted_used_listings:[{title:'a',url:'https://a.bg/1',price_eur:400,classification:'EXACT'},{title:'b',url:'https://b.bg/2',price_eur:500,classification:'STRONG_COMPARABLE'},{title:'c',url:'https://c.bg/3',price_eur:600,classification:'EXACT'}],retail_sources:[],market:{n:3,min_eur:400,max_eur:600,mean_eur:500,median_eur:500,new_average_eur:null,used_baseline_eur:null},tiers:[1,2,3,4,5].map(x=>({tier:String(x),code:String(x),label_bg:String(x),min_eur:x,max_eur:x+1})),target_evaluation:{target_price_eur:500,tier:'FAIR_MARKET',tier_code:'FAIR_MARKET',tier_label_bg:'Пазарна цена',difference_from_mean_eur:0,difference_from_mean_percent:0,rationale_bg:'ok'},summary_bg:'ok',confidence:'HIGH'};
  assert.deepEqual(validateMarketReport(report),{ok:true,reason:'OK'});
});

test('retail fallback requires three distinct merchant domains',()=>{
  const base={status:'READY',research_method:'NEW_RETAIL_FALLBACK',accepted_used_listings:[],market:{n:3,min_eur:350,max_eur:650,mean_eur:500,median_eur:500,new_average_eur:1000,used_baseline_eur:500},tiers:[1,2,3,4,5].map(x=>({tier:String(x),code:String(x),label_bg:String(x),min_eur:x,max_eur:x+1})),target_evaluation:{target_price_eur:500,tier:'FAIR_MARKET',tier_code:'FAIR_MARKET',tier_label_bg:'Пазарна цена',difference_from_mean_eur:0,difference_from_mean_percent:0,rationale_bg:'ok'},summary_bg:'ok',confidence:'HIGH'};
  assert.equal(validateMarketReport({...base,retail_sources:[{merchant:'a',url:'https://a.bg/1',price_eur:900},{merchant:'b',url:'https://b.bg/2',price_eur:1000},{merchant:'c',url:'https://c.bg/3',price_eur:1100}]}).ok,true);
  assert.equal(validateMarketReport({...base,retail_sources:[{merchant:'a1',url:'https://a.bg/1',price_eur:900},{merchant:'a2',url:'https://a.bg/2',price_eur:1000},{merchant:'c',url:'https://c.bg/3',price_eur:1100}]}).ok,false);
});

test('INSUFFICIENT is a valid terminal result only with NONE',()=>{
  assert.equal(validateMarketReport({status:'INSUFFICIENT',research_method:'NONE'}).ok,true);
  assert.equal(validateMarketReport({status:'INSUFFICIENT',research_method:'USED_MARKET'}).ok,false);
});
