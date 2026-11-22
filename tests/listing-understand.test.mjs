import {test} from 'node:test';import assert from 'node:assert/strict';import {fixture,load} from './helpers/platform.mjs';
const {understandListing}=await load('listing-understand');
const {saveAIDataPermission,AI_DATA_POLICY_VERSION}=await load('ai-data-permission');
const config={OPENAI_API_KEY:'fixture',OPENAI_MODEL:'fixture-model'};
const answer=value=>Response.json({id:'fixture',usage:{input_tokens:300,output_tokens:80},output:[{type:'message',content:[{type:'output_text',text:typeof value==='string'?value:JSON.stringify(value)}]}]});

test('the owner\'s story becomes checked fields; no model or no permission sends nothing',async()=>{
 const f=await fixture(),original=globalThis.fetch;let calls=0,payload;
 try{
  globalThis.fetch=async(_,options)=>{calls++;payload=JSON.parse(options.body);return answer({type:'apartment',rooms:2,capacity:4,beds:null,bathrooms:null,area:55,floor:3,floors:9,city:'Павлодар',district:'Центр',address:'Кутузова 10, кв. 5',price:14000,hourlyPrice:null,minHours:null,nightlyPrice:null,deposit:null,cleaningFee:null,leastGuests:null,includedGuests:null,extraGuestPrice:null,prepMinutes:null,amenities:['wifi','nope'],pets:false,smoking:null,parties:null,checkinMethod:'lockbox',checkinTime:null,checkoutTime:null,ownStaff:null,name:null});};
  assert.deepEqual(await understandListing(f.owner,{text:'двушка на Кутузова'},{}),{status:'off'});
  assert.deepEqual(await understandListing(f.owner,{text:'двушка на Кутузова'},config),{status:'permission'});
  await assert.rejects(understandListing(f.guest,{text:'двушка'},config));
  assert.equal(calls,0);
  await saveAIDataPermission(f.owner,{allowed:true,expectedVersion:0,policyVersion:AI_DATA_POLICY_VERSION});
  const r=await understandListing(f.owner,{text:'двушка на Кутузова 10 кв 5, 14 тыщ сутки, звоните +7 700 123 45 67'},config);
  assert.equal(r.status,'ok');assert.equal(r.fields.rooms,2);assert.equal(r.fields.address,'Кутузова 10, кв. 5');assert.deepEqual(r.fields.amenities,['wifi']);assert.equal(r.fields.checkinMethod,'lockbox');
  assert.equal(payload.text.format.strict,true);assert.equal(payload.store,false);assert.doesNotMatch(JSON.stringify(payload.input),/700 123/);
  globalThis.fetch=async()=>answer('не JSON');
  assert.deepEqual(await understandListing(f.owner,{text:'двушка'},config),{status:'busy'});
 }finally{globalThis.fetch=original;f.db.close();}
});
