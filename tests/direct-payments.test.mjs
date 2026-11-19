import {test} from 'node:test';import assert from 'node:assert/strict';
import {fixture,load} from './helpers/platform.mjs';
const {paymentMode,testPayment}=await load('finance'),{savePayout,payoutOf,payoutPhone,payoutLink}=await load('payout'),{payDue,guestSteps}=await load('guest-trips');

// Direct settlements: the guest pays the owner outside the service; the service keeps only the marks of both sides.
test('a booking is never paid through the service: the old test payment is refused',async()=>{
 const f=await fixture(),{RentalService}=await load('service');try{
  assert.equal(await paymentMode(f.db,{}),'direct');
  assert.equal(await paymentMode(f.db,{PAYMENT_GATEWAY_URL:'https://pay.example',PAYMENT_GATEWAY_TOKEN:'t',PAYMENT_WEBHOOK_SECRET:'s'}),'direct');
  await assert.rejects(testPayment(f.guest,{bookingId:f.booking,kind:'all'},{},id=>new RentalService(f.db,id)),e=>e.status===409&&/напрямую владельцу/.test(e.message));
  assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM finance_entries').get().n,0);
 }finally{f.db.close();}
});

test('«Я оплатил» tells the owner; nothing is paid until the owner confirms «Деньги получены»',async()=>{
 const f=await fixture(),R=f.db.raw;try{
  const terms=()=>R.prepare('SELECT * FROM booking_terms WHERE booking_id=?').get(f.booking),status=()=>R.prepare('SELECT payment_status FROM bookings WHERE id=?').get(f.booking).payment_status;
  await assert.rejects(f.other.bookingAction(f.booking,{action:'report_paid'}),e=>e.status===403||e.status===404);
  await assert.rejects(f.owner.bookingAction(f.booking,{action:'report_paid'}),e=>e.status===403);
  await assert.rejects(f.owner.bookingAction(f.booking,{action:'not_received'}),e=>e.status===409,'nothing was reported yet');
  const said=await f.guest.bookingAction(f.booking,{action:'report_paid'});assert.match(said.message,/Владелец получил сообщение/);
  assert.ok(terms().payment_reported_at&&terms().deposit_reported_at);assert.equal(status(),'unpaid');assert.equal(terms().deposit_status,'pending');
  const note=R.prepare("SELECT body FROM notifications WHERE user_id='owner' AND dedupe LIKE 'owner:paid-reported:%'").get().body;
  assert.match(note,/Гость сообщил, что перевёл вам 14\s000 ₸ \(.* 4\s000 ₸ и депозит 10\s000 ₸\)/);
  assert.match((await f.guest.bookingAction(f.booking,{action:'report_paid'})).message,/уже знает/,'a second tap says nothing new');
  assert.equal(R.prepare("SELECT COUNT(*) n FROM notifications WHERE user_id='owner' AND dedupe LIKE 'owner:paid-reported:%'").get().n,1);
  // The owner does not see the money: the guest is told and may report again.
  await assert.rejects(f.guest.bookingAction(f.booking,{action:'not_received'}),e=>e.status===403);
  await f.owner.bookingAction(f.booking,{action:'not_received'});
  assert.equal(terms().payment_reported_at,null);assert.equal(terms().deposit_reported_at,null);
  assert.match(R.prepare("SELECT body FROM notifications WHERE user_id='guest' AND dedupe LIKE 'guest:not-received:%'").get().body,/не видит перевод/);
  await f.guest.bookingAction(f.booking,{action:'report_paid'});assert.ok(terms().payment_reported_at);
  // One confirmation closes the stay and the deposit, each as its own entry made by the owner.
  await assert.rejects(f.guest.bookingAction(f.booking,{action:'received'}),e=>e.status===403);
  assert.match((await f.owner.bookingAction(f.booking,{action:'received'})).message,/Оплата подтверждена/);
  assert.equal(status(),'owner_verified');assert.equal(terms().deposit_status,'owner_verified');
  assert.equal(terms().payment_reported_at,null);assert.equal(terms().deposit_reported_at,null);
  assert.deepEqual(R.prepare('SELECT kind,amount,source FROM finance_entries WHERE booking_id=? ORDER BY kind').all(f.booking).map(e=>e.kind+':'+e.amount+':'+e.source),['deposit:10000:owner','payment:4000:owner']);
  assert.match(R.prepare("SELECT body FROM notifications WHERE user_id='guest' AND body LIKE 'Владелец подтвердил, что получил оплату%'").get().body,/4\s000 ₸/);
  assert.match((await f.owner.bookingAction(f.booking,{action:'received'})).message,/уже была подтверждена/);
  assert.match((await f.guest.bookingAction(f.booking,{action:'report_paid'})).message,/уже подтвердил/);
 }finally{f.db.close();}
});

