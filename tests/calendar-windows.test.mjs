import {test} from 'node:test';import assert from 'node:assert/strict';import {fixture,load,now} from './helpers/platform.mjs';
const {findWindow,windowPercent,windowPrice,offerCalendarWindows,WINDOW_PAUSE}=await load('calendar-windows');
const {pushPayload}=await load('web-push');
const H=3600,iso=t=>new Date(t*1000).toISOString();

test('a short gap between stays is a window; a free day is not',()=>{
 const t=Date.UTC(2026,10,12,6)/1000; // 11:00 in Almaty, on the hour
 // Out at 12:00 plus 90 minutes of cleaning, next guest at 21:00: sell 14:00–19:00 (cleaning before the next guest).
 const w=findWindow([[t-20*H,t+2.5*H],[t+10*H,t+30*H]],t,90,2);
 assert.deepEqual(w,{start:t+3*H,end:t+8*H});
 assert.equal(findWindow([[t-20*H,t+H],[t+2*H,t+30*H]],t,90,2),null,'an hour between stays is too short');
 assert.equal(findWindow([[t-20*H,t+H],[t+40*H,t+60*H]],t,90,2),null,'a whole free day is not a window');
 assert.equal(findWindow([],t,90,2),null);
 // Long gaps are cut to 12 hours.
 const long=findWindow([[t-5*H,t+H],[t+16*H,t+30*H]],t,0,2);assert.equal(long.end-long.start,12*H);
 assert.equal(windowPercent(3*H),20);assert.equal(windowPercent(10*H),15);
 assert.equal(windowPrice(2000,20),1600);assert.equal(windowPrice(2000,20,1800),1800,'never below the owner\'s minimum rate');
});

async function gap(f){
 f.db.raw.prepare('UPDATE properties SET published=1').run();
 const t=now(),start=Math.ceil((t+13*H)/H)*H;
 const second=(await f.guest.createBooking({propertyId:f.property,start:iso(start),end:iso(start+6*H),guests:1,billingMode:'hourly',requestKey:'second',acceptTerms:true})).id;
 await f.owner.bookingAction(second,{action:'confirm',cleaningFee:0});
 return {t,next:start};
}

test('the AI suggests an empty window, guests get the discount only after the owner opens it',async()=>{
 const f=await fixture();try{
  const {t,next}=await gap(f);
  assert.equal(await offerCalendarWindows(f.db,'owner',t),1);
  const w=f.db.raw.prepare('SELECT * FROM calendar_windows').get();
  assert.equal(w.status,'suggested');assert.ok(w.end<=next-90*60,'cleaning fits before the next guest');assert.ok(w.end-w.start>=2*H);
  assert.equal(w.hourly_from,2000);assert.ok(w.hourly_to<2000);
  const note=f.db.raw.prepare('SELECT * FROM notifications WHERE dedupe=?').get('owner:window:'+w.id);assert.match(note.body,/Без вашего согласия/);
  const push=JSON.parse(pushPayload('owner',false,false,null,{...w,title:'Test apartment'}));assert.equal(push.kind,'window');assert.equal(push.decision.id,'window:'+w.id);assert.equal(push.decision.accept,'Открыть окно');
  // One question at a time.
  assert.equal(await offerCalendarWindows(f.db,'owner',t+60),0);
  // Not open yet: the guest pays the usual hourly price.
  const inside={propertyId:f.property,start:iso(w.start),end:iso(w.start+2*H),guests:1,billingMode:'hourly'};
  assert.equal((await f.guest.bookingQuote(inside)).price,2000);
  const state=await f.owner.roleState('owner'),card=state.approvals.find(c=>c.kind==='window');
  assert.ok(card&&card.window.to===w.hourly_to);assert.equal((await f.other.roleState('owner')).approvals.some(c=>c.kind==='window'),false);
  await assert.rejects(f.owner.decideApproval('owner',{id:card.id,revision:'stale',action:'accept'}),e=>e.status===409);
  const r=await f.owner.decideApproval('owner',{id:card.id,revision:card.revision,action:'accept'});assert.match(r.message,/Окно открыто/);
  const quote=await f.guest.bookingQuote(inside);assert.equal(quote.price,w.hourly_to);assert.equal(quote.amount,2*w.hourly_to);assert.ok(quote.window.percent>=15);
  // A stay that does not fit the window keeps the usual price; daily stays are untouched.
  assert.equal((await f.guest.bookingQuote({...inside,start:iso(next+9*H),end:iso(next+11*H)})).price,2000);
  // The catalog shows the discounted price and the badge.
  const search=await f.guest.publicSearch({mode:'hourly',start:iso(w.start),end:iso(w.start+2*H)});
  assert.equal(search.properties.find(p=>p.id===f.property).estimate.rate,w.hourly_to);
  const browse=await f.guest.publicSearch({mode:'hourly'});assert.equal(browse.properties.find(p=>p.id===f.property).window.end,w.end);
  // A booking at the window price goes through.
  const booked=await f.guest.createBooking({...inside,requestKey:'window',acceptTerms:true});
  assert.equal(f.db.raw.prepare('SELECT amount FROM bookings WHERE id=?').get(booked.id).amount,2*w.hourly_to);
 }finally{f.db.close();}
});

test('"Не надо" keeps prices and pauses the next question; a window that started expires',async()=>{
 const f=await fixture();try{
  const {t}=await gap(f);await offerCalendarWindows(f.db,'owner',t);
  const card=(await f.owner.roleState('owner')).approvals.find(c=>c.kind==='window');
  await f.owner.decideApproval('owner',{id:card.id,revision:card.revision,action:'reject'});
  assert.equal(f.db.raw.prepare('SELECT status FROM calendar_windows').get().status,'declined');
  f.db.raw.prepare('DELETE FROM calendar_windows').run();
  f.db.raw.prepare("INSERT INTO calendar_windows(id,property_id,owner_id,start,end,percent,hourly_from,hourly_to,status,created_at) VALUES ('old',?,'owner',?,?,15,2000,1700,'suggested',?)").run(f.property,t+600,t+4*H,t-WINDOW_PAUSE-60);
  assert.equal((await f.owner.roleState('owner')).approvals.some(c=>c.kind==='window'),false,'too late to decide');
  assert.equal(f.db.raw.prepare("SELECT status FROM calendar_windows WHERE id='old'").get().status,'expired');
 }finally{f.db.close();}
});
