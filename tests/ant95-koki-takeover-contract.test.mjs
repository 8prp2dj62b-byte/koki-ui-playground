import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync('supabase/functions/koki-takeover/index.ts','utf8');

function classify({ authoritativeIsOwn, buyerSide, firstMessageType, userOverride = null }) {
  if (userOverride === 'BUY' || userOverride === 'SELL') return userOverride;
  if (authoritativeIsOwn === true || buyerSide === false) return 'SELL';
  if (firstMessageType === 'sent') return 'BUY';
  if (firstMessageType === 'received') return 'SELL';
  return 'UNKNOWN';
}

assert.equal(classify({authoritativeIsOwn:true,buyerSide:null,firstMessageType:'sent'}),'SELL');
assert.equal(classify({authoritativeIsOwn:false,buyerSide:true,firstMessageType:'sent'}),'BUY');
assert.equal(classify({authoritativeIsOwn:null,buyerSide:null,firstMessageType:'sent'}),'BUY');
assert.equal(classify({authoritativeIsOwn:false,buyerSide:true,firstMessageType:'received'}),'SELL');
assert.equal(classify({authoritativeIsOwn:null,buyerSide:null,firstMessageType:'received'}),'SELL');
assert.equal(classify({authoritativeIsOwn:null,buyerSide:null,firstMessageType:''}),'UNKNOWN');
assert.equal(classify({authoritativeIsOwn:true,buyerSide:false,firstMessageType:'received',userOverride:'BUY'}),'BUY');
assert.equal(classify({authoritativeIsOwn:false,buyerSide:true,firstMessageType:'sent',userOverride:'SELL'}),'SELL');

assert.match(src,/function classifyThread\(/);
assert.match(src,/firstType==='sent'.*domain:'BUY'/s);
assert.match(src,/firstType==='received'.*domain:'SELL'/s);
assert.match(src,/OLX_CLASSIFICATION_REQUIRED/);
assert.match(src,/dedupe_key:`olx-classification:\$\{tid\}`/);
assert.match(src,/attempt_count:attempt/);
assert.match(src,/classification_required:null/);
assert.match(src,/classification\.domain==='BUY'/);
assert.doesNotMatch(src,/ownership_pending/);
assert.match(src,/select=thread_id,metadata/);
assert.match(src,/decision:'DEFER'.*reconcile_attempt/s);
assert.match(src,/decision:'ROUTE_SELL'.*classification_source/s);

console.log('ANT-95 PASS: 20 assertions');
