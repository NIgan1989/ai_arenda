import {DomainError} from './domain';
import {epoch,uuid,q,one,rows,hash,type Row,type OperationConfig} from './operation-core';
import {decideParticipantReview} from './participant-security';
import type {RentalService} from './service';

// The AI administrator's check of a participant review. Every rule is plain and visible to the platform
// administrator: when all of them pass the AI approves by itself, when the participant only has to add
// something (photos, a description, a map point, a name or a photo) the request stays open and the
// participant hears what to add, and anything doubtful (a duplicate address, an odd price, contacts in
// the text, an earlier refusal, an open complaint) waits for the administrator with the reasons.

export type CheckState='ok'|'fix'|'risk';
export type ReviewCheck={key:string;label:string;state:CheckState;note:string};
export type Verdict='approve'|'fix'|'escalate';
export const AI_REVIEWER='ai-administrator';
export const AI_METHOD='ИИ-администратор: проверка по правилам';
export const MIN_PHOTOS=3,MIN_DESCRIPTION=80,PRICE_LOW=0.4,PRICE_HIGH=2.5,HISTORY=180*86400,CLEANER_VALID=180*86400,RECHECK=600;

const CONTACT=/(?:\+?[78])[\s\-()]*\d{3}[\s\-()]*\d{3}[\s\-]*\d{2}[\s\-]*\d{2}|https?:\/\/|www\.|t\.me\/|wa\.me|whatsapp|ватсап|вотсап|телеграм|telegram|инстаграм|instagram/i;
const DIRECT_PAY=/перевод(ом)? на карту|переведите|оплат[аиу] напрямую|предоплат|kaspi\s*(gold|перевод)|каспи\s*(голд|перевод)/i;
export function hasContacts(text:string){return CONTACT.test(text)||DIRECT_PAY.test(text);}
const STREET_WORDS=new Set(['ул','улица','пр','проспект','мкр','микрорайон','д','дом','г','город']);
export function normalAddress(city:string,address:string){
 const clean=(s:string)=>s.toLowerCase().replace(/ё/g,'е').split(/[^a-zа-я0-9]+/).filter(w=>w&&!STREET_WORDS.has(w)).join(' ');
 return clean(city)+'|'+clean(address);
}
const median=(n:number[])=>{const s=[...n].sort((a,b)=>a-b),m=s.length>>1;return s.length?(s.length%2?s[m]:(s[m-1]+s[m])/2):0;};
const money=(n:number)=>Math.round(n).toLocaleString('ru-RU').replace(/ /g,' ')+' ₸';

export type FlatFacts={description:string;title:string;photos:number;mapped:boolean;price:number;comparable:number[];duplicateAddress:boolean;rejectedBefore:number;openComplaints:number};
// Pure: the rules for an owner and the flat they want to show guests.
export function flatChecks(f:FlatFacts):ReviewCheck[]{
 const checks:ReviewCheck[]=[];
 const len=f.description.trim().length;
 checks.push({key:'description',label:'Описание',state:len>=MIN_DESCRIPTION?'ok':'fix',note:len>=MIN_DESCRIPTION?'Описание есть':'Описание короче '+MIN_DESCRIPTION+' знаков, допишите пару предложений о квартире'});
 checks.push({key:'photos',label:'Фото',state:f.photos>=MIN_PHOTOS?'ok':'fix',note:f.photos>=MIN_PHOTOS?'Фото: '+f.photos:'Фото: '+f.photos+', нужно не меньше '+MIN_PHOTOS});
 checks.push({key:'map',label:'Точка на карте',state:f.mapped?'ok':'fix',note:f.mapped?'Точка на карте есть':'Поставьте точку квартиры на карте'});
 if(f.comparable.length>=3){const m=median(f.comparable),ratio=f.price/m,odd=ratio<PRICE_LOW||ratio>PRICE_HIGH;
  checks.push({key:'price',label:'Цена',state:odd?'risk':'ok',note:(odd?'Цена '+money(f.price)+' сильно '+(ratio<1?'ниже':'выше')+' обычной в городе':'Цена '+money(f.price)+' в пределах рынка')+' (обычно '+money(m)+')'});}
 else checks.push({key:'price',label:'Цена',state:f.price>0?'ok':'risk',note:f.price>0?'Цена указана, сравнить пока не с чем':'Цена не указана'});
 checks.push({key:'address',label:'Адрес',state:f.duplicateAddress?'risk':'ok',note:f.duplicateAddress?'Такой же адрес уже у квартиры другого владельца':'Адрес не повторяется'});
 const contacts=hasContacts(f.title+' '+f.description);
 checks.push({key:'contacts',label:'Текст',state:contacts?'risk':'ok',note:contacts?'В тексте телефон, ссылка или просьба оплатить напрямую':'Нет контактов и оплаты мимо сервиса'});
 checks.push({key:'history',label:'История владельца',state:f.rejectedBefore||f.openComplaints?'risk':'ok',note:f.rejectedBefore?'Раньше проверка уже не проходила':f.openComplaints?'Открытые жалобы гостей: '+f.openComplaints:'Отказов и жалоб нет'});
 return checks;
}
export type CleanerFacts={name:string;avatar:boolean;rejectedBefore:number;openComplaints:number};
// Pure: the rules for a cleaner. Every assignment is still agreed by the flat's owner.
export function cleanerChecks(f:CleanerFacts):ReviewCheck[]{
 const named=f.name.trim().replace(/[^A-Za-zА-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі]/g,'').length>=2&&!/^(гость|пользователь|user|guest|исполнитель)$/i.test(f.name.trim());
 return [
  {key:'name',label:'Имя',state:named?'ok':'fix',note:named?'Имя указано':'Укажите настоящее имя в профиле'},
  {key:'avatar',label:'Фото профиля',state:f.avatar?'ok':'fix',note:f.avatar?'Фото профиля есть':'Добавьте фото профиля, чтобы владелец узнал вас у двери'},
  {key:'history',label:'История',state:f.rejectedBefore||f.openComplaints?'risk':'ok',note:f.rejectedBefore?'Раньше проверка уже не проходила':f.openComplaints?'Открытые жалобы владельцев: '+f.openComplaints:'Отказов и жалоб нет'}
 ];
}
export function verdictOf(checks:ReviewCheck[]):Verdict{return checks.some(c=>c.state==='risk')?'escalate':checks.some(c=>c.state==='fix')?'fix':'approve';}
export function checksSummary(checks:ReviewCheck[],states:CheckState[]){return checks.filter(c=>states.includes(c.state)).map(c=>c.note).join('; ');}

