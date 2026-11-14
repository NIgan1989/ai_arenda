import {test} from 'node:test';import assert from 'node:assert/strict';import {load} from './helpers/platform.mjs';
const {guestLine}=await load('guest-line');
const now=1_800_000_000,day=86400;
const booking=(patch={})=>({id:'b',status:'confirmed',start:now+day,end:now+2*day,amount:20000,payment_status:'pending',terms:{paid_amount:0,deposit:0,version:1},...patch});

test('the line under the guest booking says the step the guest takes now',()=>{
 assert.equal(guestLine(booking({status:'requested'}),now,'test'),'Ждём ответа владельца.');
 assert.match(guestLine(booking(),now,'test'),/^Оплатите бронь.*→ Заезд завтра \d\d:\d\d$/);
 assert.match(guestLine(booking({terms:{paid_amount:20000,deposit:5000,deposit_status:'pending'}}),now,'test'),/^Внесите депозит/);
 // The stay and the deposit are one payment.
 assert.match(guestLine(booking({terms:{paid_amount:0,deposit:5000,deposit_status:'pending'}}),now,'test'),/^Оплатите бронь и депозит одним платежом → Заезд/);
 assert.match(guestLine(booking({payment_status:'owner_verified',readiness:'ready',terms:{paid_amount:20000,deposit:0}}),now,'test'),/^Всё готово → Заезд/);
 // «Всё готово» waits for the payment, the deposit and the readiness: the owner cannot confirm the check-in without them.
 assert.match(guestLine(booking({readiness:'ready',terms:{paid_amount:20000,deposit:0}}),now,'test'),/^Ждём, когда владелец подтвердит оплату/);
 assert.match(guestLine(booking({readiness:'ready'}),now,'live'),/^Ждём, когда владелец подтвердит оплату/);
 assert.match(guestLine(booking({payment_status:'owner_verified',readiness:'ready',terms:{paid_amount:20000,deposit:5000,deposit_status:'pending'}}),now,'live'),/^Ждём, когда владелец подтвердит депозит/);
 assert.equal(guestLine(booking({payment_status:'owner_verified',terms:{paid_amount:20000,deposit:0}}),now,'test'),null);
 assert.match(guestLine(booking({start:now-3600,end:now+day,terms:{paid_amount:20000,deposit:0,actual_checkin:now-3600}}),now,'test'),/^Вы в жилье → Выезд/);
 assert.match(guestLine(booking({status:'completed'}),now,'test'),/^Проживание завершено/);
});
test('nothing to do leaves the general hint of the process',()=>{
 assert.equal(guestLine(booking({status:'completed',review_rating:5}),now,'test'),null);
 assert.equal(guestLine(booking({status:'cancelled'}),now,'test'),null);
 assert.equal(guestLine(null,now),null);
});
