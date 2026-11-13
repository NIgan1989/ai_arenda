import {epoch,rows,type Row} from './operation-core';
import {plural,reliabilityScore,type Reliability} from './reliability-text';
export {reliabilityScore,reliabilityShort,reliabilityLabels,type Reliability} from './reliability-text';

// Reliability rating: how each side keeps its word, from the service's own history.
// Guest: stays without a dispute against disputes at checkout and own cancellations after confirmation.
// Cleaner: finished cleanings against missed ones (a no-show weighs double) and returned reports.
// Owner: answered requests and finished stays against unanswered requests and own cancellations.
type Role='guest'|'owner'|'cleaner';
const byId=(list:Row[])=>new Map(list.map(r=>[r.id,r]));
const n=(v:unknown)=>Number(v||0);

export function guestReliability(s:{completed:number;disputes:number;cancels:number;phone:boolean}):Reliability{
 const facts=[s.completed?plural(s.completed,'проживание','проживания','проживаний'):'',s.disputes?'споров при выезде: '+s.disputes:'',s.cancels?'отмен после подтверждения: '+s.cancels:'',s.phone?'телефон подтверждён':''].filter(Boolean);
 return reliabilityScore(Math.max(0,s.completed-s.disputes),s.disputes*2+s.cancels,facts);
}
export function cleanerReliability(s:{completed:number;noShows:number;returned:number}):Reliability{
 const facts=[s.completed?plural(s.completed,'уборка','уборки','уборок'):'',s.noShows?'срывов: '+s.noShows:'',s.returned?'возвратов на доработку: '+s.returned:''].filter(Boolean);
 if(s.completed&&!s.noShows&&!s.returned)facts.push('без срывов');
 return reliabilityScore(s.completed,s.noShows*2+s.returned,facts);
}
export function ownerReliability(s:{answered:number;unanswered:number;completed:number;cancels:number;rating:number|null}):Reliability{
 const asked=s.answered+s.unanswered,facts=[asked?'отвечает на '+Math.round(s.answered/asked*100)+'% заявок':'',s.completed?plural(s.completed,'завершённая бронь','завершённые брони','завершённых броней'):'',s.cancels?'отмен владельцем: '+s.cancels:'',s.rating?'оценка гостей '+s.rating.toFixed(1).replace('.',','):''].filter(Boolean);
 return reliabilityScore(s.answered+s.completed,s.unanswered+s.cancels*2,facts);
}

export async function reliabilityFor(db:D1Database,role:Role,ids:string[],t=epoch()):Promise<Map<string,Reliability>>{
 // One JSON parameter for the whole list: D1 caps bound parameters at 100 per statement.
 const list=[...new Set(ids.filter(Boolean))].slice(0,500),out=new Map<string,Reliability>();
 if(!list.length)return out;
 const m='SELECT value FROM json_each(?)',ids_=JSON.stringify(list);
 if(role==='guest'){
  const [done,disputes,cancels,phones]=await Promise.all([
   rows(db,`SELECT guest_id id,COUNT(*) n FROM bookings WHERE status='completed' AND guest_id IN (${m}) GROUP BY guest_id`,ids_),
   rows(db,`SELECT b.guest_id id,COUNT(DISTINCT a.entity_id) n FROM audit_events a JOIN bookings b ON b.id=a.entity_id WHERE a.action LIKE '%booking.checkout_disputed%' AND b.guest_id IN (${m}) GROUP BY b.guest_id`,ids_),
   rows(db,`SELECT b.guest_id id,COUNT(DISTINCT a.entity_id) n FROM audit_events a JOIN bookings b ON b.id=a.entity_id WHERE a.action='booking.cancelled' AND a.actor_id=b.guest_id AND b.guest_id IN (${m}) AND EXISTS(SELECT 1 FROM audit_events c WHERE c.entity_id=a.entity_id AND c.action LIKE '%booking.confirmed%' AND c.created_at<=a.created_at) GROUP BY b.guest_id`,ids_),
   rows(db,`SELECT user_id id,1 n FROM phone_verifications WHERE verified_at IS NOT NULL AND user_id IN (${m})`,ids_)
  ]);
  const d=byId(done),x=byId(disputes),c=byId(cancels),p=byId(phones);
  for(const id of list)out.set(id,guestReliability({completed:n(d.get(id)?.n),disputes:n(x.get(id)?.n),cancels:n(c.get(id)?.n),phone:p.has(id)}));
 }else if(role==='cleaner'){
  const [done,missed,returned]=await Promise.all([
   rows(db,`SELECT assigned_to id,COUNT(*) n FROM cleaning_jobs WHERE status='completed' AND assigned_to IN (${m}) GROUP BY assigned_to`,ids_),
   rows(db,`SELECT user_id id,COUNT(*) n FROM notifications WHERE dedupe LIKE 'cleaner:no-show:%' AND user_id IN (${m}) GROUP BY user_id`,ids_),
   rows(db,`SELECT j.assigned_to id,COUNT(*) n FROM audit_events a JOIN cleaning_jobs j ON j.id=a.entity_id WHERE a.action LIKE '%job.revision_requested%' AND j.assigned_to IN (${m}) GROUP BY j.assigned_to`,ids_)
  ]);
  const d=byId(done),x=byId(missed),r=byId(returned);
  for(const id of list)out.set(id,cleanerReliability({completed:n(d.get(id)?.n),noShows:n(x.get(id)?.n),returned:n(r.get(id)?.n)}));
 }else{
  const [answered,unanswered,done,cancels,ratings]=await Promise.all([
   rows(db,`SELECT p.owner_id id,COUNT(DISTINCT b.id) n FROM bookings b JOIN properties p ON p.id=b.property_id WHERE p.owner_id IN (${m}) AND EXISTS(SELECT 1 FROM audit_events a WHERE a.entity_id=b.id AND (a.action LIKE '%booking.confirmed%' OR a.action='booking.rejected')) GROUP BY p.owner_id`,ids_),
   rows(db,`SELECT p.owner_id id,COUNT(*) n FROM bookings b JOIN properties p ON p.id=b.property_id WHERE p.owner_id IN (${m}) AND b.status IN ('requested','expired') AND b.expires_at<=? GROUP BY p.owner_id`,ids_,t),
   rows(db,`SELECT p.owner_id id,COUNT(*) n FROM bookings b JOIN properties p ON p.id=b.property_id WHERE p.owner_id IN (${m}) AND b.status='completed' GROUP BY p.owner_id`,ids_),
   rows(db,`SELECT p.owner_id id,COUNT(DISTINCT a.entity_id) n FROM audit_events a JOIN bookings b ON b.id=a.entity_id JOIN properties p ON p.id=b.property_id WHERE a.action='booking.cancelled' AND a.actor_id=p.owner_id AND p.owner_id IN (${m}) AND EXISTS(SELECT 1 FROM audit_events c WHERE c.entity_id=a.entity_id AND c.action LIKE '%booking.confirmed%' AND c.created_at<=a.created_at) GROUP BY p.owner_id`,ids_),
   rows(db,`SELECT owner_id id,AVG(rating) n FROM stay_reviews WHERE owner_id IN (${m}) GROUP BY owner_id`,ids_)
  ]);
  const a=byId(answered),u=byId(unanswered),d=byId(done),c=byId(cancels),r=byId(ratings);
  for(const id of list)out.set(id,ownerReliability({answered:n(a.get(id)?.n),unanswered:n(u.get(id)?.n),completed:n(d.get(id)?.n),cancels:n(c.get(id)?.n),rating:r.get(id)?.n?Number(r.get(id)!.n):null}));
 }
 return out;
}
