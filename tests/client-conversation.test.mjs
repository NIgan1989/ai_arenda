import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,load} from './helpers/platform.mjs';
const {clientConversation}=await load('client-conversation');

const messages=[{id:'draft-message',sender:'assistant',text:'Когда заедете?'}];
function bookingFlow(propertyId){return {
 kind:'booking',role:'guest',endpoint:'bookings',after:'bookings',index:1,
 questions:[
  {key:'billingMode',text:'Какой тариф выбираете?',label:'Тариф',choices:[{label:'Сутки',value:'daily'},{label:'Почасово',value:'hourly'}]},
  {key:'start',text:'Когда заедете?',label:'Заезд',date:true},
  {key:'guests',text:'Сколько будет гостей?',label:'Гостей',min:1,max:2}
 ],answers:{billingMode:'daily'},extra:{propertyId,requestKey:'preserved-request'}
};}

test('a resumable role-bound booking draft roundtrips, advances and clears without performing its endpoint',async()=>{
 const f=await fixture();try{
  const flow=bookingFlow(f.property),before=f.db.raw.prepare('SELECT COUNT(*) n FROM bookings').get().n;
  assert.deepEqual(await clientConversation(f.guest,'guest',{messages,flow,actor:'owner'}),{saved:true});
  const restored=await clientConversation(f.guest,'guest');assert.deepEqual(restored,{messages,flow,actor:'guest'});
  assert.equal(restored.flow.questions[restored.flow.index].key,'start');assert.equal(restored.flow.extra.requestKey,'preserved-request');
  const advanced={...flow,index:2,answers:{...flow.answers,start:'2026-11-07T14:00:00+05:00'}};
  await clientConversation(f.guest,'guest',{messages,flow:advanced});assert.deepEqual((await clientConversation(f.guest,'guest')).flow,advanced);
  await clientConversation(f.guest,'guest',{messages,flow:null});assert.equal((await clientConversation(f.guest,'guest')).flow,null);
  assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM bookings').get().n,before);
 }finally{f.db.close();}
});

test('invalid step, action endpoint or role cannot overwrite a previously saved valid draft',async()=>{
 const f=await fixture();try{
  const flow=bookingFlow(f.property);await clientConversation(f.guest,'guest',{messages,flow});
  const invalid=[
   ...[-1,1.5,'1',flow.questions.length].map(index=>({flow:{...flow,index},status:400})),
   ...['operations/finance','bookings/booking-id/changes','../jobs','https://foreign.test/api/bookings'].map(endpoint=>({flow:{...flow,endpoint},status:400})),
   {flow:{...flow,role:'owner'},status:403},
   {flow:{...flow,questions:[]},status:400},
   {flow:{...flow,questions:[{key:'constructor',text:'Untrusted question',label:'Unsafe'}],index:0},status:400}
  ];
  for(const candidate of invalid){
   await assert.rejects(clientConversation(f.guest,'guest',{messages,flow:candidate.flow}),e=>e.status===candidate.status);
   assert.deepEqual((await clientConversation(f.guest,'guest')).flow,flow);
  }
 }finally{f.db.close();}
});

test('legacy malformed drafts are returned as invalid and non-resumable while their owned transcript remains intact',async()=>{
 const f=await fixture();try{
  const flow=bookingFlow(f.property);
  for(const broken of [{...flow,index:20},{...flow,endpoint:'operations/finance'},{...flow,role:'owner'},{role:'guest',index:0}]){
   const stored=JSON.stringify({messages,flow:broken,actor:'guest'});
   f.db.raw.prepare('INSERT INTO client_conversations VALUES (?,?,?,?) ON CONFLICT(user_id,role) DO UPDATE SET body=excluded.body').run('guest','guest',stored,1);
   const restored=await clientConversation(f.guest,'guest');assert.equal(restored.flow,null);assert.equal(restored.draftInvalid,true);assert.deepEqual(restored.messages,messages);
   assert.equal(f.db.raw.prepare("SELECT body FROM client_conversations WHERE user_id='guest' AND role='guest'").get().body,stored);
  }
 }finally{f.db.close();}
});

test('drafts stay isolated between connected roles and accounts, including issue flows for a specific booking',async()=>{
 const f=await fixture();try{
  await f.guest.connectRole('owner',{});const guestFlow=bookingFlow(f.property);
  const ownerFlow={kind:'issue',role:'owner',endpoint:'bookings/'+f.booking,after:'bookings',index:0,questions:[{key:'issue',text:'Что произошло?',label:'Проблема'}],answers:{},extra:{action:'issue'}};
  await clientConversation(f.guest,'guest',{messages,flow:guestFlow});await clientConversation(f.guest,'owner',{messages:[],flow:ownerFlow});
  assert.deepEqual((await clientConversation(f.guest,'guest')).flow,guestFlow);assert.deepEqual((await clientConversation(f.guest,'owner')).flow,ownerFlow);
  assert.deepEqual(await clientConversation(f.owner,'owner'),{messages:[],flow:null,actor:'owner'});
  await f.other.connectRole('guest',{});assert.deepEqual(await clientConversation(f.other,'guest'),{messages:[],flow:null,actor:'guest'});
  await assert.rejects(clientConversation(f.cleaner,'owner'),e=>e.status===403);
 }finally{f.db.close();}
});
