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
  await setTestPayments(f.owner,{enabled:false});assert.equal(await paymentMode(f.db,{}),'off');
 }finally{f.db.close();}
});
