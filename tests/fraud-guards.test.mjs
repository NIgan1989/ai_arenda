import {test} from 'node:test';import assert from 'node:assert/strict';
import {fixture,load,now,iso} from './helpers/platform.mjs';
import {photo} from './fixtures/photo.mjs';
const {saveRightDoc,removeRightDoc,listRightDocs,readRightDoc}=await load('property-rights');
const {restrictAccount,restrictionsList,unlistPlace}=await load('account-restrictions');
const {chatGuard}=await load('chat-guard'),{openDiscussion,sendDiscussionMessage}=await load('process-discussions');
const {RentalService}=await load('service'),{LEGAL_DOCUMENTS,LEGAL_EDITION}=await load('legal-documents');

// «Право сдавать жильё»: only the owner attaches it; only the owner and the platform administrator see it.
test('the owner attaches the proof of the right to let; one kind per place, settled once approved',async()=>{
 const f=await fixture(),R=f.db.raw;try{
  R.prepare('DELETE FROM property_right_docs').run();
  await assert.rejects(saveRightDoc(f.guest,'guest',{propertyId:f.property,kind:'owner',data:photo}),e=>e.status===403);
  await assert.rejects(saveRightDoc(f.other,'owner',{propertyId:f.property,kind:'owner',data:photo}),e=>e.status===404);
  await assert.rejects(saveRightDoc(f.owner,'owner',{propertyId:f.property,kind:'tenant',data:photo}),/субаренду/);
  const first=await saveRightDoc(f.owner,'owner',{propertyId:f.property,kind:'owner',data:photo});
  assert.match(first.message,/только администратор/);
  await saveRightDoc(f.owner,'owner',{propertyId:f.property,kind:'owner',data:photo});
  assert.equal((await listRightDocs(f.owner,f.property)).docs.length,2);
  // Choosing the other kind starts the proof over.
  await saveRightDoc(f.owner,'owner',{propertyId:f.property,kind:'sublease',data:photo});
  const docs=(await listRightDocs(f.owner,f.property)).docs;
  assert.deepEqual(docs.map(d=>d.kind),['sublease']);
  await assert.rejects(listRightDocs(f.guest,f.property),e=>e.status===404);
  await assert.rejects(readRightDoc(f.other,docs[0].id),e=>e.status===404);
  assert.match((await readRightDoc(new RentalService(f.db,'admin'),docs[0].id,{},true)).data,/^data:image\/jpeg/,'the platform administrator sees it');
  await removeRightDoc(f.owner,'owner',{id:docs[0].id});
  assert.equal((await listRightDocs(f.owner,f.property)).docs.length,0);
  // Approved by a person: the proof stays as it was checked.
  await saveRightDoc(f.owner,'owner',{propertyId:f.property,kind:'owner',data:photo});
  const {adminApproveProperty}=await load('participant-security');await adminApproveProperty(new RentalService(f.db,'admin'),{propertyId:f.property});
  await assert.rejects(saveRightDoc(f.owner,'owner',{propertyId:f.property,kind:'owner',data:photo}),e=>e.status===409);
 }finally{f.db.close();}
});

