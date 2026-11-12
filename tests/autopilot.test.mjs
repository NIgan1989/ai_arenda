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
  await decideOffer(f.cleaner,{id:work.id,action:'accept'});f.release();await checkAdministratorOwner(f.db,'owner');
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
