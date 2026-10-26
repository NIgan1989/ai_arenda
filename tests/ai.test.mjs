import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
mkdirSync('outputs/ai-test',{recursive:true});
for(const name of ['domain','ai'])writeFileSync(`outputs/ai-test/${name}.js`,ts.transpileModule(readFileSync(`lib/${name}.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText.replace("from './domain'","from './domain.js'"));
const {generateAnswer,assistantContext,reserveAIRequest}=await import(pathToFileURL(process.cwd()+'/outputs/ai-test/ai.js'));
test('model input excludes private fields and bounds role context/history; responses are real model text',async()=>{
 const secret='sk-FAKEKEYNOTAREALCREDENTIAL12345',contact='private@example.com',phone='+7 777 123 45 67';
 const context=assistantContext({serverTime:1793000000,profile:{id:'u',name:'PRIVATE NAME',contact},properties:[{title:'A',address:'PRIVATE ADDRESS',owner_contact:phone,price:15000,policy:{hourly_price:2000,house_rules:'Call '+phone}}],ownProperties:[{title:'OTHER ROLE PRIVATE'}],bookings:[{title:'Stay',guest_contact:contact,start:1793100000,end:1793200000,status:'confirmed'}],jobs:[]},'guest');
 const encoded=JSON.stringify(context);for(const text of ['PRIVATE NAME','PRIVATE ADDRESS',contact,phone,'OTHER ROLE PRIVATE'])assert.ok(!encoded.includes(text));
 let called=0;const fetch=globalThis.fetch;
 globalThis.fetch=async(url,request)=>{called++;assert.equal(url,'https://api.openai.com/v1/responses');const body=JSON.parse(request.body);assert.equal(body.store,false);assert.equal(body.max_output_tokens,1400);assert.equal(body.input.length,10);assert.equal(body.reasoning.effort,'none');const input=JSON.stringify(body.input);for(const text of [contact,phone,secret])assert.ok(!input.includes(text));return Response.json({output:[{type:'message',content:[{type:'output_text',text:'Могу помочь с выбором района.'}]}]});};
 try{const answer=await generateAnswer({OPENAI_API_KEY:'fake-test-key',OPENAI_MODEL:'gpt-6-luna'},contact+' '+phone+' '+secret,'guest',Array.from({length:12},()=>({sender:'user',body:phone})),'Scenario',context);assert.equal(answer.mode,'model');assert.equal(answer.text,'Могу помочь с выбором района.');assert.equal(called,1);}finally{globalThis.fetch=fetch;}
});
test('missing configuration makes no model request; billing/auth/rate errors are explicit',async()=>{
 const fetch=globalThis.fetch;let called=0;
 globalThis.fetch=async()=>{called++;return Response.json({error:{code:'insufficient_quota'}},{status:429});};
 try{assert.equal((await generateAnswer({},'Hi','guest',[],'Fallback')).mode,'scenario');assert.equal(called,0);const config={OPENAI_API_KEY:'fake',OPENAI_MODEL:'gpt-6-luna'};const billing=await generateAnswer(config,'Hi','guest',[],'Fallback');assert.equal(billing.errorCode,'billing');assert.equal(billing.mode,'fallback');assert.match(billing.text,/баланса/);
 globalThis.fetch=async()=>Response.json({error:{code:'invalid_api_key'}},{status:401});assert.equal((await generateAnswer(config,'Hi','guest',[],'Fallback')).errorCode,'authentication');
 globalThis.fetch=async()=>Response.json({error:{code:'rate_limit_exceeded'}},{status:429});assert.equal((await generateAnswer(config,'Hi','guest',[],'Fallback')).errorCode,'rate_limit');
 }finally{globalThis.fetch=fetch;}
});
test('persistent account/global request limits cannot be bypassed by switching roles',async()=>{
 const raw=new DatabaseSync(':memory:');raw.exec(readFileSync('drizzle/0007_native_auth.sql','utf8'));
 const db={prepare(sql){let args=[];return {bind(...values){args=values;return this;},async first(){return raw.prepare(sql).get(...args)||null;}};}};
 try{for(let i=0;i<30;i++)await reserveAIRequest(db,'one-account');await assert.rejects(reserveAIRequest(db,'one-account'),e=>e.status===429);raw.prepare("UPDATE auth_attempt_limits SET expires_at=0 WHERE key='ai:user:one-account'").run();await reserveAIRequest(db,'one-account');raw.prepare("UPDATE auth_attempt_limits SET attempts=200 WHERE key='ai:global'").run();await assert.rejects(reserveAIRequest(db,'another-account'),e=>e.status===429);}finally{raw.close();}
});
