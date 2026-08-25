export type ExternalListingState='ACTIVE'|'INACTIVE'|'DELETED_EXTERNAL'|'UNKNOWN_EXTERNAL_STATE';

type Supa=(path:string,init?:RequestInit)=>Promise<Response>;
type Olx=(accountId:string,path:string)=>Promise<{response:Response,expected_user_id?:number}>;
type Audit=(event:any)=>Promise<void>;
type Notify=(event:{recipient_profile_id:string,event_type:string,title:string,body:string,dedupe_key?:string,data:any})=>Promise<void>;

const CONTRACT='KOKI_OLX_DELETED_LISTING_RECONCILE_V1';
const iso=()=>new Date().toISOString();
const str=(v:any)=>String(v??'').trim();
const num=(v:any)=>{const n=Number(v);return Number.isFinite(n)&&n>0?n:null};
const terminalBusinessStates=new Set(['INACTIVE','COMPLETED','SOLD','ARCHIVED','DELETED','CANCELLED','CANCELED']);
const inactiveOlxStates=new Set(['new','limited','removed_by_user','outdated','unconfirmed','unpaid','moderated','blocked','disabled','removed_by_moderator','inactive','archived','removed','sold','expired','closed']);

async function json(r:Response){try{return await r.json()}catch{return null}}
function pageOf(raw:any):any[]|null{
  if(Array.isArray(raw))return raw;
  if(Array.isArray(raw?.data))return raw.data;
  if(Array.isArray(raw?.adverts))return raw.adverts;
  if(Array.isArray(raw?.data?.adverts))return raw.data.adverts;
  return null;
}
function contextKey(v:any){for(const k of['metadata','listing_context','context','state_context','olx_context','provenance'])if(v&&Object.prototype.hasOwnProperty.call(v,k))return k;return null}
function lifecycleOf(v:any){const k=contextKey(v),x=k?v?.[k]?.external_lifecycle:null;return x&&typeof x==='object'?x:{}}
function identityOf(v:any){
  const advertCandidates=[v?.advert_id,v?.olx_advert_id,v?.external_advert_id,v?.olx_id,v?.advert?.id,v?.olx?.advert_id,v?.metadata?.advert_id,v?.listing_context?.advert_id,v?.context?.advert_id,v?.published_evidence?.id,v?.published_evidence?.advert_id];
  let advert_id:number|null=null;for(const x of advertCandidates){const n=num(x);if(n){advert_id=n;break}}
  const externalCandidates=[v?.external_id,v?.olx_external_id,v?.advert?.external_id,v?.metadata?.external_id,v?.listing_context?.external_id,v?.context?.external_id,v?.published_evidence?.external_id];
  let external_id:string|null=null;for(const x of externalCandidates){const s=str(x);if(s){external_id=s;break}}
  return{advert_id,external_id};
}
function lifecycleEvent(lc:any,type:string,at:string,extra:any={}){const events=[...(Array.isArray(lc?.events)?lc.events:[]),{type,at,...extra}].slice(-20);return{...(lc||{}),events}}
export function classifyRemoteListing(ad:any):ExternalListingState{
  if(!ad||typeof ad!=='object')return'UNKNOWN_EXTERNAL_STATE';
  const raw=ad?.status?.name??ad?.status??ad?.state??ad?.advert_status,s=str(raw).toLowerCase();
  if(s==='deleted'||s==='not_found')return'DELETED_EXTERNAL';
  if(ad.is_active===false||ad.active===false||inactiveOlxStates.has(s))return'INACTIVE';
  if(ad.is_active===true||ad.active===true||s==='active')return'ACTIVE';
  return num(ad.id)?'UNKNOWN_EXTERNAL_STATE':'UNKNOWN_EXTERNAL_STATE';
}
function belongsToAccount(row:any,sales:any[],accountId:string,ownerProfileId:string){
  const direct=str(row?.olx_account_id??row?.account_id??row?.metadata?.olx_account_id??row?.listing_context?.olx_account_id);if(direct)return direct===accountId;
  const profile=str(row?.owner_profile_id??row?.profile_id??row?.metadata?.owner_profile_id);if(profile&&ownerProfileId)return profile===ownerProfileId;
  const saleId=str(row?.sale_id??row?.sell_sale_id);if(!saleId)return false;
  const sale=sales.find((x:any)=>str(x?.id)===saleId);if(!sale)return false;
  const saleAccount=str(sale?.olx_account_id??sale?.account_id??sale?.metadata?.olx_account_id);if(saleAccount)return saleAccount===accountId;
  const saleProfile=str(sale?.owner_profile_id??sale?.profile_id);return!!ownerProfileId&&saleProfile===ownerProfileId;
}
function managedCandidate(row:any){const lc=lifecycleOf(row);if(lc.state==='DELETED_EXTERNAL'||lc.state==='INACTIVE')return true;return!terminalBusinessStates.has(str(row?.status).toUpperCase())}
function listingPatch(row:any,lc:any,status?:string){
  const patch:any={},k=contextKey(row);if(k)patch[k]={...(row[k]||{}),external_lifecycle:lc};
  if(status&&Object.prototype.hasOwnProperty.call(row,'status'))patch.status=status;
  if(status&&Object.prototype.hasOwnProperty.call(row,'is_active'))patch.is_active=status==='ACTIVE';
  if(status&&Object.prototype.hasOwnProperty.call(row,'active'))patch.active=status==='ACTIVE';
  if(Object.prototype.hasOwnProperty.call(row,'updated_at'))patch.updated_at=iso();
  return patch;
}
async function writeListing(row:any,lc:any,status?:string,supa?:Supa){
  if(!supa)return{applied:false,row:null};const patch=listingPatch(row,lc,status);if(!Object.keys(patch).length)return{applied:false,row:null};
  let path=`koki_sell_listings?id=eq.${encodeURIComponent(row.id)}`;const changing=!!status&&Object.prototype.hasOwnProperty.call(row,'status')&&row.status!=null&&str(row.status)!==status;
  if(changing)path+=`&status=eq.${encodeURIComponent(str(row.status))}`;
  const r=await supa(path,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(patch)});if(!r.ok)return{applied:false,row:null};
  const rows=await json(r),arr=Array.isArray(rows)?rows:[];return{applied:changing?arr.length>0:true,row:arr[0]||null};
}
async function fullOwnInventory(accountId:string,olx:Olx){
  const items:any[]=[];
  for(let offset=0;offset<2000;offset+=100){
    let x:any;try{x=await olx(accountId,`/adverts?limit=100&offset=${offset}`)}catch(e){return{ok:false,status:0,error:`inventory_error:${str((e as any)?.message||e).slice(0,120)}`,items:[]}}
    if(!x.response.ok)return{ok:false,status:x.response.status,error:`inventory_${x.response.status}`,items:[]};
    const raw=await json(x.response),page=pageOf(raw);if(page===null)return{ok:false,status:x.response.status,error:'inventory_invalid_shape',items:[]};
    items.push(...page);if(page.length<100)return{ok:true,status:200,error:null,items};
  }
  return{ok:true,status:200,error:null,items};
}
async function verifyRemote(accountId:string,identity:{advert_id:number|null,external_id:string|null},olx:Olx){
  if(!identity.advert_id&&!identity.external_id)return{state:'UNKNOWN_EXTERNAL_STATE' as ExternalListingState,reason:'REMOTE_IDENTITY_MISSING',verifiedAbsent:false,remote:null,status:0};
  const path=identity.advert_id?`/adverts/${identity.advert_id}`:`/adverts?external_id=${encodeURIComponent(identity.external_id!)}&limit=20`;
  try{
    const x=await olx(accountId,path),status=x.response.status;
    if(status===404)return{state:'DELETED_EXTERNAL' as ExternalListingState,reason:'OLX_404_NOT_FOUND',verifiedAbsent:true,remote:null,status};
    if(!x.response.ok)return{state:'UNKNOWN_EXTERNAL_STATE' as ExternalListingState,reason:`OLX_${status}`,verifiedAbsent:false,remote:null,status};
    const raw=await json(x.response),data=raw?.data??raw;
    if(identity.advert_id){const state=classifyRemoteListing(data);return{state,reason:state==='DELETED_EXTERNAL'?'OLX_DELETED_STATE':'OLX_DIRECT_VERIFY',verifiedAbsent:state==='DELETED_EXTERNAL',remote:data,status}}
    const rows=pageOf(data);if(rows===null)return{state:'UNKNOWN_EXTERNAL_STATE' as ExternalListingState,reason:'VERIFY_INVALID_SHAPE',verifiedAbsent:false,remote:null,status};
    const match=rows.find((a:any)=>str(a?.external_id)===identity.external_id)||null;
    return match?{state:classifyRemoteListing(match),reason:'OLX_EXTERNAL_ID_VERIFY',verifiedAbsent:false,remote:match,status}:{state:'UNKNOWN_EXTERNAL_STATE' as ExternalListingState,reason:'OLX_VERIFIED_ABSENT',verifiedAbsent:true,remote:null,status};
  }catch(e){return{state:'UNKNOWN_EXTERNAL_STATE' as ExternalListingState,reason:`OLX_VERIFY_ERROR:${str((e as any)?.message||e).slice(0,120)}`,verifiedAbsent:false,remote:null,status:0}}
}
function sameListing(row:any,identity:{advert_id:number|null,external_id:string|null}){const rid=identityOf(row?.metadata||row||{}),sameId=!!identity.advert_id&&rid.advert_id===identity.advert_id,sameExt=!!identity.external_id&&rid.external_id===identity.external_id;return sameId||sameExt}
async function pauseSellAutomation(accountId:string,identity:{advert_id:number|null,external_id:string|null},externalState:'INACTIVE'|'DELETED_EXTERNAL',now:string,supa:Supa){
  const rr=await supa(`koki_olx_thread_runtime?olx_account_id=eq.${encodeURIComponent(accountId)}&domain=eq.SELL&select=thread_id,domain,runtime_mode,metadata`);if(!rr.ok)return{ok:false,paused:0};
  const rows=await json(rr),all=Array.isArray(rows)?rows:[],matched=all.filter((row:any)=>sameListing(row,identity)),tids:number[]=[];let ok=true;
  for(const row of matched){const tid=Number(row.thread_id);if(!Number.isFinite(tid))continue;tids.push(tid);const m=row.metadata||{},tr=await supa(`koki_olx_thread_runtime?olx_account_id=eq.${encodeURIComponent(accountId)}&thread_id=eq.${tid}`,{method:'PATCH',body:JSON.stringify({domain:'SELL',runtime_mode:'SLEEPING',next_reconcile_at:null,metadata:{...m,external_listing_state:externalState,external_advert_id:identity.advert_id,external_id:identity.external_id,external_listing_changed_at:now,external_listing_prior_runtime_mode:m.external_listing_prior_runtime_mode||row.runtime_mode||'HOT'},updated_at:now})}).catch(()=>null);if(!tr?.ok)ok=false}
  if(tids.length){const cr=await supa(`koki_sell_conversations?thread_id=in.(${tids.join(',')})&select=id,thread_id,buyer_intelligence,control_owner`);if(!cr.ok)ok=false;else{const convs=await json(cr);for(const c of(Array.isArray(convs)?convs:[])){const bi=c.buyer_intelligence||{},r=await supa(`koki_sell_conversations?id=eq.${encodeURIComponent(c.id)}`,{method:'PATCH',body:JSON.stringify({control_owner:'PAUSED',buyer_intelligence:{...bi,external_listing_state:externalState,external_advert_id:identity.advert_id,external_id:identity.external_id,external_listing_changed_at:now,external_listing_prior_control_owner:bi.external_listing_prior_control_owner||c.control_owner||'KOKI_AUTO'},updated_at:now})}).catch(()=>null);if(!r?.ok)ok=false}}}
  return{ok,paused:tids.length};
}
async function reactivateSellAutomation(accountId:string,identity:{advert_id:number|null,external_id:string|null},now:string,supa:Supa){
  const rr=await supa(`koki_olx_thread_runtime?olx_account_id=eq.${encodeURIComponent(accountId)}&domain=eq.SELL&select=thread_id,domain,runtime_mode,metadata`);if(!rr.ok)return{ok:false,reactivated:0};
  const rows=await json(rr),all=Array.isArray(rows)?rows:[],matched=all.filter((row:any)=>sameListing(row,identity)),tids:number[]=[];let ok=true;
  for(const row of matched){const tid=Number(row.thread_id);if(!Number.isFinite(tid))continue;tids.push(tid);const m=row.metadata||{},prior=str(m.external_listing_prior_runtime_mode)||'HOT',r=await supa(`koki_olx_thread_runtime?olx_account_id=eq.${encodeURIComponent(accountId)}&thread_id=eq.${tid}`,{method:'PATCH',body:JSON.stringify({domain:'SELL',runtime_mode:prior,next_reconcile_at:prior==='HOT'?now:null,metadata:{...m,external_listing_state:'ACTIVE',external_listing_changed_at:now,external_listing_prior_runtime_mode:null},updated_at:now})}).catch(()=>null);if(!r?.ok)ok=false}
  if(tids.length){const cr=await supa(`koki_sell_conversations?thread_id=in.(${tids.join(',')})&select=id,thread_id,buyer_intelligence,control_owner`);if(!cr.ok)ok=false;else{const convs=await json(cr);for(const c of(Array.isArray(convs)?convs:[])){const bi=c.buyer_intelligence||{},prior=str(bi.external_listing_prior_control_owner)||'KOKI_AUTO',r=await supa(`koki_sell_conversations?id=eq.${encodeURIComponent(c.id)}`,{method:'PATCH',body:JSON.stringify({control_owner:prior,buyer_intelligence:{...bi,external_listing_state:'ACTIVE',external_listing_changed_at:now,external_listing_prior_control_owner:null},updated_at:now})}).catch(()=>null);if(!r?.ok)ok=false}}}
  return{ok,reactivated:tids.length};
}
async function transitionInactive(row:any,identity:{advert_id:number|null,external_id:string|null},state:'INACTIVE'|'DELETED_EXTERNAL',reason:string,missing:number,now:string,supa:Supa){
  const prev=lifecycleOf(row),base=lifecycleEvent({...prev,state,external_missing_count:missing,first_missing_at:prev.first_missing_at||now,external_last_verified_at:now,external_state_reason:reason,external_state_source:'OLX_DIRECT_VERIFY',prior_business_status:prev.prior_business_status||row?.status||null,...(state==='DELETED_EXTERNAL'?{external_deleted_at:prev.external_deleted_at||now}:{})},state==='DELETED_EXTERNAL'?'OLX_LISTING_DELETED':'OLX_LISTING_INACTIVE',now,{advert_id:identity.advert_id,external_id:identity.external_id,reason});
  return writeListing(row,base,'INACTIVE',supa);
}
export async function reconcileDeletedOwnListings(opts:{accountId:string;ownerProfileId?:string;supa:Supa;olx:Olx;audit:Audit;notify?:Notify;now?:string}){
  const {accountId,supa,olx,audit,notify}=opts,ownerProfileId=str(opts.ownerProfileId),now=opts.now||iso();
  const inventory=await fullOwnInventory(accountId,olx);if(!inventory.ok)return{ok:false,skipped:true,reason:inventory.error,changed:[]};
  const [lr,sr]=await Promise.all([supa('koki_sell_listings?select=*'),supa('koki_sell_sales?select=*')]);if(!lr.ok)return{ok:false,skipped:true,reason:`listings_${lr.status}`,changed:[]};
  const listingRows=await json(lr),saleRows=sr.ok?await json(sr):[],sales=Array.isArray(saleRows)?saleRows:[],owned=(Array.isArray(listingRows)?listingRows:[]).filter((row:any)=>{const id=identityOf(row);return(!!id.advert_id||!!id.external_id)&&belongsToAccount(row,sales,accountId,ownerProfileId)&&managedCandidate(row)});
  const byId=new Map<number,any>(),byExt=new Map<string,any>();for(const ad of inventory.items){const id=num(ad?.id??ad?.advert_id);if(id)byId.set(id,ad);const ext=str(ad?.external_id);if(ext)byExt.set(ext,ad)}
  const changed:any[]=[];
  for(const row of owned){
    const identity=identityOf(row),prev=lifecycleOf(row),present=(identity.advert_id?byId.get(identity.advert_id):null)||(identity.external_id?byExt.get(identity.external_id):null)||null;
    if(present){
      const inventoryState=classifyRemoteListing(present);
      if(inventoryState==='INACTIVE'){
        if(prev.state!=='INACTIVE'){const paused=await pauseSellAutomation(accountId,identity,'INACTIVE',now,supa);if(!paused.ok){await audit({decision:'OLX_LISTING_RECONCILE_FAILED',reason:'AUTOMATION_PAUSE_FAILED',advert_id:identity.advert_id,olx_account_id:accountId}).catch(()=>{});continue}const wr=await transitionInactive(row,identity,'INACTIVE','OLX_INVENTORY_INACTIVE',0,now,supa);if(wr.applied){await audit({decision:'OLX_LISTING_INACTIVE',reason:'OLX_INVENTORY_INACTIVE',advert_id:identity.advert_id,olx_account_id:accountId}).catch(()=>{});changed.push({listing_id:row.id,advert_id:identity.advert_id,state:'INACTIVE',paused_threads:paused.paused})}}
        continue;
      }
      if(prev.state==='DELETED_EXTERNAL'||prev.state==='INACTIVE'){
        await audit({decision:'OLX_LISTING_VERIFY_STARTED',reason:'reactivation_candidate',advert_id:identity.advert_id,olx_account_id:accountId}).catch(()=>{});const v=await verifyRemote(accountId,identity,olx);if(v.state!=='ACTIVE'){changed.push({listing_id:row.id,advert_id:identity.advert_id,state:prev.state,reason:'reactivation_not_verified'});continue}
        const resumed=await reactivateSellAutomation(accountId,identity,now,supa);if(!resumed.ok){await audit({decision:'OLX_LISTING_RECONCILE_FAILED',reason:'AUTOMATION_REACTIVATION_FAILED',advert_id:identity.advert_id,olx_account_id:accountId}).catch(()=>{});continue}
        const restore=str(prev.prior_business_status)||'ACTIVE',lc=lifecycleEvent({...prev,state:'ACTIVE',external_missing_count:0,external_last_seen_at:now,external_last_verified_at:now,external_deleted_at:null,external_state_reason:'OLX_REAPPEARED_VERIFIED',external_state_source:'OLX_DIRECT_VERIFY'},'OLX_LISTING_REACTIVATED',now,{advert_id:identity.advert_id,external_id:identity.external_id});const wr=await writeListing(row,lc,restore,supa);if(wr.applied){await audit({decision:'OLX_LISTING_REACTIVATED',reason:'OLX_REAPPEARED_VERIFIED',advert_id:identity.advert_id,olx_account_id:accountId}).catch(()=>{});changed.push({listing_id:row.id,advert_id:identity.advert_id,state:'ACTIVE',reactivated:true,reactivated_threads:resumed.reactivated})}continue;
      }
      if(prev.state==='UNKNOWN_EXTERNAL_STATE'||Number(prev.external_missing_count||0)>0){const lc={...prev,state:'ACTIVE',external_missing_count:0,external_last_seen_at:now,external_last_verified_at:now,external_state_reason:'OLX_INVENTORY_PRESENT',external_state_source:'OLX_INVENTORY'};await writeListing(row,lc,undefined,supa);changed.push({listing_id:row.id,advert_id:identity.advert_id,state:'ACTIVE'})}
      continue;
    }
    const missing=Number(prev.external_missing_count||0)+1;await audit({decision:'OLX_LISTING_MISSING',reason:'inventory_absent',advert_id:identity.advert_id,olx_account_id:accountId,missing_count:missing}).catch(()=>{});await audit({decision:'OLX_LISTING_VERIFY_STARTED',reason:'inventory_absent',advert_id:identity.advert_id,olx_account_id:accountId,missing_count:missing}).catch(()=>{});const v=await verifyRemote(accountId,identity,olx);
    let terminal=v.state==='DELETED_EXTERNAL';if(v.reason==='OLX_VERIFIED_ABSENT'&&v.verifiedAbsent&&missing>=2)terminal=true;
    if(terminal){const reason=v.state==='DELETED_EXTERNAL'?v.reason:'TWO_SUCCESSFUL_INVENTORIES_AND_VERIFIED_ABSENCE',paused=await pauseSellAutomation(accountId,identity,'DELETED_EXTERNAL',now,supa);if(!paused.ok){await audit({decision:'OLX_LISTING_RECONCILE_FAILED',reason:'AUTOMATION_PAUSE_FAILED',advert_id:identity.advert_id,olx_account_id:accountId}).catch(()=>{});continue}const wr=await transitionInactive(row,identity,'DELETED_EXTERNAL',reason,missing,now,supa);if(wr.applied&&prev.state!=='DELETED_EXTERNAL'){await audit({decision:'OLX_LISTING_DELETED',reason,advert_id:identity.advert_id,olx_account_id:accountId}).catch(()=>{});if(notify&&ownerProfileId)await notify({recipient_profile_id:ownerProfileId,event_type:'OLX_LISTING_DELETED',title:'Обявата е премахната от OLX',body:'KOKI спря автоматизацията и премести обявата в историята.',dedupe_key:`olx-listing-deleted:${accountId}:${identity.advert_id||identity.external_id}`,data:{listing_id:row.id,advert_id:identity.advert_id,external_id:identity.external_id,external_state:'DELETED_EXTERNAL'}}).catch(()=>{});changed.push({listing_id:row.id,advert_id:identity.advert_id,state:'DELETED_EXTERNAL',reason,paused_threads:paused.paused})}else changed.push({listing_id:row.id,advert_id:identity.advert_id,state:'DELETED_EXTERNAL',reason,idempotent:true});continue}
    if(v.state==='INACTIVE'){const paused=await pauseSellAutomation(accountId,identity,'INACTIVE',now,supa);if(!paused.ok){await audit({decision:'OLX_LISTING_RECONCILE_FAILED',reason:'AUTOMATION_PAUSE_FAILED',advert_id:identity.advert_id,olx_account_id:accountId}).catch(()=>{});continue}const wr=await transitionInactive(row,identity,'INACTIVE',v.reason,missing,now,supa);if(wr.applied&&prev.state!=='INACTIVE'){await audit({decision:'OLX_LISTING_INACTIVE',reason:v.reason,advert_id:identity.advert_id,olx_account_id:accountId}).catch(()=>{});changed.push({listing_id:row.id,advert_id:identity.advert_id,state:'INACTIVE',reason:v.reason,paused_threads:paused.paused})}continue}
    if(v.state==='ACTIVE'){const lc={...prev,state:'ACTIVE',external_missing_count:0,external_last_seen_at:now,external_last_verified_at:now,external_state_reason:v.reason,external_state_source:'OLX_DIRECT_VERIFY'};await writeListing(row,lc,undefined,supa);changed.push({listing_id:row.id,advert_id:identity.advert_id,state:'ACTIVE',reason:'inventory_eventual_consistency'});continue}
    let lc=lifecycleEvent({...prev,state:'UNKNOWN_EXTERNAL_STATE',external_missing_count:missing,first_missing_at:prev.first_missing_at||now,external_last_verified_at:now,external_state_reason:v.reason,external_state_source:'OLX_RECONCILE'},'OLX_LISTING_VERIFY_FAILED',now,{advert_id:identity.advert_id,external_id:identity.external_id,status:v.status});lc=lifecycleEvent(lc,'OLX_LISTING_MISSING',now,{advert_id:identity.advert_id,external_id:identity.external_id,missing_count:missing});await writeListing(row,lc,undefined,supa);changed.push({listing_id:row.id,advert_id:identity.advert_id,state:'UNKNOWN_EXTERNAL_STATE',reason:v.reason});
  }
  return{ok:true,contract:CONTRACT,skipped:false,inventory_count:inventory.items.length,checked:owned.length,changed};
}
