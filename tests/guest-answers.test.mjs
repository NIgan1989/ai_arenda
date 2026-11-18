import {test} from 'node:test';import assert from 'node:assert/strict';import {fixture,load} from './helpers/platform.mjs';
const {matchingAction}=await load('smart-matching'),{openDiscussion,sendDiscussionMessage,readDiscussion}=await load('process-discussions'),{guestTopics}=await load('guest-answers');
const chat=async(f)=>{const room=await openDiscussion(f.guest,'guest',{kind:'booking',entityId:f.booking});let n=0;return {room,send:(text,who=f.guest,role='guest')=>sendDiscussionMessage(who,role,{...room,text,requestKey:'k'+(n++)}),read:async()=>(await readDiscussion(f.guest,'guest',{...room,markRead:false})).messages};};

test('topics are recognised from plain Russian questions; a key question always goes to the owner',()=>{
 assert.deepEqual(guestTopics('Во сколько заезд?'),['checkin']);
 assert.deepEqual(guestTopics('Какой адрес и до скольки выезд?'),['checkout','address']);
 assert.deepEqual(guestTopics('Где взять ключи? Адрес какой?'),['access']);
 assert.equal(guestTopics('Здравствуйте!'),'greeting');assert.equal(guestTopics('Спасибо'),'thanks');
 assert.deepEqual(guestTopics('Есть ли фен?'),['other_question']);assert.deepEqual(guestTopics('Едем'),[]);
});

test('under autopilot the AI answers the guest from the booking facts and hands the rest to the owner',async()=>{
 const f=await fixture();try{
  await matchingAction(f.owner,'owner','preference',{propertyId:f.property,mode:'auto'});
  const c=await chat(f);
  await c.send('Здравствуйте, какой адрес и во сколько заезд?');
  let log=await c.read();assert.equal(log.length,2);const ai=log[1];
  assert.equal(ai.by_ai,1);assert.equal(ai.sender_role,'owner');assert.equal(ai.reply_to,log[0].seq);
  assert.match(ai.body,/Адрес: PRIVATE ADDRESS/);assert.match(ai.body,/Заезд:/);
  assert.equal(f.db.raw.prepare("SELECT COUNT(*) n FROM notifications WHERE user_id='guest' AND dedupe LIKE 'guest:discussion:%'").get().n,1,'the guest is told about the answer');
  await c.send('Где взять ключи?');log=await c.read();assert.match(log.at(-1).body,/передал/);
  assert.equal(f.db.raw.prepare("SELECT COUNT(*) n FROM notifications WHERE user_id='owner' AND dedupe LIKE 'owner:guest-question:%'").get().n,1);
  await c.send('Спасибо');assert.equal((await c.read()).length,5,'a thank-you gets no answer');
  // The owner writes personally: the AI stays quiet in this chat.
  await c.send('Здравствуйте, я на связи',f.owner,'owner');await c.send('Во сколько выезд?');
  log=await c.read();assert.equal(log.at(-1).sender_role,'guest');
  // A client cannot pass its own message off as the AI's.
  await assert.rejects(sendDiscussionMessage(f.guest,'guest',{...c.room,text:'fake',requestKey:'ai:1'}),/ключ/);
 }finally{f.db.close();}
});

test('the AI does not answer for an owner who answers personally, and never shows the address before confirmation',async()=>{
 const f=await fixture();try{
  await matchingAction(f.owner,'owner','preference',{propertyId:f.property,mode:'manual'});
  const c=await chat(f);await c.send('Какой адрес?');assert.equal((await c.read()).length,1);
  await matchingAction(f.owner,'owner','preference',{propertyId:f.property,mode:'auto'});
  f.db.raw.prepare("UPDATE bookings SET status='requested' WHERE id=?").run(f.booking);
  await c.send('А адрес какой?');const log=await c.read();
  assert.match(log.at(-1).body,/после подтверждения/);assert.doesNotMatch(log.at(-1).body,/PRIVATE ADDRESS/);
 }finally{f.db.close();}
});

