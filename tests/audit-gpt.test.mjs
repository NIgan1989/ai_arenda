import {test} from 'node:test';import assert from 'node:assert/strict';
import {fixture,load,now,iso} from './helpers/platform.mjs';
import {photo} from './fixtures/photo.mjs';
// The outside audit of 2026-11-22: the three fixes it asked for before launch.
const {saveIdentityDoc,decideIdentity,removeIdentityDoc,listIdentityDocs,sweepIdentityObjects}=await load('identity-docs');
const {stayedSql}=await load('stay-result');
const {RentalService}=await load('service');
const {matchingAction}=await load('smart-matching');
const {saveRule}=await load('decision-rules');

// A storage that can refuse deletes, like R2 on a bad minute.
function bucket(){
 const stored=new Map(),b={refuse:false,stored,
  put:async(k,v)=>{stored.set(k,{v,uploaded:new Date()});},
  delete:async k=>{if(b.refuse)throw new Error('R2 down');for(const key of [].concat(k))stored.delete(key);},
  get:async k=>stored.has(k)?{arrayBuffer:async()=>stored.get(k).v.buffer}:null,
  list:async({prefix})=>({objects:[...stored].filter(([k])=>k.startsWith(prefix)).map(([key,o])=>({key,uploaded:o.uploaded})),truncated:false})};
 return b;
}

test('an ID photo whose delete failed keeps its pointer and is deleted by the sweep',async()=>{
 const f=await fixture(),R=f.db.raw;try{
  R.prepare('DELETE FROM identity_docs').run();
  const admin=new RentalService(f.db,'admin'),BUCKET=bucket();
  await saveIdentityDoc(f.guest,{data:photo},{BUCKET});await saveIdentityDoc(f.cleaner,{data:photo},{BUCKET});
  BUCKET.refuse=true;
  const r=await decideIdentity(admin,{userId:'guest',action:'confirm',namesMatch:true},{BUCKET});
  assert.match(r.message,/в течение часа/,'the administrator hears the delete is pending');
  assert.equal(BUCKET.stored.size,2);
  const left=R.prepare("SELECT object_key,checked_at FROM identity_docs WHERE user_id='guest'").get();
  assert.ok(left.object_key&&left.checked_at,'checked, but the pointer stays until the photo is really gone');
  assert.match(R.prepare("SELECT body FROM notifications WHERE user_id='guest' AND dedupe LIKE 'identity:checked:%'").get().body,/будет удалено/);
  // A refused photo whose delete failed has no row any more; the sweep finds it in the storage.
  await decideIdentity(admin,{userId:'cleaner',action:'reject',reason:'Размыто.'},{BUCKET});
  assert.equal(BUCKET.stored.size,2);
  for(const o of BUCKET.stored.values())o.uploaded=new Date(Date.now()-2*3600000);
  assert.equal((await sweepIdentityObjects(f.db,BUCKET)).left,2,'still down: nothing is lost');
  BUCKET.refuse=false;
  const swept=await sweepIdentityObjects(f.db,BUCKET);
  assert.equal(swept.removed,2);assert.equal(BUCKET.stored.size,0);
  assert.equal(R.prepare("SELECT object_key FROM identity_docs WHERE user_id='guest'").get().object_key,'');
 }finally{f.db.close();}
});

test('the sweep never touches a photo that waits for the check or was just uploaded',async()=>{
 const f=await fixture(),R=f.db.raw;try{
  R.prepare('DELETE FROM identity_docs').run();
  const BUCKET=bucket();
  await saveIdentityDoc(f.guest,{data:photo},{BUCKET});
  BUCKET.stored.set('identity/fresh.jpg',{v:new Uint8Array(1),uploaded:new Date()});
  for(const [k,o] of BUCKET.stored)if(k!=='identity/fresh.jpg')o.uploaded=new Date(Date.now()-5*3600000);
  await sweepIdentityObjects(f.db,BUCKET);
  assert.equal(BUCKET.stored.size,2,'waiting photo and fresh upload stay');
  // The participant removes a photo while the storage is down: the row goes at once, the sweep deletes the file later.
  const doc=(await listIdentityDocs(f.guest,'')).docs[0];BUCKET.refuse=true;
  await removeIdentityDoc(f.guest,{id:doc.id},{BUCKET});BUCKET.refuse=false;
  await sweepIdentityObjects(f.db,BUCKET);
  assert.deepEqual([...BUCKET.stored.keys()],['identity/fresh.jpg']);
 }finally{f.db.close();}
});

