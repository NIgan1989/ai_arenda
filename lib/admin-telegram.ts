import {DomainError} from './domain';
import {isPlatformAdmin} from './account';
import {decideParticipantReview} from './participant-security';
import type {RentalService} from './service';
import {one,hash,type Row,type OperationConfig} from './operation-core';

// The platform administrator's notices in Telegram. They are the AI administrator's own words (what it
// checked and why it asks), so the text goes out as written, with «Одобрить» and «Отклонить» on a review.
// Buttons carry the review id and a tag of its version: a decided or changed request is never decided twice.
export const isAdminNotice=(dedupe:string)=>dedupe.startsWith('admin:');
const tagOf=async(review:Row)=>(await hash(review.id+':'+review.version)).slice(0,10);
export async function adminNotice(db:D1Database,item:Row,base:string|null):Promise<Row>{
 const open=base?[{text:'Открыть админку',url:base+'/admin?section=reviews'}]:[];
 const text=String(item.body||'Новое событие для администратора.').slice(0,3500);
 const reviewId=String(item.dedupe).startsWith('admin:review:')?String(item.dedupe).split(':')[2]:'';
 const review=reviewId?await one(db,"SELECT id,version FROM participant_reviews WHERE id=? AND status='pending'",reviewId):null;
 if(!review)return {text,...(open.length?{reply_markup:{inline_keyboard:[open]}}:{})};
 const tag=await tagOf(review);
 return {text,reply_markup:{inline_keyboard:[[{text:'Одобрить',callback_data:'ya'+review.id+'|'+tag},{text:'Отклонить',callback_data:'na'+review.id+'|'+tag}],...(open.length?[open]:[])]}};
}
// One tap from Telegram. Only a chat linked to a platform administrator's account can decide.
export async function adminDecide(db:D1Database,chatId:string,yes:boolean,reviewId:string,tag:string,config:OperationConfig&{PLATFORM_ADMIN_IDS?:string},serviceFor:(id:string)=>RentalService):Promise<{text:string;done:boolean}>{
 const channel=await one(db,"SELECT user_id FROM delivery_channels WHERE channel='telegram' AND address=? AND verified_at IS NOT NULL ORDER BY verified_at DESC LIMIT 1",chatId);
 if(!channel||!isPlatformAdmin(channel.user_id,config.PLATFORM_ADMIN_IDS))return {text:'Решать заявки может только администратор платформы.',done:false};
 const review=await one(db,"SELECT * FROM participant_reviews WHERE id=?",reviewId);
 if(!review||review.status!=='pending')return {text:'Заявка уже решена.',done:true};
 if(await tagOf(review)!==tag)return {text:'Заявка изменилась. Откройте админку и проверьте её.',done:true};
 let checks:Row[]=[];try{checks=JSON.parse(review.ai_checks||'[]');}catch{/* no checks */}
 const doubts=checks.filter(c=>c.state!=='ok').map(c=>c.note);
 try{
  await decideParticipantReview(serviceFor(channel.user_id),{id:review.id,status:yes?'approved':'rejected',expectedVersion:review.version,method:'Администратор в Telegram по проверке ИИ',
   notes:yes?(doubts.length?'Проверено вручную: '+doubts.join('; '):'Проверено администратором'):(doubts.length?doubts.join('. '):'Заявка отклонена администратором'),
   validUntil:yes&&review.role==='cleaner'?new Date(Date.now()+180*86400000).toISOString():undefined},true);
  return {text:yes?'Одобрено. Участник получил уведомление.':'Отклонено. Участник получил причину.',done:true};
 }catch(e){if(e instanceof DomainError)return {text:e.message,done:true};throw e;}
}
