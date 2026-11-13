import {test} from 'node:test';import assert from 'node:assert/strict';import {fixture,load,now} from './helpers/platform.mjs';
import {photo} from './fixtures/photo.mjs';
const {openDiscussion,readDiscussion,sendDiscussionMessage,discussionCandidates}=await load('process-discussions'),{discussionIntent}=await load('discussion-intent'),{RentalService}=await load('service');
const {discussionInbox,discussionPhoto,discussionTyping}=await load('process-discussions');
async function assign(f){await f.cleaner.jobAction(f.job.id,{action:'apply'});const a=f.db.raw.prepare('SELECT id FROM applications WHERE job_id=?').get(f.job.id);await f.owner.jobAction(f.job.id,{action:'assign',applicationId:a.id});}
test('assistant recognises chat requests without confusing them with ordinary booking commands',()=>{assert.equal(discussionIntent('Открой чат с исполнителем').channel,'cleaning');assert.equal(discussionIntent('Подключи общий чат всей цепочки').channel,undefined);assert.equal(discussionIntent('Хочу написать гостю').channel,'stay');assert.equal(discussionIntent('Создай уборку завтра'),null);});
test('stay and cleaning discussions strictly separate guests and workers',async()=>{
 const f=await fixture();try{await assign(f);const stay=await openDiscussion(f.guest,'guest',{kind:'booking',entityId:f.booking,channel:'stay'});await sendDiscussionMessage(f.guest,'guest',{roomId:stay.roomId,text:'Личные детали проживания',requestKey:'one'});assert.equal((await readDiscussion(f.owner,'owner',stay)).messages.length,1);await assert.rejects(readDiscussion(f.cleaner,'cleaner',stay),e=>e.status===403);await assert.rejects(openDiscussion(f.other,'owner',{kind:'booking',entityId:f.booking}),e=>e.status===403);
 const clean=await openDiscussion(f.cleaner,'cleaner',{kind:'job',entityId:f.job.id});await assert.rejects(readDiscussion(f.guest,'guest',clean),e=>e.status===403);
 await sendDiscussionMessage(f.cleaner,'cleaner',{...clean,text:'Детали уборки',requestKey:'private'});assert.equal((await readDiscussion(f.owner,'owner',clean)).messages.length,1);assert.deepEqual((await readDiscussion(f.guest,'guest',stay)).room.members.map(m=>m.role).sort(),['guest','owner']);assert.equal((await discussionCandidates(f.guest,'guest')).items.some(i=>i.kind==='job'),false);
 for(const [actor,role] of [[f.owner,'owner'],[f.guest,'guest'],[f.cleaner,'cleaner']])await assert.rejects(openDiscussion(actor,role,{kind:'booking',entityId:f.booking,channel:'shared'}),e=>e.status===403);
 await assert.rejects(openDiscussion(f.guest,'guest',{kind:'job',entityId:f.job.id,channel:'stay'}),e=>e.status===403);
 assert.equal(f.db.raw.prepare("SELECT COUNT(*) n FROM notifications WHERE user_id='guest' AND dedupe LIKE '%:discussion:%'").get().n,0);
 const legacy='legacy-shared';f.db.raw.prepare('INSERT INTO discussion_rooms VALUES (?,?,?,?,?,?,?,?)').run(legacy,'booking',f.booking,'shared','legacy',JSON.stringify([{id:'owner',role:'owner'},{id:'guest',role:'guest'},{id:'cleaner',role:'cleaner'}]),'Legacy',now());
 for(const [actor,role] of [[f.owner,'owner'],[f.guest,'guest'],[f.cleaner,'cleaner']]){await assert.rejects(readDiscussion(actor,role,{roomId:legacy}),e=>e.status===403);await assert.rejects(sendDiscussionMessage(actor,role,{roomId:legacy,text:'Blocked',requestKey:'legacy'}),e=>e.status===403);}

 }finally{f.db.close();}
});
test('opening and sending are idempotent, changed replay payloads fail, and messages do not alter domain facts',async()=>{
 const f=await fixture();try{const body={kind:'booking',entityId:f.booking},[a,b]=await Promise.all([openDiscussion(f.owner,'owner',body),openDiscussion(f.guest,'guest',body)]);assert.equal(a.roomId,b.roomId);const request={...a,text:'Я оплатил и выехал',requestKey:'repeat'};const results=await Promise.all([sendDiscussionMessage(f.guest,'guest',request),sendDiscussionMessage(f.guest,'guest',request)]);assert.equal(results[0].seq,results[1].seq);assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM discussion_messages').get().n,1);await assert.rejects(sendDiscussionMessage(f.guest,'guest',{...request,text:'Другое'}),e=>e.status===409);assert.equal(f.db.raw.prepare('SELECT payment_status FROM bookings WHERE id=?').get(f.booking).payment_status,'unpaid');assert.equal(f.db.raw.prepare('SELECT actual_checkout FROM booking_terms WHERE booking_id=?').get(f.booking).actual_checkout,null);
 }finally{f.db.close();}
});
test('replacement revokes the prior worker and never exposes their old private history to a new worker',async()=>{
 const f=await fixture();try{await assign(f);const old=await openDiscussion(f.cleaner,'cleaner',{kind:'job',entityId:f.job.id,channel:'cleaning'});await sendDiscussionMessage(f.cleaner,'cleaner',{...old,text:'Старая группа',requestKey:'old'});const next=new RentalService(f.db,'next-worker');await next.saveProfile({name:'Replacement',roles:['cleaner'],city:'Павлодар',contact:'Test',districts:'Центр',experience:'Test',availability:'Test'});f.db.raw.prepare('UPDATE cleaning_jobs SET assigned_to=? WHERE id=?').run(next.userId,f.job.id);await assert.rejects(readDiscussion(f.cleaner,'cleaner',old),e=>e.status===403);await assert.rejects(readDiscussion(next,'cleaner',old),e=>e.status===403);assert.equal((await readDiscussion(f.owner,'owner',old)).room.archived,true);await assert.rejects(sendDiscussionMessage(f.owner,'owner',{...old,text:'Late',requestKey:'late'}),e=>e.status===409);const current=await openDiscussion(next,'cleaner',{kind:'job',entityId:f.job.id,channel:'cleaning'});assert.notEqual(current.roomId,old.roomId);assert.equal((await readDiscussion(next,'cleaner',current)).messages.length,0);
 }finally{f.db.close();}
});
test('SQL insertion rechecks an assignment revoked after initial authorisation',async()=>{
 const f=await fixture();try{await assign(f);const room=await openDiscussion(f.cleaner,'cleaner',{kind:'job',entityId:f.job.id});const prepare=f.db.prepare.bind(f.db);f.db.prepare=sql=>{if(sql.includes('INSERT OR IGNORE INTO discussion_messages'))f.db.raw.prepare('UPDATE cleaning_jobs SET assigned_to=NULL WHERE id=?').run(f.job.id);return prepare(sql);};await assert.rejects(sendDiscussionMessage(f.cleaner,'cleaner',{...room,text:'Late worker',requestKey:'race'}),e=>e.status===409);assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM discussion_messages').get().n,0);
 }finally{f.db.close();}
});
test('history is paginated and excessive or oversized sending is rejected',async()=>{
 const f=await fixture();try{const room=await openDiscussion(f.guest,'guest',{kind:'booking',entityId:f.booking});for(let i=0;i<105;i++)f.db.raw.prepare('INSERT INTO discussion_messages(room_id,sender_id,sender_role,body,request_key,created_at) VALUES (?,?,?,?,?,?)').run(room.roomId,'guest','guest','History '+i,'h'+i,now());const latest=await readDiscussion(f.owner,'owner',room);assert.equal(latest.messages.length,100);assert.equal(latest.hasOlder,true);assert.equal((await readDiscussion(f.owner,'owner',{...room,before:latest.messages[0].seq})).messages.length,5);await assert.rejects(sendDiscussionMessage(f.guest,'guest',{...room,text:'Rate',requestKey:'limit'}),e=>e.status===409);await assert.rejects(sendDiscussionMessage(f.owner,'owner',{...room,text:'x'.repeat(4001),requestKey:'large'}),e=>e.status===400);
 }finally{f.db.close();}
});

