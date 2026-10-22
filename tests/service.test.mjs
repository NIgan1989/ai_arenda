import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

// Exercise the real SQL and service against SQLite with D1-compatible batches.
mkdirSync('outputs/test-lib',{recursive:true});
for(const name of ['domain','ai','operations','assistant','access','rental-policy','service']){
  const source=readFileSync(`lib/${name}.ts`,'utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText.replace("from './domain'","from './domain.js'").replace("from './ai'","from './ai.js'").replace("from './operations'","from './operations.js'").replace("from './assistant'", "from './assistant.js'").replace("from './access'", "from './access.js'").replace("from './rental-policy'","from './rental-policy.js'");
  writeFileSync(`outputs/test-lib/${name}.js`,compiled);
}
const {RentalService}=await import(pathToFileURL(process.cwd()+'/outputs/test-lib/service.js'));
const {interval,quote}=await import(pathToFileURL(process.cwd()+'/outputs/test-lib/domain.js'));
const {operationOverview}=await import(pathToFileURL(process.cwd()+'/outputs/test-lib/operations.js'));
const {assistantBrief,defaultAssistantSettings}=await import(pathToFileURL(process.cwd()+'/outputs/test-lib/assistant.js'));
const {rentalPrice,defaultPolicy}=await import(pathToFileURL(process.cwd()+'/outputs/test-lib/rental-policy.js'));
class D1 {
  constructor(){this.db=new DatabaseSync(':memory:');this.db.exec('PRAGMA foreign_keys=ON');this.db.exec(readFileSync('drizzle/0000_boring_unus.sql','utf8'));this.db.exec(readFileSync('drizzle/0001_rental_operations.sql','utf8'));this.db.exec(readFileSync('drizzle/0002_assistant_preferences.sql','utf8'));}
  prepare(sql){const db=this.db;let args=[];return {bind(...values){args=values;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){const r=db.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}};}};}
  async batch(statements){this.db.exec('BEGIN');try{const result=[];for(const q of statements)result.push(await q.run());this.db.exec('COMMIT');return result;}catch(e){this.db.exec('ROLLBACK');throw e;}}
}
const db=new D1(),owner=new RentalService(db,'owner'),guest=new RentalService(db,'guest'),worker=new RentalService(db,'worker'),other=new RentalService(db,'other');
let property,booking,job;
const start=Date.now()+2*86400000;
const iso=n=>new Date(n).toISOString();
before(async()=>{
  await owner.saveProfile({name:'Owner',contact:'owner test',city:'Павлодар',roles:['owner']});
  await guest.saveProfile({name:'Guest',contact:'guest test',city:'Павлодар',roles:['guest']});
  await worker.saveProfile({name:'Cleaner',contact:'worker test',city:'Павлодар',roles:['cleaner'],districts:'Центр',experience:'Учебная анкета',availability:'Днём'});
});
test('date and quote rules include midnight and started daily periods',()=>{
  assert.throws(()=>interval(iso(start),iso(start-1)));
  assert.throws(()=>interval('invalid',iso(start)));
  assert.equal(quote(10000,100,86500),10000);
  assert.equal(quote(10000,100,86501),20000);
});
test('an incomplete worker application is rejected',async()=>{
  await assert.rejects(other.saveProfile({name:'Other',contact:'test',city:'Павлодар',roles:['cleaner']}),/районы/);
});
test('only owner role creates property; public catalog hides exact address',async()=>{
  const body={title:'Test apartment',city:'Павлодар',district:'Центр',address:'PRIVATE ADDRESS',description:'Test rules',price:10000,rooms:1,capacity:2,cleaningMinutes:90};
  await assert.rejects(guest.createProperty(body),/роль/);
  property=(await owner.createProperty(body)).id;
  const state=await guest.state();assert.equal(state.properties.length,1);assert.equal(state.properties[0].address,undefined);assert.equal(state.ownProperties.length,0);
});
test('booking retries are idempotent and hide address before confirmation',async()=>{
  const request={propertyId:property,start:iso(start),end:iso(start+86400000),guests:2,requestKey:'request-1'};
  const first=await guest.createBooking(request),repeat=await guest.createBooking(request);booking=first.id;
  assert.equal(first.id,repeat.id);assert.equal((await guest.state()).bookings[0].address,null);
});
test('SQL rejects simultaneous interval and cleaning buffer conflicts',async()=>{
  await assert.rejects(guest.createBooking({propertyId:property,start:iso(start+86400000),end:iso(start+90000000),guests:1,requestKey:'overlap'}),error=>error.status===409);
  assert.throws(()=>db.db.prepare("INSERT INTO bookings SELECT 'race-test',property_id,guest_id,start,end,occupied_until,guests,amount,status,expires_at,payment_status,'race-test',created_at FROM bookings WHERE id=?").run(booking),/booking_overlap/);
  const r=await guest.createBooking({propertyId:property,start:iso(start+86400000+90*60000),end:iso(start+3*86400000),guests:1,requestKey:'boundary'});
  assert.ok(r.id);
});
test('other users cannot read or confirm a booking',async()=>{
  assert.equal((await other.state()).bookings.length,0);
  await assert.rejects(other.bookingAction(booking,{action:'confirm'}),/не найдена/);
  await assert.rejects(guest.bookingAction(booking,{action:'paid'}),/недоступно/);
});
test('confirmation and automatic cleaning job are persisted together',async()=>{
  await owner.bookingAction(booking,{action:'confirm',cleaningFee:4000});
  const state=await owner.state();job=state.jobs.find(j=>j.booking_id===booking).id;
  assert.equal(state.bookings.find(b=>b.id===booking).status,'confirmed');
  assert.equal((await guest.state()).bookings.find(b=>b.id===booking).address,'PRIVATE ADDRESS');
});
test('workers see conditions but no address before assignment',async()=>{
  const state=await worker.state();assert.equal(state.jobs[0].address,null);assert.equal(state.jobs[0].owner_contact,null);
  await worker.jobAction(job,{action:'apply'});await worker.jobAction(job,{action:'apply'});
  assert.equal((await owner.state()).applications.length,1);
});
test('assignment checks permissions and cannot be overwritten',async()=>{
  const a=(await owner.state()).applications[0];
  await assert.rejects(other.jobAction(job,{action:'assign',applicationId:a.id}),/доступа/);
  await owner.jobAction(job,{action:'assign',applicationId:a.id});
  await assert.rejects(owner.jobAction(job,{action:'assign',applicationId:a.id}));
  assert.equal((await worker.state()).jobs[0].address,'PRIVATE ADDRESS');
});
test('overlapping assignments are rejected in SQL',async()=>{
  const j=(await owner.state()).jobs[0];
  const otherJob=(await owner.createJob({propertyId:property,start:iso(j.start*1000),end:iso(j.end*1000),fee:2000,description:'Second job'})).id;
  await worker.jobAction(otherJob,{action:'apply'});const a=(await owner.state()).applications.find(a=>a.job_id===otherJob);
  await assert.rejects(owner.jobAction(otherJob,{action:'assign',applicationId:a.id}),/cleaner_overlap/);
  assert.equal((await owner.state()).jobs.find(j=>j.id===otherJob).assigned_to,null);
});
test('report requires started work and completed checklist; owner accepts result',async()=>{
  await assert.rejects(worker.jobAction(job,{action:'start'}),/не раньше/);
  await owner.query('UPDATE bookings SET start=?,end=?,occupied_until=? WHERE id=?',Math.floor(Date.now()/1000)-600,Math.floor(Date.now()/1000)+3600,Math.floor(Date.now()/1000)+9000,booking).run();
  await owner.bookingAction(booking,{action:'checkout'});
  await worker.jobAction(job,{action:'start'});
  await assert.rejects(worker.jobAction(job,{action:'submit',checklist:[true],report:'Test'}),/пункты/);
  await worker.jobAction(job,{action:'submit',checklist:[true,true,true,true],report:'Cleaning complete'});
  await assert.rejects(guest.jobAction(job,{action:'approve'}),/доступа/);
  await owner.jobAction(job,{action:'approve'});
  assert.equal((await worker.state()).jobs.find(j=>j.id===job).status,'completed');
});
test('owner payment verification and cancellation preserve the audit trail',async()=>{
  const t=start+8*86400000,key=(await guest.createBooking({propertyId:property,start:iso(t),end:iso(t+86400000),guests:1,requestKey:'payment-test'})).id;
  await owner.bookingAction(key,{action:'confirm'});
  await owner.bookingAction(key,{action:'paid'});assert.equal((await guest.state()).bookings.find(b=>b.id===key).payment_status,'owner_verified');
  await guest.bookingAction(key,{action:'cancel'});assert.equal((await owner.state()).bookings.find(b=>b.id===key).status,'cancelled');
  assert.ok(db.db.prepare('SELECT COUNT(*) count FROM audit_events').get().count>10);
});
test('expired holds stop blocking the calendar and cannot be confirmed',async()=>{
  const t=start+10*86400000, b=await guest.createBooking({propertyId:property,start:iso(t),end:iso(t+86400000),guests:1,requestKey:'expire'});
  await guest.query('UPDATE bookings SET expires_at=? WHERE id=?',1,b.id).run();
  await assert.rejects(owner.bookingAction(b.id,{action:'confirm'}),/истёк/);
  const r=await guest.createBooking({propertyId:property,start:iso(t),end:iso(t+86400000),guests:1,requestKey:'after-expiry'});assert.ok(r.id);
});
test('demo data is isolated and seeding is idempotent',async()=>{
  const d=new RentalService(db,'demo-user');await d.demo();await d.demo();
  assert.equal((await d.state()).ownProperties.length,2);
  assert.equal((await guest.state()).properties.filter(p=>p.demo_owner).length,0);
});

