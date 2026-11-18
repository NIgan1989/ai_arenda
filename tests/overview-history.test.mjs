import {test} from 'node:test';import assert from 'node:assert/strict';import {load} from './helpers/platform.mjs';
const {ownerRequestTab,ownerRequestTabs}=await load('booking-filters');
const {pruneHistory,messageTime,splitAt,historyLine,historyRows}=await load('conversation-history');
const {overviewBoard,boardTabs}=await load('overview-board');
const now=1_800_000_000;
test('the owner\'s «Заявки»: new requests, bookings, archive',()=>{
 assert.deepEqual(ownerRequestTabs.map(t=>t.label),['Новые','Брони','Архив']);
 assert.equal(ownerRequestTab({status:'requested',expires_at:now+60},'o',now),'new');
 assert.equal(ownerRequestTab({status:'requested',expires_at:now-60},'o',now),'archive');
 assert.equal(ownerRequestTab({status:'confirmed'},'o',now),'booked');
 for(const status of ['completed','cancelled','expired'])assert.equal(ownerRequestTab({status},'o',now),'archive');
 // money still owed to the guest keeps it among the bookings
 assert.equal(ownerRequestTab({status:'cancelled',owner_id:'o',terms:{paid_amount:5000}},'o',now),'booked');
});
const id=(ms,n=1)=>ms.toString(36)+'-'+n+'-abcdefgh';
test('history older than a week is dropped, undated messages stay',()=>{
 const t=Date.UTC(2026,10,18,12);
 assert.equal(messageTime(id(t)),t);assert.equal(messageTime('page-bookings'),0);
 const kept=pruneHistory([{id:id(t-8*864e5),sender:'user',text:'old'},{id:id(t-2*864e5),sender:'user',text:'new'},{id:'legacy',sender:'user',text:'x'}],t);
 assert.deepEqual(kept.map(m=>m.text),['new','x']);
});
test('a page shows what was said after it opened',()=>{
 const m=[{id:'a'},{id:'b'},{id:'c'}];
 assert.deepEqual(splitAt(m,'b'),{before:[{id:'a'},{id:'b'}],after:[{id:'c'}]});
 assert.deepEqual(splitAt(m,'gone').after.length,3);assert.deepEqual(splitAt(m,'').before,[]);
});
test('history lines and days',()=>{
 assert.equal(historyLine({id:'x',sender:'user',text:'Покажи мои брони'}),'Вы: Покажи мои брони');
 assert.equal(historyLine({id:'x',sender:'assistant',text:'',block:'confirm',payload:{title:'Закрепить исполнителя'},done:true,result:'Отменено'}),'Закрепить исполнителя — Отменено');
 assert.equal(historyLine({id:'x',sender:'assistant',text:'',block:'bookings'}),'Брони');
 const t=Date.UTC(2026,10,18,12),rows=historyRows([{id:id(t-864e5),sender:'user',text:'a'},{id:id(t-60000),sender:'user',text:'b'},{id:id(t-30000),sender:'user',text:'c'}],t);
 assert.deepEqual(rows.map(r=>[r.line,r.day]),[['Вы: c','Сегодня'],['Вы: b',''],['Вы: a','Вчера']]);
});
test('«Сводка»: each thing in one tab, a request with an approval card is not said twice',()=>{
 assert.deepEqual(boardTabs.map(t=>t.label),['Ждут вас','Сейчас','Скоро']);
 const data={bookings:[{id:'b1',status:'confirmed',start:now-3600,end:now+3600},{id:'b2',status:'requested',start:now+86400,end:now+90000}],jobs:[{id:'j1',status:'assigned'}]};
 const workspace={attention:[{id:'booking:b2:Подтвердить заявку',entityId:'b2',kind:'booking',title:'Подтвердить заявку',detail:'Дом',at:now+600,urgent:true}],
  upcoming:[{id:'booking:b1:Выезд',entityId:'b1',kind:'booking',title:'Выезд',detail:'Дом',at:now+3600,urgent:false},{id:'job:j1',entityId:'j1',kind:'job',title:'Уборка назначена',detail:'Дом',at:now+7200,urgent:false}]};
 const board=overviewBoard(workspace,[{id:'a1',kind:'booking',entityId:'b2',title:'Запрос на бронирование',subject:'Дом',canDecide:true,expiresAt:now+600}],data,now);
 assert.deepEqual(board.decide.map(i=>i.title),['Запрос на бронирование']);
 assert.deepEqual(board.now.map(i=>i.title),['Выезд']);
 assert.deepEqual(board.soon.map(i=>i.title),['Уборка назначена']);
});
test('a guest\'s request waiting for the owner is one line, in «Сейчас»',()=>{
 const data={bookings:[{id:'b2',status:'requested',start:now+86400,end:now+90000}]};
 const workspace={attention:[],upcoming:[{id:'booking:b2:w',entityId:'b2',kind:'booking',title:'Ожидается решение владельца',detail:'Дом',at:now+600,urgent:false}]};
 const board=overviewBoard(workspace,[{id:'a1',kind:'booking',entityId:'b2',title:'Запрос на бронирование',subject:'Дом',canDecide:false,expiresAt:now+600}],data,now);
 assert.deepEqual([board.decide.length,board.now.length,board.soon.length],[0,1,0]);
});
