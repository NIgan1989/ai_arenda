import {test} from 'node:test';import assert from 'node:assert/strict';import {load} from './helpers/platform.mjs';
const {guestLine}=await load('guest-line');
const now=1_800_000_000,day=86400;
const booking=(patch={})=>({id:'b',status:'confirmed',start:now+day,end:now+2*day,amount:20000,payment_status:'pending',terms:{paid_amount:0,deposit:0,version:1},...patch});

test('the line under the guest booking says the step the guest takes now',()=>{
 assert.equal(guestLine(booking({status:'requested'}),now,'test'),'Ждём ответа владельца.');
 assert.match(guestLine(booking(),now,'test'),/^Переведите оплату владельцу → Заезд завтра \d\d:\d\d$/);
 assert.match(guestLine(booking({terms:{paid_amount:20000,deposit:5000,deposit_status:'pending'}}),now,'test'),/^Переведите владельцу депозит, он вернётся/);
 // The stay and the deposit are one transfer to the owner; once the guest said «Я оплатил», the owner checks it.
 assert.match(guestLine(booking({terms:{paid_amount:0,deposit:5000,deposit_status:'pending',payment_reported_at:now,deposit_reported_at:now}}),now),/^Владелец проверяет перевод и подтвердит оплату → Заезд/);
 assert.match(guestLine(booking({terms:{paid_amount:0,deposit:5000,deposit_status:'pending'}}),now,'test'),/^Переведите владельцу оплату и депозит → Заезд/);
 assert.match(guestLine(booking({payment_status:'owner_verified',readiness:'ready',terms:{paid_amount:20000,deposit:0}}),now,'test'),/^Всё готово → Заезд/);
 // «Всё готово» waits for the payment, the deposit and the readiness: the owner cannot confirm the check-in without them.
 assert.match(guestLine(booking({readiness:'ready',terms:{paid_amount:0,deposit:0,payment_reported_at:now}}),now,'test'),/^Владелец проверяет перевод и подтвердит оплату/);
 assert.match(guestLine(booking({payment_status:'owner_verified',readiness:'ready',terms:{paid_amount:20000,deposit:5000,deposit_status:'pending',deposit_reported_at:now}}),now),/^Владелец проверяет перевод и подтвердит депозит/);
 assert.equal(guestLine(booking({payment_status:'owner_verified',terms:{paid_amount:20000,deposit:0}}),now,'test'),null);
 assert.match(guestLine(booking({start:now-3600,end:now+day,terms:{paid_amount:20000,deposit:0,actual_checkin:now-3600}}),now,'test'),/^Вы в жилье → Выезд/);
 assert.match(guestLine(booking({status:'completed'}),now,'test'),/^Проживание завершено/);
});
test('nothing to do leaves the general hint of the process',()=>{
 assert.equal(guestLine(booking({status:'completed',review_rating:5}),now,'test'),null);
 assert.equal(guestLine(booking({status:'cancelled'}),now,'test'),null);
 assert.equal(guestLine(null,now),null);
});
