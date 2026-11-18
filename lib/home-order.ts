// Заказ уборки на дом. Заказчик — любой вошедший человек: ему подключается роль владельца, а его адрес
// сохраняется частным объектом типа «home» (не публикуется, гостям не виден). Дальше работает готовый
// процесс уборки: предложение исполнителям, отклики, назначение, отчёт, приёмка.
import {DomainError,number,required} from './domain';
import type {RentalService} from './service';
import {q,one,rows,uuid,epoch,type Row} from './operation-core';
import {coordinateDispatch} from './dispatch';
import {coordinate,placeFlatByAddress} from './map-workspace';
import {HOME_TYPE,HOME_MIN_FEE,homeKind,homeRooms,homeWindows,homeAdvice,homeOrderOf,homeMinutes,homeTitle,homeDescription,type HomeDeal} from './home-cleaning';

const TYPE="json_extract(d.details,'$.type')";
// Частные адреса заказчика: по ним второй заказ делается в два нажатия.
export async function homePlaces(service:RentalService):Promise<Row[]>{
 return rows(service.db,`SELECT p.id,p.title,p.city,p.district,p.address,p.rooms FROM properties p JOIN property_details d ON d.property_id=p.id WHERE p.owner_id=? AND p.archived_at IS NULL AND ${TYPE}=? ORDER BY p.created_at DESC LIMIT 10`,service.userId,HOME_TYPE);
}
// Рынок города для совета по цене: заказы на дом за 90 дней, которые исполнитель взял, с их условиями.
export async function homeDeals(service:RentalService,city:string):Promise<HomeDeal[]>{
 const found=await rows(service.db,`SELECT j.fee,j.description FROM cleaning_jobs j JOIN properties p ON p.id=j.property_id JOIN property_details d ON d.property_id=p.id WHERE ${TYPE}=? AND p.city=? AND j.assigned_to IS NOT NULL AND j.status!='cancelled' AND j.created_at>? ORDER BY j.created_at DESC LIMIT 60`,HOME_TYPE,city,epoch()-90*86400);
 return found.flatMap(j=>{const order=homeOrderOf(j.description);return order?[{...order,fee:Number(j.fee)}]:[];});
}
export async function orderHomeCleaning(service:RentalService,body:Row,config:{STADIA_API_KEY?:string}={}){
 const profile=await service.profile();if(!profile)throw new DomainError('Сначала войдите или создайте аккаунт.',403);
 const kind=homeKind(body.kind),windows=homeWindows(body.windows),db=service.db,at=epoch();
 let place=body.propertyId?await one(db,`SELECT p.* FROM properties p JOIN property_details d ON d.property_id=p.id WHERE p.id=? AND p.owner_id=? AND p.archived_at IS NULL AND ${TYPE}=?`,required(body.propertyId,'Адрес',100),service.userId,HOME_TYPE):null;
 if(body.propertyId&&!place)throw new DomainError('Этот адрес недоступен. Укажите адрес заново.',404);
 const rooms=homeRooms(place?body.rooms??place.rooms:body.rooms),order={kind,rooms,windows,wishes:body.wishes};
 if(String(body.wishes||'').length>600)throw new DomainError('Пожелания слишком длинные: до 600 знаков.');
 
 const start=Date.parse(String(body.start));if(!Number.isFinite(start))throw new DomainError('Укажите, когда нужна уборка.');
 const end=new Date(start+homeMinutes(order)*60000).toISOString();
 if(!place){
  const address=required(body.address,'Адрес',300),city=required(body.city??profile.city,'Город',80),district=String(body.district||'').trim().slice(0,120);
  // Тот же адрес второй раз не заводим.
  place=await one(db,`SELECT p.* FROM properties p JOIN property_details d ON d.property_id=p.id WHERE p.owner_id=? AND p.archived_at IS NULL AND ${TYPE}=? AND p.city=? AND p.address=?`,service.userId,HOME_TYPE,city,address);
  if(!place){
   const point=body.longitude!=null&&body.latitude!=null?{lon:coordinate(body.longitude,-180,180),lat:coordinate(body.latitude,-85,85)}:null,propertyId=uuid();
   await db.batch([
    q(db,"UPDATE profiles SET roles=json_insert(roles,'$[#]','owner') WHERE id=? AND NOT EXISTS(SELECT 1 FROM json_each(roles) WHERE value='owner')",service.userId),
    q(db,'INSERT INTO properties(id,owner_id,demo_owner,title,city,district,address,description,price,rooms,capacity,cleaning_minutes,published,created_at) VALUES (?,?,NULL,?,?,?,?,?,0,?,1,?,0,?)',propertyId,service.userId,homeTitle(rooms),city,district,address,'Частный адрес для уборки на дом. Не сдаётся и гостям не виден.',rooms,homeMinutes({kind:'regular',rooms}),at),
    q(db,'INSERT INTO property_details(property_id,details,photos,version,revision,updated_at) VALUES (?,?,?,1,?,?)',propertyId,JSON.stringify({type:HOME_TYPE}),'[]',uuid(),at),
    q(db,'INSERT INTO property_operations(property_id,updated_at) VALUES (?,?)',propertyId,at),
    // Предложение лучшему свободному исполнителю уходит само, назначает заказчик.
    q(db,'INSERT INTO property_policies(property_id,cleaning_budget,revision,updated_at) VALUES (?,1000000,?,?)',propertyId,uuid(),at),
    q(db,'INSERT INTO operation_rules VALUES (?,1,0,1,15,1,?)',propertyId,at),
    ...(point?[q(db,"INSERT INTO property_locations VALUES (?,?,?,'owner',?,1,?)",propertyId,point.lon,point.lat,[city,district,address].join('|'),at)]:[]),
    service.audit(propertyId,'home.created')
   ]);
   place=await one(db,'SELECT * FROM properties WHERE id=?',propertyId);
  }
 }
 // Цену ставит заказчик; без неё берём совет по рынку города.
 const fee=number(body.fee??homeAdvice(order,await homeDeals(service,String(place!.city))).fee,'Цена',HOME_MIN_FEE,1000000);
 // Роль владельца нужна и тому, кто заказывает на сохранённый адрес после смены ролей.
 await q(db,"UPDATE profiles SET roles=json_insert(roles,'$[#]','owner') WHERE id=? AND NOT EXISTS(SELECT 1 FROM json_each(roles) WHERE value='owner')",service.userId).run();
 if(Number(place!.rooms)!==rooms)await q(db,'UPDATE properties SET rooms=?,title=? WHERE id=? AND owner_id=?',rooms,homeTitle(rooms),place!.id,service.userId).run();
 const job=await service.createJob({propertyId:place!.id,start:new Date(start).toISOString(),end,fee,description:homeDescription(order),requestKey:body.requestKey});
 try{await coordinateDispatch(service);}catch{console.error('Home cleaning: the first offer was not sent');}
 // Без своей метки дом встаёт на карту заказчика по адресу; если адрес не нашёлся, заказ всё равно принят.
 try{await placeFlatByAddress(service,'owner',{propertyId:place!.id},fetch,config);}catch{console.error('Home cleaning: the address was not placed on the map');}
 return {id:job.id,propertyId:place!.id,fee,message:'Заказ принят. Ищем исполнителя.'};
}
