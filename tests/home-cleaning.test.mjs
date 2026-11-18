import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,load,now,iso} from './helpers/platform.mjs';
const {homePrice,homeMinutes,homeDescription,homeTitle,homeAdvice,homeOrderOf}=await load('home-cleaning');
const {orderHomeCleaning,homePlaces,homeDeals}=await load('home-order');

test('the price of a home cleaning grows with its kind, rooms and windows',()=>{
 assert.equal(homePrice({kind:'regular',rooms:1}),6000);
 assert.equal(homePrice({kind:'regular',rooms:3}),10000);
 assert.equal(homePrice({kind:'general',rooms:2}),16000);
 assert.equal(homePrice({kind:'renovation',rooms:2,windows:3}),23000);
 assert.equal(homePrice({kind:'nonsense',rooms:99}),homePrice({kind:'regular',rooms:6}));
 assert.equal(homeMinutes({kind:'regular',rooms:2}),120);assert.equal(homeMinutes({kind:'general',rooms:2,windows:2}),270);
 assert.equal(homeTitle(2),'Дом · 2 комнаты');
 assert.equal(homeDescription({kind:'general',rooms:2,windows:3,wishes:' Есть кот '}),'Уборка на дом: генеральная, 2 комнаты, мойка окон: 3 окна. Средства и инвентарь свои. Пожелания: Есть кот');
});

test('the price advice follows what executors of the city really take such orders for',()=>{
 const order={kind:'general',rooms:2,windows:3};
 assert.deepEqual(homeOrderOf(homeDescription({...order,wishes:'Кот'})),order);assert.equal(homeOrderOf('Уборка после гостей'),null);
 assert.deepEqual(homeOrderOf(homeDescription({kind:'regular',rooms:5})),{kind:'regular',rooms:5,windows:0});
 // Few orders: the advice is the grid.
 assert.deepEqual(homeAdvice(order,[{kind:'regular',rooms:1,fee:9000}]),{fee:19000,market:false,deals:1});
 // Enough orders: the median of «paid / grid» corrects it; a wild sum does not count.
 const deals=[[1,7500],[1,7500],[2,10000],[3,12000],[2,10000],[1,100]].map(([rooms,fee])=>({kind:'regular',rooms,fee}));
 assert.deepEqual(homeAdvice({kind:'regular',rooms:2},deals),{fee:10000,market:true,deals:5});
});

test('a guest orders a cleaning of their own home and the usual process takes it',async()=>{
 const f=await fixture(),start=iso(now()+86400);
 const made=await orderHomeCleaning(f.guest,{address:'ул. Тестовая, 5, кв. 7',rooms:2,kind:'general',windows:1,start,wishes:'Есть кот',longitude:76.95,latitude:52.28,requestKey:'home-1'});
 assert.equal(made.fee,17000);assert.match(made.message,/Ищем исполнителя/);
 // The address is a private object: it is not published and no guest finds it.
 const place=f.db.raw.prepare('SELECT * FROM properties WHERE id=?').get(made.propertyId);
 assert.deepEqual([place.owner_id,place.published,place.title,place.rooms],['guest',0,'Дом · 2 комнаты',2]);
 assert.equal((await f.other.publicSearch({city:'Павлодар'})).properties.some(p=>p.id===made.propertyId),false);
 assert.equal((await f.cleaner.roleState('cleaner')).properties.length,0);
 // The customer became an owner, so the whole owner side of a cleaning is theirs.
 assert.ok(JSON.parse(f.db.raw.prepare("SELECT roles FROM profiles WHERE id='guest'").get().roles).includes('owner'));
 const owner=await f.guest.roleState('owner'),job=owner.jobs.find(j=>j.id===made.id);
 assert.deepEqual([job.status,job.fee,job.end-job.start],['open',17000,255*60]);assert.match(job.description,/генеральная, 2 комнаты, мойка окон: 1 окно/);
 assert.equal((await homePlaces(f.guest)).length,1);
 await assert.rejects(f.guest.saveListing(made.propertyId,{}),/частный адрес/);
 // The executor sees the order without the exact address, applies, is chosen, does the work, the customer accepts it.
 const seen=(await f.cleaner.roleState('cleaner')).jobs.find(j=>j.id===made.id);assert.equal(seen.address,null);
 await f.cleaner.jobAction(made.id,{action:'apply'});
 const app=f.db.raw.prepare('SELECT id FROM applications WHERE job_id=?').get(made.id);
 await f.guest.jobAction(made.id,{action:'assign',applicationId:app.id});
 assert.equal((await f.cleaner.roleState('cleaner')).jobs.find(j=>j.id===made.id).address,'ул. Тестовая, 5, кв. 7');
 // The same request again does not make a second order, a second order to the same address does not make a second home.
 assert.equal((await orderHomeCleaning(f.guest,{address:'ул. Тестовая, 5, кв. 7',rooms:2,kind:'general',windows:1,start,wishes:'Есть кот',requestKey:'home-1'})).id,made.id);
 const next=await orderHomeCleaning(f.guest,{propertyId:made.propertyId,rooms:3,kind:'regular',start:iso(now()+3*86400),requestKey:'home-2'});
 assert.equal(next.propertyId,made.propertyId);assert.equal(next.fee,10000);
 assert.equal(f.db.raw.prepare("SELECT COUNT(*) n FROM properties WHERE owner_id='guest'").get().n,1);
});

