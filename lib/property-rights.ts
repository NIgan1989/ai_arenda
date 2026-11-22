import {DomainError,required,type Role} from './domain';
import type {RentalService} from './service';
import {jpegInput} from './listings';
import {epoch,uuid,q,one,rows,type Row,type OperationConfig} from './operation-core';
import {autoReview} from './admin-autocheck';
import {dropPrivatePhotos,sweepPrivatePhotos} from './private-photos';
const drop=(db:D1Database,bucket:R2Bucket|undefined,keys:string[])=>dropPrivatePhotos(db,bucket,'property_right_docs',keys);
export const RIGHTS_PREFIX='property-rights/';
// The hourly sweep of the documents' photos (lib/private-photos.ts).
export const sweepRightObjects=(db:D1Database,bucket:R2Bucket|undefined,cursor='')=>sweepPrivatePhotos(db,bucket,'property_right_docs',RIGHTS_PREFIX,cursor);

// «Право сдавать жильё»: before a place is shown to guests its owner proves the right to let it, and a person
// at the platform looks at the proof (the AI administrator never approves a place by itself, lib/admin-autocheck.ts).
// The proof is a photo of a document: the title (выписка из ЕГРН/eGov, договор купли-продажи, свидетельство) for the owner
// of the home, or for one who lets a home they rent themselves the lease with the owner's consent to sublet,
// notarised. The photos are seen only by the owner and the platform administrators.
export const RIGHT_KINDS={owner:'Я собственник',sublease:'Сдаю в субаренду'} as const;
export type RightKind=keyof typeof RIGHT_KINDS;
export const RIGHT_DOCS:Record<RightKind,string>={
 owner:'документ о праве собственности: выписка из eGov, договор купли-продажи или свидетельство',
 sublease:'договор аренды и нотариально заверенное согласие собственника на сдачу в субаренду',
};
export const RIGHT_LIMIT=4;
// «Жильё проверено»: a person at the platform approved the place by its proof (the guest sees the mark on the card).
// `id` is a trusted column expression naming the place's id, such as p.id or d.property_id.
export const verifiedPlaceSql=(id='p.id')=>{if(!/^[a-zA-Z][a-zA-Z0-9_]*\.[a-zA-Z_]+$/.test(id))throw new Error('Invalid column');return `(EXISTS(SELECT 1 FROM property_right_docs rd WHERE rd.property_id=${id} AND rd.checked_at IS NOT NULL) AND EXISTS(SELECT 1 FROM pilot_property_admissions pa WHERE pa.id=${id} AND pa.owner_reviewed=1))`;};
// Once a person approved the place the photos are deleted: only the record of the check stays (kind, who, when).
// The pointer stays until the storage confirmed the delete; the hourly sweep retries a failed one.
export async function settleRightDocs(db:D1Database,propertyId:string,reviewerId:string,config:OperationConfig={}){
 const keys=(await rows(db,"SELECT object_key FROM property_right_docs WHERE property_id=? AND checked_at IS NULL AND object_key<>''",propertyId)).map(r=>String(r.object_key));
 await q(db,"UPDATE property_right_docs SET data='',checked_at=?,checked_by=? WHERE property_id=? AND checked_at IS NULL",epoch(),reviewerId,propertyId).run();
 return drop(db,config.BUCKET,keys);
}

async function ownPlace(s:RentalService,propertyId:string){
 const p=await one(s.db,'SELECT id,owner_id,title,demo_owner FROM properties WHERE id=?',required(propertyId,'Жильё',100));
 if(!p||p.owner_id!==s.userId)throw new DomainError('Жильё не найдено.',404);
 return p;
}
// Whether the place has its proof, and of which kind: what the review and the owner's card read.
export async function rightsOf(db:D1Database,propertyId:string){
 const r=await one(db,'SELECT kind,COUNT(*) n FROM property_right_docs WHERE property_id=? GROUP BY kind ORDER BY MAX(created_at) DESC LIMIT 1',propertyId);
 return r?{kind:r.kind as RightKind,count:Number(r.n)}:null;
}
// Settled once a person at the platform approved the place: the proof then stays as it was checked.
const approved=(db:D1Database,propertyId:string)=>one(db,"SELECT 1 x FROM pilot_property_admissions WHERE id=? AND owner_reviewed=1",propertyId);

