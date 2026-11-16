import {test} from 'node:test';import assert from 'node:assert/strict';import {load} from './helpers/platform.mjs';
const {noticeTone,silentNotice,roleEvents,noticeOpen,eventsToday,freshEvents,noticeText}=await load('notice-feed');
const now=Date.UTC(2026,10,14,7,0)/1000; // 12:00 в Алматы
const n=(dedupe,body='',created_at=now)=>({id:dedupe,dedupe,body,created_at});

test('шаг, который ИИ сделал сам, остаётся в журнале; всё, что требует человека, — событие',()=>{
 assert.equal(noticeTone(n('owner:administrator-approved:j1')),'calm');
 assert.equal(noticeTone(n('owner:administrator-assigned:j1')),'calm');
 assert.equal(noticeTone(n('owner:matching-auto:o1')),'calm');
 // Бронь, заезд и выезд, проведённые ИИ, — про деньги и жильё; взятая автопилотом уборка — работа, на которую ехать.
 assert.equal(noticeTone(n('owner:administrator-confirmed:b1')),'event');
 assert.equal(noticeTone(n('owner:administrator-checkin:b1')),'event');
 assert.equal(noticeTone(n('cleaner:autopilot-took:o1')),'event');
 // Поздний выезд снял назначение: исполнителю нужно откликнуться заново.
 assert.equal(noticeTone(n('cleaner:checkout-reschedule:j1:4')),'event');
 // ИИ напомнил о сроке, передал задержку, снял назначение: это всё ещё требует внимания.
 assert.equal(noticeTone(n('owner:overdue-escalated:j1')),'event');
 assert.equal(noticeTone(n('cleaner:overdue-remind:j1')),'event');
 assert.equal(noticeTone(n('owner:no-show:j1')),'event');
 // ИИ проверил отчёт и просит принять уборку: решение за владельцем.
 assert.equal(noticeTone(n('owner:administrator-review:j1:3')),'event');
 // Заявка гостя, оплата, отчёт с замечаниями и сообщения людей — события.
 assert.equal(noticeTone(n('owner:booking:b1','Новая заявка на «Студию»')),'event');
 assert.equal(noticeTone(n('owner:booking:b1','ИИ-администратор принял бронь на «Студию»')),'event');
 assert.equal(noticeTone(n('owner:administrator-review-issue:j1:3')),'event');
 assert.equal(noticeTone(n('guest:payment:b1')),'event');
 assert.equal(noticeTone({}),'event');
});

test('в Telegram и push не уходит то, после чего владельцу делать нечего',()=>{
 assert.equal(silentNotice('owner:administrator-approved:j1'),true);
 assert.equal(silentNotice('owner:administrator-assigned:j1'),true);
 assert.equal(silentNotice('owner:regular-assigned:j1'),true);
 assert.equal(silentNotice('owner:matching-auto:o1'),true);
 // Бронь, заезд и выезд — про деньги и жильё: о них сообщаем, даже когда их провёл ИИ.
 assert.equal(silentNotice('owner:administrator-confirmed:b1'),false);
 assert.equal(silentNotice('owner:administrator-checkin:b1'),false);
 assert.equal(silentNotice('owner:administrator-checkout:b1'),false);
 assert.equal(silentNotice('owner:administrator-review:j1:3'),false);
 assert.equal(silentNotice('owner:overdue-escalated:j1'),false);
 // Исполнителю о взятой за него уборке сообщаем: ему ехать.
 assert.equal(silentNotice('cleaner:autopilot-took:o1'),false);
 assert.equal(silentNotice('owner:booking:b1','Новая заявка'),false);
 assert.equal(silentNotice(null),false);
});

test('события одной роли, новые первыми, и что открыть по нажатию',()=>{
 const list=[n('owner:booking:b1','Новая заявка',now-600),n('owner:administrator-approved:j1','',now-300),n('cleaner:offer:j2','Вам предложили уборку',now-100),n('owner:payment:b2','Гость оплатил',now-60),n('owner:overdue-escalated:j1','',now-2*86400)];
 assert.deepEqual(roleEvents(list,'owner').map(v=>v.dedupe),['owner:payment:b2','owner:booking:b1','owner:overdue-escalated:j1']);
 assert.deepEqual(roleEvents(list,'cleaner').map(v=>v.dedupe),['cleaner:offer:j2']);
 assert.deepEqual(roleEvents(null,'owner'),[]);
 // Новая редакция той же задачи заменяет прежнюю: в списке одна строка.
 const task='owner:administrator:["o","booking","b1","checkin","o","owner"]';
 assert.deepEqual(roleEvents([n(task+':1','',now-900),n(task+':2','',now-30),n('owner:booking:b1','',now-600)],'owner').map(v=>v.dedupe),[task+':2','owner:booking:b1']);
 assert.equal(noticeText('ИИ-администратор: Требует внимания. Проверить заселение. Студия'),'Проверить заселение. Студия');
 assert.equal(noticeText('ИИ-администратор: заявка истекла без решения.'),'Заявка истекла без решения.');
 assert.equal(noticeText('Новая заявка на «Студию»'),'Новая заявка на «Студию»');assert.equal(noticeText(null),'');
 assert.equal(eventsToday(roleEvents(list,'owner'),now),2);
 const data={bookings:[{id:'b1'}],jobs:[{id:'j1'}]};
 assert.deepEqual(noticeOpen('owner:booking:b1',data),{kind:'booking',id:'b1'});
 assert.deepEqual(noticeOpen('owner:administrator-review-issue:j1:3',data),{kind:'job',id:'j1'});
 // Чужую или неизвестную вещь ключ не открывает.
 assert.equal(noticeOpen('owner:booking:b9',data),null);
 assert.equal(noticeOpen('owner:price:p1',data),null);
 assert.equal(noticeOpen(undefined,data),null);
 // Предложенное изменение брони открывает саму бронь: ответ дают в её карточке. Отклик открывает свою уборку.
 const held={bookings:[{id:'b1',changes:[{id:'c1'}]},{id:'b2',changes:null}],jobs:[{id:'j1'}],applications:[{id:'a1',job_id:'j1'},{id:'a2',job_id:'j9'}]};
 assert.deepEqual(noticeOpen('guest:change:c1',held),{kind:'booking',id:'b1'});
 assert.equal(noticeOpen('guest:change:c9',held),null);
 assert.deepEqual(noticeOpen('owner:application:a1',held),{kind:'job',id:'j1'});
 assert.equal(noticeOpen('owner:application:a2',held),null);
 // Задача ИИ-администратора несёт свои номера списком внутри ключа.
 assert.deepEqual(noticeOpen('owner:administrator:["o","booking","b1","checkin","o","owner"]:2',data),{kind:'booking',id:'b1'});
 // Вслух над картой: только новое с прошлого взгляда и только события этой роли.
 assert.deepEqual(freshEvents(list,new Set(['owner:booking:b1']),'owner').map(v=>v.dedupe),['owner:payment:b2','owner:overdue-escalated:j1']);
 assert.deepEqual(freshEvents(list,new Set(list.map(v=>v.id)),'owner'),[]);
});
