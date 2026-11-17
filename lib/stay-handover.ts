import {DomainError,required,type Role} from './domain';
import type {RentalService} from './service';
import {jpegInput} from './listings';
import {epoch,uuid,q,one,rows,type Row,type OperationConfig} from './operation-core';
import {wordsOf,isHome,venueOr,TYPE_SQL} from './stay-words';
import {HANDOVER_ISSUES,HANDOVER_WINDOW,STAY_PHOTO_LIMIT,handoverIssueText,type HandoverIssue} from './stay-handover-text';
export {HANDOVER_ISSUES,HANDOVER_WINDOW,STAY_PHOTO_LIMIT,handoverIssueText,handoverState,type HandoverIssue} from './stay-handover-text';

// «Как гость оставил жильё?»: after checkout the owner hands the home over in one tap, «Всё хорошо» or what was wrong,
// with photos. The guest may photograph the home right after moving in, so damage that was already there is not put
// on them. Stage 1 of the guest reliability concept: the handover is seen only by this owner and this guest; it does
// not reach other owners or the reliability rating yet.

type Stay=Row&{id:string;guest_id:string;owner_id:string;status:string;title:string;property_type?:string|null};
async function stayOf(s:RentalService,bookingId:string):Promise<Stay>{
 const b=await one(s.db,`SELECT b.id,b.guest_id,b.status,b.property_id,p.owner_id,p.title,${TYPE_SQL},t.actual_checkin,t.checkin_reported_at,t.actual_checkout,
  EXISTS(SELECT 1 FROM stay_handovers h WHERE h.booking_id=b.id) handed
  FROM bookings b JOIN properties p ON p.id=b.property_id LEFT JOIN booking_terms t ON t.booking_id=b.id WHERE b.id=?`,bookingId);
 if(!b||(b.guest_id!==s.userId&&b.owner_id!==s.userId))throw new DomainError('Бронь не найдена.',404);
 return b as Stay;
}
// The guest photographs the home from the moment they say they moved in until the checkout.
const guestMayShoot=(b:Row)=>b.guest_id&&b.status==='confirmed'&&!!(b.actual_checkin||b.checkin_reported_at)&&!b.actual_checkout;
// The owner hands the home over once, within two days of the checkout.
const ownerMayHand=(b:Row,t:number)=>b.status==='completed'&&!!b.actual_checkout&&b.actual_checkout>t-HANDOVER_WINDOW&&!Number(b.handed);

export async function saveStayPhoto(s:RentalService,role:Role,body:Row,config:OperationConfig={}){
 if(role!=='guest'&&role!=='owner')throw new DomainError('Фото добавляют гость или владелец.',403);
 const b=await stayOf(s,required(body.bookingId,'Бронь',100)),t=epoch();
 const phase=role==='guest'?'checkin':'handover';
 if(role==='guest'&&(b.guest_id!==s.userId||!guestMayShoot(b)))throw new DomainError(venueOr(b,'Фото при заселении можно добавить, когда вы заселились, и до выезда.','Фото можно добавить, когда вы на месте, и пока бронь не закончилась.'),409);
 if(role==='owner'&&(b.owner_id!==s.userId||!ownerMayHand(b,t)))throw new DomainError('Фото к приёмке можно добавить в течение двух суток '+wordsOf(b).afterLeave+', пока приёмка не отмечена.',409);
 const image=jpegInput(body.data,'property'),photoId=uuid(),key=config.BUCKET?'stay-photos/'+photoId+'.jpg':'';
 if(key){const binary=atob(image.data.split(',')[1]);await config.BUCKET!.put(key,Uint8Array.from(binary,c=>c.charCodeAt(0)),{httpMetadata:{contentType:'image/jpeg'}});}
 const r=await q(s.db,'INSERT INTO stay_photos(id,booking_id,user_id,phase,data,object_key,width,height,bytes,created_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM stay_photos WHERE booking_id=? AND phase=?)<?',
  photoId,b.id,s.userId,phase,key?'':image.data,key,image.width,image.height,image.bytes,t,b.id,phase,STAY_PHOTO_LIMIT).run();
 if(!r.meta.changes){if(key)await config.BUCKET!.delete(key).catch(()=>{});throw new DomainError('Добавлено максимум фото: '+STAY_PHOTO_LIMIT+'.',409);}
 return {id:photoId,message:role==='guest'?'Фото сохранено. Его видите только вы и владелец.':'Фото добавлено к приёмке.'};
}

export async function listStayPhotos(s:RentalService,bookingId:string){
 const b=await stayOf(s,bookingId);
 return {photos:await rows(s.db,'SELECT id,phase,width,height,created_at FROM stay_photos WHERE booking_id=? ORDER BY created_at,id',b.id)};
}

