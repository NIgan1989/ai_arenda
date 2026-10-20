import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

// Exercise the real SQL and service against SQLite with D1-compatible batches.
mkdirSync('outputs/test-lib',{recursive:true});
for(const name of ['domain','ai','service','auth','operations','photos']){
  const source=readFileSync(`lib/${name}.ts`,'utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText.replace("from './domain'","from './domain.js'").replace("from './ai'","from './ai.js'").replace("from './service'","from './service.js'").replace("from './photos'","from './photos.js'");
  writeFileSync(`outputs/test-lib/${name}.js`,compiled);
}
const {RentalService}=await import(pathToFileURL(process.cwd()+'/outputs/test-lib/service.js'));
const {interval,quote}=await import(pathToFileURL(process.cwd()+'/outputs/test-lib/domain.js'));
class D1 {
  constructor(){this.db=new DatabaseSync(':memory:');this.db.exec('PRAGMA foreign_keys=ON');this.db.exec(readFileSync('drizzle/0000_boring_unus.sql','utf8'));this.db.exec(readFileSync('drizzle/0001_accounts_and_operations.sql','utf8'));this.db.exec(readFileSync('drizzle/0002_property_photos.sql','utf8'));}
  prepare(sql){const db=this.db;let args=[];return {bind(...values){args=values.map(v=>v instanceof ArrayBuffer?new Uint8Array(v):v);return this;},async first(){const row=db.prepare(sql).get(...args);return row?Object.fromEntries(Object.entries(row).map(([key,value])=>[key,value instanceof Uint8Array?Array.from(value):value])):null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){const r=db.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}};}};}
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
  const d=new RentalService(db,'demo-user');await d.demo();await d.demo();await d.saveSettings({activeRole:'owner'});
  assert.equal((await d.state()).ownProperties.length,2);
  assert.equal((await guest.state()).properties.filter(p=>p.demo_owner).length,0);
});

test('property editing and catalog visibility enforce ownership and preserve reservations',async()=>{
  const body={title:'Editable apartment',city:'Павлодар',district:'Центр',address:'PRIVATE EDIT ADDRESS',description:'Rules',price:12000,rooms:2,capacity:3,cleaningMinutes:60};
  const editable=(await owner.createProperty(body)).id;
  const reservation=(await guest.createBooking({propertyId:editable,start:iso(start+10*86400000),end:iso(start+11*86400000),guests:2,requestKey:'editing-booking'})).id;
  await assert.rejects(guest.updateProperty(editable,{...body,action:'update'}),/роль/);
  await other.saveProfile({name:'Other',contact:'test',city:'Павлодар',roles:['owner']});
  await assert.rejects(other.updateProperty(editable,{action:'visibility',published:false}),/недоступна/);
  await assert.rejects(owner.updateProperty(editable,{...body,price:0,action:'update'}));
  await assert.rejects(owner.updateProperty(editable,{...body,cleaningMinutes:120,action:'update'}),/активных бронях/);
  await owner.updateProperty(editable,{...body,title:'Updated apartment',price:15000,action:'update'});
  assert.equal((await owner.one('SELECT * FROM properties WHERE id=?',editable)).title,'Updated apartment');
  assert.equal((await owner.one('SELECT * FROM bookings WHERE id=?',reservation)).amount,12000);
  await owner.updateProperty(editable,{action:'visibility',published:false});
  assert.equal((await guest.state()).properties.some(p=>p.id===editable),false);
  assert.equal((await owner.state()).ownProperties.find(p=>p.id===editable).published,0);
  assert.ok(await owner.one('SELECT * FROM bookings WHERE id=?',reservation));
  await owner.updateProperty(editable,{action:'visibility',published:true});
  assert.equal((await guest.state()).properties.some(p=>p.id===editable),true);
});

