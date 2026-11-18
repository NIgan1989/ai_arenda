// The time between two guests follows the cleaning, not only the calendar (2026-11-18):
// - cleaned early: «Жильё готово» frees the rest of the cleaning time for new bookings, and the owner can let the next
//   guest in early with one tap («Можно заселиться раньше»), at no extra cost;
// - running late: the owner asks the next guest to come later with one tap («Сдвинуть заезд»). It is a booking change
//   the guest accepts or declines (lib/service.ts proposeBookingChange): nothing moves without the guest's yes.
import {epoch,uuid,q} from './operation-core';
import {CHECKIN_LEAD_SECONDS} from './checkin-window';
import {DomainError} from './domain';

type Row=Record<string,any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const clock=(at:number)=>new Intl.DateTimeFormat('ru-RU',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Almaty'}).format(new Date(at*1000));
const minutes=(seconds:number)=>Math.max(0,Math.round(seconds/60));

// The owner may move an arrival by these many minutes: enough for a late cleaning, never a new booking in disguise.
export const SHIFT_CHOICES=[30,60,120];
// The longest owner delay that keeps the agreed price (lib/service.ts bookingChangeQuote).
export const SHIFT_LIMIT=Math.max(...SHIFT_CHOICES)*60;
// Early check-in is offered when the next guest is due at least this much later than now.
export const EARLY_GAIN=30*60;

/** «На уборку осталось 60 мин из 90: следующий гость в 20:30.» — said when a cleaning window is shorter than needed. */
export function shortWindowNote(window:{start:number;end:number},needed:number){
 const left=window.end-window.start;
 if(!(needed>0)||left>=needed)return '';
 return ' На уборку осталось '+minutes(left)+' мин из '+minutes(needed)+': следующий гость в '+clock(window.end)+'. Если не успеть, сдвиньте его заезд в карточке брони.';
}

/** The new times of a later arrival: an hourly stay keeps its length (same price); a daily one keeps its departure. */
export function shiftedStay(b:Row,billingMode:string,by:number):{start:number;end:number}{
 return billingMode==='hourly'?{start:b.start+by,end:b.end+by}:{start:b.start+by,end:b.end};
}

/** The next confirmed arrival at a property that has not checked in yet. */
export async function nextArrival(db:D1Database,propertyId:string,at=epoch()){
 return q(db,"SELECT b.*,t.early_checkin_at FROM bookings b JOIN booking_terms t ON t.booking_id=b.id WHERE b.property_id=? AND b.status='confirmed' AND b.start>? AND t.actual_checkin IS NULL ORDER BY b.start LIMIT 1",propertyId,at).first<Row>();
}

/**
 * The home is ready: the cleaning time left after the previous stay is no longer held for new bookings, and when the
 * next guest is still far away the owner is offered to let them in early.
 */
export async function afterReady(db:D1Database,propertyId:string,at=epoch()){
 await q(db,"UPDATE bookings SET occupied_until=MAX(end,?) WHERE property_id=? AND status='completed' AND occupied_until>? AND end<=?",at,propertyId,at,at).run();
 const next=await nextArrival(db,propertyId,at);
 if(!next||next.start-CHECKIN_LEAD_SECONDS-at<EARLY_GAIN||next.start-at>12*3600||next.early_checkin_at)return null;
 const p=await q(db,'SELECT owner_id,title FROM properties WHERE id=?',propertyId).first<Row>();if(!p)return null;
 await q(db,'INSERT OR IGNORE INTO notifications(id,user_id,body,dedupe,read,created_at) VALUES (?,?,?,?,0,?)',uuid(),p.owner_id,
  '«'+p.title+'» готово в '+clock(at)+', а следующий гость приедет в '+clock(next.start)+'. Можно пустить его раньше: нажмите «Можно заселиться раньше» в карточке брони, гость получит сообщение.',
  'owner:early-offer:'+next.id+':'+next.start,at).run();
 return next.id as string;
}

/** «Можно заселиться раньше»: the guest may check in from now, at no extra cost. */
export async function allowEarlyCheckin(db:D1Database,b:Row,terms:Row|null,op:Row|null,at=epoch()){
 if(b.status!=='confirmed'||!terms||terms.actual_checkin||terms.actual_checkout)throw new DomainError('Пустить раньше можно только гостя, который ещё не заселился.',409);
 if(b.start-CHECKIN_LEAD_SECONDS<=at)throw new DomainError('Заселение уже открыто.',409);
 if(op?.readiness!=='ready'||op?.active_booking_id)throw new DomainError('Сначала отметьте, что жильё убрано и готово.',409);
 if(b.payment_status!=='owner_verified'||terms.deposit_status==='pending')throw new DomainError('Гость ещё не оплатил бронь: раньше пустить можно после оплаты.',409);
 // The time from now to the agreed arrival must be free; once allowed it stays the guest's (trigger
 // booking_early_checkin_*_guard in drizzle/0068), so no new booking can be squeezed in before them.
 const taken=await q(db,"SELECT 1 AS x FROM bookings WHERE property_id=? AND id<>? AND (status='confirmed' OR (status='requested' AND expires_at>?)) AND start<? AND occupied_until>? UNION ALL SELECT 1 FROM cleaning_jobs WHERE property_id=? AND (booking_id IS NULL OR booking_id<>?) AND status IN ('open','assigned','in_progress','submitted') AND start<? AND end>? LIMIT 1",b.property_id,b.id,at,b.start,at,b.property_id,b.id,b.start,at).first<Row>();
 if(taken)throw new DomainError('До заезда этого гостя жильё ещё занято другой бронью или уборкой: раньше пустить нельзя.',409);
 const r=await db.batch([
  q(db,'UPDATE booking_terms SET early_checkin_at=?,version=version+1 WHERE booking_id=? AND early_checkin_at IS NULL AND actual_checkin IS NULL',at,b.id),
  q(db,'INSERT OR IGNORE INTO notifications(id,user_id,body,dedupe,read,created_at) VALUES (?,?,?,?,0,?)',uuid(),b.guest_id,'«'+b.title+'» уже готово: можно заселиться раньше, с '+clock(at)+' вместо '+clock(b.start)+'. Доплаты нет. Когда будете на месте, нажмите «Я заселился».','guest:early-checkin:'+b.id,at),
  q(db,"INSERT INTO audit_events(id,actor_id,entity_id,action,created_at) VALUES (?,?,?,'booking.early_checkin',?)",uuid(),b.owner_id,b.id,at)
 ]);
 if(!r[0].meta.changes)return {message:'Гость уже может заселиться раньше.'};
 return {message:'Готово: гость может заселиться уже сейчас, он получил сообщение.'};
}

/** The reason the guest reads with the owner's proposal of a later arrival. */
export function shiftReason(title:string,by:number,start:number){
 return 'Жильё «'+title+'» не успевают подготовить. Владелец просит заехать на '+(by>=3600?by/3600+' ч':minutes(by)+' мин')+' позже, в '+clock(start)+'. Если не подходит, отклоните: владелец решит, как быть, или отменит бронь с полным возвратом.';
}

/**
 * A later arrival was accepted: the cleaning before it may use the time won, up to the time the home needs. Only a
 * cleaning that has not been reported yet and ended right at the old arrival is extended, and never into another job of
 * the same cleaner (cleaner_overlap would undo the guest's acceptance).
 */
export function extendCleaningBefore(db:D1Database,b:Row,newStart:number,gate:string,gateArg:string){
 return q(db,`UPDATE cleaning_jobs SET end=MIN(start+MAX(end-start,(SELECT cleaning_minutes*60 FROM properties WHERE id=cleaning_jobs.property_id)),?) WHERE property_id=? AND (booking_id IS NULL OR booking_id<>?) AND status IN ('open','assigned','in_progress') AND end<=? AND end>?-6*3600 AND ?>end AND (assigned_to IS NULL OR NOT EXISTS(SELECT 1 FROM cleaning_jobs o WHERE o.id<>cleaning_jobs.id AND o.assigned_to=cleaning_jobs.assigned_to AND o.status IN ('assigned','in_progress','submitted') AND o.start<MIN(cleaning_jobs.start+MAX(cleaning_jobs.end-cleaning_jobs.start,(SELECT cleaning_minutes*60 FROM properties WHERE id=cleaning_jobs.property_id)),?) AND o.end>cleaning_jobs.end)) AND ${gate}`,newStart,b.property_id,b.id,b.start,b.start,newStart,newStart,gateArg);
}