async function flatFacts(db:D1Database,review:Row):Promise<FlatFacts|null>{
 const p=await one(db,'SELECT p.*,COALESCE(json_array_length(d.photos),0) photos,EXISTS(SELECT 1 FROM property_locations l WHERE l.property_id=p.id) mapped FROM properties p LEFT JOIN property_details d ON d.property_id=p.id WHERE p.id=?',review.property_id);
 if(!p)return null;
 let comparable=(await rows(db,'SELECT price FROM properties WHERE city=? AND rooms=? AND published=1 AND demo_owner IS NULL AND archived_at IS NULL AND id<>? AND price>0 LIMIT 200',p.city,p.rooms,p.id)).map(r=>r.price);
 if(comparable.length<3)comparable=(await rows(db,'SELECT price FROM properties WHERE city=? AND published=1 AND demo_owner IS NULL AND archived_at IS NULL AND id<>? AND price>0 LIMIT 200',p.city,p.id)).map(r=>r.price);
 const mine=normalAddress(p.city,p.address),others=await rows(db,'SELECT city,address FROM properties WHERE owner_id<>? AND demo_owner IS NULL AND archived_at IS NULL AND city=? LIMIT 2000',p.owner_id,p.city);
 const history=await one(db,"SELECT (SELECT COUNT(*) FROM participant_reviews WHERE user_id=? AND role='owner' AND status='rejected' AND reviewed_at>?) rejected,(SELECT COUNT(*) FROM administrator_issues WHERE owner_id=? AND opened_role='guest' AND status<>'resolved') complaints",p.owner_id,epoch()-HISTORY,p.owner_id);
 return {description:p.description||'',title:p.title||'',photos:p.photos,mapped:!!p.mapped,price:p.price,comparable,duplicateAddress:others.some(o=>normalAddress(o.city,o.address)===mine),rejectedBefore:history?.rejected||0,openComplaints:history?.complaints||0};
}
async function cleanerFacts(db:D1Database,review:Row):Promise<CleanerFacts|null>{
 const p=await one(db,"SELECT p.name,d.avatar_id,(SELECT COUNT(*) FROM participant_reviews r WHERE r.user_id=p.id AND r.role='cleaner' AND r.status='rejected' AND r.reviewed_at>?) rejected,(SELECT COUNT(*) FROM administrator_issues i WHERE i.other_user=p.id AND i.other_role='cleaner' AND i.status<>'resolved') complaints FROM profiles p LEFT JOIN profile_details d ON d.user_id=p.id WHERE p.id=?",epoch()-HISTORY,review.user_id);
 return p?{name:p.name||'',avatar:!!p.avatar_id,rejectedBefore:p.rejected||0,openComplaints:p.complaints||0}:null;
}
export async function reviewChecks(db:D1Database,review:Row):Promise<ReviewCheck[]|null>{
 if(review.role==='owner'&&review.property_id){const f=await flatFacts(db,review);return f&&flatChecks(f);}
 if(review.role==='cleaner'){const f=await cleanerFacts(db,review);return f&&cleanerChecks(f);}
 return null;
}
const admins=(config:{PLATFORM_ADMIN_IDS?:string})=>typeof config.PLATFORM_ADMIN_IDS==='string'?config.PLATFORM_ADMIN_IDS.split(',').map(v=>v.trim()).filter(Boolean):[];
const note=(db:D1Database,user:string,body:string,dedupe:string,at:number)=>q(db,'INSERT OR IGNORE INTO notifications(id,user_id,body,dedupe,read,created_at) VALUES (?,?,?,?,0,?)',uuid(),user,body,dedupe,at);