test('catalogue whitelist exposes published facts without contacts, addresses or demo data',async()=>{
  const catalog=await new RentalService(db,'').publicCatalog();
  assert.ok(catalog.properties.some(p=>p.id===property));
  for(const p of catalog.properties){for(const key of ['address','owner_id','contact','owner_contact','demo_owner'])assert.equal(p[key],undefined);}
  assert.equal(catalog.properties.some(p=>p.title.includes('набережной')),false);
});

test('a quote makes no reservation, and a changed price must be reviewed before booking',async()=>{
  const isolated=new D1(),o=new RentalService(isolated,'o'),g=new RentalService(isolated,'g');
  await o.saveProfile({name:'Owner',contact:'test',city:'Павлодар',roles:['owner']});
  await g.saveProfile({name:'Guest',contact:'test',city:'Павлодар',roles:['guest']});
  const propertyId=(await o.createProperty({title:'Quote test',city:'Павлодар',district:'Центр',address:'private',description:'rules',price:10000,rooms:1,capacity:2,cleaningMinutes:90})).id;
  const body={propertyId,start:iso(start),end:iso(start+86400000+60000),guests:2,requestKey:'review-price'};
  const quoted=await g.bookingQuote(body);
  assert.equal(quoted.amount,20000);assert.equal(quoted.periods,2);
  assert.equal(isolated.db.prepare('SELECT COUNT(*) n FROM bookings').get().n,0);
  assert.equal(quoted.occupiedUntil,quoted.end+90*60);
  await o.query('UPDATE properties SET price=12000 WHERE id=?',propertyId).run();
  await assert.rejects(g.createBooking({...body,expectedAmount:quoted.amount}),e=>e.status===409);
  assert.equal(isolated.db.prepare('SELECT COUNT(*) n FROM bookings').get().n,0);
  const updated=await g.bookingQuote(body);assert.equal(updated.amount,24000);
  await g.createBooking({...body,expectedAmount:updated.amount});
  await assert.rejects(g.bookingQuote(body),e=>e.status===409);
  isolated.db.close();
});

