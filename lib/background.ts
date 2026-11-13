import {DomainError,type Role} from './domain';
import {sweepReviews} from './admin-autocheck';
import {RentalService} from './service';
import {checkAdministratorOwner} from './administrator-runtime';
import {deliverOutbox} from './delivery';
import {deliverWebPush} from './web-push';
import {advanceMatchingRequests} from './matching-background';
import {refreshCalendar} from './external-calendar';
import {migrateFinanceEntity} from './finance';
import {encryptInstructions} from './participant-security';
import {moveMediaToBucket,sweepMediaObjects} from './media-store';
import {epoch,uuid,q,one,rows,type Row,type OperationConfig} from './operation-core';

export async function enqueueJob(db:D1Database,id:string,kind:string,scope:string,payload:Row={},repeatSeconds=0){await q(db,'INSERT OR IGNORE INTO background_jobs(id,kind,scope,payload,available_at,repeat_seconds,updated_at) VALUES (?,?,?,?,?,?,?)',id,kind,scope,JSON.stringify(payload),epoch(),repeatSeconds,epoch()).run();}
export async function runBackgroundJobs(db:D1Database,handler:(job:Row)=>Promise<unknown>,limit=12){
 const due=await rows(db,"SELECT id FROM background_jobs WHERE status='pending' AND available_at<=? OR status='running' AND lease_until<=? ORDER BY available_at,id LIMIT ?",epoch(),epoch(),limit);let completed=0,failures=0;
 const deadline=Date.now()+35000;
 for(const candidate of due){
  if(Date.now()>deadline)break;const token=uuid(),job=await q(db,"UPDATE background_jobs SET status='running',lease_token=?,lease_until=?,attempts=attempts+1,updated_at=? WHERE id=? AND ((status='pending' AND available_at<=?) OR (status='running' AND lease_until<=?)) RETURNING *",token,epoch()+120,epoch(),candidate.id,epoch(),epoch()).first<Row>();if(!job)continue;
  try{await handler({...job,payload:JSON.parse(job.payload)});await q(db,"UPDATE background_jobs SET status=?,available_at=?,lease_until=0,last_completed=?,attempts=0,last_error='',updated_at=? WHERE id=? AND lease_token=? AND status='running'",job.repeat_seconds?'pending':'done',epoch()+job.repeat_seconds,epoch(),epoch(),job.id,token).run();completed++;}
  catch{await q(db,"UPDATE background_jobs SET status=?,available_at=?,lease_until=0,last_error='operation_failed',updated_at=? WHERE id=? AND lease_token=? AND status='running'",job.attempts>=job.max_attempts?'dead':'pending',epoch()+Math.min(3600,15*2**Math.min(job.attempts-1,8)),epoch(),job.id,token).run();failures++;}
 }
 return {completed,failures};
}