const stayed=(f)=>f.db.raw.prepare(`SELECT ${stayedSql('?')} v`).get(f.booking).v;

test('nothing is owed while «Меня не заселили» is open, even after the time of the booking',async()=>{
 const f=await fixture(),R=f.db.raw;try{
  R.prepare("UPDATE bookings SET payment_status='owner_verified' WHERE id=?").run(f.booking);
  R.prepare('UPDATE bookings SET start=?,end=?,occupied_until=? WHERE id=?').run(now()-300,now()+7200,now()+9000,f.booking);
  await f.guest.bookingAction(f.booking,{action:'not_let_in',text:'Дверь никто не открывает'});
  R.prepare('UPDATE bookings SET end=? WHERE id=?').run(now()-60,f.booking);
  assert.equal(stayed(f),0,'disputed: a person decides first');
  R.prepare("UPDATE administrator_issues SET status='resolved' WHERE entity_id=?").run(f.booking);
  assert.equal(stayed(f),0,'closed: still nothing owed without the owner\'s own mark of the arrival (repeat audit)');
 }finally{f.db.close();}
});

test('an owner who cancels after the guest said «Я заселился» still owes the settling-in',async()=>{
 for(const report of [false,true]){const f=await fixture(),R=f.db.raw;try{
  R.prepare("UPDATE bookings SET payment_status='owner_verified' WHERE id=?").run(f.booking);
  R.prepare('UPDATE bookings SET start=?,end=?,occupied_until=? WHERE id=?').run(now()-300,now()+7200,now()+9000,f.booking);
  if(report)await f.guest.bookingAction(f.booking,{action:'report_checkin'});
  const r=await f.owner.bookingAction(f.booking,{action:'cancel'});
  assert.equal(R.prepare('SELECT status FROM bookings WHERE id=?').get(f.booking).status,'cancelled');
  assert.equal(stayed(f),report?1:0);
  if(report)assert.match(r.message,/оспорьте начисление/);else assert.doesNotMatch(r.message,/оспорьте/);
 }finally{f.db.close();}}
});

test('an owner whose cancel lost the race to the guest\'s own cancel adds no charge',async()=>{
 const f=await fixture(),R=f.db.raw;try{
  R.prepare('UPDATE bookings SET start=?,end=?,occupied_until=? WHERE id=?').run(now()-300,now()+7200,now()+9000,f.booking);
  await f.guest.bookingAction(f.booking,{action:'report_checkin'});
  // The owner read the booking as confirmed; the guest's cancel lands before the owner's write.
  const read=f.owner.one.bind(f.owner);let done=false;
  f.owner.one=async(sql,...args)=>{const row=await read(sql,...args);if(!done&&/FROM property_operations/.test(sql)){done=true;R.prepare("UPDATE bookings SET status='cancelled' WHERE id=?").run(f.booking);}return row;};
  await assert.rejects(f.owner.bookingAction(f.booking,{action:'cancel'}),e=>e.status===409);
  assert.equal(R.prepare("SELECT COUNT(*) n FROM audit_events WHERE entity_id=? AND action='booking.cancelled_after_arrival'").get(f.booking).n,0);
  assert.equal(stayed(f),0);
 }finally{f.db.close();}
});

