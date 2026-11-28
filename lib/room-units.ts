import {DomainError,number,required} from './domain';
import type {RentalService} from './service';
import {accountDeletionColumns} from './account-deletion-inventory';
import {q,one,rows,epoch,uuid,type Row} from './operation-core';

// «Номера одного типа» (2026-11-22). A hotel does not fill in each of its twelve standard rooms: it fills one card
// and says «таких номеров 12». Underneath, each room is an object of its own (a copy of the lead card), so every
// booking, calendar, readiness and cleaning rule of the service keeps working for one room at a time. The copies
// follow the lead: syncRoomUnits() writes the lead's card, rules and photos over them before every quote and on the
// background sweep. The guest sees one card with «свободно N», the owner one card with the count.

import {roomKinds,unitKinds} from './listings';
const roomKind=(type:unknown)=>roomKinds.includes(String(type));
/** The kinds sold one of many alike: rooms under one roof, and fields, courts, tables, cabins and bays (2026-11-28). */
export const ROOM_KINDS=unitKinds;
export const MAX_ROOMS=200;
/** The calendar source that holds the rooms the owner closed by hand («Свободно сегодня»), one per room: its key is this and the room id. */
export const ROOMS_CLOSED='aiqonaq:rooms-closed';

const cols=(table:string)=>accountDeletionColumns[table].split(',');
const KEEP=new Set(['id','property_id','created_at','archived_at']);
// The lead's row written over a room's: every column but the keys. One statement per table, the room ids in json.
function syncSql(table:string){
 const all=cols(table),key=table==='properties'?'id':'property_id',set=all.filter(c=>!KEEP.has(c));
 if(table==='properties')return `UPDATE properties SET ${set.map(c=>`${c}=(SELECT l.${c} FROM properties l WHERE l.id=?1)`).join(',')} WHERE id IN (SELECT property_id FROM room_units WHERE lead_id=?1) AND archived_at IS NULL`;
 return `INSERT INTO ${table}(${all.join(',')}) SELECT ${all.map(c=>c===key?'u.property_id':'l.'+c).join(',')} FROM ${table} l JOIN room_units u ON u.lead_id=l.${key} JOIN properties p ON p.id=u.property_id AND p.archived_at IS NULL WHERE l.${key}=?1 ON CONFLICT(${key}) DO UPDATE SET ${set.map(c=>`${c}=excluded.${c}`).join(',')}`;
}
const SYNCED=['properties','property_details','property_locations','property_policies'];

/** The lead of a room (the card the owner fills), or the object itself. */
export async function leadOf(db:D1Database,propertyId:string):Promise<string>{
 return String((await one(db,'SELECT lead_id FROM room_units WHERE property_id=?',propertyId))?.lead_id||propertyId);
}
/** The live rooms of a lead, the lead first. */
export async function roomsOf(db:D1Database,leadId:string):Promise<string[]>{
 return [leadId,...(await rows(db,'SELECT u.property_id FROM room_units u JOIN properties p ON p.id=u.property_id WHERE u.lead_id=? AND p.archived_at IS NULL ORDER BY u.created_at,u.property_id',leadId)).map(r=>String(r.property_id))];
}
/** unit id -> lead id, for every live room copy. */
export async function roomLeads(db:D1Database):Promise<Map<string,string>>{
 return new Map((await rows(db,'SELECT u.property_id,u.lead_id FROM room_units u JOIN properties p ON p.id=u.property_id WHERE p.archived_at IS NULL')).map(r=>[String(r.property_id),String(r.lead_id)]));
}
/** lead id -> number of rooms (the lead included), for the leads that have copies. */
export async function roomCounts(db:D1Database):Promise<Map<string,number>>{
 return new Map((await rows(db,'SELECT u.lead_id,COUNT(*)+1 n FROM room_units u JOIN properties p ON p.id=u.property_id WHERE p.archived_at IS NULL GROUP BY u.lead_id')).map(r=>[String(r.lead_id),Number(r.n)]));
}
/** Writes the lead's card, rules, place and photos over its rooms. */
export async function syncRoomUnits(db:D1Database,leadId:string){
 if(!await one(db,'SELECT 1 x FROM room_units WHERE lead_id=? LIMIT 1',leadId))return;
 await db.batch([...SYNCED.map(t=>q(db,syncSql(t),leadId)),
  // The person on shift follows the card: a new one is let into every room, a removed one loses them all (lib/staff.ts).
  q(db,'DELETE FROM property_staff WHERE property_id IN (SELECT property_id FROM room_units WHERE lead_id=?1) AND staff_id IS NOT (SELECT staff_id FROM property_staff WHERE property_id=?1)',leadId),
  q(db,'INSERT OR IGNORE INTO property_staff(property_id,staff_id,owner_id,created_at) SELECT u.property_id,l.staff_id,l.owner_id,l.created_at FROM property_staff l JOIN room_units u ON u.lead_id=l.property_id JOIN properties p ON p.id=u.property_id AND p.archived_at IS NULL WHERE l.property_id=?1',leadId)]);
}
/** Every lead in step with its rooms: the background sweep, for edits made anywhere. */
export async function syncAllRoomUnits(db:D1Database){
 const leads=await rows(db,'SELECT DISTINCT lead_id FROM room_units');
 for(const l of leads)await syncRoomUnits(db,String(l.lead_id));
 return leads.length;
}

