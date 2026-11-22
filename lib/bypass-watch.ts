import {DomainError,required} from './domain';
import type {RentalService} from './service';
import {epoch,uuid,q,one,rows,type Row} from './operation-core';

// Owners and cleaners who seem to take deals out of the service (offers: owner 6.2, cleaner 8.2).
// The service only collects signs; a person at the platform looks at them and acts in steps:
// first warning → second warning → block (the block is the usual restrictions/decide).
// The warning is a «service:» notice, so the owner and the cleaner see it in either role (lib/notice-feed.ts).
// Signs over 30 days, counted again from zero after each warning, so a warned person comes back only if it goes on:
//  cancels  — a confirmed booking (it has a commission row) was cancelled afterwards;
//  stayed   — the guest of such a booking answered «Да» to «Вы заселились?» (lib/approvals.ts);
//  contacts — the owner tried to send a phone, link or messenger in a booking chat before it opens (lib/chat-guard.ts);
//  jobs     — the owner cancelled, twice or more, cleanings already taken by the same cleaner (both are shown).
export const WATCH_DAYS=30,WATCH_MIN=4,WARNINGS_BEFORE_BLOCK=2;
export const POINTS={cancels:2,stayed:5,contacts:1,jobs:2} as const;
type Signals={cancels:number;stayed:number;contacts:number;jobs:number};
export type Suspect={userId:string;name:string;role:'owner'|'cleaner';score:number;signals:Signals;warnings:number;lastWarningAt:number|null};

export const WARNING_TEXT=[
 'Предупреждение администратора: похоже, вы договариваетесь с участниками мимо сервиса. Это нарушает оферту (раздел «Обход Сервиса»). Если это повторится, будет второе предупреждение, затем блокировка аккаунта. Если это ошибка, напишите в поддержку.',
 'Второе предупреждение администратора: снова похоже на сделки мимо сервиса. При следующем нарушении аккаунт будет заблокирован (оферта, раздел «Обход Сервиса»). Если это ошибка, напишите в поддержку.'
] as const;
export const BLOCK_REASON='Обход сервиса после двух предупреждений (оферта, раздел «Обход Сервиса»).';

async function warningsOf(db:D1Database,at:number){
 const list=await rows(db,"SELECT entity_id user_id,COUNT(*) n,MAX(created_at) last FROM audit_events WHERE action LIKE 'bypass.warning:%' AND created_at>? GROUP BY entity_id",at-365*86400);
 return new Map(list.map(w=>[String(w.user_id),{n:Number(w.n),last:Number(w.last)}]));
}

