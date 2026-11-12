import {test} from 'node:test';import assert from 'node:assert/strict';import {fixture,load,now} from './helpers/platform.mjs';
const {saveStayReview}=await load('stay-reviews'),{checkAdministratorOwner}=await load('administrator-runtime');

test('an hour after checkout the AI asks the guest once to rate the stay; the rating reaches the owner and the flat card',async()=>{
 const f=await fixture();try{
  await assert.rejects(saveStayReview(f.guest,{bookingId:f.booking,rating:5}),/после выезда/);
  f.db.raw.prepare('UPDATE bookings SET start=?,end=?,occupied_until=? WHERE id=?').run(now()-7200,now()-3700,now()-1000,f.booking);
  await f.owner.bookingAction(f.booking,{action:'checkout'});
  f.release();await checkAdministratorOwner(f.db,'owner');
  const asked=()=>f.db.raw.prepare("SELECT COUNT(*) n FROM notifications WHERE user_id='guest' AND dedupe=?").get('guest:review-request:'+f.booking).n;
  assert.equal(asked(),0,'not right after checkout');
  f.db.raw.prepare('UPDATE booking_terms SET actual_checkout=actual_checkout-3700 WHERE booking_id=?').run(f.booking);
  f.release();await checkAdministratorOwner(f.db,'owner');f.release();await checkAdministratorOwner(f.db,'owner');assert.equal(asked(),1,'asked once');
  await assert.rejects(saveStayReview(f.guest,{bookingId:f.booking,rating:6}));
  await assert.rejects(saveStayReview(f.other,{bookingId:f.booking,rating:5}));
  const r=await saveStayReview(f.guest,{bookingId:f.booking,rating:4,text:'Чисто и тихо'});assert.match(r.message,/Спасибо/);
  await assert.rejects(saveStayReview(f.guest,{bookingId:f.booking,rating:5}),/уже оценили/);
  assert.match(f.db.raw.prepare("SELECT body FROM notifications WHERE user_id='owner' AND dedupe=?").get('owner:stay-review:'+f.booking).body,/★★★★☆ «Чисто и тихо»/);
  const state=await f.guest.roleState('guest',{catalog:true});
  assert.deepEqual(state.properties.find(p=>p.id===f.property).rating,{average:4,count:1});
  assert.equal(state.bookings.find(b=>b.id===f.booking).review_rating,4);
 }finally{f.db.close();}
});
