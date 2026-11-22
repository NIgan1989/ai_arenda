import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,load} from './helpers/platform.mjs';
// GPT audit 2026-11-22 «Возвраты и споры» 1, 4, 5: after a refund the guest says it arrived or opens an appeal; both
// sides bring receipts after the cancellation; two accounts of one transfer meet in one appeal.
const {recordFinance}=await load('finance');
const {saveReceipt,listReceipts}=await load('payment-receipts');
const terms=f=>f.db.raw.prepare('SELECT * FROM booking_terms WHERE booking_id=?').get(f.booking);
const issues=f=>f.db.raw.prepare("SELECT * FROM administrator_issues WHERE entity_id=? AND status='open'").all(f.booking);
const jpeg='data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';
async function refunded(f){
 await recordFinance(f.owner,{kind:'payment',bookingId:f.booking,amount:4000,confirmed:true,note:'Оплата',requestKey:'p'});
 await f.owner.bookingAction(f.booking,{action:'cancel'});
 await f.owner.bookingAction(f.booking,{action:'record_refund',confirmed:true,expectedVersion:terms(f).version});
}
test('the guest confirms the refund in one tap',async()=>{
 const f=await fixture();try{
  await assert.rejects(f.guest.bookingAction(f.booking,{action:'refund_received'}),/ещё не отмечал возврат/);
  await refunded(f);
  await assert.rejects(f.owner.bookingAction(f.booking,{action:'refund_received'}),/может гость/);
  await f.guest.bookingAction(f.booking,{action:'refund_received'});
  assert.ok(terms(f).refund_confirmed_at);
  assert.ok(f.db.raw.prepare("SELECT 1 FROM notifications WHERE user_id=? AND body LIKE 'Гость подтвердил, что получил возврат 4 000 ₸%'").get(f.owner.userId));
 }finally{f.db.close();}
});
test('a refund that did not arrive opens an appeal on the cancelled booking, and the owner answer joins it',async()=>{
 const f=await fixture();try{
  await refunded(f);
  await f.guest.bookingAction(f.booking,{action:'refund_missing'});
  assert.equal(issues(f).length,1);assert.match(issues(f)[0].description,/не получил возврат 4 000 ₸/);
  await f.owner.bookingAction(f.booking,{action:'issue',issue:'Я вернул 4 000 ₸ на Kaspi, чек приложил.'});
  const open=issues(f);assert.equal(open.length,1,'one appeal for one transfer');
  assert.match(open[0].description,/Ответ второй стороны \(владелец/);
 }finally{f.db.close();}
});
test('after the cancellation the guest adds a payment receipt and the owner a refund receipt, kept apart',async()=>{
 const f=await fixture();try{
  await recordFinance(f.owner,{kind:'payment',bookingId:f.booking,amount:4000,confirmed:true,note:'Оплата',requestKey:'p'});
  await f.owner.bookingAction(f.booking,{action:'cancel'});
  await saveReceipt(f.guest,'guest',{bookingId:f.booking,data:jpeg});
  await assert.rejects(saveReceipt(f.owner,'owner',{bookingId:f.booking,data:jpeg}),/после отметки возврата/);
  await f.owner.bookingAction(f.booking,{action:'record_refund',confirmed:true,expectedVersion:terms(f).version});
  assert.match((await saveReceipt(f.owner,'owner',{bookingId:f.booking,data:jpeg})).message,/Чек возврата/);
  const kinds=(await listReceipts(f.guest,'booking',f.booking)).receipts.map(r=>r.kind).sort();
  assert.deepEqual(kinds,['payment','refund']);
 }finally{f.db.close();}
});
test('a second return after the guest confirmed the first asks the guest again',async()=>{
 const f=await fixture();try{
  await recordFinance(f.owner,{kind:'payment',bookingId:f.booking,amount:4000,confirmed:true,note:'Оплата',requestKey:'p'});
  await recordFinance(f.owner,{kind:'deposit',bookingId:f.booking,amount:10000,confirmed:true,note:'Депозит',requestKey:'d'});
  await f.owner.bookingAction(f.booking,{action:'cancel'});
  await f.owner.bookingAction(f.booking,{action:'record_refund',confirmed:true,expectedVersion:terms(f).version});
  await f.guest.bookingAction(f.booking,{action:'refund_received'});assert.ok(terms(f).refund_confirmed_at);
  await f.owner.bookingAction(f.booking,{action:'record_deposit_return',confirmed:true,expectedVersion:terms(f).version});
  assert.equal(terms(f).refund_confirmed_at,null);
 }finally{f.db.close();}
});
