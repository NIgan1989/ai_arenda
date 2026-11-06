import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync,mkdirSync,readdirSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';

mkdirSync('outputs/administrator-test',{recursive:true});
for(const name of readdirSync('lib').filter(f=>f.endsWith('.ts')&&!f.endsWith('.d.ts')).map(f=>f.slice(0,-3))){
 const js=ts.transpileModule(readFileSync(`lib/${name}.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText.replace(/from '(\.\/[^']+)'/g,(_,name)=>`from '${name}.js'`);
 writeFileSync(`outputs/administrator-test/${name}.js`,js);
}
const {RentalService}=await import(pathToFileURL(process.cwd()+'/outputs/administrator-test/service.js'));
const {checkAdministratorOwner,runAdministrator}=await import(pathToFileURL(process.cwd()+'/outputs/administrator-test/administrator-runtime.js'));
const {planAdministrator}=await import(pathToFileURL(process.cwd()+'/outputs/administrator-test/administrator.js'));
const {administratorRunnerAuthorized}=await import(pathToFileURL(process.cwd()+'/outputs/administrator-test/administrator-auth.js'));
class D1{
 constructor(){this.raw=new DatabaseSync(':memory:');this.raw.exec('PRAGMA foreign_keys=ON');for(const file of readdirSync('drizzle').filter(f=>/^\d+.*\.sql$/.test(f)).sort())this.raw.exec(readFileSync('drizzle/'+file,'utf8'));}
 prepare(sql){const db=this.raw;let args=[];return {bind(...values){args=values;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){const r=db.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}};}};}
 async batch(statements){this.raw.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());this.raw.exec('COMMIT');return results;}catch(error){this.raw.exec('ROLLBACK');throw error;}}
 close(){this.raw.close();}
}
const iso=seconds=>new Date(seconds*1000).toISOString(),now=()=>Math.floor(Date.now()/1000);
async function fixture(){
 const db=new D1(),owner=new RentalService(db,'owner'),guest=new RentalService(db,'guest'),cleaner=new RentalService(db,'cleaner');
 await owner.saveProfile({name:'Owner',city:'Павлодар',contact:'private owner contact',roles:['owner']});
 await guest.saveProfile({name:'Guest',city:'Павлодар',contact:'private guest contact',roles:['guest']});
 await cleaner.saveProfile({name:'Cleaner',city:'Павлодар',contact:'private worker contact',roles:['cleaner'],districts:'Центр',experience:'Experienced',availability:'By agreement'});
 const property=(await owner.createProperty({title:'Test apartment',city:'Павлодар',district:'Центр',address:'PRIVATE ADDRESS',description:'Test',price:10000,rooms:1,capacity:2,cleaningMinutes:90})).id;
 const policy={expectedVersion:0,dailyPrice:10000,hourlyPrice:2000,minHours:2,nightlyPrice:9000,checkinTime:'14:00',checkoutTime:'12:00',deposit:10000,houseRules:'No smoking',autoConfirm:false,autoAssign:false,cleaningFee:3000,cleaningBudget:4000};
 await owner.savePolicy(property,policy);
 const booking=(await guest.createBooking({propertyId:property,start:iso(now()+900),end:iso(now()+8100),guests:1,billingMode:'hourly',requestKey:'test',acceptTerms:true})).id;
 const release=()=>db.raw.prepare('UPDATE administrator_runs SET lease_until=0').run();
 return {db,owner,guest,cleaner,property,policy,booking,release};
}
async function confirm(f){await f.owner.bookingAction(f.booking,{action:'confirm',cleaningFee:3000});return f.db.raw.prepare('SELECT * FROM cleaning_jobs WHERE booking_id=?').get(f.booking);}

test('administrator persists participant tasks, deduplicates reminders and closes resolved causes',async()=>{
 const f=await fixture();try{
  await confirm(f);await checkAdministratorOwner(f.db,'owner');
  assert.equal(f.db.raw.prepare("SELECT COUNT(*) n FROM administrator_tasks WHERE stage='payment' AND status='open'").get().n,2);
  const before=f.db.raw.prepare("SELECT COUNT(*) n FROM notifications WHERE dedupe LIKE '%administrator:%'").get().n;
  f.release();await checkAdministratorOwner(f.db,'owner');assert.equal(f.db.raw.prepare("SELECT COUNT(*) n FROM notifications WHERE dedupe LIKE '%administrator:%'").get().n,before);
  await f.owner.bookingAction(f.booking,{action:'paid'});f.release();await checkAdministratorOwner(f.db,'owner');
  assert.equal(f.db.raw.prepare("SELECT COUNT(*) n FROM administrator_tasks WHERE stage='payment' AND status='open'").get().n,0);
  assert.equal(f.db.raw.prepare("SELECT COUNT(*) n FROM administrator_tasks WHERE stage='payment' AND status='resolved'").get().n,2);
  assert.equal(f.db.raw.prepare('SELECT actual_checkin FROM booking_terms WHERE booking_id=?').get(f.booking).actual_checkin,null);
 }finally{f.db.close();}
});
test('retries and simultaneous checks acquire one lease; delayed work escalates without flooding',async()=>{
 const f=await fixture();try{
  const results=await Promise.all([checkAdministratorOwner(f.db,'owner'),checkAdministratorOwner(f.db,'owner')]);assert.equal(results.filter(r=>r.checked).length,1);
  f.db.raw.prepare("UPDATE administrator_tasks SET first_seen=?,last_notified=?,priority=2,notified_priority=2 WHERE role='owner'").run(now()-8000,now()-4000);
  f.release();await checkAdministratorOwner(f.db,'owner');
  const task=f.db.raw.prepare("SELECT * FROM administrator_tasks WHERE role='owner' AND stage='request'").get();assert.equal(task.priority,3);assert.equal(task.notice_revision,2);
  f.release();await checkAdministratorOwner(f.db,'owner');assert.equal(f.db.raw.prepare('SELECT notice_revision FROM administrator_tasks WHERE id=?').get(task.id).notice_revision,2);
 }finally{f.db.close();}
});
test('legacy reactive and quiet settings cannot disable the system coordinator',async()=>{
 const f=await fixture();try{
  f.db.raw.prepare('INSERT INTO assistant_preferences VALUES (?,?,?,?,?)').run('owner','owner',JSON.stringify({mode:'reactive',quietEnabled:true,quietStart:'00:00',quietEnd:'23:59',urgentInQuiet:false}),1,now());
  await checkAdministratorOwner(f.db,'owner');assert.ok(f.db.raw.prepare("SELECT COUNT(*) n FROM administrator_tasks WHERE role='owner'").get().n>0);
  assert.ok(f.db.raw.prepare("SELECT COUNT(*) n FROM notifications WHERE dedupe LIKE 'owner:administrator:%'").get().n>0);
 }finally{f.db.close();}
});

test('expired applications release the calendar and notify both sides exactly once',async()=>{
 const f=await fixture();try{
  f.db.raw.prepare('UPDATE bookings SET expires_at=? WHERE id=?').run(now()-1,f.booking);
  await runAdministrator(f.db);f.release();await runAdministrator(f.db);
  assert.equal(f.db.raw.prepare('SELECT status FROM bookings WHERE id=?').get(f.booking).status,'expired');
  assert.equal(f.db.raw.prepare("SELECT COUNT(*) n FROM notifications WHERE dedupe IN (?,?)").get('guest:expired:'+f.booking,'owner:expired:'+f.booking).n,2);
 }finally{f.db.close();}
});
test('automatic assignment needs owner permission and worker application, preserves payment and physical facts',async()=>{
 const f=await fixture();try{
  const job=await confirm(f);await f.cleaner.jobAction(job.id,{action:'apply'});
  await checkAdministratorOwner(f.db,'owner');assert.equal(f.db.raw.prepare('SELECT assigned_to FROM cleaning_jobs WHERE id=?').get(job.id).assigned_to,null);
  await f.owner.savePolicy(f.property,{...f.policy,autoAssign:true,expectedVersion:1});f.release();const result=await checkAdministratorOwner(f.db,'owner');assert.equal(result.actions,1);
  const saved=f.db.raw.prepare('SELECT * FROM cleaning_jobs WHERE id=?').get(job.id);assert.equal(saved.assigned_to,'cleaner');assert.equal(saved.status,'assigned');
  assert.equal(f.db.raw.prepare('SELECT payment_status FROM bookings WHERE id=?').get(f.booking).payment_status,'unpaid');
  assert.equal(f.db.raw.prepare('SELECT actual_checkout FROM booking_terms WHERE booking_id=?').get(f.booking).actual_checkout,null);
  assert.ok(f.db.raw.prepare("SELECT id FROM audit_events WHERE entity_id=? AND actor_id='system:rental-policy'").get(job.id));
  f.release();assert.equal((await checkAdministratorOwner(f.db,'owner')).actions,0);
 }finally{f.db.close();}
});
test('expired mandates, budget limits, unavailable workers and missing applications never auto-assign',async()=>{
 for(const blocked of ['expiry','budget','away','no-application']){
  const f=await fixture();try{
   const job=await confirm(f);if(blocked!=='no-application')await f.cleaner.jobAction(job.id,{action:'apply'});
   await f.owner.savePolicy(f.property,{...f.policy,autoAssign:true,expectedVersion:1});
   if(blocked==='expiry')f.db.raw.prepare('UPDATE property_policies SET mandate_until=?').run(now()-1);
   if(blocked==='budget')f.db.raw.prepare('UPDATE cleaning_jobs SET fee=5000 WHERE id=?').run(job.id);
   if(blocked==='away')f.db.raw.prepare("INSERT INTO profile_details(user_id,work_status,version,revision,updated_at) VALUES ('cleaner','away',1,'test',?)").run(now());
   await checkAdministratorOwner(f.db,'owner');assert.equal(f.db.raw.prepare('SELECT assigned_to FROM cleaning_jobs WHERE id=?').get(job.id).assigned_to,null,blocked);
  }finally{f.db.close();}
 }
});
test('owner sees the linked participant chain; guest and unrelated owner cannot read its tasks or resolve its issues',async()=>{
 const f=await fixture();try{
  await confirm(f);await f.guest.bookingAction(f.booking,{action:'issue',issue:'The door needs attention'});await checkAdministratorOwner(f.db,'owner');
  const owner=await f.owner.roleState('owner'),guest=await f.guest.roleState('guest');
  assert.ok(owner.administrator.tasks.some(task=>task.role==='guest'));assert.ok(guest.administrator.tasks.every(task=>task.role==='guest'&&task.user_id==='guest'));
  const outsider=new RentalService(f.db,'outsider');await outsider.saveProfile({name:'Other owner',contact:'test',city:'Павлодар',roles:['owner']});assert.equal((await outsider.roleState('owner')).administrator.total,0);
  const issue=owner.administrator.issues[0];await assert.rejects(outsider.resolveAdministratorIssue('owner',{id:issue.id,resolution:'fake',expectedVersion:1}),e=>e.status===403);
  await assert.rejects(f.guest.resolveAdministratorIssue('guest',{id:issue.id,resolution:'fake',expectedVersion:1}),e=>e.status===403);
  await f.owner.resolveAdministratorIssue('owner',{id:issue.id,resolution:'A responsible person fixed the door',expectedVersion:1});f.release();await checkAdministratorOwner(f.db,'owner');
  assert.equal((await f.owner.roleState('owner')).administrator.tasks.filter(task=>task.entity_kind==='issue').length,0);
  await assert.rejects(f.owner.resolveAdministratorIssue('owner',{id:issue.id,resolution:'duplicate',expectedVersion:1}),e=>e.status===409);
 }finally{f.db.close();}
});
test('financial completion requires owner, explicit confirmation and current revision; no bank call is made',async()=>{
 const f=await fixture();try{
  await confirm(f);await f.owner.bookingAction(f.booking,{action:'paid'});await f.owner.bookingAction(f.booking,{action:'cancel'});
  const terms=f.db.raw.prepare('SELECT * FROM booking_terms WHERE booking_id=?').get(f.booking),body={action:'record_refund',expectedVersion:terms.version,note:'External bank transfer checked',confirmed:true};
  await assert.rejects(f.guest.bookingAction(f.booking,body),e=>e.status===403);
  await assert.rejects(f.owner.bookingAction(f.booking,{...body,confirmed:false}));
  await assert.rejects(f.owner.bookingAction(f.booking,{...body,expectedVersion:0}),e=>e.status===409);
  await f.owner.bookingAction(f.booking,body);assert.ok(f.db.raw.prepare('SELECT refund_recorded_at FROM booking_terms WHERE booking_id=?').get(f.booking).refund_recorded_at);
  await assert.rejects(f.owner.bookingAction(f.booking,body),e=>e.status===409);
 }finally{f.db.close();}
});
test('planner escalates a threatened next arrival and never treats elapsed time as checkout or cleaning acceptance',()=>{
 const t=now(),data={ownerId:'o',properties:[{id:'p',title:'Private unit',readiness:'cleaning'}],bookings:[{id:'b',property_id:'p',guest_id:'g',status:'confirmed',start:t-7200,end:t-60,payment_status:'unpaid',terms:{}},{id:'next',property_id:'p',guest_id:'n',status:'confirmed',start:t+900,end:t+7200,payment_status:'unpaid',terms:{}}],jobs:[{id:'j',property_id:'p',booking_id:'b',status:'in_progress',assigned_to:'c',start:t-60,end:t+600}],applications:[]};
 const tasks=planAdministrator(data,t);assert.ok(tasks.some(task=>task.stage==='next-arrival'&&task.priority===3));assert.ok(tasks.some(task=>task.stage==='checkout'&&task.user_id==='g'&&task.priority===3));assert.equal(data.bookings[0].status,'confirmed');assert.equal(data.jobs[0].status,'in_progress');
});
test('background endpoint accepts only its server secret on POST',async()=>{
 const secret='x'.repeat(64),url='http://localhost/api/internal/administrator-run';
 assert.equal(await administratorRunnerAuthorized(new Request(url,{method:'POST'}),secret),false);
 assert.equal(await administratorRunnerAuthorized(new Request(url,{headers:{Authorization:'Bearer '+secret}}),secret),false);
 assert.equal(await administratorRunnerAuthorized(new Request(url,{method:'POST',headers:{Authorization:'Bearer '+'z'.repeat(64)}}),secret),false);
 assert.equal(await administratorRunnerAuthorized(new Request(url,{method:'POST',headers:{Authorization:'Bearer '+secret}}),secret),true);
});
test('early checkout preserves accepted cleaning time; late checkout revokes the old application',async()=>{
 for(const late of [false,true]){
  const f=await fixture();try{
   const job=await confirm(f);await f.cleaner.jobAction(job.id,{action:'apply'});
   const app=f.db.raw.prepare('SELECT * FROM applications WHERE job_id=?').get(job.id);await f.owner.jobAction(job.id,{action:'assign',applicationId:app.id});
   const t=now();f.db.raw.prepare('UPDATE bookings SET start=? WHERE id=?').run(t-7200,f.booking);
   if(late)f.db.raw.prepare('UPDATE cleaning_jobs SET start=?,end=? WHERE id=?').run(t-600,t+4800,job.id);
   await f.owner.bookingAction(f.booking,{action:'checkout'});
   const saved=f.db.raw.prepare('SELECT * FROM cleaning_jobs WHERE id=?').get(job.id);
   assert.equal(saved.status,late?'open':'assigned');assert.equal(saved.assigned_to,late?null:'cleaner');
   if(late){assert.equal(f.db.raw.prepare('SELECT status FROM applications WHERE id=?').get(app.id).status,'rejected');assert.ok(saved.start>=t);}
   else assert.equal(saved.start,job.start);
  }finally{f.db.close();}
 }
});
test('revoking a mandate between validation and commit blocks assignment and creates no false audit or notice',async()=>{
 const f=await fixture();try{
  const job=await confirm(f);await f.cleaner.jobAction(job.id,{action:'apply'});await f.owner.savePolicy(f.property,{...f.policy,autoAssign:true,expectedVersion:1});
  const application=f.db.raw.prepare('SELECT id FROM applications WHERE job_id=?').get(job.id),delegated=new RentalService(f.db,'owner',{propertyId:f.property,policyVersion:2});
  const batch=f.db.batch.bind(f.db);f.db.batch=async statements=>{f.db.raw.prepare('UPDATE property_policies SET auto_assign=0,version=version+1 WHERE property_id=?').run(f.property);return batch(statements);};
  await assert.rejects(delegated.jobAction(job.id,{action:'assign',applicationId:application.id,expectedVersion:job.version}),e=>e.status===409);
  assert.equal(f.db.raw.prepare('SELECT assigned_to FROM cleaning_jobs WHERE id=?').get(job.id).assigned_to,null);
  assert.equal(f.db.raw.prepare("SELECT COUNT(*) n FROM audit_events WHERE entity_id=? AND actor_id='system:rental-policy'").get(job.id).n,0);
  assert.equal(f.db.raw.prepare("SELECT COUNT(*) n FROM notifications WHERE dedupe LIKE 'cleaner:assigned:%'").get().n,0);
 }finally{f.db.close();}
});
