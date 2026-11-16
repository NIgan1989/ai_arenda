import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,load,now} from './helpers/platform.mjs';
const {cancellationTerms}=await load('cancellation');
const terms=f=>f.db.raw.prepare('SELECT * FROM booking_terms WHERE booking_id=?').get(f.booking);
const note=(f,user,like)=>f.db.raw.prepare('SELECT body FROM notifications WHERE user_id=? AND dedupe LIKE ?').get(user,like);
const base={by:'guest',status:'confirmed',mode:'daily',rate:10000,units:3,amount:30000,paid:30000,deposit:5000,start:1000000,minHours:1,at:0};
// The fixture's stay is hourly, 2 hours for 4 000 ₸ with a 10 000 ₸ deposit, and starts in an hour.
async function paid(f){await f.owner.bookingAction(f.booking,{action:'paid'});await f.owner.bookingAction(f.booking,{action:'deposit_received'});}

test('the offer rule: free before the deadline, the first day kept after it, the owner always returns everything',()=>{
 assert.deepEqual(cancellationTerms({...base,at:base.start-24*3600}),{free:true,refund:30000,withheld:0,deposit:5000,freeUntil:base.start-24*3600});
 const late=cancellationTerms({...base,at:base.start-3600});assert.equal(late.withheld,10000);assert.equal(late.refund,20000);assert.equal(late.deposit,5000);
 assert.equal(cancellationTerms({...base,at:base.start-3600,by:'owner'}).refund,30000);
 assert.equal(cancellationTerms({...base,at:base.start-3600,status:'requested'}).refund,30000);
 const hourly=cancellationTerms({...base,mode:'hourly',rate:2000,units:5,amount:10000,paid:10000,minHours:2,at:base.start-3600});assert.equal(hourly.withheld,4000);assert.equal(hourly.refund,6000);
 assert.equal(cancellationTerms({...base,mode:'hourly',rate:2000,units:5,amount:10000,paid:10000,minHours:2,at:base.start-2*3600}).free,true);
 assert.equal(cancellationTerms({...base,paid:4000,at:base.start-3600}).withheld,4000);
});

test('a guest who cancels late is told what stays with the owner; the owner returns only the rest and the deposit',async()=>{
 const f=await fixture();try{
  // Four hours instead of two, so that something is left to return after the minimum two hours are kept.
  f.db.raw.prepare('UPDATE booking_terms SET units=4,amount=8000 WHERE booking_id=?').run(f.booking);
  f.db.raw.prepare('UPDATE bookings SET amount=8000 WHERE id=?').run(f.booking);
  await paid(f);
  const state=await f.guest.state(),quote=state.bookings[0].cancel_terms;assert.equal(quote.withheld,4000);assert.equal(quote.refund,4000);
  const r=await f.guest.bookingAction(f.booking,{action:'cancel'});assert.match(r.message,/владельцу остаётся 4 000 ₸, вам вернут 4 000 ₸/);
  assert.equal(terms(f).refund_due,4000);
  assert.match(note(f,'owner','owner:cancelled:%').body,/остаётся 4 000 ₸, гостю нужно вернуть 4 000 ₸.*Депозит 10 000 ₸/);
  await f.owner.bookingAction(f.booking,{action:'record_refund',confirmed:true,expectedVersion:terms(f).version});
  assert.equal(f.db.raw.prepare("SELECT SUM(amount) n FROM finance_entries WHERE booking_id=? AND kind='refund'").get(f.booking).n,4000);
  assert.ok(terms(f).refund_recorded_at);
  assert.match((await f.owner.bookingAction(f.booking,{action:'record_refund',confirmed:true,expectedVersion:terms(f).version})).message,/уже полностью/);
  await f.owner.bookingAction(f.booking,{action:'record_deposit_return',confirmed:true,expectedVersion:terms(f).version});
  assert.ok(terms(f).deposit_returned_at);
 }finally{f.db.close();}
});

test('a guest who cancels in time and an owner who cancels return everything',async()=>{
 for(const who of ['guest','owner']){
  const f=await fixture();try{
   await paid(f);
   if(who==='guest'){const t=now();f.db.raw.prepare('UPDATE bookings SET start=?,"end"=?,occupied_until=? WHERE id=?').run(t+3*3600,t+5*3600,t+5*3600+5400,f.booking);f.db.raw.prepare('UPDATE cleaning_jobs SET start=?,end=? WHERE id=?').run(t+5*3600,t+5*3600+5400,f.job.id);}
   const r=await f[who].bookingAction(f.booking,{action:'cancel'});assert.equal(r.cancel.refund,4000);assert.equal(r.cancel.withheld,0);
   assert.match(note(f,'guest','guest:cancelled:%').body,/вернут всю оплату: 4 000 ₸/);assert.equal(terms(f).refund_due,4000);
  }finally{f.db.close();}
 }
});

test('the cleaner and those who applied hear that the cleaning is off',async()=>{
 const f=await fixture();try{
  await f.cleaner.jobAction(f.job.id,{action:'apply'});
  await f.owner.bookingAction(f.booking,{action:'cancel'});
  assert.match(note(f,'cleaner','cleaner:booking-cancelled:%').body,/уборка после неё не нужна/);
  assert.equal(f.db.raw.prepare('SELECT status FROM cleaning_jobs WHERE id=?').get(f.job.id).status,'cancelled');
  assert.match(note(f,'guest','guest:cancelled:%').body,/Оплаты не было/);
  await assert.rejects(f.owner.bookingAction(f.booking,{action:'cancel'}),/уже закрыта/);
 }finally{f.db.close();}
});