test('the guest sees one step «Я оплатил» for everything due, and none while the owner checks',()=>{
 const b={status:'confirmed',amount:4000,start:9e9,end:9e9+3600,terms:{paid_amount:0,deposit:10000,deposit_status:'pending'}};
 assert.deepEqual(payDue(b),{left:4000,deposit:10000,sum:14000,reported:false});
 assert.match(guestSteps(b,0)[0].label,/^Я оплатил 14\s000 ₸$/);
 const told={...b,terms:{...b.terms,payment_reported_at:1,deposit_reported_at:1}};
 assert.equal(payDue(told).reported,true);assert.ok(!guestSteps(told,0).some(s=>s.id==='pay'));
 const half={...b,terms:{...b.terms,paid_amount:4000}};
 assert.deepEqual(payDue(half),{left:0,deposit:10000,sum:10000,reported:false});
});

test('payout details: a Kaspi number and a name, shown only to the payer of a confirmed deal',async()=>{
 const f=await fixture(),R=f.db.raw;try{
  assert.equal(payoutPhone('8 (701) 123-45-67'),'+77011234567');assert.equal(payoutPhone('7011234567'),'+77011234567');
  assert.throws(()=>payoutPhone('+1 202 555 0100'));assert.throws(()=>payoutPhone('123'));
  assert.equal(payoutLink(''),'');assert.equal(payoutLink('https://pay.kaspi.kz/pay/abc'),'https://pay.kaspi.kz/pay/abc');
  assert.throws(()=>payoutLink('https://evil.example/pay'));assert.throws(()=>payoutLink('http://pay.kaspi.kz/pay/abc'));
  await assert.rejects(savePayout(f.owner,{phone:'+7 701 123 45 67',recipient:''}),/имя получателя/);
  const saved=await savePayout(f.owner,{phone:'+7 701 123 45 67',recipient:'  Дулат   Н. ',link:''});
  assert.deepEqual(saved.payout,{phone:'+77011234567',recipient:'Дулат Н.',link:''});
  await savePayout(f.owner,{phone:'87011234568',recipient:'Дулат Н.'});
  assert.deepEqual(await payoutOf(f.db,'owner'),{phone:'+77011234568',recipient:'Дулат Н.',link:''});assert.equal(R.prepare("SELECT version FROM payout_details WHERE user_id='owner'").get().version,2);
  assert.equal(await payoutOf(f.db,'guest'),null);
  // The guest of the confirmed booking reads them in the card; a guest whose request is not confirmed does not.
  const mine=(await f.guest.roleState('guest',{catalog:false})).bookings.find(b=>b.id===f.booking);
  assert.deepEqual(mine.owner_pay,{phone:'+77011234568',recipient:'Дулат Н.',link:''});
  R.prepare("UPDATE bookings SET status='requested',expires_at=? WHERE id=?").run(Math.floor(Date.now()/1000)+3600,f.booking);
  assert.equal((await f.guest.roleState('guest',{catalog:false})).bookings.find(b=>b.id===f.booking).owner_pay,null);
 }finally{f.db.close();}
});

test('a dearer stay agreed after «Я оплатил» is reported again: the old report covers only the old sum',async()=>{
 const f=await fixture(),R=f.db.raw;try{
  const iso=s=>new Date(s*1000).toISOString(),terms=()=>R.prepare('SELECT * FROM booking_terms WHERE booking_id=?').get(f.booking),start=R.prepare('SELECT start FROM bookings WHERE id=?').get(f.booking).start;
  await f.guest.bookingAction(f.booking,{action:'report_paid'});assert.ok(terms().payment_reported_at);
  const before=terms().amount,body={start:iso(start),end:iso(start+3*3600),billingMode:'hourly'},q=await f.guest.bookingChangeQuote(f.booking,'guest',body);
  const c=await f.guest.proposeBookingChange(f.booking,'guest',{...body,requestKey:'longer',expectedAmount:q.amount,baseVersion:q.baseVersion,policyVersion:q.policyVersion,acceptTerms:true,reason:'Планы изменились'});
  await f.owner.decideBookingChange(f.booking,c.id,'owner',{action:'accept'});
  assert.ok(terms().amount>before);assert.equal(terms().payment_reported_at,null,'the bigger sum is not reported yet');assert.ok(terms().deposit_reported_at,'the deposit did not change');
  assert.match((await f.guest.bookingAction(f.booking,{action:'report_paid'})).message,/Владелец получил сообщение/);assert.ok(terms().payment_reported_at);
 }finally{f.db.close();}
});
