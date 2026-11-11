// Destructive local maintenance. Explicitly requested reset only; never run at startup.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync,realpathSync,unlinkSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseEnv} from 'node:util';
import {randomUUID} from 'node:crypto';
import {createLocalBackup,restoreLocalBackup,locateDatabase} from './local-backup.mjs';

const projectRoot=fileURLToPath(new URL('../',import.meta.url));
const quote=name=>'"'+name.replaceAll('"','""')+'"';
const internal=name=>name.startsWith('sqlite_')||name.startsWith('_cf_')||['d1_migrations','__drizzle_migrations'].includes(name);
function insert(db,table,row){const keys=Object.keys(row);db.prepare('INSERT INTO '+quote(table)+'('+keys.map(quote).join(',')+') VALUES ('+keys.map(()=>'?').join(',')+')').run(...keys.map(k=>row[k]));}

export async function resetLocalData({root=projectRoot,confirmAdminOnly=false}={}){
 if(!confirmAdminOnly)throw Error('Explicit --keep-admin-only is required. This clears local application data.');
 root=realpathSync(root);const file=locateDatabase(root);
 if(!file||!realpathSync(file).startsWith(root+sep))throw Error('Expected one database inside this project');
 const env=parseEnv(readFileSync(resolve(root,'.dev.vars'),'utf8'));
 const ids=(env.PLATFORM_ADMIN_IDS||'').split(',').map(v=>v.trim()).filter(Boolean);
 const db=new DatabaseSync(file);db.exec('PRAGMA busy_timeout=10000;');
 let clean;
 try{
  const account=db.prepare('SELECT * FROM auth_accounts WHERE phone=?').get(env.ADMIN_LOGIN_PHONE||'');
  if(!account||!ids.includes(account.id))throw Error('Configured administrator login and server allowlist must identify the same existing account');
  // A recovery drill must succeed before any application row is removed.
  const copy=await createLocalBackup({root,filename:file,force:true});
  const verification=resolve(root,'outputs/backups','.reset-recovery-'+randomUUID()+'.sqlite');
  try{
   restoreLocalBackup({root,file:copy.file,target:verification,secret:env.ACCESS_ENCRYPTION_KEY});
   const restored=new DatabaseSync(verification,{readOnly:true});
   try{
    const saved=restored.prepare('SELECT * FROM auth_accounts WHERE id=?').get(account.id);
    if(!saved||saved.password_hash!==account.password_hash||saved.recovery_hash!==account.recovery_hash)throw Error('Recovery did not preserve administrator authentication');
    if(restored.prepare('PRAGMA foreign_key_check').all().length)throw Error('Recovery foreign-key check failed');
   }finally{restored.close();}
  }finally{try{unlinkSync(verification);}catch(e){if(e.code!=='ENOENT')throw e;}}
  clean=new DatabaseSync(':memory:');clean.exec('PRAGMA foreign_keys=ON;');
  for(const name of readdirSync(resolve(root,'drizzle')).filter(n=>/^\d{4}_.*\.sql$/.test(n)).sort())clean.exec(readFileSync(resolve(root,'drizzle',name),'utf8'));
  const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r=>r.name).filter(n=>!internal(n));
  const triggers=db.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' AND sql IS NOT NULL").all();
  const profile=db.prepare('SELECT * FROM profiles WHERE id=?').get(account.id);
  const sessions={};for(const table of ['auth_sessions','auth_mobile_sessions'])sessions[table]=db.prepare('SELECT * FROM '+table+' WHERE user_id=? AND expires_at>? AND credential_version=?').all(account.id,Math.floor(Date.now()/1000),account.credential_version);
  const before={accounts:db.prepare('SELECT count(*) n FROM auth_accounts').get().n,properties:db.prepare('SELECT count(*) n FROM properties').get().n,bookings:db.prepare('SELECT count(*) n FROM bookings').get().n};
  db.exec('PRAGMA foreign_keys=OFF; PRAGMA secure_delete=ON; BEGIN IMMEDIATE;');
  try{
   // Drop/recreate triggers in this transaction, so immutable finance and erasure
   // guards remain intact outside this explicit whole-service reset.
   for(const t of triggers)db.exec('DROP TRIGGER '+quote(t.name));
   for(const table of tables)db.exec('DELETE FROM '+quote(table));
   for(const table of tables){
    if(!clean.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table))continue;
    for(const row of clean.prepare('SELECT * FROM '+quote(table)).all())insert(db,table,row);
   }
   insert(db,'auth_accounts',account);
   insert(db,'profiles',{id:account.id,name:account.name,contact:account.phone,city:profile?.city||'Павлодар',roles:'["guest"]',districts:'',experience:'',availability:'',created_at:profile?.created_at||account.created_at});
   for(const [table,rows] of Object.entries(sessions))for(const row of rows)insert(db,table,row);
   for(const t of triggers)db.exec(t.sql);
   if(db.prepare('PRAGMA foreign_key_check').all().length)throw Error('Reset foreign-key check failed');
   const saved=db.prepare('SELECT * FROM auth_accounts').all();
   if(saved.length!==1||saved[0].id!==account.id||saved[0].password_hash!==account.password_hash||saved[0].recovery_hash!==account.recovery_hash)throw Error('Administrator authentication preservation failed');
   if(db.prepare('SELECT count(*) n FROM properties').get().n!==0)throw Error('Listing cleanup failed');
   db.exec('COMMIT;');
  }catch(error){db.exec('ROLLBACK;');throw error;}
  finally{db.exec('PRAGMA foreign_keys=ON;');}
  const report={reset:true,scope:'local-application',before,after:{accounts:1,profiles:1,properties:0,bookings:0},administratorPasswordPreserved:true,administratorRecoveryPreserved:true,localRecoveryVerified:true,externalRecoveryVerified:false,backup:copy.file.split(/[\\/]/).pop(),createdAt:new Date().toISOString()};
  const output=resolve(root,'outputs/maintenance');mkdirSync(output,{recursive:true});writeFileSync(resolve(output,'admin-only-reset.json'),JSON.stringify(report,null,2));
  return report;
 }finally{clean?.close();db.close();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==3||process.argv[2]!=='--keep-admin-only')throw Error('Use node scripts/reset-local-data.mjs --keep-admin-only only for an explicitly requested local reset.');
 console.log(JSON.stringify(await resetLocalData({confirmAdminOnly:true}),null,2));
}
