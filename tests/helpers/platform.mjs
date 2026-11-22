import {IDENTITY_SHIM} from './identity-shim.mjs';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync,mkdirSync,readdirSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
const output=process.cwd()+'/outputs/platform-tests-'+process.pid;mkdirSync(output,{recursive:true});
for(const file of readdirSync('lib').filter(f=>f.endsWith('.ts')&&!f.endsWith('.d.ts'))){const js=ts.transpileModule(readFileSync('lib/'+file,'utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText.replace(/from '(\.\/[^']+)'/g,(_,name)=>`from '${/\.(js|mjs)$/.test(name)?name:name+'.js'}'`);writeFileSync(output+'/'+file.replace(/\.ts$/,'.js'),js);}
export const load=name=>import(pathToFileURL(output+'/'+name+'.js'));
// The map's address search never leaves the tests: by default it finds nothing, a test that needs a find stubs it itself.
{const real=globalThis.fetch;globalThis.fetch=async(url,init)=>/nominatim\.openstreetmap\.org|api\.stadiamaps\.com\/geocoding/.test(String(url))?new Response('[]',{headers:{'content-type':'application/json'}}):real(url,init);}
export class TestDatabase{
 constructor(filename=':memory:'){this.raw=new DatabaseSync(filename);this.db=this.raw;this.raw.exec('PRAGMA foreign_keys=ON');for(const file of readdirSync('drizzle').filter(f=>/^\d+.*\.sql$/.test(f)).sort())this.raw.exec(readFileSync('drizzle/'+file,'utf8'));this.raw.exec(IDENTITY_SHIM);}
 prepare(sql){const db=this.raw;let args=[];return {bind(...values){args=values;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},execute(){const r=db.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}};},async run(){return this.execute();}};}
 async batch(statements){this.raw.exec('BEGIN');try{const results=statements.map(statement=>statement.execute());this.raw.exec('COMMIT');return results;}catch(error){this.raw.exec('ROLLBACK');throw error;}}
 close(){this.raw.close();}
}
export const now=()=>Math.floor(Date.now()/1000),iso=t=>new Date(t*1000).toISOString();
// A photo of the title the owner attached to a place, as saveRightDoc stores it.
export function rightDoc(db,propertyId,ownerId,kind='owner'){db.raw.prepare("INSERT INTO property_right_docs(id,property_id,owner_id,kind,data,width,height,bytes,created_at) VALUES (?,?,?,?,'data:image/jpeg;base64,AA==',1,1,1,?)").run('doc-'+propertyId+'-'+Math.random().toString(36).slice(2,8),propertyId,ownerId,kind,now());}
// A photo of the ID card a participant attached in the profile.
export function identityDoc(db,userId){db.raw.prepare("INSERT INTO identity_docs(id,user_id,data,width,height,bytes,created_at) VALUES (?,?,'data:image/jpeg;base64,AA==',1,1,1,?)").run('id-'+userId+'-'+Math.random().toString(36).slice(2,8),userId,now());}
export async function fixture(){
 const {RentalService}=await load('service'),db=new TestDatabase(),owner=new RentalService(db,'owner'),guest=new RentalService(db,'guest'),cleaner=new RentalService(db,'cleaner'),other=new RentalService(db,'other');
 // The fixture checks what is charged once the free start is over: «14 дней бесплатно» (migration 0095) is switched off
 // here and tested on its own (tests/service-billing-audit.test.mjs).
 db.raw.prepare("UPDATE platform_billing SET free_days=0 WHERE id='global'").run();
 for(const [service,name,roles] of [[owner,'Owner',['owner']],[guest,'Guest',['guest']],[cleaner,'Cleaner',['cleaner']],[other,'Other',['owner']]])await service.saveProfile({name,roles,city:'Павлодар',contact:'test',districts:'Центр',experience:'Experienced',availability:'By agreement'});
 const property=(await owner.createProperty({title:'Test apartment',city:'Павлодар',district:'Центр',address:'PRIVATE ADDRESS',description:'Test',price:10000,rooms:1,capacity:2,cleaningMinutes:90})).id;
 const policy={expectedVersion:0,dailyPrice:10000,hourlyPrice:2000,minHours:2,nightlyPrice:9000,checkinTime:'14:00',checkoutTime:'12:00',deposit:10000,houseRules:'No smoking',autoConfirm:false,autoAssign:false,cleaningFee:3000,cleaningBudget:4000};await owner.savePolicy(property,policy);
 const booking=(await guest.createBooking({propertyId:property,start:iso(now()+3600),end:iso(now()+10800),guests:1,billingMode:'hourly',requestKey:'booking',acceptTerms:true})).id;await owner.bookingAction(booking,{action:'confirm',cleaningFee:3000});/* The fixture's stay is paid in advance as before lib/prepay.ts; tests/prepay.test.mjs covers the new place paid at the arrival. */db.raw.prepare('UPDATE booking_terms SET prepay_percent=NULL WHERE booking_id=?').run(booking);const job=db.raw.prepare('SELECT * FROM cleaning_jobs WHERE booking_id=?').get(booking);
 // The owner has proven the right to let the place (lib/property-rights.ts): a person at the platform may approve it.
 rightDoc(db,property,'owner');
 return {db,owner,guest,cleaner,other,property,policy,booking,job,release(){db.raw.prepare('UPDATE administrator_runs SET lease_until=0').run();}};
}
