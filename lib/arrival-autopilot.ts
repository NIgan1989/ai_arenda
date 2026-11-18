// The autopilot keeps the time between two guests by itself (2026-11-18), with the same two actions the owner has in the
// booking card (lib/arrival-shift.ts):
// - the home is ready and the next guest arrives within EARLY_AUTO: the AI lets them in early («Можно заселиться раньше»).
//   Further away the gap could still be sold, so the owner is only offered it (afterReady);
// - the cleaning will not end before the next guest: the AI asks the guest to come later («Сдвинуть заезд»), once per
//   booking, at the same price. The guest accepts or declines; nothing moves without the guest's yes.
// Only for homes under the autopilot (lib/autopilot.ts underAutopilot); everyone else gets the buttons and the notes.
import {epoch,uuid,q,rows} from './operation-core';
import {underAutopilot} from './autopilot';
import {RentalService} from './service';
import {DomainError} from './domain';
import {CHECKIN_LEAD_SECONDS} from './checkin-window';
import {EARLY_AUTO,EARLY_GAIN,SHIFT_CHOICES} from './arrival-shift';
type Row=Record<string,any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const SHIFT_AHEAD=2*3600;
const clock=(at:number)=>new Intl.DateTimeFormat('ru-RU',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Almaty'}).format(new Date(at*1000));
const notice=(db:D1Database,user:string,body:string,dedupe:string,at:number)=>q(db,'INSERT OR IGNORE INTO notifications(id,user_id,body,dedupe,read,created_at) VALUES (?,?,?,?,0,?)',uuid(),user,body,dedupe,at);
const tried=(error:unknown)=>{if(!(error instanceof DomainError))throw error;};

/** The smallest allowed delay that covers `late` seconds; the longest one when nothing covers it. */
export function shiftFor(late:number){
 return SHIFT_CHOICES.find(m=>m*60>=late)??Math.max(...SHIFT_CHOICES);
}

/**
 * When the cleaning before a stay will end: a started one at its planned end (or now, if that has passed); one not
 * started yet a full cleaning time from its start (or from now).
 */
export function cleaningEnds(job:Row,cleaningMinutes:number,at:number){
 if(job.status==='in_progress')return Math.max(Number(job.end),at);
 return Math.max(Number(job.start),at)+Math.max(Number(job.end)-Number(job.start),cleaningMinutes*60);
}

async function letInEarly(db:D1Database,at:number,result:Row){
 const list=await rows(db,`SELECT b.id,b.owner_id,b.title,b.start FROM (SELECT b.*,p.owner_id,p.title,ROW_NUMBER() OVER (PARTITION BY b.property_id ORDER BY b.start) n FROM bookings b JOIN properties p ON p.id=b.property_id JOIN booking_terms t ON t.booking_id=b.id WHERE b.status='confirmed' AND b.start>? AND t.actual_checkin IS NULL) b
  JOIN booking_terms t ON t.booking_id=b.id JOIN property_operations o ON o.property_id=b.property_id
  WHERE b.n=1 AND t.early_checkin_at IS NULL AND b.start-?<=? AND b.start-?-?>=? AND o.readiness='ready' AND o.active_booking_id IS NULL AND b.payment_status='owner_verified' AND t.deposit_status<>'pending'
  AND ${underAutopilot('b.property_id')} ORDER BY b.start LIMIT 50`,at,at,EARLY_AUTO,CHECKIN_LEAD_SECONDS,at,EARLY_GAIN,at);
 for(const b of list){
  try{await new RentalService(db,b.owner_id).bookingAction(b.id,{action:'early_checkin'});}catch(error){tried(error);continue;}
  await notice(db,b.owner_id,'ИИ-администратор: «'+(b.title||'жильё')+'» уже готово, поэтому гость может заселиться раньше, не дожидаясь '+clock(b.start)+'. Доплаты нет, гость получил сообщение.','owner:auto-early:'+b.id,at).run();
  result.early++;
 }
}

async function askLater(db:D1Database,at:number,result:Row){
 // The next arrival in the coming two hours, the home not ready, a cleaning before it still to be done, and no shift
 // asked for this booking yet (by the owner or by the AI).
 const list=await rows(db,`SELECT b.id,p.owner_id,p.title,b.start,p.cleaning_minutes,j.status job_status,j.start job_start,j.end job_end FROM bookings b JOIN properties p ON p.id=b.property_id JOIN booking_terms t ON t.booking_id=b.id JOIN property_operations o ON o.property_id=b.property_id
  JOIN cleaning_jobs j ON j.property_id=b.property_id AND (j.booking_id IS NULL OR j.booking_id<>b.id) AND j.status IN ('open','assigned','in_progress') AND j.start<b.start AND j.end>b.start-6*3600
  WHERE b.status='confirmed' AND b.start>? AND b.start<=? AND t.actual_checkin IS NULL AND t.early_checkin_at IS NULL AND o.readiness<>'ready'
  AND NOT EXISTS(SELECT 1 FROM bookings x WHERE x.property_id=b.property_id AND x.id<>b.id AND x.status='confirmed' AND x.start>? AND x.start<b.start)
  AND NOT EXISTS(SELECT 1 FROM booking_changes c WHERE c.booking_id=b.id AND (c.status='pending' OR c.request_key LIKE 'shift:%'))
  AND ${underAutopilot('b.property_id')} ORDER BY b.start LIMIT 50`,at,at+SHIFT_AHEAD,at,at);
 const seen=new Set<string>();
 for(const b of list){
  if(seen.has(b.id))continue;seen.add(b.id);
  const ends=cleaningEnds({status:b.job_status,start:b.job_start,end:b.job_end},Number(b.cleaning_minutes)||0,at);
  if(ends<=b.start)continue;
  const minutes=shiftFor(ends-b.start),start=Number(b.start)+minutes*60;
  try{await new RentalService(db,b.owner_id).bookingAction(b.id,{action:'shift_arrival',minutes});}catch(error){tried(error);continue;}
  await notice(db,b.owner_id,'ИИ-администратор: уборка «'+(b.title||'жильё')+'» не успевает к гостю в '+clock(b.start)+'. Я попросил гостя заехать в '+clock(start)+', цена прежняя. Ответ гостя придёт в карточку брони; пока он не согласится, заезд остаётся прежним.','owner:auto-shift:'+b.id,at).run();
  result.shifted++;
 }
}

export async function sweepArrivals(db:D1Database,at=epoch()){
 const result={early:0,shifted:0};
 await askLater(db,at,result);
 await letInEarly(db,at,result);
 return result;
}
