import {test} from 'node:test';import assert from 'node:assert/strict';import {fixture,load} from './helpers/platform.mjs';
const {understandSearch}=await load('search-understand');
const {saveAIDataPermission,AI_DATA_POLICY_VERSION}=await load('ai-data-permission');
const config={OPENAI_API_KEY:'fixture',OPENAI_MODEL:'fixture-model'};
const answer=value=>Response.json({id:'fixture',usage:{input_tokens:200,output_tokens:20},output:[{type:'message',content:[{type:'output_text',text:typeof value==='string'?value:JSON.stringify(value)}]}]});
const allow=f=>saveAIDataPermission(f.guest,{allowed:true,expectedVersion:0,policyVersion:AI_DATA_POLICY_VERSION});

test('no model on the server or no permission to send text: nothing leaves the service',async()=>{
 const f=await fixture(),original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return answer({phrase:'завтра на сутки',dropped:[]});};
 try{
  assert.deepEqual(await understandSearch(f.guest,{text:'с собакой на недельку'},{}),{status:'off'});
  assert.deepEqual(await understandSearch(f.guest,{text:'с собакой на недельку'},config),{status:'permission'});
  await assert.rejects(understandSearch(f.owner,{text:'с собакой на недельку'},config));
  await assert.rejects(understandSearch(f.guest,{text:''},config));
  assert.equal(calls,0);
 }finally{globalThis.fetch=original;f.db.close();}
});

test('the model only rewrites the phrase: strict schema, contacts redacted, the request is accounted once',async()=>{
 const f=await fixture(),original=globalThis.fetch;let payload;
 try{
  await allow(f);
  globalThis.fetch=async(_,options)=>{payload=JSON.parse(options.body);return answer({phrase:'  с 20 ноября   на 7 суток на двоих ',dropped:['с собакой','рядом с вокзалом','','x'.repeat(200)]});};
  const r=await understandSearch(f.guest,{text:'с собакой на недельку с 20-го, рядом с вокзалом, звоните +7 700 123 45 67'},config,['Павлодар','Астана']);
  assert.equal(r.status,'ok');assert.equal(r.phrase,'с 20 ноября на 7 суток на двоих');
  assert.deepEqual(r.dropped,['с собакой','рядом с вокзалом','x'.repeat(60)]);
  assert.equal(payload.text.format.type,'json_schema');assert.equal(payload.text.format.strict,true);assert.equal(payload.store,false);assert.equal(payload.tools,undefined);
  assert.match(payload.instructions,/Павлодар, Астана/);assert.doesNotMatch(JSON.stringify(payload.input),/700 123/);
  const holds=f.db.raw.prepare("SELECT status,input_tokens FROM ai_usage_reservations WHERE user_id='guest'").all();
  assert.equal(holds.length,1);assert.equal(holds[0].status,'completed');assert.equal(holds[0].input_tokens,200);
 }finally{globalThis.fetch=original;f.db.close();}
});

test('not a search, a broken answer or a failing model: the guest is told, nothing is guessed',async()=>{
 const f=await fixture(),original=globalThis.fetch;
 try{
  await allow(f);
  globalThis.fetch=async()=>answer({phrase:'',dropped:['с видом на реку']});
  assert.deepEqual(await understandSearch(f.guest,{text:'хочу вид на реку'},config),{status:'none',dropped:['с видом на реку']});
  globalThis.fetch=async()=>answer('не JSON');
  assert.deepEqual(await understandSearch(f.guest,{text:'что-нибудь'},config),{status:'busy'});
  globalThis.fetch=async()=>new Response('{}',{status:500});
  assert.deepEqual(await understandSearch(f.guest,{text:'что-нибудь'},config),{status:'busy'});
  globalThis.fetch=async()=>{throw new Error('network');};
  assert.deepEqual(await understandSearch(f.guest,{text:'что-нибудь'},config),{status:'busy'});
  const states=f.db.raw.prepare("SELECT status FROM ai_usage_reservations WHERE user_id='guest' ORDER BY created_at,id").all().map(r=>r.status).sort();
  assert.deepEqual(states,['completed','completed','uncertain','uncertain']);
 }finally{globalThis.fetch=original;f.db.close();}
});

test('a landmark is found in the searched city, for a guest only, and only as a point',async()=>{
 const {findPlace}=await load('map-workspace');
 const f=await fixture();try{
  const asked=[],hit=(lon,lat,name='Железнодорожный вокзал, Павлодар',type='station')=>async url=>{asked.push(String(url));return Response.json([{lon:String(lon),lat:String(lat),display_name:name,type}]);};
  const found=await findPlace(f.guest,{city:'Павлодар',place:'железнодорожный вокзал'},hit(76.97123456,52.30045678));
  assert.deepEqual(found,{found:true,longitude:76.9712,latitude:52.3005,name:'Железнодорожный вокзал'});
  assert.match(decodeURIComponent(asked[0]),/железнодорожный вокзал, Павлодар, Казахстан/);
  // A place of the same name in another city, the city itself, an unknown city, too short a word: not found.
  assert.deepEqual(await findPlace(f.guest,{city:'Павлодар',place:'вокзал'},hit(71.43,51.13)),{found:false});
  assert.deepEqual(await findPlace(f.guest,{city:'Павлодар',place:'павлодар'},hit(76.95,52.28,'Павлодар','city')),{found:false});
  assert.deepEqual(await findPlace(f.guest,{city:'Нигде',place:'вокзал'},hit(76.97,52.3)),{found:false});
  assert.deepEqual(await findPlace(f.guest,{city:'Павлодар',place:'я'},hit(76.97,52.3)),{found:false});
  assert.deepEqual(await findPlace(f.guest,{city:'Павлодар',place:'вокзал'},async()=>{throw new Error('down');}),{found:false});
  await assert.rejects(findPlace(f.owner,{city:'Павлодар',place:'вокзал'},hit(76.97,52.3)));
  // Forty questions an hour, then the search simply goes on over the whole city.
  for(let i=0;i<40;i++)await findPlace(f.guest,{city:'Павлодар',place:'вокзал'},hit(76.97,52.3));
  assert.deepEqual(await findPlace(f.guest,{city:'Павлодар',place:'вокзал'},hit(76.97,52.3)),{found:false});
 }finally{f.db.close();}
});
