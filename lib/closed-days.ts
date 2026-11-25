import {DomainError,number,required} from './domain';
import type {RentalService} from './service';
import {q,one,rows,epoch,uuid,type Row} from './operation-core';

// «Закрыть день» in the owner's calendar (concept of 2026-11-25). A closed day is kept like «Занято» (lib/staff.ts):
// a block of the object's own calendar source, so every search, quote and booking already respects it. The day is
// the Kazakhstan calendar day; it starts when the guest of the night before has left (with the cleaning), so a
// guest who leaves that morning does not stand in the way. A day with a stay or a live request is not closed.
export const CLOSED_SOURCE='aiqonaq:closed';
// One source a place: a calendar source is unique per owner, provider and key (drizzle/0015), so the key names the place.
export const closedKey=(propertyId:string)=>CLOSED_SOURCE+':'+propertyId;
const DAY=86400,ZONE=18000,AHEAD=400;
const LIVE="(status='confirmed' OR (status='requested' AND expires_at>?))";
const today=(at:number)=>Math.floor((at+ZONE)/DAY)*DAY-ZONE;

async function ownPlace(s:RentalService,body:Row){
 await s.requireRole('owner');
 const id=required(body.propertyId,'Жильё',100),day=number(body.day,'День',0,4102444800),at=epoch();
 if((day+ZONE)%DAY!==0)throw new DomainError('Выберите день в календаре.');
 if(day<today(at)||day>today(at)+AHEAD*DAY)throw new DomainError('Закрыть можно сегодняшний или будущий день.');
 const p=await one(s.db,'SELECT id,owner_id FROM properties WHERE id=? AND owner_id=? AND archived_at IS NULL',id,s.userId);
 if(!p)throw new DomainError('Жильё недоступно.',403);
 // A hotel with rooms of one type is closed room by room (lib/room-units.ts), not as a whole.
 if(await one(s.db,'SELECT 1 x FROM room_units WHERE lead_id=? LIMIT 1',id))throw new DomainError('У гостиницы закрывайте номера, а не весь объект.',409);
 return {id,day,at};
}

export async function closeDay(s:RentalService,body:Row){
 const {id,day,at}=await ownPlace(s,body),end=day+DAY;
 // The guest of the night before leaves this morning: the day is closed from then on.
 const before=await one(s.db,`SELECT MAX(occupied_until) until FROM bookings WHERE property_id=? AND ${LIVE} AND start<? AND occupied_until>?`,id,at,day,day);
 const start=Math.max(day,Number(before?.until)||0);
 if(start>=end)throw new DomainError('В этот день живёт гость. Закрыть его нельзя.',409);
 if(await one(s.db,`SELECT 1 x FROM bookings WHERE property_id=? AND ${LIVE} AND start<? AND occupied_until>? LIMIT 1`,id,at,end,start))throw new DomainError('На этот день уже есть бронь или заявка. Закрыть его нельзя.',409);
 await q(s.db,"INSERT INTO calendar_sources(id,property_id,owner_id,label,url,created_at,provider,external_property_id) SELECT ?,?,?,'Закрыто','',?,'manual',? WHERE NOT EXISTS(SELECT 1 FROM calendar_sources WHERE property_id=? AND external_property_id=?)",uuid(),id,s.userId,at,closedKey(id),id,closedKey(id)).run();
 // The check above only words the refusal; the write itself is guarded against a stay booked in between.
 const done=await q(s.db,`INSERT OR IGNORE INTO external_blocks(id,source_id,property_id,event_uid,start,end) SELECT ?,c.id,?,?,?,? FROM calendar_sources c WHERE c.property_id=? AND c.external_property_id=? AND NOT EXISTS(SELECT 1 FROM bookings WHERE property_id=? AND ${LIVE} AND start<? AND occupied_until>?) LIMIT 1`,uuid(),id,'closed:'+day,start,end,id,closedKey(id),id,at,end,start).run();
 if(!done.meta.changes&&!await one(s.db,'SELECT 1 x FROM external_blocks x JOIN calendar_sources c ON c.id=x.source_id WHERE x.property_id=? AND c.external_property_id=? AND x.event_uid=?',id,closedKey(id),'closed:'+day))throw new DomainError('На этот день только что появилась бронь. Закрыть его нельзя.',409);
 return {message:'День закрыт: гости из приложения его не забронируют.',closedDays:await ownerClosedDays(s.db,s.userId,at)};
}

export async function openDay(s:RentalService,body:Row){
 const {id,day,at}=await ownPlace(s,body);
 await q(s.db,'DELETE FROM external_blocks WHERE property_id=? AND event_uid=? AND source_id IN (SELECT id FROM calendar_sources WHERE property_id=? AND external_property_id=?)',id,'closed:'+day,id,closedKey(id)).run();
 return {message:'День снова открыт для гостей.',closedDays:await ownerClosedDays(s.db,s.userId,at)};
}

/** The owner's closed days from today on: the object and the day (its midnight in Kazakhstan time, as in the calendar). */
export async function ownerClosedDays(db:D1Database,ownerId:string,at=epoch()){
 const list=await rows(db,'SELECT x.property_id,x.event_uid FROM external_blocks x JOIN calendar_sources c ON c.id=x.source_id JOIN properties p ON p.id=x.property_id WHERE p.owner_id=? AND c.external_property_id=?||x.property_id AND c.enabled=1 AND x.end>? ORDER BY x.start',ownerId,CLOSED_SOURCE+':',at);
 const seen=new Set<string>();
 return list.map((r:Row)=>({property_id:String(r.property_id),day:Number(String(r.event_uid).slice(7))})).filter(r=>Number.isFinite(r.day)&&!seen.has(r.property_id+':'+r.day)&&!!seen.add(r.property_id+':'+r.day));
}