// A room is free from start to until: no stay of the service, no cleaning and no outside or hand-made block on it.
const FREE=`NOT EXISTS(SELECT 1 FROM bookings b WHERE b.property_id=r.id AND (b.status='confirmed' OR (b.status='requested' AND b.expires_at>?3)) AND b.start<?2 AND b.occupied_until>?1)
 AND NOT EXISTS(SELECT 1 FROM cleaning_jobs j WHERE j.property_id=r.id AND j.status IN ('open','assigned','in_progress','submitted') AND j.start<?2 AND j.end>?1)
 AND NOT EXISTS(SELECT 1 FROM external_blocks x JOIN calendar_sources s ON s.id=x.source_id WHERE x.property_id=r.id AND s.enabled=1 AND x.start<?2 AND x.end>?1)`;
/** The rooms of a lead free over [start, until), the lead first. */
// A room the quote would refuse (closed for repair, or not ready for a stay starting now) is not handed to a guest.
const BOOKABLE=` AND NOT EXISTS(SELECT 1 FROM property_operations o WHERE o.property_id=r.id AND (o.readiness IN ('maintenance','blocked') OR (?1<=?3+60 AND o.readiness<>'ready')))`;
export async function freeRooms(db:D1Database,leadId:string,start:number,until:number,bookable=false):Promise<string[]>{
 const ids=await roomsOf(db,leadId);
 const free=new Set((await rows(db,`SELECT r.id FROM properties r WHERE r.id IN (SELECT value FROM json_each(?4)) AND ${FREE}${bookable?BOOKABLE:''}`,start,until,epoch(),JSON.stringify(ids))).map(r=>String(r.id)));
 return ids.filter(id=>free.has(id));
}
/** The room a booking of this card takes: the first free one, or the card itself when none is (the quote then says so). */
export async function pickRoom(db:D1Database,propertyId:string,start:number,until:number){
 const lead=await leadOf(db,propertyId);
 if(lead===propertyId&&!await one(db,'SELECT 1 x FROM room_units WHERE lead_id=? LIMIT 1',lead))return propertyId;
 await syncRoomUnits(db,lead);
 return (await freeRooms(db,lead,start,until,true))[0]||propertyId;
}

async function ownLead(s:RentalService,propertyId:string){
 const p=await one(s.db,"SELECT p.id,p.title,p.demo_owner,json_extract(d.details,'$.type') type FROM properties p LEFT JOIN property_details d ON d.property_id=p.id WHERE p.id=? AND p.owner_id=? AND p.archived_at IS NULL",propertyId,s.userId);
 if(!p)throw new DomainError('Объект недоступен.',404);
 if(await one(s.db,'SELECT 1 x FROM room_units WHERE property_id=?',propertyId))throw new DomainError('Это номер внутри карточки. Меняйте количество в самой карточке.',409);
 return p;
}
const copy=(table:string,change:Record<string,string>)=>{const c=cols(table);return `INSERT INTO ${table}(${c.join(',')}) SELECT ${c.map(x=>change[x]??x).join(',')} FROM ${table} WHERE ${table==='properties'?'id':'property_id'}=?`;};

