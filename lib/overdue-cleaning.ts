import {epoch,uuid,q,rows,type OperationConfig} from './operation-core';
import {OVERDUE_ESCALATE} from './overdue-text';
import {ruleFor,minutesLabel,DECISION_RULES} from './decision-rules';
// The shortest wait an owner can choose: the sweep picks the job up then and checks the owner's own time.
const SILENT_MIN=Math.min(...DECISION_RULES.find(r=>r.key==='overdue_job')!.options)*60;
type Row=Record<string,any>;

const notice=(db:D1Database,user:string,body:string,dedupe:string,at:number)=>q(db,'INSERT OR IGNORE INTO notifications(id,user_id,body,dedupe,read,created_at) VALUES (?,?,?,?,0,?)',uuid(),user,body,dedupe,at);
const admins=(config:{PLATFORM_ADMIN_IDS?:string})=>typeof config.PLATFORM_ADMIN_IDS==='string'?config.PLATFORM_ADMIN_IDS.split(',').map(v=>v.trim()).filter(Boolean):[];

// The cleaning goes back to the search for a new cleaner: a fresh window of the same length from now, cut at the
// next confirmed arrival so the job never advertises time inside a stay; null when there is no room left before it
// or a later guest is already inside.
export async function releaseWindow(db:D1Database,job:Row,at:number){
 // Another guest already lives there: a cleaning now would run into the stay.
 if(await q(db,"SELECT 1 FROM bookings WHERE property_id=? AND status='confirmed' AND start<=? AND id<>COALESCE(?,'')",job.property_id,at,job.booking_id).first())return null;
 const length=Math.max(3600,Number(job.end)-Number(job.start));
 const next=await q(db,"SELECT MIN(start) start FROM bookings WHERE property_id=? AND status='confirmed' AND start>=? AND id<>COALESCE(?,'')",job.property_id,at,job.booking_id).first<Row>();
 const end=next?.start?Math.min(at+length,Number(next.start)):at+length;
 return end-at>=1800?{start:at,end}:null;
}
// The reserve returns (trigger), the previous cleaner's response is closed so the job leaves their list.
export function releaseStatements(db:D1Database,job:Row,window:{start:number;end:number},at:number){
 return [
  q(db,"UPDATE cleaning_jobs SET status='open',assigned_to=NULL,started_at=NULL,start=?,end=?,overdue_step=0 WHERE id=? AND version=? AND status IN ('assigned','in_progress')",window.start,window.end,job.id,job.version),
  q(db,"UPDATE applications SET status='rejected' WHERE job_id=? AND user_id=? AND EXISTS(SELECT 1 FROM cleaning_jobs WHERE id=? AND status='open' AND assigned_to IS NULL)",job.id,job.assigned_to,job.id),
  q(db,"UPDATE property_operations SET readiness='awaiting_cleaning',version=version+1,updated_at=? WHERE property_id=? AND readiness='cleaning' AND active_booking_id IS NULL AND EXISTS(SELECT 1 FROM cleaning_jobs WHERE id=? AND status='open') AND NOT EXISTS(SELECT 1 FROM cleaning_jobs WHERE property_id=? AND status IN ('in_progress','submitted'))",at,job.property_id,job.id,job.property_id)
 ];
}

