import {DomainError,required,number,interval,type Role} from './domain';
import type {RentalService} from './service';
import {epoch,uuid,q,one,rows,type Row} from './operation-core';
import {geoDistance} from './map-location';
import {amenities} from './listings';
import {autoAnswerOffers,setGuestMode,guestModeSql,guestModeJoins} from './autopilot';

// Structured facts are authoritative; the administrator's explanation is derived from them.
export function matchingInput(body:Row){
 if(!body||typeof body!=='object'||Array.isArray(body))throw new DomainError('Проверьте условия поиска.');
 const mode=body.mode||'daily',priority=body.priority||'balanced';
 if(!['daily','hourly'].includes(mode)||!['balanced','cheaper','closer'].includes(priority))throw new DomainError('Проверьте тариф и приоритет.');
 const {start,end}=interval(body.start,body.end),features=Array.isArray(body.features)?body.features:[];
 if(features.length>8||features.some(v=>typeof v!=='string'||!Object.hasOwn(amenities,v)))throw new DomainError('Проверьте обязательные удобства.');
 let near:Row|null=null;
 if(body.near){const {longitude,latitude}=body.near;if(typeof longitude!=='number'||!Number.isFinite(longitude)||Math.abs(longitude)>180||typeof latitude!=='number'||!Number.isFinite(latitude)||Math.abs(latitude)>85)throw new DomainError('Проверьте точку поиска.');near={longitude:Math.round(longitude*100)/100,latitude:Math.round(latitude*100)/100,radius:number(body.near.radius||5000,'Радиус',1000,20000)};}
 if(priority==='closer'&&!near)throw new DomainError('Для приоритета «Ближе» выберите точку на карте или зону рядом с вами.');
 return {city:required(body.city,'Город',80),district:String(body.district||'').trim().slice(0,120),start:new Date(start*1000).toISOString(),end:new Date(end*1000).toISOString(),guests:String(number(body.guests,'Гости',1,50)),mode,maxPrice:String(number(body.maxPrice,'Бюджет за период',100,100000000)),priority,features:[...new Set(features)],near};
}
export function rankMatches(properties:Row[],filters:Row):Row[]{
 const budget=Number(filters.maxPrice),district=filters.district.toLocaleLowerCase('ru');
 return properties.filter(p=>!p.test_preview&&(!district||String(p.district).toLocaleLowerCase('ru').includes(district))&&filters.features.every((a:string)=>(p.details?.amenities||[]).includes(a))).flatMap<Row>(p=>{
  const amount=p.estimate?.amount;if(!Number.isInteger(amount)||amount>budget)return [];
  const distance=filters.near&&p.location?geoDistance([filters.near.longitude,filters.near.latitude],[p.location.longitude,p.location.latitude]):null;
  if(filters.near&&(distance===null||distance>filters.near.radius))return [];
  const ready=p.display_status?.code==='ready',saving=1-amount/budget,proximity=distance===null?0:1-distance/filters.near.radius;
  // A flat under autopilot answers and confirms at once, so the balanced choice lifts it a little.
  const instant=!!p.instant,score=filters.priority==='cheaper'?saving:filters.priority==='closer'&&filters.near?proximity:.5*saving+.3*proximity+.2*Number(ready)+.1*Number(instant);
  const reasons=['В пределах бюджета',...(distance!==null?['Примерно '+Math.max(.1,distance/1000).toFixed(1).replace('.',',')+' км от выбранного места']:[]),...(ready?['Готовность проверена']:[]),...(instant?['Отвечает и подтверждает сразу']:[]),...(filters.features.length?['Нужные удобства есть']:[])];
  return [{...p,match:{score,distance,reasons}}];
 }).sort((a,b)=>b.match.score-a.match.score||a.estimate.amount-b.estimate.amount||Number(!!b.instant)-Number(!!a.instant)||String(a.id).localeCompare(String(b.id)));
}
export async function previewMatches(s:RentalService,body:Row):Promise<Row>{
 const filters=matchingInput(body),search={city:filters.city,start:filters.start,end:filters.end,guests:filters.guests,mode:filters.mode,maxPrice:filters.maxPrice,map:'1',limit:'60'};
 const first=await s.publicSearch(search,{matching:true}),properties=first.properties;
 // In chunks: a matching search returns every match, and D1 binds at most 100 parameters.
 const modes:Row[]=[],ids=properties.map((p:Row)=>p.id);
 for(let i=0;i<ids.length;i+=90){const part=ids.slice(i,i+90);modes.push(...await rows(s.db,`SELECT p.id,${guestModeSql} mode FROM properties p ${guestModeJoins} WHERE p.id IN (${part.map(()=>'?').join(',')})`,epoch(),...part));}
 const instant=new Set(modes.filter(m=>m.mode==='auto').map(m=>m.id));
 const ranked=rankMatches(properties.map((p:Row)=>({...p,instant:instant.has(p.id)})),filters),preferences=await rows(s.db,'SELECT property_id FROM matching_preferences WHERE enabled=1');
 const enabled=new Set(preferences.map(p=>p.property_id));
 return {filters,properties:ranked.map(p=>({...p,quickRequest:enabled.has(p.id)})),total:ranked.length,center:first.center,availabilityChecked:true,serverTime:epoch()};
}
async function expire(s:RentalService){const t=epoch();await s.db.batch([q(s.db,"UPDATE matching_requests SET status='expired' WHERE expires_at<=? AND status IN ('searching','ready')",t),q(s.db,"UPDATE matching_offers SET status='expired' WHERE expires_at<=? AND status IN ('pending','accepted')",t)]);}
async function guestRequest(s:RentalService,id:unknown){await s.requireRole('guest');const r=await one(s.db,'SELECT * FROM matching_requests WHERE id=? AND guest_id=?',required(id,'Запрос',100),s.userId);if(!r)throw new DomainError('Запрос недоступен.',404);return r;}
async function sendWave(s:RentalService,request:Row,ranked:Row[]){
 const existing=await rows(s.db,'SELECT property_id FROM matching_offers WHERE request_id=?',request.id),seen=new Set(existing.map(o=>o.property_id)),candidates=ranked.filter(p=>p.quickRequest&&!seen.has(p.id)).slice(0,3),t=epoch();
 const statements:D1PreparedStatement[]=[];
 for(const p of candidates){const owner=await one(s.db,'SELECT owner_id FROM properties WHERE id=?',p.id);if(!owner)continue;const id=uuid();
  statements.push(q(s.db,`INSERT OR IGNORE INTO matching_offers(id,request_id,property_id,owner_id,status,amount,policy_version,created_at,expires_at) SELECT ?,?,?,?,'pending',?,?,?,? WHERE EXISTS(SELECT 1 FROM matching_preferences WHERE property_id=? AND owner_id=? AND enabled=1) AND EXISTS(SELECT 1 FROM matching_requests WHERE id=? AND status IN ('searching','ready') AND expires_at>?) AND (SELECT COUNT(*) FROM matching_offers WHERE request_id=?)<9 AND (SELECT COUNT(*) FROM matching_offers WHERE request_id=? AND status='pending' AND expires_at>?)<3 AND NOT EXISTS(SELECT 1 FROM matching_offers WHERE request_id=? AND status='accepted' AND expires_at>?)`,id,request.id,p.id,owner.owner_id,p.estimate.amount,p.policy.version,t,Math.min(t+120,request.expires_at),p.id,owner.owner_id,request.id,t,request.id,request.id,t,request.id,t),q(s.db,`INSERT OR IGNORE INTO notifications SELECT ?,?,?,?,0,? WHERE EXISTS(SELECT 1 FROM matching_offers WHERE id=?)`,uuid(),owner.owner_id,'Новый быстрый запрос на «'+p.title+'». Проверьте даты и готовность в разделе карты.','owner:matching:'+id,t,id));
 }
 if(statements.length){await s.db.batch(statements);await autoAnswerOffers(s,request.id);}
 const count=await one(s.db,'SELECT COUNT(*) n FROM matching_offers WHERE request_id=?',request.id);return Number(count?.n||0)>existing.length;
}
export async function beginMatching(s:RentalService,body:Row){
 await s.requireRole('guest');const key=required(body.requestKey,'Ключ запроса',100),existing=await one(s.db,'SELECT id FROM matching_requests WHERE guest_id=? AND request_key=?',s.userId,key);if(existing)return matchingState(s,existing.id);
 if(body.consent!==true)throw new DomainError('Подтвердите отправку условий владельцам.');
 const recent=await one(s.db,'SELECT COUNT(*) n FROM matching_requests WHERE guest_id=? AND created_at>?',s.userId,epoch()-300);if((recent?.n||0)>=5)throw new DomainError('Слишком много запросов. Попробуйте через несколько минут.',429);
 const result=await previewMatches(s,body),eligible=result.properties.filter((p:Row)=>p.quickRequest).slice(0,3),id=uuid(),t=epoch();
 try{await q(s.db,"INSERT INTO matching_requests(id,guest_id,request_key,filters,status,created_at,expires_at) VALUES (?,?,?,?,?,?,?)",id,s.userId,key,JSON.stringify(result.filters),eligible.length?'searching':'empty',t,t+600).run();}catch(error){const duplicate=await one(s.db,'SELECT id FROM matching_requests WHERE guest_id=? AND request_key=?',s.userId,key);if(duplicate)return matchingState(s,duplicate.id);throw error;}
 await sendWave(s,{id,expires_at:t+600},result.properties);
 return matchingState(s,id,result);
}
export async function matchingState(s:RentalService,id:unknown,prepared?:Row){
 await expire(s);const request=await guestRequest(s,id),filters=JSON.parse(request.filters),t=epoch();
 if(request.status==='booking'){const saved=await one(s.db,'SELECT id FROM bookings WHERE guest_id=? AND request_key=?',s.userId,'match:'+request.id);if(saved){await q(s.db,"UPDATE matching_requests SET status='booked',booking_id=? WHERE id=?",saved.id,request.id).run();request.status='booked';request.booking_id=saved.id;}else if(request.lease_until<t){await q(s.db,"UPDATE matching_requests SET status=? WHERE id=? AND status='booking' AND lease_until<?",request.expires_at>t?'ready':'expired',request.id,t).run();request.status=request.expires_at>t?'ready':'expired';}}
 let offers=await rows(s.db,'SELECT id,property_id,status,expires_at,amount,policy_version FROM matching_offers WHERE request_id=? ORDER BY created_at,id',request.id),dispatchChanged=false;
 if(['searching','ready'].includes(request.status)&&Date.parse(filters.start)<(t-60)*1000){await q(s.db,"UPDATE matching_requests SET status='expired' WHERE id=? AND status IN ('searching','ready')",request.id).run();request.status='expired';}
 const available=['searching','ready'].includes(request.status)?prepared||await previewMatches(s,filters):{properties:[]};
 for(const offer of offers.filter(o=>['pending','accepted'].includes(o.status)&&o.expires_at>t)){if(!available.properties.some((p:Row)=>p.id===offer.property_id&&p.estimate.amount===offer.amount&&p.policy.version===offer.policy_version)){await q(s.db,"UPDATE matching_offers SET status='expired' WHERE id=? AND status IN ('pending','accepted')",offer.id).run();offer.status='expired';}}
 if(['searching','ready'].includes(request.status)&&!offers.some(o=>['pending','accepted'].includes(o.status)&&o.expires_at>t)&&offers.length<9){dispatchChanged=await sendWave(s,request,available.properties);if(dispatchChanged)offers=await rows(s.db,'SELECT id,property_id,status,expires_at,amount,policy_version FROM matching_offers WHERE request_id=? ORDER BY created_at,id',request.id);}
 const accepted=offers.filter(o=>o.status==='accepted'&&o.expires_at>t);
 const properties=available.properties.flatMap((p:Row)=>{const offer=accepted.find(o=>o.property_id===p.id&&o.amount===p.estimate.amount&&o.policy_version===p.policy.version);return offer?[{...p,offerId:offer.id,offerExpiresAt:offer.expires_at,ownerConfirmed:true}]:[];});
 if(['searching','ready'].includes(request.status)){request.status=properties.length?'ready':offers.some(o=>o.status==='pending'&&o.expires_at>t)?'searching':'empty';await q(s.db,'UPDATE matching_requests SET status=? WHERE id=? AND status IN (\'searching\',\'ready\')',request.status,request.id).run();}
 return {dispatchChanged,id:request.id,status:request.status,filters,properties,pendingProperties:available.properties.filter((p:Row)=>offers.some(o=>o.property_id===p.id&&o.status==='pending'&&o.expires_at>t)),offers:offers.map(({id,status,expires_at})=>({id,status,expiresAt:expires_at})),sent:offers.length,pending:offers.filter(o=>o.status==='pending'&&o.expires_at>t).length,expiresAt:request.expires_at,bookingId:request.booking_id,serverTime:t};
}
export async function matchingInbox(s:RentalService){
 await s.requireRole('owner');await expire(s);
 const preferences=await rows(s.db,`SELECT p.id,p.title,COALESCE(m.enabled,0) enabled,${guestModeSql} mode,COALESCE(pp.cleaning_fee,0) cleaning_fee FROM properties p ${guestModeJoins} WHERE p.owner_id=? AND p.archived_at IS NULL ORDER BY p.created_at DESC`,epoch(),s.userId);
 const offers=await rows(s.db,"SELECT o.id,o.property_id,o.amount,o.expires_at,o.status,r.filters,p.title FROM matching_offers o JOIN matching_requests r ON r.id=o.request_id JOIN properties p ON p.id=o.property_id WHERE o.owner_id=? AND p.owner_id=? AND o.status='pending' AND o.expires_at>? AND r.status IN ('searching','ready') AND r.expires_at>? ORDER BY o.created_at DESC",s.userId,s.userId,epoch(),epoch());
 return {preferences,offers:offers.map(o=>{const {near,...filters}=JSON.parse(o.filters);return {...o,filters};}),serverTime:epoch()};
}
export async function matchingAction(s:RentalService,role:Role,action:string,body:Row){
 if(action==='begin'&&role==='guest')return beginMatching(s,body);
 if(action==='state'&&role==='guest')return matchingState(s,body.id);
 if(action==='inbox'&&role==='owner')return matchingInbox(s);
 if(action==='preference'&&role==='owner'&&body.mode!==undefined){const saved=await setGuestMode(s,body);return {...await matchingInbox(s),message:saved.message};}
 if(action==='preference'&&role==='owner'){await s.requireRole('owner');const p=await one(s.db,'SELECT id FROM properties WHERE id=? AND owner_id=?',body.propertyId,s.userId);if(!p)throw new DomainError('Объект недоступен.',404);if(typeof body.enabled!=='boolean')throw new DomainError('Укажите режим запросов.');await q(s.db,'INSERT INTO matching_preferences VALUES (?,?,?,?) ON CONFLICT(property_id) DO UPDATE SET enabled=excluded.enabled,owner_id=excluded.owner_id,updated_at=excluded.updated_at',p.id,s.userId,Number(body.enabled),epoch()).run();return matchingInbox(s);}
 if(action==='respond'&&role==='owner'){
  await s.requireRole('owner');if(!['accept','decline'].includes(body.decision))throw new DomainError('Выберите ответ.');await expire(s);
  const offer=await one(s.db,"SELECT o.*,r.filters FROM matching_offers o JOIN matching_requests r ON r.id=o.request_id JOIN properties p ON p.id=o.property_id WHERE o.id=? AND o.owner_id=? AND p.owner_id=? AND r.status IN ('searching','ready') AND r.expires_at>?",body.offerId,s.userId,s.userId,epoch());if(!offer)throw new DomainError('Предложение недоступно.',404);
  if(offer.status!=='pending'||offer.expires_at<=epoch())throw new DomainError('Срок ответа истёк или ответ уже сохранён.',409);
  if(body.decision==='accept'){if(body.ready!==true)throw new DomainError('Подтвердите готовность к указанному заезду.');const f=JSON.parse(offer.filters),quote=await s.bookingQuote({...f,propertyId:offer.property_id,billingMode:f.mode});if(quote.amount!==offer.amount||quote.policy.version!==offer.policy_version)throw new DomainError('Тариф изменился. Отклоните запрос, чтобы гость пересчитал стоимость.',409);}
  const changed=await q(s.db,"UPDATE matching_offers SET status=?,responded_at=?,expires_at=? WHERE id=? AND status='pending' AND expires_at>? AND EXISTS(SELECT 1 FROM matching_requests r WHERE r.id=matching_offers.request_id AND r.status IN ('searching','ready') AND r.expires_at>?)",body.decision==='accept'?'accepted':'declined',epoch(),body.decision==='accept'?epoch()+300:offer.expires_at,offer.id,epoch(),epoch()).run();if(!changed.meta.changes)throw new DomainError('Запрос уже изменился.',409);
  const request=await one(s.db,'SELECT guest_id FROM matching_requests WHERE id=?',offer.request_id);if(request)await s.notify(request.guest_id,body.decision==='accept'?'Владелец ответил на ваш подбор. Откройте карту, чтобы посмотреть предложение.':'Один из владельцев не может принять запрос. Проверяем остальные ответы.','matching-response:'+offer.id,'guest').run();return matchingInbox(s);
 }
 if(action==='cancel'&&role==='guest'){const r=await guestRequest(s,body.id);if(r.status==='booking'||r.status==='booked')throw new DomainError('Бронирование уже оформляется. Откройте ваши брони.',409);const changed=await q(s.db,"UPDATE matching_requests SET status='cancelled' WHERE id=? AND status<>'booked' AND status<>'booking'",r.id).run();if(!changed.meta.changes)throw new DomainError('Заявка уже оформляется. Проверьте ваши брони перед отменой.',409);return matchingState(s,r.id);}
 if(action==='book'&&role==='guest'){
  const r=await guestRequest(s,body.id),key='match:'+r.id,saved=await one(s.db,'SELECT id FROM bookings WHERE guest_id=? AND request_key=?',s.userId,key);if(saved)return {id:saved.id,message:'Эта заявка уже сохранена.'};
  const offer=await one(s.db,"SELECT * FROM matching_offers WHERE id=? AND request_id=? AND status='accepted' AND expires_at>?",body.offerId,r.id,epoch());if(!offer||r.expires_at<=epoch()||!['ready','searching','booking'].includes(r.status))throw new DomainError('Предложение истекло. Запустите новый подбор.',409);
  if(body.acceptTerms!==true)throw new DomainError('Примите условия конкретной квартиры.');
  const agreed=JSON.parse(r.filters);if(Date.parse(body.start)!==Date.parse(agreed.start)||Date.parse(body.end)!==Date.parse(agreed.end)||Number(body.guests)!==Number(agreed.guests)||body.billingMode!==agreed.mode||body.expectedAmount!==offer.amount||body.expectedPolicyVersion!==offer.policy_version)throw new DomainError('Условия отличаются от предложения. Измените запрос и получите новый расчёт.',409);
  const claimed=await q(s.db,"UPDATE matching_requests SET status='booking',selected_offer=?,lease_until=? WHERE id=? AND (status IN ('ready','searching') OR (status='booking' AND lease_until<?))",offer.id,epoch()+60,r.id,epoch()).run();if(!claimed.meta.changes)throw new DomainError('Заявка уже оформляется. Подождите и обновите подбор.',409);
  try{const f=JSON.parse(r.filters),result=await s.createBooking({...f,propertyId:offer.property_id,billingMode:f.mode,expectedAmount:offer.amount,expectedPolicyVersion:offer.policy_version,requestKey:key,acceptTerms:true});await q(s.db,"UPDATE matching_requests SET status='booked',booking_id=? WHERE id=? AND selected_offer=?",result.id,r.id,offer.id).run();return result;}catch(error){await q(s.db,"UPDATE matching_requests SET status='ready',lease_until=0 WHERE id=? AND status='booking' AND selected_offer=?",r.id,offer.id).run();throw error;}
 }
 throw new DomainError('Действие подбора недоступно в этой роли.',403);
}
