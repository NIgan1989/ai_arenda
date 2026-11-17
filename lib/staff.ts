import {DomainError,required,number} from './domain';
import {RentalService} from './service';
import {normalizePhone} from './native-auth';
import {isBath} from './listings';
import {venuesFor} from './venue';
import {q,one,rows,epoch,uuid,type Row} from './operation-core';
/* eslint-disable @typescript-eslint/no-explicit-any */

// «Сотрудник» и «Занято» (2026-11-17). A bath or a hall is run by the person on shift, not by its owner. The owner
// names that person by phone in the settings of the object; there is no separate role. The person on shift sees
// today's stays of the object and marks them in order (затоплено, гости пришли, гости ушли, готово), and marks
// the object busy when guests come from the street or by phone. Every mark is the owner's own action done in
// the owner's name: the same rules, the same messages to the guest. Money and settings stay with the owner.

/** «Занято» is kept as a calendar source of the object, so every search, quote and booking already respects it. */
export const BUSY_SOURCE='aiqonaq:busy';
export const MAX_BUSY_HOURS=12;
export const MARKS=['heated','arrived','left','ready'] as const;
export type Mark=typeof MARKS[number];
const clock=(at:number)=>new Intl.DateTimeFormat('ru-RU',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Almaty'}).format(new Date(at*1000));
const kindOf=(details:unknown)=>{try{return String(JSON.parse(String(details||'{}')).type||'');}catch{return '';}};

/** The object and who asks: its owner, or the person the owner named. Anyone else gets nothing. */
async function place(s:RentalService,propertyId:string){
 const p=await one(s.db,`SELECT p.id,p.title,p.owner_id,p.cleaning_minutes,(SELECT staff_id FROM property_staff WHERE property_id=p.id) staff_id,
  (SELECT details FROM property_details WHERE property_id=p.id) details FROM properties p WHERE p.id=? AND p.archived_at IS NULL`,propertyId);
 if(!p||(p.owner_id!==s.userId&&p.staff_id!==s.userId))throw new DomainError('Объект недоступен.',404);
 return {...p,mine:p.owner_id===s.userId,type:kindOf(p.details)} as Row;
}
const tell=(db:D1Database,userId:string,body:string,dedupe:string,at:number)=>q(db,'INSERT OR IGNORE INTO notifications(id,user_id,body,dedupe,read,created_at) VALUES (?,?,?,?,0,?)',uuid(),userId,body,dedupe,at);

// ---------- The owner names the person ----------

/** The object and the other halls of its venue that are not archived. */
const hallIds=async(db:D1Database,propertyId:string)=>[propertyId,...(await rows(db,'SELECT h.property_id id FROM venue_halls h JOIN properties p ON p.id=h.property_id WHERE p.archived_at IS NULL AND h.property_id<>? AND h.venue_id=(SELECT venue_id FROM venue_halls WHERE property_id=?)',propertyId,propertyId)).map(r=>String(r.id))];

export async function staffState(s:RentalService,propertyId:string){
 await s.requireRole('owner');
 if(!await one(s.db,'SELECT id FROM properties WHERE id=? AND owner_id=?',propertyId,s.userId))throw new DomainError('Объект недоступен.',404);
 const staff=await one(s.db,'SELECT a.name,a.phone,x.created_at since FROM property_staff x JOIN auth_accounts a ON a.id=x.staff_id WHERE x.property_id=?',propertyId);
 return {staff:staff||null,busy:await busyBlocks(s.db,propertyId)};
}
export async function assignStaff(s:RentalService,body:Row){
 await s.requireRole('owner');
 const propertyId=required(body.propertyId,'Объект',100),phone=normalizePhone(body.phone);
 const p=await one(s.db,'SELECT id,title FROM properties WHERE id=? AND owner_id=? AND archived_at IS NULL',propertyId,s.userId);
 if(!p)throw new DomainError('Объект недоступен.',404);
 const person=await one(s.db,'SELECT id,name FROM auth_accounts WHERE phone=?',phone);
 if(!person)throw new DomainError('С этим номером в приложении никто не зарегистрирован. Попросите сотрудника установить приложение и создать аккаунт, затем назначьте его снова.',404);
 if(person.id===s.userId)throw new DomainError('Это ваш номер. Отметки по объекту у вас уже есть.',409);
 const at=epoch();
 // A venue is run by one shift: the person is named for all its halls at once (lib/venue.ts).
 const halls=await hallIds(s.db,propertyId);
 await s.db.batch([
  ...halls.map(id=>q(s.db,'INSERT INTO property_staff(property_id,staff_id,owner_id,created_at) VALUES (?,?,?,?) ON CONFLICT(property_id) DO UPDATE SET staff_id=excluded.staff_id,owner_id=excluded.owner_id,created_at=excluded.created_at',id,person.id,s.userId,at)),
  tell(s.db,person.id,'Вас назначили сотрудником объекта «'+p.title+'»'+(halls.length>1?' и других залов заведения':'')+'. Откройте «Смена» в меню: там сегодняшние гости и отметки.','staff:assigned:'+propertyId+':'+at,at)]);
 if(halls.length>1)return {...await staffState(s,propertyId),message:person.name+' теперь отмечает гостей во всех залах заведения: '+halls.length+'.'};
 return {...await staffState(s,propertyId),message:person.name+' теперь отмечает гостей объекта «'+p.title+'».'};
}
export async function removeStaff(s:RentalService,body:Row){
 await s.requireRole('owner');
 const propertyId=required(body.propertyId,'Объект',100),at=epoch();
 const row=await one(s.db,'SELECT x.staff_id,p.title FROM property_staff x JOIN properties p ON p.id=x.property_id WHERE x.property_id=? AND p.owner_id=?',propertyId,s.userId);
 if(!row)return {...await staffState(s,propertyId),message:'Сотрудник не назначен.'};
 const halls=await hallIds(s.db,propertyId);
 await s.db.batch([...halls.map(id=>q(s.db,'DELETE FROM property_staff WHERE property_id=? AND owner_id=?',id,s.userId)),
  tell(s.db,row.staff_id,'Владелец снял вас с объекта «'+row.title+'».','staff:removed:'+propertyId+':'+at,at)]);
 return {...await staffState(s,propertyId),message:'Сотрудник снят. Отметки снова только у вас.'};
}

// ---------- «Занято» ----------

/** What is busy by hand now or later, soonest first. */
export const busyBlocks=(db:D1Database,propertyId:string,at=epoch())=>rows(db,'SELECT x.id,x.start,x.end FROM external_blocks x JOIN calendar_sources c ON c.id=x.source_id WHERE x.property_id=? AND c.external_property_id=? AND c.enabled=1 AND x.end>? ORDER BY x.start',propertyId,BUSY_SOURCE,at);

export async function markBusy(s:RentalService,body:Row){
 const p=await place(s,required(body.propertyId,'Объект',100)),at=epoch();
 const hours=number(body.hours,'Сколько часов',1,MAX_BUSY_HOURS),start=Math.floor(at/60)*60,end=start+hours*3600;
 // A stay booked in the service is not written over: the person on shift is told which one stands in the way.
 const taken=await one(s.db,"SELECT start,end FROM bookings WHERE property_id=? AND (status='confirmed' OR (status='requested' AND expires_at>?)) AND start<? AND occupied_until>? ORDER BY start LIMIT 1",p.id,at,end,start);
 if(taken)throw new DomainError('На это время уже есть бронь через сервис: '+clock(taken.start)+'–'+clock(taken.end)+'. Отметьте меньше часов.',409);
 let source=await one(s.db,'SELECT id FROM calendar_sources WHERE property_id=? AND external_property_id=?',p.id,BUSY_SOURCE);
 if(!source){source={id:uuid()};await q(s.db,"INSERT INTO calendar_sources(id,property_id,owner_id,label,url,created_at,provider,external_property_id) VALUES (?,?,?,'Занято','',?,'manual',?)",source.id,p.id,p.owner_id,at,BUSY_SOURCE).run();}
 // The check above only words the refusal. The write itself is guarded: a stay booked between the check and the
 // write is not written over, and the last mark is replaced only when the new one is in.
 const mark=uuid(),free="NOT EXISTS(SELECT 1 FROM bookings WHERE property_id=? AND (status='confirmed' OR (status='requested' AND expires_at>?)) AND start<? AND occupied_until>?)";
 const done=await s.db.batch([
  q(s.db,'INSERT INTO external_blocks(id,source_id,property_id,event_uid,start,end) SELECT ?,?,?,?,?,? WHERE '+free,mark,source.id,p.id,'busy:'+mark,start,end,p.id,at,end,start),
  // One «Занято» at a time: a new mark replaces what is left of the last one, and what has ended is cleared.
  q(s.db,'DELETE FROM external_blocks WHERE source_id=? AND id<>? AND (end<=? OR start<=?) AND EXISTS(SELECT 1 FROM external_blocks WHERE id=?)',source.id,mark,at,at,mark),
  ...(p.mine?[]:[q(s.db,'INSERT OR IGNORE INTO notifications(id,user_id,body,dedupe,read,created_at) SELECT ?,?,?,?,0,? WHERE EXISTS(SELECT 1 FROM external_blocks WHERE id=?)',uuid(),p.owner_id,'«'+p.title+'» занято до '+clock(end)+': отметил сотрудник. Гостям из приложения это время не предлагается.','staff:busy:'+p.id+':'+start,at,mark)])]);
 if(!done[0]?.meta?.changes)throw new DomainError('На это время только что появилась бронь через сервис. Отметьте меньше часов.',409);
 return {busy:await busyBlocks(s.db,p.id,at),message:'Занято до '+clock(end)+'. Гостям из приложения это время не предлагается.'};
}
export async function freeBusy(s:RentalService,body:Row){
 const p=await place(s,required(body.propertyId,'Объект',100)),at=epoch();
 await q(s.db,'DELETE FROM external_blocks WHERE property_id=? AND source_id IN (SELECT id FROM calendar_sources WHERE property_id=? AND external_property_id=?)',p.id,p.id,BUSY_SOURCE).run();
 return {busy:await busyBlocks(s.db,p.id,at),message:'Свободно: гости снова могут бронировать.'};
}

// ---------- «Смена»: today of the objects the person is named for ----------

/** Where a stay stands for the person on shift, and the one mark that comes next (null: nothing to mark). */
export function stayStep(b:{start:number;end:number;prepared_at?:number|null;actual_checkin?:number|null;actual_checkout?:number|null},readiness:string,bath:boolean,at:number):{stage:'wait'|'here'|'left'|'done';next:Mark|null}{
 if(b.actual_checkout)return readiness==='ready'?{stage:'done',next:null}:{stage:'left',next:'ready'};
 if(b.actual_checkin)return {stage:'here',next:'left'};
 // A bath is heated first; other objects have nothing to prepare, the guests simply come.
 return {stage:'wait',next:bath&&!b.prepared_at&&at<b.end?'heated':'arrived'};
}
export const MARK_TITLE:Record<Mark,string>={heated:'Затоплено',arrived:'Гости пришли',left:'Гости ушли',ready:'Готово'};

export async function staffPlaces(db:D1Database,userId:string){return Number((await one(db,'SELECT COUNT(*) n FROM property_staff x JOIN properties p ON p.id=x.property_id WHERE x.staff_id=? AND p.archived_at IS NULL',userId))?.n||0);}

export async function staffToday(s:RentalService){
 const at=epoch(),from=at-12*3600,to=at+36*3600;
 const places=await rows(s.db,`SELECT p.id,p.title,p.city,p.district,p.address,(SELECT details FROM property_details WHERE property_id=p.id) details,
  COALESCE((SELECT readiness FROM property_operations WHERE property_id=p.id),'ready') readiness,(SELECT name FROM profiles WHERE id=p.owner_id) owner_name
  FROM property_staff x JOIN properties p ON p.id=x.property_id WHERE x.staff_id=? AND p.archived_at IS NULL ORDER BY p.title`,s.userId);
 const out:Row[]=[],venues=places.length?await venuesFor(s.db):new Map();
 for(const p of places){
  const bath=isBath(kindOf(p.details));
  const stays=await rows(s.db,`SELECT b.id,b.start,b.end,b.guests,b.status,t.prepared_at,t.actual_checkin,t.actual_checkout,(SELECT name FROM profiles WHERE id=b.guest_id) guest_name
   FROM bookings b LEFT JOIN booking_terms t ON t.booking_id=b.id WHERE b.property_id=? AND b.status IN ('confirmed','completed') AND ((b.end>? AND b.start<?)
    -- A stay that still needs a mark stays on the list however late it is: guests inside, or the last checkout while the object is not ready.
    OR (b.status='confirmed' AND t.actual_checkin IS NOT NULL AND t.actual_checkout IS NULL)
    OR (?<>'ready' AND b.id=(SELECT x.booking_id FROM booking_terms x JOIN bookings y ON y.id=x.booking_id WHERE y.property_id=b.property_id AND x.actual_checkout IS NOT NULL ORDER BY x.actual_checkout DESC LIMIT 1))) ORDER BY b.start`,p.id,from,to,p.readiness);
  // A finished stay stays on the list only while the object still waits for «Готово», and only the last one.
  const steps=stays.map(b=>({id:b.id,start:b.start,end:b.end,guests:b.guests,guestName:String(b.guest_name||'Гость').split(' ')[0],...stayStep(b as any,p.readiness,bath,at)})).filter(b=>b.stage!=='done');
  const last=steps.filter(b=>b.stage==='left').pop();
  out.push({id:p.id,title:p.title,venue:venues.get(p.id)?.title||'',place:[p.city,p.district,p.address].filter(Boolean).join(', '),bath,readiness:p.readiness,ownerName:p.owner_name||'',busy:await busyBlocks(s.db,p.id,at),
   stays:steps.filter(b=>b.stage!=='left'||b===last)});
 }
 return {serverTime:at,places:out};
}

/** One mark of the person on shift (or of the owner): done as the owner, under the owner's rules. */
export async function staffMark(s:RentalService,body:Row){
 const mark=String(body.mark||'') as Mark;if(!MARKS.includes(mark))throw new DomainError('Отметка недоступна.');
 const bookingId=required(body.bookingId,'Бронь',100),b=await one(s.db,'SELECT b.id,b.property_id,b.guest_id,b.start,b.end,b.status FROM bookings b WHERE b.id=?',bookingId);
 if(!b)throw new DomainError('Бронь не найдена.',404);
 const p=await place(s,b.property_id),at=epoch(),owner=p.mine?s:new RentalService(s.db,p.owner_id);
 let message='';
 if(mark==='heated'){
  if(b.status!=='confirmed'||b.end<=at)throw new DomainError('Эта бронь уже не ждёт гостей.',409);
  const done=await q(s.db,'UPDATE booking_terms SET prepared_at=? WHERE booking_id=? AND prepared_at IS NULL',at,bookingId).run();
  if(done.meta?.changes)await tell(s.db,b.guest_id,'«'+p.title+'»: '+(isBath(p.type)?'баня затоплена':'всё готово')+', ждём вас к '+clock(b.start)+'.','staff:heated:'+bookingId,at).run();
  message=isBath(p.type)?'Отмечено: затоплено. Гостю сообщили.':'Отмечено: готово к приходу гостей. Гостю сообщили.';
 }else if(mark==='arrived'){await owner.bookingAction(bookingId,{action:'checkin'});message='Отмечено: гости пришли.';}
 else if(mark==='left'){await owner.bookingAction(bookingId,{action:'checkout'});message='Отмечено: гости ушли. Наведите порядок и нажмите «Готово».';}
 else{await owner.readinessAction(p.id,{readiness:'ready',inspected:true,note:p.mine?'':'Сотрудник отметил: убрано и готово к следующим гостям.'});message='Отмечено: готово к следующим гостям.';}
 if(!p.mine)await tell(s.db,p.owner_id,'«'+p.title+'»: сотрудник отметил «'+MARK_TITLE[mark]+'» в '+clock(at)+'.','staff:mark:'+bookingId+':'+mark,at).run();
 return {...await staffToday(s),message};
}
