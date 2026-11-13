import {DomainError,required} from './domain';
import type {RentalService} from './service';
import {epoch,uuid,q,one,rows,type Row} from './operation-core';

// The AI administrator's price advice for the next guest.
// The moment is chosen so that the advice is useful and not annoying: right after the owner accepts
// a cleaning (or marks the flat ready), when the flat is about to be offered again. The service
// compares demand and supply right now and may suggest raising or lowering the guest price.
// Nothing changes on its own: the owner presses the button, and the new price applies only to the
// tariffs the suggestion was made for (same policy version, same daily price).

export type PriceSignals={
 daily:number;hourly:number;nightly:number;minimumRate:number;
 // Guest demand in the flat's city: quick requests in the last 6 hours and bookings in the last 24 hours.
 requests:number;bookings:number;
 // Quick requests in the last 24 hours: a discount is only offered after a whole quiet day.
 requestsDay?:number;
 // Flats in the city that are ready and free right now, this one included.
 freeFlats:number;
 // Share of the last 14 days this flat was booked, and bookings starting in the next 48 hours.
 occupancy:number;upcoming:number;
 // Median daily price of similar flats in the city (null when fewer than three to compare with).
 median:number|null;similar:number;
 peak:boolean;
};
export type PriceAdvice={direction:'up'|'down';percent:number;daily:number;hourly:number;nightly:number;reasons:string[]};

export const PRICE_COOLDOWN=3*86400,PRICE_TTL=12*3600,PRICE_DECLINE_PAUSE=7*86400,PRICE_MUTE=14*86400;
const money=(n:number)=>new Intl.NumberFormat('ru-RU').format(n)+' ₸';
const plural=(n:number,one:string,few:string,many:string)=>{const a=n%10,b=n%100;return n+' '+(a===1&&b!==11?one:a>=2&&a<=4&&(b<10||b>=20)?few:many);};
const round=(n:number,step:number)=>Math.max(step,Math.round(n/step)*step);

// Friday from 15:00 to Sunday 18:00 in Almaty: the usual short-stay peak.
export function weekendPeak(t:number){
 const local=new Date((t+5*3600)*1000),day=local.getUTCDay(),hour=local.getUTCHours();
 return day===5&&hour>=15||day===6||day===0&&hour<18;
}

// Pure decision: returns null when the price already fits the moment, so most of the time the owner hears nothing.
export function advisePrice(s:PriceSignals):PriceAdvice|null{
 if(s.daily<100)return null;
 const demand=s.requests+s.bookings,pressure=demand/Math.max(1,s.freeFlats),reasons:string[]=[];
 const hot=pressure>=1.5||s.occupancy>=0.7||s.peak&&pressure>=1;
 const quiet=Math.max(s.requests,s.requestsDay??0)+s.bookings===0&&s.occupancy<0.3&&s.upcoming===0&&!s.peak;
 let direction:'up'|'down'|null=null,percent=0;
 if(hot&&(s.median===null||s.daily<s.median*1.2)){
  direction='up';percent=pressure>=3||s.occupancy>=0.85?15:10;if(s.peak)percent+=5;percent=Math.min(20,percent);
 }else if(quiet&&(s.median!==null?s.daily>s.median*1.1:s.occupancy<0.1)){
  direction='down';percent=s.median!==null&&s.daily>s.median*1.3?15:10;
 }
 if(!direction)return null;
 const factor=direction==='up'?1+percent/100:1-percent/100;
 let daily=round(s.daily*factor,500);
 if(direction==='up'&&s.median!==null)daily=Math.min(daily,round(s.median*1.25,500));
 if(direction==='down')daily=Math.max(daily,s.minimumRate,s.median!==null?round(s.median*0.9,500):0);
 const real=Math.round(Math.abs(daily-s.daily)/s.daily*100);
 if(direction==='up'?daily<=s.daily:daily>=s.daily)return null;
 if(real<3)return null;
 const scale=(rate:number,step:number)=>!rate?0:direction==='up'?Math.max(rate,round(rate*daily/s.daily,step)):Math.min(rate,Math.max(s.minimumRate,round(rate*daily/s.daily,step)));
 if(direction==='up'){
  if(s.requests)reasons.push('Ищут жильё: '+plural(s.requests,'запрос','запроса','запросов')+' за 6 ч');
  if(s.bookings)reasons.push(plural(s.bookings,'бронь','брони','броней')+' в городе за сутки');
  reasons.push('Свободных объектов: '+s.freeFlats);
  if(s.occupancy>=0.5)reasons.push('Загрузка за 2 недели: '+Math.round(s.occupancy*100)+'%');
  if(s.peak)reasons.push('Выходные: спрос выше');
 }else{
  reasons.push('Нет запросов гостей за сутки');
  reasons.push('Ближайшие 2 дня свободны');
  if(s.occupancy<0.3)reasons.push('Загрузка за 2 недели: '+Math.round(s.occupancy*100)+'%');
 }
 if(s.median!==null)reasons.push('Похожие объекты: ~'+money(s.median));
 return {direction,percent:real,daily,hourly:scale(s.hourly,100),nightly:scale(s.nightly,500),reasons};
}

