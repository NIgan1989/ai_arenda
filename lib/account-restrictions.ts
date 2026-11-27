import {DomainError,required} from './domain';
import type {RentalService} from './service';
import {epoch,uuid,q,one,rows,type Row} from './operation-core';
import {GUARANTEE_REASONS,type GuaranteeReason} from './guarantee-text';
import {kindCategory} from './listings';
import {NOT_LET_IN} from './stay-result';

// Stopping an owner who takes money and does not let the guest in (offer, section 5.3).
// hold — «Меня не заселили»: at once, before anyone looks, the owner's places leave the map and take no new
//        bookings, and the guests who have not paid yet are told not to pay in advance. A person at the platform
//        looks at the complaint and lifts the hold or blocks.
// blocked — the platform administrator closes the account: every session ends, nothing works in it, the places stay hidden.
// The row is the state; every change is written to audit_events with its reason.
export type Restriction='hold'|'blocked';

export const restrictedOwnerSql=(alias='p')=>{if(!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(alias))throw new Error('Invalid table alias');return `NOT EXISTS(SELECT 1 FROM account_restrictions ar WHERE ar.user_id=${alias}.owner_id)`;};
export async function restrictionOf(db:D1Database,userId:string){return one(db,'SELECT kind,reason,booking_id,created_at FROM account_restrictions WHERE user_id=?',userId);}
// A hold the background put for an unreturned refund (lib/owner-silence.ts): it lifts itself once the money is back.
// A guest's «Меня не заселили» takes such a hold over, so only a person lifts it then.
export const REFUND_HOLD_BY='ai-administrator:refund';
export const BLOCKED_TEXT='Аккаунт заблокирован администратором сервиса. Если это ошибка, напишите в поддержку.';

// The guest is at the door (from 15 minutes before the arrival) and nobody lets them in, or the home is not there.
// `why`: what the guest chose on «Не получается заселиться» (lib/guarantee-text.ts); it also starts the ten minutes of
// «Гарантия заселения» (lib/checkin-guarantee.ts).
export async function reportNotLetIn(s:RentalService,b:Row,terms:Row|null,text:string,why:GuaranteeReason='other'){
 // A home gets a replacement nearby after ten minutes (lib/checkin-guarantee.ts); a bath or a hall does not.
 const stay=kindCategory(b.property_type||'apartment')==='stay';
 const t=epoch(),title=b.title||'жильё',said=why==='other'?'':GUARANTEE_REASONS[why]+'.',reason=[NOT_LET_IN+'.',said,String(text||'').trim()].filter(Boolean).join(' ').slice(0,1000);
 const issue=await s.issueWrite(b,'booking',reason);
 const unpaid=await rows(s.db,"SELECT b.id,b.guest_id,p.title FROM bookings b JOIN properties p ON p.id=b.property_id JOIN booking_terms tt ON tt.booking_id=b.id WHERE p.owner_id=? AND b.id<>? AND b.status IN ('requested','confirmed') AND b.start>? AND tt.paid_amount=0 AND tt.actual_checkin IS NULL",b.owner_id,b.id,t);
 await s.db.batch([
  issue.statement,
  q(s.db,"INSERT INTO account_restrictions(user_id,kind,reason,booking_id,created_by,created_at) VALUES (?,'hold',?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET reason=excluded.reason,booking_id=excluded.booking_id,created_by=excluded.created_by,created_at=excluded.created_at WHERE account_restrictions.created_by=?",b.owner_id,'Гость сообщил, что его не заселили в «'+title+'».',b.id,s.userId,t,REFUND_HOLD_BY),
  q(s.db,'UPDATE booking_terms SET checkin_reported_at=NULL,version=version+1 WHERE booking_id=? AND actual_checkin IS NULL',b.id),
  q(s.db,'INSERT OR IGNORE INTO checkin_guarantees(booking_id,reason,reported_at) VALUES (?,?,?)',b.id,why,t),
  // What the guest chose shows on the owner's card (booking.guarantee), so the notice reads whole in every language.
  s.notify(b.owner_id,stay?'Срочно: гость у «'+title+'» не может заселиться. Ответьте ему в чате брони или позвоните в течение 10 минут, иначе мы предложим гостю другое жильё, а вам нужно будет вернуть ему всю оплату. Пока администратор разбирается, ваши объекты скрыты с карты и не принимают новые брони.':'Гость сообщил, что его не заселили в «'+title+'». Пока администратор разбирается, ваши объекты скрыты с карты и не принимают новые брони. Ответьте в обращении по брони и верните гостю деньги, если он их переводил.','not-let-in:'+b.id,'owner'),
  ...unpaid.map(u=>s.notify(u.guest_id,'По «'+u.title+'» администратор проверяет жалобу другого гостя. Пока проверка идёт, не переводите деньги заранее: платите только при заселении, когда вы внутри.','owner-hold:'+u.id,'guest')),
  s.audit(b.owner_id,'account.hold:not_let_in:'+b.id),
 ]);
 return {message:stay?'Владелец и администратор сервиса получили срочное сообщение. Если за 10 минут вас не заселят, покажем свободное жильё рядом не дороже. Объекты владельца скрыты, пока идёт проверка. Если вы переводили деньги, приложите чек в карточке брони: он поможет вернуть их.':'Администратор получил срочное обращение. Объекты владельца скрыты, пока идёт проверка. Если вы переводили деньги, приложите чек в карточке брони: он поможет вернуть их и пригодится для заявления в полицию.'};
}

