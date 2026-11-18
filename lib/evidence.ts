import {DomainError,required,type Role} from './domain';
import type {RentalService} from './service';
import {jpegInput} from './listings';
import {epoch,uuid,q,one,rows,type Row,type OperationConfig} from './operation-core';
import {HOME_DAMAGE_WINDOW,DAMAGE_PHOTO_LIMIT} from './home-cleaning';

// The customer's photos of damage (phase damage): while the report waits for acceptance and two days after it.
// They are saved before the complaint is sent (jobs/<id> action damage) so nothing is lost if the app closes.
export async function saveDamagePhoto(service:RentalService,body:Row,config:OperationConfig={}){
 await service.requireRole('owner');const t=epoch(),job=await one(service.db,"SELECT * FROM cleaning_jobs WHERE id=? AND owner_id=? AND assigned_to IS NOT NULL AND assigned_to<>owner_id AND (status='submitted' OR status='completed' AND COALESCE(completed_at,0)>=?)",required(body.jobId,'Задание',100),service.userId,t-HOME_DAMAGE_WINDOW);
 if(!job)throw new DomainError('Фото ущерба можно добавить после отчёта исполнителя и в течение двух суток после приёмки.',409);
 const image=jpegInput(body.data,'property'),id=uuid(),objectKey=config.BUCKET?'job-evidence/'+id+'.jpg':'',note=String(body.note||'').trim();if(note.length>500)throw new DomainError('Слишком длинное описание материала.');
 if(config.BUCKET){const binary=atob(image.data.split(',')[1]),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));await config.BUCKET.put(objectKey,bytes,{httpMetadata:{contentType:'image/jpeg'}});}
 try{const r=await q(service.db,"INSERT INTO job_evidence(id,job_id,user_id,phase,data,object_key,width,height,bytes,note,created_at,mime,duration) SELECT ?,?,?,'damage',?,?,?,?,?,?,?,'image/jpeg',0 WHERE (SELECT COUNT(*) FROM job_evidence WHERE job_id=? AND user_id=?)<? AND EXISTS(SELECT 1 FROM cleaning_jobs WHERE id=? AND owner_id=? AND status IN ('submitted','completed'))",id,job.id,service.userId,objectKey?'':image.data,objectKey,image.width,image.height,image.bytes,note,t,job.id,service.userId,DAMAGE_PHOTO_LIMIT,job.id,service.userId).run();
  if(!r.meta.changes)throw new DomainError('К жалобе можно приложить до '+DAMAGE_PHOTO_LIMIT+' фото.',409);}catch(error){if(objectKey)await config.BUCKET!.delete(objectKey);throw error;}
 return {id,message:'Фото сохранено. Метаданные EXIF удалены.'};
}
export async function saveEvidence(service:RentalService,body:Row,config:OperationConfig={}){
 await service.requireRole('cleaner');const job=await one(service.db,"SELECT * FROM cleaning_jobs WHERE id=? AND assigned_to=? AND status='in_progress'",required(body.jobId,'Задание',100),service.userId);if(!job)throw new DomainError('Фотоотчёт доступен назначенному исполнителю во время работы.',403);
 if(!['before','after','damage'].includes(body.phase))throw new DomainError('Выберите этап фотоотчёта.');
 const video=body.kind==='video',image=video?videoInput(body):{...jpegInput(body.data,'property'),mime:'image/jpeg',duration:0},id=uuid(),objectKey=config.BUCKET?'job-evidence/'+id+(video?'.video':'.jpg'):'',note=String(body.note||'').trim();if(note.length>500)throw new DomainError('Слишком длинное описание материала.');
 if(config.BUCKET){const binary=atob(image.data.split(',')[1]),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));await config.BUCKET.put(objectKey,bytes,{httpMetadata:{contentType:image.mime}});}
 try{const insert=q(service.db,"INSERT INTO job_evidence(id,job_id,user_id,phase,data,object_key,width,height,bytes,note,created_at,mime,duration) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM job_evidence WHERE job_id=?)<24 AND (SELECT COALESCE(SUM(bytes),0) FROM job_evidence WHERE job_id=?)+?<=50331648 AND (?=0 OR (SELECT COUNT(*) FROM job_evidence WHERE job_id=? AND mime LIKE 'video/%')<6) AND EXISTS(SELECT 1 FROM cleaning_jobs WHERE id=? AND assigned_to=? AND status='in_progress' AND version=?)",id,job.id,service.userId,body.phase,objectKey||video?'':image.data,objectKey,image.width,image.height,image.bytes,note,epoch(),image.mime,image.duration,job.id,job.id,image.bytes,video?1:0,job.id,job.id,service.userId,job.version);
 const statements=[insert];if(video&&!objectKey){const encoded=image.data.split(',')[1];for(let i=0;i<encoded.length;i+=262144)statements.push(q(service.db,'INSERT INTO evidence_video_chunks SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM job_evidence WHERE id=?)',id,i/262144,encoded.slice(i,i+262144),id));}const results=await service.db.batch(statements);if(!results[0].meta.changes)throw new DomainError('Задание изменилось или достигнут лимит: 24 материала, 6 видео, 48 МБ на уборку.',409);}catch(error){if(objectKey)await config.BUCKET!.delete(objectKey);throw error;}
 return {id,message:video?'Видео сохранено в отчёте.':'Фото сохранено в отчёте. Метаданные EXIF удалены.'};
}
export async function listEvidence(service:RentalService,role:Role,jobId:string){
 if(role==='guest')throw new DomainError('Фотоотчёт недоступен гостю.',403);
 if(!await one(service.db,`SELECT id FROM cleaning_jobs WHERE id=? AND ${role==='owner'?'owner_id':'assigned_to'}=?`,jobId,service.userId))throw new DomainError('Отчёт недоступен.',403);
 // mine: who added it. The customer's damage photos and the performer's report photos are shown apart.
 return rows(service.db,'SELECT id,job_id,phase,note,width,height,created_at,mime,duration,bytes,user_id=? mine FROM job_evidence WHERE job_id=? ORDER BY created_at',service.userId,jobId);
}
export async function readEvidence(service:RentalService,role:Role,id:string,config:OperationConfig={}){
 if(role==='guest')throw new DomainError('Фотография недоступна.',403);
 const photo=await one(service.db,`SELECT e.* FROM job_evidence e JOIN cleaning_jobs j ON j.id=e.job_id WHERE e.id=? AND ${role==='owner'?'j.owner_id':'j.assigned_to'}=?`,id,service.userId);if(!photo)throw new DomainError('Фотография недоступна.',404);
 if(photo.object_key){const object=await config.BUCKET?.get(photo.object_key);if(!object)throw new DomainError('Хранилище фото сейчас недоступно.',503);const bytes=new Uint8Array(await object.arrayBuffer());let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return {data:'data:'+photo.mime+';base64,'+btoa(binary)};}
 if(photo.mime.startsWith('video/')){const chunks=await rows(service.db,'SELECT data FROM evidence_video_chunks WHERE evidence_id=? ORDER BY part',id);if(!chunks.length)throw new DomainError('Видео недоступно.',503);return {data:'data:'+photo.mime+';base64,'+chunks.map(c=>c.data).join('')};}
 return {data:photo.data};
}
export async function requireEvidence(service:RentalService,jobId:string){
 const rule=await one(service.db,'SELECT r.require_photos FROM operation_rules r JOIN cleaning_jobs j ON j.property_id=r.property_id WHERE j.id=?',jobId);if(!rule?.require_photos)return;
 const phases=await rows(service.db,"SELECT phase,COUNT(*) n FROM job_evidence WHERE job_id=? AND mime='image/jpeg' GROUP BY phase",jobId);
 if(!phases.some(p=>p.phase==='before')||!phases.some(p=>p.phase==='after'))throw new DomainError('По правилам жилья нужны фото до и после уборки.',409);
}

function videoInput(body:Row){
 const match=typeof body.data==='string'&&body.data.match(/^data:(video\/(?:mp4|webm|quicktime));base64,([A-Za-z0-9+/]+={0,2})$/);if(!match||match[2].length>11184812)throw new DomainError('Выберите MP4, MOV или WebM до 8 МБ.');
 let binary='';try{binary=atob(match[2]);}catch{throw new DomainError('Повреждённый видеофайл.');}if(binary.length<16||binary.length>8388608)throw new DomainError('Выберите видео до 8 МБ.');
 const webm=[0x1a,0x45,0xdf,0xa3].every((v,i)=>binary.charCodeAt(i)===v),mp4=binary.slice(4,8)==='ftyp';if(match[1]==='video/webm'?!webm:!mp4)throw new DomainError('Формат видео не соответствует файлу.');
 const width=Number(body.width),height=Number(body.height),duration=Number(body.duration);if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>7680||height>7680||!Number.isFinite(duration)||duration<=0||duration>60)throw new DomainError('Выберите короткое видео до 60 секунд.');
 return {data:body.data,mime:match[1],width,height,duration,bytes:binary.length};
}
