import {test} from 'node:test';import assert from 'node:assert/strict';import {load} from './helpers/platform.mjs';
const {stayInterval,stayStamp,stayDay,stayTimes,stayDays,defaultStay,settleStay,stayFromInterval,stayModes,stayLimits,stayUnit}=await load('stay-choice'),{rentalPrice,changeRentalPrice}=await load('rental-policy');
const at=iso=>Math.floor(Date.parse(iso)/1000),day13=at('2026-11-12T19:00:00Z'),policy={hourly_price:2000,min_hours:3,nightly_price:9000,checkin_minutes:840,checkout_minutes:720};
test('a moment is sent as Kazakhstan time',()=>{assert.equal(stayStamp(day13+14*3600),'2026-11-13T14:00+05:00');assert.equal(Date.parse(stayStamp(day13+14*3600))/1000,day13+14*3600);assert.equal(stayDay(day13+86399),day13);});
test('every tariff gives an interval the price rules accept',()=>{
 const daily=stayInterval({mode:'daily',day:day13,time:900,count:2},policy);assert.equal(daily.end-daily.start,2*86400);assert.equal(rentalPrice(10000,policy,daily.start,daily.end,'daily').amount,20000);
 const hourly=stayInterval({mode:'hourly',day:day13,time:600,count:3},policy);assert.equal(rentalPrice(10000,policy,hourly.start,hourly.end,'hourly').amount,6000);
 const nightly=stayInterval({mode:'nightly',day:day13,time:0,count:2},policy);assert.equal(stayStamp(nightly.start),'2026-11-13T14:00+05:00');assert.equal(stayStamp(nightly.end),'2026-11-15T12:00+05:00');assert.equal(rentalPrice(10000,policy,nightly.start,nightly.end,'nightly').amount,18000);});
test('only offered tariffs and sensible limits',()=>{assert.deepEqual(stayModes({price:1,policy:{}}),['daily']);assert.deepEqual(stayModes({price:1,policy}),['daily','hourly','nightly']);assert.equal(stayLimits('hourly',policy).min,3);assert.equal(stayLimits('daily',policy).min,1);});
test('today offers only the time still ahead and the choice is kept possible',()=>{const now=day13+13*3600+600;assert.equal(stayTimes(day13,now)[0],810);assert.equal(stayTimes(day13+86400,now).length,48);assert.equal(stayDays(now,3)[2],day13+2*86400);
 assert.deepEqual(settleStay({mode:'hourly',day:day13,time:300,count:1},policy,now),{mode:'hourly',day:day13,time:810,count:3});
 assert.equal(settleStay({mode:'daily',day:day13,time:600,count:0},policy,day13+86399).day,day13+86400);
 assert.equal(settleStay({mode:'nightly',day:day13,time:5,count:2},policy,now).time,840);});
test('the first offer: tomorrow at check-in, or the nearest hour',()=>{const now=day13+13*3600+600;assert.deepEqual(defaultStay('daily',policy,now),{mode:'daily',day:day13+86400,time:840,count:1});assert.deepEqual(defaultStay('hourly',policy,now),{mode:'hourly',day:day13,time:840,count:3});});
test('two moments become the same stay',()=>{assert.deepEqual(stayFromInterval('hourly',day13+3*3600,day13+6*3600,policy),{mode:'hourly',day:day13,time:180,count:3});assert.deepEqual(stayFromInterval('daily',day13+14*3600,day13+86400+12*3600,policy),{mode:'daily',day:day13,time:840,count:1});assert.equal(stayFromInterval('nightly',day13+14*3600,day13+2*86400+12*3600,policy).count,2);});
test('units are declined',()=>{assert.equal([1,2,5,11,21,22].map(n=>stayUnit('hourly',n)).join(),'час,часа,часов,часов,час,часа');assert.equal([1,2,5].map(n=>stayUnit('daily',n)).join(),'сутки,суток,суток');assert.equal([1,3,7].map(n=>stayUnit('nightly',n)).join(),'ночь,ночи,ночей');});
test('a whole day as the hourly minimum stays possible',()=>{const whole={...policy,min_hours:24},limits=stayLimits('hourly',whole);assert.deepEqual(limits,{min:24,max:24});const choice=settleStay(defaultStay('hourly',whole,day13+3600),whole,day13+3600),span=stayInterval(choice,whole);assert.equal(choice.count,24);assert.doesNotThrow(()=>rentalPrice(10000,whole,span.start,span.end,'hourly'));});
test('«На ночь»: a late arrival keeps its night, the cheaper tariff is taken, a day check-in is not a night',()=>{
 const k=iso=>at(iso+'+05:00');
 // In at 23:30 or at 01:30 after midnight, out at noon: one night at the nightly price.
 assert.deepEqual(rentalPrice(10000,policy,k('2026-11-13T23:30:00'),k('2026-11-14T12:00:00'),'nightly').periods,1);
 assert.equal(rentalPrice(10000,policy,k('2026-11-14T01:30:00'),k('2026-11-14T12:00:00'),'nightly').amount,9000);
 // 12:30 is between check-out and check-in: an early check-in, not a night.
 assert.throws(()=>rentalPrice(10000,policy,k('2026-11-13T12:30:00'),k('2026-11-14T12:00:00'),'nightly'));
 // The «night» request takes the nightly price where it is cheaper and started days otherwise.
 const night=rentalPrice(10000,policy,k('2026-11-14T01:30:00'),k('2026-11-14T12:00:00'),'night');assert.equal(night.billingMode,'nightly');assert.equal(night.amount,9000);
 assert.equal(rentalPrice(8000,policy,k('2026-11-14T01:30:00'),k('2026-11-14T12:00:00'),'night').billingMode,'daily');
 assert.equal(rentalPrice(10000,{...policy,nightly_price:0},k('2026-11-14T01:30:00'),k('2026-11-14T12:00:00'),'night').billingMode,'daily');
 assert.equal(rentalPrice(10000,policy,k('2026-11-14T13:00:00'),k('2026-11-15T12:00:00'),'night').billingMode,'daily');
});
test('a late arrival on the nightly tariff adds no early hours when the stay is changed',()=>{
 const k=iso=>at(iso+'+05:00');
 const late=changeRentalPrice(10000,policy,k('2026-11-14T01:30:00'),k('2026-11-15T12:00:00'),'nightly');assert.equal(late.extraHours,0);assert.equal(late.amount,18000);
 const early=changeRentalPrice(10000,policy,k('2026-11-13T12:00:00'),k('2026-11-14T12:00:00'),'nightly');assert.equal(early.extraHours,2);assert.equal(early.amount,9000+2*2000);
});