test('quotes respect independent cleaning tasks and reject private demo objects',async()=>{
  const t=start+25*86400000;
  await owner.createJob({propertyId:property,start:iso(t),end:iso(t+3600000),fee:1000,description:'Preparation'});
  await assert.rejects(guest.bookingQuote({propertyId:property,start:iso(t-3600000),end:iso(t-60000),guests:1}),e=>e.status===409);
  const q=await guest.bookingQuote({propertyId:property,start:iso(t+3600000),end:iso(t+7200000),guests:1});assert.ok(q.amount>0);
  const hidden=(await new RentalService(db,'demo-user').state()).ownProperties[0];
  await assert.rejects(guest.bookingQuote({propertyId:hidden.id,start:iso(t),end:iso(t+3600000),guests:1}),e=>e.status===404);
});

test('operational overview separates roles, expired holds and reports awaiting acceptance',()=>{
  const now=10000,data={bookings:[
    {id:'pending',owner_id:'owner',guest_id:'guest',status:'requested',expires_at:11000,start:12000,end:15000,title:'Home'},
    {id:'expired',owner_id:'owner',guest_id:'guest',status:'requested',expires_at:9000,start:12000,end:15000,title:'Home'},
    {id:'foreign',owner_id:'other',guest_id:'other',status:'confirmed',start:12000,end:15000,title:'Private'}],
    jobs:[{id:'late',owner_id:'owner',assigned_to:'cleaner',status:'assigned',start:8000,end:9000,title:'Home'},
      {id:'report',owner_id:'owner',assigned_to:'cleaner',status:'submitted',start:8000,end:9000,title:'Home'},
      {id:'foreign',owner_id:'other',assigned_to:'other',status:'in_progress',start:8000,end:9000,title:'Private'}],notifications:[]};
  const ownerView=operationOverview(data,'owner','owner',now),guestView=operationOverview(data,'guest','guest',now),cleanerView=operationOverview(data,'cleaner','cleaner',now);
  assert.equal(ownerView.activeBookings,1);assert.equal(ownerView.attention.length,3);
  assert.equal(guestView.attention.length,0);assert.equal(guestView.activeJobs,0);assert.equal(guestView.upcoming.length,1);
  assert.equal(cleanerView.activeBookings,0);assert.equal(cleanerView.attention.length,1);
  assert.equal(cleanerView.upcoming[0].title,'Отчёт ожидает приёмки');assert.equal(cleanerView.upcoming[0].urgent,false);
  assert.equal(JSON.stringify([ownerView,guestView,cleanerView]).includes('Private'),false);
});