test('independent accounts persist roles, passwords are hashed, sessions expire and logout revokes access',async()=>{
 const {authenticate,sessionUser,logout,sessionCookie}=await import(pathToFileURL(process.cwd()+'/outputs/test-lib/auth.js'));
 const isolated=new D1();const credentials={name:'Independent guest',email:'guest@example.test',password:'Strong-test-password-2026',contact:'Test contact',city:'Павлодар',role:'guest'};
 const registration=await authenticate(isolated,credentials,true,'test-ip-1');
 const account=isolated.db.prepare('SELECT * FROM accounts WHERE id=?').get(registration.userId);
 assert.notEqual(account.password_hash,credentials.password);assert.match(account.password_hash,/^scrypt-v1\$/);
 assert.equal(JSON.parse(isolated.db.prepare('SELECT roles FROM profiles WHERE id=?').get(registration.userId).roles)[0],'guest');
 const request=new Request('http://localhost/api/state',{headers:{cookie:'arenda_session='+registration.token}});
 assert.equal((await sessionUser(isolated,request)).userId,registration.userId);
 assert.match(sessionCookie(registration.token,request),/HttpOnly/);assert.match(sessionCookie(registration.token,new Request('https://app.test/')),/Secure/);
 await assert.rejects(authenticate(isolated,{...credentials,password:'wrong-password'},false,'test-ip-1'),/Неверный/);
 const login=await authenticate(isolated,{...credentials,email:'GUEST@example.test'},false,'test-ip-1');
 assert.notEqual(login.token,registration.token);assert.equal(login.userId,registration.userId);
 await logout(isolated,request);assert.equal(await sessionUser(isolated,request),null);
 isolated.db.prepare('UPDATE sessions SET expires_at=0').run();assert.equal(await sessionUser(isolated,new Request('http://localhost/',{headers:{cookie:'arenda_session='+login.token}})),null);
 await assert.rejects(authenticate(isolated,{...credentials,role:'admin',email:'admin@example.test'},true,'test-ip-2'),/роль/);
});

test('hourly housing and owner rules coordinate guest booking and cleaner assignment',async()=>{
 const isolated=new D1(),host=new RentalService(isolated,'host'),client=new RentalService(isolated,'client'),cleaner=new RentalService(isolated,'cleaner');
 await host.saveProfile({name:'Host',contact:'host',city:'Павлодар',roles:['owner']});
 await client.saveProfile({name:'Client',contact:'client',city:'Павлодар',roles:['guest']});
 await cleaner.saveProfile({name:'Cleaner',contact:'cleaner',city:'Павлодар',roles:['cleaner'],districts:'Центр',experience:'Опыт',availability:'Днём'});
 await assert.rejects(client.saveSettings({activeRole:'owner'}),/не подключена/);
 await assert.rejects(client.saveSettings({autoConfirm:true,autoAssign:true,cleaningFee:5000}),/роль/);
 await host.saveSettings({autoConfirm:true,autoAssign:true,cleaningFee:5000});
 const property=(await host.createProperty({title:'Hotel unit',city:'Павлодар',district:'Центр',address:'PRIVATE',description:'Rules',price:2000,rooms:1,capacity:2,cleaningMinutes:60,propertyType:'hotel',rateUnit:'hour'})).id;
 const booking=await client.createBooking({propertyId:property,start:iso(start),end:iso(start+90*60000),guests:1,requestKey:'hourly'});
 assert.equal(booking.amount,4000);assert.equal((await client.state()).bookings[0].status,'confirmed');
 const job=(await host.state()).jobs[0];assert.equal(job.fee,5000);
 const result=await cleaner.jobAction(job.id,{action:'apply'});assert.match(result.message,/назначены/);
 const assigned=(await cleaner.state()).jobs.find(j=>j.id===job.id);assert.equal(assigned.assigned_to,'cleaner');assert.equal(assigned.address,'PRIVATE');
 assert.ok((await client.state()).notifications.some(n=>n.dedupe.startsWith('confirmed:')));
 assert.ok((await host.state()).activity.some(n=>n.action==='assistant.cleaner_assigned'));
 assert.equal((await client.state()).ownProperties.length,0);
 assert.equal((await cleaner.state()).bookings.length,0);
});

