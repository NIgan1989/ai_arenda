import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,load} from './helpers/platform.mjs';
const {saveAIDataPermission,aiDataPermission,AI_DATA_POLICY_VERSION}=await load('ai-data-permission');
const {readOperations,writeOperations}=await load('operations-api');
const {administratorConversation}=await load('administrator-conversation');
const decide=(allowed,expectedVersion=0)=>({allowed,expectedVersion,policyVersion:AI_DATA_POLICY_VERSION});
const config={OPENAI_API_KEY:'fixture',OPENAI_MODEL:'fixture-model'};

test('new permission is explicit, versioned, shared across roles and cannot target another account',async()=>{
 const f=await fixture();try{
  await f.guest.connectRole('owner',{});
  assert.equal((await aiDataPermission(f.guest)).allowed,false);
  await assert.rejects(writeOperations(f.guest,'owner',['ai-data-permission'],decide(true,9)),e=>e.status===409);
  await assert.rejects(writeOperations(f.guest,'guest',['ai-data-permission'],{...decide(true),policyVersion:'outdated'}));
  assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM ai_data_permission_events').get().n,0);
  await writeOperations(f.guest,'guest',['ai-data-permission'],{...decide(true),userId:'owner'});
  assert.equal((await readOperations(f.guest,'owner',['ai-data-permission'])).permission.allowed,true);
  assert.equal((await aiDataPermission(f.owner)).allowed,false);
  await assert.rejects(saveAIDataPermission(f.guest,decide(false)),e=>e.status===409);
  assert.equal((await aiDataPermission(f.guest)).allowed,true);
  await writeOperations(f.guest,'owner',['ai-data-permission'],decide(false,1));
  assert.equal((await aiDataPermission(f.guest)).allowed,false);
  assert.deepEqual(f.db.raw.prepare('SELECT allowed,version FROM ai_data_permission_events ORDER BY version').all().map(r=>[r.allowed,r.version]),[[1,1],[0,2]]);
  await assert.rejects(readOperations(f.cleaner,'owner',['ai-data-permission']),e=>e.status===403);
 }finally{f.db.close();}
});

test('legacy body consent cannot transmit data; refusal and revocation do not reserve model budget',async()=>{
 const f=await fixture(),original=globalThis.fetch;let called=0;
 globalThis.fetch=async()=>{called++;return Response.json({usage:{input_tokens:100,output_tokens:12},output:[{type:'message',content:[{type:'output_text',text:'Ответ модели.'}]}]});};
 try{
  for(const aiConsent of [true,false]){const r=await f.guest.chat({text:'Привет',role:'guest',aiConsent},config);assert.equal(r.mode,'scenario');assert.equal(r.permissionRequired,true);}
  assert.equal(called,0);assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM ai_usage_reservations').get().n,0);
  await saveAIDataPermission(f.guest,decide(true));
  const r=await f.guest.chat({text:'Привет',role:'guest',aiConsent:false},config);assert.equal(r.mode,'model');assert.equal(r.permissionRequired,false);assert.equal(called,1);
  await saveAIDataPermission(f.guest,decide(false,1));
  assert.equal((await f.guest.chat({text:'Привет',role:'guest',aiConsent:true},config)).mode,'scenario');assert.equal(called,1);
  const history=await administratorConversation(f.guest,'guest');assert.equal(history.messages.length,8);assert.ok(history.messages.at(-1).created_at<1e12);assert.equal(history.messages.at(-2).sender,'user');assert.equal(history.messages.at(-1).sender,'assistant');
  f.db.raw.prepare("UPDATE ai_data_permissions SET allowed=1,policy_version='old' WHERE user_id='guest'").run();assert.equal((await aiDataPermission(f.guest)).allowed,false);
 }finally{globalThis.fetch=original;f.db.close();}
});