async function rentalFixture(){
  const database=new D1(),o=new RentalService(database,'o'),g=new RentalService(database,'g'),w=new RentalService(database,'w'),stranger=new RentalService(database,'stranger');
  await o.saveProfile({name:'Owner',contact:'test',city:'Павлодар',roles:['owner']});
  await g.saveProfile({name:'Guest',contact:'test',city:'Павлодар',roles:['guest']});
  await w.saveProfile({name:'Cleaner',contact:'test',city:'Павлодар',roles:['cleaner'],districts:'Центр',experience:'test',availability:'test'});
  const propertyId=(await o.createProperty({title:'Lifecycle test',city:'Павлодар',district:'Центр',address:'PRIVATE',description:'test',price:10000,rooms:1,capacity:2,cleaningMinutes:90})).id;
  const policy={expectedVersion:0,dailyPrice:10000,hourlyPrice:2000,minHours:2,nightlyPrice:9000,checkinTime:'14:00',checkoutTime:'12:00',deposit:15000,houseRules:'Без курения. До двух гостей.',autoConfirm:false,cleaningFee:3000,cleaningBudget:4000};
  await o.savePolicy(propertyId,policy);
  return {database,o,g,w,stranger,propertyId,policy};
}
test('declaring every role does not grant access to another owner property or booking',async()=>{
  const f=await rentalFixture();try{
    await f.stranger.saveProfile({name:'Stranger',contact:'test',city:'Павлодар',roles:['guest','owner','cleaner'],districts:'test',experience:'test',availability:'test'});
    await assert.rejects(f.stranger.savePolicy(f.propertyId,{...f.policy,expectedVersion:1}),e=>e.status===404);
    await assert.rejects(f.stranger.readinessAction(f.propertyId,{readiness:'ready',expectedVersion:1,inspected:true,note:'test'}),e=>e.status===404);
    const b=await f.g.createBooking({propertyId:f.propertyId,start:iso(start),end:iso(start+86400000),guests:1,requestKey:'private',acceptTerms:true,expectedPolicyVersion:1});
    await assert.rejects(f.stranger.bookingAction(b.id,{action:'confirm',cleaningFee:0}),e=>e.status===404);
    assert.equal((await f.stranger.state()).bookings.length,0);
    assert.equal((await f.stranger.state()).ownProperties.length,0);
    assert.equal((await f.stranger.state()).messages.length,0);
    const catalog=await f.stranger.publicCatalog();assert.equal(catalog.properties[0].policy.cleaning_budget,undefined);assert.equal(catalog.properties[0].policy.cleaning_fee,undefined);
  }finally{f.database.db.close();}
});
test('policy updates reject stale versions, invalid limits, and preserve quoted booking terms',async()=>{
  const f=await rentalFixture();try{
    const body={propertyId:f.propertyId,start:iso(start),end:iso(start+2*3600000),guests:1,billingMode:'hourly',requestKey:'snapshot'},q=await f.g.bookingQuote(body);
    assert.equal(q.amount,4000);assert.equal(q.policy.deposit,15000);
    await assert.rejects(f.g.createBooking({...body,expectedAmount:q.amount,expectedPolicyVersion:1}),/согласие/);
    const b=await f.g.createBooking({...body,expectedAmount:q.amount,expectedPolicyVersion:1,acceptTerms:true});
    await f.o.savePolicy(f.propertyId,{...f.policy,expectedVersion:1,deposit:20000,houseRules:'Новые правила'});
    await assert.rejects(f.o.savePolicy(f.propertyId,{...f.policy,expectedVersion:1,dailyPrice:99999}),e=>e.status===409);
    assert.equal(f.database.db.prepare('SELECT price FROM properties WHERE id=?').get(f.propertyId).price,10000);
    await assert.rejects(f.o.savePolicy(f.propertyId,{...f.policy,expectedVersion:2,cleaningBudget:2000}),/лимит/);
    const saved=(await f.g.state()).bookings.find(v=>v.id===b.id).terms;assert.equal(saved.deposit,15000);assert.equal(saved.house_rules,f.policy.houseRules);assert.equal(saved.amount,4000);
    const later={...body,start:iso(start+86400000),end:iso(start+86400000+7200000),requestKey:'stale-review',acceptTerms:true,expectedAmount:q.amount,expectedPolicyVersion:1};
    await assert.rejects(f.g.createBooking(later),e=>e.status===409);
  }finally{f.database.db.close();}
});
test('hourly minimum, started hours and Kazakhstan nightly checkout times affect billing',()=>{
  const policy={...defaultPolicy,hourly_price:2000,min_hours:2,nightly_price:9000};
  assert.throws(()=>rentalPrice(10000,policy,100,100+7199,'hourly'),/Минимальная/);
  assert.equal(rentalPrice(10000,policy,100,100+7201,'hourly').amount,6000);
  const s=Date.parse('2026-11-01T14:00:00+05:00')/1000,e=Date.parse('2026-11-03T12:00:00+05:00')/1000;
  assert.equal(rentalPrice(10000,policy,s,e,'nightly').amount,18000);
  assert.throws(()=>rentalPrice(10000,policy,s,e+60,'nightly'),/выезд в 12:00/);
  assert.throws(()=>rentalPrice(10000,defaultPolicy,s,e,'hourly'),/выключена/);
});
test('automatic confirmation is delegated, audited as system, and does not mark payments received',async()=>{
  const f=await rentalFixture();try{
    await f.o.savePolicy(f.propertyId,{...f.policy,expectedVersion:1,autoConfirm:true});
    const b=await f.g.createBooking({propertyId:f.propertyId,start:iso(start),end:iso(start+86400000),guests:1,requestKey:'auto',acceptTerms:true,expectedPolicyVersion:2});
    const state=await f.o.state(),saved=state.bookings.find(v=>v.id===b.id);
    assert.equal(saved.status,'confirmed');assert.equal(saved.payment_status,'unpaid');assert.equal(saved.terms.deposit_status,'pending');
    assert.equal(state.jobs.find(v=>v.booking_id===b.id).fee,3000);
    const event=f.database.db.prepare("SELECT * FROM audit_events WHERE entity_id=? AND actor_id='system:rental-policy'").get(b.id),details=JSON.parse(event.action);
    assert.equal(details.action,'booking.confirmed');assert.equal(details.onBehalfOf,'o');assert.equal(details.policyVersion,2);
    await assert.rejects(new RentalService(f.database,'o',{propertyId:f.propertyId,policyVersion:2}).bookingAction(b.id,{action:'paid'}),e=>e.status===403);
  }finally{f.database.db.close();}
});
async function occupiedFixture(){
  const f=await rentalFixture();
  const b=await f.g.createBooking({propertyId:f.propertyId,start:iso(start),end:iso(start+86400000),guests:1,requestKey:'stay',acceptTerms:true});
  await f.o.bookingAction(b.id,{action:'confirm',cleaningFee:3000});
  const t=Math.floor(Date.now()/1000);f.database.db.prepare('UPDATE bookings SET start=?,end=?,occupied_until=? WHERE id=?').run(t-600,t+3600,t+9000,b.id);
  const j=(await f.o.state()).jobs[0];await f.w.jobAction(j.id,{action:'apply'});const a=(await f.o.state()).applications[0];await f.o.jobAction(j.id,{action:'assign',applicationId:a.id});
  return {...f,b,j,t};
}
test('check-in requires ready premises, owner-verified payment and the agreed deposit',async()=>{
  const f=await occupiedFixture();try{
    await assert.rejects(f.g.bookingAction(f.b.id,{action:'checkin'}),e=>e.status===403);
    await assert.rejects(f.o.bookingAction(f.b.id,{action:'checkin'}),/оплату/);
    await f.o.bookingAction(f.b.id,{action:'paid'});
    await assert.rejects(f.o.bookingAction(f.b.id,{action:'checkin'}),/депозит/);
    await f.o.bookingAction(f.b.id,{action:'deposit_received'});
    await assert.rejects(f.o.bookingAction(f.b.id,{action:'checkin'}),/не готова/);
    await assert.rejects(f.o.readinessAction(f.propertyId,{readiness:'ready',expectedVersion:1,note:'Проверено'}),/Подтвердите/);
    await f.o.readinessAction(f.propertyId,{readiness:'ready',expectedVersion:1,note:'Проверено',inspected:true});
    await f.o.bookingAction(f.b.id,{action:'checkin'});await f.o.bookingAction(f.b.id,{action:'checkin'});
    assert.equal((await f.o.state()).ownProperties[0].operation.readiness,'occupied');
    await assert.rejects(f.g.bookingAction(f.b.id,{action:'cancel'}),/выезд/);
    await assert.rejects(f.o.readinessAction(f.propertyId,{readiness:'ready',expectedVersion:3,note:'Проверено',inspected:true}),/выезд/);
  }finally{f.database.db.close();}
});
test('guest checkout report cannot release premises; cleaning and inspection gate readiness',async()=>{
  const f=await occupiedFixture();try{
    await f.g.bookingAction(f.b.id,{action:'report_checkout'});
    assert.equal((await f.o.state()).bookings[0].status,'confirmed');
    f.database.db.prepare('UPDATE cleaning_jobs SET start=?,end=? WHERE id=?').run(f.t,f.t+5400,f.j.id);
    await assert.rejects(f.w.jobAction(f.j.id,{action:'start'}),/checkout_required/);
    await assert.rejects(f.g.bookingAction(f.b.id,{action:'checkout'}),e=>e.status===403);
    await f.o.bookingAction(f.b.id,{action:'checkout'});await f.o.bookingAction(f.b.id,{action:'checkout'});
    assert.equal((await f.o.state()).ownProperties[0].operation.readiness,'awaiting_cleaning');
    await f.w.jobAction(f.j.id,{action:'start'});assert.equal((await f.o.state()).ownProperties[0].operation.readiness,'cleaning');
    await f.w.jobAction(f.j.id,{action:'submit',checklist:[true,true,true,true],report:'Чисто, всё проверено'});
    assert.equal((await f.o.state()).ownProperties[0].operation.readiness,'inspection');
    await f.o.jobAction(f.j.id,{action:'approve'});assert.equal((await f.o.state()).ownProperties[0].operation.readiness,'ready');
  }finally{f.database.db.close();}
});
test('accepting a cleaning report never clears an owner maintenance block',async()=>{
  const f=await occupiedFixture();try{
    await f.o.bookingAction(f.b.id,{action:'checkout'});await f.w.jobAction(f.j.id,{action:'start'});
    await f.w.jobAction(f.j.id,{action:'submit',checklist:[true,true,true,true],report:'Обнаружена протечка'});
    const op=(await f.o.state()).ownProperties[0].operation;
    await f.o.readinessAction(f.propertyId,{readiness:'maintenance',expectedVersion:op.version,note:'Протечка'});
    await f.o.jobAction(f.j.id,{action:'approve'});
    assert.equal((await f.o.state()).ownProperties[0].operation.readiness,'maintenance');
    await assert.rejects(f.g.bookingQuote({propertyId:f.propertyId,start:iso(start+3*86400000),end:iso(start+4*86400000),guests:1}),e=>e.status===409);
  }finally{f.database.db.close();}
});