/** «Таких номеров: N». More rooms are copied from the card; fewer are archived, the free ones from the end. */
export async function setRoomCount(s:RentalService,body:Row){
 await s.requireRole('owner');
 const p=await ownLead(s,required(body.propertyId,'Объект',100)),count=number(body.count,'Сколько таких номеров',1,MAX_ROOMS),at=epoch();
 if(!ROOM_KINDS.includes(String(p.type)))throw new DomainError('Одинаковые места бывают у гостиницы, хостела, апарт-отеля, базы отдыха, у полей, кортов, бильярда, игрового клуба, караоке и автосервисов.',409);
 const rooms=await roomsOf(s.db,p.id),now=rooms.length;
 if(count>now){
  const add:D1PreparedStatement[]=[];
  for(let i=now;i<count;i++){
   const id=uuid();
   add.push(
    // Created hidden, tied to the card, then shown like the card: the platform's check of the card covers the room only
    // once the room is tied to it (publication audit 2026-11-22: an approved hotel could not add a room).
    q(s.db,copy('properties',{id:'?',created_at:'?',archived_at:'NULL',published:'0'}),id,at,p.id),
    q(s.db,copy('property_details',{property_id:'?',updated_at:'?'}),id,at,p.id),
    q(s.db,copy('property_locations',{property_id:'?',updated_at:'?'}),id,at,p.id),
    q(s.db,copy('property_policies',{property_id:'?',updated_at:'?'}),id,at,p.id),
    q(s.db,"INSERT INTO property_operations(property_id,readiness,active_booking_id,version,note,updated_at) VALUES (?,'ready',NULL,1,'',?)",id,at),
    q(s.db,'INSERT INTO property_staff(property_id,staff_id,owner_id,created_at) SELECT ?,staff_id,owner_id,? FROM property_staff WHERE property_id=?',id,at,p.id),
    q(s.db,'INSERT INTO room_units(property_id,lead_id,created_at) VALUES (?,?,?)',id,p.id,at+i),
    q(s.db,'UPDATE properties SET published=(SELECT l.published FROM properties l WHERE l.id=?) WHERE id=? AND (SELECT l.published FROM properties l WHERE l.id=?)=1',p.id,id,p.id));
  }
  await s.db.batch(add);
 }else if(count<now){
  // Only rooms without a stay ahead go; the lead card always stays.
  const busy=new Set((await rows(s.db,"SELECT DISTINCT property_id FROM bookings WHERE property_id IN (SELECT value FROM json_each(?)) AND (status='confirmed' OR (status='requested' AND expires_at>?)) AND occupied_until>?",JSON.stringify(rooms),at,at)).map(r=>String(r.property_id)));
  const spare=rooms.slice(1).reverse().filter(id=>!busy.has(id)).slice(0,now-count);
  if(spare.length<now-count)throw new DomainError('У части номеров есть брони впереди. Сейчас можно оставить не меньше '+(now-spare.length)+'.',409);
  await s.db.batch(spare.map(id=>q(s.db,'UPDATE properties SET published=0,archived_at=? WHERE id=? AND archived_at IS NULL',at,id)));
 }
 await syncRoomUnits(s.db,p.id);
 return {rooms:await roomState(s.db,p.id),message:count===1?(roomKind(p.type)?'Теперь это один номер.':'Теперь это одно место.'):(roomKind(p.type)?'Таких номеров: ':'Таких мест: ')+count+'. Гости видят одну карточку и сколько из них свободно.'};
}

/** The rooms of a card today: how many there are, taken through the service, closed by hand, under repair and free.
 *  Each room is counted once, in the first of these that applies (audit «Запуск», point 3). */
export async function roomState(db:D1Database,leadId:string,at=epoch()){
 const ids=await roomsOf(db,leadId),day=Math.floor((at+18000)/86400)*86400-18000,end=day+86400,list=JSON.stringify(ids);
 const takenIds=new Set((await rows(db,"SELECT DISTINCT property_id FROM bookings WHERE property_id IN (SELECT value FROM json_each(?)) AND (status='confirmed' OR (status='requested' AND expires_at>?)) AND start<? AND occupied_until>?",list,at,end,Math.max(at,day))).map(r=>String(r.property_id)));
 const closedIds=new Set((await rows(db,"SELECT DISTINCT x.property_id FROM external_blocks x JOIN calendar_sources c ON c.id=x.source_id WHERE c.external_property_id=?||':'||x.property_id AND x.property_id IN (SELECT value FROM json_each(?)) AND x.start<? AND x.end>?",ROOMS_CLOSED,list,end,Math.max(at,day))).map(r=>String(r.property_id)).filter(id=>!takenIds.has(id)));
 const repairIds=(await rows(db,"SELECT property_id FROM property_operations WHERE property_id IN (SELECT value FROM json_each(?)) AND readiness IN ('maintenance','blocked')",list)).map(r=>String(r.property_id)).filter(id=>!takenIds.has(id)&&!closedIds.has(id));
 const taken=takenIds.size,closed=closedIds.size,repair=repairIds.length;
 return {total:ids.length,taken,closed,repair,free:Math.max(0,ids.length-taken-closed-repair)};
}