test('inbox unread counts, explicit reading, pagination and typing stay scoped to each participant',async()=>{
 const f=await fixture();try{const room=await openDiscussion(f.guest,'guest',{kind:'booking',entityId:f.booking});const sent=await sendDiscussionMessage(f.guest,'guest',{...room,text:'Встреча у входа',requestKey:'unread'});
 assert.equal((await discussionInbox(f.owner,'owner')).unread,1);assert.equal((await discussionInbox(f.guest,'guest')).unread,0);assert.equal((await discussionInbox(f.other,'owner')).rooms.length,0);
 await readDiscussion(f.owner,'owner',{...room,markRead:false});assert.equal((await discussionInbox(f.owner,'owner')).unread,1);
 await readDiscussion(f.owner,'owner',{...room,before:sent.seq});assert.equal((await discussionInbox(f.owner,'owner')).unread,1);
 await discussionTyping(f.guest,'guest',{...room,typing:true});const read=await readDiscussion(f.owner,'owner',room);assert.ok(read.visits.some(v=>v.user_id==='guest'&&v.typing_until>now()));assert.equal((await discussionInbox(f.owner,'owner')).unread,0);
 assert.equal(f.db.raw.prepare("SELECT read FROM notifications WHERE user_id='owner' AND dedupe LIKE '%:discussion:%'").get().read,1);
 }finally{f.db.close();}
});

