import {test} from 'node:test';import assert from 'node:assert/strict';import {fixture,load,now,iso} from './helpers/platform.mjs';
const {matchingAction,matchingState}=await load('smart-matching');
const base=now();
const input=()=>({city:'Павлодар',start:iso(base+86400),end:iso(base+172800),guests:'2',mode:'daily',maxPrice:'11000',priority:'balanced',features:[]});
const mode=async(f,id=f.property)=>(await matchingAction(f.owner,'owner','inbox',{})).preferences.find(p=>p.id===id).mode;

test('one autopilot choice turns on the whole chain and the owner can take it back',async()=>{
 const f=await fixture();try{
  assert.equal(await mode(f),'off');
  const on=await matchingAction(f.owner,'owner','preference',{propertyId:f.property,mode:'auto'});assert.match(on.message,/Автопилот включён/);assert.equal(await mode(f),'auto');
  const policy=f.db.raw.prepare('SELECT * FROM property_policies WHERE property_id=?').get(f.property),rules=f.db.raw.prepare('SELECT * FROM operation_rules WHERE property_id=?').get(f.property);
  assert.deepEqual([policy.auto_confirm,policy.auto_assign,policy.cleaning_fee,policy.version],[1,1,3000,2]);assert.deepEqual([rules.auto_offers,rules.auto_replace],[1,1]);
  // Choosing the same mode again changes nothing, so answers given under this version stay valid.
  await matchingAction(f.owner,'owner','preference',{propertyId:f.property,mode:'auto'});assert.equal(f.db.raw.prepare('SELECT version FROM property_policies WHERE property_id=?').get(f.property).version,2);
  await matchingAction(f.owner,'owner','preference',{propertyId:f.property,mode:'manual'});assert.equal(await mode(f),'manual');
  const off=f.db.raw.prepare('SELECT p.auto_confirm,p.auto_assign,r.auto_offers,r.auto_replace FROM property_policies p JOIN operation_rules r ON r.property_id=p.property_id WHERE p.property_id=?').get(f.property);assert.deepEqual(Object.values(off),[0,0,0,0]);
  await matchingAction(f.owner,'owner','preference',{propertyId:f.property,mode:'off'});assert.equal(await mode(f),'off');
  assert.ok(f.db.raw.prepare("SELECT COUNT(*) n FROM audit_events WHERE action LIKE '%property.guest_mode%'").get().n>=4);
 }finally{f.db.close();}
});

test('autopilot needs a cleaning price, a live mandate and the owner of the flat',async()=>{
 const f=await fixture();try{
  const flat=(await f.owner.createProperty({title:'No cleaning price',city:'Павлодар',district:'Центр',address:'QA',description:'QA',price:10000,rooms:1,capacity:2,cleaningMinutes:90})).id;
  await assert.rejects(matchingAction(f.owner,'owner','preference',{propertyId:flat,mode:'auto'}),/Сначала заполните тарифы/);
  await f.owner.savePolicy(flat,{...f.policy,expectedVersion:0,cleaningFee:0,cleaningBudget:0});
  await assert.rejects(matchingAction(f.owner,'owner','preference',{propertyId:flat,mode:'auto'}),/стоимость уборки/);
  await matchingAction(f.owner,'owner','preference',{propertyId:flat,mode:'auto',cleaningFee:2500});
  assert.deepEqual(Object.values(f.db.raw.prepare('SELECT cleaning_fee,cleaning_budget FROM property_policies WHERE property_id=?').get(flat)),[2500,2500]);
  await assert.rejects(matchingAction(f.other,'owner','preference',{propertyId:f.property,mode:'auto'}),e=>e.status===404);
  await assert.rejects(matchingAction(f.owner,'owner','preference',{propertyId:f.property,mode:'everything'}));
  await f.owner.savePolicy(flat,{...f.policy,expectedVersion:2,cleaningFee:2500,cleaningBudget:2500,minimumRate:3000,dailyPrice:10000,hourlyPrice:0,nightlyPrice:0});
  f.db.raw.prepare('UPDATE property_policies SET hourly_price=2000,auto_confirm=0 WHERE property_id=?').run(flat);
  await assert.rejects(matchingAction(f.owner,'owner','preference',{propertyId:flat,mode:'auto'}),/минимальной разрешённой ставки/);
  f.db.raw.prepare('UPDATE property_policies SET mandate_until=? WHERE property_id=?').run(now()-60,f.property);
  await assert.rejects(matchingAction(f.owner,'owner','preference',{propertyId:f.property,mode:'auto'}),/полномочий/);
 }finally{f.db.close();}
});