export async function bypassWatch(db:D1Database,at=epoch()):Promise<Suspect[]>{
 const since=at-WATCH_DAYS*86400,warned=await warningsOf(db,at);
 const [cancels,stayed,contacts,jobs]=await Promise.all([
  // The time of the cancellation (its audit event), not of the confirmation; an old row without the event falls back to the confirmation.
  rows(db,"SELECT uid,t FROM (SELECT c.owner_id uid,COALESCE((SELECT MAX(a.created_at) FROM audit_events a WHERE a.entity_id=b.id AND a.action LIKE 'booking.cancelled%'),c.created_at) t FROM platform_commissions c JOIN bookings b ON b.id=c.booking_id WHERE b.status='cancelled') WHERE t>?",since),
  rows(db,"SELECT c.owner_id uid,a.created_at t FROM audit_events a JOIN platform_commissions c ON c.booking_id=a.entity_id WHERE a.action='stay.checked:yes' AND a.created_at>?",since),
  rows(db,"SELECT p.owner_id uid,a.created_at t FROM audit_events a JOIN bookings b ON b.id=a.entity_id JOIN properties p ON p.id=b.property_id WHERE a.action='chat.contact_blocked' AND a.actor_id=p.owner_id AND a.created_at>?",since),
  rows(db,"SELECT owner_id,assigned_to,cancelled_at t FROM cleaning_jobs WHERE status='cancelled' AND assigned_to IS NOT NULL AND cancelled_at>?",since),
 ]);
 const people=new Map<string,{role:'owner'|'cleaner';signals:Signals}>();
 const fresh=(uid:string,t:number)=>t>(warned.get(uid)?.last||0);
 const add=(uid:string,role:'owner'|'cleaner',key:keyof Signals,n=1)=>{const p=people.get(uid+':'+role)||{role,signals:{cancels:0,stayed:0,contacts:0,jobs:0}};p.signals[key]+=n;people.set(uid+':'+role,p);};
 for(const r of cancels)if(fresh(r.uid,r.t))add(r.uid,'owner','cancels');
 for(const r of stayed)if(fresh(r.uid,r.t))add(r.uid,'owner','stayed');
 for(const r of contacts)if(fresh(r.uid,r.t))add(r.uid,'owner','contacts');
 // Pairs: each side counts only the cancellations after its own last warning.
 const pairs=new Map<string,{owner:string;cleaner:string;times:number[]}>();
 for(const r of jobs){const k=r.owner_id+'|'+r.assigned_to;const p=pairs.get(k)||{owner:String(r.owner_id),cleaner:String(r.assigned_to),times:[] as number[]};p.times.push(Number(r.t));pairs.set(k,p);}
 for(const p of pairs.values()){
  const o=p.times.filter(t=>fresh(p.owner,t)).length,c=p.times.filter(t=>fresh(p.cleaner,t)).length;
  if(o>=2)add(p.owner,'owner','jobs',o);if(c>=2)add(p.cleaner,'cleaner','jobs',c);
 }
 const scored=[...people.entries()].map(([key,p])=>{const s=p.signals;return {userId:key.slice(0,key.lastIndexOf(':')),role:p.role,signals:s,score:s.cancels*POINTS.cancels+s.stayed*POINTS.stayed+Math.min(s.contacts,5)*POINTS.contacts+s.jobs*POINTS.jobs};})
  .filter(p=>p.score>=WATCH_MIN&&(p.signals.cancels>=2||p.signals.stayed>0||p.signals.contacts>=2||p.signals.jobs>0));
 if(!scored.length)return [];
 const ids=[...new Set(scored.map(p=>p.userId))],marks=ids.map(()=>'?').join(',');
 const names=new Map((await rows(db,`SELECT id,name FROM profiles WHERE id IN (${marks})`,...ids)).map(r=>[String(r.id),String(r.name||'')]));
 const blocked=new Set((await rows(db,`SELECT user_id FROM account_restrictions WHERE kind='blocked' AND user_id IN (${marks})`,...ids)).map(r=>String(r.user_id)));
 return scored.filter(p=>!blocked.has(p.userId)).map(p=>({...p,name:names.get(p.userId)||(p.role==='owner'?'Владелец':'Исполнитель'),warnings:warned.get(p.userId)?.n||0,lastWarningAt:warned.get(p.userId)?.last??null}))
  .sort((a,b)=>b.score-a.score).slice(0,30);
}

// «Предупредить»: the next step for this person. The administrator sends the count they saw, so a second tap
// (or a second administrator) does not send the same warning twice.
export async function warnBypass(s:RentalService,body:Row,platformAdmin:boolean){
 if(!platformAdmin)throw new DomainError('Предупреждать участников может администратор платформы.',403);
 const userId=required(body.userId,'Участник',100),seen=Number(body.warnings),t=epoch();
 if(userId===s.userId)throw new DomainError('Нельзя предупредить себя.',409);
 if(!await one(s.db,'SELECT id FROM profiles WHERE id=?',userId))throw new DomainError('Участник не найден.',404);
 const n=(await warningsOf(s.db,t)).get(userId)?.n||0;
 if(!Number.isInteger(seen)||seen!==n)throw new DomainError('Список устарел: обновите его.',409);
 if(n>=WARNINGS_BEFORE_BLOCK)throw new DomainError('Два предупреждения уже были. Следующий шаг — блокировка.',409);
 // One step at a time even with two administrators: the warning is written only while the count is still n,
 // and the notice only when this very warning was written (the batch runs as one transaction).
 const mark=uuid();
 const [written]=await s.db.batch([
  q(s.db,"INSERT INTO audit_events SELECT ?,?,?,?,? WHERE (SELECT COUNT(*) FROM audit_events WHERE entity_id=? AND action LIKE 'bypass.warning:%' AND created_at>?)=?",mark,s.userId,userId,'bypass.warning:'+(n+1),t,userId,t-365*86400,n),
  q(s.db,'INSERT OR IGNORE INTO notifications(id,user_id,body,dedupe,read,created_at) SELECT ?,?,?,?,0,? WHERE EXISTS(SELECT 1 FROM audit_events WHERE id=?)',uuid(),userId,WARNING_TEXT[n],'service:bypass-warning:'+userId+':'+(n+1),t,mark),
 ]);
 if(!written.meta.changes)throw new DomainError('Список устарел: обновите его.',409);
 return {message:n===0?'Первое предупреждение отправлено.':'Второе предупреждение отправлено.',warnings:n+1};
}