async function discover(db:D1Database,job:Row){
 const cursor=String(job.payload.ownerCursor||''),calendarCursor=String(job.payload.calendarCursor||'');
 let owners=await rows(db,'SELECT DISTINCT owner_id FROM properties WHERE owner_id>? ORDER BY owner_id LIMIT 100',cursor);if(!owners.length)owners=await rows(db,'SELECT DISTINCT owner_id FROM properties ORDER BY owner_id LIMIT 100');
 for(const owner of owners){await enqueueJob(db,'owner:'+owner.owner_id,'owner',owner.owner_id,{},30);await enqueueJob(db,'finance-history:'+owner.owner_id,'finance-history',owner.owner_id,{},60);}
 let sources=await rows(db,"SELECT id,owner_id FROM calendar_sources WHERE enabled=1 AND url<>'' AND id>? ORDER BY id LIMIT 100",calendarCursor);if(!sources.length)sources=await rows(db,"SELECT id,owner_id FROM calendar_sources WHERE enabled=1 AND url<>'' ORDER BY id LIMIT 100");
 for(const source of sources)await enqueueJob(db,'calendar:'+source.id,'calendar',source.owner_id,{sourceId:source.id},900);
 await q(db,'UPDATE background_jobs SET payload=? WHERE id=?',JSON.stringify({ownerCursor:owners.at(-1)?.owner_id||'',calendarCursor:sources.at(-1)?.id||''}),job.id).run();
}
async function migrateHistory(db:D1Database,ownerId:string){
 const bookings=await rows(db,"SELECT b.id FROM bookings b JOIN properties p ON p.id=b.property_id WHERE p.owner_id=? AND NOT EXISTS(SELECT 1 FROM finance_backfill_receipts WHERE entity_key='booking:'||b.id) ORDER BY b.created_at,b.id LIMIT 20",ownerId);
 const jobs=await rows(db,"SELECT id FROM cleaning_jobs j WHERE owner_id=? AND NOT EXISTS(SELECT 1 FROM finance_backfill_receipts WHERE entity_key='job:'||j.id) ORDER BY created_at,id LIMIT 20",ownerId),service=new RentalService(db,ownerId);
 for(const b of bookings)await migrateFinanceEntity(service,'booking',b.id);for(const j of jobs)await migrateFinanceEntity(service,'job',j.id);
 return {bookings:bookings.length,jobs:jobs.length};
}
async function cloudBackup(db:D1Database,config:OperationConfig){
 if(!config.BUCKET||!config.ACCESS_ENCRYPTION_KEY)return {configured:false};
 const tables=await rows(db,"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name"),data:Row={schemaVersion:22,createdAt:epoch(),tables:{}};
 for(const table of tables){if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table.name))throw new Error('Unknown table');const values=table.name==='journey_sessions'?[]:await rows(db,'SELECT * FROM "'+table.name+'" LIMIT 5001');if(values.length>5000)throw new Error('Backup requires chunked export at this database size');data.tables[table.name]=values;}
 const encoded=JSON.stringify(data);if(encoded.length>4*1024*1024)throw new Error('Backup too large for the pilot snapshot');
 const sealed=await encryptInstructions(encoded,config),key='private-backups/'+new Date().toISOString().slice(0,10)+'.snapshot.enc';await config.BUCKET.put(key,sealed,{httpMetadata:{contentType:'application/octet-stream'}});return {key};
}
export async function runOperationalTick(db:D1Database,config:OperationConfig={}){
 await enqueueJob(db,'matching-dispatch','matching-dispatch','system',{},30);
 await q(db,'UPDATE journey_sessions SET longitude=NULL,latitude=NULL,accuracy=NULL,route=NULL,route_recorded_at=NULL WHERE (expires_at<=? OR stopped_at IS NOT NULL) AND (longitude IS NOT NULL OR route IS NOT NULL)',epoch()).run();
 await enqueueJob(db,'discovery','discovery','system',{},30);await enqueueJob(db,'admin-autocheck','admin-autocheck','system',{},300);await enqueueJob(db,'delivery','delivery','system',{},30);if(config.BUCKET&&config.ACCESS_ENCRYPTION_KEY)await enqueueJob(db,'cloud-backup','backup','system',{},86400);
 if(config.BUCKET){await enqueueJob(db,'media-move','media-move','system',{},60);await enqueueJob(db,'media-sweep','media-sweep','system',{},3600);}
 const result=await runBackgroundJobs(db,async job=>{
  if(job.kind==='discovery')return discover(db,job);
  if(job.kind==='admin-autocheck')return sweepReviews(db,config as OperationConfig&{PLATFORM_ADMIN_IDS?:string});
  if(job.kind==='matching-dispatch')return advanceMatchingRequests(db,config);
  if(job.kind==='owner')return checkAdministratorOwner(db,job.scope);
  if(job.kind==='delivery')return {external:await deliverOutbox(db,config,12,id=>new RentalService(db,id)),push:await deliverWebPush(db,config,12)};
  if(job.kind==='calendar')return refreshCalendar(db,job.payload.sourceId,config);
  if(job.kind==='finance-history')return migrateHistory(db,job.scope);
  if(job.kind==='backup')return cloudBackup(db,config);
  if(job.kind==='media-move')return moveMediaToBucket(db,config.BUCKET);
  if(job.kind==='media-sweep'){const r=await sweepMediaObjects(db,config.BUCKET,String(job.payload.cursor||''));await q(db,'UPDATE background_jobs SET payload=? WHERE id=?',JSON.stringify({cursor:r.cursor}),job.id).run();return r;}
  throw new Error('Unknown background operation');
 });
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
