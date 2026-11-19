import {test} from 'node:test';import assert from 'node:assert/strict';
import {load} from './helpers/platform.mjs';
const {ownerHandoff,cleanerHandoff,planPrice,rulesLine,CLEANER_RULES}=await load('autopilot-handoff');

test('владельцу предлагаем передать ИИ только то жильё, которое он ведёт сам',()=>{
 const flat=(id,patch={})=>({id,title:'Студия '+id,ownStaff:false,cleaningFee:5000,ready:true,managed:false,...patch});
 assert.equal(ownerHandoff(null),null);
 assert.equal(ownerHandoff({flats:[flat('a',{managed:true})]}),null);
 const one=ownerHandoff({flats:[flat('a'),flat('b',{managed:true})],settings:{charge:true,price:4900,trialDays:14}});
 assert.equal(one.title,'«Студия a» вы ведёте сами');assert.deepEqual(one.ready.map(f=>f.id),['a']);assert.equal(one.needFee.length,0);
 assert.match(one.price,/^Первые 14 дней бесплатно, потом 4\s900 ₸ в месяц с привязанной карты\.$/);
 // Цена уборки нужна, только если убирает не свой персонал; без правил жильё сначала заполняют.
 const many=ownerHandoff({flats:[flat('a',{cleaningFee:0}),flat('b',{cleaningFee:0,ownStaff:true}),flat('c',{ready:false})],settings:{charge:false,price:4900,trialDays:0}});
 assert.equal(many.title,'Вы сами ведёте 3 объекта');assert.deepEqual(many.needFee.map(f=>f.id),['a']);assert.deepEqual(many.notReady.map(f=>f.id),['c']);
 assert.equal(many.price,'Плата пока не взимается.');
 assert.match(planPrice({charge:true,price:4900,trialDays:0},2,'owner'),/^9\s800 ₸ в месяц с привязанной карты\.$/);
});

test('исполнителю предлагаем автоотклик, пока тариф не включён, с понятными правилами',()=>{
 assert.equal(cleanerHandoff(null),null);
 assert.equal(cleanerHandoff({live:true}),null);
 const offer=cleanerHandoff({live:false,rules:null,settings:{charge:true,price:1900,trialDays:14}});
 assert.equal(offer.rules,CLEANER_RULES);
 assert.equal(offer.rulesText,'Любой район · Пн, Вт, Ср, Чт, Пт, Сб · 10:00–19:00 · до 4 уборок в день');
 assert.match(offer.price,/потом 1\s900 ₸ в месяц с привязанной карты\.$/);
 assert.equal(rulesLine({districts:['Центр'],days:127,fromMinute:540,toMinute:1440,maxPerDay:1,minFee:3000}),'Центр · каждый день · 09:00–23:59 · до 1 уборки в день · от 3 000 ₸');
});
