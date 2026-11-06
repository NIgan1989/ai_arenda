// Synthetic fixtures for an explicitly isolated localhost browser QA database only.
// The fixed password below is public test data, never an application credential.
import {DatabaseSync} from 'node:sqlite';
import {pbkdf2Sync,randomBytes,createHash} from 'node:crypto';
import {readdirSync,readFileSync,writeFileSync,mkdirSync,realpathSync,existsSync,lstatSync} from 'node:fs';
import {resolve,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import ts from 'typescript';
import {photo} from '../tests/fixtures/photo.mjs';

const projectRoot=fileURLToPath(new URL('../',import.meta.url)),qaRoot=resolve(projectRoot,'outputs/browser-qa'),stateRoot=resolve(qaRoot,'state'),storage=resolve(stateRoot,'v3/d1/miniflare-D1DatabaseObject');
const password='Browser-fixture-2026',marker='browser-qa:seed:v1',now=()=>Math.floor(Date.now()/1000),iso=value=>new Date(value*1000).toISOString();
const accounts=[{id:'qa-owner',phone:'+77000000001',name:'Тестовый владелец',roles:['guest','owner']},{id:'qa-guest',phone:'+77000000002',name:'Тестовый гость',roles:['guest']},{id:'qa-cleaner',phone:'+77000000003',name:'Тестовый исполнитель',roles:['guest','cleaner']}];
if(!process.argv.includes('--confirm-isolated')||process.argv.slice(2).some(arg=>arg!=='--confirm-isolated'))throw Error('Use node scripts/seed-browser-qa.mjs --confirm-isolated. Only outputs/browser-qa/state is supported.');
const canonicalProject=realpathSync(projectRoot),expectedQa=resolve(canonicalProject,'outputs/browser-qa');
function isolated(path){
 const absolute=resolve(path);if(absolute!==qaRoot&&!absolute.startsWith(qaRoot+sep))throw Error('Target must stay inside outputs/browser-qa');
 if(!existsSync(path))throw Error('Start the isolated QA server and make one database request first.');
 const canonical=realpathSync(path);if(canonical.split(/[\\/]/).some(part=>part==='.wrangler'))throw Error('Refusing a .wrangler database');
 if(canonical!==expectedQa&&!canonical.startsWith(expectedQa+sep))throw Error('QA path escapes its exact workspace directory');
 if(lstatSync(path).isSymbolicLink())throw Error('QA symlinks and junctions are not accepted');return absolute;
}
isolated(qaRoot);isolated(stateRoot);isolated(storage);
const filenames=readdirSync(storage).filter(name=>name.endsWith('.sqlite')&&name!=='metadata.sqlite');if(filenames.length!==1)throw Error('Expected exactly one non-metadata SQLite database in the isolated state directory; found '+filenames.length);
const filename=isolated(resolve(storage,filenames[0]));
class D1Fixture{
 constructor(path){this.raw=new DatabaseSync(path);this.depth=0;this.raw.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');}
 prepare(sql){const db=this.raw;let values=[];return {bind(...args){values=args;return this;},async first(){return db.prepare(sql).get(...values)||null;},async all(){return {results:db.prepare(sql).all(...values)};},execute(){const result=db.prepare(sql).run(...values);return {meta:{changes:Number(result.changes)}};},async run(){return this.execute();}};}
 async batch(statements){const nested=this.depth>0,savepoint='fixture_batch_'+this.depth;this.raw.exec(nested?'SAVEPOINT '+savepoint:'BEGIN IMMEDIATE');this.depth++;try{const result=statements.map(statement=>statement.execute());this.raw.exec(nested?'RELEASE '+savepoint:'COMMIT');return result;}catch(error){this.raw.exec(nested?'ROLLBACK TO '+savepoint+'; RELEASE '+savepoint:'ROLLBACK');throw error;}finally{this.depth--;}}
 close(){this.raw.close();}
}
const db=new D1Fixture(filename);
function metadata(result,seeded){return {seeded,state:'outputs/browser-qa/state',accounts:accounts.map(a=>({id:a.id,roles:a.roles})),...result};}
try{
 if(!db.raw.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='profiles'").get()){
  for(const file of readdirSync(resolve(projectRoot,'drizzle')).filter(name=>/^\d{4}_.*\.sql$/.test(name)).sort()){
   db.raw.exec('BEGIN IMMEDIATE');try{db.raw.exec(readFileSync(resolve(projectRoot,'drizzle',file),'utf8'));db.raw.exec('COMMIT');}catch(error){db.raw.exec('ROLLBACK');throw Error('Isolated fixture migration failed: '+file,{cause:error});}
  }
 }
 const unexpected=db.raw.prepare("SELECT COUNT(*) n FROM profiles WHERE id NOT IN ('qa-owner','qa-guest','qa-cleaner')").get();if(unexpected.n)throw Error('Refusing to seed a database containing accounts outside the three synthetic QA identities');
 const old=db.raw.prepare('SELECT action FROM audit_events WHERE id=?').get(marker);
 if(old){console.log(JSON.stringify(metadata(JSON.parse(old.action),false)));}
 else{
  for(const table of ['auth_accounts','property_imports','pilot_policy','ai_budget_preferences','calendar_previews','review_property_bindings'])if(!db.raw.prepare("SELECT name FROM sqlite_master WHERE name=? AND type='table'").get(table))throw Error('The isolated database has a partial schema. Apply all migrations to that isolated database before seeding.');
  const generated=resolve(qaRoot,'lib');mkdirSync(generated,{recursive:true});isolated(generated);
  for(const name of readdirSync(resolve(projectRoot,'lib')).filter(name=>name.endsWith('.ts')&&!name.endsWith('.d.ts'))){
   const result=ts.transpileModule(readFileSync(resolve(projectRoot,'lib',name),'utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText.replace(/from '(\.\/[^']+)'/g,(_,value)=>"from '"+(value.endsWith('.js')?value:value+'.js')+"'");writeFileSync(resolve(generated,name.replace(/\.ts$/,'.js')),result);
  }
  const {RentalService}=await import(pathToFileURL(resolve(generated,'service.js'))),{saveOperationRules,saveWorkerDispatch}=await import(pathToFileURL(resolve(generated,'dispatch.js')));
  db.raw.exec('BEGIN IMMEDIATE');db.depth++;
  let result;
  try{
   for(const account of accounts){
    const occupied=db.raw.prepare('SELECT id FROM auth_accounts WHERE phone=?').get(account.phone);if(occupied&&occupied.id!==account.id)throw Error('Synthetic QA phone already belongs to a different fixture identity');
    const salt=randomBytes(16).toString('hex'),passwordHash='pbkdf2-sha512$100000$'+salt+'$'+pbkdf2Sync(password,salt,100000,64,'sha512').toString('hex'),recovery=createHash('sha256').update('browser-fixture-recovery:'+account.id).digest('hex');
    db.raw.prepare('INSERT OR IGNORE INTO auth_accounts(id,phone,name,password_hash,recovery_hash,created_at) VALUES (?,?,?,?,?,?)').run(account.id,account.phone,account.name,passwordHash,recovery,now());
    await new RentalService(db,account.id).saveProfile({name:account.name,contact:account.phone,roles:account.roles,city:'Павлодар',districts:'Центр',experience:'Синтетическая анкета для проверки интерфейса',availability:'Только тестовый стенд'});
   }
   const owner=new RentalService(db,'qa-owner'),guest=new RentalService(db,'qa-guest'),cleaner=new RentalService(db,'qa-cleaner'),image=await owner.uploadMedia({kind:'property',data:photo});
   const rental={hourlyPrice:2000,minHours:2,nightlyPrice:9000,checkinTime:'14:00',checkoutTime:'12:00',deposit:5000,houseRules:'Учебная квартира. Только синтетические данные для проверки интерфейса.'};
   const property=await owner.saveListing(null,{title:'Тестовая квартира для проверки',city:'Павлодар',district:'Центр',address:'Тестовый адрес, дом 1, квартира 1',description:'Синтетическая квартира для проверки всех ролей сервиса. Это вымышленные сведения; объявление доступно только на изолированном локальном стенде.',price:10000,rooms:1,capacity:2,cleaningMinutes:90,published:true,photos:[image.id],expectedVersion:0,policyVersion:0,details:{type:'apartment',area:45,beds:2,bathrooms:1,floor:2,floors:9,checkinMethod:'meet',amenities:['wifi','kitchen','linen'],pets:false,smoking:false,parties:false},rental});
   await owner.savePolicy(property.id,{...rental,expectedVersion:1,dailyPrice:10000,autoConfirm:false,autoAssign:false,cleaningFee:3000,cleaningBudget:4000});
   await owner.readinessAction(property.id,{readiness:'ready',expectedVersion:1,inspected:true,note:'Синтетическое подтверждение для тестового стенда'});
   await saveOperationRules(owner,{propertyId:property.id,expectedVersion:0,autoOffers:true,autoReplace:false,requirePhotos:true,offerMinutes:10});await saveWorkerDispatch(cleaner,{receiveOffers:true});
   const start=now()+7200,end=start+7200,booking=await guest.createBooking({propertyId:property.id,start:iso(start),end:iso(end),guests:1,billingMode:'hourly',requestKey:'browser-qa-booking-v1',acceptTerms:true});
   await owner.bookingAction(booking.id,{action:'confirm',cleaningFee:3000});const job=db.raw.prepare('SELECT id FROM cleaning_jobs WHERE booking_id=?').get(booking.id);if(!job)throw Error('Expected linked QA cleaning job');
   await cleaner.jobAction(job.id,{action:'apply'});const application=db.raw.prepare("SELECT id FROM applications WHERE job_id=? AND user_id='qa-cleaner'").get(job.id);await owner.jobAction(job.id,{action:'assign',applicationId:application.id});
   result={propertyId:property.id,bookingId:booking.id,jobId:job.id,start,end};
   db.raw.prepare('INSERT INTO audit_events(id,actor_id,entity_id,action,created_at) VALUES (?,?,?,?,?)').run(marker,'qa-owner',property.id,JSON.stringify(result),now());
   if(db.raw.prepare('PRAGMA foreign_key_check').all().length)throw Error('Isolated fixture foreign-key check failed');
   db.raw.exec('COMMIT');
  }catch(error){db.raw.exec('ROLLBACK');throw error;}finally{db.depth--;}
  console.log(JSON.stringify(metadata(result,true)));
 }
}finally{db.close();}
