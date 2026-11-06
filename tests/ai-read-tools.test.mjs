import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,load} from './helpers/platform.mjs';
const {generateAnswer}=await load('ai');
const {saveAIDataPermission,AI_DATA_POLICY_VERSION}=await load('ai-data-permission');
const config={OPENAI_API_KEY:'fixture',OPENAI_MODEL:'fixture-model'};
const call=(args='{}')=>({type:'function_call',name:'search_rental_catalog',arguments:args,call_id:'search'});

test('an adapter without a command executor cannot display a fabricated action as completed',async()=>{
 const original=globalThis.fetch;try{
  globalThis.fetch=async()=>Response.json({output:[{type:'message',content:[{type:'output_text',text:'Уборка создана, деньги переведены.'}]}]});
  const r=await generateAnswer(config,'Создай уборку','owner',[],'fallback');assert.match(r.text,/Изменений.*нет/);assert.doesNotMatch(r.text,/деньги переведены|Уборка создана/);
 }finally{globalThis.fetch=original;}
});

test('read tool is guest only, accepts no model-invented inputs, rejects parallel calls and accounts one request',async()=>{
 const original=globalThis.fetch;let executed=0,reserved=0,settled=0,payload;
 const read=async()=>{executed++;return {text:'Проверенный результат.',result:{total:1}};};
 try{
  globalThis.fetch=async(_,options)=>{payload=JSON.parse(options.body);return Response.json({id:'fixture',usage:{input_tokens:10,output_tokens:5},output:[call()]});};
  const r=await generateAnswer(config,'Можно что-нибудь потише?','guest',[],'fallback',{},undefined,{beforeRequest:async()=>{reserved++;},finish:async()=>{settled++;}},read);
  assert.equal(r.search.total,1);assert.equal(r.text,'Проверенный результат.');assert.equal(executed,1);assert.equal(reserved,1);assert.equal(settled,1);assert.equal(payload.parallel_tool_calls,false);assert.equal(payload.tools[0].name,'search_rental_catalog');
  for(const output of [[call('{"userId":"other","start":"invented"}')],[call('null')],[call('[]')],[call(),call()],[{...call(),name:'delete_booking'}]]){
   globalThis.fetch=async()=>Response.json({output});await generateAnswer(config,'Подбор','guest',[],'fallback',{},undefined,undefined,read);assert.equal(executed,1);
  }
  globalThis.fetch=async()=>Response.json({output:[call()]});await generateAnswer(config,'Подбор','owner',[],'fallback',{},undefined,undefined,read);assert.equal(executed,1);
 }finally{globalThis.fetch=original;}
});

test('service read tool uses authenticated live facts and persists results without trusting accompanying model claims',async()=>{
 const f=await fixture(),original=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;return Response.json({usage:{input_tokens:10,output_tokens:5},output:[call(),{type:'message',content:[{type:'output_text',text:'Бронь создана, стоимость 1 тенге.'}]}]});};
 try{
  await saveAIDataPermission(f.guest,{allowed:true,expectedVersion:0,policyVersion:AI_DATA_POLICY_VERSION});
  const before=f.db.raw.prepare('SELECT COUNT(*) n FROM bookings').get().n;
  const r=await f.guest.chat({role:'guest',text:'Есть что-нибудь подходящее?',searchFilters:{city:'Павлодар'}},config);
  assert.equal(r.mode,'model');assert.equal(r.search.total,1);assert.equal(r.search.properties[0].amount,10000);assert.doesNotMatch(r.text,/Бронь создана|1 тенге|PRIVATE/);assert.equal(calls,1);
  assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM bookings').get().n,before);assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM administrator_search_results').get().n,1);assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM ai_usage_reservations').get().n,1);
 }finally{globalThis.fetch=original;f.db.close();}
});
