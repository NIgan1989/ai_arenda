import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,load} from './helpers/platform.mjs';
const {administratorConversation}=await load('administrator-conversation');
test('administrator history paginates stable timestamps and isolates roles, accounts and cursor IDs',async()=>{
 const f=await fixture();try{
  const insert=f.db.raw.prepare('INSERT INTO messages VALUES (?,?,?,?,?,?)');
  for(let i=0;i<105;i++)insert.run('g'+String(i).padStart(3,'0'),'guest','guest',i%2?'assistant':'user','Message '+i,1000+Math.floor(i/3));
  insert.run('owner-private','owner','owner','assistant','Owner only',2000);
  insert.run('guest-other-role','guest','owner','assistant','Other role',2000);
  const latest=await administratorConversation(f.guest,'guest');assert.equal(latest.messages.length,100);assert.equal(latest.hasOlder,true);assert.equal(latest.messages[0].id,'g005');assert.equal(latest.messages.at(-1).id,'g104');
  const earlier=await administratorConversation(f.guest,'guest',latest.messages[0].id);assert.equal(earlier.hasOlder,false);assert.deepEqual(earlier.messages.map(m=>m.id),['g000','g001','g002','g003','g004']);
  for(const cursor of ['owner-private','guest-other-role','missing'])await assert.rejects(administratorConversation(f.guest,'guest',cursor),e=>e.status===404);
  await assert.rejects(administratorConversation(f.guest,'owner'),e=>e.status===403);
  assert.deepEqual((await administratorConversation(f.owner,'owner')).messages.map(m=>m.id),['owner-private']);
  assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM messages').get().n,107);
  assert.equal(f.db.raw.prepare('SELECT COUNT(*) n FROM ai_usage_reservations').get().n,0);
 }finally{f.db.close();}
});
