import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,load,now} from './helpers/platform.mjs';
const {classifyIssue,sweepIssues}=await load('admin-issues');
const {readPlatformAdmin}=await load('platform-admin');

test('issues are sorted by what they are about',()=>{
 assert.deepEqual(classifyIssue('Не могу попасть, код от домофона не подходит'),{kind:'access',priority:'urgent'});
 assert.deepEqual(classifyIssue('В ванной протечка, вода течёт к соседям'),{kind:'safety',priority:'urgent'});
 assert.deepEqual(classifyIssue('В квартире грязно, не убрано после прошлых гостей'),{kind:'condition',priority:'high'});
 assert.deepEqual(classifyIssue('Верните депозит, пожалуйста'),{kind:'money',priority:'high'});
 assert.deepEqual(classifyIssue('Хотим уточнить про парковку'),{kind:'other',priority:'normal'});
});
test('the AI triages a new issue, reminds the other side at half time and calls the admin only when urgent or late',async()=>{
 const f=await fixture();try{
  const config={PLATFORM_ADMIN_IDS:'admin'};
  await f.guest.bookingAction(f.booking,{action:'issue',issue:'В квартире грязно, не убрано',requestKey:'i1'});
  const issue=f.db.raw.prepare('SELECT * FROM administrator_issues').get();
  assert.equal((await sweepIssues(f.db,config)).triaged,1);
  const ticket=f.db.raw.prepare('SELECT * FROM operator_tickets WHERE issue_id=?').get(issue.id);
  assert.equal(ticket.priority,'high');assert.equal(ticket.deadline,issue.created_at+3*3600);
  assert.match(f.db.raw.prepare("SELECT body FROM operator_history WHERE id=?").get('ai-triage:'+issue.id).body,/состояние жилья/);
  assert.equal(f.db.raw.prepare("SELECT COUNT(*) n FROM notifications WHERE dedupe LIKE 'admin:%'").get().n,0);
  assert.equal((await sweepIssues(f.db,config)).triaged,0);
  assert.equal((await readPlatformAdmin(f.owner,'overview',{},{PLATFORM_ADMIN_IDS:'owner'})).counts.issues,0);
  f.db.raw.prepare('UPDATE operator_tickets SET created_at=?,deadline=? WHERE issue_id=?').run(now()-7200,now()+3600,issue.id);
  assert.equal((await sweepIssues(f.db,config)).reminded,1);assert.equal((await sweepIssues(f.db,config)).reminded,0);
  assert.equal(f.db.raw.prepare("SELECT COUNT(*) n FROM notifications WHERE dedupe=?").get('owner:issue-remind:'+issue.id).n,1);
  f.db.raw.prepare('UPDATE operator_tickets SET deadline=? WHERE issue_id=?').run(now()-1,issue.id);
  assert.equal((await sweepIssues(f.db,config)).escalated,1);
  assert.match(f.db.raw.prepare("SELECT body FROM notifications WHERE dedupe LIKE 'admin:issue-overdue:%'").get().body,/не решено в срок/);
  assert.equal((await readPlatformAdmin(f.owner,'overview',{},{PLATFORM_ADMIN_IDS:'owner'})).counts.issues,1);
 }finally{f.db.close();}
});
test('an urgent issue reaches the admin at once',async()=>{
 const f=await fixture();try{
  await f.guest.bookingAction(f.booking,{action:'issue',issue:'Не могу попасть в квартиру, ключа нет',requestKey:'i2'});
  const r=await sweepIssues(f.db,{PLATFORM_ADMIN_IDS:'admin'});assert.equal(r.escalated,1);
  assert.match(f.db.raw.prepare("SELECT body FROM notifications WHERE dedupe LIKE 'admin:issue-urgent:%'").get().body,/доступ в жильё/);
 }finally{f.db.close();}
});
test('the AI hides a reported message that obviously breaks the rules and leaves the rest to the admin',async()=>{
 const f=await fixture();try{
  const {safetyAction}=await load('account-safety'),{openDiscussion,sendDiscussionMessage,readDiscussion}=await load('process-discussions'),{sweepReports,obviousViolation}=await load('admin-reports');
  assert.equal(obviousViolation('Переведите предоплату на Kaspi Gold'),'контакты или оплата мимо сервиса');assert.equal(obviousViolation('Заезд после 14:00, спасибо'),null);
  const room=await openDiscussion(f.guest,'guest',{kind:'booking',entityId:f.booking});
  const bad=await sendDiscussionMessage(f.owner,'owner',{...room,text:'Пишите мне в WhatsApp +7 701 123 45 67',requestKey:'a'});
  const fine=await sendDiscussionMessage(f.owner,'owner',{...room,text:'Заезд после 14:00',requestKey:'b'});
  await safetyAction(f.guest,'guest','report',{...room,kind:'message',targetId:String(bad.seq),reason:'Просит писать вне сервиса'});
  await safetyAction(f.guest,'guest','report',{...room,kind:'message',targetId:String(fine.seq),reason:'Не нравится'});
  assert.deepEqual(await sweepReports(f.db),{hidden:1,left:1});assert.deepEqual(await sweepReports(f.db),{hidden:0,left:0});
  const messages=(await readDiscussion(f.guest,'guest',room)).messages;assert.match(messages[0].body,/скрыто/);assert.equal(messages[1].body,'Заезд после 14:00');
  assert.deepEqual(f.db.raw.prepare('SELECT status FROM content_reports ORDER BY created_at,rowid').all().map(r=>r.status).sort(),['open','resolved']);
 }finally{f.db.close();}
});
test('the morning summary goes to each admin once a day after 09:00 Kazakhstan time',async()=>{
 const f=await fixture();try{
  const {sendDigest,digestDay}=await load('admin-digest');
  const morning=Date.UTC(2026,10,13,4,30)/1000,night=Date.UTC(2026,10,12,20,0)/1000;
  assert.equal(digestDay(morning).due,true);assert.equal(digestDay(night).due,false);
  assert.equal((await sendDigest(f.db,{PLATFORM_ADMIN_IDS:'owner'},night)).sent,0);
  assert.equal((await sendDigest(f.db,{PLATFORM_ADMIN_IDS:'owner'},morning)).sent,1);
  assert.equal((await sendDigest(f.db,{PLATFORM_ADMIN_IDS:'owner'},morning+3600)).sent,0);
  const body=f.db.raw.prepare("SELECT body FROM notifications WHERE dedupe='admin:digest:2026-11-13:owner'").get().body;
  assert.match(body,/Сделал сам/);assert.match(body,/Брони: новых/);
 }finally{f.db.close();}
});

