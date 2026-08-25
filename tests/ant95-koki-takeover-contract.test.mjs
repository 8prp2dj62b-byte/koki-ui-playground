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

assert.match(src,/async function authProfile\(/);
assert.match(src,/\/auth\/v1\/user/);
assert.match(src,/rpc\/koki_current_profile/);
assert.match(src,/owner_profile_id=eq\.\$\{encodeURIComponent\(pid\)\}/);
assert.match(src,/action==='list_classification_decisions'/);
assert.match(src,/action==='resolve_classification'/);
assert.match(src,/source:'USER_OVERRIDE'/);
assert.match(src,/classification_override:/);
assert.match(src,/USER_OVERRIDE_REQUESTED/);
assert.match(src,/USER_OVERRIDE_APPLIED/);
assert.match(src,/classification_not_applied/);
assert.match(src,/status:'queued_reauth_required'/);

console.log('ANT-95 PASS: 32 assertions');
