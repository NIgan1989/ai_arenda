import {DomainError,required,number,type Role} from './domain';
import type {RentalService} from './service';
import {PUBLISH_REVIEW} from './listing-edit';
import {autoReview} from './admin-autocheck';
import {placeFlatByAddress} from './map-workspace';
import {epoch,uuid,q,one,rows,hash,httpsEndpoint,safeEqual,type Row,type OperationConfig} from './operation-core';
import {leadOf} from './room-units';

export async function securityState(service:RentalService,role:Role,platformAdmin=false){
 const phone=await one(service.db,'SELECT phone,verified_at,sent_at,expires_at FROM phone_verifications WHERE user_id=?',service.userId);
 return {phone:phone?{...phone,phone:phone.phone.replace(/.(?=.{4})/g,'•')}:null,reviews:await rows(service.db,'SELECT * FROM participant_reviews WHERE user_id=? AND role=? ORDER BY created_at DESC LIMIT 30',service.userId,role),pendingReviews:platformAdmin?await rows(service.db,"SELECT r.*,p.name FROM participant_reviews r JOIN profiles p ON p.id=r.user_id WHERE r.status='pending' ORDER BY r.created_at LIMIT 100"):[]};
}
export async function requestPhoneCode(service:RentalService,config:OperationConfig){
 if(!config.SMS_GATEWAY_TOKEN||!config.SMS_GATEWAY_URL)throw new DomainError('Подтверждение телефона ожидает подключения SMS-провайдера.',503);
 let account:Row|null;try{account=await one(service.db,'SELECT phone FROM auth_accounts WHERE id=?',service.userId);}catch{throw new DomainError('Подтверждение номера доступно в веб-аккаунте с номером телефона.',409);}if(!account)throw new DomainError('Аккаунт с номером телефона не найден.',409);
 const current=await one(service.db,'SELECT sent_at FROM phone_verifications WHERE user_id=?',service.userId);if(current&&current.sent_at>epoch()-60)throw new DomainError('Повторный код можно запросить через минуту.',429);
 const code=String(crypto.getRandomValues(new Uint32Array(1))[0]%1000000).padStart(6,'0'),salt=uuid(),digest=await hash(salt+':'+code),at=epoch();
 const r=await q(service.db,'INSERT INTO phone_verifications VALUES (?,?,?,?,0,?,NULL) ON CONFLICT(user_id) DO UPDATE SET phone=excluded.phone,code_hash=excluded.code_hash,expires_at=excluded.expires_at,attempts=0,sent_at=excluded.sent_at,verified_at=NULL WHERE phone_verifications.sent_at<=?',service.userId,account.phone,salt+':'+digest,at+600,at,at-60).run();if(!r.meta.changes)throw new DomainError('Повторный запрос слишком рано.',429);
 try{const response=await fetch(httpsEndpoint(config.SMS_GATEWAY_URL),{method:'POST',headers:{Authorization:'Bearer '+config.SMS_GATEWAY_TOKEN,'Content-Type':'application/json','Idempotency-Key':'otp:'+service.userId+':'+salt},body:JSON.stringify({id:'otp:'+salt,to:account.phone,text:'Код AiQonaq: '+code+'. Не сообщайте его другим. Срок 10 минут.',category:'verification'}),redirect:'manual',signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error('SMS failed');}
 catch{await q(service.db,'UPDATE phone_verifications SET expires_at=? WHERE user_id=? AND code_hash=?',at-1,service.userId,salt+':'+digest).run();throw new DomainError('Провайдер не подтвердил отправку кода. Проверьте подключение.',503);}
 return {message:'Код отправлен на номер вашего аккаунта.',expiresAt:at+600};
}
export async function verifyPhoneCode(service:RentalService,body:Row){
 const code=required(body.code,'Код',6);if(!/^\d{6}$/.test(code))throw new DomainError('Введите шесть цифр.');const row=await one(service.db,'SELECT * FROM phone_verifications WHERE user_id=?',service.userId);
 if(!row||row.expires_at<=epoch()||row.attempts>=5)throw new DomainError('Код истёк или исчерпаны попытки.',409);
 const [salt,expected]=row.code_hash.split(':'),valid=safeEqual(await hash(salt+':'+code),expected),r=await q(service.db,'UPDATE phone_verifications SET attempts=attempts+1,verified_at=CASE WHEN ?=1 THEN ? ELSE verified_at END WHERE user_id=? AND code_hash=? AND expires_at>? AND attempts<5',valid?1:0,epoch(),service.userId,row.code_hash,epoch()).run();if(!r.meta.changes||!valid)throw new DomainError('Код не подходит.');return {message:'Номер телефона подтверждён.'};
}
// A place is approved by a person who looks at the proof of the right to let it (lib/property-rights.ts).
const HANDED='Жильё, документ о праве и удостоверение переданы администратору: он сверит их вручную, обычно в течение дня.';
const HANDED_CLEANER='Анкета и удостоверение переданы администратору: он сверит их вручную, обычно в течение дня.';
export async function requestParticipantReview(service:RentalService,role:Role,body:Row,config:OperationConfig&{PLATFORM_ADMIN_IDS?:string}={}){
 if(role==='guest')throw new DomainError('В этой форме проверяются владельцы и исполнители.',403);
 const reference=required(body.reference,'Основание проверки',500),propertyId=role==='owner'?required(body.propertyId,'Жильё',100):null;
 if(propertyId&&!await service.one('SELECT id FROM properties WHERE id=? AND owner_id=?',propertyId,service.userId))throw new DomainError('Жильё недоступно.',403);
 if(propertyId)await placeQuietly(service,propertyId,config);
 const waiting=await one(service.db,"SELECT id FROM participant_reviews WHERE user_id=? AND role=? AND COALESCE(property_id,'')=COALESCE(?,'') AND status='pending' AND (role<>'owner' OR property_revision=COALESCE((SELECT revision FROM review_property_bindings WHERE property_id=participant_reviews.property_id),0))",service.userId,role,propertyId);
 if(waiting){if(await autoReview(service.db,waiting.id,config)==='approve')return {message:role==='owner'?HANDED:HANDED_CLEANER,verdict:'escalate'};return {message:'Заявка уже ожидает проверки.'};}
 const reviewId=uuid(),at=epoch();await q(service.db,'INSERT INTO participant_reviews(id,user_id,role,property_id,reference,created_at) VALUES (?,?,?,?,?,?)',reviewId,service.userId,role,propertyId,reference,at).run();
 // The AI administrator checks the request at once: it approves when every rule passes, tells the participant
 // what to add, or hands the request to the platform administrators with the reasons.
 const verdict=await autoReview(service.db,reviewId,config);
 if(verdict==='approve')return {message:role==='owner'?HANDED:HANDED_CLEANER,verdict:'escalate'};
 if(verdict==='fix'){const checks=JSON.parse((await one(service.db,'SELECT ai_checks FROM participant_reviews WHERE id=?',reviewId))?.ai_checks||'[]') as Row[];return {message:'Чтобы пройти проверку, осталось: '+checks.filter(c=>c.state==='fix').map(c=>c.note.charAt(0).toLowerCase()+c.note.slice(1)).join('; ')+'.',verdict};}
 return {message:'Заявка на проверку сохранена. Документы и персональные номера в это поле добавлять не нужно.'};
}
export async function decideParticipantReview(service:RentalService,body:Row,platformAdmin:boolean){
 if(!platformAdmin)throw new DomainError('Проверку проводит администратор платформы.',403);
 if(!['approved','rejected'].includes(body.status))throw new DomainError('Выберите результат проверки.');
 const id=required(body.id,'Проверка',100),method=required(body.method,'Способ фактической проверки',150),notes=required(body.notes,'Результат проверки',1000),validUntil=body.validUntil?Math.floor(Date.parse(body.validUntil)/1000):null;if(validUntil!==null&&(!Number.isFinite(validUntil)||validUntil<=epoch()))throw new DomainError('Укажите будущий срок действия проверки.');
 const review=await one(service.db,'SELECT r.*,COALESCE(b.revision,0) current_revision,p.owner_id current_owner FROM participant_reviews r LEFT JOIN review_property_bindings b ON b.property_id=r.property_id LEFT JOIN properties p ON p.id=r.property_id WHERE r.id=?',id);
 if(body.status==='approved'&&review?.role==='owner'&&(review.property_revision!==review.current_revision||review.user_id!==review.current_owner))throw new DomainError('Сведения объекта изменились после заявки. Нужна новая проверка текущего адреса.',409);
if(body.status==='approved'&&review&&['owner','cleaner'].includes(review.role)&&!await one(service.db,'SELECT 1 x FROM identity_docs WHERE user_id=?',review.user_id))throw new DomainError('Участник ещё не приложил фото удостоверения личности. Одобрить можно после проверки удостоверения.',409);
 if(body.status==='approved'&&review?.role==='owner'&&review.property_id&&!await one(service.db,'SELECT 1 x FROM property_right_docs WHERE property_id=?',review.property_id))throw new DomainError('Владелец ещё не приложил документ о праве собственности или нотариальное согласие на субаренду. Одобрить жильё можно после проверки документа.',409);
 const event=uuid(),at=epoch(),result=await service.db.batch([
  q(service.db,"UPDATE participant_reviews SET status=?,method=?,reviewer_id=?,notes=?,reviewed_at=?,valid_until=?,version=version+1 WHERE id=? AND status='pending' AND version=?",body.status,method,service.userId,notes,at,validUntil,id,number(body.expectedVersion,'Версия',1,10000000)),
  q(service.db,'INSERT INTO audit_events SELECT ?,?,?,?,? WHERE changes()>0',event,service.userId,id,'participant.review_'+body.status,at)
 ]);if(!result[0].meta.changes)throw new DomainError('Проверка уже рассмотрена.',409);
 // A flat sent for review from «Показать гостям» goes on the map as soon as it is approved, and the owner hears the result either way.
 if(review?.role==='owner'&&review.property_id){
  const title=(await one(service.db,'SELECT title FROM properties WHERE id=?',review.property_id))?.title||'жильё',wanted=body.show===true||String(review.reference||'').startsWith(PUBLISH_REVIEW);
  let shown=false;
  // The decision is already saved: another platform rule (a phone check, say) may still hold publication back,
  // and then the flat simply stays a draft the owner can show later.
  if(body.status==='approved'&&wanted){try{const r=await service.db.batch([
   q(service.db,"UPDATE properties SET published=1 WHERE id=? AND published=0 AND length(description)>=80 AND EXISTS(SELECT 1 FROM property_details d WHERE d.property_id=properties.id AND json_array_length(d.photos)>0)",review.property_id),
   q(service.db,'UPDATE property_details SET version=version+1 WHERE property_id=? AND changes()>0',review.property_id)]);shown=!!r[0].meta.changes;}catch(e){if(!/pilot_|property_archived/.test(String((e as Error)?.message)))throw e;}}
  // A new flat starts as «Ожидает проверки»; the platform's approval is that check, so the first guest can move in
  // without the owner hunting for a readiness form. A flat in the middle of a cleaning keeps its state.
  if(body.status==='approved')await q(service.db,"UPDATE property_operations SET readiness='ready',version=version+1,updated_at=? WHERE property_id=? AND readiness='inspection' AND active_booking_id IS NULL AND NOT EXISTS(SELECT 1 FROM cleaning_jobs WHERE property_id=? AND status IN ('in_progress','submitted'))",at,review.property_id,review.property_id).run();
  const again=String(review.reference||'').startsWith(ADDRESS_REVIEW),text=body.status==='approved'?'Администратор проверил «'+title+'».'+(again?' Новый адрес подтверждён, гости снова видят жильё.':shown?' Жильё показано гостям на карте.':' Теперь его можно показать гостям.'):'Проверка «'+title+'» не пройдена: '+notes;
  await q(service.db,'INSERT OR IGNORE INTO notifications(id,user_id,body,dedupe,read,created_at) VALUES (?,?,?,?,0,?)',uuid(),review.user_id,text,'owner:review:'+id+':'+body.status,at).run();
 }
 // A cleaner hears the result, and so does every owner whose open cleaning is waiting on this cleaner's response.
 if(review?.role==='cleaner'){
  const ok=body.status==='approved',waiting=await rows(service.db,"SELECT DISTINCT j.owner_id,j.id,p.title FROM applications a JOIN cleaning_jobs j ON j.id=a.job_id JOIN properties p ON p.id=j.property_id WHERE a.user_id=? AND a.status='pending' AND j.status='open' AND j.end>?",review.user_id,at);
  await service.db.batch([
   q(service.db,'INSERT OR IGNORE INTO notifications(id,user_id,body,dedupe,read,created_at) VALUES (?,?,?,?,0,?)',uuid(),review.user_id,ok?'Анкета исполнителя проверена. Владельцы теперь могут назначать вас по откликам.':'Анкета исполнителя не прошла проверку: '+notes,'cleaner:review:'+id+':'+body.status,at),
   ...(ok?waiting.map(job=>q(service.db,'INSERT OR IGNORE INTO notifications(id,user_id,body,dedupe,read,created_at) VALUES (?,?,?,?,0,?)',uuid(),job.owner_id,'Исполнитель, откликнувшийся на уборку «'+(job.title||'жильё')+'», прошёл проверку. Его можно назначить.','owner:cleaner-reviewed:'+id+':'+job.id,at)):[])
  ]);
 }
 return {message:'Результат фактической проверки сохранён.'};
}
// A draft is ready for guests when it has photos and a full description: what the catalogue itself requires.
export const ADDRESS_REVIEW='Проверка нового адреса';
const READY_SQL="length(p.description)>=80 AND COALESCE((SELECT json_array_length(d.photos) FROM property_details d WHERE d.property_id=p.id),0)>0";
const CURRENT_REVISION='COALESCE((SELECT revision FROM review_property_bindings b WHERE b.property_id=r.property_id),0)';
// The owner never has to ask for the check by hand: as soon as a saved draft is ready for guests and the platform
// requires the check, the request goes to the administrator (and the AI administrator) from the server itself,
// whatever app version the owner uses. Approving it shows the flat on the map at once.
// The flat's pin follows its address: a new address (another city, another street) moves the pin by itself,
// so neither the owner nor the review is left with a pin from the old place. A failed search never fails the save.
export async function placeQuietly(service:RentalService,propertyId:string,config:OperationConfig={}){
 try{return await placeFlatByAddress(service,'owner',{propertyId},(url,init)=>globalThis.fetch(url,init),config);}catch{return null;}
}
export async function ensurePublishReview(service:RentalService,propertyId:string,config:OperationConfig&{PLATFORM_ADMIN_IDS?:string}={}){
 await placeQuietly(service,propertyId,config);
 const policy=await one(service.db,"SELECT require_owner_review FROM pilot_policy WHERE id='global'");if(!policy?.require_owner_review)return null;
 const p=await one(service.db,`SELECT p.id,p.title,p.city,p.address,p.published FROM properties p WHERE p.id=? AND p.owner_id=? AND p.demo_owner IS NULL AND p.archived_at IS NULL AND ${READY_SQL}`,propertyId,service.userId);if(!p)return null;
 const known=await one(service.db,`SELECT r.status FROM participant_reviews r WHERE r.property_id=? AND r.user_id=? AND r.role='owner' AND r.property_revision=${CURRENT_REVISION} AND (r.status='pending' OR (r.status='approved' AND (r.valid_until IS NULL OR r.valid_until>?))) LIMIT 1`,propertyId,service.userId,epoch());
 if(known)return null;
 // A shown flat comes here after an address change: the same check, asked for the new address.
 return requestParticipantReview(service,'owner',{propertyId,reference:(p.published?ADDRESS_REVIEW:PUBLISH_REVIEW)+': «'+(p.title||'жильё')+'», '+[p.city,p.address].filter(Boolean).join(', ')},config);
}
// The administrator approves a flat straight from «Недвижимость»: the owner's open request is used when there is one,
// otherwise the check is recorded on the owner's behalf. Approval shows a ready flat to guests at once.
export async function adminApproveProperty(service:RentalService,body:Row){
 const propertyId=required(body.propertyId,'Жильё',100);
 const p=await one(service.db,`SELECT p.id,p.owner_id,p.title,p.city,p.address,p.published,(${READY_SQL}) ready,length(p.description) text_length,COALESCE((SELECT json_array_length(d.photos) FROM property_details d WHERE d.property_id=p.id),0) photos FROM properties p WHERE p.id=? AND p.demo_owner IS NULL AND p.archived_at IS NULL`,propertyId);
 if(!p)throw new DomainError('Жильё не найдено.',404);
 let review=await one(service.db,`SELECT r.id,r.version FROM participant_reviews r WHERE r.property_id=? AND r.user_id=? AND r.role='owner' AND r.status='pending' AND r.property_revision=${CURRENT_REVISION} ORDER BY r.created_at DESC,r.rowid DESC LIMIT 1`,propertyId,p.owner_id);
 if(!review){const id=uuid();await q(service.db,'INSERT INTO participant_reviews(id,user_id,role,property_id,reference,created_at) VALUES (?,?,?,?,?,?)',id,p.owner_id,'owner',propertyId,PUBLISH_REVIEW+': «'+(p.title||'жильё')+'», '+[p.city,p.address].filter(Boolean).join(', '),epoch()).run();review={id,version:1};}
 await decideParticipantReview(service,{id:review.id,status:'approved',show:true,method:'Администратор в разделе «Недвижимость»',notes:String(body.notes||'').trim()||'Объект и владелец проверены администратором.',expectedVersion:review.version},true);
 const shown=(await one(service.db,'SELECT published FROM properties WHERE id=?',propertyId))?.published===1;
 const phoneMissing=!!(await one(service.db,"SELECT 1 FROM pilot_policy WHERE id='global' AND require_phone=1"))&&!await one(service.db,'SELECT 1 FROM phone_verifications WHERE user_id=? AND verified_at IS NOT NULL',p.owner_id);
 const missing=[!p.photos&&'добавить фото',p.text_length<80&&'дописать описание до 80 символов',phoneMissing&&'подтвердить телефон'].filter(Boolean).join(', ');
 return {message:shown||p.published?'«'+p.title+'» одобрено'+(p.published?'':' и показано гостям на карте')+'. Владелец получил уведомление.':'«'+p.title+'» одобрено, владелец получил уведомление. Чтобы показать его гостям, владельцу осталось '+(missing||'включить показ')+', после этого он опубликует его сам.',shown};
}
async function accessKey(config:OperationConfig){if(!config.ACCESS_ENCRYPTION_KEY||config.ACCESS_ENCRYPTION_KEY.length<32)throw new DomainError('Серверное шифрование инструкций ещё не настроено.',503);const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(config.ACCESS_ENCRYPTION_KEY));return crypto.subtle.importKey('raw',bytes,{name:'AES-GCM'},false,['encrypt','decrypt']);}
const base64=(bytes:Uint8Array)=>{let text='';for(const byte of bytes)text+=String.fromCharCode(byte);return btoa(text);};
export async function encryptInstructions(text:string,config:OperationConfig){const key=await accessKey(config),iv=crypto.getRandomValues(new Uint8Array(12)),cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(text)));return 'v1.'+base64(iv)+'.'+base64(cipher);}
export async function decryptInstructions(value:string,config:OperationConfig){const [version,iv,cipher]=value.split('.');if(version!=='v1')throw new DomainError('Формат инструкции не поддержан.',503);const bytes=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));try{return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(iv)},await accessKey(config),bytes(cipher)));}catch{throw new DomainError('Не удалось открыть защищённую инструкцию.',503);}}
export async function savePropertyAccess(service:RentalService,body:Row,config:OperationConfig){
 await service.requireRole('owner');const propertyId=required(body.propertyId,'Жильё',100),version=number(body.expectedVersion??0,'Версия',0,10000000);if(!await service.one('SELECT id FROM properties WHERE id=? AND owner_id=?',propertyId,service.userId))throw new DomainError('Жильё недоступно.',403);
 const ciphertext=await encryptInstructions(required(body.instructions,'Инструкции доступа',2500),config),r=await q(service.db,'INSERT INTO property_access VALUES (?,?,?,?) ON CONFLICT(property_id) DO UPDATE SET ciphertext=excluded.ciphertext,version=excluded.version,updated_at=excluded.updated_at WHERE property_access.version=?',propertyId,ciphertext,version+1,epoch(),version).run();if(!r.meta.changes)throw new DomainError('Инструкция уже изменена.',409);await service.audit(propertyId,'property.access_instructions_updated').run();return {message:'Инструкции зашифрованы. Участники получают их только в разрешённый интервал.'};
}
export async function revealPropertyAccess(service:RentalService,role:Role,body:Row,config:OperationConfig){
 const kind=role==='owner'?'property':role==='cleaner'?'job':'booking',entityId=required(role==='owner'?body.propertyId:body.entityId,'Запись',100);let entity:Row|null,expires:number;
 if(role==='guest'){
  entity=await one(service.db,"SELECT b.*,p.owner_id,t.deposit_status,o.readiness,o.active_booking_id FROM bookings b JOIN properties p ON p.id=b.property_id JOIN booking_terms t ON t.booking_id=b.id JOIN property_operations o ON o.property_id=b.property_id WHERE b.id=? AND b.guest_id=? AND b.status='confirmed' AND b.payment_status='owner_verified' AND t.deposit_status<>'pending' AND t.actual_checkout IS NULL AND b.start<=? AND b.end>? AND (o.readiness='ready' OR o.active_booking_id=b.id AND o.readiness='occupied')",entityId,service.userId,epoch()+3600,epoch());expires=entity?.end||0;
 }else if(role==='cleaner'){
  entity=await one(service.db,"SELECT j.* FROM cleaning_jobs j JOIN property_operations o ON o.property_id=j.property_id WHERE j.id=? AND j.assigned_to=? AND j.status IN ('assigned','in_progress') AND j.start<=? AND j.end>? AND o.active_booking_id IS NULL AND o.readiness NOT IN ('occupied','maintenance','blocked') AND (j.booking_id IS NULL OR EXISTS(SELECT 1 FROM booking_terms WHERE booking_id=j.booking_id AND actual_checkout IS NOT NULL))",entityId,service.userId,epoch()+3600,epoch());expires=entity?.end||0;
 }else{entity=await one(service.db,'SELECT id property_id FROM properties WHERE id=? AND owner_id=?',required(body.propertyId,'Жильё',100),service.userId);expires=epoch()+300;}
 if(!entity)throw new DomainError('Инструкция пока недоступна: проверьте назначение, время, оплату и освобождение жилья.',403);
 // A hotel room booked under a card of rooms alike (lib/room-units.ts) opens with the card's instructions.
 const access=await one(service.db,'SELECT * FROM property_access WHERE property_id=?',await leadOf(service.db,String(entity.property_id)));if(!access)throw new DomainError('Владелец ещё не добавил защищённую инструкцию.',404);
 const instructions=await decryptInstructions(access.ciphertext,config);await q(service.db,'INSERT INTO access_receipts VALUES (?,?,?,?,?,?,?)',uuid(),entity.property_id,kind,entityId,service.userId,epoch(),expires).run();return {instructions,expiresAt:expires,note:'Доступ проверяется при каждом открытии. Код физического замка меняет владелец или интеграция замка.'};
}
