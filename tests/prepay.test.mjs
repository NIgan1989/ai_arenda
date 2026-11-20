import {test} from 'node:test';import assert from 'node:assert/strict';
import {fixture,load,now,iso} from './helpers/platform.mjs';
const {prepayState,dueNow,payoutOpen,prepaySum,PREPAY_AFTER}=await load('prepay'),{policyInput}=await load('rental-policy');

// A place pays at the arrival until it has five completed stays; then the owner's prepayment share applies.
test('the share in force: at the arrival until five completed stays, then the owner\'s choice',()=>{
 assert.equal(PREPAY_AFTER,5);
 assert.deepEqual(prepayState(30,0),{wanted:30,percent:0,completed:0,left:5});
 assert.deepEqual(prepayState(30,4),{wanted:30,percent:0,completed:4,left:1});
 assert.deepEqual(prepayState(30,5),{wanted:30,percent:30,completed:5,left:0});
 assert.equal(prepayState(15,9).percent,0,'only the offered shares');
 assert.equal(prepaySum(10001,30),3001);assert.equal(prepaySum(10000,100),10000);
 const body={hourlyPrice:0,minHours:2,nightlyPrice:0,checkinTime:'14:00',checkoutTime:'12:00',deposit:0,houseRules:'x',cleaningFee:0,cleaningBudget:0};
 assert.equal(policyInput({...body,prepayPercent:20}).prepay_percent,20);
 assert.equal(policyInput(body).prepay_percent,undefined,'an older app keeps what is stored');
 assert.throws(()=>policyInput({...body,prepayPercent:40}),/предоплату/);
});

test('what is due now: the prepayment before the arrival, the rest and the deposit at it',()=>{
 const t=1_000_000,b={amount:10000,start:t+7200,terms:{prepay_percent:30,paid_amount:0,deposit:5000,deposit_status:'pending'}};
 assert.deepEqual(dueNow(b,t),{left:3000,deposit:0,sum:3000,reported:false,phase:'prepay'});
 assert.equal(payoutOpen(b,t),true);
 const paid={...b,terms:{...b.terms,paid_amount:3000}};
 assert.equal(dueNow(paid,t).sum,0);
 assert.deepEqual(dueNow(paid,t+7200-900),{left:7000,deposit:5000,sum:12000,reported:false,phase:'arrival'});
 const atDoor={...b,terms:{...b.terms,prepay_percent:0}};
 assert.equal(dueNow(atDoor,t).sum,0);assert.equal(payoutOpen(atDoor,t),false,'no details to pay to before the arrival');
 assert.equal(payoutOpen(atDoor,t+7200-900),true);
 assert.equal(payoutOpen({...atDoor,terms:{...atDoor.terms,early_checkin_at:t}},t),true,'the owner let the guest in earlier');
 const older={...b,terms:{...b.terms,prepay_percent:null}};
 assert.deepEqual(dueNow(older,t),{left:10000,deposit:5000,sum:15000,reported:false,phase:'arrival'});
});

