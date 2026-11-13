import {epoch,uuid,q,one,type OperationConfig} from './operation-core';

// The platform administrator's morning summary (09:00 Kazakhstan time, UTC+5): what the AI administrator
// decided by itself over the last day, what waits for the administrator, and how the service did.
export const DIGEST_HOUR=9,TZ=5*3600;
const money=(n:number)=>Math.round(n||0).toLocaleString('ru-RU').replace(/ /g,' ')+' ₸';
export function digestDay(at:number){const local=new Date((at+TZ)*1000);return {date:local.toISOString().slice(0,10),due:local.getUTCHours()>=DIGEST_HOUR};}
export async function digestFacts(db:D1Database,at=epoch()){
 const since=at-86400,n=async(sql:string,...a:unknown[])=>Number((await one(db,sql,...a))?.n||0);
 return {
  aiFlats:await n("SELECT COUNT(*) n FROM participant_reviews WHERE reviewer_id='ai-administrator' AND role='owner' AND status='approved' AND reviewed_at>?",since),
  aiCleaners:await n("SELECT COUNT(*) n FROM participant_reviews WHERE reviewer_id='ai-administrator' AND role='cleaner' AND status='approved' AND reviewed_at>?",since),
  waitingReviews:await n("SELECT COUNT(*) n FROM participant_reviews WHERE status='pending' AND (ai_verdict<>'fix' OR (SELECT ai_review FROM pilot_policy WHERE id='global')=0)"),
  waitingParticipant:await n("SELECT COUNT(*) n FROM participant_reviews WHERE status='pending' AND ai_verdict='fix'"),
  newIssues:await n('SELECT COUNT(*) n FROM administrator_issues WHERE created_at>?',since),
  resolvedIssues:await n("SELECT COUNT(*) n FROM administrator_issues WHERE status='resolved' AND resolved_at>?",since),
  lateIssues:await n("SELECT COUNT(*) n FROM operator_tickets t JOIN administrator_issues i ON i.id=t.issue_id WHERE t.status<>'resolved' AND i.status<>'resolved' AND t.deadline<=?",at),
  hidden:await n("SELECT COUNT(*) n FROM moderation_access_events WHERE actor_id='ai-administrator' AND action='hide' AND created_at>?",since),
  openReports:await n("SELECT COUNT(*) n FROM content_reports WHERE status<>'resolved'"),
  bookings:await n('SELECT COUNT(*) n FROM bookings WHERE created_at>?',since),
  confirmed:await n("SELECT COUNT(*) n FROM bookings WHERE created_at>? AND status IN ('confirmed','completed')",since),
  income:await n("SELECT COALESCE(SUM(amount),0) n FROM platform_commissions WHERE created_at>?",since),
  failures:await n("SELECT COUNT(*) n FROM background_jobs WHERE status='dead'")
 };
}
export function digestText(f:Awaited<ReturnType<typeof digestFacts>>){
 const lines=['Сводка ИИ-администратора за сутки'];
 lines.push('Сделал сам: одобрил объектов '+f.aiFlats+', исполнителей '+f.aiCleaners+(f.hidden?', скрыл нарушений в чатах '+f.hidden:'')+'.');
 const yours=[f.waitingReviews?'заявок на проверку '+f.waitingReviews:'',f.lateIssues?'просроченных обращений '+f.lateIssues:'',f.openReports?'жалоб '+f.openReports:''].filter(Boolean);
 lines.push(yours.length?'Ждут вас: '+yours.join(', ')+'.':'Ждут вас: ничего.');
 if(f.waitingParticipant)lines.push('Ждут, пока участник допишет: '+f.waitingParticipant+'.');
 lines.push('Обращения: новых '+f.newIssues+', решено '+f.resolvedIssues+'.');
 lines.push('Брони: новых '+f.bookings+', подтверждено '+f.confirmed+'. Комиссия сервиса: '+money(f.income)+'.');
 if(f.failures)lines.push('Сбои фоновых задач: '+f.failures+'. Админка → Состояние сервиса.');
 return lines.join('\n');
}
export async function sendDigest(db:D1Database,config:OperationConfig&{PLATFORM_ADMIN_IDS?:string}={},at=epoch()){
 const day=digestDay(at),admins=typeof config.PLATFORM_ADMIN_IDS==='string'?config.PLATFORM_ADMIN_IDS.split(',').map(v=>v.trim()).filter(Boolean):[];
 if(!day.due||!admins.length)return {sent:0};
 const text=digestText(await digestFacts(db,at));
 const r=await db.batch(admins.map(admin=>q(db,'INSERT OR IGNORE INTO notifications(id,user_id,body,dedupe,read,created_at) VALUES (?,?,?,?,0,?)',uuid(),admin,text,'admin:digest:'+day.date+':'+admin,at)));
 return {sent:r.reduce((s,x)=>s+x.meta.changes,0)};
}
