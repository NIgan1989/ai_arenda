import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,load} from './helpers/platform.mjs';
const {reserveAIBudget,completeAIBudget,createAIBudgetLifecycle,saveAIBudget,aiBudgetState}=await load('ai-budget');
const {generateAnswer}=await load('ai');
const config={OPENAI_MODEL:'gpt-6-luna',AI_PRICE_MODEL:'gpt-6-luna',AI_INPUT_USD_PER_MILLION:'1',AI_OUTPUT_USD_PER_MILLION:'3'};

test('atomic reservations enforce global limits across accounts and one-account limits across roles',async()=>{
 const f=await fixture();try{
  const results=await Promise.allSettled([reserveAIBudget(f.db,'owner',{...config,AI_GLOBAL_DAILY_REQUEST_LIMIT:'1'},'one',100),reserveAIBudget(f.db,'guest',{...config,AI_GLOBAL_DAILY_REQUEST_LIMIT:'1'},'two',100)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM ai_usage_reservations').get().n,1);
  const first=results.find(r=>r.status==='fulfilled').value,id=f.db.raw.prepare('SELECT user_id FROM ai_usage_reservations').get().user_id;await completeAIBudget(f.db,id,first.id,{status:'completed',usage:{input_tokens:100,output_tokens:20}});
  const service=id==='owner'?f.owner:f.guest;await saveAIBudget(service,{enabled:true,expectedVersion:0,dailyRequestLimit:1,dailyTokenLimit:500000,dailyUsdCap:''});await assert.rejects(reserveAIBudget(f.db,id,config,'same-account-other-role',100),e=>e.status===429);
 }finally{f.db.close();}
});
test('unknown prices are unknown, money caps require server pricing and a request key never calls twice',async()=>{
 const f=await fixture();try{
  const unknown=await reserveAIBudget(f.db,'owner',{OPENAI_MODEL:'gpt-6-luna'},'unknown',100);assert.equal(unknown.reservedCostMicros,null);const state=await aiBudgetState(f.owner,{});assert.equal(state.pricingConfigured,false);assert.equal(state.totals.unknown_cost_requests,1);assert.equal(state.global,null);await assert.rejects(reserveAIBudget(f.db,'owner',config,'unknown',100),e=>e.status===409);
  await saveAIBudget(f.guest,{enabled:true,expectedVersion:0,dailyRequestLimit:200,dailyTokenLimit:500000,dailyUsdCap:'1'});await assert.rejects(reserveAIBudget(f.db,'guest',{OPENAI_MODEL:'gpt-6-luna'},'blocked',100),e=>e.status===503);assert.equal(f.db.raw.prepare("SELECT COUNT(*) n FROM ai_usage_reservations WHERE user_id='guest'").get().n,0);
  const priced=await reserveAIBudget(f.db,'guest',config,'priced',100);assert.ok(priced.reservedCostMicros>0);await completeAIBudget(f.db,'guest',priced.id,{status:'completed',usage:{input_tokens:100,output_tokens:20},responseId:'fixture'});const after=await aiBudgetState(f.guest,config);assert.equal(after.totals.cost_micros,160);assert.equal(after.totals.charged_tokens,120);
 }finally{f.db.close();}
});
test('token and money reservations cannot exceed either account or platform remaining allowance',async()=>{
 const f=await fixture();try{
  const limits={...config,AI_GLOBAL_DAILY_USD_CAP:'0.02'};await reserveAIBudget(f.db,'owner',limits,'money-one',100);await assert.rejects(reserveAIBudget(f.db,'guest',limits,'money-two',100),e=>e.status===429);
  await saveAIBudget(f.guest,{enabled:true,expectedVersion:0,dailyRequestLimit:10,dailyTokenLimit:1000,dailyUsdCap:''});await assert.rejects(reserveAIBudget(f.db,'guest',config,'tokens-account',100),e=>e.status===429);await assert.rejects(reserveAIBudget(f.db,'other',{...config,AI_GLOBAL_DAILY_TOKEN_LIMIT:'10000'},'tokens-platform',100),e=>e.status===429);
  assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM ai_usage_reservations').get().n,1);
 }finally{f.db.close();}
});
test('uncertain requests keep reservations; rejected calls release token/money reserve and settlement is idempotent',async()=>{
 const f=await fixture();try{
  const uncertain=await reserveAIBudget(f.db,'owner',config,'uncertain',100);await completeAIBudget(f.db,'owner',uncertain.id,{status:'uncertain'});const record=f.db.raw.prepare('SELECT * FROM ai_usage_reservations WHERE id=?').get(uncertain.id);assert.equal(record.status,'uncertain');assert.ok(record.charged_tokens>100);assert.ok(record.charged_cost_micros>0);await completeAIBudget(f.db,'owner',uncertain.id,{status:'rejected'});assert.equal(f.db.raw.prepare('SELECT status FROM ai_usage_reservations WHERE id=?').get(uncertain.id).status,'uncertain');
  const rejected=await reserveAIBudget(f.db,'owner',config,'rejected',100);await completeAIBudget(f.db,'owner',rejected.id,{status:'rejected',httpStatus:401});assert.equal(f.db.raw.prepare('SELECT charged_tokens FROM ai_usage_reservations WHERE id=?').get(rejected.id).charged_tokens,0);
 }finally{f.db.close();}
});
test('preferences use authenticated account, preserve stale writes and pause every role',async()=>{
 const f=await fixture();try{
  await assert.rejects(saveAIBudget(f.owner,{enabled:true,expectedVersion:9,dailyRequestLimit:10,dailyTokenLimit:20000,dailyUsdCap:''}),e=>e.status===409);
  await saveAIBudget(f.owner,{userId:'guest',enabled:false,expectedVersion:0,dailyRequestLimit:10,dailyTokenLimit:20000,dailyUsdCap:''});assert.equal((await aiBudgetState(f.guest)).preferences.version,0);assert.equal((await aiBudgetState(f.owner)).preferences.enabled,0);await assert.rejects(saveAIBudget(f.owner,{enabled:true,expectedVersion:0,dailyRequestLimit:20,dailyTokenLimit:20000,dailyUsdCap:''}),e=>e.status===409);await assert.rejects(reserveAIBudget(f.db,'owner',config,'paused',100),e=>e.status===409);
 }finally{f.db.close();}
});
test('lifecycle reserves the full request before network and records actual API usage or conservative timeout',async()=>{
 const f=await fixture(),original=globalThis.fetch;try{
  let called=0;globalThis.fetch=async()=>{called++;assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM ai_usage_reservations').get().n,1);return Response.json({id:'response-fixture',usage:{input_tokens:1000,output_tokens:20},output:[{type:'message',content:[{type:'output_text',text:'Состояние проверено.'}]}]});};
  const result=await generateAnswer({...config,OPENAI_API_KEY:'fixture'},'Что нового?','guest',[],'fallback',{},undefined,createAIBudgetLifecycle(f.db,'guest',config,'http'));assert.equal(result.mode,'model');assert.equal(called,1);assert.equal(f.db.raw.prepare('SELECT status,charged_tokens FROM ai_usage_reservations').get().charged_tokens,1020);
  const duplicate=await generateAnswer({...config,OPENAI_API_KEY:'fixture'},'Что нового?','guest',[],'fallback',{},undefined,createAIBudgetLifecycle(f.db,'guest',config,'http'));assert.equal(duplicate.errorCode,'budget');assert.equal(called,1);
  globalThis.fetch=async()=>{throw Object.assign(Error('timeout'),{name:'TimeoutError'});};await generateAnswer({...config,OPENAI_API_KEY:'fixture'},'Что нового?','guest',[],'fallback',{},undefined,createAIBudgetLifecycle(f.db,'guest',config,'timeout'));assert.equal(f.db.raw.prepare("SELECT status FROM ai_usage_reservations WHERE request_key='timeout'").get().status,'uncertain');
 }finally{globalThis.fetch=original;f.db.close();}
});
