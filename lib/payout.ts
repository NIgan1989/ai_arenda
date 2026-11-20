import {DomainError} from './domain';
import type {RentalService} from './service';
import {epoch,uuid,q,one,rows,type Row} from './operation-core';
import {verifyPassword} from './native-auth';

// «Реквизиты для оплаты»: where a participant receives transfers. Guests pay owners and owners pay performers
// directly, outside the service; the service only shows these details to the other side of a confirmed deal.
export type Payout={phone:string;recipient:string;link:string};

// A Kazakhstan mobile number in any spelling becomes +7XXXXXXXXXX; anything else is refused.
export function payoutPhone(value:unknown){
 const digits=String(value??'').replace(/\D/g,'');
 const ten=digits.length===11&&(digits[0]==='7'||digits[0]==='8')?digits.slice(1):digits.length===10?digits:'';
 if(!/^7\d{9}$/.test(ten))throw new DomainError('Укажите номер Kaspi в формате +7 7XX XXX XX XX.');
 return '+7'+ten;
}
export const payoutPhoneText=(phone:string)=>/^\+7\d{10}$/.test(phone)?`+7 ${phone.slice(2,5)} ${phone.slice(5,8)} ${phone.slice(8,10)} ${phone.slice(10)}`:phone;
// Only a Kaspi pay link is accepted, so a card of a booking never leads the payer to an unknown site.
export function payoutLink(value:unknown){
 const text=String(value??'').trim();if(!text)return '';
 let url:URL;try{url=new URL(text);}catch{throw new DomainError('Ссылка на оплату должна начинаться с https://pay.kaspi.kz/.');}
 if(url.protocol!=='https:'||!['pay.kaspi.kz','kaspi.kz'].includes(url.hostname)||text.length>300)throw new DomainError('Ссылка на оплату должна начинаться с https://pay.kaspi.kz/.');
 return url.href;
}
export type PendingPayout=Payout&{until:number};
// A change of details already in use waits this long. Someone who took over the account cannot redirect the next
// transfer at once: the owner of the account gets a notice (in the app and in Telegram) and cancels in time.
export const PAYOUT_HOLD=24*3600;
// How long the payer is told that the details changed recently.
export const PAYOUT_FRESH=7*86400;
const PASSWORD_TRIES=5,PASSWORD_WINDOW=900;
const when=(at:number)=>new Date(at*1000).toLocaleString('ru-RU',{timeZone:'Asia/Qyzylorda',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'});
const same=(a:Payout,b:Row)=>a.phone===b.phone&&a.recipient===b.recipient&&a.link===b.link;

export async function payoutOf(db:D1Database,userId:string):Promise<Payout|null>{
 const row=await one(db,"SELECT phone,recipient,link FROM payout_details WHERE user_id=? AND phone<>''",userId);
 return row?{phone:row.phone,recipient:row.recipient,link:row.link}:null;
}
/** What the owner of the details sees in «Реквизиты для оплаты»: the details in use and a change that waits. */
export async function payoutState(db:D1Database,userId:string){
 const row=await one(db,'SELECT phone,recipient,link,pending_phone,pending_recipient,pending_link,pending_until,changed_at FROM payout_details WHERE user_id=?',userId);
 return {
  payout:row?.phone?{phone:row.phone,recipient:row.recipient,link:row.link} as Payout:null,
  pending:row?.pending_until?{phone:row.pending_phone,recipient:row.pending_recipient,link:row.pending_link||'',until:Number(row.pending_until)} as PendingPayout:null,
 };
}
// The account password confirms a change of details that are already in use. Five wrong passwords in 15 minutes
// stop the attempts, so the form cannot be used to guess the password.
async function confirmPassword(db:D1Database,userId:string,password:unknown){
 const at=epoch(),key='payout-password:'+userId;
 const tries=await one(db,'SELECT attempts,expires_at FROM auth_attempt_limits WHERE key=?',key);
 if(tries&&Number(tries.expires_at)>at&&Number(tries.attempts)>=PASSWORD_TRIES)throw new DomainError('Слишком много попыток. Попробуйте через 15 минут.',429);
 const account=await one(db,'SELECT password_hash FROM auth_accounts WHERE id=?',userId);
 const ok=typeof password==='string'&&password.length>0&&password.length<=128&&!!account&&/^pbkdf2-sha512\$/.test(String(account.password_hash))&&await verifyPassword(password,String(account.password_hash));
 if(ok){await q(db,'DELETE FROM auth_attempt_limits WHERE key=?',key).run();return;}
 await q(db,'INSERT INTO auth_attempt_limits(key,attempts,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN expires_at<=? THEN 1 ELSE attempts+1 END,expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END',key,at+PASSWORD_WINDOW,at,at).run();
 throw new DomainError(typeof password==='string'&&password?'Пароль не подходит.':'Чтобы сменить реквизиты, введите пароль от аккаунта.',403);
}
const note=(db:D1Database,user:string,role:string,body:string,tag:string,at:number)=>q(db,'INSERT OR IGNORE INTO notifications(id,user_id,body,dedupe,read,created_at) VALUES (?,?,?,?,0,?)',uuid(),user,body,role+':payout:'+tag+':'+user+':'+at,at);
const auditOf=(db:D1Database,user:string,action:Row,at:number)=>q(db,'INSERT INTO audit_events VALUES (?,?,?,?,?)',uuid(),user,'payout:'+user,JSON.stringify(action),at);

export async function savePayout(service:RentalService,body:Row,role:'owner'|'cleaner'='owner'){
 const db=service.db,user=service.userId,at=epoch();
 if(body.action==='cancel'){
  const r=await q(db,'UPDATE payout_details SET pending_phone=NULL,pending_recipient=NULL,pending_link=NULL,pending_role=NULL,pending_until=NULL,version=version+1,updated_at=? WHERE user_id=? AND pending_until IS NOT NULL',at,user).run();
  if(!r.meta.changes)return {message:'Замены реквизитов нет.',...await payoutState(db,user)};
  await db.batch([auditOf(db,user,{action:'payout.change_cancelled'},at),note(db,user,role,'Замена реквизитов для оплаты отменена. Остаются прежние.','cancelled',at)]);
  return {message:'Замена отменена. Остаются прежние реквизиты.',...await payoutState(db,user)};
 }
 const phone=payoutPhone(body.phone),recipient=String(body.recipient??'').trim().replace(/\s+/g,' '),link=payoutLink(body.link);
 if(recipient.length<2||recipient.length>60)throw new DomainError('Напишите имя получателя так, как его видит отправитель в Kaspi, например «Айгерим К.».');
 const next={phone,recipient,link},row=await one(db,'SELECT phone,recipient,link,pending_until FROM payout_details WHERE user_id=?',user);
 // The first details go into use at once: nobody has paid by them yet.
 if(!row?.phone){
  await q(db,'INSERT INTO payout_details(user_id,phone,recipient,link,version,updated_at) VALUES (?,?,?,?,1,?) ON CONFLICT(user_id) DO UPDATE SET phone=excluded.phone,recipient=excluded.recipient,link=excluded.link,version=version+1,updated_at=excluded.updated_at',user,phone,recipient,link,at).run();
  await auditOf(db,user,{action:'payout.set'},at).run();
  return {message:'Реквизиты сохранены. Их увидит только тот, кто платит вам по подтверждённой брони или принятой уборке.',payout:next,pending:null};
 }
 if(same(next,row)){
  if(row.pending_until)await q(db,'UPDATE payout_details SET pending_phone=NULL,pending_recipient=NULL,pending_link=NULL,pending_role=NULL,pending_until=NULL,version=version+1,updated_at=? WHERE user_id=?',at,user).run();
  return {message:'Реквизиты не изменились.',...await payoutState(db,user)};
 }
 await confirmPassword(db,user,body.password);
 const until=at+PAYOUT_HOLD;
 await db.batch([
  q(db,'UPDATE payout_details SET pending_phone=?,pending_recipient=?,pending_link=?,pending_role=?,pending_until=?,version=version+1,updated_at=? WHERE user_id=?',phone,recipient,link,role,until,at,user),
  auditOf(db,user,{action:'payout.change_requested',until},at),
  note(db,user,role,`Реквизиты для оплаты заменятся на Kaspi ${payoutPhoneText(phone)} (${recipient}) ${when(until)}. До этого платят по прежним. Если это не вы, откройте «Реквизиты для оплаты», нажмите «Отменить замену» и смените пароль.`,'requested',at),
 ]);
 return {message:`Новые реквизиты вступят в силу ${when(until)}. До этого вам платят по прежним. Мы прислали оповещение, чтобы замену можно было отменить, если это были не вы.`,...await payoutState(db,user)};
}
/** Puts the changes whose 24 hours passed into use. Runs every minute with the operational tick. */
export async function applyDuePayouts(db:D1Database,at=epoch()){
 const due=await rows(db,'SELECT user_id,pending_phone,pending_recipient,pending_link,pending_role FROM payout_details WHERE pending_until IS NOT NULL AND pending_until<=? LIMIT 50',at);
 let applied=0;
 for(const d of due){
  const r=await q(db,"UPDATE payout_details SET phone=pending_phone,recipient=pending_recipient,link=COALESCE(pending_link,''),changed_at=?,pending_phone=NULL,pending_recipient=NULL,pending_link=NULL,pending_role=NULL,pending_until=NULL,version=version+1,updated_at=? WHERE user_id=? AND pending_until IS NOT NULL AND pending_until<=?",at,at,d.user_id,at).run();
  if(!r.meta.changes)continue;applied++;
  await db.batch([auditOf(db,d.user_id,{action:'payout.changed'},at),note(db,d.user_id,d.pending_role==='cleaner'?'cleaner':'owner',`Новые реквизиты для оплаты вступили в силу: Kaspi ${payoutPhoneText(d.pending_phone)} (${d.pending_recipient}).`,'changed',at)]);
 }
 return applied;
}