// With a model the AI reads the issue in the reporter's words; the word rules stay the floor.
const {mergeTriage}=await load('admin-issues');
const {saveAIDataPermission,AI_DATA_POLICY_VERSION}=await load('ai-data-permission');
const aiConfig={PLATFORM_ADMIN_IDS:'admin',OPENAI_API_KEY:'fake-test-key',OPENAI_MODEL:'fixture-model'};
const withTriage=async(answer,run)=>{
 const real=globalThis.fetch,calls=[];
 globalThis.fetch=async(url,request)=>{if(!String(url).includes('api.openai.com'))return real(url,request);calls.push(JSON.parse(request.body));
  return Response.json({id:'r',usage:{input_tokens:10,output_tokens:5},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(answer)}]}]});};
 try{await run(calls);}finally{globalThis.fetch=real;}
};
test('the model may raise an issue, never lower it below the word rules',()=>{
 const urgent={kind:'access',priority:'urgent'};
 assert.deepEqual(mergeTriage(urgent,{kind:'other',priority:'normal',advice:'a',action:'none'}),{kind:'access',priority:'urgent',advice:'a',action:'none'});
 assert.deepEqual(mergeTriage({kind:'other',priority:'normal'},{kind:'safety',priority:'urgent',advice:'Звоните 112',action:'call_admin'}).priority,'urgent');
 assert.deepEqual(mergeTriage(urgent,null),{...urgent,advice:'',action:'none'});
});
test('the model catches what the words miss, advises the guest, calls the admin and shows other free places',async()=>{
 const f=await fixture();try{
  await saveAIDataPermission(f.guest,{allowed:true,expectedVersion:0,policyVersion:AI_DATA_POLICY_VERSION});
  await f.guest.bookingAction(f.booking,{action:'issue',issue:'Ребёнку стало плохо от сильной вони из вентиляции, находиться внутри невозможно',requestKey:'m1'});
  const issue=f.db.raw.prepare('SELECT * FROM administrator_issues').get();
  await withTriage({kind:'safety',priority:'urgent',advice:'Выйдите на свежий воздух, при плохом самочувствии звоните 112.',action:'offer_similar'},async calls=>{
   const r=await sweepIssues(f.db,aiConfig);assert.equal(r.triaged,1);assert.equal(r.escalated,1);assert.equal(calls.length,1);
   assert.doesNotMatch(JSON.stringify(calls[0]),/PRIVATE ADDRESS/);
  });
  assert.equal(f.db.raw.prepare('SELECT priority FROM operator_tickets WHERE issue_id=?').get(issue.id).priority,'urgent');
  assert.match(f.db.raw.prepare("SELECT body FROM operator_history WHERE id=?").get('ai-triage:'+issue.id).body,/безопасность.*Совет: Выйдите/);
  assert.match(f.db.raw.prepare("SELECT body FROM notifications WHERE dedupe=?").get('guest:issue-advice:'+issue.id+':1').body,/звоните 112/);
  assert.equal(f.db.raw.prepare("SELECT COUNT(*) n FROM notifications WHERE dedupe LIKE 'admin:issue-urgent:%'").get().n,1);
 }finally{f.db.close();}
});
test('without the reporter\'s permission the issue goes by the word rules, and the model is not asked',async()=>{
 const f=await fixture();try{
  await f.guest.bookingAction(f.booking,{action:'issue',issue:'В квартире грязно',requestKey:'m2'});
  await withTriage({kind:'other',priority:'normal',advice:'x',action:'none'},async calls=>{await sweepIssues(f.db,aiConfig);assert.equal(calls.length,0);});
  assert.equal(f.db.raw.prepare('SELECT priority FROM operator_tickets').get().priority,'high');
  assert.equal(f.db.raw.prepare("SELECT COUNT(*) n FROM notifications WHERE dedupe LIKE 'guest:issue-advice:%'").get().n,0);
 }finally{f.db.close();}
});
