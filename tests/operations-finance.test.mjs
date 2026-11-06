import {test} from 'node:test';import assert from 'node:assert/strict';
import {fixture,load,now} from './helpers/platform.mjs';
const {recordFinance,financeState,acceptPaymentEvent}=await load('finance');
const {publicOperationsRequest}=await load('operations-api');
const {hmac}=await load('operation-core');
const input=(kind,bookingId,amount,key)=>({kind,bookingId,amount,confirmed:true,note:'Checked external operation',requestKey:key});
test('partial payments and partial refunds update balances without marking unpaid amounts received',async()=>{
 const f=await fixture();try{
  await recordFinance(f.owner,input('payment',f.booking,1000,'part-1'));let b=(await f.owner.state()).bookings[0];assert.equal(b.terms.paid_amount,1000);assert.equal(b.payment_status,'unpaid');
  await recordFinance(f.owner,input('payment',f.booking,3000,'part-2'));b=(await f.owner.state()).bookings[0];assert.equal(b.payment_status,'owner_verified');
  await recordFinance(f.owner,input('refund',f.booking,500,'refund-1'));assert.equal((await f.owner.state()).bookings[0].terms.paid_amount,3500);
  await assert.rejects(recordFinance(f.owner,input('refund',f.booking,4000,'too-large')),e=>e.status===409);
  const previous=await recordFinance(f.owner,input('payment',f.booking,1000,'part-1'));assert.ok(previous.id);assert.equal(f.db.raw.prepare("SELECT COUNT(*) n FROM finance_entries WHERE kind='payment'").get().n,2);
  await assert.rejects(recordFinance(f.owner,input('payment',f.booking,999,'part-1')),e=>e.status===409);
  assert.throws(()=>f.db.raw.prepare('UPDATE finance_entries SET amount=1').run(),/immutable/);
 }finally{f.db.close();}
});
test('deposits stay separate from operating results; guest cannot read owner expenses or write finance',async()=>{
 const f=await fixture();try{
  await recordFinance(f.owner,input('deposit',f.booking,5000,'deposit-half'));assert.equal((await f.owner.state()).bookings[0].terms.deposit_status,'pending');
  await recordFinance(f.owner,input('deposit',f.booking,5000,'deposit-rest'));assert.equal((await f.owner.state()).bookings[0].terms.deposit_status,'owner_verified');
  await recordFinance(f.owner,{kind:'expense',propertyId:f.property,amount:700,note:'Private repair detail',confirmed:true,requestKey:'expense'});
  const owner=await financeState(f.owner,'owner'),guest=await financeState(f.guest,'guest');assert.equal(owner.totals.heldDeposits,10000);assert.equal(owner.totals.operatingBalance,-700);assert.equal(guest.entries.some(e=>e.kind==='expense'),false);
  await assert.rejects(recordFinance(f.guest,input('payment',f.booking,1,'forged')),e=>e.status===403);
 }finally{f.db.close();}
});
test('signed provider receipts require the expected intent, deduplicate and account money arriving after cancellation',async()=>{
 const f=await fixture();try{
  f.db.raw.prepare("INSERT INTO payment_intents(id,booking_id,user_id,kind,amount,request_key,created_at) VALUES ('intent',?,'guest','payment',4000,'checkout',?)").run(f.booking,now());
  await f.owner.bookingAction(f.booking,{action:'cancel'});
  const raw=JSON.stringify({eventId:'event',intentId:'intent',type:'payment.succeeded',currency:'KZT',amount:4000}),secret='s'.repeat(64),timestamp=String(now()),signature=await hmac(secret,timestamp+'.'+raw);
  const bad=new Request('http://local/api/hooks/payment',{method:'POST',body:raw,headers:{'X-Event-Timestamp':timestamp,'X-Event-Signature':'invalid'}});await assert.rejects(publicOperationsRequest(f.db,bad,['hooks','payment'],{PAYMENT_WEBHOOK_SECRET:secret}),e=>e.status===403);
  const good=()=>new Request('http://local/api/hooks/payment',{method:'POST',body:raw,headers:{'X-Event-Timestamp':timestamp,'X-Event-Signature':signature}});
  const response=await publicOperationsRequest(f.db,good(),['hooks','payment'],{PAYMENT_WEBHOOK_SECRET:secret});assert.equal(response.status,200);assert.equal((await f.owner.state()).bookings[0].terms.paid_amount,4000);
  assert.equal((await (await publicOperationsRequest(f.db,good(),['hooks','payment'],{PAYMENT_WEBHOOK_SECRET:secret})).json()).duplicate,true);
  assert.equal(f.db.raw.prepare("SELECT COUNT(*) n FROM finance_entries WHERE source='provider'").get().n,1);
  await assert.rejects(acceptPaymentEvent(f.db,JSON.stringify({eventId:'event2',intentId:'intent',type:'payment.succeeded',currency:'KZT',amount:123}),()=>f.owner),e=>e.status===409);
 }finally{f.db.close();}
});
test('concurrent refunds cannot exceed received funds; partial deposit returns expose the true remaining balance',async()=>{
 const f=await fixture();try{
  await recordFinance(f.owner,input('payment',f.booking,4000,'full'));
  const attempts=await Promise.allSettled([recordFinance(f.owner,input('refund',f.booking,3000,'refund-a')),recordFinance(f.owner,input('refund',f.booking,3000,'refund-b'))]);assert.equal(attempts.filter(v=>v.status==='fulfilled').length,1);assert.equal((await f.owner.state()).bookings[0].terms.paid_amount,1000);
  await recordFinance(f.owner,input('deposit',f.booking,10000,'deposit'));f.db.raw.prepare('UPDATE bookings SET start=? WHERE id=?').run(now()-600,f.booking);await f.owner.bookingAction(f.booking,{action:'checkout'});
  await recordFinance(f.owner,input('deposit_return',f.booking,3000,'deposit-return-part'));const b=(await f.owner.state()).bookings[0];assert.equal(b.terms.deposit_balance,7000);assert.equal(b.terms.deposit_returned_at,null);
 }finally{f.db.close();}
});
