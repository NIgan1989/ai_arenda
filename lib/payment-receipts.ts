import {DomainError,required,type Role} from './domain';
import type {RentalService} from './service';
import {jpegInput} from './listings';
import {epoch,uuid,q,one,rows,type Row,type OperationConfig} from './operation-core';

// Direct settlements: the service does not see a transfer between two people in their bank. The payer may attach
// the bank receipt (a screenshot from Kaspi) next to «Я оплатил»: the guest for a booking, the customer for a cleaning.
// The receiver sees it in the same card; the service administrator sees it when the sides argue.
export const RECEIPT_LIMIT=3;
type Deal={kind:'booking'|'job';id:string;payer:string;receiver:string|null;open:boolean};

async function dealOf(s:RentalService,body:Row):Promise<Deal>{
 if(body.jobId){
  const j=await one(s.db,'SELECT id,owner_id,assigned_to,status,payment_received_at FROM cleaning_jobs WHERE id=?',required(body.jobId,'Уборка',100));
  if(!j)throw new DomainError('Уборка не найдена.',404);
  return {kind:'job',id:j.id,payer:j.owner_id,receiver:j.assigned_to||null,open:j.status==='completed'&&!j.payment_received_at};
 }
 const b=await one(s.db,'SELECT b.id,b.guest_id,b.status,b.payment_status,p.owner_id FROM bookings b JOIN properties p ON p.id=b.property_id WHERE b.id=?',required(body.bookingId,'Бронь',100));
 if(!b)throw new DomainError('Бронь не найдена.',404);
 return {kind:'booking',id:b.id,payer:b.guest_id,receiver:b.owner_id,open:b.status==='confirmed'};
}
const column=(d:Deal)=>d.kind==='job'?'job_id':'booking_id';

export async function saveReceipt(s:RentalService,role:Role,body:Row,config:OperationConfig={}){
 const d=await dealOf(s,body);
 if(d.payer!==s.userId||role!==(d.kind==='job'?'owner':'guest'))throw new DomainError(s.userId===d.receiver?'Чек прикладывает тот, кто платит.':d.kind==='job'?'Уборка не найдена.':'Бронь не найдена.',s.userId===d.receiver?403:404);
 if(!d.open)throw new DomainError(d.kind==='job'?'Чек можно приложить после принятой уборки, пока исполнитель не подтвердил оплату.':'Чек можно приложить к подтверждённой брони.',409);
 const image=jpegInput(body.data,'property'),receiptId=uuid(),key=config.BUCKET?'payment-receipts/'+receiptId+'.jpg':'',c=column(d);
 if(key){const binary=atob(image.data.split(',')[1]);await config.BUCKET!.put(key,Uint8Array.from(binary,ch=>ch.charCodeAt(0)),{httpMetadata:{contentType:'image/jpeg'}});}
 const r=await q(s.db,`INSERT INTO payment_receipts(id,${c},user_id,data,object_key,width,height,bytes,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM payment_receipts WHERE ${c}=?)<?`,
  receiptId,d.id,s.userId,key?'':image.data,key,image.width,image.height,image.bytes,epoch(),d.id,RECEIPT_LIMIT).run();
 if(!r.meta.changes){if(key)await config.BUCKET!.delete(key).catch(()=>{});throw new DomainError('Приложено максимум чеков: '+RECEIPT_LIMIT+'.',409);}
 return {id:receiptId,message:d.kind==='job'?'Чек приложен. Его увидит исполнитель.':'Чек приложен. Его увидит владелец.'};
}

export async function listReceipts(s:RentalService,kind:string,dealId:string,platformAdmin=false){
 const d=await dealOf(s,kind==='job'?{jobId:dealId}:{bookingId:dealId});
 if(!platformAdmin&&s.userId!==d.payer&&s.userId!==d.receiver)throw new DomainError(d.kind==='job'?'Уборка не найдена.':'Бронь не найдена.',404);
 return {receipts:await rows(s.db,`SELECT id,width,height,created_at FROM payment_receipts WHERE ${column(d)}=? ORDER BY created_at,id`,d.id)};
}

export async function readReceipt(s:RentalService,receiptId:string,config:OperationConfig={},platformAdmin=false){
 const r=await one(s.db,'SELECT * FROM payment_receipts WHERE id=?',receiptId);
 if(!r)throw new DomainError('Чек недоступен.',404);
 const d=await dealOf(s,r.job_id?{jobId:r.job_id}:{bookingId:r.booking_id});
 if(!platformAdmin&&s.userId!==d.payer&&s.userId!==d.receiver)throw new DomainError('Чек недоступен.',404);
 if(!r.object_key)return {data:r.data};
 const object=await config.BUCKET?.get(r.object_key);if(!object)throw new DomainError('Хранилище фото сейчас недоступно.',503);
 const bytes=new Uint8Array(await object.arrayBuffer());let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
 return {data:'data:image/jpeg;base64,'+btoa(binary)};
}