// Checks one pending review and acts on it. Safe to repeat: decisions are versioned and notices are deduplicated.
export async function autoReview(db:D1Database,reviewId:string,config:OperationConfig&{PLATFORM_ADMIN_IDS?:string}={}):Promise<Verdict|null>{
 const review=await one(db,"SELECT r.*,p.title,u.name FROM participant_reviews r LEFT JOIN properties p ON p.id=r.property_id LEFT JOIN profiles u ON u.id=r.user_id WHERE r.id=? AND r.status='pending'",reviewId);
 if(!review)return null;
 const checks=await reviewChecks(db,review);if(!checks)return null;
 const verdict=verdictOf(checks),at=epoch(),policy=await one(db,"SELECT ai_review FROM pilot_policy WHERE id='global'"),auto=!!(policy?.ai_review??1);
 await q(db,"UPDATE participant_reviews SET ai_verdict=?,ai_checks=?,ai_checked_at=? WHERE id=? AND status='pending'",verdict,JSON.stringify(checks),at,reviewId).run();
 const what=review.role==='owner'?'Квартира «'+(review.title||'без названия')+'»':'Анкета исполнителя «'+(review.name||'без имени')+'»';
 if(auto&&verdict==='approve'){
  try{await decideParticipantReview({db,userId:AI_REVIEWER} as unknown as RentalService,{id:reviewId,status:'approved',method:AI_METHOD,notes:'Все правила пройдены: '+checksSummary(checks,['ok']),validUntil:review.role==='cleaner'?new Date((at+CLEANER_VALID)*1000).toISOString():undefined,expectedVersion:review.version},true);return verdict;}
  catch(e){if(!(e instanceof DomainError))throw e;
   // The request no longer matches the flat (address changed) or was decided meanwhile: never leave it hidden.
   checks.push({key:'stale',label:'Заявка',state:'risk',note:e.message});
   await q(db,"UPDATE participant_reviews SET ai_verdict='escalate',ai_checks=? WHERE id=? AND status='pending'",JSON.stringify(checks),reviewId).run();
   const list=admins(config);if(list.length)await db.batch(list.map(admin=>note(db,admin,what+' ждёт проверки. ИИ не смог одобрить: '+e.message+' Админка → Проверки.','admin:review:'+reviewId+':'+admin,at)));
   return 'escalate';
  }
 }
 if(auto&&verdict==='fix'){
  const missing=checks.filter(c=>c.state==='fix'),tag=(await hash(missing.map(c=>c.key).join(','))).slice(0,8);
  await note(db,review.user_id,'Чтобы пройти проверку, осталось: '+missing.map(c=>c.note.charAt(0).toLowerCase()+c.note.slice(1)).join('; ')+'. ИИ-администратор проверит снова сам.',review.role+':review-fix:'+reviewId+':'+tag,at).run();
  return verdict;
 }
 const list=admins(config);if(list.length){
  const reason=verdict==='escalate'?'ИИ просит вашего решения: '+checksSummary(checks,['risk']):verdict==='fix'?'Не хватает: '+checksSummary(checks,['fix']):'Правила пройдены, решение за вами.';
  await db.batch(list.map(admin=>note(db,admin,what+' ждёт проверки. '+reason+'. Админка → Проверки.','admin:review:'+reviewId+':'+admin,at)));
 }
 return verdict;
}
// Scheduler sweep: new requests nobody checked yet and requests waiting on the participant to add something.
export async function sweepReviews(db:D1Database,config:OperationConfig&{PLATFORM_ADMIN_IDS?:string}={}){
 const pending=await rows(db,"SELECT id FROM participant_reviews WHERE status='pending' AND role IN ('owner','cleaner') AND (ai_checked_at IS NULL OR (ai_verdict='fix' AND ai_checked_at<? AND created_at>?)) ORDER BY created_at LIMIT 20",epoch()-RECHECK,epoch()-14*86400);
 const result:Record<string,number>={approve:0,fix:0,escalate:0};
 for(const r of pending){const v=await autoReview(db,r.id,config);if(v)result[v]++;}
 return result;
}