test('workspace state requires an identified role and scopes multi-role accounts',async()=>{
  const f=await rentalFixture();try{
    await assert.rejects(f.o.roleState(null),e=>e.status===403);
    await assert.rejects(f.o.roleState('admin'),e=>e.status===403);
    await assert.rejects(f.g.roleState('owner'),e=>e.status===403);
    await f.o.saveProfile({name:'Owner',contact:'test',city:'Павлодар',roles:['owner','guest','cleaner'],districts:'Центр',experience:'test',availability:'test'});
    await f.g.createBooking({propertyId:f.propertyId,start:iso(start),end:iso(start+86400000),guests:1,requestKey:'scoped',acceptTerms:true});
    await f.o.createJob({propertyId:f.propertyId,start:iso(start+3*86400000),end:iso(start+3*86400000+3600000),fee:3000,description:'test'});
    const ownJob=(await f.o.state()).jobs[0];
    await f.o.notify('o','Private owner event','test','owner').run();
    await f.o.notify('o','Guest event','test','guest').run();
    await f.o.query('INSERT INTO notifications VALUES (?,?,?,?,?,?)','legacy-owner','o','Legacy owner event','overdue:'+ownJob.id,0,1).run();
    const ownerState=await f.o.roleState('owner'),guestState=await f.o.roleState('guest'),cleanerState=await f.o.roleState('cleaner');
    assert.equal(ownerState.ownProperties.length,1);assert.equal(ownerState.bookings.length,1);assert.equal(ownerState.properties.length,0);
    assert.equal(guestState.ownProperties.length,0);assert.equal(guestState.jobs.length,0);assert.equal(guestState.bookings.length,0);assert.equal(guestState.properties.length,1);
    assert.equal(cleanerState.ownProperties.length,0);assert.equal(cleanerState.bookings.length,0);assert.equal(cleanerState.properties.length,0);
    assert.deepEqual(Object.keys(guestState.workspaces),['guest']);
    assert.equal(cleanerState.jobs[0].address,null);assert.equal(cleanerState.jobs[0].owner_contact,null);
    assert.ok(ownerState.notifications.some(n=>n.body==='Private owner event'));assert.equal(guestState.notifications.some(n=>n.body==='Private owner event'),false);assert.equal(cleanerState.notifications.some(n=>n.body==='Legacy owner event'),false);
  }finally{f.database.db.close();}
});
test('workspace command permissions cannot be expanded by body role or claimed owner ID',async()=>{
  const f=await rentalFixture();try{
    await assert.rejects(f.g.authorizeWorkspace('guest','properties',{role:'owner',userId:'o'}),e=>e.status===403);
    await assert.rejects(f.o.authorizeWorkspace('owner','bookings',{role:'guest'}),e=>e.status===403);
    await assert.rejects(f.w.authorizeWorkspace('cleaner','jobs/test',{action:'approve',role:'owner'}),e=>e.status===403);
    assert.equal(await f.w.authorizeWorkspace('cleaner','jobs/test',{action:'submit'}),'cleaner');
  }finally{f.database.db.close();}
});

