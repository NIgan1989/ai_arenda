import {DomainError,type Role} from './domain';
import {sweepReviews} from './admin-autocheck';
import {sweepIssues} from './admin-issues';
import {sweepOverdueJobs} from './overdue-cleaning';
import {sweepArrivals} from './arrival-autopilot';
import {sweepStays} from './stay-watch';
import {sweepPrep,sweepReadyBefore} from './bath-prep';
import {sweepPlans} from './autopilot-plans';
import {sweepReports} from './admin-reports';
import {sendDigest} from './admin-digest';
import {RentalService} from './service';
import {checkAdministratorOwner} from './administrator-runtime';
import {deliverOutbox} from './delivery';
import {deliverWebPush} from './web-push';
import {deliverNativePush} from './native-push';
import {advanceMatchingRequests} from './matching-background';
import {refreshCalendar} from './external-calendar';
import {sweepSilence} from './owner-silence';
import {migrateFinanceEntity} from './finance';
import {encryptInstructions} from './participant-security';
import {moveMediaToBucket,sweepMediaObjects} from './media-store';
import {sweepIdentityObjects} from './identity-docs';
import {askFreeRooms,syncAllRoomUnits} from './room-units';
import {sweepRightObjects} from './property-rights';
import {applyDuePayouts} from './payout';
import {sweepAdminFactor} from './admin-factor';
import {sweepCalls} from './chat-calls';
import {epoch,uuid,q,one,rows,type Row,type OperationConfig} from './operation-core';

export async function enqueueJob(db:D1Database,id:string,kind:string,scope:string,payload:Row={},repeatSeconds=0){await q(db,'INSERT OR IGNORE INTO background_jobs(id,kind,scope,payload,available_at,repeat_seconds,updated_at) VALUES (?,?,?,?,?,?,?)',id,kind,scope,JSON.stringify(payload),epoch(),repeatSeconds,epoch()).run();}
// Jobs of the service itself (delivery, the administrator's sweeps, matching) go before the per-owner ones, so that a
// growing number of owners cannot push a guest's notification or an overdue cleaning to a later minute.
export async function runBackgroundJobs(db:D1Database,handler:(job:Row)=>Promise<unknown>,limit=12){
 const due=await rows(db,"SELECT id FROM background_jobs WHERE status='pending' AND available_at<=? OR status='running' AND lease_until<=? ORDER BY scope<>'system',available_at,id LIMIT ?",epoch(),epoch(),limit);let completed=0,failures=0;
 const deadline=Date.now()+35000;
 for(const candidate of due){
  if(Date.now()>deadline)break;const token=uuid(),job=await q(db,"UPDATE background_jobs SET status='running',lease_token=?,lease_until=?,attempts=attempts+1,updated_at=? WHERE id=? AND ((status='pending' AND available_at<=?) OR (status='running' AND lease_until<=?)) RETURNING *",token,epoch()+120,epoch(),candidate.id,epoch(),epoch()).first<Row>();if(!job)continue;
  try{await handler({...job,payload:JSON.parse(job.payload)});await q(db,"UPDATE background_jobs SET status=?,available_at=?,lease_until=0,last_completed=?,attempts=0,last_error='',updated_at=? WHERE id=? AND lease_token=? AND status='running'",job.repeat_seconds?'pending':'done',epoch()+job.repeat_seconds,epoch(),epoch(),job.id,token).run();completed++;}
  catch{await q(db,"UPDATE background_jobs SET status=?,available_at=?,lease_until=0,last_error='operation_failed',updated_at=? WHERE id=? AND lease_token=? AND status='running'",job.attempts>=job.max_attempts?'dead':'pending',epoch()+Math.min(3600,15*2**Math.min(job.attempts-1,8)),epoch(),job.id,token).run();failures++;}
 }
 return {completed,failures};
}

