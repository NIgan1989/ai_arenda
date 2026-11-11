import {test} from 'node:test';
import assert from 'node:assert/strict';
import {load} from './helpers/platform.mjs';
const {browserLocationFix,requestBrowserLocation}=await load('browser-location');
const position=overrides=>({coords:{longitude:76.95,latitude:52.287,accuracy:1200,...overrides},timestamp:Date.now()});

test('private location preserves coarse device accuracy without silently dropping a valid position',async()=>{
 let options;
 const fix=await requestBrowserLocation({getCurrentPosition(success,_error,config){options=config;success(position());}},true);
 assert.equal(fix.accuracy,1200);assert.equal(fix.longitude,76.95);assert.equal(options.enableHighAccuracy,false);assert.ok(options.timeout>0);
 assert.equal(browserLocationFix(position({latitude:NaN})),null);
 assert.equal(browserLocationFix({...position(),timestamp:Date.now()-91000}),null);
});

test('location failure distinguishes permission, unavailable provider, insecure origin and timeout',async()=>{
 for(const [code,pattern] of [[1,/запрещён/],[2,/не получил координаты/],[3,/отведённое время/]]){
  await assert.rejects(requestBrowserLocation({getCurrentPosition(_success,failure){failure({code});}},true),pattern);
 }
 await assert.rejects(requestBrowserLocation(undefined,true),/не поддерживает/);
 await assert.rejects(requestBrowserLocation(undefined,false),/HTTPS/);
});

test('an embedded browser with no callback cannot leave location searching forever',async()=>{
 let success;
 const result=requestBrowserLocation({getCurrentPosition(callback){success=callback;}},true,1);
 await assert.rejects(result,/отведённое время/);
 // Late results do not change an already settled failure.
 success(position());
});
