import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,load} from './helpers/platform.mjs';
const {workingDaysLater,objectReliability,myObjection,objectionQueue,answerObjection}=await load('reliability-objection');

test('three working days skip the weekend by Almaty time',()=>{
 const friday=Date.UTC(2026,10,20,6)/1000,wednesday=Date.UTC(2026,10,25,6)/1000;
 assert.equal(workingDaysLater(friday),wednesday);
 const monday=Date.UTC(2026,10,23,6)/1000;assert.equal(workingDaysLater(monday),Date.UTC(2026,10,26,6)/1000);
});

test('a participant objects to the rating once, the administrator answers, the participant is told',async()=>{
 const f=await fixture();try{
  await assert.rejects(objectReliability(f.db,'guest','guest',{text:'нет'},'admin1'),e=>e.status===400);
  const r=await objectReliability(f.db,'guest','guest',{text:'Спор при выезде был по ошибке владельца.'},'admin1,admin2',1000);
  assert.equal(r.objection.status,'open');assert.ok(r.objection.dueAt>1000);
  assert.equal(f.db.raw.prepare("SELECT COUNT(*) n FROM notifications WHERE dedupe LIKE 'admin:objection:%'").get().n,2);
  await assert.rejects(objectReliability(f.db,'guest','guest',{text:'Ещё раз: оценка несправедлива.'},'admin1'),e=>e.status===409);
  // Another role of the same person is a separate rating.
  await objectReliability(f.db,'guest','owner',{text:'Отмена была по просьбе гостя.'},'');
  const queue=await objectionQueue(f.db,2000);assert.equal(queue.length,2);
  await assert.rejects(answerObjection(f.db,'admin1',{id:r.objection.id,answer:'ок'}),e=>e.status===400);
  await answerObjection(f.db,'admin1',{id:r.objection.id,answer:'Проверили бронь: спор снят, оценка пересчитана.'},3000);
  await assert.rejects(answerObjection(f.db,'admin1',{id:r.objection.id,answer:'Повторный ответ администратора.'}),e=>e.status===409);
  const mine=(await myObjection(f.db,'guest','guest')).objection;
  assert.equal(mine.status,'answered');assert.match(mine.answer,/спор снят/);
  assert.match(f.db.raw.prepare("SELECT body FROM notifications WHERE user_id='guest' AND dedupe LIKE 'guest:reliability-objection:%'").get().body,/спор снят/);
  // After the answer a new objection can be sent.
  await objectReliability(f.db,'guest','guest',{text:'Появился новый спор, тоже ошибочный.'},'');
 }finally{f.db.close();}
});
