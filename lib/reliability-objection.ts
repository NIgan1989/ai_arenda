import {DomainError} from './domain';
import {epoch,one,q,rows,uuid,type Row} from './operation-core';
import {ratingEpisodes,reliabilityFor} from './reliability';
import {reassessOpenRequests} from './booking-risk';

// «Не согласен с оценкой»: the reliability rating (lib/reliability.ts) is computed by rules from the service's history,
// which the Law «О персональных данных» art. 19-1 treats as automated processing. The person can object; the platform
// administrator reads the objection with the facts and answers within three working days. One open objection per role.
export type ObjectionRole='guest'|'owner'|'cleaner';
const ROLES:ObjectionRole[]=['guest','owner','cleaner'];
const DAY=86400,ALMATY=5*3600;
const ADMIN_TEXT:Record<ObjectionRole,string>={guest:'гостя',owner:'владельца',cleaner:'исполнителя'};

// Three working days later, Monday to Friday by Almaty time; public holidays are not counted here.
export function workingDaysLater(at:number,days=3){
 let t=at,left=days;
 while(left>0){t+=DAY;const wd=new Date((t+ALMATY)*1000).getUTCDay();if(wd!==0&&wd!==6)left--;}
 return t;
}
const voidedOf=(r:Row)=>{try{const v=JSON.parse(r.voided||'[]');return Array.isArray(v)?v.length:0;}catch{return 0;}};
const shape=(r:Row|null)=>r?{id:r.id,status:r.status,body:r.body,createdAt:r.created_at,dueAt:r.due_at,answer:r.answer||null,answeredAt:r.answered_at||null,cancelled:voidedOf(r)}:null;

export async function myObjection(db:D1Database,userId:string,role:string){
 if(!ROLES.includes(role as ObjectionRole))return {objection:null};
 return {objection:shape(await one(db,'SELECT * FROM reliability_objections WHERE user_id=? AND role=? ORDER BY created_at DESC LIMIT 1',userId,role))};
}

export async function objectReliability(db:D1Database,userId:string,role:string,body:Row,adminIds:unknown,at=epoch()){
 if(!ROLES.includes(role as ObjectionRole))throw new DomainError('Возражение доступно гостю, владельцу и исполнителю.',403);
 const text=typeof body.text==='string'?body.text.trim().replace(/\s+/g,' '):'';
 if(text.length<10)throw new DomainError('Напишите, с чем вы не согласны: хотя бы одно предложение.');
 if(text.length>2000)throw new DomainError('Сократите текст до 2 000 знаков.');
 if(await one(db,"SELECT 1 FROM reliability_objections WHERE user_id=? AND role=? AND status='open'",userId,role))throw new DomainError('Ваше возражение уже на рассмотрении. Ответ придёт в уведомлениях.',409);
 const id=uuid(),due=workingDaysLater(at),admins=typeof adminIds==='string'?adminIds.split(',').map(v=>v.trim()).filter(Boolean):[];
 const busy=new DomainError('Ваше возражение уже на рассмотрении. Ответ придёт в уведомлениях.',409);
 await db.batch([
  q(db,'INSERT INTO reliability_objections(id,user_id,role,body,created_at,due_at) VALUES (?,?,?,?,?,?)',id,userId,role,text,at,due),
  q(db,'INSERT INTO audit_events VALUES (?,?,?,?,?)',uuid(),userId,id,JSON.stringify({action:'reliability.objected',role}),at),
  ...admins.map(admin=>q(db,'INSERT OR IGNORE INTO notifications(id,user_id,body,dedupe,read,created_at) VALUES (?,?,?,?,0,?)',uuid(),admin,'Возражение '+ADMIN_TEXT[role as ObjectionRole]+' на оценку надёжности. Ответить нужно за 3 рабочих дня: раздел «Жалобы» в админке.','admin:objection:'+id+':'+admin,at)),
 // Two overlapping sends: the partial unique index keeps one open objection, the other gets the same answer.
 ]).catch(e=>{throw /UNIQUE/i.test(String((e as Error)?.message))?busy:e;});
 return {message:'Возражение отправлено. Администратор ответит в течение 3 рабочих дней.',...await myObjection(db,userId,role)};
}

