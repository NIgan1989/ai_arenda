import {test} from 'node:test';import assert from 'node:assert/strict';import {load} from './helpers/platform.mjs';const {recordSpan}=await load('record-span');
// 2026-11-13 03:05 in Kazakhstan (UTC+5) is 2026-11-12 22:05 UTC.
const at=(iso)=>Math.floor(Date.parse(iso)/1000);
test('one day is named once and the times are joined',()=>{assert.equal(recordSpan(at('2026-11-12T22:05:00Z'),at('2026-11-13T00:05:00Z')),'13 ноября, 03:05–05:05');});
test('several days keep both dates',()=>{assert.equal(recordSpan(at('2026-11-13T09:00:00Z'),at('2026-11-15T07:00:00Z')),'13 ноября, 14:00 → 15 ноября, 12:00');});
test('the day is taken in Kazakhstan time, not in UTC',()=>{assert.equal(recordSpan(at('2026-11-13T18:30:00Z'),at('2026-11-13T20:00:00Z')),'13 ноября, 23:30 → 14 ноября, 01:00');});
test('a missing start or end does not invent a time',()=>{assert.equal(recordSpan(0,5),'—');assert.equal(recordSpan(at('2026-11-12T22:05:00Z')),'13 ноября, 03:05');});