test('the customer sets the price, and an order cannot go to another person\'s address',async()=>{
 const f=await fixture(),start=iso(now()+86400);
 await assert.rejects(orderHomeCleaning(f.guest,{address:'ул. Тестовая, 5',rooms:2,kind:'general',start,fee:500,requestKey:'a'}),/Цена/);
 // Below the advice is the customer's right; the order is counted in the market only once an executor took it.
 const cheap=await orderHomeCleaning(f.guest,{address:'ул. Тестовая, 5',rooms:2,kind:'general',start,fee:9000,requestKey:'a2'});assert.equal(cheap.fee,9000);
 assert.deepEqual(await homeDeals(f.guest,'Павлодар'),[]);
 await f.cleaner.jobAction(cheap.id,{action:'apply'});await f.guest.jobAction(cheap.id,{action:'assign',applicationId:f.db.raw.prepare('SELECT id FROM applications WHERE job_id=?').get(cheap.id).id});
 assert.deepEqual(await homeDeals(f.guest,'Павлодар'),[{kind:'general',rooms:2,windows:0,fee:9000}]);
 assert.deepEqual((await f.guest.roleState('owner')).homeDeals.length,1);
 await assert.rejects(orderHomeCleaning(f.guest,{propertyId:f.property,rooms:1,kind:'regular',start,requestKey:'b'}),/адрес недоступен/);
 await assert.rejects(orderHomeCleaning(f.guest,{address:'ул. Тестовая, 5',rooms:1,kind:'regular',start:'когда-нибудь',requestKey:'c'}),/когда нужна уборка/);
 const {commandRole}=await load('access');assert.deepEqual(commandRole('home-cleaning',{}),['guest','owner']);
});

test('a cleaning without a booking waits for nobody\'s departure',async()=>{
 const f=await fixture(),{cleaningThread:ownerJobThread,jobThread}=await load('process-threads'),{cleanerStep,cleanerLine}=await load('job-steps');
 const made=await orderHomeCleaning(f.guest,{address:'ул. Тестовая, 5',rooms:1,kind:'regular',start:iso(now()+1800),requestKey:'w'});
 const owner=await f.guest.roleState('owner'),mine=owner.jobs.find(j=>j.id===made.id);
 assert.equal(mine.booking_id,null);assert.ok(mine.checkout_confirmed);
 assert.doesNotMatch(JSON.stringify(ownerJobThread(mine,owner,now())),/[Вв]ыезд/);
 await f.cleaner.jobAction(made.id,{action:'apply'});await f.guest.jobAction(made.id,{action:'assign',applicationId:f.db.raw.prepare('SELECT id FROM applications WHERE job_id=?').get(made.id).id});
 const cleaner=await f.cleaner.roleState('cleaner'),job=cleaner.jobs.find(j=>j.id===made.id);
 assert.deepEqual(cleanerStep(job,undefined,'cleaner'),{id:'start',label:'Начать уборку'});assert.equal(cleanerLine(job),'Можно начинать в назначенное время');
 assert.doesNotMatch(JSON.stringify(jobThread(job,cleaner,now())),/[Вв]ыезд/);
 // The private home is not offered to the autopilot of rented objects.
 const {planState}=await load('autopilot-plans');assert.equal((await planState(f.guest,'owner')).flats.some(x=>x.id===made.propertyId),false);
});

