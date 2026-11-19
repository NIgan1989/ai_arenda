import {test} from 'node:test';import assert from 'node:assert/strict';
import {fixture,load,now} from './helpers/platform.mjs';
import {photo} from './fixtures/photo.mjs';
const {saveReceipt,listReceipts,readReceipt,RECEIPT_LIMIT}=await load('payment-receipts'),{RentalService}=await load('service');

// The bank receipt next to «Я оплатил»: only the payer attaches it, only the two sides and the service administrator see it.
test('the guest attaches a Kaspi receipt to the booking; the owner sees it, a stranger does not',async()=>{
 const f=await fixture();try{
  await assert.rejects(saveReceipt(f.owner,'owner',{bookingId:f.booking,data:photo}),e=>e.status===403&&/тот, кто платит/.test(e.message));
  await assert.rejects(saveReceipt(f.other,'guest',{bookingId:f.booking,data:photo}),e=>e.status===404);
  const saved=await saveReceipt(f.guest,'guest',{bookingId:f.booking,data:photo});assert.match(saved.message,/увидит владелец/);
  assert.equal((await listReceipts(f.owner,'booking',f.booking)).receipts.length,1);
  assert.match((await readReceipt(f.owner,saved.id)).data,/^data:image\/jpeg/);
  await assert.rejects(listReceipts(f.other,'booking',f.booking),e=>e.status===404);
  await assert.rejects(readReceipt(f.other,saved.id),e=>e.status===404);await assert.rejects(readReceipt(f.cleaner,saved.id),e=>e.status===404);
  assert.match((await readReceipt(new RentalService(f.db,'admin'),saved.id,{},true)).data,/^data:image\/jpeg/,'the service administrator settles a dispute');
  await f.guest.bookingAction(f.booking,{action:'report_paid'});assert.match(f.db.raw.prepare("SELECT body FROM notifications WHERE user_id='owner' AND dedupe LIKE 'owner:paid-reported:%'").get().body,/и приложил чек\. Проверьте/);
  for(let i=1;i<RECEIPT_LIMIT;i++)await saveReceipt(f.guest,'guest',{bookingId:f.booking,data:photo});
  await assert.rejects(saveReceipt(f.guest,'guest',{bookingId:f.booking,data:photo}),/максимум чеков: 3/);
  const state=await f.owner.state('owner');assert.equal(state.bookings.find(b=>b.id===f.booking).receipts,RECEIPT_LIMIT);
  f.db.raw.prepare("UPDATE bookings SET status='cancelled' WHERE id=?").run(f.booking);f.db.raw.prepare('DELETE FROM payment_receipts').run();
  await assert.rejects(saveReceipt(f.guest,'guest',{bookingId:f.booking,data:photo}),e=>e.status===409);
 }finally{f.db.close();}
});

test('the customer attaches a receipt to an accepted cleaning; the performer sees it until the money is confirmed',async()=>{
 const f=await fixture(),R=f.db.raw;try{
  R.prepare("UPDATE cleaning_jobs SET status='assigned',assigned_to='cleaner' WHERE id=?").run(f.job.id);
  await assert.rejects(saveReceipt(f.owner,'owner',{jobId:f.job.id,data:photo}),e=>e.status===409&&/после принятой уборки/.test(e.message));
  R.prepare("UPDATE cleaning_jobs SET status='completed',completed_at=? WHERE id=?").run(now(),f.job.id);
  await assert.rejects(saveReceipt(f.cleaner,'cleaner',{jobId:f.job.id,data:photo}),e=>e.status===403);
  const saved=await saveReceipt(f.owner,'owner',{jobId:f.job.id,data:photo});assert.match(saved.message,/увидит исполнитель/);
  assert.equal((await listReceipts(f.cleaner,'job',f.job.id)).receipts.length,1);assert.match((await readReceipt(f.cleaner,saved.id)).data,/^data:image\/jpeg/);
  await assert.rejects(readReceipt(f.guest,saved.id),e=>e.status===404);
  R.prepare('UPDATE cleaning_jobs SET payment_received_at=? WHERE id=?').run(now(),f.job.id);
  await assert.rejects(saveReceipt(f.owner,'owner',{jobId:f.job.id,data:photo}),e=>e.status===409);
 }finally{f.db.close();}
});