test('under autopilot a guest gets an instant answer, the booking confirms itself and a cleaner is assigned',async()=>{
 const {saveWorkerDispatch,decideOffer}=await load('dispatch'),{checkAdministratorOwner}=await load('administrator-runtime'),f=await fixture();try{
  await matchingAction(f.owner,'owner','preference',{propertyId:f.property,mode:'auto'});
  const r=await matchingAction(f.guest,'guest','begin',{...input(),requestKey:'autopilot',consent:true});
  assert.equal(r.status,'ready');assert.equal(r.properties[0].ownerConfirmed,true);assert.equal((await matchingAction(f.owner,'owner','inbox',{})).offers.length,0);
  assert.equal(f.db.raw.prepare("SELECT COUNT(*) n FROM notifications WHERE user_id='owner' AND dedupe LIKE 'owner:matching-auto:%'").get().n,1);
  const offerId=r.properties[0].offerId,booking=await matchingAction(f.guest,'guest','book',{...input(),billingMode:'daily',expectedAmount:10000,expectedPolicyVersion:2,id:r.id,offerId,acceptTerms:true});
  assert.equal(f.db.raw.prepare('SELECT status FROM bookings WHERE id=?').get(booking.id).status,'confirmed');
  const job=f.db.raw.prepare('SELECT * FROM cleaning_jobs WHERE booking_id=?').get(booking.id);assert.equal(job.fee,3000);
  await saveWorkerDispatch(f.cleaner,{receiveOffers:true});f.release();await checkAdministratorOwner(f.db,'owner');
  const work=f.db.raw.prepare("SELECT * FROM cleaning_offers WHERE job_id=? AND status='offered'").get(job.id);assert.ok(work,'the AI offers the cleaning to a free cleaner');
  await decideOffer(f.cleaner,{id:work.id,action:'accept'});f.release();await checkAdministratorOwner(f.db,'owner');f.db.raw.prepare("UPDATE notifications SET created_at=created_at-1801 WHERE dedupe LIKE 'owner:administrator-propose:%'").run();f.release();await checkAdministratorOwner(f.db,'owner');
  assert.equal(f.db.raw.prepare('SELECT assigned_to FROM cleaning_jobs WHERE id=?').get(job.id).assigned_to,'cleaner');
 }finally{f.db.close();}
});

test('the AI does not answer for an owner who answers personally, or when the dates are taken',async()=>{
 const f=await fixture();try{
  await matchingAction(f.owner,'owner','preference',{propertyId:f.property,mode:'manual'});
  const manual=await matchingAction(f.guest,'guest','begin',{...input(),requestKey:'manual',consent:true});assert.equal(manual.status,'searching');assert.equal(manual.pending,1);
  await matchingAction(f.guest,'guest','cancel',{id:manual.id});
  // Booking auto-confirmation alone, as an owner could set it before autopilot existed, is shown as «Я сам» and gets no AI answer.
  await f.owner.savePolicy(f.property,{...f.policy,expectedVersion:f.db.raw.prepare('SELECT version FROM property_policies WHERE property_id=?').get(f.property).version,autoConfirm:true});
  assert.equal(await mode(f),'manual');
  const confirmOnly=await matchingAction(f.guest,'guest','begin',{...input(),requestKey:'confirm-only',consent:true});assert.equal(confirmOnly.status,'searching');
  await matchingAction(f.guest,'guest','cancel',{id:confirmOnly.id});
  await matchingAction(f.owner,'owner','preference',{propertyId:f.property,mode:'auto'});
  // Another guest's request holds these dates while the owner decides: the quote fails, so the offer stays with the owner.
  f.db.raw.prepare('UPDATE property_policies SET auto_confirm=0 WHERE property_id=?').run(f.property);
  await f.guest.createBooking({propertyId:f.property,start:input().start,end:input().end,guests:1,billingMode:'daily',requestKey:'holds-dates',acceptTerms:true});
  f.db.raw.prepare('UPDATE property_policies SET auto_confirm=1 WHERE property_id=?').run(f.property);
  const taken=await matchingAction(f.guest,'guest','begin',{...input(),requestKey:'taken',consent:true});assert.equal(taken.sent,0);
  assert.equal(f.db.raw.prepare("SELECT COUNT(*) n FROM matching_offers WHERE status='accepted'").get().n,0);
  assert.equal((await matchingState(f.guest,taken.id)).status,'empty');
 }finally{f.db.close();}
});