test('the performer says «Выезжаю» and «Я на месте», and reports by the checklist of the kind',async()=>{
 const f=await fixture(),{cleaningThread,jobThread}=await load('process-threads'),{homeChecklist}=await load('home-cleaning');
 assert.equal(homeChecklist({kind:'regular'}).length,4);assert.equal(homeChecklist({kind:'general',windows:2}).at(-1),'Окна вымыты: 2 окна');assert.ok(homeChecklist({kind:'renovation'}).some(x=>/краски/.test(x)));
 const made=await orderHomeCleaning(f.guest,{address:'ул. Тестовая, 5',rooms:2,kind:'general',windows:2,start:iso(now()+1800),requestKey:'s2'});
 await assert.rejects(f.cleaner.jobAction(made.id,{action:'arrived'}),/./);
 await f.cleaner.jobAction(made.id,{action:'apply'});await f.guest.jobAction(made.id,{action:'assign',applicationId:f.db.raw.prepare('SELECT id FROM applications WHERE job_id=?').get(made.id).id});
 const line=async()=>{const s=await f.guest.roleState('owner');return cleaningThread(s.jobs.find(j=>j.id===made.id),s,now());};
 assert.match((await line()).line,/приедет к назначенному времени/);
 assert.match((await f.cleaner.jobAction(made.id,{action:'on_way'})).message,/выехали/);assert.match((await line()).line,/в пути/);
 assert.match((await f.cleaner.jobAction(made.id,{action:'arrived'})).message,/на месте/);
 const t=await line();assert.equal(t.steps[1].state,'done');assert.equal(t.steps[1].note,'Исполнитель на месте');
 // Said twice: the customer is not told twice.
 assert.match((await f.cleaner.jobAction(made.id,{action:'arrived'})).message,/уже знает/);
 const notes=f.db.raw.prepare("SELECT body FROM notifications WHERE user_id='guest' AND (dedupe LIKE '%cleaner-arrived:%' OR dedupe LIKE '%cleaner-on-way:%')").all();
 assert.equal(notes.length,2);assert.ok(notes.some(n=>/Откройте дверь/.test(n.body)));
 const mine=await f.cleaner.roleState('cleaner');assert.match(jobThread(mine.jobs.find(j=>j.id===made.id),mine,now()).steps[2].note,/на месте/);
 // The usual cleaning after guests keeps its own way to say «на месте».
 await assert.rejects(f.cleaner.jobAction(f.job.id,{action:'arrived'}),/./);
 await f.cleaner.jobAction(made.id,{action:'start'});
 const list=homeChecklist({kind:'general',windows:2});assert.equal(list.length,7);
 await assert.rejects(f.cleaner.jobAction(made.id,{action:'submit',checklist:[true,true,true],report:'Готово'}),/чек-листа|фото/); // The customer's home asks for photos before and after: a report without them does not go.
 await assert.rejects(f.cleaner.jobAction(made.id,{action:'submit',checklist:list.map(()=>true),report:'Готово'}),/фото до и после/);
 f.db.raw.prepare('UPDATE operation_rules SET require_photos=0 WHERE property_id=?').run(made.propertyId);
 await f.cleaner.jobAction(made.id,{action:'submit',checklist:list.map(()=>true),report:'Готово'});
 const card=(await f.guest.roleState('owner')).approvals.find(c=>c.kind==='report'&&c.entityId===made.id);
 assert.ok(card.facts.some(([k,v])=>k==='Чек-лист'&&v==='7 из 7'));assert.match(card.detail,/^Готово\n\nОтмечено исполнителем: .*окна вымыты: 2 окна\.$/);
});