test('the owner marks the cleaning as paid in one tap, without typing a note',async()=>{
 const f=await fixture();try{
  f.db.raw.prepare("UPDATE cleaning_jobs SET assigned_to='cleaner',status='completed' WHERE id=?").run(f.job.id);
  const j=f.db.raw.prepare('SELECT * FROM cleaning_jobs WHERE id=?').get(f.job.id);
  await f.owner.jobAction(f.job.id,{action:'record_job_payment',confirmed:true,expectedVersion:j.version});
  assert.ok(f.db.raw.prepare('SELECT settled_at FROM cleaning_jobs WHERE id=?').get(f.job.id).settled_at);
 }finally{f.db.close();}
});

test('money owed to the guest stays in front of the owner until it is marked returned',async()=>{
 const {ownerThreads}=await load('process-threads');
 const f=await fixture();try{
  await paid(f);await f.guest.bookingAction(f.booking,{action:'cancel'});
  // The fixture's two hours are the minimum, so a late cancellation leaves only the deposit to return.
  const threads=async()=>{const s=await f.owner.state();return ownerThreads({...s,user:{id:'owner'}},now());};
  let t=(await threads()).find(x=>x.tag==='Возврат');assert.ok(t.yours);assert.match(t.line,/Верните гостю депозит 10 000 ₸/);
  await f.owner.bookingAction(f.booking,{action:'record_deposit_return',confirmed:true,expectedVersion:terms(f).version});
  assert.equal((await threads()).find(x=>x.tag==='Возврат'),undefined);
 }finally{f.db.close();}
});

test('a refund made before the cancellation is not subtracted twice',async()=>{
 const {recordFinance}=await load('finance');
 const f=await fixture();try{
  await paid(f);
  await recordFinance(f.owner,{kind:'refund',bookingId:f.booking,amount:1000,confirmed:true,note:'Скидка за неудобство',requestKey:'early-refund'});
  const r=await f.owner.bookingAction(f.booking,{action:'cancel'});assert.equal(r.cancel.refund,3000);
  assert.equal(terms(f).refund_due,4000);assert.equal(terms(f).refund_recorded_at,null);
  await f.owner.bookingAction(f.booking,{action:'record_refund',confirmed:true,expectedVersion:terms(f).version});
  assert.equal(f.db.raw.prepare("SELECT SUM(amount) n FROM finance_entries WHERE booking_id=? AND kind='refund'").get(f.booking).n,4000);
  assert.ok(terms(f).refund_recorded_at);
 }finally{f.db.close();}
});

test('a late cancellation that leaves nothing to return is settled at once and keeps the agreed minimum hours',async()=>{
 const f=await fixture();try{
  await paid(f);
  // The owner raises the minimum for new requests; this booking was made with two hours.
  f.db.raw.prepare('UPDATE property_policies SET min_hours=1 WHERE property_id=?').run(f.property);
  assert.equal(terms(f).min_hours,2);
  const r=await f.guest.bookingAction(f.booking,{action:'cancel'});assert.equal(r.cancel.withheld,4000);assert.equal(r.cancel.refund,0);
  assert.equal(terms(f).refund_due,0);assert.ok(terms(f).refund_recorded_at);
  // Returning the deposit afterwards does not reopen the settled refund.
  await f.owner.bookingAction(f.booking,{action:'record_deposit_return',confirmed:true,expectedVersion:terms(f).version});
  assert.ok(terms(f).refund_recorded_at);
 }finally{f.db.close();}
});

test('after the stay the owner keeps a part of the deposit once, with a reason, and returns only the rest',async()=>{
 const f=await fixture();try{
  await paid(f);
  await assert.rejects(f.owner.bookingAction(f.booking,{action:'keep_deposit',amount:3000,reason:'Разбита лампа'}),e=>e.status===409);
  f.db.raw.prepare("UPDATE bookings SET status='completed' WHERE id=?").run(f.booking);
  await assert.rejects(f.guest.bookingAction(f.booking,{action:'keep_deposit',amount:3000,reason:'x'}),e=>e.status===403);
  await assert.rejects(f.owner.bookingAction(f.booking,{action:'keep_deposit',amount:10001,reason:'Разбита лампа'}));
  await assert.rejects(f.owner.bookingAction(f.booking,{action:'keep_deposit',amount:3000}));
  const r=await f.owner.bookingAction(f.booking,{action:'keep_deposit',amount:3000,reason:'Разбита лампа'});assert.match(r.message,/остаток: 7 000 ₸/);
  assert.match(note(f,'guest','guest:deposit-kept:%').body,/удержал из депозита.*3 000 ₸.*Разбита лампа.*7 000 ₸/);
  await assert.rejects(f.owner.bookingAction(f.booking,{action:'keep_deposit',amount:1000,reason:'Ещё'}),e=>e.status===409);
  const state=await f.owner.state();assert.equal(state.bookings[0].terms.deposit_balance,7000);assert.ok(!terms(f).deposit_returned_at);
  // Neither a hand-made entry nor the automatic settlement returns what was kept.
  const {recordFinance}=await load('finance');
  await assert.rejects(recordFinance(f.owner,{kind:'deposit_return',bookingId:f.booking,amount:10000,confirmed:true,note:'all',requestKey:'too-much'}),e=>e.status===409);
  await f.owner.bookingAction(f.booking,{action:'record_deposit_return',confirmed:true,expectedVersion:terms(f).version});
  assert.equal(f.db.raw.prepare("SELECT SUM(amount) n FROM finance_entries WHERE booking_id=? AND kind='deposit_return'").get(f.booking).n,7000);
  assert.ok(terms(f).deposit_returned_at);
 }finally{f.db.close();}
});