test('photo messages and replies are private, replay safe and retained after reopening the database',async()=>{
 const f=await fixture();let file;try{await assign(f);const room=await openDiscussion(f.owner,'owner',{kind:'job',entityId:f.job.id});const request={...room,text:'Фото подготовки',photo,requestKey:'photo'};const first=await sendDiscussionMessage(f.cleaner,'cleaner',request);assert.equal((await sendDiscussionMessage(f.cleaner,'cleaner',request)).seq,first.seq);
 const history=await readDiscussion(f.owner,'owner',room);assert.equal(history.messages[0].photo,1);assert.equal(history.messages[0].photo_data,undefined);assert.match((await discussionPhoto(f.owner,'owner',{...room,seq:first.seq})).data,/^data:image\/jpeg;base64,/);
 await assert.rejects(discussionPhoto(f.guest,'guest',{...room,seq:first.seq}),e=>e.status===403);
 const stay=await openDiscussion(f.guest,'guest',{kind:'booking',entityId:f.booking});await assert.rejects(sendDiscussionMessage(f.guest,'guest',{...stay,text:'Cross room',replyTo:first.seq,requestKey:'bad-reply'}),e=>e.status===403);
 await assert.rejects(sendDiscussionMessage(f.owner,'owner',{...room,photo:'data:image/svg+xml;base64,PHN2Zz4=',requestKey:'bad-photo'}),e=>e.status===400);
 const reply=await sendDiscussionMessage(f.owner,'owner',{...room,text:'Спасибо, вижу',replyTo:first.seq,requestKey:'reply'});assert.equal((await readDiscussion(f.cleaner,'cleaner',room)).messages.at(-1).reply_body,'Фото подготовки');
 await assert.rejects(sendDiscussionMessage(f.owner,'owner',{...room,text:'Спасибо, вижу',requestKey:'reply'}),e=>e.status===409);
 const {backup,DatabaseSync}=await import('node:sqlite'),{resolve}=await import('node:path'),{rmSync}=await import('node:fs');file=resolve('outputs','discussion-restart-'+process.pid+'.sqlite');await backup(f.db.raw,file);f.db.raw.close();f.db.raw=new DatabaseSync(file);f.db.db=f.db.raw;assert.equal((await readDiscussion(f.owner,'owner',room)).messages.at(-1).seq,reply.seq);assert.ok((await discussionPhoto(f.cleaner,'cleaner',{...room,seq:first.seq})).data);
 f.db.close();rmSync(file);file=null;
 }finally{if(file){f.db.close();(await import('node:fs')).rmSync(file,{force:true});}else if(f.db.raw.isOpen)f.db.close();}
});
test('a call opens only while the deal goes through the service, and the chat shows the order it is about',async()=>{
 const {callAllowed}=await load('process-discussions'),t=now();
 assert.equal(callAllowed({kind:'booking',status:'confirmed',end:t+3600},false,t).ok,true);
 assert.equal(callAllowed({kind:'booking',status:'confirmed',end:t-2*86400},false,t).ok,false);
 assert.equal(callAllowed({kind:'booking',status:'completed',end:t-3600},false,t).ok,true);
 assert.equal(callAllowed({kind:'booking',status:'completed',end:t-2*86400},false,t).ok,false);
 assert.match(callAllowed({kind:'booking',status:'requested',end:t+3600},false,t).note,/после подтверждения/);
 assert.equal(callAllowed({kind:'booking',status:'confirmed',end:t+3600},true,t).ok,false);
 assert.equal(callAllowed({kind:'job',status:'assigned'},false,t).ok,true);
 assert.equal(callAllowed({kind:'job',status:'open'},false,t).ok,false);
 assert.equal(callAllowed({kind:'job',status:'completed'},false,t).ok,false);
 const f=await fixture();try{
  const room=await openDiscussion(f.guest,'guest',{kind:'booking',entityId:f.booking,channel:'stay'}),read=await readDiscussion(f.guest,'guest',room);
  assert.equal(read.subject.kind,'booking');assert.equal(read.subject.id,f.booking);
  const status=f.db.raw.prepare('SELECT status FROM bookings WHERE id=?').get(f.booking).status;
  assert.equal(!!read.call.phone,callAllowed(read.subject,false).ok&&!!f.db.raw.prepare("SELECT phone FROM auth_accounts WHERE id='owner'").get()?.phone,'status '+status);
  if(!read.call.phone)assert.ok(read.call.note);
  assert.ok(read.room.members.find(m=>m.role==='owner').rating);assert.equal(read.room.members.find(m=>m.role==='guest').rating,undefined);
 }finally{f.db.close();}
});