export async function priceSignals(db:D1Database,property:Row,policy:Row,t:number):Promise<PriceSignals>{
 const city=property.city;
 const demand=await one(db,`SELECT
  (SELECT COUNT(*) FROM matching_requests WHERE created_at>? AND json_extract(filters,'$.city')=?) requests,
  (SELECT COUNT(*) FROM matching_requests WHERE created_at>? AND json_extract(filters,'$.city')=?) requests_day,
  (SELECT COUNT(*) FROM bookings b JOIN properties p ON p.id=b.property_id WHERE b.created_at>? AND p.city=? AND p.demo_owner IS NULL AND b.status IN ('requested','confirmed','completed')) bookings,
  (SELECT COUNT(*) FROM properties p JOIN property_operations o ON o.property_id=p.id WHERE p.city=? AND p.published=1 AND p.archived_at IS NULL AND p.demo_owner IS NULL AND o.readiness='ready' AND o.active_booking_id IS NULL
    AND NOT EXISTS(SELECT 1 FROM bookings b WHERE b.property_id=p.id AND b.status='confirmed' AND b.start<=? AND b.occupied_until>?)) free,
  (SELECT COALESCE(SUM(MIN(b.end,?)-MAX(b.start,?)),0) FROM bookings b WHERE b.property_id=? AND b.status IN ('confirmed','completed') AND b.start<? AND b.end>?) booked,
  (SELECT COUNT(*) FROM bookings b WHERE b.property_id=? AND b.status IN ('requested','confirmed') AND b.start>=? AND b.start<?) upcoming`,
  t-6*3600,city,t-86400,city,t-86400,city,city,t,t,t,t-14*86400,property.id,t,t-14*86400,property.id,t,t+48*3600);
 const prices=await similarPrices(db,property),median=medianOf(prices);
 return {daily:Number(property.price),hourly:Number(policy.hourly_price||0),nightly:Number(policy.nightly_price||0),minimumRate:Number(policy.minimum_rate||0),
  requests:Number(demand?.requests||0),requestsDay:Number(demand?.requests_day||0),bookings:Number(demand?.bookings||0),freeFlats:Math.max(1,Number(demand?.free||0)),
  occupancy:Math.min(1,Number(demand?.booked||0)/(14*86400)),upcoming:Number(demand?.upcoming||0),median,similar:prices.length,peak:weekendPeak(t)};
}

// Stale advice (old tariffs or past its time) is closed quietly, so the owner never answers an outdated question.
export function expireStaleSql(){return "UPDATE price_suggestions SET status='expired',decided_at=? WHERE status='pending' AND (expires_at<=? OR NOT EXISTS(SELECT 1 FROM property_policies pp JOIN properties p ON p.id=pp.property_id WHERE pp.property_id=price_suggestions.property_id AND pp.version=price_suggestions.policy_version AND p.price=price_suggestions.from_daily AND p.published=1 AND p.archived_at IS NULL))";}

