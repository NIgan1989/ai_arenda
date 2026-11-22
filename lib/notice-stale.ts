import {epoch,one} from './operation-core';

// Audit 2026-11-22 «Доставка срочных уведомлений»: a notice that asks for a decision («Новая заявка… Подтвердите её
// в течение 15 мин.») is checked against the live record right before it leaves for Telegram, SMS, WhatsApp or a
// browser push. When the request was cancelled, expired or already answered, the queued copy is dropped: the person
// gets only the later notice (the cancellation). The notice stays in the service's own feed as it was.
const ACTION_SQL:Record<string,string>={
 booking:"SELECT 1 x FROM bookings WHERE id=?1 AND status='requested' AND expires_at>?2",
 'booking-held':"SELECT 1 x FROM bookings WHERE id=?1 AND status='requested' AND expires_at>?2",
 change:"SELECT 1 x FROM booking_changes WHERE id=?1 AND status='pending' AND expires_at>?2",
 'checkout-reported':"SELECT 1 x FROM booking_terms t JOIN bookings b ON b.id=t.booking_id WHERE t.booking_id=?1 AND b.status='confirmed' AND t.checkout_reported_at IS NOT NULL AND t.actual_checkout IS NULL AND ?2>0",
 submitted:"SELECT 1 x FROM cleaning_jobs WHERE id=?1 AND status='submitted' AND ?2>0",
 // An application can be taken while the job is open and its window has not ended (lib/approvals.ts).
 application:"SELECT 1 x FROM applications a JOIN cleaning_jobs j ON j.id=a.job_id WHERE a.job_id=?1 AND a.user_id=?3 AND a.status='pending' AND j.status='open' AND j.end>?2",
 price:"SELECT 1 x FROM price_suggestions WHERE id=?1 AND status='pending' AND expires_at>?2",
 window:"SELECT 1 x FROM calendar_windows WHERE id=?1 AND status='suggested' AND ?2>0",
 forecast:"SELECT 1 x FROM load_forecasts WHERE id=?1 AND status='suggested' AND ?2>0",
 stay:"SELECT 1 x FROM stay_offers WHERE id=?1 AND status='suggested' AND ?2>0",
};
// The same booking key also carries «ИИ-администратор принял бронь…», a report of a confirmation already made:
// only a notice that asks the owner to decide can go stale.
const ASKS=/Подтвердите|[Рр]ешите/;
const ASKING_KINDS=new Set(['booking','booking-held']);
/** True when the notice asks for an action that can no longer be taken. Any other notice is never stale. */
export async function staleAction(db:D1Database,dedupe:unknown,t=epoch(),body?:unknown):Promise<boolean>{
 const [,kind,first,second]=String(dedupe||'').split(':'),sql=ACTION_SQL[kind||''];
 if(!sql||!first)return false;
 if(ASKING_KINDS.has(kind)&&!ASKS.test(String(body??'')))return false;
 // Exactly the parameters the statement names: D1 refuses extra ones.
 const args=[first,t,second||''].slice(0,sql.includes('?3')?3:2);
 return !await one(db,sql,...args);
}
// One rule of urgency for every channel: what may break through the quiet hours (when the person allows it).
export const urgentNotice=(dedupe:unknown,body:unknown)=>/Требует внимания\.|no-show|overdue/.test(String(body||'')+' '+String(dedupe||''));