// Nobody took a cleaning before its end. Step 1: with the owner's autopilot on and the flat free, the AI gives the search
// one new window of the same length and tells the owner. Step 2: still nobody (or no window) — the owner decides, told once,
// with the reason when there is simply no other cleaner in the city.
async function sweepUnclaimed(db:D1Database,at:number,result:Row){
 const list=await rows(db,"SELECT j.*,p.title,p.city,COALESCE(r.auto_offers,0) auto_offers,(SELECT COUNT(*) FROM profiles c WHERE c.city=p.city AND c.id<>j.owner_id AND EXISTS(SELECT 1 FROM json_each(c.roles) WHERE value='cleaner')) cleaners FROM cleaning_jobs j JOIN properties p ON p.id=j.property_id LEFT JOIN operation_rules r ON r.property_id=j.property_id WHERE j.status='open' AND j.assigned_to IS NULL AND j.overdue_step<2 AND j.end<=? ORDER BY j.end LIMIT 50",at);
 for(const j of list){
  const title=j.title||'жильё',step=Number(j.overdue_step)||0,vacant=!j.booking_id||await q(db,"SELECT 1 FROM bookings WHERE id=? AND status='completed'",j.booking_id).first();
  const window=step<1&&Number(j.auto_offers)&&vacant?await releaseWindow(db,j,at):null;
  const why=Number(j.cleaners)?'':' В городе '+(j.city||'')+' пока нет других исполнителей.';
  if(window){
   const until=new Intl.DateTimeFormat('ru-RU',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Almaty'}).format(new Date(window.end*1000));
   const r=await db.batch([
    q(db,"UPDATE cleaning_jobs SET start=?,end=?,overdue_step=1 WHERE id=? AND version=? AND status='open' AND assigned_to IS NULL AND overdue_step=0",window.start,window.end,j.id,j.version),
    // Answers to the old time do not count for the new one: cleaners answer again.
    q(db,"UPDATE applications SET status='rejected' WHERE job_id=? AND status='pending' AND EXISTS(SELECT 1 FROM cleaning_jobs WHERE id=? AND overdue_step=1 AND end=?)",j.id,j.id,window.end),
    q(db,"INSERT OR IGNORE INTO notifications SELECT ?,?,?,?,0,? WHERE EXISTS(SELECT 1 FROM cleaning_jobs WHERE id=? AND overdue_step=1 AND end=?)",uuid(),j.owner_id,'ИИ-администратор: никто не взял уборку «'+title+'» вовремя. Я продлил поиск до '+until+'.'+why,'owner:unclaimed-reposted:'+j.id+':'+j.end,at,j.id,window.end),
    q(db,"INSERT INTO audit_events SELECT ?,'ai-administrator',?,'job.unclaimed_reposted',? WHERE EXISTS(SELECT 1 FROM cleaning_jobs WHERE id=? AND overdue_step=1 AND end=?)",uuid(),j.id,at,j.id,window.end)]);
   if(r[0].meta.changes)result.reposted++;continue;
  }
  const r=await db.batch([
   q(db,'UPDATE cleaning_jobs SET overdue_step=2 WHERE id=? AND overdue_step=? AND end=?',j.id,step,j.end),
   q(db,"INSERT OR IGNORE INTO notifications SELECT ?,?,?,?,0,? WHERE changes()>0",uuid(),j.owner_id,'ИИ-администратор: срок уборки «'+title+'» прошёл, исполнителя нет.'+why+' Откройте уборку: искать на новое время, закрыть, если убрали сами, или отменить.','owner:unclaimed:'+j.id+':'+j.end,at)]);
  if(r[0].meta.changes)result.unclaimed++;
 }
}

// A cleaner who has not started when the flat is already free is noticed at the start, not at the end of the window:
// 15 minutes after the start the cleaner is asked «Вы в пути?» and the owner is told; 45 minutes after it, with no
// start and no «Опаздываю», the AI gives the cleaning to someone else (the owner can switch that off in
// «Автопилот: решения и сроки»). «Опаздываю» moves the start by half an hour, so the clock starts over by itself.
export const LATE_ASK=900,LATE_RELEASE=2700;
const clockOf=(at:number)=>new Intl.DateTimeFormat('ru-RU',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Almaty'}).format(new Date(at*1000));
async function sweepLateStart(db:D1Database,at:number,result:Row){
 // The clock runs from the latest of: the planned start, the guest's confirmed checkout, the last change of the job
 // (an assignment made after the start counts from the assignment, not from the start).
 const since="MAX(j.start,COALESCE((SELECT t.actual_checkout FROM booking_terms t WHERE t.booking_id=j.booking_id),0),COALESCE((SELECT MAX(a.created_at) FROM audit_events a WHERE a.entity_id=j.id),0))";
 const list=await rows(db,`SELECT j.*,p.title,${since} since FROM cleaning_jobs j JOIN properties p ON p.id=j.property_id WHERE j.status='assigned' AND j.assigned_to IS NOT NULL AND j.end>? AND j.start<=? AND ${since}<=? AND (j.booking_id IS NULL OR EXISTS(SELECT 1 FROM bookings b WHERE b.id=j.booking_id AND b.status='completed')) ORDER BY j.start LIMIT 50`,at,at-LATE_ASK,at-LATE_ASK);
 for(const j of list){
  const title=j.title||'жильё',start=Number(j.since),rule=await ruleFor(db,j.owner_id,'overdue_job');
  if(at>=start+LATE_RELEASE&&rule.on){
   const window=await releaseWindow(db,j,at);
   if(window){
    const r=await db.batch([...releaseStatements(db,j,window,at),
     q(db,"INSERT OR IGNORE INTO notifications SELECT ?,?,?,?,0,? WHERE EXISTS(SELECT 1 FROM cleaning_jobs WHERE id=? AND status='open')",uuid(),j.assigned_to,'ИИ-администратор снял вас с уборки «'+title+'»: вы не начали её и не ответили.','cleaner:late-released:'+j.id+':'+start,at,j.id),
     q(db,"INSERT OR IGNORE INTO notifications SELECT ?,?,?,?,0,? WHERE EXISTS(SELECT 1 FROM cleaning_jobs WHERE id=? AND status='open')",uuid(),j.owner_id,'ИИ-администратор: исполнитель не пришёл на уборку «'+title+'» и не ответил. Я вернул уборку в поиск до '+clockOf(window.end)+'.','owner:late-released:'+j.id+':'+start,at,j.id),
     q(db,"INSERT INTO audit_events SELECT ?,'ai-administrator',?,'job.late_start_released',? WHERE EXISTS(SELECT 1 FROM cleaning_jobs WHERE id=? AND status='open')",uuid(),j.id,at,j.id)]);
    if(r[0].meta.changes){result.released++;continue;}
   }
  }
  const asked=await db.batch([
   notice(db,j.assigned_to,'ИИ-администратор: уборка «'+title+'» должна была начаться в '+clockOf(start)+'. Вы в пути? На месте нажмите «Начать уборку», если задерживаетесь — «Опаздываю».','cleaner:late-start:'+j.id+':'+start,at),
   notice(db,j.owner_id,'ИИ-администратор: исполнитель ещё не начал уборку «'+title+'». Я спросил, где он.'+(rule.on?' Если не ответит до '+clockOf(start+LATE_RELEASE)+', найду замену.':' Решение о замене за вами: в карточке уборки.'),'owner:late-start:'+j.id+':'+start,at)]);
  if(asked[0].meta.changes)result.reminded++;
 }
}
export async function sweepOverdueJobs(db:D1Database,config:OperationConfig&{PLATFORM_ADMIN_IDS?:string}={}){
 const at=epoch(),result={reminded:0,warned:0,released:0,escalated:0,reposted:0,unclaimed:0},list=admins(config);
 await sweepUnclaimed(db,at,result);
 await sweepLateStart(db,at,result);
 const late=await rows(db,"SELECT j.*,p.title,(j.booking_id IS NULL OR EXISTS(SELECT 1 FROM bookings b WHERE b.id=j.booking_id AND b.status='completed')) vacant FROM cleaning_jobs j JOIN properties p ON p.id=j.property_id WHERE j.status IN ('assigned','in_progress') AND j.assigned_to IS NOT NULL AND (j.overdue_step=0 AND j.end<=? OR j.overdue_step=1 AND j.end<=? OR j.overdue_step=2 AND j.status='in_progress' AND j.end<=?) ORDER BY j.end LIMIT 50",at,at-SILENT_MIN,at-OVERDUE_ESCALATE);
 for(const j of late){
  const title=j.title||'жильё',step=Number(j.overdue_step)||0,started=j.status==='in_progress',mark=(to:number)=>q(db,'UPDATE cleaning_jobs SET overdue_step=? WHERE id=? AND overdue_step=? AND end=?',to,j.id,step,j.end);
  if(step<1){
   await db.batch([mark(1),
    notice(db,j.assigned_to,'ИИ-администратор: срок уборки «'+title+'» истёк. '+(started?'Отправьте отчёт или продлите срок в карточке задания.':'Начните уборку, продлите срок или откажитесь от задания в карточке.'),'cleaner:overdue-remind:'+j.id+':'+j.end,at),
    notice(db,j.owner_id,'ИИ-администратор: уборка «'+title+'» просрочена. Я напомнил исполнителю. В карточке уборки можно продлить срок или найти замену.','owner:overdue-remind:'+j.id+':'+j.end,at)]);
   result.reminded++;continue;
  }
  const rule=step<2?await ruleFor(db,j.owner_id,'overdue_job'):null;
  if(rule&&at-j.end>=rule.minutes*60){
   // The cleaner never started although the flat is free: the AI does not wait for the owner and looks for someone else,
   // unless the owner switched this off in «Автопилот: решения и сроки».
   const window=rule.on&&!started&&j.vacant?await releaseWindow(db,j,at):null;
   if(window){
    const r=await db.batch([...releaseStatements(db,j,window,at),
     q(db,"INSERT OR IGNORE INTO notifications SELECT ?,?,?,?,0,? WHERE EXISTS(SELECT 1 FROM cleaning_jobs WHERE id=? AND status='open')",uuid(),j.assigned_to,'ИИ-администратор снял вас с уборки «'+title+'»: работа не начата в срок.','cleaner:overdue-released:'+j.id+':'+j.end,at,j.id),
     q(db,"INSERT OR IGNORE INTO notifications SELECT ?,?,?,?,0,? WHERE EXISTS(SELECT 1 FROM cleaning_jobs WHERE id=? AND status='open')",uuid(),j.owner_id,'ИИ-администратор: исполнитель не начал уборку «'+title+'» и не ответил. Я вернул уборку в поиск, выберите нового исполнителя из откликов.','owner:overdue-released:'+j.id+':'+j.end,at,j.id),
     q(db,"INSERT INTO audit_events SELECT ?,'ai-administrator',?,'job.overdue_released',? WHERE EXISTS(SELECT 1 FROM cleaning_jobs WHERE id=? AND status='open')",uuid(),j.id,at,j.id)]);
    if(r[0].meta.changes)result.released++;continue;
   }
   await db.batch([mark(2),notice(db,j.owner_id,'ИИ-администратор: исполнитель не ответил '+minutesLabel(rule.minutes)+' по уборке «'+title+'». '+(started?'Продлите срок, закройте уборку, если она сделана, или найдите другого исполнителя.':'Подтвердите выезд гостя или продлите срок.'),'owner:overdue-silent:'+j.id+':'+j.end,at)]);
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