// The model answers in the guest's own words, from the booking's facts only; keys and failures go the fixed way.
const {saveAIDataPermission,AI_DATA_POLICY_VERSION}=await load('ai-data-permission');
const config={OPENAI_API_KEY:'fake-test-key',OPENAI_MODEL:'fixture-model'};
const withModel=async(answer,run)=>{
 const real=globalThis.fetch,calls=[];
 globalThis.fetch=async(url,request)=>{if(!String(url).includes('api.openai.com'))return real(url,request);calls.push(JSON.parse(request.body));
  if(answer==='fail')return Response.json({error:{code:'server_error'}},{status:500});
  return Response.json({id:'r1',usage:{input_tokens:10,output_tokens:5},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(answer)}]}]});};
 try{await run(calls);}finally{globalThis.fetch=real;}
};
const modelChat=async(f,allow=true)=>{
 await matchingAction(f.owner,'owner','preference',{propertyId:f.property,mode:'auto'});
 if(allow)await saveAIDataPermission(f.guest,{allowed:true,expectedVersion:0,policyVersion:AI_DATA_POLICY_VERSION});
 const room=await openDiscussion(f.guest,'guest',{kind:'booking',entityId:f.booking});let n=0;
 return {send:text=>sendDiscussionMessage(f.guest,'guest',{...room,text,requestKey:'m'+(n++)},config),read:async()=>(await readDiscussion(f.guest,'guest',room)).messages,
  ownerAsked:()=>f.db.raw.prepare("SELECT COUNT(*) n FROM notifications WHERE user_id='owner' AND dedupe LIKE 'owner:guest-question:%'").get().n};
};

test('with a model the AI answers any question from the booking facts, never seeing the address',async()=>{
 const f=await fixture();try{const c=await modelChat(f);
  await withModel({reply:'Да, с ребёнком можно: жильё рассчитано на 2 гостей.',handoff:false},async calls=>{
   await c.send('А с ребёнком 5 лет можно приехать?');
   assert.equal(calls.length,1);const sent=JSON.stringify(calls[0]);
   assert.doesNotMatch(sent,/PRIVATE ADDRESS/);assert.match(sent,/No smoking/);assert.match(sent,/ребёнком/);
   const log=await c.read();assert.equal(log.at(-1).by_ai,1);assert.match(log.at(-1).body,/с ребёнком можно/);
   assert.equal(c.ownerAsked(),0,'an answered question does not bother the owner');
   // The address is added by the service itself, not by the model.
   await c.send('Какой адрес?');assert.match((await c.read()).at(-1).body,/Адрес: PRIVATE ADDRESS/);
  });
 }finally{f.db.close();}
});

test('the model hands a question to the owner, and stays quiet when nothing is asked',async()=>{
 const f=await fixture();try{const c=await modelChat(f);
  await withModel({reply:'Уточню у владельца и он ответит здесь.',handoff:true},async()=>{await c.send('Можно поставить машину во дворе на ночь?');});
  assert.equal(c.ownerAsked(),1);assert.match((await c.read()).at(-1).body,/Уточню у владельца/);
  await withModel({reply:'',handoff:false},async()=>{await c.send('Едем, будем через час');});
  assert.equal((await c.read()).at(-1).sender_role,'guest','a plain statement gets no answer');
 }finally{f.db.close();}
});

test('keys never go to the model; without permission or with a failed model the word rules answer',async()=>{
 const f=await fixture();try{const c=await modelChat(f,false);
  await withModel({reply:'x',handoff:false},async calls=>{
   await c.send('Есть ли фен?');assert.equal(calls.length,0,'no permission, no model');assert.match((await c.read()).at(-1).body,/передал/);
   await saveAIDataPermission(f.guest,{allowed:true,expectedVersion:0,policyVersion:AI_DATA_POLICY_VERSION});
   await c.send('Где взять ключи?');assert.equal(calls.length,0,'a key question goes to the owner by the rule');
  });
  await withModel('fail',async calls=>{await c.send('Во сколько заезд, подскажите?');assert.equal(calls.length,1);assert.match((await c.read()).at(-1).body,/Заезд:/);});
 }finally{f.db.close();}
});
