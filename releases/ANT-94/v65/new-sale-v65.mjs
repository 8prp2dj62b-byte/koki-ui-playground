export const NEW_SALE_TERMINAL = new Set(["NEEDS_CLARIFICATION","REVIEW_READY","PUBLISHED","FAILED_RETRYABLE","FAILED_TERMINAL"]);
export const NEW_SALE_WORKING = new Set(["SAVING","UNDERSTANDING","SELECTING_CATEGORY","GENERATING_LISTING","PUBLISHING","PUBLISH_RECONCILING"]);

export function createVNextNewSaleAdapter(transport, url) {
  const call=(body,context={})=>transport.request(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),signal:context.signal});
  return {
    contract:"KOKI_NEW_SALE_V1",
    createDraft(context){return call({action:"create"},context)},
    getDraft(draftId,context){return call({action:"get",draft_id:draftId},context)},
    uploadMedia(draftId,file,context){return call({action:"add_media",draft_id:draftId,mime_type:file.type||"image/jpeg",base64:"TEST"},context)},
    prepareReview(payload,context){return call({action:"prepare_review",...payload},context)},
    operationStatus(operationId,context){return call({action:"operation_status",operation_id:operationId},context)},
    answerClarifications(operationId,answers,context){return call({action:"answer_clarifications",operation_id:operationId,answers},context)},
    retry(operationId,context){return call({action:"retry",operation_id:operationId},context)},
    publish(payload,context){return call({action:"publish",...payload,confirm_publish:true},context)},
    deleteDraft(draftId,context){return call({action:"delete",draft_id:draftId},context)}
  };
}

export function createNewSaleStateMachine({adapter,initialDraftId=null,cryptoRef=crypto,storage=null,storageKey="koki:new-sale:vnext:active"}){
  const read=()=>{try{return JSON.parse(storage?.getItem(storageKey)||"null")}catch{return null}},saved=read()||{};
  let state={phase:"intake",workflowState:"INTAKE",draftId:initialDraftId||saved.draftId||null,operationId:saved.operationId||null,description:saved.description||"",desiredPrice:saved.desiredPrice||"",condition:saved.condition||"",media:Array.isArray(saved.media)?saved.media:[],review:saved.review||null,questions:saved.questions||[],progressLabel:saved.progressLabel||"",error:null,busy:false,research:saved.research||null};
  const listeners=new Set(),persist=()=>{try{storage?.setItem(storageKey,JSON.stringify({draftId:state.draftId,operationId:state.operationId,description:state.description,desiredPrice:state.desiredPrice,condition:state.condition,media:state.media.filter(x=>x.status==="persisted"),review:state.review,questions:state.questions,progressLabel:state.progressLabel,research:state.research}))}catch{}},emit=()=>listeners.forEach(fn=>fn(structuredClone(state))),update=patch=>{state={...state,...patch};persist();emit()};
  const phaseOf=ws=>ws==="NEEDS_CLARIFICATION"?"clarifying":ws==="REVIEW_READY"?"review":ws==="PUBLISHED"?"held":ws==="FAILED_RETRYABLE"?"failed-retryable":ws==="FAILED_TERMINAL"?"failed-terminal":NEW_SALE_WORKING.has(ws)?"working":"intake";
  const applyStatus=p=>{const ws=String(p?.workflow_state||"INTAKE");update({workflowState:ws,phase:phaseOf(ws),draftId:p?.draft_id||state.draftId,operationId:p?.operation_id||state.operationId,progressLabel:p?.progress_label_bg||state.progressLabel,review:p?.review||state.review,questions:p?.questions||[],error:p?.error||null,research:p?.research||state.research,busy:NEW_SALE_WORKING.has(ws)});return p};
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const poll=async(signal)=>{while(state.operationId){const p=applyStatus(await adapter.operationStatus(state.operationId,{signal}));if(NEW_SALE_TERMINAL.has(String(p.workflow_state)))return p;await wait(1)}return null};
  const ensureDraft=async signal=>{if(state.draftId)return state.draftId;const r=await adapter.createDraft({signal}),d=r?.draft||r;if(!d?.id)throw new Error("DRAFT_CREATE_FAILED");update({draftId:d.id,media:Array.isArray(d.media)?d.media.map(x=>({...x,status:"persisted"})):state.media});return d.id};
  const invalidate=patch=>{const material=state.phase==="review"||state.phase==="held";update({...patch,...(material?{phase:"intake",workflowState:"INTAKE",operationId:null,review:null,questions:[],error:null,progressLabel:""}:{})})};
  return {
    getSnapshot:()=>structuredClone(state), subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn)},
    setDescription(v){invalidate({description:v})}, setDesiredPrice(v){invalidate({desiredPrice:v})}, setCondition(v){invalidate({condition:v})},
    async prepareReview(signal){const draftId=await ensureDraft(signal),clientRequestId=cryptoRef.randomUUID();update({busy:true,phase:"working",workflowState:"SAVING",progressLabel:"Подготвям данните…",review:null,questions:[],error:null});const r=await adapter.prepareReview({draft_id:draftId,description:state.description,condition:state.condition,owner_desired_price_eur:Number(state.desiredPrice),client_request_id:clientRequestId},{signal});update({operationId:r.operation_id,draftId:r.draft_id||draftId,workflowState:r.workflow_state||"SAVING"});return poll(signal)},
    async answerClarifications(answers,signal){if(!state.operationId)throw new Error("OPERATION_MISSING");update({busy:true,phase:"working",workflowState:"UNDERSTANDING",progressLabel:"Обновявам разпознаването на продукта…",error:null});await adapter.answerClarifications(state.operationId,answers,{signal});return poll(signal)},
    async retry(signal){if(!state.operationId)throw new Error("OPERATION_MISSING");update({busy:true,phase:"working",progressLabel:"Опитвам отново…",error:null});await adapter.retry(state.operationId,{signal});return poll(signal)},
    async publish(signal){if(state.review?.readiness?.state!=="REVIEW_READY")throw new Error("PUBLISH_NOT_READY");update({busy:true,phase:"working",workflowState:"PUBLISHING",progressLabel:"Публикувам в OLX…",error:null});const r=await adapter.publish({draft_id:state.draftId,expected_review_version:state.review.review_version,expected_payload_hash:state.review.payload_preview_hash},{signal});if(r?.workflow_state==="PUBLISHED")update({busy:false,phase:"held",workflowState:"PUBLISHED",progressLabel:"Обявата е публикувана.",review:state.review});return r},
    async resumeDraft(draftId,signal){if(!draftId)throw new Error("DRAFT_NOT_FOUND");const r=await adapter.getDraft(draftId,{signal}),d=r?.draft||{},review=r?.review||d.review_payload||null;const ws=review?.readiness?.state==="REVIEW_READY"?"REVIEW_READY":String(d.workflow_state||"INTAKE");update({draftId,operationId:null,description:d.user_edits?.product_description??state.description,desiredPrice:d.owner_desired_price_eur??state.desiredPrice,condition:d.fact_snapshot?.state?.value??d.fact_snapshot?.condition?.value??state.condition,media:Array.isArray(d.media)?d.media.map(x=>({...x,status:"persisted"})):state.media,review,workflowState:ws,phase:phaseOf(ws),questions:[],error:null});return r},
    destroy(){listeners.clear()}
  };
}
