import {DomainError,required} from './domain';
import type {RentalService} from './service';
import {jpegInput} from './listings';
import {epoch,uuid,q,one,rows,type Row,type OperationConfig} from './operation-core';

// «Удостоверение личности»: every participant (guest, owner, performer) attaches a photo of the ID card once, in the
// profile. A person at the platform compares it with the profile; for an owner also with the document of the right to
// let (lib/property-rights.ts) and the Kaspi recipient. Then the photo is deleted and only the record stays.
// - A guest sends a booking request only with the ID attached; the check itself runs in the background.
// - An owner's place and a performer's admission are approved only with the ID attached.
// The photos are seen only by the participant and the platform administrators.
export const IDENTITY_LIMIT=2; // the front and the back
export const IDENTITY_NEED='Приложите фото удостоверения личности в профиле («Профиль» → «Удостоверение личности»). Его видит только администратор сервиса, после проверки фото удаляется.';

export type IdentityState={attached:number;checked:boolean};
export async function identityOf(db:D1Database,userId:string):Promise<IdentityState>{
 const r=await one(db,'SELECT COUNT(*) n,MAX(checked_at) checked FROM identity_docs WHERE user_id=?',userId);
 return {attached:Number(r?.n)||0,checked:!!r?.checked};
}
/** Throws the participant's own words when no ID is attached yet. */
export async function requireIdentity(db:D1Database,userId:string,what=IDENTITY_NEED){
 if(!(await identityOf(db,userId)).attached)throw new DomainError(what,409);
}