test('under autopilot the guest report of leaving frees the flat; an owner answering personally still confirms it',async()=>{
 const {checkAdministratorOwner}=await load('administrator-runtime');
 for(const mode of ['manual','auto']){const f=await fixture();try{
  await matchingAction(f.owner,'owner','preference',{propertyId:f.property,mode});
  f.db.raw.prepare('UPDATE bookings SET start=?,end=?,occupied_until=? WHERE id=?').run(now()-3600,now()+600,now()+6000,f.booking);
  await f.guest.bookingAction(f.booking,{action:'report_checkout'});f.release();await checkAdministratorOwner(f.db,'owner');
  const terms=f.db.raw.prepare('SELECT actual_checkout FROM booking_terms WHERE booking_id=?').get(f.booking),status=f.db.raw.prepare('SELECT status FROM bookings WHERE id=?').get(f.booking).status;
  if(mode==='auto'){assert.ok(terms.actual_checkout);assert.equal(status,'completed');assert.equal(f.db.raw.prepare("SELECT COUNT(*) n FROM notifications WHERE user_id='owner' AND dedupe LIKE 'owner:administrator-checkout:%'").get().n,1);assert.ok(f.db.raw.prepare("SELECT id FROM audit_events WHERE entity_id=? AND actor_id='system:rental-policy' AND action LIKE '%checkout_confirmed%'").get(f.booking));}
  else{assert.equal(terms.actual_checkout,null);assert.equal(status,'confirmed');}
 }finally{f.db.close();}}
});

test('the AI proposes a cleaner and the owner agrees with one tap; a cleaning within the hour is assigned at once',async()=>{
 const {checkAdministratorOwner}=await load('administrator-runtime');
 const f=await fixture();try{
  await matchingAction(f.owner,'owner','preference',{propertyId:f.property,mode:'auto'});
  await f.cleaner.jobAction(f.job.id,{action:'apply'});f.release();await checkAdministratorOwner(f.db,'owner');
  assert.equal(f.db.raw.prepare('SELECT assigned_to FROM cleaning_jobs WHERE id=?').get(f.job.id).assigned_to,null);
  const proposal=f.db.raw.prepare("SELECT body FROM notifications WHERE user_id='owner' AND dedupe LIKE 'owner:administrator-propose:%'").get();assert.match(proposal.body,/Cleaner/);
  const application=f.db.raw.prepare('SELECT id FROM applications WHERE job_id=?').get(f.job.id),job=f.db.raw.prepare('SELECT version FROM cleaning_jobs WHERE id=?').get(f.job.id);
  await f.owner.jobAction(f.job.id,{action:'assign',applicationId:application.id,expectedVersion:job.version});
  assert.equal(f.db.raw.prepare('SELECT assigned_to FROM cleaning_jobs WHERE id=?').get(f.job.id).assigned_to,'cleaner');
 }finally{f.db.close();}
 const g=await fixture();try{
  await matchingAction(g.owner,'owner','preference',{propertyId:g.property,mode:'auto'});
  g.db.raw.prepare('UPDATE cleaning_jobs SET start=?,end=? WHERE id=?').run(now()+1800,now()+7200,g.job.id);
  await g.cleaner.jobAction(g.job.id,{action:'apply'});g.release();await checkAdministratorOwner(g.db,'owner');
  assert.equal(g.db.raw.prepare('SELECT assigned_to FROM cleaning_jobs WHERE id=?').get(g.job.id).assigned_to,'cleaner');
 }finally{g.db.close();}
});

test('an automatic checkout stops if the autopilot is turned off while it runs',async()=>{
 const {RentalService}=await load('service'),f=await fixture();try{
  await matchingAction(f.owner,'owner','preference',{propertyId:f.property,mode:'auto'});
  f.db.raw.prepare('UPDATE bookings SET start=?,end=?,occupied_until=? WHERE id=?').run(now()-3600,now()+600,now()+6000,f.booking);
  await f.guest.bookingAction(f.booking,{action:'report_checkout'});
  const policy=f.db.raw.prepare('SELECT * FROM property_policies WHERE property_id=?').get(f.property),delegated=new RentalService(f.db,'owner',{propertyId:f.property,policyVersion:policy.version});
  // The owner switches to «Я сам» after the AI read the mandate but before its write lands.
  const read=delegated.one.bind(delegated);delegated.one=async(sql,...args)=>{const row=await read(sql,...args);if(/FROM property_policies/.test(sql))f.db.raw.prepare('UPDATE property_policies SET auto_assign=0 WHERE property_id=?').run(f.property);return row;};
  await assert.rejects(delegated.bookingAction(f.booking,{action:'checkout'}),e=>e.status===409);
  assert.equal(f.db.raw.prepare('SELECT status FROM bookings WHERE id=?').get(f.booking).status,'confirmed');
  assert.equal(f.db.raw.prepare('SELECT actual_checkout FROM booking_terms WHERE booking_id=?').get(f.booking).actual_checkout,null);
 }finally{f.db.close();}
});