test('assistant preferences persist per role and reject stale or invalid settings',async()=>{
  const f=await rentalFixture();try{
    const settings={...defaultAssistantSettings,expectedVersion:0,mode:'important',leadMinutes:120,repeatMinutes:60,quietEnabled:true};
    await f.o.saveAssistantSettings('owner',settings);
    const ownerState=await f.o.roleState('owner'),guestState=await f.g.roleState('guest');
    assert.equal(ownerState.assistantSettings.mode,'important');assert.equal(ownerState.assistantSettings.version,1);assert.equal(guestState.assistantSettings.mode,'proactive');
    await assert.rejects(f.o.saveAssistantSettings('owner',settings),e=>e.status===409);
    await assert.rejects(f.g.saveAssistantSettings('owner',settings),e=>e.status===403);
    await assert.rejects(f.o.saveAssistantSettings('owner',{...settings,expectedVersion:1,quietStart:'25:00'}),/ЧЧ:ММ/);
    await assert.rejects(f.o.saveAssistantSettings('owner',{...settings,expectedVersion:1,leadMinutes:0}),/Заблаговременность/);
    assert.equal(f.database.db.prepare('SELECT COUNT(*) n FROM bookings').get().n,0);
  }finally{f.database.db.close();}
});
test('assistant quiet hours span midnight, with explicit urgent exceptions and a reactive mode',()=>{
  const t=Date.parse('2026-11-01T23:00:00+05:00')/1000,settings={...defaultAssistantSettings,quietEnabled:true};
  const ordinary={profile:{id:'owner'},ownProperties:[],bookings:[],jobs:[]};
  assert.equal(assistantBrief(ordinary,'owner',settings,t).automatic,false);
  const overdue={...ordinary,bookings:[{id:'stay',property_id:'p',title:'Home',status:'confirmed',start:t-7200,end:t-60,terms:{actual_checkout:null}}]};
  assert.equal(assistantBrief(overdue,'owner',settings,t).prompts[0].id,'checkout:stay');
  assert.equal(assistantBrief(overdue,'owner',{...settings,urgentInQuiet:false},t).automatic,false);
  assert.equal(assistantBrief(overdue,'owner',{...settings,mode:'reactive'},t).automatic,false);
  assert.equal(assistantBrief(ordinary,'owner',settings,Date.parse('2026-11-02T08:00:00+05:00')/1000).quiet,false);
});
test('assistant detects overdue checkout without freeing the apartment or asserting completion',async()=>{
  const f=await occupiedFixture();try{
    f.database.db.prepare('UPDATE bookings SET end=?,occupied_until=? WHERE id=?').run(f.t-60,f.t+5400,f.b.id);
    const state=await f.o.roleState('owner');assert.ok(state.assistantBrief.tasks.some(t=>t.id==='checkout:'+f.b.id&&t.priority===3));
    assert.ok(state.workspaces.owner.attention.some(e=>e.title==='Проверить фактический выезд'));
    assert.equal(state.workspaces.owner.activeBookings,1);
    assert.equal(state.bookings.find(b=>b.id===f.b.id).status,'confirmed');assert.equal(state.bookings.find(b=>b.id===f.b.id).terms.actual_checkout,null);
    assert.equal(state.assistantBrief.capabilities.modelActions,false);assert.equal(state.assistantBrief.capabilities.backgroundDelivery,false);
  }finally{f.database.db.close();}
});
test('assistant planning does not expose another role tasks and settings do not expand powers',async()=>{
  const f=await rentalFixture();try{
    await f.o.createJob({propertyId:f.propertyId,start:iso(start),end:iso(start+3600000),fee:3000,description:'Owner only'});
    const state=await f.g.roleState('guest');assert.equal(state.assistantBrief.tasks.some(t=>t.kind==='job'),false);
    await f.g.saveAssistantSettings('guest',{...defaultAssistantSettings,expectedVersion:0,role:'owner',allowPayments:true});
    const saved=await f.g.roleState('guest');assert.equal(saved.assistantSettings.allowPayments,undefined);
    await assert.rejects(f.g.authorizeWorkspace('guest','bookings/other',{action:'paid'}),e=>e.status===403);
  }finally{f.database.db.close();}
});
