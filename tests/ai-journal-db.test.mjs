import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture,load,now} from './helpers/platform.mjs';

const {aiJournal,JOURNAL_LIMIT}=await load('ai-moves');

test('AI journal resolves notices through bounded independent queries, not a compound UNION',async()=>{
 const f=await fixture();
 try{
  const at=now();
  const insert=f.db.raw.prepare('INSERT INTO notifications(id,user_id,body,dedupe,read,created_at) VALUES (?,?,?,?,0,?)');
  for(let i=0;i<40;i++)
   insert.run('journal-note-'+i,'owner','AI confirmed this booking','owner:administrator-confirmed:'+f.booking+':'+i,at-i);
  const queries=[];
  const prepare=f.db.prepare.bind(f.db);
  f.db.prepare=sql=>{queries.push(sql);return prepare(sql);};
  const lines=await aiJournal(f.db,'owner','owner',at);
  assert.ok(lines.length>0);
  assert.ok(lines.length<=JOURNAL_LIMIT);
  assert.ok(lines.every(line=>line.open?.kind==='booking'&&line.open.id===f.booking));
  assert.ok(queries.every(sql=>!sql.includes('UNION ALL')),'journal lookups must not build a compound SELECT');
  assert.equal(queries.filter(sql=>sql.includes('FROM bookings b JOIN properties p')).length,1,'repeated notices share one entity lookup');
  assert.deepEqual(await aiJournal(f.db,'guest','guest',at),[],'notices of other roles are not revealed');
 }finally{f.db.close();}
});
