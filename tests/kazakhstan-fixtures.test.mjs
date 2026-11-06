import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {fixture,load} from './helpers/platform.mjs';
const {isolateTestConfig}=await load('test-environment');
test('city coverage contains 90 unique cities and exact city search does not include substring neighbours',async()=>{
 const geo=JSON.parse(readFileSync('tests/fixtures/kazakhstan-cities.json','utf8')),names=Object.values(geo.regions).flat();assert.equal(names.length,90);assert.equal(new Set(names).size,90);
 const f=await fixture();try{for(const city of ['Шар','Шардара','Ушарал'])await f.owner.createProperty({title:'Тест '+city,city,district:'Центр',address:'Тестовый адрес',description:'Тест',price:10000,rooms:1,capacity:2,cleaningMinutes:60});const result=await f.owner.publicSearch({city:'шар'});assert.equal(result.total,1);assert.equal(result.properties[0].city,'Шар');assert.equal((await f.owner.publicSearch({city:'ушар'})).total,1);}finally{f.db.close();}
});
test('synthetic environment cannot use live model, delivery, payment or bucket settings',()=>{
 const live={TEST_DATA_ONLY:'0',OPENAI_API_KEY:'fixture-key',SMS_GATEWAY_TOKEN:'fixture-token'};assert.equal(isolateTestConfig(live),live);
 const testConfig=isolateTestConfig({...live,TEST_DATA_ONLY:'1',PAYMENT_GATEWAY_TOKEN:'fixture-payment',BUCKET:{},DB:'fixture-db'});assert.equal(testConfig.OPENAI_API_KEY,undefined);assert.equal(testConfig.SMS_GATEWAY_TOKEN,undefined);assert.equal(testConfig.PAYMENT_GATEWAY_TOKEN,undefined);assert.equal(testConfig.BUCKET,undefined);assert.equal(testConfig.DB,'fixture-db');
 const optedIn=isolateTestConfig({...live,TEST_DATA_ONLY:'1',TEST_AI_ENABLED:'1',OPENAI_MODEL:'fixture-model',PAYMENT_GATEWAY_TOKEN:'fixture-payment'});assert.equal(optedIn.OPENAI_API_KEY,'fixture-key');assert.equal(optedIn.OPENAI_MODEL,'fixture-model');assert.equal(optedIn.SMS_GATEWAY_TOKEN,undefined);assert.equal(optedIn.PAYMENT_GATEWAY_TOKEN,undefined);
});
