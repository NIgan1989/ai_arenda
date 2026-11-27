import {test} from 'node:test';import assert from 'node:assert/strict';
import {fixture,now,iso,load} from './helpers/platform.mjs';
const {assignStaff}=await load('staff'),{sweepReadyBefore}=await load('bath-prep'),{planAdministrator}=await load('administrator'),{askForReviews,saveStayReview}=await load('stay-reviews');

// A bath and a hall are not lived in: their messages say «бронь», «приход», «отдых» (lib/stay-words.ts), and with their
// own staff the owner and the person on shift are reminded to mark the place ready before the next guests.
const listing=()=>({title:'Баня на дровах',city:'Павлодар',district:'Центр',address:'PRIVATE BATH ADDRESS',description:'Баня на дровах с парилкой и купелью, комната отдыха на шесть человек, мангал во дворе, парковка у ворот.',price:36000,rooms:1,capacity:8,cleaningMinutes:60,photos:[],published:false,expectedVersion:0,policyVersion:0,
 details:{type:'banya',area:40,beds:1,bathrooms:1,floor:1,floors:1,checkinMethod:'meet',amenities:['steam'],pets:false,smoking:false,parties:false},
 rental:{hourlyPrice:3000,minHours:2,nightlyPrice:0,checkinTime:'14:00',checkoutTime:'12:00',deposit:0,houseRules:'Тишина после 23:00.',includedGuests:4,extraGuestPrice:500,prepMinutes:0}});
const account=(f,id,phone,name)=>f.db.raw.prepare('INSERT INTO auth_accounts(id,phone,name,password_hash,recovery_hash,created_at) VALUES (?,?,?,?,?,?)').run(id,phone,name,'fixture','fixture',now());
async function bath(f){const id=(await f.owner.saveListing(null,listing())).id;f.db.raw.prepare('UPDATE properties SET published=1,own_staff=1 WHERE id=?').run(id);account(f,'cleaner','+77010000003','Айдар Сотрудник');f.db.raw.prepare("UPDATE bookings SET status='cancelled' WHERE id=?").run(f.booking);return id;}
const notes=(f,user,like)=>f.db.raw.prepare('SELECT body FROM notifications WHERE user_id=? AND dedupe LIKE ?').all(user,like).map(r=>r.body);

test('a bath with its own staff: the owner and the person on shift are reminded an hour before the next guests',async()=>{
 const f=await fixture();try{
  const id=await bath(f);await assignStaff(f.owner,{propertyId:id,phone:'+77010000003'});
  const start=Math.ceil((now()+7200)/3600)*3600;
  const booking=(await f.guest.createBooking({propertyId:id,start:iso(start),end:iso(start+3*3600),guests:4,billingMode:'hourly',requestKey:'ready-before',acceptTerms:true})).id;
  await f.owner.bookingAction(booking,{action:'confirm'});
  f.db.raw.prepare("UPDATE property_operations SET readiness='awaiting_cleaning' WHERE property_id=?").run(id);
  // Too early: nothing yet.
  assert.equal((await sweepReadyBefore(f.db,start-2*3600)).reminded,0);
  assert.equal((await sweepReadyBefore(f.db,start-3000)).reminded,1);
  const [owner]=notes(f,'owner','owner:ready-before:%'),[staff]=notes(f,'cleaner','staff:ready-before:%');
  assert.match(owner,/следующие гости в \d\d:\d\d/);assert.match(owner,/«Баня готова»/);assert.equal(staff,owner);
  // Once for this start time.
  assert.equal((await sweepReadyBefore(f.db,start-600)).reminded,0);
  // Marked ready: no reminder for a moved start either.
  f.db.raw.prepare("UPDATE property_operations SET readiness='ready' WHERE property_id=?").run(id);
  f.db.raw.prepare('UPDATE bookings SET start=start+600 WHERE id=?').run(booking);
  assert.equal((await sweepReadyBefore(f.db,start-300)).reminded,0);
 }finally{f.db.close();}
});

test('a bath booking speaks of «бронь» and «приход», not of «проживание» and «заезд»',async()=>{
 const f=await fixture();try{
  const id=await bath(f);
  const start=Math.ceil((now()+7200)/3600)*3600;
  const booking=(await f.guest.createBooking({propertyId:id,start:iso(start),end:iso(start+3*3600),guests:4,billingMode:'hourly',requestKey:'words',acceptTerms:true})).id;
  await f.owner.bookingAction(booking,{action:'confirm'});
  const confirmed=notes(f,'guest','guest:confirmed:'+booking).join(' ');
  assert.match(confirmed,/подтверждена/);assert.doesNotMatch(confirmed,/проживан|заезд/);
  // The guest's own tasks.
  const b={id:booking,property_id:id,guest_id:'guest',status:'confirmed',start:now()+600,end:now()+7200,payment_status:'pending',property_type:'banya',terms:{}};
  const titles=planAdministrator({ownerId:'owner',properties:[{id,title:'Баня на дровах',readiness:'ready',own_staff:1}],bookings:[b],jobs:[],settings:{}},now()).filter(t=>t.role==='guest').map(t=>t.title+' · '+t.reason).join(' | ');
  assert.match(titles,/Оплатить бронь/);assert.match(titles,/Отметить приход/);assert.doesNotMatch(titles,/проживан|Заселиться|заезд/);
  // «Я на месте» before paying.
  f.db.raw.prepare('UPDATE bookings SET start=?,"end"=? WHERE id=?').run(now()+300,now()+3*3600,booking);
  const said=await f.guest.bookingAction(booking,{action:'report_checkin'});
  assert.match(said.message,/перевести владельцу оплату/);assert.match(said.message,/приход подтвердится/);
  // After the stay: the request to rate and the owner's note.
  f.db.raw.prepare("UPDATE bookings SET status='completed' WHERE id=?").run(booking);
  f.db.raw.prepare('UPDATE booking_terms SET actual_checkin=?,actual_checkout=? WHERE booking_id=?').run(now()-7200,now()-3700,booking);
  await askForReviews(f.owner);
  const ask=notes(f,'guest','%review-request:'+booking).join(' ');assert.match(ask,/как всё прошло в «Баня · на дровах»/);
  await saveStayReview(f.guest,{bookingId:booking,rating:5,text:''});
  assert.match(notes(f,'owner','owner:stay-review:'+booking).join(' '),/Гость оценил отдых/);
 }finally{f.db.close();}
});
