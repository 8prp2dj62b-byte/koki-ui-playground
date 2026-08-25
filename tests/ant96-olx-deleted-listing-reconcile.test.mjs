import assert from 'node:assert/strict';
import fs from 'node:fs';

const mod=fs.readFileSync('supabase/functions/koki-takeover/listing_reconcile.ts','utf8');
const takeover=fs.readFileSync('supabase/functions/koki-takeover/index.ts','utf8');

function decide({inventoryOk,present,directStatus,directState,missing=1,verifiedAbsent=false}){
  if(!inventoryOk)return'NO_CHANGE';
  if(present)return directState==='INACTIVE'?'INACTIVE':'ACTIVE';
  if(directStatus===404)return'DELETED_EXTERNAL';
  if([0,408,429,500,502,503,504].includes(directStatus))return'UNKNOWN_EXTERNAL_STATE';
  if(directState==='INACTIVE')return'INACTIVE';
  if(directState==='ACTIVE')return'ACTIVE';
  if(verifiedAbsent&&missing>=2)return'DELETED_EXTERNAL';
  return'UNKNOWN_EXTERNAL_STATE';
}

assert.equal(decide({inventoryOk:true,present:true,directStatus:null,directState:'ACTIVE'}),'ACTIVE');
assert.equal(decide({inventoryOk:true,present:true,directStatus:null,directState:'INACTIVE'}),'INACTIVE');
assert.equal(decide({inventoryOk:false,present:false,directStatus:404,directState:null}),'NO_CHANGE');
assert.equal(decide({inventoryOk:true,present:false,directStatus:404,directState:null}),'DELETED_EXTERNAL');
assert.equal(decide({inventoryOk:true,present:false,directStatus:500,directState:null}),'UNKNOWN_EXTERNAL_STATE');
assert.equal(decide({inventoryOk:true,present:false,directStatus:429,directState:null}),'UNKNOWN_EXTERNAL_STATE');
assert.equal(decide({inventoryOk:true,present:false,directStatus:0,directState:null}),'UNKNOWN_EXTERNAL_STATE');
assert.equal(decide({inventoryOk:true,present:false,directStatus:200,directState:'ACTIVE'}),'ACTIVE');
assert.equal(decide({inventoryOk:true,present:false,directStatus:200,directState:'INACTIVE'}),'INACTIVE');
assert.equal(decide({inventoryOk:true,present:false,directStatus:200,directState:'UNKNOWN_EXTERNAL_STATE',missing:1,verifiedAbsent:true}),'UNKNOWN_EXTERNAL_STATE');
assert.equal(decide({inventoryOk:true,present:false,directStatus:200,directState:'UNKNOWN_EXTERNAL_STATE',missing:2,verifiedAbsent:true}),'DELETED_EXTERNAL');

// Canonical SELL state only: no draft/new-sale workflow mutation.
assert.match(mod,/koki_sell_listings\?select=\*/);
assert.match(mod,/koki_sell_sales\?select=\*/);
assert.doesNotMatch(mod,/koki_listing_drafts_v3/);
assert.doesNotMatch(mod,/workflow_state/);
assert.doesNotMatch(mod,/status:'DELETED_EXTERNAL'/);
assert.match(mod,/writeListing\(row,base,'INACTIVE'/);
assert.match(mod,/external_lifecycle/);
assert.match(mod,/state:'DELETED_EXTERNAL'/);

// Negative reconciliation is destructive only after definitive evidence.
assert.match(mod,/status===404/);
assert.match(mod,/TWO_SUCCESSFUL_INVENTORIES_AND_VERIFIED_ABSENCE/);
assert.match(mod,/if\(!inventory\.ok\)return\{ok:false,skipped:true/);
assert.match(mod,/inventory_invalid_shape/);
assert.match(mod,/offset<2000;offset\+=100/);
assert.match(mod,/OLX_LISTING_MISSING/);
assert.match(mod,/OLX_LISTING_VERIFY_FAILED/);

// Terminal SELL cleanup preserves history/domain and stops automation.
assert.match(mod,/domain:'SELL',runtime_mode:'SLEEPING'/);
assert.match(mod,/control_owner:'PAUSED'/);
assert.match(mod,/buyer_intelligence:/);
assert.doesNotMatch(mod,/method:'DELETE'/);
assert.match(mod,/prev\.state!=='DELETED_EXTERNAL'/);
assert.match(mod,/dedupe_key:`olx-listing-deleted:/);

// Informational notification and verified reappearance are in scope.
assert.match(mod,/event_type:'OLX_LISTING_DELETED'/);
assert.match(mod,/Обявата е премахната от OLX/);
assert.match(mod,/KOKI спря автоматизацията и премести обявата в историята/);
assert.match(mod,/OLX_LISTING_REACTIVATED/);
assert.match(mod,/prior_business_status/);

// Integration is bounded inside existing takeover; protected ANT-95 classifier remains unchanged.
assert.match(takeover,/reconcileDeletedOwnListings/);
assert.match(takeover,/shouldListingReconcile/);
assert.match(takeover,/600000/);
assert.match(takeover,/function classifyThread\(/);
assert.match(takeover,/source:'USER_OVERRIDE'/);
assert.match(takeover,/firstType==='sent'.*domain:'BUY'/s);
assert.match(takeover,/firstType==='received'.*domain:'SELL'/s);

console.log('ANT-96 PASS: canonical deleted-listing reconciliation contract');
