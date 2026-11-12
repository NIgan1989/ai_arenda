import {DomainError,number,required} from './domain';
import type {RentalService} from './service';
import {q,one,rows,uuid,epoch,type Row} from './operation-core';

// After checkout the AI administrator asks the guest to rate the stay, once. A rating needs a
// completed booking of this guest; the text goes only to the owner, the average is public.
export const REVIEW_ASK_AFTER=3600,REVIEW_WINDOW=14*86400;

export async function saveStayReview(s:RentalService,body:Row){
 await s.requireRole('guest');
 const bookingId=required(body.bookingId,'Бронь',100),rating=number(body.rating,'Оценка',1,5),text=String(body.text??'').trim();
 if(text.length>1000)throw new DomainError('Сократите отзыв до 1000 знаков.');
 const b=await one(s.db,"SELECT b.id,b.property_id,b.guest_id,b.status,p.owner_id,p.title,t.actual_checkout FROM bookings b JOIN properties p ON p.id=b.property_id LEFT JOIN booking_terms t ON t.booking_id=b.id WHERE b.id=? AND b.guest_id=?",bookingId,s.userId);
 if(!b)throw new DomainError('Бронь не найдена.',404);
 if(b.status!=='completed'||!b.actual_checkout)throw new DomainError('Оценить проживание можно после выезда.',409);
 if(b.actual_checkout<epoch()-REVIEW_WINDOW)throw new DomainError('Срок для отзыва по этой брони прошёл.',409);
 const t=epoch(),stars='★'.repeat(rating)+'☆'.repeat(5-rating);
 const result=await s.db.batch([
  q(s.db,"INSERT OR IGNORE INTO stay_reviews(booking_id,property_id,guest_id,owner_id,rating,body,created_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM bookings WHERE id=? AND guest_id=? AND status='completed')",b.id,b.property_id,s.userId,b.owner_id,rating,text,t,b.id,s.userId),
  q(s.db,'INSERT OR IGNORE INTO notifications SELECT ?,?,?,?,0,? WHERE changes()>0',uuid(),b.owner_id,'Гость оценил проживание в «'+b.title+'»: '+stars+(text?' «'+text.slice(0,200)+'»':''),'owner:stay-review:'+b.id,t),
  q(s.db,'UPDATE notifications SET read=1 WHERE user_id=? AND dedupe=?',s.userId,'guest:review-request:'+b.id)
 ]);
 if(!result[0].meta.changes)throw new DomainError('Вы уже оценили это проживание.',409);
 return {message:'Спасибо за оценку! Владелец её увидит.'};
}

// Public rating per flat: average and count.
export async function ratingsFor(db:D1Database,ids:string[]){
 if(!ids.length)return new Map<string,Row>();
 // Small lists bind their ids; a large catalog page reads the grouped table once (D1 caps bound parameters).
 const list=ids.length<=90?await rows(db,`SELECT property_id,ROUND(AVG(rating),1) average,COUNT(*) count FROM stay_reviews WHERE property_id IN (${ids.map(()=>'?').join(',')}) GROUP BY property_id`,...ids):await rows(db,'SELECT property_id,ROUND(AVG(rating),1) average,COUNT(*) count FROM stay_reviews GROUP BY property_id');
 return new Map(list.map(r=>[r.property_id,{average:r.average,count:r.count}]));
}

// Called by the owner's coordinator: an hour after checkout the guest is asked once to rate the stay.
export async function askForReviews(s:RentalService){
 const t=epoch();
 const due=await rows(s.db,`SELECT b.id,b.guest_id,p.title FROM bookings b JOIN properties p ON p.id=b.property_id JOIN booking_terms t ON t.booking_id=b.id
  WHERE p.owner_id=? AND b.status='completed' AND t.actual_checkout BETWEEN ? AND ? AND NOT EXISTS(SELECT 1 FROM stay_reviews r WHERE r.booking_id=b.id)
  AND NOT EXISTS(SELECT 1 FROM notifications n WHERE n.user_id=b.guest_id AND n.dedupe='guest:review-request:'||b.id)`,s.userId,t-REVIEW_WINDOW+86400,t-REVIEW_ASK_AFTER);
 for(const b of due)await s.notify(b.guest_id,'AI администратор: как прошло проживание в «'+b.title+'»? Оцените его в карточке брони, это займёт пару секунд.','review-request:'+b.id,'guest').run();
 return due.length;
}
