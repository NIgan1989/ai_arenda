import {pushConfigured} from './web-push';
import {epoch,one,rows,type OperationConfig} from './operation-core';
type RuntimeConfig=OperationConfig&{ADMINISTRATOR_RUNNER_SECRET?:string;ACCESS_ENCRYPTION_KEY?:string;PLATFORM_ADMIN_IDS?:string;OPENAI_API_KEY?:string;OPENAI_MODEL?:string};
const age=(at:unknown,now:number)=>typeof at==='number'&&at>0&&at<=now+60?Math.max(0,now-at):null;
// Intended only for the server-secret protected monitoring route. No PII, IDs, paths,
// raw errors, source URLs, credentials or notification text are returned.
export async function buildRuntimeHealth(db:D1Database,config:RuntimeConfig={}){
 const now=epoch(),configuration={pushConfigured:pushConfigured(config),runnerSecretConfigured:!!config.ADMINISTRATOR_RUNNER_SECRET&&config.ADMINISTRATOR_RUNNER_SECRET.length>=32,encryptionConfigured:!!config.ACCESS_ENCRYPTION_KEY&&config.ACCESS_ENCRYPTION_KEY.length>=32,adminConfigured:!!config.PLATFORM_ADMIN_IDS?.split(',').some(v=>v.trim()),objectStorageConfigured:!!config.BUCKET,modelConfigured:!!(config.OPENAI_API_KEY&&config.OPENAI_MODEL),publicHttpsConfigured:false};
 try{configuration.publicHttpsConfigured=new URL(config.SITE_PUBLIC_URL||'').protocol==='https:';}catch{}
 try{
  const [scheduler,queue,backups,calendars,delivery]=await Promise.all([
   one(db,"SELECT last_success,last_error FROM administrator_runs WHERE id='scheduler'"),
   one(db,"SELECT SUM(CASE WHEN status='dead' THEN 1 ELSE 0 END) dead,SUM(CASE WHEN status='running' AND lease_until<=? THEN 1 ELSE 0 END) expired_leases,SUM(CASE WHEN status='pending' AND available_at<=? THEN 1 ELSE 0 END) due,SUM(CASE WHEN status='pending' AND available_at<? THEN 1 ELSE 0 END) overdue FROM background_jobs",now,now,now-300),
   rows(db,"SELECT last_completed,status FROM background_jobs WHERE id IN ('local-backup','cloud-backup')"),
   one(db,"SELECT COUNT(*) enabled,SUM(CASE WHEN last_success IS NULL OR last_success<? OR last_error<>'' THEN 1 ELSE 0 END) stale,SUM(CASE WHEN last_error<>'' THEN 1 ELSE 0 END) failed FROM calendar_sources WHERE enabled=1 AND url<>''",now-3600),
   one(db,"SELECT (SELECT COUNT(*) FROM delivery_outbox WHERE status='dead')+(SELECT COUNT(*) FROM push_deliveries WHERE status='dead') dead,(SELECT COUNT(*) FROM delivery_outbox WHERE status='pending' AND available_at<=?)+(SELECT COUNT(*) FROM push_deliveries WHERE status='pending' AND available_at<=?) due,(SELECT COUNT(*) FROM delivery_outbox WHERE status='sending' AND lease_until<=?)+(SELECT COUNT(*) FROM push_deliveries WHERE status='sending' AND lease_until<=?) expired_leases",now,now,now,now),
  ]);
  const schedulerAge=age(scheduler?.last_success,now),backupTimes=backups.filter(b=>b.status!=='dead').map(b=>b.last_completed).filter(v=>age(v,now)!==null),backupAge=backupTimes.length?age(Math.max(...backupTimes),now):null;
  const checks={database:{ready:true},scheduler:{fresh:schedulerAge!==null&&schedulerAge<=180,ageSeconds:schedulerAge,hasError:!!scheduler?.last_error},queue:{dead:Number(queue?.dead||0),due:Number(queue?.due||0),overdue:Number(queue?.overdue||0),expiredLeases:Number(queue?.expired_leases||0)},backup:{fresh:backupAge!==null&&backupAge<=48*3600,ageSeconds:backupAge},calendars:{enabled:Number(calendars?.enabled||0),stale:Number(calendars?.stale||0),failed:Number(calendars?.failed||0)},delivery:{dead:Number(delivery?.dead||0),due:Number(delivery?.due||0),expiredLeases:Number(delivery?.expired_leases||0)},configuration};
  const ok=checks.scheduler.fresh&&!checks.scheduler.hasError&&checks.backup.fresh&&!checks.queue.dead&&!checks.queue.overdue&&!checks.queue.expiredLeases&&!checks.calendars.stale&&!checks.delivery.dead&&!checks.delivery.expiredLeases;
  return {ok,status:ok?'healthy':'needs_attention',serverTime:now,checks};
 }catch{return {ok:false,status:'database_not_ready',serverTime:now,checks:{database:{ready:false},configuration}};}
}
