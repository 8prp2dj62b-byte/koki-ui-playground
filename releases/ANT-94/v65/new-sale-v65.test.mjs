import test from 'node:test';
import assert from 'node:assert/strict';
import {createVNextNewSaleAdapter,createNewSaleStateMachine} from './new-sale-v65.mjs';
const cryptoRef={randomUUID:(()=>{let n=0;return()=>`uuid-${++n}`})()};

test('adapter emits only ANT-94 vNext actions and protected publish binding', async()=>{
  const calls=[]; const transport={request:async(_url,opt)=>{const b=JSON.parse(opt.body);calls.push(b);return {ok:true}}};
  const a=createVNextNewSaleAdapter(transport,'/v28');
  await a.prepareReview({draft_id:'d1'}); await a.operationStatus('o1'); await a.answerClarifications('o1',[{field:'battery_health',value:'85%'}]); await a.publish({draft_id:'d1',expected_review_version:7,expected_payload_hash:'hash'});
  assert.deepEqual(calls.map(x=>x.action),['prepare_review','operation_status','answer_clarifications','publish']);
  assert.equal(calls[3].confirm_publish,true); assert.equal(calls[3].expected_review_version,7); assert.equal(calls[3].expected_payload_hash,'hash');
  assert.equal(calls.some(x=>x.action==='execute_publish'),false);
});

test('last-request regression: 85% battery + 128GB survives clarification into canonical review', async()=>{
  let statusRound=0, answered=null, prepared=null, published=null;
  const review={readiness:{state:'REVIEW_READY'},review_version:9,payload_preview_hash:'sha256-abc',listing:{title:'Apple iPhone 11 128GB Purple',description:'iPhone 11 128GB, батерия 85%, използван.'},price:{publish_price_eur:400}};
  const adapter={createDraft:async()=>({draft:{id:'d-iphone',media:[{id:'m1'}]}}),prepareReview:async p=>{prepared=p;return {operation_id:'op-1',draft_id:'d-iphone',workflow_state:'SAVING'}},operationStatus:async()=>statusRound++===0?{operation_id:'op-1',draft_id:'d-iphone',workflow_state:'NEEDS_CLARIFICATION',questions:[{field:'battery_health'},{field:'storage_capacity'}]}:{operation_id:'op-1',draft_id:'d-iphone',workflow_state:'REVIEW_READY',review},answerClarifications:async(_op,a)=>{answered=a;return {ok:true}},publish:async p=>{published=p;return {workflow_state:'PUBLISHED',external_id:'olx-123'}},getDraft:async()=>({draft:{id:'d-iphone'}})};
  const sm=createNewSaleStateMachine({adapter,cryptoRef}); sm.setDescription('Iphone 11'); sm.setCondition('used'); sm.setDesiredPrice('400');
  const first=await sm.prepareReview(); assert.equal(first.workflow_state,'NEEDS_CLARIFICATION'); assert.equal(sm.getSnapshot().phase,'clarifying');
  assert.equal(prepared.description,'Iphone 11'); assert.equal(prepared.condition,'used'); assert.equal(prepared.owner_desired_price_eur,400);
  await sm.answerClarifications([{field:'battery_health',value:'85%'},{field:'storage_capacity',value:'128GB'}]);
  assert.deepEqual(answered,[{field:'battery_health',value:'85%'},{field:'storage_capacity',value:'128GB'}]); assert.equal(sm.getSnapshot().phase,'review'); assert.match(sm.getSnapshot().review.listing.description,/85%/); assert.match(sm.getSnapshot().review.listing.description,/128GB/);
  await sm.publish(); assert.deepEqual(published,{draft_id:'d-iphone',expected_review_version:9,expected_payload_hash:'sha256-abc'}); assert.equal(sm.getSnapshot().phase,'held');
});

test('review becomes stale locally after material user edit', async()=>{
  const adapter={getDraft:async()=>({draft:{id:'d1'},review:{readiness:{state:'REVIEW_READY'},review_version:2,payload_preview_hash:'h'}})};
  const sm=createNewSaleStateMachine({adapter,initialDraftId:'d1',cryptoRef}); await sm.resumeDraft('d1'); assert.equal(sm.getSnapshot().phase,'review'); sm.setDesiredPrice('401'); assert.equal(sm.getSnapshot().phase,'intake'); assert.equal(sm.getSnapshot().review,null);
});

test('resumeDraft preserves confirmed legacy condition and makes renderer compatibility safe', async()=>{
  const adapter={getDraft:async()=>({draft:{id:'legacy',user_edits:{product_description:'Iphone 11'},owner_desired_price_eur:400,fact_snapshot:{state:{value:'used'}},media:[{id:'m1'}]}})};
  const sm=createNewSaleStateMachine({adapter,cryptoRef}); await sm.resumeDraft('legacy'); const s=sm.getSnapshot(); assert.equal(s.description,'Iphone 11'); assert.equal(s.condition,'used'); assert.equal(s.desiredPrice,400); assert.equal(s.media[0].status,'persisted'); assert.equal(typeof sm.destroy,'function');
});