// The platform administrator: lift a hold, block an account, or unblock it. Always with a reason the person hears.
export async function restrictAccount(s:RentalService,body:Row,platformAdmin:boolean){
 if(!platformAdmin)throw new DomainError('Ограничивать аккаунты может администратор платформы.',403);
 const userId=required(body.userId,'Участник',100),action=String(body.action),reason=required(body.reason,'Основание',1000),t=epoch();
 if(userId===s.userId)throw new DomainError('Нельзя ограничить свой аккаунт.',409);
 if(!await one(s.db,'SELECT id FROM profiles WHERE id=?',userId))throw new DomainError('Участник не найден.',404);
 const current=await restrictionOf(s.db,userId);
 if(action==='block'){
  await s.db.batch([
   q(s.db,"INSERT INTO account_restrictions(user_id,kind,reason,booking_id,created_by,created_at) VALUES (?,'blocked',?,NULL,?,?) ON CONFLICT(user_id) DO UPDATE SET kind='blocked',reason=excluded.reason,created_by=excluded.created_by,created_at=excluded.created_at",userId,reason,s.userId,t),
   q(s.db,'DELETE FROM auth_sessions WHERE user_id=?',userId),q(s.db,'DELETE FROM auth_mobile_sessions WHERE user_id=?',userId),
   q(s.db,'INSERT INTO audit_events VALUES (?,?,?,?,?)',uuid(),s.userId,userId,JSON.stringify({action:'account.blocked',reason}),t),
  ]);
  return {message:'Аккаунт заблокирован, все входы завершены, объекты скрыты.'};
 }
 if(action==='lift'){
  if(!current)return {message:'Ограничений нет.'};
  await s.db.batch([
   q(s.db,'DELETE FROM account_restrictions WHERE user_id=?',userId),
   q(s.db,'INSERT INTO audit_events VALUES (?,?,?,?,?)',uuid(),s.userId,userId,JSON.stringify({action:'account.restriction_lifted',was:current.kind,reason}),t),
   q(s.db,'INSERT OR IGNORE INTO notifications(id,user_id,body,dedupe,read,created_at) VALUES (?,?,?,?,0,?)',uuid(),userId,'Администратор снял ограничение с аккаунта: '+reason,'account:lifted:'+t,t),
  ]);
  return {message:current.kind==='blocked'?'Аккаунт разблокирован.':'Пауза снята, объекты снова видны гостям.'};
 }
 throw new DomainError('Выберите: заблокировать или снять ограничение.');
}
// «Снять с показа»: the administrator takes one place off the map. Its approval is withdrawn (a rejected review that
// is now the latest), so it comes back only after a person at the platform checks it again.
export async function unlistPlace(s:RentalService,body:Row,platformAdmin:boolean){
 if(!platformAdmin)throw new DomainError('Снимать жильё с показа может администратор платформы.',403);
 const p=await one(s.db,'SELECT id,owner_id,title FROM properties WHERE id=? AND demo_owner IS NULL',required(body.propertyId,'Жильё',100)),reason=required(body.reason,'Основание',1000),t=epoch();
 if(!p)throw new DomainError('Жильё не найдено.',404);
 await s.db.batch([
  q(s.db,"INSERT INTO participant_reviews(id,user_id,role,property_id,status,method,reference,reviewer_id,notes,created_at,reviewed_at) VALUES (?,?,'owner',?,'rejected','Снято с показа администратором',?,?,?,?,?)",uuid(),p.owner_id,p.id,'Снято с показа: «'+p.title+'»',s.userId,reason,t,t),
  q(s.db,'UPDATE properties SET published=0 WHERE id=?',p.id),
  q(s.db,'INSERT OR IGNORE INTO notifications(id,user_id,body,dedupe,read,created_at) VALUES (?,?,?,?,0,?)',uuid(),p.owner_id,'Администратор снял «'+p.title+'» с показа: '+reason+' Новые брони не принимаются. Чтобы вернуть жильё, пройдите проверку снова в «Моё жильё».','owner:unlisted:'+p.id+':'+t,t),
  q(s.db,'INSERT INTO audit_events VALUES (?,?,?,?,?)',uuid(),s.userId,p.id,JSON.stringify({action:'property.unlisted',reason}),t),
 ]);
 return {message:'«'+p.title+'» снято с показа. Вернуть его можно только после новой проверки.'};
}
// The administrator's list: everyone held or blocked now, newest first.
export async function restrictionsList(s:RentalService,platformAdmin:boolean){
 if(!platformAdmin)throw new DomainError('Список ограничений видит администратор платформы.',403);
 return {restrictions:await rows(s.db,'SELECT r.user_id,r.kind,r.reason,r.booking_id,r.created_at,p.name FROM account_restrictions r LEFT JOIN profiles p ON p.id=r.user_id ORDER BY r.created_at DESC LIMIT 200')};
}
