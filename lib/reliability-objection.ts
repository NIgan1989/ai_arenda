import {DomainError} from './domain';
import {epoch,one,q,rows,uuid,type Row} from './operation-core';

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
const shape=(r:Row|null)=>r?{id:r.id,status:r.status,body:r.body,createdAt:r.created_at,dueAt:r.due_at,answer:r.answer||null,answeredAt:r.answered_at||null}:null;

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
 await db.batch([
  q(db,'INSERT INTO reliability_objections(id,user_id,role,body,created_at,due_at) VALUES (?,?,?,?,?,?)',id,userId,role,text,at,due),
  q(db,'INSERT INTO audit_events VALUES (?,?,?,?,?)',uuid(),userId,id,JSON.stringify({action:'reliability.objected',role}),at),
  ...admins.map(admin=>q(db,'INSERT OR IGNORE INTO notifications(id,user_id,body,dedupe,read,created_at) VALUES (?,?,?,?,0,?)',uuid(),admin,'Возражение '+ADMIN_TEXT[role as ObjectionRole]+' на оценку надёжности. Ответить нужно за 3 рабочих дня: раздел «Жалобы» в админке.','admin:objection:'+id+':'+admin,at)),
 ]);
 return {message:'Возражение отправлено. Администратор ответит в течение 3 рабочих дней.',...await myObjection(db,userId,role)};
}

// The administrator's queue: open objections first, by deadline, with the facts the rating is made of.
export async function objectionQueue(db:D1Database,at=epoch()){
 const list=await rows(db,"SELECT o.id,o.user_id,o.role,o.body,o.status,o.created_at,o.due_at,o.answer,o.answered_at,p.name FROM reliability_objections o LEFT JOIN profiles p ON p.id=o.user_id WHERE o.status='open' OR o.answered_at>=? ORDER BY o.status='answered',o.due_at LIMIT 100",at-30*DAY);
 return list.map(r=>({...r,late:r.status==='open'&&r.due_at<at}));
}

export async function answerObjection(db:D1Database,adminId:string,body:Row,at=epoch()){
 const answer=typeof body.answer==='string'?body.answer.trim():'';
 if(answer.length<10)throw new DomainError('Напишите ответ участнику: что проверили и что решили.');
 if(answer.length>2000)throw new DomainError('Сократите ответ до 2 000 знаков.');
 const o=await one(db,'SELECT * FROM reliability_objections WHERE id=?',String(body.id||''));
 if(!o)throw new DomainError('Возражение не найдено.',404);
 if(o.status!=='open')throw new DomainError('На это возражение уже ответили.',409);
 await db.batch([
  q(db,"UPDATE reliability_objections SET status='answered',answer=?,answered_by=?,answered_at=? WHERE id=? AND status='open'",answer,adminId,at,o.id),
  q(db,'INSERT INTO audit_events VALUES (?,?,?,?,?)',uuid(),adminId,o.id,JSON.stringify({action:'admin.reliability_objection_answered',user:o.user_id}),at),
  q(db,'INSERT OR IGNORE INTO notifications(id,user_id,body,dedupe,read,created_at) VALUES (?,?,?,?,0,?)',uuid(),o.user_id,'Ответ на ваше возражение по оценке надёжности: '+answer,o.role+':reliability-objection:'+o.id,at),
 ]);
 return {message:'Ответ отправлен участнику.',objections:await objectionQueue(db,at)};
}
