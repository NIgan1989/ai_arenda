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
 assert.match(terms,/не является налоговым агентом/);
 assert.match(terms,/начинают действовать через 24 часа/);
 assert.match(terms,/не страхует жильё/);
 assert.match(text('owner'),/владелец возмещает Оператору/);
 assert.match(text('owner'),/бронь снята как неявка/);
 assert.match(text('cleaner'),/исполнитель возмещает Оператору/);
 assert.match(text('cleaner'),/последние 3 месяца/);
 assert.match(text('privacy'),/обязаны хранить их в тайне/);
});

test('every clause number is unique inside a document',()=>{
 for(const d of LEGAL_DOCUMENTS){
  const nums=d.sections.flatMap(s=>s.p).map(p=>p.match(/^(\d+(?:\.\d+)+)\./)?.[1]).filter(Boolean);
  assert.equal(new Set(nums).size,nums.length,d.id+': '+nums.join(','));
 }
});
