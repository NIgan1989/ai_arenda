import {DatabaseSync,backup} from 'node:sqlite';
import {readFileSync,writeFileSync,mkdirSync,readdirSync,statSync,existsSync,unlinkSync} from 'node:fs';
import {resolve,dirname,join,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,createCipheriv,createDecipheriv,randomBytes,randomUUID} from 'node:crypto';
import {parseEnv} from 'node:util';

const projectRoot=fileURLToPath(new URL('../',import.meta.url));
function within(root,file){const absolute=resolve(file),base=resolve(root);if(!absolute.startsWith(base+sep))throw new Error('Path must stay inside the selected project');return absolute;}
export function locateDatabase(root=projectRoot){
 const folder=join(root,'.wrangler/state/v3/d1/miniflare-D1DatabaseObject');if(!existsSync(folder))return null;
 const candidates=[];for(const file of readdirSync(folder).filter(f=>f.endsWith('.sqlite')&&f!=='metadata.sqlite')){const path=join(folder,file);let db;try{db=new DatabaseSync(path,{readOnly:true});if(db.prepare("SELECT name FROM sqlite_master WHERE name='profiles'").get())candidates.push(path);}finally{db?.close();}}
 if(candidates.length>1)throw new Error('More than one rental database found; select a filename explicitly');return candidates[0]||null;
}
export async function createLocalBackup({root=projectRoot,filename,secret,force=false}={}){
 root=resolve(root);filename=filename?within(root,filename):locateDatabase(root);if(!filename)return {skipped:true,reason:'database_not_created'};
 const directory=join(root,'outputs/backups');mkdirSync(directory,{recursive:true});
 const names=readdirSync(directory).filter(n=>/^ai-arenda-[\w-]+\.sqlite\.enc$/.test(n)).sort();
 if(!force&&names.length&&Date.now()-statSync(join(directory,names.at(-1))).mtimeMs<86400000)return {skipped:true,reason:'recent_backup',lastBackupAt:Math.floor(statSync(join(directory,names.at(-1))).mtimeMs/1000)};
 secret ||=parseEnv(readFileSync(join(root,'.dev.vars'),'utf8')).ACCESS_ENCRYPTION_KEY;if(!secret||secret.length<32)throw new Error('Backup encryption key is not configured');
 const key=createHash('sha256').update(secret).digest(),iv=randomBytes(12),name='ai-arenda-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID().slice(0,8)+'.sqlite.enc',target=join(directory,name),temporary=within(directory,join(directory,'.snapshot-'+randomUUID()+'.sqlite'));
 const db=new DatabaseSync(filename,{readOnly:true});try{await backup(db,temporary);}finally{db.close();}
 try{const snapshot=new DatabaseSync(temporary);try{if(snapshot.prepare("SELECT name FROM sqlite_master WHERE name='journey_sessions'").get()){snapshot.exec('PRAGMA secure_delete=ON; DELETE FROM journey_sessions; VACUUM;');}}finally{snapshot.close();}const source=readFileSync(temporary),cipher=createCipheriv('aes-256-gcm',key,iv),encrypted=Buffer.concat([cipher.update(source),cipher.final()]),result=Buffer.concat([Buffer.from('AIRENDA1\n'),iv,cipher.getAuthTag(),encrypted]);writeFileSync(target,result,{flag:'wx'});writeFileSync(target+'.json',JSON.stringify({file:name,createdAt:new Date().toISOString(),bytes:result.length,sha256:createHash('sha256').update(result).digest('hex'),format:'aes-256-gcm/sqlite-v1'},null,2));}
 finally{if(existsSync(temporary))unlinkSync(temporary);}
 // Retain the newest fourteen snapshots; leave unrelated/manual backups untouched.
 const retained=[...names,name].sort();for(const old of retained.slice(0,-14)){const file=within(directory,join(directory,old));unlinkSync(file);if(existsSync(file+'.json'))unlinkSync(file+'.json');}
 return {file:target,created:true,lastBackupAt:Math.floor(Date.now()/1000)};
}
export function restoreLocalBackup({file,target,secret,root=projectRoot}){
 if(!secret||secret.length<32)throw new Error('The original backup encryption key is required');target=within(root,target);if(existsSync(target))throw new Error('Restore target already exists; choose a new file');
 const data=readFileSync(file),magic=Buffer.from('AIRENDA1\n');if(!data.subarray(0,magic.length).equals(magic))throw new Error('Unknown backup format');
 const key=createHash('sha256').update(secret).digest(),offset=magic.length,decipher=createDecipheriv('aes-256-gcm',key,data.subarray(offset,offset+12));decipher.setAuthTag(data.subarray(offset+12,offset+28));const plain=Buffer.concat([decipher.update(data.subarray(offset+28)),decipher.final()]);
 mkdirSync(dirname(target),{recursive:true});writeFileSync(target,plain,{flag:'wx'});let db;try{db=new DatabaseSync(target);const result=db.prepare('PRAGMA integrity_check').get();if(Object.values(result)[0]!=='ok')throw new Error('Restored database integrity check failed');}catch(error){db?.close();unlinkSync(target);throw error;}db.close();return {file:target,integrity:'ok'};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [command,...args]=process.argv.slice(2),option=key=>args[args.indexOf(key)+1];
 if(command==='restore'){const env=parseEnv(readFileSync(join(projectRoot,'.dev.vars'),'utf8'));if(!args.includes('--file')||!args.includes('--target'))throw new Error('Use restore --file <snapshot> --target <new project-local file>');console.log(JSON.stringify(restoreLocalBackup({file:resolve(option('--file')),target:resolve(option('--target')),secret:env.ACCESS_ENCRYPTION_KEY})));}
 else console.log(JSON.stringify(await createLocalBackup({force:command==='create'})));
}
