// Full encrypted export and restore drill in a NEW disposable remote D1 database.
// The production database is read-only throughout; never run a restore against it.
import {readFileSync,writeFileSync,mkdirSync,unlinkSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {parseEnv} from 'node:util';
import {spawnSync} from 'node:child_process';
import {createHash,randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {chunkD1Import} from './d1-import-chunks.mjs';
const args=process.argv.slice(2),configPath=args[0];
if(args.length!==1||!configPath)throw Error('Usage: node scripts/verify-cloudflare-recovery.mjs PATH_TO_DEPLOYMENT_CONFIG');
const source=JSON.parse(readFileSync(configPath,'utf8')),binding=source.d1_databases?.find(b=>b.binding==='DB');
if(!binding||!/^[a-f0-9-]{36}$/.test(binding.database_id)||!/^[a-f0-9]{32}$/.test(source.account_id||''))throw Error('A real production D1 configuration is required.');
const env=parseEnv(readFileSync('.dev.vars','utf8'));if(!env.ACCESS_ENCRYPTION_KEY||env.ACCESS_ENCRYPTION_KEY.length<32)throw Error('Missing encryption key.');
const token=new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomBytes(4).toString('hex'),work=resolve('.sites-runtime/recovery',token),backupDir=resolve('outputs/backups');mkdirSync(work,{recursive:true});mkdirSync(backupDir,{recursive:true});
const plaintext=resolve(work,'export.sql'),restored=resolve(work,'restored.sql'),tempConfig=resolve(work,'wrangler.json'),testName='ai-arenda-recovery-'+randomBytes(6).toString('hex');let testId;
const sha=data=>createHash('sha256').update(data).digest('hex');
function cli(command,label){const r=spawnSync(process.execPath,['scripts/cloudflare-local.mjs',...command],{encoding:'utf8',timeout:240000,maxBuffer:32*1024*1024,env:{...process.env,CI:'true'}});writeFileSync(resolve(work,label+'.log'),(r.stdout||'')+'\n'+(r.stderr||''),{mode:0o600});if(r.status!==0)throw Error('Cloudflare recovery step failed: '+label+' (private log retained).');return r.stdout;}
function read(sql){const result=JSON.parse(cli(['d1','execute','RESTORE_DB','--remote','--config',tempConfig,'--command',sql,'--json'],'read-'+randomBytes(3).toString('hex')));return result[0].results;}
let verified=false,cleanup=false,backupPath;
try{
 cli(['d1','export','DB','--remote','--config',configPath,'--output',plaintext,'-y'],'export');
 const exported=readFileSync(plaintext),key=createHash('sha256').update(env.ACCESS_ENCRYPTION_KEY).digest(),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv),encrypted=Buffer.concat([cipher.update(exported),cipher.final()]);
 backupPath=resolve(backupDir,'cloud-d1-'+token+'.sql.enc');writeFileSync(backupPath,JSON.stringify({version:1,algorithm:'aes-256-gcm',iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:encrypted.toString('base64')}),{mode:0o600});unlinkSync(plaintext);
 // Import bytes decrypted from the SAVED backup, never the original SQL export.
 const sealed=JSON.parse(readFileSync(backupPath,'utf8')),decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(sealed.iv,'base64'));decipher.setAuthTag(Buffer.from(sealed.tag,'base64'));const decoded=Buffer.concat([decipher.update(Buffer.from(sealed.data,'base64')),decipher.final()]);if(sha(decoded)!==sha(exported))throw Error('Encrypted roundtrip mismatch.');writeFileSync(restored,decoded,{mode:0o600});
 const local=new DatabaseSync(':memory:');local.exec(decoded.toString('utf8'));
 const importable=chunkD1Import(decoded.toString('utf8'),local);writeFileSync(restored,importable.sql,{mode:0o600});
 try{
  const tables=local.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name").all().map(t=>t.name);if(tables.some(t=>!/^\w+$/.test(t)))throw Error('Unexpected table name.');
  const output=cli(['d1','create',testName,'--config',configPath,'--location','eeur'],'create');
  const match=output.match(/(?:database_id\s*[=:]\s*["']|"database_id"\s*:\s*")([a-f0-9-]{36})/);testId=match?.[1];if(!testId||testId===binding.database_id)throw Error('Could not verify the new disposable database ID. Check create log.');
  writeFileSync(tempConfig,JSON.stringify({name:testName,account_id:source.account_id,compatibility_date:source.compatibility_date,d1_databases:[{binding:'RESTORE_DB',database_name:testName,database_id:testId}]}));
  cli(['d1','execute','RESTORE_DB','--remote','--config',tempConfig,'--file',restored,'-y'],'import');
  const expected=tables.map(name=>({name,n:local.prepare('SELECT COUNT(*) n FROM "'+name+'"').get().n}));
  const actual=[];for(let i=0;i<tables.length;i+=20){const group=tables.slice(i,i+20),counts=read('SELECT '+group.map((name,j)=>'(SELECT COUNT(*) FROM "'+name+'") AS t'+j).join(','))[0];actual.push(...group.map((name,j)=>({name,n:counts['t'+j]})));}
  if(JSON.stringify(expected)!==JSON.stringify(actual))throw Error('Restored table counts do not match the saved snapshot.');
  const canonical=rows=>JSON.stringify(rows.map(row=>Object.fromEntries(Object.entries(row).sort())).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
  // Exact content check on the full snapshot, bounded for the small free-tier pilot.
  for(const {name,n} of expected){if(n>10000)throw Error('Large database requires a chunked content comparison.');if(!n)continue;const original=local.prepare('SELECT * FROM "'+name+'"').all(),copy=read('SELECT * FROM "'+name+'"');if(sha(canonical(original))!==sha(canonical(copy)))throw Error('Restored content differs in '+name);}
  if(read('PRAGMA foreign_key_check').length||String(Object.values(read('PRAGMA quick_check')[0])[0]).toLowerCase()!=='ok'||Object.values(local.prepare('PRAGMA integrity_check').get())[0]!=='ok')throw Error('Restored integrity check failed.');
  verified=true;const report={verified:true,completedAt:Math.floor(Date.now()/1000),sourceDatabaseId:binding.database_id,disposableDatabaseId:testId,backup:backupPath,sha256:sha(decoded),tables:tables.length,records:expected.reduce((n,t)=>n+t.n,0),splitLargeRows:importable.splitRows,mode:'encrypted_full_sql_export_import',productionRestored:false};writeFileSync(resolve(backupDir,'cloud-d1-'+token+'.report.json'),JSON.stringify(report,null,2));
 }finally{local.close();}
}finally{
 for(const path of [plaintext,restored])if(existsSync(path))unlinkSync(path);
 if(testId&&testId!==binding.database_id&&/^ai-arenda-recovery-[a-f0-9]{12}$/.test(testName)){
  const config=JSON.parse(readFileSync(tempConfig,'utf8'));if(config.d1_databases?.[0]?.database_id!==testId||config.d1_databases?.[0]?.database_name!==testName)throw Error('Refusing cleanup: disposable identity mismatch.');
  cli(['d1','delete',testName,'--config',tempConfig,'-y'],'delete-disposable');cleanup=true;
 }
 console.log(JSON.stringify({verified,disposableRemoved:cleanup,encryptedBackupSaved:!!backupPath,productionRestored:false,privateLogs:work}));
}
