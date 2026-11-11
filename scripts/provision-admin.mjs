// Local operator setup. Credentials arrive through hidden stdin and are never logged.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {randomBytes,randomUUID,pbkdf2Sync,createHash,timingSafeEqual} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {locateDatabase,createLocalBackup} from './local-backup.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
if(process.stdin.isTTY)process.stdin.setRawMode(true);
console.log('Ready for administrator account JSON on stdin (input is hidden).');
let input='';const body=await new Promise((resolve,reject)=>{process.stdin.on('data',chunk=>{input+=chunk.toString();if(input.includes('\x03'))process.exit(130);if(input.length>4096)reject(Error('Input too large'));if(/[\r\n]/.test(input)){process.stdin.pause();if(process.stdin.isTTY)process.stdin.setRawMode(false);try{resolve(JSON.parse(input.trim()));}catch{reject(Error('Invalid JSON'));}}});});
const phone=String(body.phone||'').replace(/[\s()-]/g,''),email=String(body.email||'').trim().toLowerCase(),password=body.password;
if(!/^\+[1-9]\d{9,14}$/.test(phone)||!/^\S+@\S+\.\S+$/.test(email)||email.length>254||typeof password!=='string'||password.length<10||password.length>128)throw Error('Check phone, email and password length (10–128).');
const path=locateDatabase();if(!path)throw Error('Initialize the local rental database first.');
const envFile=new URL('../.dev.vars',import.meta.url),source=readFileSync(envFile,'utf8'),env=parseEnv(source);
if(!env.ACCESS_ENCRYPTION_KEY)throw Error('Create the backup encryption key before provisioning.');
await createLocalBackup({force:true});
const db=new DatabaseSync(path);db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
let account,created=false,changedPassword=false,recoveryCode;
try{
 db.exec('BEGIN IMMEDIATE');
 account=db.prepare('SELECT id,name,password_hash,credential_version FROM auth_accounts WHERE phone=?').get(phone);
 if(!account){const id=randomUUID(),name=String(body.name||'Администратор').trim().slice(0,100);recoveryCode=randomBytes(24).toString('hex').match(/.{1,8}/g).join('-');const salt=randomBytes(16).toString('hex'),stored=`pbkdf2-sha512$100000$${salt}$${pbkdf2Sync(password,salt,100000,64,'sha512').toString('hex')}`;db.prepare('INSERT INTO auth_accounts(id,phone,name,password_hash,recovery_hash,created_at) VALUES (?,?,?,?,?,?)').run(id,phone,name,stored,hash(recoveryCode.replaceAll('-','')),Math.floor(Date.now()/1000));account={id,name};created=true;
 }else{const parts=account.password_hash.split('$'),actual=pbkdf2Sync(password,parts[2],100000,64,'sha512'),expected=Buffer.from(parts[3],'hex');if(actual.length!==expected.length||!timingSafeEqual(actual,expected)){const salt=randomBytes(16).toString('hex'),stored=`pbkdf2-sha512$100000$${salt}$${pbkdf2Sync(password,salt,100000,64,'sha512').toString('hex')}`;db.prepare('UPDATE auth_accounts SET password_hash=?,credential_version=credential_version+1 WHERE id=?').run(stored,account.id);db.prepare('DELETE FROM auth_sessions WHERE user_id=?').run(account.id);db.prepare('DELETE FROM auth_mobile_sessions WHERE user_id=?').run(account.id);changedPassword=true;}}
 db.prepare(`INSERT INTO profiles(id,name,contact,city,roles,districts,experience,availability,created_at) VALUES (?,?,?,'Павлодар','["guest"]','','','',?) ON CONFLICT(id) DO NOTHING`).run(account.id,account.name,phone,Math.floor(Date.now()/1000));
 db.prepare('INSERT INTO audit_events VALUES (?,?,?,?,?)').run(randomUUID(),'system:local-operator',account.id,'admin.account_provisioned',Math.floor(Date.now()/1000));
 db.exec('COMMIT');
}catch(error){db.exec('ROLLBACK');throw error;}finally{db.close();}
const ids=[...new Set([...(env.PLATFORM_ADMIN_IDS||'').split(',').map(v=>v.trim()).filter(Boolean),account.id])];
const lines=source.split(/\r?\n/).filter(line=>!/^\s*(PLATFORM_ADMIN_IDS|ADMIN_LOGIN_EMAIL|ADMIN_LOGIN_PHONE)\s*=/.test(line));
writeFileSync(envFile,lines.join('\n').trimEnd()+'\nPLATFORM_ADMIN_IDS='+ids.join(',')+'\nADMIN_LOGIN_EMAIL='+email+'\nADMIN_LOGIN_PHONE='+phone+'\n');
if(recoveryCode){mkdirSync('.sites-runtime',{recursive:true});writeFileSync('.sites-runtime/admin-recovery.txt','Резервный код управляющего аккаунта. Храните отдельно от проекта.\n\n'+recoveryCode+'\n',{mode:0o600});}
console.log(JSON.stringify({configured:true,created,passwordChanged:changedPassword,existingDataPreserved:true,recoveryFileCreated:!!recoveryCode,restartRequired:true}));
