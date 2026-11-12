import {test} from 'node:test';import assert from 'node:assert/strict';import {load} from './helpers/platform.mjs';
const {recordGroup,groupRecords,recordGroupLabels}=await load('record-groups');
const at=iso=>Math.floor(Date.parse(iso)/1000),now=at('2026-11-13T10:00:00+05:00');
test('a record falls into the group of its Kazakhstan day',()=>{
 assert.equal(recordGroup({start:now-3600,end:now+3600},now),'now');
 assert.equal(recordGroup({start:at('2026-11-13T23:30:00+05:00'),end:at('2026-11-14T01:00:00+05:00')},now),'today');
 assert.equal(recordGroup({start:at('2026-11-14T00:00:00+05:00'),end:at('2026-11-14T02:00:00+05:00')},now),'tomorrow');
 assert.equal(recordGroup({start:at('2026-11-15T00:00:00+05:00'),end:at('2026-11-15T02:00:00+05:00')},now),'later');
 assert.equal(recordGroup({start:now-7200,end:now},now),'past');assert.equal(recordGroupLabels.past,'Прошедшие');
});
test('groups go from now to later, and the past starts with the most recent',()=>{
 const list=groupRecords([{id:'old',start:now-9*86400,end:now-8*86400},{id:'later',start:now+5*86400,end:now+6*86400},{id:'recent',start:now-7200,end:now-3600},{id:'now',start:now-60,end:now+60},{id:'soon',start:now+3600,end:now+7200},{id:'next',start:now+86400,end:now+90000}],now);
 assert.deepEqual(list.map(i=>i.id),['now','soon','next','later','recent','old']);assert.deepEqual(list.map(i=>i._group),['now','today','tomorrow','later','past','past']);
});