// Daily prices of similar flats in the same city (rooms ±1), and their median when there are at least three.
async function similarPrices(db:D1Database,property:Row){
 return (await rows(db,`SELECT price FROM properties WHERE city=? AND id<>? AND published=1 AND archived_at IS NULL AND demo_owner IS NULL AND rooms BETWEEN ? AND ? AND price>=100 ORDER BY price`,property.city,property.id,Number(property.rooms)-1,Number(property.rooms)+1)).map(r=>Number(r.price));
}
const medianOf=(prices:number[])=>prices.length>=3?(prices.length%2?prices[(prices.length-1)/2]:Math.round((prices[prices.length/2-1]+prices[prices.length/2])/2)):null;
export async function similarMedian(db:D1Database,property:Row){return medianOf(await similarPrices(db,property));}

// Called after the owner accepts a cleaning or marks the flat ready. Returns the new suggestion id or null.
export async function offerPriceAdvice(db:D1Database,propertyId:string,t=epoch()):Promise<string|null>{
 await q(db,expireStaleSql()+' AND property_id=?',t,t,propertyId).run();
 const property=await one(db,'SELECT * FROM properties WHERE id=? AND published=1 AND archived_at IS NULL AND demo_owner IS NULL',propertyId);
 if(!property)return null;
 const policy=await one(db,'SELECT * FROM property_policies WHERE property_id=?',propertyId);
 if(!policy)return null;
 // One question at a time and not more often than once in three days for a flat.
 const history=await rows(db,'SELECT direction,status,created_at,decided_at FROM price_suggestions WHERE property_id=? ORDER BY created_at DESC LIMIT 2',propertyId);
 if(history[0]&&(history[0].status==='pending'||history[0].created_at>t-PRICE_COOLDOWN))return null;
 // Two "leave it" answers in a row pause the advice for two weeks.
 if(history.length===2&&history.every(h=>h.status==='declined')&&history[0].decided_at>t-PRICE_MUTE)return null;
 const signals=await priceSignals(db,property,policy,t),advice=advisePrice(signals);
 if(!advice)return null;
 if(history[0]?.status==='declined'&&history[0].direction===advice.direction&&history[0].decided_at>t-PRICE_DECLINE_PAUSE)return null;
 const mode=await one(db,'SELECT enabled FROM matching_preferences WHERE property_id=?',propertyId),auto=!!policy.auto_confirm&&!!mode?.enabled;
 const sid=uuid();
 const verb=advice.direction==='up'?'поднять':'снизить',why=advice.direction==='up'?'Спрос сейчас выше обычного':'Спрос сейчас ниже обычного';
 const body='Совет по цене · «'+property.title+'» готова к следующему гостю. '+why+': предлагаю '+verb+' цену до '+money(advice.daily)+' за сутки ('+(advice.direction==='up'?'+':'−')+advice.percent+'%). '+(auto?'После подтверждения ИИ будет отвечать гостям по новой цене. ':'')+'Без вашего согласия цена не изменится.';
 const result=await db.batch([
  q(db,`INSERT INTO price_suggestions(id,property_id,owner_id,direction,percent,policy_version,from_daily,to_daily,from_hourly,to_hourly,from_nightly,to_nightly,signals,reasons,created_at,expires_at)
   SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM price_suggestions WHERE property_id=? AND (status='pending' OR created_at>?))`,
   sid,propertyId,property.owner_id,advice.direction,advice.percent,policy.version,property.price,advice.daily,signals.hourly,advice.hourly,signals.nightly,advice.nightly,JSON.stringify(signals),JSON.stringify(advice.reasons),t,t+PRICE_TTL,propertyId,t-PRICE_COOLDOWN),
  q(db,'INSERT OR IGNORE INTO notifications SELECT ?,?,?,?,0,? WHERE EXISTS(SELECT 1 FROM price_suggestions WHERE id=?)',uuid(),property.owner_id,body,'owner:price:'+sid,t,sid),
  q(db,'INSERT INTO audit_events SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM price_suggestions WHERE id=?)',uuid(),'system:price-advice',propertyId,JSON.stringify({action:'price.suggested',suggestionId:sid,direction:advice.direction,percent:advice.percent,from:property.price,to:advice.daily,onBehalfOf:property.owner_id}),t,sid)
 ]);
 return result[0].meta.changes?sid:null;
}


