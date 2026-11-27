import {test} from 'node:test';import assert from 'node:assert/strict';
import {load} from './helpers/platform.mjs';
const {formatTitle,joinTitle,titleInput,titleSaysKind,titleSaysRooms}=await load('listing-title');
const f=(title,type,rooms=1,district='Центр')=>formatTitle(title,type,rooms,{district,city:'Павлодар'});

test('a title reads «type and rooms · one detail», whatever the owner typed',()=>{
 assert.equal(f('Двухкомнатная у набережной','apartment',2),'2-комнатная · у набережной');
 assert.equal(f('Студия возле ТРЦ «Батыр Молл»','studio'),'Студия · возле ТРЦ «Батыр Молл»');
 assert.equal(f('Гостевой дом у реки','house',3),'Дом · у реки');
 assert.equal(f('Трёхкомнатная для семьи','apartment',3),'3-комнатная · для семьи');
 // The rooms come from the field, not from the old words.
 assert.equal(f('2-комнатная · у парка','apartment',3),'3-комнатная · у парка');
});
test('shouting, contacts, emoji, «квартира» and the district are tidied away',()=>{
 assert.equal(f('СУПЕР КВАРТИРА у парка!!! 😍 +7 701 123 45 67','apartment',2),'2-комнатная · у парка');
 assert.equal(f('1-комнатная квартира · Центр','apartment'),'1-комнатная');
 assert.equal(f('Сауна · Мдс','sauna',1,'Мдс'),'Сауна');
 assert.ok(!/квартир/i.test(f('','apartment',2)));
 assert.ok(f('у самого красивого парка нашего большого города','apartment',2).length<=12+28);
});
test('a bath, a hotel or a hall is known by its name in «»',()=>{
 assert.equal(f('Баня на дровах «Арасан»','banya',2),'Баня «Арасан» · на дровах');
 assert.equal(f('Берёзка','banya'),'Баня «Берёзка»');
 assert.equal(f('Гостиница «Шаңырақ»','hotel'),'Гостиница «Шаңырақ»');
 assert.equal(f('Хостел в центре','hostel',4),'Хостел · в центре');
 // A quoted place nearby is not the bath's own name.
 assert.equal(f('Баня · возле ТРЦ «Батыр Молл»','banya'),'Баня · возле ТРЦ «Батыр Молл»');
 assert.equal(f('Баня возле ТРЦ «Батыр Молл»','banya'),'Баня · возле ТРЦ «Батыр Молл»');
});
test('the field holds only the owner part and keeps the space being typed',()=>{
 assert.equal(joinTitle('у парка ','apartment',2),'2-комнатная · у парка ');
 assert.equal(titleInput('2-комнатная · у парка '),'у парка ');
 assert.equal(titleInput('Баня «Арасан» · на дровах'),'«Арасан» · на дровах');
 assert.equal(f(joinTitle('Арасан','banya'),'banya'),'Баня «Арасан»');
 assert.ok(titleSaysKind('Студия · у парка')&&titleSaysRooms('2-комнатная')&&!titleSaysKind('Малый зал'));
});
test('a hall of a venue keeps its plain name in the editor',async()=>{
 const src=(await import('node:fs')).readFileSync('mobile/src/PropertyEdit.tsx','utf8');
 assert.match(src,/p\.venue\?<EditField label=\{t\('Название'\)\}/);
});
test('the owner app saves the title in the one format',async()=>{
 const {draftTitle,emptyDraft}=await load('listing-draft');
 assert.equal(draftTitle({...emptyDraft('Павлодар'),type:'apartment',rooms:2,district:'Центр',title:'Двушка у набережной!!!'}),'2-комнатная · у набережной');
});
