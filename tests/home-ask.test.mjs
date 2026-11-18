import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from './helpers/platform.mjs';
const {homeAskFromText}=await load('home-ask');

test('the new object form tells a cleaning of the owner\'s own home from a listing',()=>{
 const a=homeAskFromText('Нужна генеральная уборка в моей двушке на Торайгырова 64, кв 12, помыть 3 окна');
 assert.ok(a);assert.equal(a.kind,'general');assert.equal(a.rooms,2);assert.equal(a.windows,3);assert.match(a.address,/Торайгырова 64/);
 assert.equal(homeAskFromText('Уборка после ремонта, Лермонтова 10').kind,'renovation');
 const plain=homeAskFromText('хочу найти уборщицу для своей квартиры');assert.ok(plain);assert.equal(plain.address,'');assert.equal(plain.rooms,undefined);
 // A listing that mentions cleaning stays a listing.
 assert.equal(homeAskFromText('Однушка на Торайгырова 64, до 3 гостей, 15 000 в сутки, уборка 3 000'),null);
 assert.equal(homeAskFromText('Сдаю двушку, уборку делаю сама'),null);
 assert.equal(homeAskFromText('Баня на Лесной 5, до 10 гостей, 5 000 в час'),null);
 assert.equal(homeAskFromText(''),null);
});
