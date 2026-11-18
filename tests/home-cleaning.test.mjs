import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,load,now,iso} from './helpers/platform.mjs';
const {homePrice,homeMinutes,homeDescription,homeTitle}=await load('home-cleaning');
const {orderHomeCleaning,homePlaces}=await load('home-order');

test('the price of a home cleaning grows with its kind, rooms and windows',()=>{
 assert.equal(homePrice({kind:'regular',rooms:1}),6000);
 assert.equal(homePrice({kind:'regular',rooms:3}),10000);
 assert.equal(homePrice({kind:'general',rooms:2}),16000);
 assert.equal(homePrice({kind:'renovation',rooms:2,windows:3}),23000);
 assert.equal(homePrice({kind:'nonsense',rooms:99}),homePrice({kind:'regular',rooms:6}));
 assert.equal(homeMinutes({kind:'regular',rooms:2}),120);assert.equal(homeMinutes({kind:'general',rooms:2,windows:2}),270);
 assert.equal(homeTitle(2),'Дом · 2 комнаты');
 assert.equal(homeDescription({kind:'general',rooms:2,windows:3,wishes:' Есть кот '}),'Уборка на дом: генеральная, 2 комнаты, мойка окон: 3 окна. Пожелания: Есть кот');
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

test('an order cannot be cheaper than the price of the service or go to another person\'s address',async()=>{
 const f=await fixture(),start=iso(now()+86400);
 await assert.rejects(orderHomeCleaning(f.guest,{address:'ул. Тестовая, 5',rooms:2,kind:'general',start,fee:1000,requestKey:'a'}),/Цена/);
 await assert.rejects(orderHomeCleaning(f.guest,{propertyId:f.property,rooms:1,kind:'regular',start,requestKey:'b'}),/адрес недоступен/);
 await assert.rejects(orderHomeCleaning(f.guest,{address:'ул. Тестовая, 5',rooms:1,kind:'regular',start:'когда-нибудь',requestKey:'c'}),/когда нужна уборка/);
 const {commandRole}=await load('access');assert.deepEqual(commandRole('home-cleaning',{}),['guest','owner']);
});
