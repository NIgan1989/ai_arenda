import {test} from 'node:test';import assert from 'node:assert/strict';
import {load} from './helpers/platform.mjs';
const lib=await load('listing-draft');
const {moneyAnswer,readListingText,emptyDraft,DRAFT_EXAMPLE,draftQuestions,draftListingBody,answerDraft,draftTitle}=lib;
const {listingInput}=await load('listings');
const read=t=>readListingText(t,emptyDraft('Павлодар'));

test('one message fills the listing: rooms, floor, area, guests, tariffs, amenities, rules and address',()=>{
 const {draft:d,found}=read(DRAFT_EXAMPLE);
 assert.deepEqual([d.rooms,d.floor,d.floors,d.area,d.capacity,d.beds],[1,4,9,42,3,3]);assert.ok(found.includes('rooms'));
 assert.deepEqual([d.price,d.hourlyPrice,d.minHours],[15000,2500,2]);
 assert.deepEqual(d.amenities,['wifi','kitchen','washer','aircon']);
 assert.equal(d.address,'Торайгырова 64, кв. 12');assert.equal(d.district,'Центр');assert.equal(d.checkinMethod,'lockbox');assert.equal(d.smoking,false);
 assert.equal(draftTitle(d),'1-комнатная квартира · Центр');
 assert.deepEqual(draftQuestions(d),[]);assert.ok(found.includes('address')&&found.includes('price'));
});
test('thousands, slashed floors, deposits, pets, night tariff and check-in hours are understood',()=>{
 const {draft:d}=read('Сдаю двушку, ул. Ак. Сатпаева 12/1 кв 45, Центральный район, 3/5 этаж, 55 кв м, на 4 человек, 18 тыс сутки, час 3000, можно с животными, депозит 10000');
 assert.deepEqual([d.rooms,d.floor,d.floors,d.area,d.capacity,d.price,d.hourlyPrice,d.deposit,d.pets],[2,3,5,55,4,18000,3000,10000,true]);
 assert.equal(d.address,'ул. Ак. Сатпаева 12/1, кв. 45');assert.equal(d.district,'Центральный');
 const {draft:n}=read('квартира мкр Достык 5, 20 000 за сутки, ночь 12 000, уборка 3 000, заезд с 15, выезд до 11');
 assert.deepEqual([n.price,n.nightlyPrice,n.cleaningFee,n.checkinTime,n.checkoutTime,n.district],[20000,12000,3000,'15:00','11:00','Достык']);
});
test('only the address, the district and the daily price are asked; answers fill exactly that field',()=>{
 let d=emptyDraft('Павлодар');assert.deepEqual(draftQuestions(d).map(q=>q.key),['address','district','price']);
 d=answerDraft(d,'address','Ленина 5, кв 3');d=answerDraft(d,'district','Северный');d=answerDraft(d,'price','15 тыс');
 assert.deepEqual([d.address,d.district,d.price],['Ленина 5, кв 3','Северный',15000]);assert.deepEqual(draftQuestions(d),[]);
});
test('the draft becomes a body the listing validator accepts, and the public text never carries the address',()=>{
 const {draft:d}=read(DRAFT_EXAMPLE),body=draftListingBody(d,['photo-1'],true),value=listingInput(body);
 assert.equal(value.published,1);assert.ok(value.p.description.length>=80);assert.ok(!value.p.description.includes('Торайгырова'));
 assert.equal(value.details.floor,4);assert.equal(body.rental.hourlyPrice,2500);assert.ok(body.rental.houseRules.includes('Курение в помещении запрещено'));
 const bare=draftListingBody(answerDraft(answerDraft(answerDraft(emptyDraft('Павлодар'),'address','Ленина 5'),'district','Центр'),'price','9000'),[],false);
 assert.equal(listingInput(bare).published,0);assert.ok(bare.description.length>=80);
});
test('the owner\'s own title and text win over the generated ones',()=>{
 const {draft}=read(DRAFT_EXAMPLE),d={...draft,title:'Вид на Иртыш',description:'Свой текст'};
 const body=draftListingBody(d,[],false);assert.equal(body.title,'Вид на Иртыш');assert.equal(body.description,'Свой текст');
});
test('negated amenities are not advertised and an earlier mention is withdrawn',()=>{
 const {draft:d}=read('Однушка, без лифта, без балкона, нет кондиционера, есть Wi-Fi');assert.deepEqual(d.amenities,['wifi']);
 const {draft:again}=readListingText('кондиционера нет, без кондиционера',{...d,amenities:['wifi','aircon']});assert.deepEqual(again.amenities,['wifi']);
});
test('answers keep decimals and change only the asked field',()=>{
 assert.equal(moneyAnswer('2,5 тыс'),2500);assert.equal(moneyAnswer('2.5 тыс'),2500);assert.equal(moneyAnswer('3 000 ₸'),3000);assert.equal(moneyAnswer('3к'),3000);
 const {draft:studio}=read('Студия в центре, 12 000 в сутки');const d=answerDraft(studio,'address','ул. Ленина 5, квартира 12');
 assert.equal(d.type,'studio');assert.equal(d.address,'ул. Ленина 5, кв. 12');assert.equal(answerDraft(studio,'price','2,5 тыс').price,2500);
});
test('a bath is read by the hour: guests in the price, the pay above them, the heating time, its amenities and name',()=>{
 const {DRAFT_EXAMPLE_BATH,draftDescription}=lib;
 const {draft:d}=read(DRAFT_EXAMPLE_BATH);
 assert.deepEqual([d.type,d.capacity,d.includedGuests,d.extraGuestPrice,d.prepMinutes,d.hourlyPrice,d.minHours],['banya',10,6,1000,90,5000,2]);
 assert.deepEqual(d.amenities,['steam','pool','brooms','grill']);assert.equal(draftTitle(d),'Баня «Берёзка»');assert.equal(d.address,'Лесной 5');
 // The day price is never asked for a bath.
 assert.deepEqual(draftQuestions(d),[]);
 const body=draftListingBody(d,['photo-1'],true),value=listingInput(body);
 assert.equal(body.price,60000);assert.deepEqual([body.rental.hourlyPrice,body.rental.includedGuests,body.rental.extraGuestPrice,body.rental.prepMinutes],[5000,6,1000,90]);
 assert.equal(value.published,1);assert.ok(!/спальн|Заселение|вечеринок|питомц/.test(body.description+body.rental.houseRules));assert.ok(!draftDescription(d).includes('Лесной'));
});
test('a bath asks for the price of an hour, small numbers by «час» are not money, and housing with a bath stays housing',()=>{
 let {draft:d}=read('Сауна "Жар", ул. Мира 10, на 8 человек, 6 человек в цене, каждый следующий 1500 тг, от 3 часов, бильярд, караоке, лифт. Затопить за час');
 assert.deepEqual([d.type,d.capacity,d.includedGuests,d.extraGuestPrice,d.prepMinutes,d.minHours,d.hourlyPrice],['sauna',8,6,1500,60,3,0]);
 assert.deepEqual(d.amenities,['karaoke','billiards']);
 assert.deepEqual(draftQuestions(d).map(q=>q.label),['Район','Цена за час']);
 d=answerDraft(answerDraft(d,'district','Центр'),'price','8 000');assert.deepEqual([d.hourlyPrice,d.price],[8000,0]);assert.deepEqual(draftQuestions(d),[]);
 const b=read('баня, топить 2 часа, от 2 часов, 4000 в час').draft;assert.deepEqual([b.prepMinutes,b.hourlyPrice,b.capacity],[120,4000,6]);
 const h=read('Дом с баней на Лесной 5, 30000 сутки, до 8 гостей').draft;assert.deepEqual([h.type,h.price,h.capacity],['house',30000,8]);
 const f=read('квартира мкр Достык 5, от 2 часов 2500 в час, 15000 сутки').draft;assert.deepEqual([f.hourlyPrice,f.price],[2500,15000]);
});
