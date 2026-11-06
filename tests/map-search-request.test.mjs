import {test} from 'node:test';import assert from 'node:assert/strict';
import {load} from './helpers/platform.mjs';
const {mapSearchRequest,mapSearchFilters}=await load('map-search-request');
const current={city:'Павлодар',guests:'1',mode:'daily'},cities=['Астана','Алматы','Павлодар'],now=Date.parse('2026-10-30T18:00:00+05:00');
test('guided search transfers only search conditions and cannot transfer actions or stale pagination',()=>{
 assert.deepEqual(mapSearchFilters({city:'Астана',guests:'3',maxPrice:'10000',page:'99',action:'confirm',userId:'other',role:'owner',rooms:5,start:'',syntheticPreview:true}),{city:'Астана',guests:'3',mode:'daily',page:'1',maxPrice:'10000'});
});
test('map request extracts city, room minimum, capacity and KZT budget without opening administrator chat',()=>{
 const r=mapSearchRequest('Найди 2-комнатную в Астане для 3 гостей до 20 тысяч',current,cities,now);assert.equal(r.filters.city,'Астана');assert.equal(r.filters.rooms,'2');assert.equal(r.filters.guests,'3');assert.equal(r.filters.maxPrice,'20000');assert.equal(r.nearby,false);assert.ok(r.notes.some(n=>n.includes('заезд')));
});

test('word room counts and exact versus minimum survive transfer to map filters',()=>{
 const exact=mapSearchRequest('Найди однокомнатную квартиру',current,cities,now);assert.equal(exact.filters.rooms,'1');assert.equal(exact.filters.roomsExact,'1');
 const minimum=mapSearchRequest('Найди от 2 комнат в квартире',current,cities,now);assert.equal(minimum.filters.rooms,'2');assert.equal(minimum.filters.roomsExact,'0');
 assert.equal(mapSearchFilters(exact.filters).roomsExact,'1');assert.notEqual(mapSearchRequest('Не дороже 15000',current,cities,now).filters.sort,'price-desc');
});
test('relative dates use Kazakhstan time, future start and stated duration',()=>{
 const r=mapSearchRequest('Свободную завтра на 2 суток',current,cities,now);assert.equal(r.filters.start,'2026-10-31T14:00');assert.equal(r.filters.end,'2026-11-02T14:00');assert.deepEqual(r.notes,[]);
 const today=mapSearchRequest('Сегодня на 3 часа',current,cities,now);assert.equal(today.filters.start,'2026-10-30T18:05');assert.equal(today.filters.end,'2026-10-30T21:05');assert.equal(today.filters.mode,'hourly');
});
test('explicit dates do not become a price; invalid calendar dates require clarification',()=>{
 const r=mapSearchRequest('с 2026-11-01 до 2026-11-03',current,cities,now);assert.equal(r.filters.maxPrice,undefined);assert.equal(r.filters.start,'2026-11-01T14:00');assert.equal(r.filters.end,'2026-11-03T14:00');
 const invalid=mapSearchRequest('с 2026-11-31 по 2026-12-03',{...current,start:'2026-11-01T14:00',end:'2026-11-02T14:00'},cities,now);assert.equal(invalid.filters.start,undefined);assert.ok(invalid.notes.some(n=>n.includes('Уточните')));
});
test('nearby request requires a location and unknown requests never invent availability',()=>{
 const r=mapSearchRequest('Свободную рядом со мной',current,cities,now);assert.equal(r.nearby,true);assert.equal(r.filters.start,undefined);assert.ok(r.notes.length);
 const unknown=mapSearchRequest('с бассейном и красивым видом',current,cities,now);assert.equal(unknown.filters.city,'Павлодар');assert.equal(unknown.filters.start,undefined);assert.equal(unknown.summary,'Павлодар');
});
