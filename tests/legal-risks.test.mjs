import {test} from 'node:test';import assert from 'node:assert/strict';
import {load} from './helpers/platform.mjs';
const {LEGAL_DOCUMENTS,LEGAL_EDITION}=await load('legal-documents');
const text=id=>LEGAL_DOCUMENTS.find(d=>d.id===id).sections.flatMap(s=>s.p).join(' ');

test('the offers cover the launch risks in one new edition',()=>{
 assert.equal(LEGAL_EDITION,'22 ноября 2026');
 const terms=text('terms');
 assert.match(terms,/непреодолимой силой/);
 assert.match(terms,/повторно списанную сумму/);
 assert.match(terms,/оспорить начисление/);
 assert.match(terms,/согласие на регулярное списание/);
 assert.match(terms,/«Жильё проверено» означает только/);
 assert.match(terms,/не удерживает налоги с доходов участников/);
 assert.match(terms,/рассматривает сотрудник Оператора, а не автоматическая система/);
 assert.match(terms,/являются его цифровым подтверждением/);
 assert.match(terms,/вправе отказаться от общения с ИИ-администратором/);
 assert.match(terms,/без использования моделей искусственного интеллекта/);
 assert.match(terms,/начинают действовать через 24 часа/);
 assert.match(terms,/не страхует жильё/);
 assert.match(text('owner'),/владелец возмещает Оператору/);
 assert.match(text('owner'),/бронь снята как неявка/);
 assert.match(text('cleaner'),/исполнитель возмещает Оператору/);
 assert.match(text('cleaner'),/последние 3 месяца/);
 assert.match(text('privacy'),/обязаны хранить их в тайне/);
});

test('the offers take the protections other rental services use',()=>{
 const terms=text('terms');
 assert.match(terms,/Чрезвычайные события/);
 assert.match(terms,/для рекламы Сервиса/);
 assert.match(terms,/передать свои права и обязанности/);
 assert.match(terms,/могут использоваться как доказательства/);
 assert.match(terms,/вправе отменить подтверждённую бронь/);
 assert.match(terms,/повторно подтвердить личность/);
 assert.match(terms,/не является страховщиком/);
 assert.match(terms,/парсинг, боты/);
 assert.match(terms,/услуги других компаний/);
 assert.match(text('owner'),/до 48 часов после времени выезда/);
 assert.match(text('owner'),/как за свои собственные/);
});

test('every clause number is unique inside a document',()=>{
 for(const d of LEGAL_DOCUMENTS){
  const nums=d.sections.flatMap(s=>s.p).map(p=>p.match(/^(\d+(?:\.\d+)+)\./)?.[1]).filter(Boolean);
  assert.equal(new Set(nums).size,nums.length,d.id+': '+nums.join(','));
 }
});