/** «Свободно сегодня: N». The owner says how many rooms are free in the hotel's own system; the rest of the rooms not
 *  taken through the service are closed to guests until the end of the day, Kazakhstan time. */
export async function setFreeToday(s:RentalService,body:Row){
 await s.requireRole('owner');
 const p=await ownLead(s,required(body.propertyId,'Объект',100)),at=epoch(),ids=await roomsOf(s.db,p.id);
 const free=number(body.free,'Свободно номеров',0,ids.length),day=Math.floor((at+18000)/86400)*86400-18000,end=day+86400;
 // What was closed by hand for today is opened again, then closed anew: the last answer is the one that counts.
 const sources=await rows(s.db,"SELECT id,property_id FROM calendar_sources WHERE external_property_id=?||':'||property_id AND property_id IN (SELECT value FROM json_each(?))",ROOMS_CLOSED,JSON.stringify(ids));
 await q(s.db,'DELETE FROM external_blocks WHERE source_id IN (SELECT value FROM json_each(?))',JSON.stringify(sources.map(x=>x.id))).run();
 // A room under repair is not for sale anyway: the closing is spread over the rooms that work.
 const repair=new Set((await rows(s.db,"SELECT property_id FROM property_operations WHERE property_id IN (SELECT value FROM json_each(?)) AND readiness IN ('maintenance','blocked')",JSON.stringify(ids))).map(r=>String(r.property_id)));
 const open=(await freeRooms(s.db,p.id,at,end)).filter(id=>!repair.has(id)).reverse(),close=open.slice(0,Math.max(0,open.length-free));
 const add:D1PreparedStatement[]=[];
 for(const id of close){
  let source=sources.find(x=>x.property_id===id)?.id;
  if(!source){source=uuid();add.push(q(s.db,"INSERT INTO calendar_sources(id,property_id,owner_id,label,url,created_at,provider,external_property_id) VALUES (?,?,?,'Закрыто владельцем','',?,'manual',?)",source,id,s.userId,at,ROOMS_CLOSED+':'+id));}
  const mark=uuid();add.push(q(s.db,'INSERT INTO external_blocks(id,source_id,property_id,event_uid,start,end) VALUES (?,?,?,?,?,?)',mark,source,id,'rooms:'+mark,at,end));
 }
 if(add.length)await s.db.batch(add);
 const state=await roomState(s.db,p.id,at);
 return {rooms:state,message:'Сегодня свободно номеров: '+state.free+' из '+state.total+'. Остальные закрыты для гостей до полуночи.'};
}

/** The morning question. A hotel keeps its rooms in its own system, so once a day after 9:00 Kazakhstan time the owner
 *  of each room card is asked how many rooms are free today. The notice goes to the app and to Telegram like any other;
 *  the answer is one stepper on the card («Свободно сегодня»). Without an answer guests see every room not taken here. */
export const ASK_AT=9*3600;
export async function askFreeRooms(db:D1Database,at=epoch()){
 const day=Math.floor((at+18000)/86400)*86400-18000;
 if(at-day<ASK_AT)return {asked:0};
 const leads=await rows(db,'SELECT DISTINCT p.id,p.title,p.owner_id FROM room_units u JOIN properties p ON p.id=u.lead_id WHERE p.archived_at IS NULL');
 let asked=0;
 for(const p of leads as Row[]){
  const s=await roomState(db,String(p.id),at);
  const body='Сколько номеров «'+p.title+'» свободно сегодня? Всего '+s.total+', через сервис занято '+s.taken+'. Ответьте на карточке объекта: «Свободно сегодня». Пока ответа нет, гости видят все номера, не занятые через сервис.';
  const done=await q(db,'INSERT OR IGNORE INTO notifications(id,user_id,body,dedupe,read,created_at) VALUES (?,?,?,?,0,?)',uuid(),p.owner_id,body,'owner:rooms-free:'+p.id+':'+day,at).run();
  if(done.meta?.changes)asked++;
 }
 return {asked};
}