test('the AI checks the cleaning photo report: the owner accepts with one tap, or the AI accepts after an hour; a report with a problem stays with the owner',async()=>{
 const {checkAdministratorOwner}=await load('administrator-runtime'),{saveEvidence}=await load('evidence'),{photo}=await import('./fixtures/photo.mjs');
 for(const report of ['Убрано, всё чисто','Убрано, но разбита ваза']){const f=await fixture();try{
  await matchingAction(f.owner,'owner','preference',{propertyId:f.property,mode:'auto'});
  await f.cleaner.jobAction(f.job.id,{action:'apply'});const app=f.db.raw.prepare('SELECT * FROM applications WHERE job_id=?').get(f.job.id);await f.owner.jobAction(f.job.id,{action:'assign',applicationId:app.id});
  f.db.raw.prepare('UPDATE bookings SET start=?,end=?,occupied_until=? WHERE id=?').run(now()-600,now()+15,now()+5415,f.booking);f.db.raw.prepare('UPDATE cleaning_jobs SET start=?,end=? WHERE id=?').run(now()+15,now()+5415,f.job.id);
  await f.owner.bookingAction(f.booking,{action:'checkout'});await f.cleaner.jobAction(f.job.id,{action:'start'});
  for(const phase of ['before','after','after'])await saveEvidence(f.cleaner,{jobId:f.job.id,phase,data:photo});
  await f.cleaner.jobAction(f.job.id,{action:'submit',checklist:[true,true,true,true],report});
  const status=()=>f.db.raw.prepare('SELECT status FROM cleaning_jobs WHERE id=?').get(f.job.id).status;
  f.release();await checkAdministratorOwner(f.db,'owner');assert.equal(status(),'submitted','the owner is asked first');
  const clean=report==='Убрано, всё чисто',key=clean?'owner:administrator-review:%':'owner:administrator-review-issue:%';
  const notice=f.db.raw.prepare("SELECT body FROM notifications WHERE user_id='owner' AND dedupe LIKE ?").get(key);assert.ok(notice,report+' '+JSON.stringify(f.db.raw.prepare("SELECT dedupe,body FROM notifications WHERE user_id='owner' ORDER BY created_at DESC LIMIT 4").all()));
  if(!clean)assert.match(notice.body,/разбит/);
  f.db.raw.prepare("UPDATE notifications SET created_at=created_at-3601 WHERE dedupe LIKE 'owner:administrator-review%'").run();f.release();await checkAdministratorOwner(f.db,'owner');
  if(clean){assert.equal(status(),'completed');assert.equal(f.db.raw.prepare('SELECT readiness FROM property_operations WHERE property_id=?').get(f.property).readiness,'ready');assert.ok(f.db.raw.prepare("SELECT id FROM audit_events WHERE entity_id=? AND actor_id='system:rental-policy' AND action LIKE '%job.completed%'").get(f.job.id));}
  else assert.equal(status(),'submitted','a report with a problem is never accepted by the AI');
 }finally{f.db.close();}}
});

test('under autopilot the guest report of arrival confirms the check-in once the payment is verified',async()=>{
 const {checkAdministratorOwner}=await load('administrator-runtime');
 for(const mode of ['manual','auto']){const f=await fixture();try{
  await matchingAction(f.owner,'owner','preference',{propertyId:f.property,mode});
  f.db.raw.prepare('UPDATE bookings SET start=?,end=?,occupied_until=? WHERE id=?').run(now()-600,now()+7200,now()+12600,f.booking);
  f.db.raw.prepare("UPDATE property_operations SET readiness='ready' WHERE property_id=?").run(f.property);
  await assert.rejects(f.owner.bookingAction(f.booking,{action:'report_checkin'}),e=>e.status===403);
  await f.guest.bookingAction(f.booking,{action:'report_checkin'});
  const checkin=()=>f.db.raw.prepare('SELECT actual_checkin FROM booking_terms WHERE booking_id=?').get(f.booking).actual_checkin;
  f.release();await checkAdministratorOwner(f.db,'owner');assert.equal(checkin(),null,'not before the payment is verified');
  if(mode==='auto')assert.ok(f.db.raw.prepare("SELECT id FROM notifications WHERE dedupe=?").get('owner:administrator-checkin-payment:'+f.booking));
  f.db.raw.prepare("UPDATE bookings SET payment_status='owner_verified' WHERE id=?").run(f.booking);f.db.raw.prepare("UPDATE booking_terms SET deposit_status='owner_verified' WHERE booking_id=?").run(f.booking);
  f.release();await checkAdministratorOwner(f.db,'owner');
  if(mode==='auto'){assert.ok(checkin());assert.equal(f.db.raw.prepare('SELECT readiness FROM property_operations WHERE property_id=?').get(f.property).readiness,'occupied');}
  else assert.equal(checkin(),null,'an owner answering personally confirms it in person');
 }finally{f.db.close();}}
});