// The check of each owner (lib/administrator-runtime.ts) in the background, for the times nobody has the app open: a
// person's own actions and the app's refresh run it at once. Every two minutes is enough for expiries and offers, and
// keeps the rows read from the database within the daily limit.
export const OWNER_EVERY=120;
async function discover(db:D1Database,job:Row){
 const cursor=String(job.payload.ownerCursor||''),calendarCursor=String(job.payload.calendarCursor||'');
 let owners=await rows(db,'SELECT DISTINCT owner_id FROM properties WHERE owner_id>? ORDER BY owner_id LIMIT 100',cursor);if(!owners.length)owners=await rows(db,'SELECT DISTINCT owner_id FROM properties ORDER BY owner_id LIMIT 100');
 for(const owner of owners){await enqueueJob(db,'owner:'+owner.owner_id,'owner',owner.owner_id,{},OWNER_EVERY);await enqueueJob(db,'finance-history:'+owner.owner_id,'finance-history',owner.owner_id,{},60);}
 let sources=await rows(db,"SELECT id,owner_id FROM calendar_sources WHERE enabled=1 AND url<>'' AND id>? ORDER BY id LIMIT 100",calendarCursor);if(!sources.length)sources=await rows(db,"SELECT id,owner_id FROM calendar_sources WHERE enabled=1 AND url<>'' ORDER BY id LIMIT 100");
 for(const source of sources)await enqueueJob(db,'calendar:'+source.id,'calendar',source.owner_id,{sourceId:source.id},900);
 await q(db,'UPDATE background_jobs SET payload=? WHERE id=?',JSON.stringify({ownerCursor:owners.at(-1)?.owner_id||'',calendarCursor:sources.at(-1)?.id||''}),job.id).run();
}
async function migrateHistory(db:D1Database,ownerId:string){
 const bookings=await rows(db,"SELECT b.id FROM bookings b JOIN properties p ON p.id=b.property_id WHERE p.owner_id=? AND NOT EXISTS(SELECT 1 FROM finance_backfill_receipts WHERE entity_key='booking:'||b.id) ORDER BY b.created_at,b.id LIMIT 20",ownerId);
 const jobs=await rows(db,"SELECT id FROM cleaning_jobs j WHERE owner_id=? AND NOT EXISTS(SELECT 1 FROM finance_backfill_receipts WHERE entity_key='job:'||j.id) ORDER BY created_at,id LIMIT 20",ownerId),service=new RentalService(db,ownerId);
 for(const b of bookings)await migrateFinanceEntity(service,'booking',b.id);for(const j of jobs)await migrateFinanceEntity(service,'job',j.id);
 // With the history moved there is nothing to do every minute: the owner's job comes back once a day.
 await q(db,"UPDATE background_jobs SET repeat_seconds=? WHERE id=?",bookings.length||jobs.length?60:86400,'finance-history:'+ownerId).run();
 return {bookings:bookings.length,jobs:jobs.length};
}
// The nightly snapshot of every table, encrypted, in the private bucket. A small database is one object, as before
// (private-backups/DATE.snapshot.enc). A table is read in pages and a big database is written as numbered parts
// (private-backups/DATE/part-001.snapshot.enc …), each a complete JSON of the same shape; the last one says how many there are.
export const BACKUP_PAGE=2000,BACKUP_PART_BYTES=2*1024*1024;
export async function cloudBackup(db:D1Database,config:OperationConfig,page=BACKUP_PAGE,partBytes=BACKUP_PART_BYTES){
 if(!config.BUCKET||!config.ACCESS_ENCRYPTION_KEY)return {configured:false};
 const tables=await rows(db,"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name"),createdAt=epoch(),day=new Date().toISOString().slice(0,10);
 const parts:string[]=[];let held:Row={},size=0;
 const flush=()=>{if(Object.keys(held).length||!parts.length){parts.push(JSON.stringify({schemaVersion:22,createdAt,part:parts.length+1,tables:held}));held={};size=0;}};
 for(const table of tables){
  if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table.name))throw new Error('Unknown table');
  held[table.name]=held[table.name]||[];
  if(table.name==='journey_sessions')continue;
  // Pages go by rowid, not by offset: a row deleted meanwhile (expired sign-ins, a removed account) cannot shift
  // the rows after it out of the copy.
  for(let after=0;;){
   const values=await rows(db,'SELECT rowid AS __rowid,* FROM "'+table.name+'" WHERE rowid>? ORDER BY rowid LIMIT ?',after,page);
   for(const {__rowid,...value} of values){after=Number(__rowid);const text=JSON.stringify(value);if(size&&size+text.length>partBytes){flush();held[table.name]=[];}held[table.name].push(value);size+=text.length+1;}
   if(values.length<page)break;
  }
 }
 flush();
 const put=async(key:string,body:string)=>config.BUCKET!.put(key,await encryptInstructions(body,config),{httpMetadata:{contentType:'application/octet-stream'}});
 if(parts.length===1){const key='private-backups/'+day+'.snapshot.enc';await put(key,parts[0]);return {key,parts:1};}
 for(let i=0;i<parts.length;i++)await put('private-backups/'+day+'/part-'+String(i+1).padStart(3,'0')+'.snapshot.enc',i===parts.length-1?parts[i].replace('{"schemaVersion":22,','{"schemaVersion":22,"parts":'+parts.length+','):parts[i]);
 return {key:'private-backups/'+day+'/',parts:parts.length};
}
// One tick a minute; the 35-second deadline inside runBackgroundJobs is what really bounds it.
export const TICK_JOBS=40;
export async function runOperationalTick(db:D1Database,config:OperationConfig={}){
 await enqueueJob(db,'matching-dispatch','matching-dispatch','system',{},30);
 // Payout details whose 24 hours passed go into use; expired administrator codes and sessions are dropped.
 try{await applyDuePayouts(db);await sweepAdminFactor(db);}catch{console.error('Account protection sweep failed');}
 // A ring nobody took ends on the server, not only when one of the two phones asks (lib/chat-calls.ts).
 try{await sweepCalls(db);}catch{console.error('Call sweep failed');}
 await q(db,'UPDATE journey_sessions SET longitude=NULL,latitude=NULL,accuracy=NULL,route=NULL,route_recorded_at=NULL WHERE (expires_at<=? OR stopped_at IS NOT NULL) AND (longitude IS NOT NULL OR route IS NOT NULL)',epoch()).run();
 await enqueueJob(db,'discovery','discovery','system',{},30);await enqueueJob(db,'admin-autocheck','admin-autocheck','system',{},300);await enqueueJob(db,'admin-issues','admin-issues','system',{},120);await enqueueJob(db,'autopilot-plans','autopilot-plans','system',{},600);await enqueueJob(db,'delivery','delivery','system',{},30);if(config.BUCKET&&config.ACCESS_ENCRYPTION_KEY)await enqueueJob(db,'cloud-backup','backup','system',{},86400);
 // «Номера одного типа»: the rooms follow their card's price, rules and photos (lib/room-units.ts).
 await enqueueJob(db,'room-units','room-units','system',{},120);
 if(config.BUCKET){await enqueueJob(db,'media-move','media-move','system',{},60);await enqueueJob(db,'media-sweep','media-sweep','system',{},3600);}
 const result=await runBackgroundJobs(db,async job=>{
  if(job.kind==='discovery')return discover(db,job);
  if(job.kind==='room-units')return {leads:await syncAllRoomUnits(db)};
  if(job.kind==='autopilot-plans')return sweepPlans(db,undefined,config as OperationConfig&{PLATFORM_ADMIN_IDS?:string});
  if(job.kind==='admin-issues')return {issues:await sweepIssues(db,config as OperationConfig&{PLATFORM_ADMIN_IDS?:string}),overdue:await sweepOverdueJobs(db,config as OperationConfig&{PLATFORM_ADMIN_IDS?:string}),arrivals:await sweepArrivals(db),stays:await sweepStays(db,config as OperationConfig&{PLATFORM_ADMIN_IDS?:string}),prep:await sweepPrep(db),readyBefore:await sweepReadyBefore(db),silence:await sweepSilence(db,config as OperationConfig&{PLATFORM_ADMIN_IDS?:string}),reports:await sweepReports(db),digest:await sendDigest(db,config as OperationConfig&{PLATFORM_ADMIN_IDS?:string}),rooms:await askFreeRooms(db)};
  if(job.kind==='admin-autocheck')return sweepReviews(db,config as OperationConfig&{PLATFORM_ADMIN_IDS?:string});
  if(job.kind==='matching-dispatch')return advanceMatchingRequests(db,config);
  if(job.kind==='owner')return checkAdministratorOwner(db,job.scope);
  if(job.kind==='delivery')return {external:await deliverOutbox(db,config,12,id=>new RentalService(db,id)),push:await deliverWebPush(db,config,12),app:await deliverNativePush(db,config,12)};
  if(job.kind==='calendar')return refreshCalendar(db,job.payload.sourceId,config);
  if(job.kind==='finance-history')return migrateHistory(db,job.scope);
  if(job.kind==='backup')return cloudBackup(db,config);
  if(job.kind==='media-move')return moveMediaToBucket(db,config.BUCKET);
  if(job.kind==='media-sweep'){const r=await sweepMediaObjects(db,config.BUCKET,String(job.payload.cursor||'')),ids=await sweepIdentityObjects(db,config.BUCKET,String(job.payload.identityCursor||'')),rights=await sweepRightObjects(db,config.BUCKET,String(job.payload.rightsCursor||''));await q(db,'UPDATE background_jobs SET payload=? WHERE id=?',JSON.stringify({cursor:r.cursor,identityCursor:ids.cursor,rightsCursor:rights.cursor}),job.id).run();return {...r,identity:ids,rights};}
  throw new Error('Unknown background operation');
 },TICK_JOBS);
 const dead=await one(db,"SELECT COUNT(*) n FROM background_jobs WHERE status='dead'");
 await q(db,"INSERT INTO administrator_runs(id,last_success,checked_at) VALUES ('scheduler',?,?) ON CONFLICT(id) DO UPDATE SET last_success=excluded.last_success,checked_at=excluded.checked_at,last_error=?",epoch(),epoch(),result.failures||dead?.n?'Есть ошибки отдельных фоновых операций':'').run();
 return result;
}
export async function operationalHealth(service:RentalService,role:Role,platformAdmin=false){
 const where=platformAdmin?'1=1':'scope=?',args=platformAdmin?[]:[service.userId];
 const jobs=await rows(service.db,`SELECT id,kind,status,attempts,available_at,last_completed,last_error,updated_at FROM background_jobs WHERE ${where} ORDER BY status='dead' DESC,updated_at DESC LIMIT 100`,...args);
 const heartbeat=await one(service.db,"SELECT checked_at,last_success,last_error FROM administrator_runs WHERE id='scheduler'");
 const backups=await rows(service.db,"SELECT kind,status,last_completed,last_error FROM background_jobs WHERE id IN ('local-backup','cloud-backup')");
 return {jobs,heartbeat,backups,serverTime:epoch(),cloudBackupConfigured:false,note:'Очередь сохраняет задания и повторяет сбои. Внешние доставки имеют собственный журнал попыток.'};
}
export async function retryBackgroundJob(service:RentalService,body:Row,platformAdmin=false){
 const job=await one(service.db,'SELECT * FROM background_jobs WHERE id=?',String(body.id||''));if(!job||!platformAdmin&&job.scope!==service.userId)throw new DomainError('Операция недоступна.',403);
 if(!['dead','pending'].includes(job.status))throw new DomainError('Операция уже выполняется или завершена.',409);
 await q(service.db,"UPDATE background_jobs SET status='pending',attempts=0,available_at=?,last_error='' WHERE id=? AND status IN ('dead','pending')",epoch(),job.id).run();return {message:'Повтор поставлен в очередь.'};
}
