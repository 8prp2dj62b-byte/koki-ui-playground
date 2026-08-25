export type ExternalListingState='ACTIVE'|'INACTIVE'|'DELETED_EXTERNAL'|'UNKNOWN_EXTERNAL_STATE';

type Supa=(path:string,init?:RequestInit)=>Promise<Response>;
type Olx=(accountId:string,path:string)=>Promise<{response:Response,expected_user_id?:number}>;
type Audit=(event:any)=>Promise<void>;
type Notify=(event:{recipient_profile_id:string,event_type:string,title:string,body:string,data:any})=>Promise<void>;

const iso=()=>new Date().toISOString();
const str=(v:any)=>String(v??'').trim();
const num=(v:any)=>{const n=Number(v);return Number.isFinite(n)&&n>0?n:null};

export function externalIdForDraft(id:string){return `koki-${String(id).replace(/-/g,'').slice(0,27)}`}
export function remoteIdentity(v:any){
  const x=v?.published_evidence??v??{};
  return {
    advert_id:num(x?.id??x?.advert_id??x?.advert?.id??x?.data?.id??x?.remote?.id),
    external_id:str(x?.external_id??x?.advert?.external_id??x?.data?.external_id??x?.remote?.external_id)||null
  };
}
export function classifyRemoteListing(ad:any):ExternalListingState{
  if(!ad||typeof ad!=='object')return'UNKNOWN_EXTERNAL_STATE';
  const s=str(ad.status??ad.state??ad.advert_status).toLowerCase();
  if(ad.is_active===false||ad.active===false||['inactive','archived','disabled','removed','sold','expired','deleted'].includes(s))return s==='deleted'?'DELETED_EXTERNAL':'INACTIVE';
  if(ad.is_active===true||ad.active===true||['active','activated','published','enabled'].includes(s))return'ACTIVE';
  return num(ad.id)?'ACTIVE':'UNKNOWN_EXTERNAL_STATE';
}
function rowsOf(data:any){if(Array.isArray(data))return data;if(Array.isArray(data?.data))return data.data;if(Array.isArray(data?.adverts))return data.adverts;return[]}
function lifecycleOf(d:any){return d?.published_evidence?.koki_external_lifecycle||{}}
async function json(r:Response){try{return await r.json()}catch{return null}}

async function pauseSellAutomation(accountId:string,advertId:number|null,externalId:string|null,now:string,supa:Supa){
  const rr=await supa(`koki_olx_thread_runtime?olx_account_id=eq.${encodeURIComponent(accountId)}&domain=eq.SELL&select=thread_id,domain,runtime_mode,metadata`);
  if(!rr.ok)return 0;
  const rows=await json(rr)||[];let paused=0;
  for(const row of rows){
    const m=row?.metadata||{},rid=num(m.advert_id??m?.classification_required?.advert_id),rext=str(m.external_id??m.advert_external_id)||null;
    if((advertId&&rid===advertId)||(externalId&&rext===externalId)){
      const tid=Number(row.thread_id);if(!Number.isFinite(tid))continue;
      const metadata={...m,external_listing_state:'DELETED_EXTERNAL',external_listing_deleted_at:now};
      const tr=await supa(`koki_olx_thread_runtime?olx_account_id=eq.${encodeURIComponent(accountId)}&thread_id=eq.${tid}`,{method:'PATCH',body:JSON.stringify({runtime_mode:'SLEEPING',next_reconcile_at:null,metadata,updated_at:now})});
      if(tr.ok)paused++;
      await supa(`koki_sell_conversations?thread_id=eq.${tid}`,{method:'PATCH',body:JSON.stringify({control_owner:'PAUSED',updated_at:now})}).catch(()=>null);
    }
  }
  return paused;
}

async function verifyRemote(accountId:string,advertId:number|null,externalId:string,olx:Olx){
  const path=advertId?`/adverts/${advertId}`:`/adverts?external_id=${encodeURIComponent(externalId)}&limit=20`;
  try{
    const x=await olx(accountId,path),status=x.response.status;
    if(status===404)return{state:'DELETED_EXTERNAL' as ExternalListingState,reason:'OLX_404',definitive:true,remote:null};
    if(!x.response.ok)return{state:'UNKNOWN_EXTERNAL_STATE' as ExternalListingState,reason:`OLX_${status}`,definitive:false,remote:null};
    const raw=await json(x.response),data=raw?.data??raw;
    if(advertId){return{state:classifyRemoteListing(data),reason:'OLX_DIRECT_VERIFY',definitive:true,remote:data}}
    const match=rowsOf(data).find((a:any)=>str(a?.external_id)===externalId)||null;
    return match?{state:classifyRemoteListing(match),reason:'OLX_EXTERNAL_ID_VERIFY',definitive:true,remote:match}:{state:'UNKNOWN_EXTERNAL_STATE' as ExternalListingState,reason:'OLX_VERIFIED_ABSENT',definitive:false,remote:null};
  }catch(e){return{state:'UNKNOWN_EXTERNAL_STATE' as ExternalListingState,reason:`OLX_VERIFY_ERROR:${str((e as any)?.message||e).slice(0,120)}`,definitive:false,remote:null}}
}

