import {DomainError,required} from './domain';
import type {RentalService} from './service';
import {epoch,uuid,q,one,rows,type Row} from './operation-core';
import {similarMedian,PRICE_COOLDOWN} from './price-advice';

// The week ahead. Once a week (Monday from 09:00 in Almaty, or the first check after it) the AI
// administrator looks at the owner's city: how full the evenings usually are on each weekday over
// the last four weeks, and what is already booked. It names the busy and the empty days in one
// message and, when one of the owner's flats is free on those days, suggests one change: a higher
// price before busy days, or a shorter minimum stay (or a lower price) before a quiet week.
// Nothing changes until the owner presses the button.

import {weekSummary,adviceSentence,dayList,type ForecastDay,type ForecastLevel} from './forecast-text';
export {weekSummary,adviceSentence};
export type {ForecastDay,ForecastLevel};
export type ForecastFlat={id:string;title:string;price:number;hourly:number;nightly:number;minHours:number;minimumRate:number;median:number|null;free:boolean[];priceLocked?:boolean};
export type ForecastAdvice={advice:'none'|'raise'|'lower'|'min_hours';propertyId:string|null;title:string;from:number;to:number;fromHourly:number;toHourly:number;fromNightly:number;toNightly:number;percent:number;reasons:string[]};

const DAY=86400,HOUR=3600,ZONE=5*HOUR,EVENING=21*HOUR,HISTORY_WEEKS=4;
export const FORECAST_START_HOUR=9;
const names=['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];
const money=(n:number)=>new Intl.NumberFormat('ru-RU').format(n)+' ₸';
const round=(n:number,step:number)=>Math.max(step,Math.round(n/step)*step);

// Midnight in Almaty for the day of `t`, and Monday midnight of its week.
export const localDay=(t:number)=>Math.floor((t+ZONE)/DAY)*DAY-ZONE;
export function weekStart(t:number){const day=localDay(t),weekday=new Date((day+ZONE)*1000).getUTCDay();return day-((weekday+6)%7)*DAY;}

type Stay={property_id:string;start:number;end:number};
const occupied=(stays:Stay[],point:number)=>new Set(stays.filter(s=>s.start<=point&&s.end>point).map(s=>s.property_id)).size;

// Pure: the expected evening load of the city for seven days from `from` (a local midnight).
// Each day takes the larger of two numbers: the share already booked, and the usual share on the
// same weekday over the last four weeks. Bookings only grow, so the larger one is the better guess.
export function forecastWeek(stays:Stay[],flats:number,from:number):ForecastDay[]{
 const total=Math.max(1,flats);
 return Array.from({length:7},(_,i)=>{
  const day=from+i*DAY,point=day+EVENING,booked=occupied(stays,point);
  let past=0;for(let w=1;w<=HISTORY_WEEKS;w++)past+=occupied(stays,point-w*7*DAY);
  const load=Math.min(1,Math.max(booked,past/HISTORY_WEEKS)/total),local=new Date((day+ZONE)*1000);
  return {day,label:names[local.getUTCDay()],date:local.getUTCDate(),load:Math.round(load*100),booked:Math.round(Math.min(1,booked/total)*100),level:load>=0.7?'busy':load<=0.3?'quiet':'normal'};
 });
}

// Pure: one change for one flat, or none. A higher price comes first (busy days the flat is free on),
// then a shorter minimum stay for hourly flats, and a lower price only when the flat costs more than similar ones.
export function adviseWeek(days:ForecastDay[],flats:ForecastFlat[]):ForecastAdvice{
 const none:ForecastAdvice={advice:'none',propertyId:null,title:'',from:0,to:0,fromHourly:0,toHourly:0,fromNightly:0,toNightly:0,percent:0,reasons:[]};
 const count=(f:ForecastFlat,level:ForecastLevel)=>days.filter((d,i)=>d.level===level&&f.free[i]).length;
 const scale=(rate:number,from:number,to:number,step:number,floor:number)=>!rate?0:to>from?Math.max(rate,round(rate*to/from,step)):Math.min(rate,Math.max(floor,round(rate*to/from,step)));
 const priced=(f:ForecastFlat,to:number,advice:'raise'|'lower',reasons:string[]):ForecastAdvice=>({advice,propertyId:f.id,title:f.title,from:f.price,to,fromHourly:f.hourly,toHourly:scale(f.hourly,f.price,to,100,f.minimumRate),fromNightly:f.nightly,toNightly:scale(f.nightly,f.price,to,500,f.minimumRate),percent:Math.round(Math.abs(to-f.price)/f.price*100),reasons});
 const busyDays=days.filter(d=>d.level==='busy');
 const hot=flats.filter(f=>!f.priceLocked&&f.price>=100&&count(f,'busy')>=2&&(f.median===null||f.price<f.median*1.2)).sort((a,b)=>count(b,'busy')-count(a,'busy'));
 for(const f of hot){
  const free=count(f,'busy'),percent=free>=3?15:10;
  let to=round(f.price*(1+percent/100),500);if(f.median!==null)to=Math.min(to,round(f.median*1.25,500));
  if(to<=f.price||(to-f.price)/f.price<0.03)continue;
  return priced(f,to,'raise',[dayList(busyDays)+': в городе занято '+Math.max(...busyDays.map(d=>d.load))+'% вечеров','Квартира свободна в '+free+(free>=5?' дней':' дня')+' из них',...(f.median!==null?['Похожие квартиры: ~'+money(f.median)]:[])]);
 }
 const quietDays=days.filter(d=>d.level==='quiet');
 if(busyDays.length===0||quietDays.length>=4){
  const quiet=flats.filter(f=>count(f,'quiet')>=3).sort((a,b)=>count(b,'quiet')-count(a,'quiet'));
  for(const f of quiet){
   const free=count(f,'quiet'),why=[dayList(quietDays)+': в городе занято до '+Math.max(0,...quietDays.map(d=>d.load))+'% вечеров','Квартира свободна в '+free+(free>=5?' дней':' дня')+' из них'];
   if(f.hourly>0&&f.minHours>1){const to=f.minHours<=2?1:Math.max(2,Math.ceil(f.minHours/2));return {...none,advice:'min_hours',propertyId:f.id,title:f.title,from:f.minHours,to,reasons:[...why,'Короткие брони занимают пустые часы']};}
   // Busy days ahead: a lower price would sell them cheap, so only the minimum stay may change.
   if(busyDays.length||f.priceLocked||f.price<100||(f.median!==null&&f.price<=f.median*1.1))continue;
   const to=Math.max(round(f.price*0.9,500),f.minimumRate,f.median!==null?round(f.median*0.9,500):0);
   if(to>=f.price||(f.price-to)/f.price<0.03)continue;
   return priced(f,to,'lower',[...why,...(f.median!==null?['Похожие квартиры: ~'+money(f.median)]:[])]);
  }
 }
 return none;
}

// Advice that no longer matches the tariffs (the owner changed them) or a past week is closed quietly.
const expireSql="UPDATE load_forecasts SET status='expired',decided_at=? WHERE status='suggested' AND (expires_at<=? OR (advice<>'none' AND NOT EXISTS(SELECT 1 FROM property_policies pp JOIN properties p ON p.id=pp.property_id WHERE pp.property_id=load_forecasts.property_id AND pp.version=load_forecasts.policy_version AND p.published=1 AND p.archived_at IS NULL AND (load_forecasts.advice='min_hours' OR p.price=load_forecasts.from_value))))";

// Runs with the AI administrator's regular check of an owner. Returns the forecast id or null.
export async function offerWeeklyForecast(db:D1Database,ownerId:string,t=epoch()):Promise<string|null>{
 const week=weekStart(t);
 if(t<week+FORECAST_START_HOUR*HOUR)return null;
 if(await one(db,'SELECT 1 FROM load_forecasts WHERE owner_id=? AND week_start=?',ownerId,week))return null;
 const own=await rows(db,`SELECT p.id,p.title,p.city,p.price,p.rooms,COALESCE(pp.hourly_price,0) hourly,COALESCE(pp.nightly_price,0) nightly,COALESCE(pp.min_hours,2) min_hours,COALESCE(pp.minimum_rate,0) minimum_rate,pp.version
  FROM properties p JOIN property_policies pp ON pp.property_id=p.id WHERE p.owner_id=? AND p.published=1 AND p.archived_at IS NULL AND p.demo_owner IS NULL ORDER BY p.id`,ownerId);
 if(!own.length)return null;
 // The city where the owner has the most flats: the forecast is about one market.
 const byCity=new Map<string,number>();for(const p of own)byCity.set(p.city,(byCity.get(p.city)||0)+1);
 const city=[...byCity.entries()].sort((a,b)=>b[1]-a[1])[0][0],from=localDay(t);
 const flats=Number((await one(db,'SELECT COUNT(*) n FROM properties WHERE city=? AND published=1 AND archived_at IS NULL AND demo_owner IS NULL',city))?.n||0);
 const stays=(await rows(db,`SELECT b.property_id,b.start,b.end FROM bookings b JOIN properties p ON p.id=b.property_id WHERE p.city=? AND p.demo_owner IS NULL
  AND (b.status IN ('confirmed','completed') OR (b.status='requested' AND b.expires_at>?)) AND b.end>? AND b.start<?`,city,t,from-HISTORY_WEEKS*7*DAY,from+7*DAY+DAY)).map(r=>({property_id:String(r.property_id),start:Number(r.start),end:Number(r.end)}));
 // No bookings in the city for a month and none ahead: nothing to base a forecast on yet.
 if(!stays.length)return null;
 const days=forecastWeek(stays,flats,from),mine=own.filter(p=>p.city===city);
 const recent=new Set((await rows(db,'SELECT property_id FROM price_suggestions WHERE owner_id=? AND (status=\'pending\' OR created_at>?)',ownerId,t-PRICE_COOLDOWN)).map(r=>r.property_id));
 const candidates:ForecastFlat[]=[];
 for(const p of mine)candidates.push({id:p.id,title:p.title,price:Number(p.price),hourly:Number(p.hourly),nightly:Number(p.nightly),minHours:Number(p.min_hours),minimumRate:Number(p.minimum_rate),
  median:await similarMedian(db,p),priceLocked:recent.has(p.id),free:days.map(d=>!stays.some(s=>s.property_id===p.id&&s.start<=d.day+EVENING&&s.end>d.day+EVENING))});
 const advice=adviseWeek(days,candidates),summary=weekSummary(days),target=mine.find(p=>p.id===advice.propertyId),id=uuid();
 const body='Прогноз на неделю · '+summary+'. '+(advice.advice==='none'?'Менять ничего не нужно, сообщу, если что-то изменится.':adviceSentence(advice)+' Без вашего согласия ничего не изменится.');
 const r=await db.batch([
  q(db,`INSERT INTO load_forecasts(id,owner_id,week_start,city,days,advice,property_id,policy_version,from_value,to_value,from_hourly,to_hourly,from_nightly,to_nightly,percent,reasons,created_at,expires_at)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(owner_id,week_start) DO NOTHING`,
   id,ownerId,week,city,JSON.stringify(days),advice.advice,advice.propertyId,target?.version??null,advice.from,advice.to,advice.fromHourly,advice.toHourly,advice.fromNightly,advice.toNightly,advice.percent,JSON.stringify(advice.reasons),t,week+7*DAY),
  q(db,'INSERT OR IGNORE INTO notifications SELECT ?,?,?,?,0,? WHERE EXISTS(SELECT 1 FROM load_forecasts WHERE id=?)',uuid(),ownerId,body,'owner:forecast:'+id,t,id),
  q(db,'INSERT INTO audit_events SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM load_forecasts WHERE id=?)',uuid(),'system:load-forecast',advice.propertyId||ownerId,JSON.stringify({action:'forecast.suggested',forecastId:id,city,advice:advice.advice,from:advice.from,to:advice.to,onBehalfOf:ownerId}),t,id)
 ]);
 return r[0].meta.changes?id:null;
}

export async function ownerForecasts(db:D1Database,ownerId:string,t=epoch()){
 await q(db,expireSql+' AND owner_id=?',t,t,ownerId).run();
 return (await rows(db,"SELECT f.*,p.title FROM load_forecasts f LEFT JOIN properties p ON p.id=f.property_id WHERE f.owner_id=? AND f.status='suggested' AND f.expires_at>? ORDER BY f.created_at DESC LIMIT 1",ownerId,t))
  .map(f=>({...f,days:JSON.parse(f.days||'[]'),reasons:JSON.parse(f.reasons||'[]')}));
}

export async function decideForecast(s:RentalService,forecastId:string,accept:boolean){
 const t=epoch(),id=required(forecastId,'Прогноз',100);
 await q(s.db,expireSql+' AND id=?',t,t,id).run();
 const f=await one(s.db,'SELECT f.*,p.title,p.price current_price,pp.version current_version,pp.minimum_rate FROM load_forecasts f LEFT JOIN properties p ON p.id=f.property_id LEFT JOIN property_policies pp ON pp.property_id=f.property_id WHERE f.id=? AND f.owner_id=?',id,s.userId);
 if(!f)throw new DomainError('Прогноз недоступен.',404);
 if(f.status!=='suggested')throw new DomainError('Прогноз уже неактуален: тарифы изменились или неделя прошла.',409);
 const close=async(status:string,action:string)=>{
  const r=await s.db.batch([
   q(s.db,"UPDATE load_forecasts SET status=?,decided_at=? WHERE id=? AND status='suggested'",status,t,id),
   q(s.db,'INSERT INTO audit_events SELECT ?,?,?,?,? WHERE changes()>0',uuid(),s.userId,f.property_id||s.userId,JSON.stringify({action,forecastId:id}),t)
  ]);
  if(!r[0].meta.changes)throw new DomainError('Прогноз уже закрыт.',409);
 };
 if(!accept||f.advice==='none'){
  await close(accept?'accepted':'declined',accept?'forecast.seen':'forecast.declined');
  return {message:accept?'Хорошо. Следующий прогноз — в понедельник.':'Хорошо, оставляем как есть. Следующий прогноз — в понедельник.'};
 }
 const revision=uuid();
 if(f.advice==='min_hours'){
  const r=await s.db.batch([
   q(s.db,'UPDATE property_policies SET min_hours=?,version=version+1,revision=?,updated_at=? WHERE property_id=? AND version=? AND min_hours=? AND EXISTS(SELECT 1 FROM load_forecasts WHERE id=? AND status=\'suggested\')',f.to_value,revision,t,f.property_id,f.policy_version,f.from_value,id),
   q(s.db,"UPDATE load_forecasts SET status='accepted',decided_at=? WHERE id=? AND EXISTS(SELECT 1 FROM property_policies WHERE property_id=? AND revision=?)",t,id,f.property_id,revision),
   q(s.db,'INSERT INTO audit_events SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM property_policies WHERE property_id=? AND revision=?)',uuid(),s.userId,f.property_id,JSON.stringify({action:'forecast.accepted',forecastId:id,minHours:[f.from_value,f.to_value],version:f.policy_version+1}),t,f.property_id,revision)
  ]);
  if(!r[0].meta.changes)throw new DomainError('Правила квартиры уже изменились. Обновите экран.',409);
  return {message:'Готово: «'+f.title+'» теперь можно снять от '+f.to_value+' ч.'};
 }
 if(f.minimum_rate&&[f.to_value,f.to_hourly,f.to_nightly].some(rate=>rate>0&&rate<f.minimum_rate))throw new DomainError('Новая цена ниже минимальной ставки в правилах квартиры.',409);
 const r=await s.db.batch([
  q(s.db,"UPDATE property_policies SET hourly_price=?,nightly_price=?,version=version+1,revision=?,updated_at=? WHERE property_id=? AND version=? AND EXISTS(SELECT 1 FROM load_forecasts WHERE id=? AND status='suggested') AND EXISTS(SELECT 1 FROM properties WHERE id=? AND price=?)",f.to_hourly,f.to_nightly,revision,t,f.property_id,f.policy_version,id,f.property_id,f.from_value),
  q(s.db,'UPDATE properties SET price=? WHERE id=? AND owner_id=? AND EXISTS(SELECT 1 FROM property_policies WHERE property_id=? AND revision=?)',f.to_value,f.property_id,s.userId,f.property_id,revision),
  q(s.db,"UPDATE load_forecasts SET status='accepted',decided_at=? WHERE id=? AND EXISTS(SELECT 1 FROM property_policies WHERE property_id=? AND revision=?)",t,id,f.property_id,revision),
  q(s.db,'INSERT INTO audit_events SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM property_policies WHERE property_id=? AND revision=?)',uuid(),s.userId,f.property_id,JSON.stringify({action:'forecast.accepted',forecastId:id,daily:[f.from_value,f.to_value],hourly:[f.from_hourly,f.to_hourly],nightly:[f.from_nightly,f.to_nightly],version:f.policy_version+1}),t,f.property_id,revision)
 ]);
 if(!r[0].meta.changes)throw new DomainError('Тарифы уже изменились. Обновите экран.',409);
 return {message:'Готово: «'+f.title+'» теперь '+money(f.to_value)+' за сутки. Гости увидят новую цену сразу.'};
}
