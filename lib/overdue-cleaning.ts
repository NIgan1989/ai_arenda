import {epoch,uuid,q,rows,type OperationConfig} from './operation-core';
import {OVERDUE_ESCALATE,OVERDUE_SILENT} from './overdue-text';
type Row=Record<string,any>;

const notice=(db:D1Database,user:string,body:string,dedupe:string,at:number)=>q(db,'INSERT OR IGNORE INTO notifications(id,user_id,body,dedupe,read,created_at) VALUES (?,?,?,?,0,?)',uuid(),user,body,dedupe,at);
const admins=(config:{PLATFORM_ADMIN_IDS?:string})=>typeof config.PLATFORM_ADMIN_IDS==='string'?config.PLATFORM_ADMIN_IDS.split(',').map(v=>v.trim()).filter(Boolean):[];

// The cleaning goes back to the search for a new cleaner: a fresh window of the same length from now, the reserve
// returns (trigger), the previous cleaner's response is closed so the job leaves their list.
export function releaseStatements(db:D1Database,job:Row,at:number){
 const length=Math.max(3600,Number(job.end)-Number(job.start));
 return [
  q(db,"UPDATE cleaning_jobs SET status='open',assigned_to=NULL,started_at=NULL,start=?,end=?,overdue_step=0 WHERE id=? AND version=? AND status IN ('assigned','in_progress')",at,at+length,job.id,job.version),
  q(db,"UPDATE applications SET status='rejected' WHERE job_id=? AND user_id=? AND EXISTS(SELECT 1 FROM cleaning_jobs WHERE id=? AND status='open' AND assigned_to IS NULL)",job.id,job.assigned_to,job.id),
  q(db,"UPDATE property_operations SET readiness='awaiting_cleaning',version=version+1,updated_at=? WHERE property_id=? AND readiness='cleaning' AND active_booking_id IS NULL AND EXISTS(SELECT 1 FROM cleaning_jobs WHERE id=? AND status='open') AND NOT EXISTS(SELECT 1 FROM cleaning_jobs WHERE property_id=? AND status IN ('in_progress','submitted'))",at,job.property_id,job.id,job.property_id)
 ];
}

export async function sweepOverdueJobs(db:D1Database,config:OperationConfig&{PLATFORM_ADMIN_IDS?:string}={}){
 const at=epoch(),result={reminded:0,warned:0,released:0,escalated:0},list=admins(config);
 const late=await rows(db,"SELECT j.*,p.title,(j.booking_id IS NULL OR EXISTS(SELECT 1 FROM bookings b WHERE b.id=j.booking_id AND b.status='completed')) vacant FROM cleaning_jobs j JOIN properties p ON p.id=j.property_id WHERE j.status IN ('assigned','in_progress') AND j.assigned_to IS NOT NULL AND j.end<=? AND j.overdue_step<3 AND NOT (j.overdue_step=2 AND j.status='assigned') ORDER BY j.end LIMIT 50",at);
 for(const j of late){
  const title=j.title||'жильё',step=Number(j.overdue_step)||0,started=j.status==='in_progress',mark=(to:number)=>q(db,'UPDATE cleaning_jobs SET overdue_step=? WHERE id=? AND overdue_step=? AND end=?',to,j.id,step,j.end);
  if(step<1){
   await db.batch([mark(1),
    notice(db,j.assigned_to,'ИИ-администратор: срок уборки «'+title+'» истёк. '+(started?'Отправьте отчёт или продлите срок в карточке задания.':'Начните уборку, продлите срок или откажитесь от задания в карточке.'),'cleaner:overdue-remind:'+j.id+':'+j.end,at),
    notice(db,j.owner_id,'ИИ-администратор: уборка «'+title+'» просрочена. Я напомнил исполнителю. В карточке уборки можно продлить срок или найти замену.','owner:overdue-remind:'+j.id+':'+j.end,at)]);
   result.reminded++;continue;
  }
  if(step<2&&at-j.end>=OVERDUE_SILENT){
   // The cleaner never started although the flat is free: the AI does not wait for the owner and looks for someone else.
   if(!started&&j.vacant){
    const r=await db.batch([...releaseStatements(db,j,at),
     q(db,"INSERT OR IGNORE INTO notifications SELECT ?,?,?,?,0,? WHERE EXISTS(SELECT 1 FROM cleaning_jobs WHERE id=? AND status='open')",uuid(),j.assigned_to,'ИИ-администратор снял вас с уборки «'+title+'»: работа не начата в срок.','cleaner:overdue-released:'+j.id+':'+j.end,at,j.id),
     q(db,"INSERT OR IGNORE INTO notifications SELECT ?,?,?,?,0,? WHERE EXISTS(SELECT 1 FROM cleaning_jobs WHERE id=? AND status='open')",uuid(),j.owner_id,'ИИ-администратор: исполнитель не начал уборку «'+title+'» и не ответил. Я вернул уборку в поиск, выберите нового исполнителя из откликов.','owner:overdue-released:'+j.id+':'+j.end,at,j.id),
     q(db,"INSERT INTO audit_events SELECT ?,'ai-administrator',?,'job.overdue_released',? WHERE EXISTS(SELECT 1 FROM cleaning_jobs WHERE id=? AND status='open')",uuid(),j.id,at,j.id)]);
    if(r[0].meta.changes)result.released++;continue;
   }
   await db.batch([mark(2),notice(db,j.owner_id,'ИИ-администратор: исполнитель не ответил 30 минут по уборке «'+title+'». '+(started?'Продлите срок, закройте уборку, если она сделана, или найдите другого исполнителя.':'Подтвердите выезд гостя или продлите срок.'),'owner:overdue-silent:'+j.id+':'+j.end,at)]);
   result.warned++;continue;
  }
  if(step===2&&started&&at-j.end>=OVERDUE_ESCALATE){
   await db.batch([mark(3),
    notice(db,j.owner_id,'ИИ-администратор передал задержку уборки «'+title+'» администратору сервиса. Вы по-прежнему можете продлить срок, закрыть уборку или найти замену.','owner:overdue-escalated:'+j.id+':'+j.end,at),
    notice(db,j.assigned_to,'ИИ-администратор: уборка «'+title+'» просрочена больше чем на 2 часа, ситуацию смотрит администратор сервиса. Отправьте отчёт или напишите владельцу в чате.','cleaner:overdue-escalated:'+j.id+':'+j.end,at),
    ...list.map(admin=>notice(db,admin,'Уборка «'+title+'» просрочена больше чем на 2 часа, отчёта нет. Свяжитесь с владельцем и исполнителем.','admin:overdue-job:'+j.id+':'+j.end+':'+admin,at))]);
   result.escalated++;
  }
 }
 return result;
}