export async function readStayPhoto(s:RentalService,photoId:string,config:OperationConfig={}){
 const photo=await one(s.db,'SELECT f.* FROM stay_photos f JOIN bookings b ON b.id=f.booking_id JOIN properties p ON p.id=b.property_id WHERE f.id=? AND (b.guest_id=? OR p.owner_id=?)',photoId,s.userId,s.userId);
 if(!photo)throw new DomainError('Фотография недоступна.',404);
 if(!photo.object_key)return {data:photo.data};
 const object=await config.BUCKET?.get(photo.object_key);if(!object)throw new DomainError('Хранилище фото сейчас недоступно.',503);
 const bytes=new Uint8Array(await object.arrayBuffer());let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
 return {data:'data:image/jpeg;base64,'+btoa(binary)};
}

export async function saveHandover(s:RentalService,body:Row){
 await s.requireRole('owner');
 const b=await stayOf(s,required(body.bookingId,'Бронь',100)),t=epoch();
 if(b.owner_id!==s.userId)throw new DomainError('Приёмку отмечает владелец.',403);
 if(Number(b.handed))throw new DomainError('Приёмка по этой брони уже отмечена.',409);
 if(!ownerMayHand(b,t))throw new DomainError(venueOr(b,'Отметить приёмку можно в течение двух суток после выезда гостя.','Отметить приёмку можно в течение двух суток '+wordsOf(b).afterLeave+'.'),409);
 const verdict=body.verdict==='issues'?'issues':body.verdict==='ok'?'ok':null;if(!verdict)throw new DomainError('Выберите: всё хорошо или есть замечания.');
 const raw=Array.isArray(body.issues)?body.issues:[];
 if(raw.length>Object.keys(HANDOVER_ISSUES).length||raw.some((code:unknown)=>!Object.hasOwn(HANDOVER_ISSUES,String(code))))throw new DomainError('Неизвестное замечание.');
 const issues=[...new Set(raw.map(String))] as HandoverIssue[];
 if(verdict==='issues'&&!issues.length)throw new DomainError('Отметьте, что было не так.');
 const note=String(body.note??'').trim();if(note.length>500)throw new DomainError('Сократите пояснение до 500 знаков.');
 // Without a description or a photo a complaint is only a word against a word: the second needs one or the other.
 const photos=Number((await one(s.db,"SELECT COUNT(*) n FROM stay_photos WHERE booking_id=? AND phase='handover'",b.id))?.n||0);
 const cleaner=Number((await one(s.db,"SELECT COUNT(*) n FROM job_evidence e JOIN cleaning_jobs j ON j.id=e.job_id WHERE j.booking_id=? AND e.phase IN ('before','damage')",b.id))?.n||0);
 if(verdict==='issues'&&!note&&!photos&&!cleaner)throw new DomainError('Добавьте фото или коротко опишите замечание: так его поймёт гость.');
 const list=verdict==='ok'?'':issues.map(code=>handoverIssueText(code,!isHome(b))).join(', ').toLowerCase();
 const guestText=verdict==='ok'?venueOr(b,'Владелец принял «'+b.title+'»: замечаний нет. Спасибо, что бережно отнеслись к жилью!','Владелец принял «'+b.title+'»: замечаний нет. Спасибо!'):venueOr(b,'После вашего выезда из «','По брони «')+b.title+'» владелец отметил: '+list+(note?'. «'+note+'»':'')+'. Если не согласны, нажмите «Есть проблема» в карточке брони.';
 const result=await s.db.batch([
  q(s.db,"INSERT OR IGNORE INTO stay_handovers(booking_id,property_id,owner_id,guest_id,verdict,issues,note,cleaner_photos,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM bookings WHERE id=? AND status='completed')",b.id,b.property_id,s.userId,b.guest_id,verdict,JSON.stringify(verdict==='ok'?[]:issues),verdict==='ok'?'':note,cleaner,t,b.id),
  q(s.db,'INSERT OR IGNORE INTO notifications SELECT ?,?,?,?,0,? WHERE changes()>0',uuid(),b.guest_id,guestText,'guest:handover:'+b.id,t),
  q(s.db,'UPDATE notifications SET read=1 WHERE user_id=? AND dedupe=?',s.userId,'owner:handover-ask:'+b.id),
  q(s.db,'INSERT INTO audit_events SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM stay_handovers WHERE booking_id=? AND created_at=?)',uuid(),s.userId,b.id,'booking.handover:'+verdict,t,b.id,t)
 ]);
 if(!result[0].meta.changes)throw new DomainError('Приёмка по этой брони уже отмечена.',409);
 return {message:verdict==='ok'?'Приёмка отмечена: всё хорошо. Гость получил спасибо.':'Замечания сохранены и переданы гостю.'};
}
