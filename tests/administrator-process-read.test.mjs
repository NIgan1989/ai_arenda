import {test} from 'node:test';import assert from 'node:assert/strict';import {fixture,load,now} from './helpers/platform.mjs';
const {readAdministratorProcesses}=await load('administrator-process-read'),{generateAnswer}=await load('ai');
test('process read counts all own properties, scopes participants and reports verified payment facts without mutations',async()=>{
 const f=await fixture();try{
  for(let i=0;i<17;i++)await f.owner.createProperty({title:'Own '+i,city:'Павлодар',district:'Центр',address:'PRIVATE ADDRESS',description:'Test',price:10000,rooms:1,capacity:2,cleaningMinutes:90});
  await f.other.createProperty({title:'FOREIGN SECRET',city:'Павлодар',district:'Центр',address:'PRIVATE',description:'Test',price:10000,rooms:1,capacity:2,cleaningMinutes:90});
  const count=f.db.raw.prepare('SELECT COUNT(*) n FROM finance_entries').get().n;
  const owner=await readAdministratorProcesses(f.owner,'owner');assert.match(owner.text,/Ваших объектов: 18/);assert.match(owner.text,/оплата не подтверждена/);assert.doesNotMatch(owner.text,/FOREIGN SECRET|PRIVATE ADDRESS/);
  const noAssignment=await readAdministratorProcesses(f.cleaner,'cleaner');assert.doesNotMatch(noAssignment.text,/Test apartment/);
  f.db.raw.prepare("UPDATE cleaning_jobs SET assigned_to='cleaner',status='assigned',booking_id=NULL,start=?,end=? WHERE id=?").run(now()+60,now()+3600,f.job.id);
  assert.match((await readAdministratorProcesses(f.cleaner,'cleaner')).text,/Test apartment/);assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM finance_entries').get().n,count);
  await assert.rejects(readAdministratorProcesses(f.guest,'owner'),e=>e.status===403);
  const reply=await f.owner.chat({role:'owner',text:'Покажи мои актуальные процессы'});assert.match(reply.text,/Ваших объектов: 18/);assert.equal(reply.mode,'scenario');
 }finally{f.db.close();}
});
test('model process tool accepts no IDs from the model and returns server result instead of accompanying claims',async()=>{
 const original=globalThis.fetch;let executed=0,payload;const read=async()=>{executed++;return {text:'Актуальное состояние.'};};
 try{
  globalThis.fetch=async(_,options)=>{payload=JSON.parse(options.body);return Response.json({output:[{type:'function_call',name:'read_process_status',arguments:'{}'},{type:'message',content:[{type:'output_text',text:'Оплата проведена.'}]}]});};
  const r=await generateAnswer({OPENAI_API_KEY:'fixture',OPENAI_MODEL:'fixture'},'Как сейчас дела?','owner',[],'fallback',{},undefined,undefined,undefined,read);assert.equal(r.text,'Актуальное состояние.');assert.equal(executed,1);assert.ok(payload.tools.some(t=>t.name==='read_process_status'));
  globalThis.fetch=async()=>Response.json({output:[{type:'function_call',name:'read_process_status',arguments:'{"userId":"other"}'}]});await generateAnswer({OPENAI_API_KEY:'fixture',OPENAI_MODEL:'fixture'},'Статус','owner',[],'fallback',{},undefined,undefined,undefined,read);assert.equal(executed,1);
 }finally{globalThis.fetch=original;}
});