test('background operator expires reservations and reminders are deduplicated',async()=>{
 const {runOperations}=await import(pathToFileURL(process.cwd()+'/outputs/test-lib/operations.js'));
 const isolated=new D1(),host=new RentalService(isolated,'host'),client=new RentalService(isolated,'client');
 await host.saveProfile({name:'Host',contact:'host',city:'Павлодар',roles:['owner']});await client.saveProfile({name:'Client',contact:'client',city:'Павлодар',roles:['guest']});
 const property=(await host.createProperty({title:'Unit',city:'Павлодар',district:'Центр',address:'PRIVATE',description:'Rules',price:10000,rooms:1,capacity:2,cleaningMinutes:60})).id;
 const reservation=await client.createBooking({propertyId:property,start:iso(start),end:iso(start+86400000),guests:1,requestKey:'expiry-tick'});
 isolated.db.prepare('UPDATE bookings SET expires_at=0 WHERE id=?').run(reservation.id);
 await runOperations(isolated);const first=isolated.db.prepare('SELECT count(*) count FROM notifications').get().count;await runOperations(isolated);
 assert.equal(isolated.db.prepare('SELECT status FROM bookings WHERE id=?').get(reservation.id).status,'expired');
 assert.equal(isolated.db.prepare('SELECT count(*) count FROM notifications').get().count,first);
 assert.ok((await host.state()).notifications.some(n=>n.dedupe.startsWith('expired:owner:')));
 assert.ok((await client.state()).notifications.some(n=>n.dedupe.startsWith('expired:guest:')));
});

test('operator dispatches existing pending work after owner enables rules',async()=>{
 const {runOperations}=await import(pathToFileURL(process.cwd()+'/outputs/test-lib/operations.js'));
 const d=new D1(),host=new RentalService(d,'h'),client=new RentalService(d,'g'),cleaner=new RentalService(d,'c');
 await host.saveProfile({name:'H',contact:'h',city:'Павлодар',roles:['owner']});await client.saveProfile({name:'G',contact:'g',city:'Павлодар',roles:['guest']});await cleaner.saveProfile({name:'C',contact:'c',city:'Павлодар',roles:['cleaner'],districts:'Центр',experience:'опыт',availability:'день'});
 const property=(await host.createProperty({title:'Test',city:'Павлодар',district:'Центр',address:'Private',description:'Test',price:10000,rooms:1,capacity:2,cleaningMinutes:60})).id;
 const job=(await host.createJob({propertyId:property,start:iso(start+86400000),end:iso(start+90000000),fee:3000,description:'Test cleaning'})).id;
 await cleaner.jobAction(job,{action:'apply'});
 await host.saveSettings({autoConfirm:true,autoAssign:true,cleaningFee:4000});
 await runOperations(d);
 assert.equal((await host.one('SELECT status FROM cleaning_jobs WHERE id=?',job)).status,'assigned');
 assert.ok((await cleaner.state()).notifications.some(n=>n.dedupe.startsWith('assigned:')));
});

test('cleaner can decline before work and owner can request rework before acceptance',async()=>{
 const d=new D1(),host=new RentalService(d,'h'),cleaner=new RentalService(d,'c');
 await host.saveProfile({name:'H',contact:'h',city:'Павлодар',roles:['owner']});await cleaner.saveProfile({name:'C',contact:'c',city:'Павлодар',roles:['cleaner'],districts:'Центр',experience:'опыт',availability:'день'});await host.saveSettings({autoConfirm:false,autoAssign:true,cleaningFee:4000});
 const property=(await host.createProperty({title:'Unit',city:'Павлодар',district:'Центр',address:'Private',description:'Test',price:10000,rooms:1,capacity:2,cleaningMinutes:60})).id;
 const job=(await host.createJob({propertyId:property,start:new Date(Date.now()+600000).toISOString(),end:new Date(Date.now()+4200000).toISOString(),fee:3000,description:'Test cleaning'})).id;
 await cleaner.jobAction(job,{action:'apply'});await cleaner.jobAction(job,{action:'decline'});
 assert.equal((await host.one('SELECT status FROM cleaning_jobs WHERE id=?',job)).status,'open');
 assert.equal((await cleaner.state()).jobs.find(j=>j.id===job).address,null);
 await cleaner.jobAction(job,{action:'apply'});await cleaner.jobAction(job,{action:'start'});
 await assert.rejects(cleaner.jobAction(job,{action:'decline'}),/до начала/);
 await cleaner.jobAction(job,{action:'submit',checklist:[true,true,true,true],report:'Первый отчёт'});
 await host.jobAction(job,{action:'revise',issue:'Проверьте санузел'});
 assert.equal((await host.one('SELECT status FROM cleaning_jobs WHERE id=?',job)).status,'in_progress');
 await assert.rejects(host.jobAction(job,{action:'approve'}),/Нет отчёта/);
 await cleaner.jobAction(job,{action:'submit',checklist:[true,true,true,true],report:'Доработано'});await host.jobAction(job,{action:'approve'});
 assert.equal((await host.one('SELECT status FROM cleaning_jobs WHERE id=?',job)).status,'completed');
});