export async function reconcileDeletedOwnListings(opts:{accountId:string;ownerProfileId?:string;supa:Supa;olx:Olx;audit:Audit;notify?:Notify;now?:string}){
  const {accountId,supa,olx,audit,notify}=opts,now=opts.now||iso();
  const inv=await olx(accountId,'/adverts?limit=100').catch(()=>null);
  if(!inv||!inv.response.ok)return{ok:false,skipped:true,reason:inv?`inventory_${inv.response.status}`:'inventory_error',changed:[]};
  const raw=await json(inv.response),inventory=rowsOf(raw?.data??raw),ids=new Set<number>(),exts=new Set<string>();
  for(const ad of inventory){const id=num(ad?.id);if(id)ids.add(id);const e=str(ad?.external_id);if(e)exts.add(e)}
  const dr=await supa(`koki_listing_drafts_v3?olx_account_id=eq.${encodeURIComponent(accountId)}&status=in.(PUBLISHED,DELETED_EXTERNAL,INACTIVE)&select=id,owner_profile_id,olx_account_id,status,workflow_state,published_evidence,updated_at`);
  if(!dr.ok)return{ok:false,skipped:true,reason:`drafts_${dr.status}`,changed:[]};
  const drafts=await json(dr)||[],changed:any[]=[];
  for(const d of drafts){
    const id=String(d.id),identity=remoteIdentity(d),externalId=identity.external_id||externalIdForDraft(id),prev=lifecycleOf(d),missing=Number(prev.external_missing_count||0),present=(identity.advert_id?ids.has(identity.advert_id):false)||exts.has(externalId);
    if(present){
      const next={...prev,state:'ACTIVE',external_last_seen_at:now,external_last_verified_at:now,external_missing_count:0,external_state_reason:'OLX_INVENTORY_PRESENT',external_state_source:'OLX_INVENTORY'};
      if(d.status!=='PUBLISHED'||prev.state!=='ACTIVE'||missing!==0){await supa(`koki_listing_drafts_v3?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify({status:'PUBLISHED',workflow_state:'PUBLISHED',published_evidence:{...(d.published_evidence||{}),koki_external_lifecycle:next},updated_at:now})});changed.push({draft_id:id,advert_id:identity.advert_id,state:'ACTIVE',reason:'OLX_INVENTORY_PRESENT'})}
      continue;
    }
    const miss=missing+1;await audit({decision:'OLX_LISTING_MISSING',reason:'inventory_absent',advert_id:identity.advert_id,olx_account_id:accountId}).catch(()=>{});
    const v=await verifyRemote(accountId,identity.advert_id,externalId,olx);let state=v.state,reason=v.reason;
    if(reason==='OLX_VERIFIED_ABSENT'&&miss>=2){state='DELETED_EXTERNAL';reason='TWO_SUCCESSFUL_INVENTORIES_AND_VERIFIED_ABSENCE'}
    if(state==='DELETED_EXTERNAL'){
      const lifecycle={...prev,state,external_deleted_at:prev.external_deleted_at||now,external_last_verified_at:now,external_missing_count:miss,external_state_reason:reason,external_state_source:'OLX_DIRECT_VERIFY'};
      const pr=await supa(`koki_listing_drafts_v3?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify({status:'DELETED_EXTERNAL',workflow_state:'DELETED_EXTERNAL',published_evidence:{...(d.published_evidence||{}),koki_external_lifecycle:lifecycle},updated_at:now})});
      if(pr.ok){const paused=await pauseSellAutomation(accountId,identity.advert_id,externalId,now,supa);await audit({decision:'OLX_LISTING_DELETED',reason,advert_id:identity.advert_id,olx_account_id:accountId}).catch(()=>{});if(prev.state!=='DELETED_EXTERNAL'&&notify&&d.owner_profile_id){await notify({recipient_profile_id:String(d.owner_profile_id),event_type:'OLX_LISTING_DELETED',title:'Обявата е премахната от OLX',body:'KOKI спря автоматизацията и премести обявата в историята.',data:{draft_id:id,advert_id:identity.advert_id,external_id:externalId}}).catch(()=>{}}changed.push({draft_id:id,advert_id:identity.advert_id,state,reason,paused_threads:paused})}
      continue;
    }
    if(state==='INACTIVE'){
      const lifecycle={...prev,state,external_last_verified_at:now,external_missing_count:miss,external_state_reason:reason,external_state_source:'OLX_DIRECT_VERIFY'};
      const pr=await supa(`koki_listing_drafts_v3?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify({status:'INACTIVE',workflow_state:'INACTIVE',published_evidence:{...(d.published_evidence||{}),koki_external_lifecycle:lifecycle},updated_at:now})});
      if(pr.ok){const paused=await pauseSellAutomation(accountId,identity.advert_id,externalId,now,supa);await audit({decision:'OLX_LISTING_INACTIVE',reason,advert_id:identity.advert_id,olx_account_id:accountId}).catch(()=>{});changed.push({draft_id:id,advert_id:identity.advert_id,state,reason,paused_threads:paused})}
      continue;
    }
    if(state==='ACTIVE'){
      const lifecycle={...prev,state:'ACTIVE',external_last_seen_at:now,external_last_verified_at:now,external_missing_count:0,external_state_reason:reason,external_state_source:'OLX_DIRECT_VERIFY'};
      await supa(`koki_listing_drafts_v3?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify({status:'PUBLISHED',workflow_state:'PUBLISHED',published_evidence:{...(d.published_evidence||{}),koki_external_lifecycle:lifecycle},updated_at:now})});changed.push({draft_id:id,advert_id:identity.advert_id,state:'ACTIVE',reason});continue;
    }
    const lifecycle={...prev,state:'UNKNOWN_EXTERNAL_STATE',external_last_verified_at:now,external_missing_count:miss,external_state_reason:reason,external_state_source:'OLX_RECONCILE'};
    await supa(`koki_listing_drafts_v3?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify({published_evidence:{...(d.published_evidence||{}),koki_external_lifecycle:lifecycle},updated_at:now})});changed.push({draft_id:id,advert_id:identity.advert_id,state:'UNKNOWN_EXTERNAL_STATE',reason});
  }
  return{ok:true,skipped:false,inventory_count:inventory.length,checked:drafts.length,changed};
}