// «Меня не заселили»: at the door the guest raises it; the owner's places leave the map and take no new bookings at once.
test('«Меня не заселили» puts the owner on hold at once; the administrator lifts it or blocks the account',async()=>{
 const f=await fixture(),R=f.db.raw;try{
  // Another guest with an unpaid booking of the same owner is told not to pay in advance.
  const start=now()+2*86400,later=(await f.guest.createBooking({propertyId:f.property,start:iso(start),end:iso(start+3*3600),guests:1,billingMode:'hourly',requestKey:'later',acceptTerms:true})).id;
  R.prepare("UPDATE bookings SET guest_id='other' WHERE id=?").run(later);
  // Before the arrival opens: not yet.
  R.prepare('UPDATE bookings SET start=?,end=? WHERE id=?').run(now()+3600,now()+7200,f.booking);
  await assert.rejects(f.guest.bookingAction(f.booking,{action:'not_let_in'}),e=>e.status===409&&/15 минут/.test(e.message));
  await assert.rejects(f.owner.bookingAction(f.booking,{action:'not_let_in'}),e=>e.status===403);
  R.prepare('UPDATE bookings SET start=?,end=? WHERE id=?').run(now()-300,now()+7200,f.booking);
  const r=await f.guest.bookingAction(f.booking,{action:'not_let_in',text:'Дверь никто не открывает'});
  assert.match(r.message,/скрыты/);
  assert.equal(R.prepare('SELECT kind FROM account_restrictions WHERE user_id=?').get('owner').kind,'hold');
  assert.ok(R.prepare("SELECT 1 FROM administrator_issues WHERE entity_id=? AND description LIKE 'Меня не заселили%'").get(f.booking),'an urgent issue for the administrator');
  assert.match(R.prepare("SELECT body FROM notifications WHERE user_id='other' AND dedupe LIKE 'guest:owner-hold:%'").get().body,/не переводите деньги заранее/);
  // In dispute: the stay watch never settles it as the guest's no-show, even after its end.
  const {sweepStays}=await load('stay-watch');R.prepare('UPDATE bookings SET end=? WHERE id=?').run(now()-60,f.booking);
  await sweepStays(f.db,{});assert.equal(R.prepare('SELECT status FROM bookings WHERE id=?').get(f.booking).status,'confirmed');
  // Hidden from the map and no new bookings.
  const catalog=await f.guest.roleState('guest',{catalog:true});
  assert.ok(!catalog.properties.some(p=>p.id===f.property),'the place left the map');
  const s2=now()+3*86400;
  await assert.rejects(f.guest.bookingQuote({propertyId:f.property,start:iso(s2),end:iso(s2+3*3600),guests:1,billingMode:'hourly'}),e=>e.status===409&&/временно не принимает/.test(e.message));
  // The owner on hold still works inside their account (answers in the issue), but cannot lift it.
  await f.owner.roleState('owner',{catalog:false});
  await assert.rejects(restrictAccount(f.owner,{userId:'owner',action:'lift',reason:'x'},false),e=>e.status===403);
  const admin=new RentalService(f.db,'admin');
  assert.equal((await restrictionsList(admin,true)).restrictions[0].kind,'hold');
  await assert.rejects(restrictAccount(admin,{userId:'owner',action:'lift'},true),/Основание/);
  assert.match((await restrictAccount(admin,{userId:'owner',action:'lift',reason:'Гость заселён, недоразумение'},true)).message,/Пауза снята/);
  assert.ok((await f.guest.roleState('guest',{catalog:true})).properties.some(p=>p.id===f.property),'back on the map');
  // Blocked: every session ends, nothing works in the account.
  assert.match((await restrictAccount(admin,{userId:'owner',action:'block',reason:'Подложные документы'},true)).message,/заблокирован/);
  await assert.rejects(f.owner.roleState('owner',{catalog:false}),e=>e.status===403&&/заблокирован/.test(e.message));
  assert.ok(R.prepare("SELECT 1 FROM audit_events WHERE action LIKE '%account.blocked%'").get());
  await assert.rejects(restrictAccount(admin,{userId:'admin',action:'block',reason:'x'},true),e=>e.status===409||e.status===404);
 }finally{f.db.close();}
});

test('«Снять с показа»: the place leaves the map and comes back only after a new check',async()=>{
 const f=await fixture(),R=f.db.raw;try{
  const admin=new RentalService(f.db,'admin');
  await assert.rejects(unlistPlace(f.owner,{propertyId:f.property,reason:'x'},false),e=>e.status===403);
  assert.match((await unlistPlace(admin,{propertyId:f.property,reason:'Фото не совпадают с жильём'},true)).message,/снято с показа/);
  assert.equal(R.prepare('SELECT published FROM properties WHERE id=?').get(f.property).published,0);
  assert.equal(R.prepare('SELECT owner_reviewed FROM pilot_property_admissions WHERE id=?').get(f.property).owner_reviewed,0);
  assert.match(R.prepare("SELECT body FROM notifications WHERE user_id='owner' AND dedupe LIKE 'owner:unlisted:%'").get().body,/Фото не совпадают/);
 }finally{f.db.close();}
});