// The administrator's queue: open objections first, by deadline. An open one carries the current rating and the
// episodes it is made of, so the administrator can cancel a wrong one in the answer (audit 2026-11-22).
export async function objectionQueue(db:D1Database,at=epoch()){
 const list=await rows(db,"SELECT o.id,o.user_id,o.role,o.body,o.status,o.created_at,o.due_at,o.answer,o.answered_at,o.voided,p.name FROM reliability_objections o LEFT JOIN profiles p ON p.id=o.user_id WHERE o.status='open' OR o.answered_at>=? ORDER BY o.status='answered',o.due_at LIMIT 100",at-30*DAY);
 return Promise.all(list.map(async({voided,...r})=>{
  const base={...r,late:r.status==='open'&&r.due_at<at,cancelled:voidedOf({voided})};
  if(r.status!=='open')return base;
  const role=r.role as ObjectionRole;
  return {...base,reliability:(await reliabilityFor(db,role,[r.user_id],at)).get(r.user_id)||null,episodes:await ratingEpisodes(db,r.user_id,role,at)};
 }));
}

// The answer may cancel episodes found wrong («Претензия была ошибочной»): they are kept with the objection, the
// rating and the risk of the guest's waiting requests are counted again at once. Only the administrator whose answer
// was written gets «Ответ отправлен»; the journal and the notice are written only with that answer (audit 2026-11-22).
export async function answerObjection(db:D1Database,adminId:string,body:Row,at=epoch()){
 const answer=typeof body.answer==='string'?body.answer.trim():'';
 if(answer.length<10)throw new DomainError('Напишите ответ участнику: что проверили и что решили.');
 if(answer.length>2000)throw new DomainError('Сократите ответ до 2 000 знаков.');
 const o=await one(db,'SELECT * FROM reliability_objections WHERE id=?',String(body.id||''));
 if(!o)throw new DomainError('Возражение не найдено.',404);
 const closed=new DomainError('На это возражение уже ответил другой администратор. Обновите список.',409);
 if(o.status!=='open')throw closed;
 const asked=Array.isArray(body.cancel)?[...new Set(body.cancel.map(String))]:[];
 const episodes=asked.length?await ratingEpisodes(db,o.user_id,o.role,at):[];
 const voided=asked.map(key=>{const e=episodes.find(e=>e.kind+':'+e.id===key);if(!e)throw new DomainError('Эпизод не найден в истории участника. Обновите список.',409);return {kind:e.kind,id:e.id};});
 const mine="EXISTS(SELECT 1 FROM reliability_objections WHERE id=? AND answered_by=? AND answered_at=? AND answer=?)",me=[o.id,adminId,at,answer];
 const note=voided.length?' Отменено отметок в оценке: '+voided.length+', оценка пересчитана.':'';
 const r=await db.batch([
  q(db,"UPDATE reliability_objections SET status='answered',answer=?,answered_by=?,answered_at=?,voided=? WHERE id=? AND status='open'",answer,adminId,at,JSON.stringify(voided),o.id),
  q(db,`INSERT INTO audit_events SELECT ?,?,?,?,? WHERE ${mine}`,uuid(),adminId,o.id,JSON.stringify({action:'admin.reliability_objection_answered',user:o.user_id,voided}),at,...me),
  q(db,`INSERT OR IGNORE INTO notifications(id,user_id,body,dedupe,read,created_at) SELECT ?,?,?,?,0,? WHERE ${mine}`,uuid(),o.user_id,'Ответ на ваше возражение по оценке надёжности: '+answer+note,o.role+':reliability-objection:'+o.id,at,...me),
 ]);
 if(!r[0].meta.changes)throw closed;
 if(voided.length&&o.role==='guest')await reassessOpenRequests(db,o.user_id,at);
 return {message:'Ответ отправлен участнику.'+(voided.length?' Оценка пересчитана.':''),objections:await objectionQueue(db,at)};
}
