import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

// Exercise the real SQL and service against SQLite with D1-compatible batches.
mkdirSync('outputs/test-lib',{recursive:true});
for(const name of ['domain','ai','service']){
  const source=readFileSync(`lib/${name}.ts`,'utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText.replace("from './domain'","from './domain.js'").replace("from './ai'","from './ai.js'");
  writeFileSync(`outputs/test-lib/${name}.js`,compiled);
}
const {RentalService}=await import(pathToFileURL(process.cwd()+'/outputs/test-lib/service.js'));
const {interval,quote}=await import(pathToFileURL(process.cwd()+'/outputs/test-lib/domain.js'));
class D1 {
  constructor(){this.db=new DatabaseSync(':memory:');this.db.exec('PRAGMA foreign_keys=ON');this.db.exec(readFileSync('drizzle/0000_boring_unus.sql','utf8'));}
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
  await assert.rejects(guest.createBooking({propertyId:property,start:iso(start+86400000),end:iso(start+90000000),guests:1,requestKey:'overlap'}),/booking_overlap/);
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
  await worker.query('UPDATE cleaning_jobs SET start=?,end=? WHERE id=?',Math.floor(Date.now()/1000)+60,Math.floor(Date.now()/1000)+3600,job).run();
  await worker.jobAction(job,{action:'start'});
  await assert.rejects(worker.jobAction(job,{action:'submit',checklist:[true],report:'Test'}),/пункты/);
  await worker.jobAction(job,{action:'submit',checklist:[true,true,true,true],report:'Cleaning complete'});
  await assert.rejects(guest.jobAction(job,{action:'approve'}),/доступа/);
  await owner.jobAction(job,{action:'approve'});
  assert.equal((await worker.state()).jobs.find(j=>j.id===job).status,'completed');
});
test('owner payment verification and cancellation preserve the audit trail',async()=>{
  await owner.bookingAction(booking,{action:'paid'});assert.equal((await guest.state()).bookings.find(b=>b.id===booking).payment_status,'owner_verified');
  await guest.bookingAction(booking,{action:'cancel'});assert.equal((await owner.state()).bookings.find(b=>b.id===booking).status,'cancelled');
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
