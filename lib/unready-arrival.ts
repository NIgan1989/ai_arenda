// «Жильё не готово к заезду» (2026-11-28, Торайгырова 64): the guest arrives within UNREADY_AHEAD, the home is not marked
// ready and no cleaning will be done before the arrival (nobody took it, it went overdue, the owner cancelled it). The
// check-in is closed until the home is ready (lib/service.ts bookingAction 'checkin'), so the owner decides now, once per
// arrival time, with the ways out of the booking card: cleaned yourselves or by own staff («Жильё готово»), find a cleaner
// («Создать уборку»), or ask the guest to come later («Сдвинуть заезд»). The guest hears that the home is being prepared.
// Homes with own staff get their own reminder an hour before (lib/bath-prep.ts sweepReadyBefore).
import {epoch,uuid,q,rows} from './operation-core';
import {stayWords} from './stay-words';
type Row=Record<string,any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const UNREADY_AHEAD=3*3600;
const clock=(at:number)=>new Intl.DateTimeFormat('ru-RU',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Almaty'}).format(new Date(at*1000));
const notice=(db:D1Database,user:string,body:string,dedupe:string,at:number)=>q(db,'INSERT OR IGNORE INTO notifications(id,user_id,body,dedupe,read,created_at) VALUES (?,?,?,?,0,?)',uuid(),user,body,dedupe,at);

/** A cleaning that will make the home ready before `start`: someone took it, it ends in time and is not overdue. */
export const CLEANING_IN_TIME=(property:string,start:string,at:string)=>`EXISTS(SELECT 1 FROM cleaning_jobs cj WHERE cj.property_id=${property} AND cj.assigned_to IS NOT NULL AND (cj.status='submitted' OR cj.status IN ('assigned','in_progress') AND cj.end>${at} AND cj.end<=${start}))`;

export async function sweepUnreadyArrivals(db:D1Database,at=epoch()){
 const due=await rows(db,`SELECT b.id,b.start,b.guest_id,p.owner_id,p.title,(SELECT json_extract(details,'$.type') FROM property_details WHERE property_id=p.id) type
  FROM bookings b JOIN properties p ON p.id=b.property_id JOIN property_operations o ON o.property_id=p.id JOIN booking_terms t ON t.booking_id=b.id
  WHERE b.status='confirmed' AND p.own_staff=0 AND o.readiness IN ('awaiting_cleaning','inspection') AND b.start>?1 AND b.start<=?1+${UNREADY_AHEAD}
  AND t.actual_checkin IS NULL AND NOT ${CLEANING_IN_TIME('p.id','b.start','?1')}
  AND NOT EXISTS(SELECT 1 FROM bookings x WHERE x.property_id=b.property_id AND x.id<>b.id AND x.status='confirmed' AND x.start>?1 AND x.start<b.start)
  ORDER BY b.start LIMIT 50`,at) as Row[];
 let asked=0;
 for(const b of due){
  const w=stayWords(b.type),title=b.title||'жильё',time=clock(Number(b.start));
  const r=await notice(db,b.owner_id,'ИИ-администратор: «'+title+'» не готово, а гость заезжает в '+time+'. Уборка к этому времени не успевает. Решите в карточке брони: уберите сами или своим персоналом и нажмите «'+w.ready+'», создайте уборку или сдвиньте '+w.arriveLow+'. Пока жильё не готово, заселить гостя нельзя.','owner:unready-arrival:'+b.id+':'+b.start,at).run();
  if(!r.meta?.changes)continue;
  asked++;
  await notice(db,b.guest_id,'«'+title+'» ещё готовят к вашему заезду в '+time+'. Если время изменится, владелец предложит новое в карточке брони.','guest:unready-arrival:'+b.id+':'+b.start,at).run();
 }
 return {asked};
}
