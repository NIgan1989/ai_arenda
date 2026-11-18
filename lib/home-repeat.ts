// Повтор уборки на дом по расписанию (этап 4, 2026-11-18). Заказчик один раз выбирает, как часто убирать, и
// следующий заказ появляется сам за три дня до даты: с теми же условиями, ценой и временем, что у последнего.
// Отменённая уборка считается пропуском: повтор идёт дальше от неё, а не заказывает её заново.
// Расписание хранится в частных сведениях дома (property_details.details, ключ repeat), отдельной таблицы нет.
import {DomainError,required} from './domain';
import type {RentalService} from './service';
import {q,one,rows,epoch,type Row} from './operation-core';
import {HOME_TYPE,HOME_FREE_CANCEL,homeOrderOf,tenge} from './home-cleaning';

import {REPEAT_DAYS,REPEAT_AHEAD,nextRepeat,repeatLabel} from './home-repeat-text';
export {REPEAT_DAYS,REPEAT_AHEAD,nextRepeat,repeatLabel};
const when=(t:number)=>new Date(t*1000).toLocaleString('ru-RU',{timeZone:'Asia/Almaty',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'});
const TYPE="json_extract(d.details,'$.type')";
const last=(service:RentalService,propertyId:string)=>one(service.db,"SELECT * FROM cleaning_jobs WHERE property_id=? AND booking_id IS NULL AND description LIKE 'Уборка на дом:%' ORDER BY start DESC LIMIT 1",propertyId);

export async function saveHomeRepeat(service:RentalService,body:Row){
 await service.requireRole('owner');
 const every=Number(body.every),db=service.db,at=epoch();
 if(every!==0&&!REPEAT_DAYS.includes(every as 7))throw new DomainError('Выберите, как часто повторять уборку.');
 const place=await one(db,`SELECT p.id,p.title FROM properties p JOIN property_details d ON d.property_id=p.id WHERE p.id=? AND p.owner_id=? AND p.archived_at IS NULL AND ${TYPE}=?`,required(body.propertyId,'Адрес',100),service.userId,HOME_TYPE);
 if(!place)throw new DomainError('Этот адрес недоступен.',404);
 const job=await last(service,place.id);
 if(every&&!job)throw new DomainError('Сначала закажите первую уборку: повтор возьмёт её условия, цену и время.',409);
 await db.batch([
  every?q(db,"UPDATE property_details SET details=json_set(details,'$.repeat',json_object('every',?,'since',?)),updated_at=? WHERE property_id=?",every,at,at,place.id)
   :q(db,"UPDATE property_details SET details=json_remove(details,'$.repeat'),updated_at=? WHERE property_id=?",at,place.id),
  service.audit(place.id,'home.repeat:'+every)]);
 if(!every)return {message:'Повтор выключен. Уже заказанные уборки остаются.',next:null};
 const next=nextRepeat(job!.start,every,at);
 return {message:repeatLabel(every)+': следующая уборка '+when(next)+' за '+tenge(Number(job!.fee))+'. Заказ появится сам за три дня, отменить его можно бесплатно до '+when(next-HOME_FREE_CANCEL)+'.',next};
}

// Вызывается при каждой проверке ИИ-администратора по владельцу: заказывает очередную уборку, когда до неё три дня.
export async function repeatHomeCleanings(service:RentalService,at=epoch()){
 const homes=await rows(service.db,`SELECT p.id,p.title,json_extract(d.details,'$.repeat.every') every FROM properties p JOIN property_details d ON d.property_id=p.id WHERE p.owner_id=? AND p.archived_at IS NULL AND ${TYPE}=? AND json_extract(d.details,'$.repeat.every') IS NOT NULL`,service.userId,HOME_TYPE);
 let made=0;
 for(const home of homes){
  const every=Number(home.every),job=await last(service,home.id);
  if(!REPEAT_DAYS.includes(every as 7)||!job||!homeOrderOf(job.description))continue;
  // Пока впереди есть действующая уборка, новую не заказываем.
  if(job.start>at&&job.status!=='cancelled')continue;
  const next=nextRepeat(job.start,every,at);
  if(next-at>REPEAT_AHEAD)continue;
  try{
   const created=await service.createJob({propertyId:home.id,start:new Date(next*1000).toISOString(),end:new Date((next+Number(job.end)-Number(job.start))*1000).toISOString(),fee:job.fee,description:job.description,requestKey:'repeat:'+home.id+':'+next});
   await service.notify(service.userId,'ИИ-администратор: по расписанию заказана уборка «'+home.title+'» на '+when(next)+' за '+tenge(Number(job.fee))+'. Отменить бесплатно можно до '+when(next-HOME_FREE_CANCEL)+'.','home-repeat:'+created.id,'owner').run();
   made++;
  }catch(error){if(!(error instanceof DomainError))throw error;}
 }
 return made;
}
