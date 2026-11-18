import {test} from 'node:test';import assert from 'node:assert/strict';import {fixture,load} from './helpers/platform.mjs';
const {readListingText,emptyDraft,draftQuestions}=await load('listing-draft'),{setGuestMode}=await load('autopilot');
const read=text=>readListingText(text,emptyDraft('Павлодар')).draft;

// «Однушка, Торайгырова 64, 12000»: the address and the price said bare, and the district without «район».
test('one message: a bare street with a house number, a bare sum and «в Усольском» are read',()=>{
 const a=read('Однушка, Торайгырова 64, 12000');
 assert.deepEqual([a.address,a.price],['Торайгырова 64',12000]);assert.deepEqual(draftQuestions(a).map(q=>q.key),['district']);
 const b=read('Двушка в Усольском, Ломова 12/1, 15 000 тг');
 assert.deepEqual([b.address,b.district,b.price],['Ломова 12/1','Усольский',15000]);assert.deepEqual(draftQuestions(b),[]);
 // A bath's bare sum is its hour; the cleaning sum stays the cleaning.
 const c=read('Баня, Лермонтова 5, 4000, уборка 2000');
 assert.deepEqual([c.address,c.hourlyPrice,c.cleaningFee],['Лермонтова 5',4000,2000]);
 // Not an address: the city, the floor, the rooms.
 assert.equal(read('Однушка, Павлодар 5, 12000').address,'');assert.equal(read('Квартира, Этаж 3, 15000').address,'');
 // A labelled attribute is not an address either, so the address is still asked.
 const e=read('Баня, Вместимость 10, в Усольском, 4000');assert.equal(e.address,'');assert.ok(draftQuestions(e).some(q=>q.key==='address'));
 assert.equal(read('Однушка, Спальных мест 3, Ленина 5, 12000').address,'Ленина 5');
 // Two bare sums: which is the price is not guessed.
 assert.equal(read('Однушка, Торайгырова 64, 12000, 5000').price,0);
});

test('without the AI the price of a cleaning is kept, so the owner\'s own confirmations order the cleaning',async()=>{
 const f=await fixture();try{
  await setGuestMode(f.owner,{propertyId:f.property,mode:'manual',cleaningFee:3500});
  assert.equal(f.db.raw.prepare('SELECT cleaning_fee FROM property_policies WHERE property_id=?').get(f.property).cleaning_fee,3500);
  await assert.rejects(setGuestMode(f.owner,{propertyId:f.property,mode:'manual',cleaningFee:50}),/Стоимость уборки/);
 }finally{f.db.close();}
});
