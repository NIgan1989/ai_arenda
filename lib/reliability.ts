import {epoch,rows,type Row} from './operation-core';
import {plural,reliabilityScore,type Reliability} from './reliability-text';
export {reliabilityScore,reliabilityShort,reliabilityLabels,type Reliability} from './reliability-text';

// Reliability rating: how each side keeps its word, from the service's own history.
// Guest: stays without a dispute against disputes at checkout and own cancellations after confirmation.
// Cleaner: finished cleanings against missed ones (a no-show weighs double) and returned reports.
// Owner: answered requests and finished stays against unanswered requests and own cancellations.
// Training flats (demo_owner set) never count: their bookings are simulated and the owner can confirm them alone.
type Role='guest'|'owner'|'cleaner';
const byId=(list:Row[])=>new Map(list.map(r=>[r.id,r]));
const n=(v:unknown)=>Number(v||0);
const live=(alias:string)=>`EXISTS(SELECT 1 FROM properties lp WHERE lp.id=${alias}.property_id AND lp.demo_owner IS NULL)`;
// An episode the administrator cancelled in the answer to an objection (lib/reliability-objection.ts) no longer counts.
export type VoidKind='dispute'|'guest_cancel'|'owner_cancel'|'no_show'|'revision'|'unanswered';
export const notVoided=(kind:VoidKind,user:string,role:Role,entity:string)=>`NOT EXISTS(SELECT 1 FROM reliability_objections vo,json_each(vo.voided) vv WHERE vo.user_id=${user} AND vo.role='${role}' AND vo.voided<>'[]' AND json_extract(vv.value,'$.kind')='${kind}' AND json_extract(vv.value,'$.id')=${entity})`;
// A returned report belongs to the one who sent it: the notice «Доработайте уборку» went to that person (audit 2026-11-22),
// not to whoever holds the job now. The same for a no-show.
const jobMark=(prefix:string)=>`x.dedupe LIKE 'cleaner:${prefix}:'||j.id||':%'`;