test('a new place: the guest pays at the door, sees no details before it, and the stay is not released for it',async()=>{
 const f=await fixture(),R=f.db.raw;try{
  const {savePayout}=await load('payout');await savePayout(f.owner,{phone:'+7 701 123 45 67',recipient:'Дулат Н.'});
  await f.owner.savePolicy(f.property,{...f.policy,expectedVersion:1,prepayPercent:30});
  const start=now()+5*3600,quote=await f.guest.bookingQuote({propertyId:f.property,start:iso(start),end:iso(start+3*3600),guests:1,billingMode:'hourly'});
  assert.deepEqual(quote.payment,{prepayPercent:0,prepay:0,label:'Оплата при заселении',newPlace:true});
  const id=(await f.guest.createBooking({propertyId:f.property,start:iso(start),end:iso(start+3*3600),guests:1,billingMode:'hourly',requestKey:'door',acceptTerms:true,expectedPolicyVersion:quote.policy.version})).id;
  await f.owner.bookingAction(id,{action:'confirm',cleaningFee:3000});
  assert.equal(R.prepare('SELECT prepay_percent FROM booking_terms WHERE booking_id=?').get(id).prepay_percent,0);
  const mine=(await f.guest.roleState('guest',{catalog:false})).bookings.find(b=>b.id===id);
  assert.equal(mine.owner_pay,null,'the details open at the arrival');
  assert.ok((await f.owner.roleState('owner',{catalog:false})).bookings.find(b=>b.id===id).owner_pay,'the owner sees their own');
  await assert.rejects(f.guest.bookingAction(id,{action:'report_paid'}),e=>e.status===409&&/при заселении/.test(e.message));
  // The payment watch leaves it alone: nothing is due before the arrival.
  const {sweepStays}=await load('stay-watch');
  R.prepare('UPDATE bookings SET created_at=? WHERE id=?').run(now()-3*86400,id);
  assert.equal((await sweepStays(f.db,{})).released,0);
  assert.equal(R.prepare('SELECT status FROM bookings WHERE id=?').get(id).status,'confirmed');
  // At the door: the details open, «Я оплатил» covers the stay and the deposit.
  R.prepare('UPDATE booking_terms SET early_checkin_at=? WHERE booking_id=?').run(now()-60,id);
  assert.ok((await f.guest.roleState('guest',{catalog:false})).bookings.find(b=>b.id===id).owner_pay);
  assert.match((await f.guest.bookingAction(id,{action:'report_paid'})).message,/Владелец получил/);
  await f.owner.bookingAction(id,{action:'received'});
  assert.equal(R.prepare('SELECT payment_status FROM bookings WHERE id=?').get(id).payment_status,'owner_verified');
 }finally{f.db.close();}
});

test('after five completed stays the owner\'s prepayment applies: only that share is asked and recorded first',async()=>{
 const f=await fixture(),R=f.db.raw;try{
  await f.owner.savePolicy(f.property,{...f.policy,expectedVersion:1,prepayPercent:30});
  for(let i=0;i<5;i++){
   const id='done'+i,t=now()-(10+i)*86400;
   R.prepare("INSERT INTO bookings(id,property_id,guest_id,start,end,occupied_until,guests,amount,status,expires_at,payment_status,request_key,created_at) VALUES (?,?,?,?,?,?,1,4000,'completed',0,'owner_verified',?,?)").run(id,f.property,'guest',t,t+7200,t+7200,id,t);
   R.prepare("INSERT INTO booking_terms(booking_id,billing_mode,rate,units,amount,actual_checkin,actual_checkout,paid_amount) VALUES (?,'hourly',2000,2,4000,?,?,4000)").run(id,t,t+7200);
  }
  const start=now()+5*3600,body={propertyId:f.property,start:iso(start),end:iso(start+3*3600),guests:1,billingMode:'hourly'},quote=await f.guest.bookingQuote(body);
  assert.deepEqual(quote.payment,{prepayPercent:30,prepay:1800,label:'Предоплата 30%, остальное при заселении',newPlace:false});
  const id=(await f.guest.createBooking({...body,requestKey:'pre',acceptTerms:true})).id;await f.owner.bookingAction(id,{action:'confirm',cleaningFee:3000});
  const state=await f.owner.roleState('owner',{catalog:false});
  assert.deepEqual(state.ownProperties.find(p=>p.id===f.property).prepay,{wanted:30,percent:30,completed:5,left:0});
  await f.guest.bookingAction(id,{action:'report_paid'});
  assert.match(R.prepare("SELECT body FROM notifications WHERE user_id='owner' AND dedupe LIKE 'owner:paid-reported:"+id+"%'").get().body,/перевёл вам 1\s800 ₸/);
  await f.owner.bookingAction(id,{action:'received'});
  const t=R.prepare('SELECT paid_amount,deposit_status FROM booking_terms WHERE booking_id=?').get(id);
  assert.equal(t.paid_amount,1800);assert.equal(t.deposit_status,'pending','the deposit is paid at the arrival');
  assert.equal(R.prepare('SELECT payment_status FROM bookings WHERE id=?').get(id).payment_status,'unpaid');
  await assert.rejects(f.guest.bookingAction(id,{action:'report_paid'}),/Предоплата уже учтена/);
 }finally{f.db.close();}
});