test('before a near arrival the AI accepts the cleaning at once only with the owner\'s separate permission',async()=>{
 const {checkAdministratorOwner}=await load('administrator-runtime'),{saveEvidence}=await load('evidence');
 for(const fast of [false,true]){const f=await fixture(),R=f.db.raw;try{
  await matchingAction(f.owner,'owner','preference',{propertyId:f.property,mode:'auto'});
  if(fast)await saveRule(f.db,'owner','owner',{rule:'accept_fast',on:true});
  await f.cleaner.jobAction(f.job.id,{action:'apply'});const app=R.prepare('SELECT * FROM applications WHERE job_id=?').get(f.job.id);await f.owner.jobAction(f.job.id,{action:'assign',applicationId:app.id});
  R.prepare('UPDATE bookings SET start=?,end=?,occupied_until=? WHERE id=?').run(now()-600,now()+15,now()+5415,f.booking);R.prepare('UPDATE cleaning_jobs SET start=?,end=? WHERE id=?').run(now()+15,now()+5415,f.job.id);
  await f.owner.bookingAction(f.booking,{action:'checkout'});await f.cleaner.jobAction(f.job.id,{action:'start'});
  for(const phase of ['before','after','after'])await saveEvidence(f.cleaner,{jobId:f.job.id,phase,data:photo});
  await f.cleaner.jobAction(f.job.id,{action:'submit',checklist:[true,true,true,true],report:'Убрано, всё чисто'});
  // The next guest arrives in about an hour and a half.
  const row=R.prepare('SELECT * FROM bookings WHERE id=?').get(f.booking),next={...row,id:'next-booking',request_key:'next-booking',status:'confirmed',start:now()+6000,end:now()+9000,occupied_until:now()+10000};
  R.prepare(`INSERT INTO bookings(${Object.keys(next).join(',')}) VALUES (${Object.keys(next).map(()=>'?').join(',')})`).run(...Object.values(next));
  f.release();await checkAdministratorOwner(f.db,'owner');
  const status=R.prepare('SELECT status FROM cleaning_jobs WHERE id=?').get(f.job.id).status;
  if(fast){
   assert.equal(status,'completed');
   assert.match(R.prepare("SELECT body FROM notifications WHERE user_id='owner' AND dedupe LIKE 'owner:administrator-approved:%'").get().body,/по вашему правилу «Быстрая приёмка перед заездом».*фото до: 1, после: 2/);
  }else{
   assert.equal(status,'submitted','without the permission the owner decides');
   assert.match(R.prepare("SELECT body FROM notifications WHERE user_id='owner' AND dedupe LIKE 'owner:administrator-review:%'").get().body,/^Скоро заезд гостя\..*Качество уборки проверьте по фото/);
  }
 }finally{f.db.close();}}
});

// The repeat audit of 2026-11-22.
const {previewMatches}=await load('smart-matching');
const {saveRightDoc,removeRightDoc,settleRightDocs,sweepRightObjects}=await load('property-rights');

test('closing «Меня не заселили» never brings the charge back: only the owner\'s own mark of the arrival counts',async()=>{
 for(const owner of [false,true]){const f=await fixture(),R=f.db.raw;try{
  R.prepare("UPDATE bookings SET payment_status='owner_verified' WHERE id=?").run(f.booking);
  R.prepare('UPDATE bookings SET start=?,end=?,occupied_until=? WHERE id=?').run(now()-300,now()+7200,now()+9000,f.booking);
  await f.guest.bookingAction(f.booking,{action:'not_let_in',text:'Дверь никто не открывает'});
  const issue=R.prepare('SELECT * FROM administrator_issues WHERE entity_id=?').get(f.booking);
  // The owner the complaint is about cannot close it.
  await assert.rejects(f.owner.resolveAdministratorIssue('owner',{id:issue.id,resolution:'Гость ошибся',expectedVersion:issue.version}),e=>e.status===403);
  if(owner)R.prepare('UPDATE booking_terms SET actual_checkin=? WHERE booking_id=?').run(now(),f.booking);
  R.prepare('UPDATE bookings SET end=? WHERE id=?').run(now()-60,f.booking);
  R.prepare("UPDATE administrator_issues SET status='resolved' WHERE id=?").run(issue.id);
  // Closed by a person at the platform: the ended booking is owed only if the owner marked the arrival.
  assert.equal(stayed(f),owner?1:0);
  R.prepare('UPDATE booking_terms SET checkin_reported_at=? WHERE booking_id=?').run(now(),f.booking);
  assert.equal(stayed(f),owner?1:0,'the guest\'s word does not count after the complaint');
 }finally{f.db.close();}}
});

