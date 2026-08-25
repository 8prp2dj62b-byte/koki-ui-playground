import assert from 'node:assert/strict';
import fs from 'node:fs';

const mod=fs.readFileSync('supabase/functions/koki-takeover/listing_reconcile.ts','utf8');
const takeover=fs.readFileSync('supabase/functions/koki-takeover/index.ts','utf8');

function classifyRemoteListing(ad){
  if(!ad||typeof ad!=='object')return'UNKNOWN_EXTERNAL_STATE';
  const s=String(ad.status??ad.state??ad.advert_status??'').trim().toLowerCase();
  if(ad.is_active===false||ad.active===false||['inactive','archived','disabled','removed','sold','expired','deleted'].includes(s))return s==='deleted'?'DELETED_EXTERNAL':'INACTIVE';
  if(ad.is_active===true||ad.active===true||['active','activated','published','enabled'].includes(s))return'ACTIVE';
  return Number(ad.id)>0?'ACTIVE':'UNKNOWN_EXTERNAL_STATE';
}
function decision({present=false,directStatus=200,directState='UNKNOWN_EXTERNAL_STATE',missing=1,verifiedAbsent=false}){
  if(present)return'ACTIVE';
  if(directStatus===404)return'DELETED_EXTERNAL';
  if([0,408,429,500,502,503,504].includes(directStatus))return'UNKNOWN_EXTERNAL_STATE';
  if(directState==='INACTIVE')return'INACTIVE';
  if(directState==='ACTIVE')return'ACTIVE';
  if(verifiedAbsent&&missing>=2)return'DELETED_EXTERNAL';
  return'UNKNOWN_EXTERNAL_STATE';
}

assert.equal(classifyRemoteListing({id:1,status:'active'}),'ACTIVE');
assert.equal(classifyRemoteListing({id:1,status:'archived'}),'INACTIVE');
assert.equal(classifyRemoteListing({id:1,status:'deleted'}),'DELETED_EXTERNAL');
assert.equal(decision({present:true}),'ACTIVE');
assert.equal(decision({directStatus:404}),'DELETED_EXTERNAL');
assert.equal(decision({directStatus:500}),'UNKNOWN_EXTERNAL_STATE');
assert.equal(decision({directStatus:429}),'UNKNOWN_EXTERNAL_STATE');
assert.equal(decision({directStatus:0}),'UNKNOWN_EXTERNAL_STATE');
assert.equal(decision({verifiedAbsent:true,missing:1}),'UNKNOWN_EXTERNAL_STATE');
assert.equal(decision({verifiedAbsent:true,missing:2}),'DELETED_EXTERNAL');
assert.equal(decision({directState:'INACTIVE'}),'INACTIVE');
assert.equal(decision({directState:'ACTIVE'}),'ACTIVE');

assert.match(mod,/inventory_\$\{inv\.response\.status\}/);
assert.match(mod,/status=in\.\(PUBLISHED,DELETED_EXTERNAL,INACTIVE\)/);
assert.match(mod,/status:'DELETED_EXTERNAL',workflow_state:'DELETED_EXTERNAL'/);
assert.match(mod,/runtime_mode:'SLEEPING',next_reconcile_at:null/);
assert.match(mod,/control_owner:'PAUSED'/);
assert.match(mod,/domain=eq\.SELL/);
assert.match(mod,/OLX_LISTING_MISSING/);
assert.match(mod,/OLX_LISTING_DELETED/);
assert.match(mod,/TWO_SUCCESSFUL_INVENTORIES_AND_VERIFIED_ABSENCE/);
assert.match(mod,/prev\.state!=='DELETED_EXTERNAL'&&notify/);
assert.match(mod,/Обявата е премахната от OLX/);
assert.match(mod,/KOKI спря автоматизацията и премести обявата в историята/);
assert.doesNotMatch(mod,/method:'DELETE'/);
assert.match(mod,/external_missing_count:miss/);
assert.match(mod,/external_last_seen_at:now/);
assert.match(mod,/state:'UNKNOWN_EXTERNAL_STATE'/);
assert.match(mod,/status:'PUBLISHED',workflow_state:'PUBLISHED'/);

// Integration hook must be present in takeover but may run only on bounded account-level reconcile cadence.
assert.match(takeover,/reconcileDeletedOwnListings/);
assert.match(takeover,/shouldListingReconcile/);
assert.match(takeover,/600000/);
assert.match(takeover,/koki-push-service/);

// Protected ANT-95 classifier remains intact.
assert.match(takeover,/function classifyThread\(/);
assert.match(takeover,/source:'USER_OVERRIDE'/);
assert.match(takeover,/firstType==='sent'.*domain:'BUY'/s);
assert.match(takeover,/firstType==='received'.*domain:'SELL'/s);

console.log('ANT-96 PASS: deleted-listing reconciliation contract');
