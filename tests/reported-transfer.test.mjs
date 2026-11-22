import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,load} from './helpers/platform.mjs';
// GPT audit 2026-11-22 «Оплата, перенос и отмена», «Возвраты и споры» 2–3: the money a guest reported, received in part
// or kept from a deposit is never lost from the count. The fixture's stay: 4 000 ₸ by the hour, deposit 10 000 ₸, in an hour.
const {recordFinance,financeState}=await load('finance');
const terms=f=>f.db.raw.prepare('SELECT * FROM booking_terms WHERE booking_id=?').get(f.booking);
const entries=(f,kind)=>f.db.raw.prepare('SELECT COALESCE(SUM(amount),0) n FROM finance_entries WHERE booking_id=? AND kind=?').get(f.booking,kind).n;

test('a transfer reported before the cancellation stays «на проверке» and goes back when the owner finds it',async()=>{
 const f=await fixture();try{
  await f.guest.bookingAction(f.booking,{action:'report_paid'});
  const told=terms(f);assert.ok(told.payment_reported_amount>0);
  const r=await f.owner.bookingAction(f.booking,{action:'cancel'});
  assert.doesNotMatch(r.message,/возвращать нечего/);assert.match(r.message,/Гость сообщил о переводе/);
  const guestNote=f.db.raw.prepare("SELECT body FROM notifications WHERE user_id=? AND dedupe LIKE 'guest:cancelled:%'").get(f.guest.userId)?.body||f.db.raw.prepare("SELECT body FROM notifications WHERE user_id=? AND body LIKE '%отмен%' ORDER BY created_at DESC").get(f.guest.userId).body;
  assert.match(guestNote,/Переводить заново не нужно/);
  const got=await f.owner.bookingAction(f.booking,{action:'received'});
  assert.match(got.message,/Верните гостю/);
  assert.equal(entries(f,'payment'),told.payment_reported_amount);
  const after=terms(f);assert.equal(after.refund_due,told.payment_reported_amount);assert.equal(after.refund_recorded_at,null);assert.equal(after.payment_reported_at,null);
  // The owner can now record the refund from the card.
  await f.owner.bookingAction(f.booking,{action:'record_refund',confirmed:true,expectedVersion:after.version});
  assert.equal(entries(f,'refund'),told.payment_reported_amount);
 }finally{f.db.close();}
});
test('a transfer not found after the cancellation: the guest is not asked to pay again',async()=>{
 const f=await fixture();try{
  await f.guest.bookingAction(f.booking,{action:'report_paid'});
  await f.guest.bookingAction(f.booking,{action:'cancel'});
  await f.owner.bookingAction(f.booking,{action:'not_received'});
  const n=f.db.raw.prepare("SELECT body FROM notifications WHERE user_id=? AND body LIKE 'Владелец проверил банк%'").get(f.guest.userId).body;
  assert.match(n,/переводить заново не нужно/);
  assert.equal(terms(f).payment_reported_at,null);assert.equal(entries(f,'payment'),0);
 }finally{f.db.close();}
});
test('the owner records the sum the guest reported, even after a discount lowered the price',async()=>{
 const f=await fixture();try{
  f.db.raw.prepare('UPDATE booking_terms SET prepay_percent=30 WHERE booking_id=?').run(f.booking);
  await f.guest.bookingAction(f.booking,{action:'report_paid'});
  const told=terms(f).payment_reported_amount;assert.equal(told,1200);
  // A 10% discount agreed afterwards: 3 600 ₸, whose 30% would be 1 080 ₸.
  f.db.raw.prepare('UPDATE bookings SET amount=3600 WHERE id=?').run(f.booking);f.db.raw.prepare('UPDATE booking_terms SET amount=3600 WHERE booking_id=?').run(f.booking);
  await f.owner.bookingAction(f.booking,{action:'received'});
  assert.equal(entries(f,'payment'),1200);
 }finally{f.db.close();}
});
test('a deposit received in part goes back in part when the booking is cancelled',async()=>{
 const f=await fixture();try{
  await recordFinance(f.owner,{kind:'deposit',bookingId:f.booking,amount:3000,confirmed:true,note:'Часть депозита',requestKey:'d3'});
  const r=await f.owner.bookingAction(f.booking,{action:'cancel'});
  assert.match(r.message,/Депозит 3 000 ₸ возвращается/);
  await f.owner.bookingAction(f.booking,{action:'record_deposit_return',confirmed:true,expectedVersion:terms(f).version});
  assert.equal(entries(f,'deposit_return'),3000);
 }finally{f.db.close();}
});
test('what was kept from a deposit leaves the summary of held deposits, as it leaves the card',async()=>{
 const f=await fixture();try{
  await recordFinance(f.owner,{kind:'deposit',bookingId:f.booking,amount:10000,confirmed:true,note:'Депозит',requestKey:'d10'});
  f.db.raw.prepare("UPDATE bookings SET status='completed' WHERE id=?").run(f.booking);
  f.db.raw.prepare('UPDATE booking_terms SET deposit_kept=3000 WHERE booking_id=?').run(f.booking);
  await recordFinance(f.owner,{kind:'deposit_return',bookingId:f.booking,amount:7000,confirmed:true,note:'Возврат',requestKey:'r7'});
  assert.equal((await financeState(f.owner,'owner')).totals.heldDeposits,0);
  assert.equal((await financeState(f.guest,'guest')).totals.heldDeposits,0);
 }finally{f.db.close();}
});
test('with a part of the deposit already in, the guest reports and the owner confirms only the rest',async()=>{
 const f=await fixture();try{
  await recordFinance(f.owner,{kind:'deposit',bookingId:f.booking,amount:3000,confirmed:true,note:'Часть депозита',requestKey:'d3'});
  await f.guest.bookingAction(f.booking,{action:'report_paid'});
  assert.equal(terms(f).deposit_reported_amount,7000);
  await f.owner.bookingAction(f.booking,{action:'cancel'});
  await f.owner.bookingAction(f.booking,{action:'received'});
  assert.equal(entries(f,'deposit'),10000);
 }finally{f.db.close();}
});
test('a change agrees a new number of guests and its price; above the capacity it is refused',async()=>{
 const f=await fixture();try{
  f.db.raw.prepare('UPDATE properties SET capacity=6 WHERE id=?').run(f.property);
  f.db.raw.prepare('UPDATE property_policies SET included_guests=2,extra_guest_price=500 WHERE property_id=?').run(f.property);
  const b=f.db.raw.prepare('SELECT * FROM bookings WHERE id=?').get(f.booking),iso=v=>new Date(v*1000).toISOString();
  await assert.rejects(f.guest.bookingChangeQuote(f.booking,'guest',{start:iso(b.start),end:iso(b.end),guests:9}),/Гости/);
  const q=await f.guest.bookingChangeQuote(f.booking,'guest',{start:iso(b.start),end:iso(b.end),guests:4});
  assert.equal(q.guests,4);assert.ok(q.amount>b.amount,'more guests cost more');
  const c=await f.guest.proposeBookingChange(f.booking,'guest',{start:iso(b.start),end:iso(b.end),guests:4,expectedAmount:q.amount,baseVersion:q.baseVersion,policyVersion:q.policyVersion,acceptTerms:true,reason:'Придут друзья',requestKey:'g4'});
  // The owner who approves sees the new number of guests, not only the dates and the price.
  const card=(await f.owner.roleState('owner')).approvals.find(a=>a.kind==='change');
  assert.deepEqual(card.facts.find(([k])=>k==='Гостей'),['Гостей',b.guests+' → 4']);
  await f.owner.decideBookingChange(f.booking,c.id,'owner',{action:'accept'});
  const after=f.db.raw.prepare('SELECT guests,amount FROM bookings WHERE id=?').get(f.booking);
  assert.equal(after.guests,4);assert.equal(after.amount,q.amount);
 }finally{f.db.close();}
});
