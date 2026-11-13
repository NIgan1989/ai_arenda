import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {load} from './helpers/platform.mjs';
const {guestTrips,guestTripsLabel,guestSteps,guestStep}=await load('guest-trips');
const now=1_800_000_000,hour=3600,day=86400,me='guest-1';
const booking=(id,patch={})=>({id,guest_id:me,title:'Жильё '+id,status:'confirmed',start:now+day,end:now+2*day,amount:20000,payment_status:'pending',terms:{paid_amount:0,deposit:0,version:1},...patch});
const state=bookings=>({user:{id:me},bookings});

test('what is ahead comes first, the nearest on top; past stays follow, the latest first',()=>{
 const trips=guestTrips(state([
  booking('later',{start:now+5*day,end:now+6*day}),
  booking('old',{status:'completed',start:now-9*day,end:now-8*day,review_rating:5}),
  booking('soon'),
  booking('recent',{status:'completed',start:now-3*day,end:now-2*day}),
  booking('asked',{status:'requested',start:now+3*day,end:now+4*day,expires_at:now+hour}),
  booking('other',{guest_id:'someone-else'}),
 ]),now);
 assert.deepEqual(trips.map(t=>t.id),['soon','asked','later','recent','old']);
 assert.deepEqual(trips.map(t=>t.open),[true,true,true,false,false]);
 assert.equal(guestTripsLabel(trips),'Мои брони · 3');
 assert.equal(guestTripsLabel(trips.filter(t=>!t.open)),'Мои брони');
 assert.deepEqual(guestTrips(null,now),[]);
});

test('a row says what the booking waits for, in the guest\'s words',()=>{
 const said=patch=>guestTrips(state([booking('b',patch)]),now)[0].status;
 assert.equal(said({status:'requested',expires_at:now+60}),'Ждём ответа владельца');
 assert.equal(said({status:'requested',expires_at:now-60}),'Срок заявки истёк');
 assert.equal(said({}),'Ждёт оплаты');
 assert.equal(said({payment_status:'owner_verified',terms:{deposit:5000,deposit_status:'pending'}}),'Ждёт депозита');
 assert.equal(said({payment_status:'owner_verified'}),'Оплачено');
 assert.equal(said({payment_status:'owner_verified',start:now-hour}),'Время заезда наступило');
 assert.equal(said({start:now-hour,terms:{actual_checkin:now-hour}}),'Вы заселены');
 assert.equal(said({start:now-2*day,end:now-hour}),'Сообщите о выезде');
 assert.equal(said({start:now-2*day,end:now-hour,terms:{checkout_reported_at:now-60}}),'Выезд на проверке');
 assert.equal(said({status:'completed',start:now-2*day,end:now-day}),'Оцените проживание');
 assert.equal(said({status:'completed',start:now-2*day,end:now-day,review_rating:4}),'Проживание завершено');
 assert.equal(said({status:'cancelled'}),'Бронь отменена');
});

test('the steps of a booking keep their order; the map offers the first one that can be taken now',()=>{
 const ids=(b,mode='test')=>guestSteps(b,now,mode).map(s=>s.id);
 assert.deepEqual(ids(booking('b',{terms:{paid_amount:0,deposit:5000,deposit_status:'pending'}})),['pay','deposit','checkin']);
 // Without the test payment the owner marks the money: the guest has nothing to pay here.
 assert.deepEqual(ids(booking('b'),'manual'),['checkin']);
 const early=guestSteps(booking('b',{payment_status:'owner_verified',terms:{paid_amount:20000}}),now,'test');
 assert.equal(early[0].id,'checkin');assert.equal(early[0].disabled,true);assert.match(early[0].note,/за 15 минут до заезда/);
 assert.equal(guestStep(booking('b',{payment_status:'owner_verified',terms:{paid_amount:20000}}),now,'test'),null);
 assert.equal(guestStep(booking('b'),now,'test').label,'Оплатить 20 000 ₸');
 assert.equal(guestStep(booking('b',{start:now-60,terms:{paid_amount:20000}}),now,'test').id,'checkin');
 assert.deepEqual(ids(booking('b',{start:now-hour,terms:{paid_amount:20000,actual_checkin:now-hour}})),['checkout']);
 assert.deepEqual(ids(booking('b',{status:'completed'})),['review']);
 assert.deepEqual(ids(booking('b',{status:'completed',review_rating:5})),[]);
 assert.deepEqual(ids(booking('b',{status:'requested'})),[]);
 assert.equal(guestStep(null,now,'test'),null);
});

test('the guest reaches bookings and results from the sheet of the map, not from separate pages',()=>{
 const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
 const intro=read('components/public-search-intro.tsx'),map=read('components/smart-guest-map.tsx'),role=read('components/map-workspace.tsx'),menu=read('components/account-control.tsx'),chat=read('app/chat.tsx'),appMenu=read('mobile/src/AccountControl.tsx'),appMap=read('mobile/src/MapHome.tsx');
 assert.match(intro,/request-trips/);assert.doesNotMatch(intro,/onRoute/);
 assert.match(map,/smart-list/);assert.match(map,/guestTripsLabel\(trips\)/);assert.doesNotMatch(map,/Другой вариант/);
 assert.match(role,/guestStep\(guestStay/);assert.match(role,/CheckinGuide/);assert.match(role,/Мои брони/);
 assert.match(chat,/runGuestStep\(stay,step/);assert.match(chat,/<CheckinGuide/);
 for(const source of [menu,appMenu])assert.match(source,/'catalog','bookings','calendar'/);
 assert.match(appMap,/guestTripsLabel\(trips\)/);assert.doesNotMatch(appMap,/Открыть каталог/);
});

test('the guest\'s own booking on the map says the next thing to do',async()=>{
 const {guestPin}=await load('guest-trips');
 assert.deepEqual(guestPin(booking('b'),now,'test'),{label:'Оплатить',tone:'pending'});
 assert.equal(guestPin(booking('b',{status:'requested'}),now,'test'),null);
 const paid={payment_status:'owner_verified',terms:{paid_amount:20000}};
 assert.equal(guestPin(booking('b',paid),now,'test').tone,'booking');
 assert.match(guestPin(booking('b',paid),now,'test').label,/^Заезд \d\d:\d\d$/);
 assert.deepEqual(guestPin(booking('b',{...paid,start:now-hour}),now,'test'),{label:'Можно заселяться',tone:'booked'});
 assert.match(guestPin(booking('b',{start:now-hour,terms:{paid_amount:20000,actual_checkin:now-hour}}),now,'test').label,/^Вы здесь до \d\d:\d\d$/);
});