export function guestReliability(s:{completed:number;disputes:number;cancels:number;phone:boolean}):Reliability{
 const facts=[s.completed?plural(s.completed,'проживание','проживания','проживаний'):'',s.disputes?'споров при выезде: '+s.disputes:'',s.cancels?'отмен после подтверждения: '+s.cancels:'',s.phone?'телефон подтверждён':''].filter(Boolean);
 return reliabilityScore(Math.max(0,s.completed-s.disputes),s.disputes*2+s.cancels,facts);
}
export function cleanerReliability(s:{completed:number;noShows:number;returned:number;rating?:number|null}):Reliability{
 // The customers' rating is shown as a fact; the score itself stays on what the service saw (done, missed, returned).
 const facts=[s.completed?plural(s.completed,'уборка','уборки','уборок'):'',s.rating?'оценка заказчиков '+s.rating.toFixed(1).replace('.',','):'',s.noShows?'срывов: '+s.noShows:'',s.returned?'возвратов на доработку: '+s.returned:''].filter(Boolean);
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
   rows(db,`SELECT b.guest_id id,COUNT(*) n FROM bookings b WHERE b.status='completed' AND ${live('b')} AND b.guest_id IN (${m}) GROUP BY b.guest_id`,ids_),
   rows(db,`SELECT b.guest_id id,COUNT(DISTINCT a.entity_id) n FROM audit_events a JOIN bookings b ON b.id=a.entity_id WHERE a.action LIKE '%booking.checkout_disputed%' AND ${live('b')} AND ${notVoided('dispute','b.guest_id','guest','b.id')} AND b.guest_id IN (${m}) GROUP BY b.guest_id`,ids_),
   rows(db,`SELECT b.guest_id id,COUNT(DISTINCT a.entity_id) n FROM audit_events a JOIN bookings b ON b.id=a.entity_id WHERE a.action='booking.cancelled' AND a.actor_id=b.guest_id AND ${live('b')} AND ${notVoided('guest_cancel','b.guest_id','guest','b.id')} AND b.guest_id IN (${m}) AND EXISTS(SELECT 1 FROM audit_events c WHERE c.entity_id=a.entity_id AND c.action LIKE '%booking.confirmed%' AND c.created_at<=a.created_at) GROUP BY b.guest_id`,ids_),
   rows(db,`SELECT user_id id,1 n FROM phone_verifications WHERE verified_at IS NOT NULL AND user_id IN (${m})`,ids_)
  ]);
  const d=byId(done),x=byId(disputes),c=byId(cancels),p=byId(phones);
  for(const id of list)out.set(id,guestReliability({completed:n(d.get(id)?.n),disputes:n(x.get(id)?.n),cancels:n(c.get(id)?.n),phone:p.has(id)}));
 }else if(role==='cleaner'){
  const [done,missed,returned]=await Promise.all([
   rows(db,`SELECT j.assigned_to id,COUNT(*) n,ROUND(AVG(j.rating),1) rating FROM cleaning_jobs j WHERE j.status='completed' AND ${live('j')} AND j.assigned_to IN (${m}) GROUP BY j.assigned_to`,ids_),
   rows(db,`SELECT x.user_id id,COUNT(*) n FROM notifications x WHERE x.dedupe LIKE 'cleaner:no-show:%' AND x.user_id IN (${m}) AND NOT EXISTS(SELECT 1 FROM cleaning_jobs j JOIN properties lp ON lp.id=j.property_id WHERE ${jobMark('no-show')} AND (lp.demo_owner IS NOT NULL OR NOT ${notVoided('no_show','x.user_id','cleaner','j.id')})) GROUP BY x.user_id`,ids_),
   rows(db,`SELECT x.user_id id,COUNT(*) n FROM notifications x JOIN cleaning_jobs j ON ${jobMark('revision')} WHERE x.dedupe LIKE 'cleaner:revision:%' AND x.user_id IN (${m}) AND ${live('j')} AND ${notVoided('revision','x.user_id','cleaner','j.id')} GROUP BY x.user_id`,ids_)
  ]);
  const d=byId(done),x=byId(missed),r=byId(returned);
  for(const id of list)out.set(id,cleanerReliability({completed:n(d.get(id)?.n),noShows:n(x.get(id)?.n),returned:n(r.get(id)?.n),rating:d.get(id)?.rating||null}));
 }else{
  const [answered,unanswered,done,cancels,ratings]=await Promise.all([
   rows(db,`SELECT p.owner_id id,COUNT(DISTINCT b.id) n FROM bookings b JOIN properties p ON p.id=b.property_id WHERE p.demo_owner IS NULL AND p.owner_id IN (${m}) AND EXISTS(SELECT 1 FROM audit_events a WHERE a.entity_id=b.id AND (a.action LIKE '%booking.confirmed%' OR a.action='booking.rejected')) GROUP BY p.owner_id`,ids_),
   rows(db,`SELECT p.owner_id id,COUNT(*) n FROM bookings b JOIN properties p ON p.id=b.property_id WHERE p.demo_owner IS NULL AND p.owner_id IN (${m}) AND b.status IN ('requested','expired') AND b.expires_at<=? AND ${notVoided('unanswered','p.owner_id','owner','b.id')} GROUP BY p.owner_id`,ids_,t),
   rows(db,`SELECT p.owner_id id,COUNT(*) n FROM bookings b JOIN properties p ON p.id=b.property_id WHERE p.demo_owner IS NULL AND p.owner_id IN (${m}) AND b.status='completed' GROUP BY p.owner_id`,ids_),
   rows(db,`SELECT p.owner_id id,COUNT(DISTINCT a.entity_id) n FROM audit_events a JOIN bookings b ON b.id=a.entity_id JOIN properties p ON p.id=b.property_id WHERE a.action='booking.cancelled' AND a.actor_id=p.owner_id AND p.demo_owner IS NULL AND ${notVoided('owner_cancel','p.owner_id','owner','b.id')} AND p.owner_id IN (${m}) AND EXISTS(SELECT 1 FROM audit_events c WHERE c.entity_id=a.entity_id AND c.action LIKE '%booking.confirmed%' AND c.created_at<=a.created_at) GROUP BY p.owner_id`,ids_),
   rows(db,`SELECT r.owner_id id,AVG(r.rating) n FROM stay_reviews r WHERE ${live('r')} AND r.owner_id IN (${m}) GROUP BY r.owner_id`,ids_)
  ]);
  const a=byId(answered),u=byId(unanswered),d=byId(done),c=byId(cancels),r=byId(ratings);
  for(const id of list)out.set(id,ownerReliability({answered:n(a.get(id)?.n),unanswered:n(u.get(id)?.n),completed:n(d.get(id)?.n),cancels:n(c.get(id)?.n),rating:r.get(id)?.n?Number(r.get(id)!.n):null}));
 }
 return out;
}

