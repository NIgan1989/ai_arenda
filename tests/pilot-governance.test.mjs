import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,load,now} from './helpers/platform.mjs';
const {assertPilotAllowed,readPilotPolicy,pilotPropertyVisibleSql,governanceState,savePilotPolicy,updateOperatorTicket}=await load('pilot-governance');
const {requestParticipantReview,decideParticipantReview}=await load('participant-security');

async function policy(f,fields={}){const current=await readPilotPolicy(f.db);return savePilotPolicy(f.owner,{expectedVersion:current.version,requireOwnerReview:false,requireCleanerReview:false,requirePhone:false,confirmed:true,...fields},true);}
function review(f,user,role,propertyId,status='approved',until=null){f.db.raw.prepare('INSERT INTO participant_reviews(id,user_id,role,property_id,status,method,reference,reviewer_id,notes,created_at,reviewed_at,valid_until) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(crypto.randomUUID(),user,role,propertyId,status,'manual fixture','fixture','owner','Checked',now(),now(),until);}
function phone(f,user,number){f.db.raw.prepare('INSERT INTO auth_accounts(id,phone,name,password_hash,recovery_hash,created_at) VALUES (?,?,?,?,?,?)').run(user,number,user,'fixture','fixture',now());f.db.raw.prepare('INSERT INTO phone_verifications(user_id,phone,code_hash,expires_at,sent_at,verified_at) VALUES (?,?,?,?,?,?)').run(user,number,'fixture',now()+600,now(),now());}

test('pilot policy defaults preserve local operations and only an explicit administrator decision changes it',async()=>{
 const f=await fixture();try{
  assert.equal((await readPilotPolicy(f.db)).require_owner_review,0);await assertPilotAllowed(f.owner,'publish',f.property);
  await assert.rejects(savePilotPolicy(f.owner,{expectedVersion:1,requireOwnerReview:true,requireCleanerReview:false,requirePhone:false,confirmed:true},false),e=>e.status===403);
  await assert.rejects(savePilotPolicy(f.owner,{expectedVersion:1,requireOwnerReview:true,requireCleanerReview:false,requirePhone:false,confirmed:false},true));
  await policy(f,{requireOwnerReview:true});await assert.rejects(savePilotPolicy(f.owner,{expectedVersion:1,requireOwnerReview:false,requireCleanerReview:false,requirePhone:false,confirmed:true},true),e=>e.status===409);
  assert.equal(f.db.raw.prepare("SELECT COUNT(*) n FROM audit_events WHERE entity_id='pilot-policy'").get().n,1);
 }finally{f.db.close();}
});
test('owner admission requires a current review of the exact property and protects both code and SQL writes',async()=>{
 const f=await fixture();try{
  await policy(f,{requireOwnerReview:true});await assert.rejects(assertPilotAllowed(f.owner,'publish',f.property),e=>e.status===409);
  assert.throws(()=>f.db.raw.prepare('UPDATE properties SET published=1 WHERE id=?').run(f.property),/pilot_owner_review_required/);
  review(f,'owner','owner',f.property,'approved',now()-1);await assert.rejects(assertPilotAllowed(f.guest,'booking',f.property),e=>e.status===409);
  review(f,'owner','owner',f.property,'approved',now()+600);await assertPilotAllowed(f.owner,'publish',f.property);await assertPilotAllowed(f.guest,'booking',f.property);
  f.db.raw.prepare('UPDATE properties SET published=1 WHERE id=?').run(f.property);assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM properties p WHERE '+pilotPropertyVisibleSql()).get().n,1);
  review(f,'owner','owner',f.property,'rejected');await assert.rejects(assertPilotAllowed(f.owner,'publish',f.property),e=>e.status===409);assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM properties p WHERE '+pilotPropertyVisibleSql()).get().n,0);
  await assert.rejects(assertPilotAllowed(f.other,'publish',f.property),e=>e.status===403);
 }finally{f.db.close();}
});
test('cleaner and phone admission cannot be replaced with a declared role or editable profile contact',async()=>{
 const f=await fixture();try{
  await policy(f,{requireCleanerReview:true,requirePhone:true});await assert.rejects(assertPilotAllowed(f.owner,'assignment',f.property,'cleaner'),e=>e.status===409);
  review(f,'cleaner','cleaner',null,'approved',now()+600);await assert.rejects(assertPilotAllowed(f.owner,'assignment',f.property,'cleaner'),e=>e.status===409);
  phone(f,'cleaner','+77000000001');await assertPilotAllowed(f.owner,'assignment',f.property,'cleaner');
  f.db.raw.prepare('UPDATE phone_verifications SET phone=? WHERE user_id=?').run('+77000000002','cleaner');await assert.rejects(assertPilotAllowed(f.owner,'assignment',f.property,'cleaner'),e=>e.status===409);
  await assert.rejects(assertPilotAllowed(f.owner,'assignment',f.property,'guest'),e=>e.status===403);
  await assert.rejects(assertPilotAllowed(f.guest,'booking',f.property),e=>e.status===409);
  phone(f,'owner','+77000000003');phone(f,'guest','+77000000004');await assertPilotAllowed(f.guest,'booking',f.property);
 }finally{f.db.close();}
});

test('changing an approved address invalidates admission and an older pending review cannot approve new facts',async()=>{
 const f=await fixture();try{
  await policy(f,{requireOwnerReview:true});review(f,'owner','owner',f.property,'approved',now()+600);await assertPilotAllowed(f.owner,'publish',f.property);
  f.db.raw.prepare('UPDATE properties SET address=? WHERE id=?').run('Changed apartment address',f.property);await assert.rejects(assertPilotAllowed(f.owner,'publish',f.property),e=>e.status===409);assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM properties p WHERE '+pilotPropertyVisibleSql()).get().n,0);
  await requestParticipantReview(f.owner,'owner',{propertyId:f.property,reference:'Current address evidence'});const old=f.db.raw.prepare("SELECT * FROM participant_reviews WHERE status='pending'").get();f.db.raw.prepare('UPDATE properties SET district=? WHERE id=?').run('Another district',f.property);
  await assert.rejects(decideParticipantReview(f.owner,{id:old.id,expectedVersion:old.version,status:'approved',method:'Fixture review',notes:'Checked'},true),e=>e.status===409);assert.throws(()=>f.db.raw.prepare("UPDATE participant_reviews SET status='approved' WHERE id=?").run(old.id),/pilot_review_stale/);
  await requestParticipantReview(f.owner,'owner',{propertyId:f.property,reference:'Updated evidence for current address'});const current=f.db.raw.prepare("SELECT * FROM participant_reviews WHERE status='pending' ORDER BY rowid DESC").get();assert.notEqual(current.id,old.id);await decideParticipantReview(f.owner,{id:current.id,expectedVersion:current.version,status:'approved',method:'Checked current property',notes:'Evidence matches address'},true);await assertPilotAllowed(f.owner,'publish',f.property);
 }finally{f.db.close();}
});
test('operator queue deduplicates existing issues, scopes parties and keeps internal notes private',async()=>{
 const f=await fixture();try{
  await f.guest.bookingAction(f.booking,{action:'issue',issue:'Fixture issue',requestKey:'operator-issue'});
  let state=await governanceState(f.owner,'owner',true),ticket=state.tickets[0];assert.equal(state.tickets.length,1);
  assert.equal((await governanceState(f.owner,'owner',true)).tickets.length,1);assert.equal((await governanceState(f.guest,'guest')).tickets.length,1);assert.equal((await governanceState(f.other,'owner')).tickets.length,0);assert.equal((await governanceState(f.cleaner,'cleaner')).tickets.length,0);
  await assert.rejects(updateOperatorTicket(f.guest,'guest',{issueId:ticket.issue_id,expectedVersion:1,action:'claim'},false),e=>e.status===403);
  await assert.rejects(updateOperatorTicket(f.other,'owner',{issueId:ticket.issue_id,expectedVersion:1,action:'note',note:'Injected'}),e=>e.status===403);
  await updateOperatorTicket(f.owner,'owner',{issueId:ticket.issue_id,expectedVersion:1,action:'claim'},true);
  state=await governanceState(f.owner,'owner',true);ticket=state.tickets[0];assert.equal(ticket.status,'in_progress');
  const note={issueId:ticket.issue_id,expectedVersion:ticket.version,action:'note',note:'Private internal fixture',visibility:'operators',requestKey:'operator-internal'};
  const notices=f.db.raw.prepare('SELECT COUNT(*) n FROM notifications').get().n;
  await updateOperatorTicket(f.owner,'owner',note,true);await updateOperatorTicket(f.owner,'owner',note,true);
  assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM notifications').get().n,notices);
  const guest=await governanceState(f.guest,'guest');assert.ok(!JSON.stringify(guest).includes('Private internal fixture'));
  const operator=await governanceState(f.owner,'owner',true);assert.equal(operator.tickets[0].history.filter(h=>h.body==='Private internal fixture').length,1);
  await assert.rejects(updateOperatorTicket(f.owner,'owner',{...note,note:'Changed payload'},true),e=>e.status===409);
 }finally{f.db.close();}
});

test('another platform operator must record a confirmed reason before taking responsibility',async()=>{
 const f=await fixture();try{
  await f.guest.bookingAction(f.booking,{action:'issue',issue:'Operator handoff',requestKey:'operator-handoff'});let ticket=(await governanceState(f.owner,'owner',true)).tickets[0];await updateOperatorTicket(f.owner,'owner',{issueId:ticket.issue_id,expectedVersion:1,action:'claim'},true);ticket=(await governanceState(f.other,'owner',true)).tickets[0];
  await assert.rejects(updateOperatorTicket(f.other,'owner',{issueId:ticket.issue_id,expectedVersion:ticket.version,action:'claim'},true),e=>e.status===409);
  await assert.rejects(updateOperatorTicket(f.other,'owner',{issueId:ticket.issue_id,expectedVersion:ticket.version,action:'takeover',note:'Shift change'},true));
  await updateOperatorTicket(f.other,'owner',{issueId:ticket.issue_id,expectedVersion:ticket.version,action:'takeover',note:'Shift change confirmed',confirmed:true},true);ticket=(await governanceState(f.other,'owner',true)).tickets[0];assert.equal(ticket.assigned_to,'other');assert.equal(ticket.history.at(-1).action,'takeover');
 }finally{f.db.close();}
});

test('a replacement cleaner never inherits the previous cleaner complaint or public case history',async()=>{
 const f=await fixture();try{
  f.db.raw.prepare("UPDATE cleaning_jobs SET assigned_to=?,status='assigned' WHERE id=?").run('cleaner',f.job.id);await f.cleaner.jobAction(f.job.id,{action:'issue',issue:'Original cleaner private case',requestKey:'old-worker-issue'});
  assert.equal((await governanceState(f.cleaner,'cleaner')).tickets.length,1);
  await f.other.saveProfile({name:'Replacement',roles:['owner','cleaner'],city:'Павлодар',contact:'fixture',districts:'Центр',experience:'Fixture',availability:'By agreement'});f.db.raw.prepare('UPDATE cleaning_jobs SET assigned_to=? WHERE id=?').run('other',f.job.id);
  assert.equal((await governanceState(f.other,'cleaner')).tickets.length,0);const original=await governanceState(f.cleaner,'cleaner');assert.equal(original.tickets.length,1);await updateOperatorTicket(f.cleaner,'cleaner',{issueId:original.tickets[0].issue_id,expectedVersion:original.tickets[0].version,action:'note',note:'Follow-up on my own complaint'});
  assert.equal((await governanceState(f.owner,'owner')).tickets.length,1);assert.equal((await governanceState(f.other,'cleaner')).tickets.length,0);
 }finally{f.db.close();}
});
test('operator resolution is versioned, requires a responsible human and never settles money or changes readiness',async()=>{
 const f=await fixture();try{
  await f.guest.bookingAction(f.booking,{action:'issue',issue:'Fixture dispute',requestKey:'operator-resolution'});let ticket=(await governanceState(f.owner,'owner',true)).tickets[0];
  await assert.rejects(updateOperatorTicket(f.owner,'owner',{issueId:ticket.issue_id,expectedVersion:1,action:'resolve',note:'Reviewed',confirmed:true},true),e=>e.status===409);
  await updateOperatorTicket(f.owner,'owner',{issueId:ticket.issue_id,expectedVersion:1,action:'claim'},true);ticket=(await governanceState(f.owner,'owner',true)).tickets[0];
  const before=f.db.raw.prepare('SELECT readiness FROM property_operations WHERE property_id=?').get(f.property).readiness;
  await assert.rejects(updateOperatorTicket(f.owner,'owner',{issueId:ticket.issue_id,expectedVersion:ticket.version,action:'resolve',note:'Reviewed'},true));
  await updateOperatorTicket(f.owner,'owner',{issueId:ticket.issue_id,expectedVersion:ticket.version,action:'resolve',note:'Discussed with both participants',confirmed:true},true);
  assert.equal(f.db.raw.prepare('SELECT status FROM administrator_issues').get().status,'resolved');assert.equal(f.db.raw.prepare('SELECT readiness FROM property_operations WHERE property_id=?').get(f.property).readiness,before);assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM finance_entries').get().n,0);
  ticket=(await governanceState(f.owner,'owner',true)).tickets[0];assert.equal(ticket.status,'resolved');await updateOperatorTicket(f.owner,'owner',{issueId:ticket.issue_id,expectedVersion:ticket.version,action:'reopen',note:'New participant evidence'},true);ticket=(await governanceState(f.owner,'owner',true)).tickets[0];assert.equal(ticket.status,'in_progress');assert.equal(f.db.raw.prepare('SELECT status FROM administrator_issues').get().status,'open');
  await assert.rejects(updateOperatorTicket(f.owner,'owner',{issueId:ticket.issue_id,expectedVersion:1,action:'release'},true),e=>e.status===409);
 }finally{f.db.close();}
});

test('a flat sent for review from «Показать гостям» reaches the administrators and is shown to guests once approved',async()=>{
 const f=await fixture();try{
  const {PUBLISH_REVIEW}=await load('listing-edit');
  await policy(f,{requireOwnerReview:true});
  f.db.raw.prepare('UPDATE properties SET published=0 WHERE id=?').run(f.property);
  f.db.raw.prepare("UPDATE properties SET description=? WHERE id=?").run('Светлая квартира в центре: двуспальная кровать, кухня, стиральная машина, быстрый Wi-Fi, рядом остановка и магазины.',f.property);
  f.db.raw.prepare("INSERT OR REPLACE INTO property_details(property_id,photos,revision,updated_at) VALUES (?,'[\"m1\"]','r1',?)").run(f.property,now());
  await requestParticipantReview(f.owner,'owner',{propertyId:f.property,reference:PUBLISH_REVIEW+': fixture'},{PLATFORM_ADMIN_IDS:'admin-a, admin-b'});
  const asked=f.db.raw.prepare("SELECT user_id,body FROM notifications WHERE dedupe LIKE 'admin:review:%' ORDER BY user_id").all();
  assert.deepEqual(asked.map(n=>n.user_id),['admin-a','admin-b']);assert.match(asked[0].body,/ждёт проверки/);
  const pending=f.db.raw.prepare("SELECT * FROM participant_reviews WHERE status='pending'").get();
  const before=f.db.raw.prepare('SELECT version FROM property_details WHERE property_id=?').get(f.property).version;
  await decideParticipantReview(f.owner,{id:pending.id,expectedVersion:pending.version,status:'approved',method:'Видеозвонок',notes:'Квартира совпадает с фото'},true);
  assert.equal(f.db.raw.prepare('SELECT published FROM properties WHERE id=?').get(f.property).published,1);
  assert.equal(f.db.raw.prepare('SELECT version FROM property_details WHERE property_id=?').get(f.property).version,before+1);
  const told=f.db.raw.prepare("SELECT body FROM notifications WHERE dedupe LIKE 'owner:review:%'").get();assert.match(told.body,/показана гостям/);
 }finally{f.db.close();}
});