test('a document of the right to let keeps its pointer until the storage deleted it; the sweep retries',async()=>{
 const f=await fixture(),R=f.db.raw;try{
  R.prepare('DELETE FROM property_right_docs').run();
  const BUCKET=bucket();
  await saveRightDoc(f.owner,'owner',{propertyId:f.property,kind:'owner',data:photo},{BUCKET});
  await saveRightDoc(f.owner,'owner',{propertyId:f.property,kind:'owner',data:photo},{BUCKET});
  assert.equal(BUCKET.stored.size,2);
  // The owner removes one while the storage is down: the row goes, the file is found by the sweep.
  const doc=R.prepare('SELECT id FROM property_right_docs ORDER BY created_at,id LIMIT 1').get();BUCKET.refuse=true;
  await removeRightDoc(f.owner,'owner',{id:doc.id},{BUCKET});
  assert.equal(await settleRightDocs(f.db,f.property,'admin',{BUCKET}),1,'approved, the delete waits');
  assert.ok(R.prepare("SELECT object_key FROM property_right_docs").get().object_key,'the pointer stays');
  for(const o of BUCKET.stored.values())o.uploaded=new Date(Date.now()-2*3600000);
  assert.equal((await sweepRightObjects(f.db,BUCKET)).left,2);
  BUCKET.refuse=false;
  assert.equal((await sweepRightObjects(f.db,BUCKET)).removed,2);
  assert.equal(BUCKET.stored.size,0);assert.equal(R.prepare("SELECT object_key FROM property_right_docs").get().object_key,'');
 }finally{f.db.close();}
});

test('a request not yet confirmed never speeds up the acceptance of a cleaning',async()=>{
 const {checkAdministratorOwner}=await load('administrator-runtime'),{saveEvidence}=await load('evidence');
 const f=await fixture(),R=f.db.raw;try{
  await matchingAction(f.owner,'owner','preference',{propertyId:f.property,mode:'auto'});
  await saveRule(f.db,'owner','owner',{rule:'accept_fast',on:true});
  await f.cleaner.jobAction(f.job.id,{action:'apply'});const app=R.prepare('SELECT * FROM applications WHERE job_id=?').get(f.job.id);await f.owner.jobAction(f.job.id,{action:'assign',applicationId:app.id});
  R.prepare('UPDATE bookings SET start=?,end=?,occupied_until=? WHERE id=?').run(now()-600,now()+15,now()+5415,f.booking);R.prepare('UPDATE cleaning_jobs SET start=?,end=? WHERE id=?').run(now()+15,now()+5415,f.job.id);
  await f.owner.bookingAction(f.booking,{action:'checkout'});await f.cleaner.jobAction(f.job.id,{action:'start'});
  for(const phase of ['before','after','after'])await saveEvidence(f.cleaner,{jobId:f.job.id,phase,data:photo});
  await f.cleaner.jobAction(f.job.id,{action:'submit',checklist:[true,true,true,true],report:'Убрано, всё чисто'});
  const row=R.prepare('SELECT * FROM bookings WHERE id=?').get(f.booking),next={...row,id:'next-request',request_key:'next-request',status:'requested',expires_at:now()+900,start:now()+6000,end:now()+9000,occupied_until:now()+10000};
  R.prepare(`INSERT INTO bookings(${Object.keys(next).join(',')}) VALUES (${Object.keys(next).map(()=>'?').join(',')})`).run(...Object.values(next));
  f.release();await checkAdministratorOwner(f.db,'owner');
  assert.equal(R.prepare('SELECT status FROM cleaning_jobs WHERE id=?').get(f.job.id).status,'submitted');
  assert.match(R.prepare("SELECT body FROM notifications WHERE user_id='owner' AND dedupe LIKE 'owner:administrator-review:%'").get().body,/^Есть заявка на скорый заезд\./);
 }finally{f.db.close();}
});

test('by the hour, a later free start the same day comes before tomorrow',async()=>{
 const f=await fixture();try{
  // 10:00–13:00 Kazakhstan time, two days ahead, is taken.
  const day=Math.floor((now()+5*3600)/86400)+2,start=day*86400-5*3600+10*3600,end=start+3*3600;
  await f.guest.createBooking({propertyId:f.property,start:iso(start),end:iso(end),guests:1,billingMode:'hourly',requestKey:'taken',acceptTerms:true});
  const r=await previewMatches(f.other,{city:'Павлодар',start:iso(start),end:iso(end),guests:'1',mode:'hourly',maxPrice:'11000',priority:'balanced',features:[]});
  assert.equal(r.empty.reason,'busy');
  const next=Date.parse(r.empty.next.start)/1000;
  assert.ok(next>start&&next<day*86400-5*3600+86400,'the same day: '+r.empty.next.start);
  assert.equal(Date.parse(r.empty.next.end)/1000-next,3*3600);
 }finally{f.db.close();}
});
