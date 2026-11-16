import {test} from 'node:test';import assert from 'node:assert/strict';import {fixture,load,now} from './helpers/platform.mjs';import {photo} from './fixtures/photo.mjs';
const {saveStayPhoto,listStayPhotos,readStayPhoto,saveHandover,handoverState,HANDOVER_WINDOW}=await load('stay-handover');

const checkout=async f=>{f.db.raw.prepare('UPDATE bookings SET start=?,end=?,occupied_until=? WHERE id=?').run(now()-7200,now()-3700,now()-1000,f.booking);await f.owner.bookingAction(f.booking,{action:'checkout'});};
const note=(f,user,key)=>f.db.raw.prepare('SELECT body FROM notifications WHERE user_id=? AND dedupe=?').get(user,key)?.body;

test('the guest photographs the home after moving in; only this guest and this owner see the photos',async()=>{
 const f=await fixture();try{
  await assert.rejects(saveStayPhoto(f.guest,'guest',{bookingId:f.booking,data:photo}),/когда вы заселились/);
  f.db.raw.prepare('UPDATE booking_terms SET checkin_reported_at=? WHERE booking_id=?').run(now(),f.booking);
  const saved=await saveStayPhoto(f.guest,'guest',{bookingId:f.booking,data:photo});assert.match(saved.message,/только вы и владелец/);
  assert.equal((await listStayPhotos(f.owner,f.booking)).photos[0].phase,'checkin');
  assert.match((await readStayPhoto(f.owner,saved.id)).data,/^data:image\/jpeg/);
  await assert.rejects(readStayPhoto(f.other,saved.id),/недоступна/);
  await assert.rejects(listStayPhotos(f.cleaner,f.booking),/не найдена/);
  // The owner cannot add photos to the guest's check-in, and nobody adds more than eight.
  await assert.rejects(saveStayPhoto(f.owner,'owner',{bookingId:f.booking,data:photo}),/двух суток после выезда/);
  for(let i=1;i<8;i++)await saveStayPhoto(f.guest,'guest',{bookingId:f.booking,data:photo});
  await assert.rejects(saveStayPhoto(f.guest,'guest',{bookingId:f.booking,data:photo}),/максимум фото: 8/);
  const state=await f.guest.roleState('guest',{catalog:false});assert.equal(state.bookings.find(b=>b.id===f.booking).checkin_photos,8);
  await checkout(f);
  await assert.rejects(saveStayPhoto(f.guest,'guest',{bookingId:f.booking,data:photo}),/до выезда/);
 }finally{f.db.close();}
});

test('after checkout the owner hands the home over once: issues need a photo or a word, the guest is told',async()=>{
 const f=await fixture();try{
  await assert.rejects(saveHandover(f.owner,{bookingId:f.booking,verdict:'ok'}),/двух суток после выезда/);
  await checkout(f);
  assert.match(note(f,'owner','owner:handover-ask:'+f.booking),/Как он оставил жильё/);
  let b=(await f.owner.roleState('owner',{catalog:false})).bookings.find(b=>b.id===f.booking);
  assert.equal(handoverState(b,now()),'ask');assert.equal(b.handover,null);
  await assert.rejects(saveHandover(f.guest,{bookingId:f.booking,verdict:'ok'}));
  await assert.rejects(saveHandover(f.other,{bookingId:f.booking,verdict:'ok'}),/не найдена/);
  await assert.rejects(saveHandover(f.owner,{bookingId:f.booking,verdict:'issues',issues:[]}),/что было не так/);
  await assert.rejects(saveHandover(f.owner,{bookingId:f.booking,verdict:'issues',issues:['rude']}),/Неизвестное/);
  await assert.rejects(saveHandover(f.owner,{bookingId:f.booking,verdict:'issues',issues:['smoking']}),/Добавьте фото или коротко опишите/);
  await saveStayPhoto(f.owner,'owner',{bookingId:f.booking,data:photo});
  const r=await saveHandover(f.owner,{bookingId:f.booking,verdict:'issues',issues:['smoking','damage'],note:'Прожжён диван'});assert.match(r.message,/переданы гостю/);
  await assert.rejects(saveHandover(f.owner,{bookingId:f.booking,verdict:'ok'}),/уже отмечена/);
  await assert.rejects(saveStayPhoto(f.owner,'owner',{bookingId:f.booking,data:photo}),/пока приёмка не отмечена/);
  assert.match(note(f,'guest','guest:handover:'+f.booking),/владелец отметил: курение, поломка или порча\. «Прожжён диван»\. Если не согласны, нажмите «Есть проблема»/);
  assert.equal(f.db.raw.prepare('SELECT read FROM notifications WHERE user_id=? AND dedupe=?').get('owner','owner:handover-ask:'+f.booking).read,1);
  const seen=(await f.guest.roleState('guest',{catalog:false})).bookings.find(b=>b.id===f.booking);
  assert.deepEqual(seen.handover.issues,['smoking','damage']);assert.equal(seen.handover.note,'Прожжён диван');assert.equal(handoverState(seen,now()),'done');
 }finally{f.db.close();}
});

test('«Всё хорошо» thanks the guest; after two days without a handover the stay reads as without issues',async()=>{
 const f=await fixture();try{
  await checkout(f);
  await saveHandover(f.owner,{bookingId:f.booking,verdict:'ok',note:'не сохраняется'});
  assert.match(note(f,'guest','guest:handover:'+f.booking),/замечаний нет/);
  assert.equal(f.db.raw.prepare('SELECT note FROM stay_handovers WHERE booking_id=?').get(f.booking).note,'');
  const t=now();
  assert.equal(handoverState({status:'completed',terms:{actual_checkout:t-HANDOVER_WINDOW-1}},t),'silent');
  assert.equal(handoverState({status:'confirmed',terms:{}},t),null);
 }finally{f.db.close();}
});