// The owner's open suggestions, with the flat's title, for the approval cards and the map banner.
export async function ownerPriceSuggestions(db:D1Database,ownerId:string,t=epoch()){
 await q(db,expireStaleSql()+' AND owner_id=?',t,t,ownerId).run();
 return (await rows(db,"SELECT s.*,p.title FROM price_suggestions s JOIN properties p ON p.id=s.property_id WHERE s.owner_id=? AND s.status='pending' AND s.expires_at>? ORDER BY s.created_at DESC LIMIT 5",ownerId,t)).map(s=>({...s,reasons:JSON.parse(s.reasons||'[]')}));
}

export async function decidePriceSuggestion(s:RentalService,suggestionId:string,accept:boolean){
 const t=epoch(),sid=required(suggestionId,'Совет по цене',100);
 const p=await one(s.db,'SELECT s.*,pr.title,pr.price current_price,pp.version current_version,pp.minimum_rate FROM price_suggestions s JOIN properties pr ON pr.id=s.property_id LEFT JOIN property_policies pp ON pp.property_id=s.property_id WHERE s.id=? AND s.owner_id=?',sid,s.userId);
 if(!p)throw new DomainError('Совет по цене недоступен.',404);
 if(p.status!=='pending'||p.expires_at<=t||p.current_version!==p.policy_version||p.current_price!==p.from_daily)throw new DomainError('Совет по цене уже неактуален: тарифы изменились или время ответа прошло.',409);
 if(!accept){
  const r=await s.db.batch([
   q(s.db,"UPDATE price_suggestions SET status='declined',decided_at=? WHERE id=? AND status='pending'",t,sid),
   q(s.db,'INSERT INTO audit_events SELECT ?,?,?,?,? WHERE changes()>0',uuid(),s.userId,p.property_id,JSON.stringify({action:'price.declined',suggestionId:sid}),t)
  ]);
  if(!r[0].meta.changes)throw new DomainError('Совет по цене уже закрыт.',409);
  return {message:'Цена осталась прежней: '+money(p.from_daily)+' за сутки.'};
 }
 if(p.minimum_rate&&[p.to_daily,p.to_hourly,p.to_nightly].some(rate=>rate>0&&rate<p.minimum_rate))throw new DomainError('Новая цена ниже минимальной ставки в правилах жилья.',409);
 const revision=uuid(),r=await s.db.batch([
  q(s.db,"UPDATE property_policies SET hourly_price=?,nightly_price=?,version=version+1,revision=?,updated_at=? WHERE property_id=? AND version=? AND EXISTS(SELECT 1 FROM price_suggestions WHERE id=? AND status='pending' AND expires_at>?) AND EXISTS(SELECT 1 FROM properties WHERE id=? AND price=?)",p.to_hourly,p.to_nightly,revision,t,p.property_id,p.policy_version,sid,t,p.property_id,p.from_daily),
  q(s.db,'UPDATE properties SET price=? WHERE id=? AND owner_id=? AND EXISTS(SELECT 1 FROM property_policies WHERE property_id=? AND revision=?)',p.to_daily,p.property_id,s.userId,p.property_id,revision),
  q(s.db,"UPDATE price_suggestions SET status='accepted',decided_at=? WHERE id=? AND EXISTS(SELECT 1 FROM property_policies WHERE property_id=? AND revision=?)",t,sid,p.property_id,revision),
  q(s.db,'INSERT INTO audit_events SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM property_policies WHERE property_id=? AND revision=?)',uuid(),s.userId,p.property_id,JSON.stringify({action:'price.accepted',suggestionId:sid,daily:[p.from_daily,p.to_daily],hourly:[p.from_hourly,p.to_hourly],nightly:[p.from_nightly,p.to_nightly],version:p.policy_version+1}),t,p.property_id,revision)
 ]);
 if(!r[0].meta.changes)throw new DomainError('Тарифы уже изменились. Обновите экран.',409);
 return {message:'Готово: «'+p.title+'» теперь '+money(p.to_daily)+' за сутки. Гости увидят новую цену сразу.'};
}
