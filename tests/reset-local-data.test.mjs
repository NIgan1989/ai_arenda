import {test} from 'node:test';
import assert from 'node:assert/strict';
import {backup,DatabaseSync} from 'node:sqlite';
import {mkdtempSync,mkdirSync,copyFileSync,readdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fixture,load,now} from './helpers/platform.mjs';
import {resetLocalData} from '../scripts/reset-local-data.mjs';
const {recordFinance}=await load('finance');

test('explicit reset verifies an encrypted recovery copy and preserves only administrator access and default settings',async()=>{
 const f=await fixture();let db;
 try{
  const root=mkdtempSync(resolve('outputs/reset-test-')),dir=resolve(root,'.wrangler/state/v3/d1/miniflare-D1DatabaseObject');mkdirSync(dir,{recursive:true});mkdirSync(resolve(root,'drizzle'));
  for(const n of readdirSync('drizzle').filter(n=>n.endsWith('.sql')))copyFileSync(resolve('drizzle',n),resolve(root,'drizzle',n));
  const secret='public-reset-test-encryption-key-'.repeat(2);
  writeFileSync(resolve(root,'.dev.vars'),'PLATFORM_ADMIN_IDS=owner\nADMIN_LOGIN_PHONE=+77000000001\nACCESS_ENCRYPTION_KEY='+secret+'\n');
  for(const [id,phone] of [['owner','+77000000001'],['guest','+77000000002']])f.db.raw.prepare('INSERT INTO auth_accounts(id,phone,name,password_hash,recovery_hash,created_at) VALUES (?,?,?,?,?,?)').run(id,phone,id,'public-test-password-hash','public-test-recovery-hash',now());
  f.db.raw.prepare('INSERT INTO auth_sessions(hash,user_id,credential_version,expires_at) VALUES (?,?,1,?)').run('public-admin-session','owner',now()+10000);
  f.db.raw.prepare('INSERT INTO auth_sessions(hash,user_id,credential_version,expires_at) VALUES (?,?,1,?)').run('public-guest-session','guest',now()+10000);
  await recordFinance(f.owner,{kind:'payment',bookingId:f.booking,amount:1000,confirmed:true,note:'Synthetic',requestKey:'reset-test-payment'});
  const file=resolve(dir,'application.sqlite');await backup(f.db.raw,file);
  await assert.rejects(resetLocalData({root}),/Explicit/);
  const result=await resetLocalData({root,confirmAdminOnly:true});assert.equal(result.localRecoveryVerified,true);assert.equal(result.externalRecoveryVerified,false);
  db=new DatabaseSync(file);
  assert.equal(db.prepare('SELECT count(*) n FROM auth_accounts').get().n,1);
  assert.equal(db.prepare('SELECT password_hash FROM auth_accounts').get().password_hash,'public-test-password-hash');
  assert.equal(db.prepare('SELECT recovery_hash FROM auth_accounts').get().recovery_hash,'public-test-recovery-hash');
  assert.equal(db.prepare('SELECT count(*) n FROM auth_sessions').get().n,1);
  assert.equal(db.prepare('SELECT user_id FROM auth_sessions').get().user_id,'owner');
  assert.deepEqual(JSON.parse(db.prepare('SELECT roles FROM profiles').get().roles),['guest']);
  for(const table of ['properties','bookings','cleaning_jobs','applications','finance_entries','notifications','audit_events','participant_reviews'])assert.equal(db.prepare('SELECT count(*) n FROM '+table).get().n,0,table);
  assert.equal(db.prepare("SELECT count(*) n FROM sqlite_master WHERE type='trigger' AND name='finance_no_delete'").get().n,1);
  assert.equal(db.prepare('SELECT count(*) n FROM pilot_policy').get().n,1);
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
  assert.equal(readdirSync(resolve(root,'outputs/backups')).some(n=>n.startsWith('.reset-recovery-')),false);
 }finally{db?.close();f.db.close();}
});