// The episodes that lower a participant's rating, one by one, for the administrator who answers an objection
// (audit 2026-11-22): what happened, where and when, and whether it was already cancelled. Every episode that counts
// is listed (up to 500 of a kind), so any of them can be cancelled.
export type Episode={kind:VoidKind;id:string;title:string;at:number;note:string;voided:boolean};
const reasonOf=(action:unknown,marker:string)=>{let a=String(action||'');if(a.startsWith('{'))try{a=String(JSON.parse(a).action||'');}catch{/* a plain action */}const i=a.indexOf(marker+':');return i<0?'':a.slice(i+marker.length+1).trim();};
const withNote=(head:string,more:string)=>more?head+': '+more:head;
export async function ratingEpisodes(db:D1Database,userId:string,role:Role,t=epoch()):Promise<Episode[]>{
 const off=new Set<string>();
 for(const r of await rows(db,"SELECT voided FROM reliability_objections WHERE user_id=? AND role=? AND voided<>'[]'",userId,role)){try{for(const v of JSON.parse(r.voided||'[]'))off.add(v.kind+':'+v.id);}catch{/* an unreadable list cancels nothing */}}
 const list:Omit<Episode,'voided'>[]=[];
 const add=(kind:VoidKind,found:Row[],note:(r:Row)=>string)=>{for(const r of found)list.push({kind,id:String(r.id),title:String(r.title||''),at:n(r.at),note:note(r)});};
 const confirmedBefore="EXISTS(SELECT 1 FROM audit_events c WHERE c.entity_id=a.entity_id AND c.action LIKE '%booking.confirmed%' AND c.created_at<=a.created_at)";
 if(role==='guest'){
  add('dispute',await rows(db,`SELECT b.id,p.title,MAX(a.created_at) at,MAX(a.action) action FROM audit_events a JOIN bookings b ON b.id=a.entity_id JOIN properties p ON p.id=b.property_id WHERE a.action LIKE '%booking.checkout_disputed%' AND p.demo_owner IS NULL AND b.guest_id=? GROUP BY b.id ORDER BY at DESC LIMIT 500`,userId),r=>withNote('Спор при выезде',reasonOf(r.action,'booking.checkout_disputed')));
  add('guest_cancel',await rows(db,`SELECT b.id,p.title,MAX(a.created_at) at FROM audit_events a JOIN bookings b ON b.id=a.entity_id JOIN properties p ON p.id=b.property_id WHERE a.action='booking.cancelled' AND a.actor_id=b.guest_id AND p.demo_owner IS NULL AND b.guest_id=? AND ${confirmedBefore} GROUP BY b.id ORDER BY at DESC LIMIT 500`,userId),()=>'Отмена после подтверждения');
 }else if(role==='cleaner'){
  add('no_show',await rows(db,`SELECT j.id,p.title,MAX(x.created_at) at FROM notifications x JOIN cleaning_jobs j ON ${jobMark('no-show')} JOIN properties p ON p.id=j.property_id WHERE x.user_id=? AND x.dedupe LIKE 'cleaner:no-show:%' AND p.demo_owner IS NULL GROUP BY j.id ORDER BY at DESC LIMIT 500`,userId),()=>'Срыв: начало уборки не отмечено');
  add('revision',await rows(db,`SELECT j.id,p.title,MAX(x.created_at) at,COUNT(*) times,MAX(x.body) body FROM notifications x JOIN cleaning_jobs j ON ${jobMark('revision')} JOIN properties p ON p.id=j.property_id WHERE x.user_id=? AND x.dedupe LIKE 'cleaner:revision:%' AND p.demo_owner IS NULL GROUP BY j.id ORDER BY at DESC LIMIT 500`,userId),r=>withNote(n(r.times)>1?'Возвратов отчёта: '+n(r.times):'Отчёт возвращён на доработку',String(r.body||'').replace(/^Доработайте уборку:\s*/,'')));
 }else{
  add('owner_cancel',await rows(db,`SELECT b.id,p.title,MAX(a.created_at) at FROM audit_events a JOIN bookings b ON b.id=a.entity_id JOIN properties p ON p.id=b.property_id WHERE a.action='booking.cancelled' AND a.actor_id=p.owner_id AND p.demo_owner IS NULL AND p.owner_id=? AND ${confirmedBefore} GROUP BY b.id ORDER BY at DESC LIMIT 500`,userId),()=>'Отмена владельцем после подтверждения');
  add('unanswered',await rows(db,"SELECT b.id,p.title,b.expires_at at FROM bookings b JOIN properties p ON p.id=b.property_id WHERE p.demo_owner IS NULL AND p.owner_id=? AND b.status IN ('requested','expired') AND b.expires_at<=? ORDER BY b.expires_at DESC LIMIT 500",userId,t),()=>'Заявка осталась без ответа');
 }
 return list.map(e=>({...e,voided:off.has(e.kind+':'+e.id)})).sort((a,b)=>b.at-a.at);
}
