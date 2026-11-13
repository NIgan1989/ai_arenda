import {test} from 'node:test';import assert from 'node:assert/strict';import {fixture,load,now} from './helpers/platform.mjs';
const {assessBookingRisk}=await load('booking-risk');
const {riskAdvice}=await load('booking-risk-text');
const DAY=86400,iso=t=>new Date(t*1000).toISOString();
const signals=(over={})=>({phone:true,completed:0,disputes:0,cancels:0,accountAge:30*DAY,lead:2*DAY,nightHourly:false,price:20000,deposit:0,...over});
const policyVersion=f=>f.db.raw.prepare('SELECT version FROM property_policies WHERE property_id=?').get(f.property).version;

test('a guest with clean stays is low risk; a new guest without a phone at the last minute is high',()=>{
 const good=assessBookingRisk(signals({completed:4}));
 assert.equal(good.level,'low');assert.equal(good.deposit,0);assert.deepEqual(good.reasons,['4 проживания без замечаний','телефон подтверждён']);
 assert.equal(riskAdvice(good),'Можно подтверждать без дополнительных условий.');
 const first=assessBookingRisk(signals({phone:false}));
 assert.equal(first.level,'medium');assert.equal(first.deposit,10000,'half a day for a medium risk');
 assert.equal(riskAdvice(first).replace(/\s/g,' '),'Можно взять депозит 10 000 ₸ (вернётся гостю после выезда) и попросить гостя подтвердить телефон.');
 assert.match(riskAdvice(assessBookingRisk(signals({phone:false,accountAge:3600,lead:3600}))),/^Советую взять депозит/);
 const night=assessBookingRisk(signals({phone:false,accountAge:3600,lead:3600,nightHourly:true}));
 assert.equal(night.level,'high');assert.equal(night.deposit,20000);
 assert.deepEqual(night.reasons,['телефон не подтверждён','первая бронь в сервисе','аккаунт создан сегодня','заезд меньше чем через 3 часа']);
 const disputed=assessBookingRisk(signals({completed:5,disputes:1}));
 assert.equal(disputed.level,'medium');assert.equal(disputed.reasons[0],'был спор при выезде');
 assert.equal(assessBookingRisk(signals({phone:false,deposit:10000})).deposit,0,'the policy already takes a deposit');
});

test('the owner sees the risk on the request and can confirm it with the advised deposit',async()=>{
 const f=await fixture();try{
  await f.owner.savePolicy(f.property,{...f.policy,expectedVersion:policyVersion(f),deposit:0});
  const start=now()+2*DAY,id=(await f.guest.createBooking({propertyId:f.property,start:iso(start),end:iso(start+DAY),guests:1,billingMode:'daily',requestKey:'risk',acceptTerms:true})).id;
  const row=f.db.raw.prepare('SELECT * FROM booking_risks WHERE booking_id=?').get(id);
  assert.equal(row.level,'medium');assert.equal(row.deposit_advice,5000);assert.equal(row.held,0);
  assert.match(f.db.raw.prepare("SELECT body FROM notifications WHERE dedupe=?").get('owner:booking:'+id).body,/Риск средний/);
  assert.ok(f.db.raw.prepare("SELECT 1 FROM notifications WHERE dedupe=?").get('guest:phone-ask:'+id),'the guest is asked to verify the phone');
  const card=(await f.owner.roleState('owner')).approvals.find(c=>c.id==='booking:'+id);
  assert.equal(card.risk.label,'Риск средний');assert.equal(card.depositLabel.replace(/\s/g,' '),'С депозитом 5 000 ₸');
  assert.match(card.risk.advice,/депозит 5\s000\s₸/);
  const guestCard=(await f.guest.roleState('guest')).approvals.find(c=>c.id==='booking:'+id);
  assert.equal(guestCard.risk,undefined,'the guest never sees their own risk');
  const r=await f.owner.decideApproval('owner',{id:card.id,revision:card.revision,action:'deposit',cleaningFee:0});
  assert.match(r.message,/с депозитом 5\s000\s₸/);
  const terms=f.db.raw.prepare('SELECT deposit,deposit_status FROM booking_terms WHERE booking_id=?').get(id);
  assert.deepEqual([terms.deposit,terms.deposit_status],[5000,'pending']);
  assert.equal(f.db.raw.prepare('SELECT status FROM bookings WHERE id=?').get(id).status,'confirmed');
  assert.match(f.db.raw.prepare("SELECT body FROM notifications WHERE dedupe=?").get('guest:deposit-asked:'+id).body,/возвратный депозит 5\s000\s₸/);
 }finally{f.db.close();}
});

test('a deposit is refused when the rules already take one, and plain confirmation still works',async()=>{
 const f=await fixture();try{
  const start=now()+3*DAY,id=(await f.guest.createBooking({propertyId:f.property,start:iso(start),end:iso(start+DAY),guests:1,billingMode:'daily',requestKey:'risk2',acceptTerms:true})).id;
  const card=(await f.owner.roleState('owner')).approvals.find(c=>c.id==='booking:'+id);
  assert.ok(card.risk);assert.equal(card.depositLabel,undefined);
  await assert.rejects(f.owner.decideApproval('owner',{id:card.id,revision:card.revision,action:'deposit'}));
  assert.match((await f.owner.decideApproval('owner',{id:card.id,revision:card.revision,action:'accept',cleaningFee:0})).message,/^Бронь подтверждена\.$/);
 }finally{f.db.close();}
});

test('under autopilot a high risk is not confirmed automatically and goes to the owner',async()=>{
 const f=await fixture();try{
  await f.owner.bookingAction(f.booking,{action:'cancel'});
  f.db.raw.prepare('UPDATE property_policies SET auto_confirm=1 WHERE property_id=?').run(f.property);
  const start=now()+3600,r=await f.guest.createBooking({propertyId:f.property,start:iso(start),end:iso(start+7200),guests:1,billingMode:'hourly',requestKey:'risk3',acceptTerms:true,expectedPolicyVersion:policyVersion(f)});
  assert.equal(f.db.raw.prepare('SELECT status FROM bookings WHERE id=?').get(r.id).status,'requested');
  const row=f.db.raw.prepare('SELECT level,held FROM booking_risks WHERE booking_id=?').get(r.id);assert.deepEqual([row.level,row.held],['high',1]);
  assert.match(f.db.raw.prepare("SELECT body FROM notifications WHERE dedupe=?").get('owner:booking:'+r.id).body,/не подтвердил заявку .* автоматически: риск высокий/);
  const card=(await f.owner.roleState('owner')).approvals.find(c=>c.id==='booking:'+r.id);assert.equal(card.risk.held,true);
  // A verified phone and past stays let autopilot confirm on its own again.
  f.db.raw.prepare("INSERT INTO phone_verifications VALUES ('guest','+77000000009','x',0,0,0,?)").run(now());
  f.db.raw.prepare('UPDATE profiles SET created_at=? WHERE id=?').run(now()-30*DAY,'guest');
  const later=now()+5*DAY,ok=await f.guest.createBooking({propertyId:f.property,start:iso(later),end:iso(later+7200),guests:1,billingMode:'hourly',requestKey:'risk4',acceptTerms:true});
  assert.equal(f.db.raw.prepare('SELECT status FROM bookings WHERE id=?').get(ok.id).status,'confirmed');
 }finally{f.db.close();}
});
