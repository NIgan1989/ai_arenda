import {test} from 'node:test';import assert from 'node:assert/strict';
import {fixture,load} from './helpers/platform.mjs';
const {paymentMode,testPayment,setTestPayments}=await load('finance');

test('test payments take a booking through payment and deposit without money, once, until a bank is connected',async()=>{
 const f=await fixture(),{RentalService}=await load('service'),owner=id=>new RentalService(f.db,id);try{
  assert.equal(await paymentMode(f.db,{}),'test');
  assert.equal(await paymentMode(f.db,{PAYMENT_GATEWAY_URL:'https://pay.example',PAYMENT_GATEWAY_TOKEN:'t',PAYMENT_WEBHOOK_SECRET:'s'}),'live');
  await assert.rejects(testPayment(f.other,{bookingId:f.booking,kind:'payment'},{},owner),e=>e.status===403);
  // Two taps at once record one payment.
  const taps=await Promise.allSettled([testPayment(f.guest,{bookingId:f.booking,kind:'payment'},{},owner),testPayment(f.guest,{bookingId:f.booking,kind:'payment'},{},owner)]);
  assert.ok(taps.some(t=>t.status==='fulfilled'&&/тестовом режиме/.test(t.value.message)));
  const entries=f.db.raw.prepare("SELECT * FROM finance_entries WHERE booking_id=? AND kind='payment'").all(f.booking);assert.equal(entries.length,1);
  assert.match(entries[0].note,/Тестовая оплата/);assert.match(entries[0].external_reference,/^TEST-/);
  assert.equal(f.db.raw.prepare('SELECT payment_status FROM bookings WHERE id=?').get(f.booking).payment_status,'owner_verified');
  assert.equal(f.db.raw.prepare("SELECT test,status FROM payment_intents WHERE booking_id=? AND kind='payment'").get(f.booking).test,1);
  await assert.rejects(testPayment(f.guest,{bookingId:f.booking,kind:'payment'},{},owner),e=>e.status===409&&/уже оплачена/.test(e.message));
  await testPayment(f.guest,{bookingId:f.booking,kind:'deposit'},{},owner);
  assert.equal(f.db.raw.prepare('SELECT deposit_status FROM booking_terms WHERE booking_id=?').get(f.booking).deposit_status,'owner_verified');
  // With a real gateway or with the switch off nothing is faked.
  await assert.rejects(testPayment(f.guest,{bookingId:f.booking,kind:'payment'},{PAYMENT_GATEWAY_URL:'https://pay.example',PAYMENT_GATEWAY_TOKEN:'t',PAYMENT_WEBHOOK_SECRET:'s'},owner),e=>e.status===409&&/выключена/.test(e.message));
  // A later balance with the same amount (after a change of stay) is a new payment, not the old one.
  f.db.raw.prepare('UPDATE bookings SET amount=amount*2 WHERE id=?').run(f.booking);
  const extra=f.db.raw.prepare('SELECT amount-(SELECT paid_amount FROM booking_terms WHERE booking_id=bookings.id) n FROM bookings WHERE id=?').get(f.booking).n;assert.ok(extra>0);
  assert.match((await testPayment(f.guest,{bookingId:f.booking,kind:'payment'},{},owner)).message,/тестовом режиме/);
  assert.equal(f.db.raw.prepare("SELECT COUNT(*) n FROM finance_entries WHERE booking_id=? AND kind='payment'").get(f.booking).n,2);
  assert.equal(f.db.raw.prepare('SELECT payment_status FROM bookings WHERE id=?').get(f.booking).payment_status,'owner_verified');
  await setTestPayments(f.owner,{enabled:false});assert.equal(await paymentMode(f.db,{}),'off');
 }finally{f.db.close();}
});

test('«Оплатить всё» records the stay and the deposit in one tap, and the remaining part alone when one is already paid',async()=>{
 const f=await fixture(),{RentalService}=await load('service'),owner=id=>new RentalService(f.db,id);try{
  const all=await testPayment(f.guest,{bookingId:f.booking,kind:'all'},{},owner);
  assert.match(all.message,/^Оплачено .* в тестовом режиме: проживание .* и депозит .*\. Деньги не списывались\.$/);
  assert.equal(f.db.raw.prepare('SELECT payment_status FROM bookings WHERE id=?').get(f.booking).payment_status,'owner_verified');
  assert.equal(f.db.raw.prepare('SELECT deposit_status FROM booking_terms WHERE booking_id=?').get(f.booking).deposit_status,'owner_verified');
  assert.equal(f.db.raw.prepare("SELECT COUNT(*) n FROM finance_entries WHERE booking_id=? AND kind IN ('payment','deposit')").get(f.booking).n,2);
  await assert.rejects(testPayment(f.guest,{bookingId:f.booking,kind:'all'},{},owner),e=>e.status===409&&/уже оплачена/.test(e.message));
  await assert.rejects(testPayment(f.guest,{bookingId:f.booking,kind:'all'},{PAYMENT_GATEWAY_URL:'https://pay.example',PAYMENT_GATEWAY_TOKEN:'t',PAYMENT_WEBHOOK_SECRET:'s'},owner),e=>e.status===409&&/выключена/.test(e.message));
 }finally{f.db.close();}
 const g=await fixture(),owner2=id=>new RentalService(g.db,id);try{
  await testPayment(g.guest,{bookingId:g.booking,kind:'payment'},{},owner2);
  assert.match((await testPayment(g.guest,{bookingId:g.booking,kind:'all'},{},owner2)).message,/^Депозит .* в тестовом режиме/);
 }finally{g.db.close();}
});