export async function saveRightDoc(s:RentalService,role:Role,body:Row,config:OperationConfig&{PLATFORM_ADMIN_IDS?:string}={}){
 if(role!=='owner')throw new DomainError('Документ прикладывает владелец жилья.',403);
 const p=await ownPlace(s,body.propertyId),kind=String(body.kind) as RightKind;
 if(!(kind in RIGHT_KINDS))throw new DomainError('Выберите: вы собственник или сдаёте в субаренду.');
 if(await approved(s.db,p.id))throw new DomainError('Жильё уже проверено. Чтобы заменить документ, напишите администратору.',409);
 const image=jpegInput(body.data,'property'),docId=uuid(),key=config.BUCKET?'property-rights/'+docId+'.jpg':'';
 if(key){const binary=atob(image.data.split(',')[1]);await config.BUCKET!.put(key,Uint8Array.from(binary,ch=>ch.charCodeAt(0)),{httpMetadata:{contentType:'image/jpeg'}});}
 // One kind per place: choosing the other kind starts the proof over, and the replaced photos leave the storage too.
 const replaced=(await rows(s.db,"SELECT object_key FROM property_right_docs WHERE property_id=? AND kind<>? AND object_key<>''",p.id,kind)).map(d=>String(d.object_key));
 const r=await s.db.batch([
  q(s.db,'DELETE FROM property_right_docs WHERE property_id=? AND kind<>?',p.id,kind),
  q(s.db,'INSERT INTO property_right_docs(id,property_id,owner_id,kind,data,object_key,width,height,bytes,created_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM property_right_docs WHERE property_id=?)<?',
   docId,p.id,s.userId,kind,key?'':image.data,key,image.width,image.height,image.bytes,epoch(),p.id,RIGHT_LIMIT),
 ]);
 await drop(s.db,config.BUCKET,replaced);
 if(!r[1].meta.changes){if(key)await drop(s.db,config.BUCKET,[key]);throw new DomainError('Приложено максимум фото документа: '+RIGHT_LIMIT+'.',409);}
 // A waiting review is checked again at once, so the platform administrators hear the place is ready for their look.
 const waiting=await one(s.db,"SELECT id FROM participant_reviews WHERE property_id=? AND user_id=? AND role='owner' AND status='pending' ORDER BY created_at DESC LIMIT 1",p.id,s.userId);
 if(waiting)await autoReview(s.db,waiting.id,config);
 return {id:docId,message:'Фото документа приложено. Его увидит только администратор сервиса.'};
}
export async function removeRightDoc(s:RentalService,role:Role,body:Row,config:OperationConfig={}){
 if(role!=='owner')throw new DomainError('Документ убирает владелец жилья.',403);
 const d=await one(s.db,'SELECT d.* FROM property_right_docs d JOIN properties p ON p.id=d.property_id WHERE d.id=? AND p.owner_id=?',required(body.id,'Документ',100),s.userId);
 if(!d)throw new DomainError('Документ не найден.',404);
 if(await approved(s.db,d.property_id))throw new DomainError('Жильё уже проверено. Чтобы заменить документ, напишите администратору.',409);
 await q(s.db,'DELETE FROM property_right_docs WHERE id=?',d.id).run();
 if(d.object_key)await drop(s.db,config.BUCKET,[String(d.object_key)]);
 return {message:'Фото убрано.'};
}
export async function listRightDocs(s:RentalService,propertyId:string,platformAdmin=false){
 const p=await one(s.db,'SELECT id,owner_id FROM properties WHERE id=?',required(propertyId,'Жильё',100));
 if(!p||(!platformAdmin&&p.owner_id!==s.userId))throw new DomainError('Жильё не найдено.',404);
 const docs=await rows(s.db,'SELECT id,kind,width,height,created_at,checked_at FROM property_right_docs WHERE property_id=? ORDER BY created_at,id',p.id);
 // The administrator compares the name on the document with the profile and with the Kaspi recipient guests pay.
 const names=platformAdmin?await one(s.db,'SELECT u.name,d.recipient,d.pending_recipient FROM profiles u LEFT JOIN payout_details d ON d.user_id=u.id WHERE u.id=?',p.owner_id):null;
 return {docs,kinds:RIGHT_KINDS,need:RIGHT_DOCS,...(names?{names:{profile:names.name||'',recipient:names.recipient||'',pendingRecipient:names.pending_recipient||''}}:{})};
}
export async function readRightDoc(s:RentalService,docId:string,config:OperationConfig={},platformAdmin=false){
 const d=await one(s.db,'SELECT d.*,p.owner_id place_owner FROM property_right_docs d JOIN properties p ON p.id=d.property_id WHERE d.id=?',docId);
 if(!d||(!platformAdmin&&d.place_owner!==s.userId))throw new DomainError('Документ недоступен.',404);
 if(d.checked_at)throw new DomainError('Фото документа удалено после проверки.',410);
 if(!d.object_key)return {data:d.data};
 const object=await config.BUCKET?.get(d.object_key);if(!object)throw new DomainError('Хранилище фото сейчас недоступно.',503);
 const bytes=new Uint8Array(await object.arrayBuffer());let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
 return {data:'data:image/jpeg;base64,'+btoa(binary)};
}
