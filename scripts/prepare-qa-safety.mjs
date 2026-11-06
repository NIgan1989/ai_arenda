import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {root,openQaDatabase} from './qa-database.mjs';
import {createLocalBackup} from './local-backup.mjs';
if(process.argv.slice(2).join(' ')!=='--confirm-isolated')throw Error('Use --confirm-isolated; only isolated QA storage is supported');
const db=openQaDatabase();try{
 const pending=[['deletion_requests','0025_account_safety.sql'],['ai_data_permissions','0026_ai_data_permission.sql'],['auth_mobile_sessions','0027_shared_mobile_api.sql'],['moderated_content','0028_content_moderation.sql'],['account_erasure_fences','0029_account_deletion.sql']].filter(([table])=>!db.raw.prepare('SELECT name FROM sqlite_master WHERE name=?').get(table));
 if(!pending.length)console.log('QA safety schema already installed');
 else{await createLocalBackup({filename:db.raw.prepare('PRAGMA database_list').get().file,force:true});db.raw.exec('BEGIN IMMEDIATE');try{for(const [,file] of pending)db.raw.exec(readFileSync(resolve(root,'drizzle',file),'utf8'));db.raw.exec('COMMIT');console.log('QA safety schema installed after encrypted backup:',pending.map(([,file])=>file).join(', '));}catch(e){db.raw.exec('ROLLBACK');throw e;}}
}finally{db.raw.close();}