test('property photos persist with ownership, visibility, order and file validation',async()=>{
 const {storePhoto,fetchPhoto,validatePhoto}=await import(pathToFileURL(process.cwd()+'/outputs/test-lib/photos.js'));
 const d=new D1(),host=new RentalService(d,'host'),client=new RentalService(d,'client'),otherHost=new RentalService(d,'other-host');
 await host.saveProfile({name:'H',contact:'h',city:'Павлодар',roles:['owner']});await client.saveProfile({name:'C',contact:'c',city:'Павлодар',roles:['guest']});await otherHost.saveProfile({name:'O',contact:'o',city:'Павлодар',roles:['owner']});
 const bytes=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZl8AAAAASUVORK5CYII=','base64'));
 assert.throws(()=>validatePhoto(new Uint8Array([60,115,118,103]),'image/png'));
 assert.throws(()=>validatePhoto(new Uint8Array(501*1024),'image/png'),/500/);
 await assert.rejects(storePhoto(d,'client',bytes,'image/png'),/владелец/);
 const a=await storePhoto(d,'host',bytes,'image/png'),b=await storePhoto(d,'host',bytes,'image/png');
 await assert.rejects(fetchPhoto(d,'client',a.id),/не найдено/);
 const body={title:'Photo property',city:'Павлодар',district:'Центр',address:'Private',description:'Test',price:10000,rooms:1,capacity:2,cleaningMinutes:60,photoIds:[b.id,a.id]};
 await assert.rejects(otherHost.createProperty(body),/недоступно/);
 assert.equal((await otherHost.state()).ownProperties.length,0);
 const property=(await host.createProperty(body)).id;
 assert.deepEqual((await host.state()).ownProperties.find(p=>p.id===property).photos.map(p=>p.id),[b.id,a.id]);
 const response=await fetchPhoto(d,'client',a.id);assert.equal(response.headers.get('content-type'),'image/png');assert.deepEqual(new Uint8Array(await response.arrayBuffer()),bytes);
 await host.updateProperty(property,{...body,action:'update',photoIds:[a.id]});
 assert.deepEqual((await client.state()).properties.find(p=>p.id===property).photos.map(p=>p.id),[a.id]);
 await assert.rejects(fetchPhoto(d,'client',b.id),/не найдено/);
 await host.updateProperty(property,{action:'visibility',published:false});
 await assert.rejects(fetchPhoto(d,'client',a.id),/не найдено/);
 assert.equal((await fetchPhoto(d,'host',a.id)).status,200);
 await assert.rejects(host.updateProperty(property,{...body,action:'update',photoIds:[a.id,a.id]}),/8 разных/);
});


test('local AI uses Ollama without paid API and retains deterministic fallback',async()=>{
  const {generateAnswer}=await import(pathToFileURL(process.cwd()+'/outputs/test-lib/ai.js'));
  const original=globalThis.fetch;const calls=[];
  try{
    globalThis.fetch=async(url,init)=>{calls.push(String(url));const body=JSON.parse(init.body);assert.equal(body.think,false);assert.equal(body.stream,false);assert.equal(body.messages[0].role,'system');assert.ok(!init.headers.Authorization);return Response.json({message:{content:'Локальный ответ'}});};
    const cfg={AI_PROVIDER:'ollama',OLLAMA_BASE_URL:'http://127.0.0.1:11434',OLLAMA_MODEL:'qwen3:1.7b',OPENAI_API_KEY:'must-not-be-used',OPENAI_MODEL:'unused'};
    const result=await generateAnswer(cfg,'Вопрос','owner',[],'Сценарий');assert.equal(result.mode,'local-model');assert.equal(result.text,'Локальный ответ');assert.deepEqual(calls,['http://127.0.0.1:11434/api/chat']);
    globalThis.fetch=async()=>{throw Error('offline');};
    const fallback=await generateAnswer(cfg,'Вопрос','guest',[],'Сценарий');assert.equal(fallback.mode,'fallback');assert.match(fallback.text,/Сценарий/);
    globalThis.fetch=async()=>{throw Error('must not call any API');};
    assert.equal((await generateAnswer({OPENAI_API_KEY:'unused',OPENAI_MODEL:'unused'},'Вопрос','guest',[],'Сценарий')).mode,'scenario');
  }finally{globalThis.fetch=original;}
});
