import {test} from 'node:test';import assert from 'node:assert/strict';
import {fixture,load,now,iso} from './helpers/platform.mjs';
const {prepareAdministratorCommand,decideAdministratorCommand}=await load('administrator-commands');
test('chat creates a reviewable draft; confirmation creates exactly one job and repeated confirmation is safe',async()=>{
 const f=await fixture();try{
  const result=await prepareAdministratorCommand(f.owner,'owner',{action:'create_cleaning',propertyId:f.property,start:iso(now()+86400),end:iso(now()+90000),fee:3000,note:'Clean the apartment'},'tool-call');const c=result.commands[0];assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM cleaning_jobs').get().n,1);
  const body={id:c.id,action:'execute',confirmed:true,expectedVersion:1};await assert.rejects(decideAdministratorCommand(f.guest,'guest',body),e=>e.status===403);
  const first=await decideAdministratorCommand(f.owner,'owner',body),again=await decideAdministratorCommand(f.owner,'owner',body);assert.equal(first.id,again.id);assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM cleaning_jobs').get().n,2);
 }finally{f.db.close();}
});
test('stale limits and expired drafts never create work; injected property IDs cannot cross accounts',async()=>{
 const f=await fixture();try{
  await assert.rejects(prepareAdministratorCommand(f.other,'owner',{action:'create_cleaning',propertyId:f.property,start:iso(now()+86400),end:iso(now()+90000),fee:3000,note:'Injected'},'bad'),e=>e.status===403);
  const draft=await prepareAdministratorCommand(f.owner,'owner',{action:'create_cleaning',propertyId:f.property,start:iso(now()+86400),end:iso(now()+90000),fee:3000,note:'Test'},'draft');
  await f.owner.savePolicy(f.property,{...f.policy,expectedVersion:1,cleaningBudget:3500});
  await assert.rejects(decideAdministratorCommand(f.owner,'owner',{id:draft.commands[0].id,action:'execute',confirmed:true,expectedVersion:1}),e=>e.status===409);assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM cleaning_jobs').get().n,1);
 }finally{f.db.close();}
});
test('saved issue commands and job operation keys recover after interruption without duplicate effects',async()=>{
 const f=await fixture();try{
  const draft=await prepareAdministratorCommand(f.guest,'guest',{action:'report_issue',bookingId:f.booking,note:'Broken light'},'issue-draft'),id=draft.commands[0].id;
  await f.guest.bookingAction(f.booking,{action:'issue',issue:'Broken light',requestKey:'command:'+id});
  f.db.raw.prepare("UPDATE administrator_commands SET status='running',lease_until=0 WHERE id=?").run(id);
  await decideAdministratorCommand(f.guest,'guest',{id,action:'execute',confirmed:true,expectedVersion:1});assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM administrator_issues').get().n,1);
 }finally{f.db.close();}
});

// Ready commands: one existing action on one booking or cleaning of the current role, confirmed on a card.
{
const {generateAnswer}=await load('ai');
const {COMMAND_CATALOG}=await load('command-catalog');
const run=async(service,role,args,key)=>{const c=(await prepareAdministratorCommand(service,role,args,key)).commands[0];return {card:c,result:await decideAdministratorCommand(service,role,{id:c.id,action:'execute',confirmed:true,expectedVersion:c.version})};};
test('the guest and the owner run ready commands through a confirmed card; the service checks rights itself',async()=>{
 const f=await fixture();try{
  const late=await run(f.guest,'guest',{action:'report_guest_late',bookingId:f.booking},'late');
  assert.equal(late.card.preview.title,'Предупредить, что задерживаюсь');
  assert.ok(f.db.raw.prepare('SELECT arrival_eta FROM booking_terms WHERE booking_id=?').get(f.booking).arrival_eta);
  // A second booking request: the owner confirms it with the flat's own cleaning price.
  const request=(await f.guest.createBooking({propertyId:f.property,start:iso(now()+5*86400),end:iso(now()+5*86400+7200),guests:1,billingMode:'hourly',requestKey:'second',acceptTerms:true})).id;
  await assert.rejects(prepareAdministratorCommand(f.guest,'guest',{action:'confirm_booking',bookingId:request},'wrong-role'),e=>e.status===403);
  await assert.rejects(prepareAdministratorCommand(f.other,'owner',{action:'confirm_booking',bookingId:request},'not-mine'),e=>e.status===403);
  const confirmed=await run(f.owner,'owner',{action:'confirm_booking',bookingId:request},'confirm');
  assert.match(confirmed.card.preview.description,/3000 ₸/);
  assert.equal(f.db.raw.prepare('SELECT status FROM bookings WHERE id=?').get(request).status,'confirmed');
  await run(f.guest,'guest',{action:'cancel_booking',bookingId:request},'cancel');
  assert.equal(f.db.raw.prepare('SELECT status FROM bookings WHERE id=?').get(request).status,'cancelled');
  await assert.rejects(prepareAdministratorCommand(f.owner,'owner',{action:'cancel_cleaning',jobId:f.db.raw.prepare('SELECT id FROM cleaning_jobs LIMIT 1').get().id,note:''},'no-reason'),/причину/);
 }finally{f.db.close();}
});
test('the model may pick a ready command only for its own role and only on a plain request',async()=>{
 assert.ok(Object.keys(COMMAND_CATALOG).length>=15);
 const real=globalThis.fetch;let args;
 globalThis.fetch=async()=>Response.json({output:[{type:'function_call',name:'prepare_administrator_action',call_id:'c',arguments:JSON.stringify({action:'confirm_booking',propertyId:null,bookingId:'b1',jobId:null,start:null,end:null,fee:null,note:null,...args})}]});
 const config={OPENAI_API_KEY:'fixture',OPENAI_MODEL:'fixture'},context={bookings:[{id:'b1'}]};let executed=0;const exec=async()=>{executed++;return {text:'ok',commands:[]};};
 try{
  args={};assert.match((await generateAnswer(config,'Подтверди заявку','guest',[],'f',context,exec)).text,/текущей роли/);
  assert.match((await generateAnswer(config,'Как дела с заявкой?','owner',[],'f',context,exec)).text,/явной просьбе/);
  args={bookingId:'other'};assert.match((await generateAnswer(config,'Подтверди заявку','owner',[],'f',context,exec)).text,/Уточните бронь/);
  args={};await generateAnswer(config,'Подтверди заявку','owner',[],'f',context,exec);assert.equal(executed,1);
  args={action:'report_arrival'};await generateAnswer(config,'Я на месте','guest',[],'f',context,exec);assert.equal(executed,2);
 }finally{globalThis.fetch=real;}
});
}
