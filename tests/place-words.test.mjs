import {test} from 'node:test';import assert from 'node:assert/strict';
import {load} from './helpers/platform.mjs';
const {placeWords}=await load('place-words');
const all=w=>[w.kind,...w.terms,...w.extra,w.rulesTitle,w.allowed,w.addressNote,w.price,w.priceNote,w.choose].join('\n');

test('a bath page speaks of hours and the company, never of rooms, beds or check-in',()=>{
 const w=placeWords({price:60000,rooms:1,capacity:10,details:{type:'banya',area:60,beds:10,bathrooms:1,floor:1,floors:5,checkinMethod:'meet',smoking:false,pets:false,parties:true},
  policy:{hourly_price:5000,min_hours:2,nightly_price:0,checkin_minutes:840,checkout_minutes:720,deposit:0,included_guests:6,extra_guest_price:1000,prep_minutes:90}});
 assert.equal(w.kind,'Баня · 60 м²\nЦеликом для вашей компании · до 10 гостей');
 assert.deepEqual([w.price.replace(/\s/g,' '),w.priceNote,w.choose],['5 000 ₸','За час · от 2 ч','Выбрать время']);
 assert.ok(w.terms.some(t=>/В цену входит 6 гостей, каждый следующий: 1.000 ₸ в час/.test(t)));
 assert.ok(w.terms.some(t=>/не позже чем за 1 ч 30 мин/.test(t)));
 assert.doesNotMatch(all(w),/комн|спальн|Заезд|выезд|заселен|проживан|сутк|питомц|вечеринк|Этаж|Жильё/i);
});
test('a hall page gives the price per guest and its two slots; housing keeps its own words',()=>{
 const h=placeWords({price:240000,rooms:1,capacity:200,details:{type:'banquet',area:300,checkinMethod:'meet',menu:'Бешбармак, баурсаки'},policy:{included_guests:30,extra_guest_price:8000,deposit:50000}});
 assert.deepEqual([h.price.replace(/\s/g,' '),h.priceNote,h.choose],['8 000 ₸','За гостя · от 30 гостей','Выбрать день']);
 assert.ok(h.terms.includes('Меню: Бешбармак, баурсаки'));assert.doesNotMatch(all(h),/комн|спальн|Заезд|проживан|сутк|питомц/i);
 const f=placeWords({price:15000,rooms:2,capacity:4,details:{type:'apartment',area:55,beds:4,bathrooms:1,floor:3,floors:5,checkinMethod:'lockbox',pets:true},policy:{hourly_price:2500,min_hours:2,nightly_price:0,checkin_minutes:840,checkout_minutes:720,deposit:10000}});
 assert.equal(f.kind,'Квартира · 2 комн. · 55 м²\nДо 4 гостей · 4 спальных места');
 assert.deepEqual(f.terms,['Заезд: 14:00 · выезд: 12:00','Сейф для ключей','Этаж 3 из 5 · санузлы: 1']);
 assert.deepEqual([f.rulesTitle,f.priceNote,f.choose],['Правила проживания','За начатые сутки · 24 часа','Проверить даты']);
 assert.match(f.allowed,/питомцы: разрешены/);
});