export async function saveIdentityDoc(s:RentalService,body:Row,config:OperationConfig={}){
 if(!await s.profile())throw new DomainError('Сначала заполните профиль.',403);
 if((await identityOf(s.db,s.userId)).checked)throw new DomainError('Личность уже подтверждена. Чтобы заменить удостоверение, напишите в поддержку.',409);
 const image=jpegInput(body.data,'property'),docId=uuid(),key=config.BUCKET?'identity/'+docId+'.jpg':'';
 if(key){const binary=atob(image.data.split(',')[1]);await config.BUCKET!.put(key,Uint8Array.from(binary,ch=>ch.charCodeAt(0)),{httpMetadata:{contentType:'image/jpeg'}});}
 const r=await q(s.db,'INSERT INTO identity_docs(id,user_id,data,object_key,width,height,bytes,created_at) SELECT ?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM identity_docs WHERE user_id=?)<?',
  docId,s.userId,key?'':image.data,key,image.width,image.height,image.bytes,epoch(),s.userId,IDENTITY_LIMIT).run();
 if(!r.meta.changes){if(key)await dropObjects(s.db,config.BUCKET,[key]);throw new DomainError('Приложено максимум фото: '+IDENTITY_LIMIT+' (лицевая и обратная сторона).',409);}
 return {id:docId,message:'Фото удостоверения приложено. Его увидит только администратор сервиса, после проверки фото удалится.'};
}
export async function removeIdentityDoc(s:RentalService,body:Row,config:OperationConfig={}){
 const d=await one(s.db,'SELECT * FROM identity_docs WHERE id=? AND user_id=?',required(body.id,'Фото',100),s.userId);
 if(!d)throw new DomainError('Фото не найдено.',404);
 if(d.checked_at)throw new DomainError('Личность уже подтверждена. Чтобы заменить удостоверение, напишите в поддержку.',409);
 await q(s.db,'DELETE FROM identity_docs WHERE id=?',d.id).run();
 // If the storage refuses now, the object has no row any more and the hourly sweep removes it (sweepIdentityObjects).
 if(d.object_key)await dropObjects(s.db,config.BUCKET,[String(d.object_key)]);
 return {message:'Фото убрано.'};
}
export async function listIdentityDocs(s:RentalService,userId:string,platformAdmin=false){
 const user=platformAdmin?required(userId||s.userId,'Участник',100):s.userId;
 const docs=await rows(s.db,'SELECT id,width,height,created_at,checked_at FROM identity_docs WHERE user_id=? ORDER BY created_at,id',user);
 // The administrator compares the name on the ID with the profile and with the Kaspi recipient guests or the owner pay.
 const names=platformAdmin?await one(s.db,'SELECT u.name,u.roles,d.recipient,d.pending_recipient FROM profiles u LEFT JOIN payout_details d ON d.user_id=u.id WHERE u.id=?',user):null;
 return {docs,checked:docs.some(d=>d.checked_at),...(names?{names:{profile:names.name||'',roles:JSON.parse(names.roles||'[]'),recipient:names.recipient||'',pendingRecipient:names.pending_recipient||''}}:{})};
}
export async function readIdentityDoc(s:RentalService,docId:string,config:OperationConfig={},platformAdmin=false){
 const d=await one(s.db,'SELECT * FROM identity_docs WHERE id=?',required(docId,'Фото',100));
 if(!d||(!platformAdmin&&d.user_id!==s.userId))throw new DomainError('Фото недоступно.',404);
 if(d.checked_at)throw new DomainError('Фото удостоверения удалено после проверки.',410);
 if(!d.object_key)return {data:d.data};
 const object=await config.BUCKET?.get(d.object_key);if(!object)throw new DomainError('Хранилище фото сейчас недоступно.',503);
 const bytes=new Uint8Array(await object.arrayBuffer());let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
 return {data:'data:image/jpeg;base64,'+btoa(binary)};
}
// After a person checked the ID the photos are deleted; only the record of the check stays.
// The pointer to a stored photo is cleared only after the storage confirmed the delete: a failed delete leaves the
// pointer, and the hourly sweep tries again. Returns how many photos are still waiting to be deleted.
export async function settleIdentity(db:D1Database,userId:string,reviewerId:string,config:OperationConfig={}){
 const keys=(await rows(db,"SELECT object_key FROM identity_docs WHERE user_id=? AND checked_at IS NULL AND object_key<>''",userId)).map(r=>String(r.object_key));
 await q(db,"UPDATE identity_docs SET data='',checked_at=?,checked_by=? WHERE user_id=? AND checked_at IS NULL",epoch(),reviewerId,userId).run();
 return dropObjects(db,config.BUCKET,keys);
}
// Deletes stored ID photos one by one. A checked photo loses its pointer only when its delete succeeded.
async function dropObjects(db:D1Database,bucket:R2Bucket|undefined,keys:string[]){
 let left=0;
 for(const key of keys){
  if(!bucket){left++;continue;}
  try{await bucket.delete(key);await q(db,"UPDATE identity_docs SET object_key='' WHERE object_key=? AND checked_at IS NOT NULL",key).run();}
  catch{left++;console.error('Identity photo delete failed; the sweep will retry');}
 }
 return left;
}
export const IDENTITY_PREFIX='identity/';
// Hourly: (1) photos of checked IDs whose delete failed are deleted again; (2) stored photos that no row waits for
// any more (a refused or removed photo whose delete failed, an upload whose row was never written) are deleted.
// A photo is written a moment before its row, so an object younger than an hour without a row is left alone.
// Walks the bucket in pages and keeps its place in the job payload, like the flat photos (lib/media-store.ts).
export async function sweepIdentityObjects(db:D1Database,bucket:R2Bucket|undefined,cursor=''){
 if(!bucket)return {configured:false,cursor:'',removed:0,left:0};
 const stuck=(await rows(db,"SELECT object_key FROM identity_docs WHERE checked_at IS NOT NULL AND object_key<>'' LIMIT 50")).map(r=>String(r.object_key));
 let left=await dropObjects(db,bucket,stuck),removed=stuck.length-left;
 const listed=await bucket.list({prefix:IDENTITY_PREFIX,limit:90,...(cursor?{cursor}:{})}),keys=listed.objects.map(o=>o.key);
 if(keys.length){
  const waiting=new Set((await rows(db,`SELECT object_key FROM identity_docs WHERE checked_at IS NULL AND object_key IN (${keys.map(()=>'?').join(',')})`,...keys)).map(r=>String(r.object_key)));
  const checked=new Set((await rows(db,`SELECT object_key FROM identity_docs WHERE checked_at IS NOT NULL AND object_key IN (${keys.map(()=>'?').join(',')})`,...keys)).map(r=>String(r.object_key)));
  const gone=listed.objects.filter(o=>!waiting.has(o.key)&&!stuck.includes(o.key)&&(checked.has(o.key)||Date.now()-o.uploaded.getTime()>3600000)).map(o=>o.key);
  const l=await dropObjects(db,bucket,gone);left+=l;removed+=gone.length-l;
 }
 return {configured:true,removed,left,cursor:listed.truncated?listed.cursor:''};
}
// The administrator's queue: participants whose ID waits for a look, oldest first.
export async function identityQueue(db:D1Database){
 return rows(db,"SELECT d.user_id,u.name,u.roles,COUNT(*) photos,MIN(d.created_at) since FROM identity_docs d JOIN profiles u ON u.id=d.user_id WHERE d.checked_at IS NULL AND NOT EXISTS(SELECT 1 FROM identity_docs c WHERE c.user_id=d.user_id AND c.checked_at IS NOT NULL) GROUP BY d.user_id ORDER BY since LIMIT 100");
}
/** The administrator confirms the ID (the photos are deleted) or turns it down (the photos are deleted, the person is told why). */
export async function decideIdentity(s:RentalService,body:Row,config:OperationConfig={}){
 const userId=required(body.userId,'Участник',100),state=await identityOf(s.db,userId);
 if(!state.attached)throw new DomainError('Участник ещё не приложил удостоверение.',409);
 if(state.checked)return {message:'Личность уже подтверждена.'};
 const t=epoch(),note=(text:string,key:string)=>q(s.db,'INSERT OR IGNORE INTO notifications(id,user_id,body,dedupe,read,created_at) VALUES (?,?,?,?,0,?)',uuid(),userId,text,key,t);
 if(body.action==='confirm'){
  if(body.namesMatch!==true)throw new DomainError('Отметьте, что ФИО и фото в удостоверении совпадают с профилем.');
  const left=await settleIdentity(s.db,userId,s.userId,config);
  await s.db.batch([note(left?'Администратор подтвердил вашу личность. Фото удостоверения больше никому не показывается и будет удалено из хранилища в течение часа.':'Администратор подтвердил вашу личность. Фото удостоверения удалено.','identity:checked:'+userId),q(s.db,'INSERT INTO audit_events VALUES (?,?,?,?,?)',uuid(),s.userId,userId,'identity.checked',t)]);
  return {message:left?'Личность подтверждена. Хранилище не ответило, фото удалится автоматически в течение часа.':'Личность подтверждена, фото удалено.'};
 }
 if(body.action==='reject'){
  const reason=required(body.reason,'Причина',500),keys=(await rows(s.db,"SELECT object_key FROM identity_docs WHERE user_id=? AND checked_at IS NULL AND object_key<>''",userId)).map(r=>String(r.object_key));
  await s.db.batch([q(s.db,'DELETE FROM identity_docs WHERE user_id=? AND checked_at IS NULL',userId),note('Удостоверение не принято: '+reason+' Приложите фото заново в профиле.','identity:rejected:'+userId+':'+t),q(s.db,'INSERT INTO audit_events VALUES (?,?,?,?,?)',uuid(),s.userId,userId,JSON.stringify({action:'identity.rejected',reason}),t)]);
  // The rows are gone; a photo the storage did not delete now is removed by the hourly sweep.
  await dropObjects(s.db,config.BUCKET,keys);
  return {message:'Удостоверение не принято, участник получил причину.'};
 }
 throw new DomainError('Выберите: подтвердить или отклонить.');
}