// The chat between a guest and an owner carries no links, no card numbers, and no phone before the confirmation.
test('the chat guard: links and cards never, a phone a day before the check-in, never with a transfer',()=>{
 const before={phoneOpen:false},after={phoneOpen:true};
 for(const text of ['Оплатите тут https://pay.example','Сайт kaspi-pay.site','Пишите t.me/owner','www.example.kz'])assert.equal(chatGuard(text,after).ok,false,text);
 assert.equal(chatGuard('Карта 4400 4301 2345 6789',after).ok,false);
 assert.equal(chatGuard('Мой номер +7 701 123 45 67',before).ok,false);
 assert.equal(chatGuard('Мой номер +7 701 123 45 67',after).ok,true,'contacts once the phone opens');
 // A deal taken out of the service: messengers, a @nick and a number with every digit apart wait for the phone too.
 for(const text of ['Пишите в WhatsApp','Мой ватсап, там договоримся','Телеграм @owner_kz','Номер 8 7 0 1 1 2 3 4 5 6 7','8.701.123.45.67'])assert.equal(chatGuard(text,before).ok,false,text);
 for(const text of ['Пишите в WhatsApp','Телеграм @owner_kz'])assert.equal(chatGuard(text,after).ok,true,text);
 for(const text of ['Заезд 22.11.2026 в 14:00','С 10 00 до 12 00 уберём'])assert.equal(chatGuard(text,before).ok,true,text);
 assert.equal(chatGuard('Переведите предоплату на 8 701 123 45 67',after).ok,false);
 for(const text of ['Заезд после 14:00, код домофона 1234','Буду в 19:30, нас двое','Стоимость 15 000 ₸, депозит 5 000 ₸'])assert.equal(chatGuard(text,before).ok,true,text);
});
test('the chat refuses a link from the owner and a phone before the booking is confirmed',async()=>{
 const f=await fixture(),R=f.db.raw;try{
  const room=await openDiscussion(f.guest,'guest',{kind:'booking',entityId:f.booking});
  await assert.rejects(sendDiscussionMessage(f.owner,'owner',{...room,text:'Оплатите по ссылке https://pay.example',requestKey:'l'}),e=>e.status===422&&/Ссылки/.test(e.message));
  await assert.rejects(sendDiscussionMessage(f.owner,'owner',{...room,text:'Переведите аванс на Kaspi +7 701 123 45 67',requestKey:'k'}),/только в карточке брони/);
  // A confirmed booking far ahead: the phone is not open yet, a day before the check-in it is.
  R.prepare('UPDATE bookings SET start=?,end=?+7200,occupied_until=?+14400 WHERE id=?').run(now()+3*86400,now()+3*86400,now()+3*86400,f.booking);
  await assert.rejects(sendDiscussionMessage(f.owner,'owner',{...room,text:'Позвоните мне: +7 701 123 45 67',requestKey:'p0'}),/за сутки до заезда/);
  R.prepare('UPDATE bookings SET start=?,end=?+7200,occupied_until=?+14400 WHERE id=?').run(now()+3600,now()+3600,now()+3600,f.booking);
  await sendDiscussionMessage(f.owner,'owner',{...room,text:'Позвоните мне: +7 701 123 45 67',requestKey:'p'});
  R.prepare("UPDATE bookings SET status='requested' WHERE id=?").run(f.booking);
  await assert.rejects(sendDiscussionMessage(f.guest,'guest',{...room,text:'Мой номер 87011234567',requestKey:'g'}),/за сутки до заезда/);
 }finally{f.db.close();}
});

test('the offers tell every role the new rules, in a new edition everyone accepts again',()=>{
 assert.equal(LEGAL_EDITION,'24 ноября 2026');
 const text=id=>LEGAL_DOCUMENTS.find(d=>d.id===id).sections.flatMap(s=>s.p).join(' ');
 assert.match(text('terms'),/Меня не заселили/);assert.match(text('terms'),/ссылки, номера банковских карт/);
 assert.match(text('guest'),/меньше 5 завершённых броней/);assert.match(text('guest'),/Оплата при заселении/);
 assert.match(text('owner'),/нотариально удостоверенное согласие собственника/);assert.match(text('owner'),/сотрудник Оператора, а не ИИ-администратор/);assert.match(text('owner'),/включается сама после 5-й/);
 assert.match(text('cleaner'),/не берёт с исполнителя предоплату/);
 assert.match(text('privacy'),/документа о праве сдавать жильё/);
});
test('photos replaced by the other kind and settled after the check leave the object storage',async()=>{
 const f=await fixture(),R=f.db.raw;try{
  R.prepare('DELETE FROM property_right_docs').run();
  const stored=new Map(),BUCKET={put:async(k,v)=>{stored.set(k,v);},delete:async k=>{stored.delete(k);},get:async k=>stored.has(k)?{arrayBuffer:async()=>stored.get(k).buffer}:null};
  await saveRightDoc(f.owner,'owner',{propertyId:f.property,kind:'owner',data:photo},{BUCKET});
  await saveRightDoc(f.owner,'owner',{propertyId:f.property,kind:'sublease',data:photo},{BUCKET});
  assert.equal(stored.size,1,'the replaced kind is deleted');
  const {settleRightDocs}=await load('property-rights');await settleRightDocs(f.db,f.property,'admin',{BUCKET});
  assert.equal(stored.size,0,'nothing stays after the check');
 }finally{f.db.close();}
});
