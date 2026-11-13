import {generateRequestDetails} from 'web-push';
import {DomainError,type Role} from './domain';
import type {RentalService} from './service';
import {epoch,uuid,q,one,rows,hash,type OperationConfig,type Row} from './operation-core';
import {encryptInstructions,decryptInstructions} from './participant-security';
import {quietNow} from './administrator';
import {defaultAssistantSettings} from './assistant';
import {priceRevision,windowRevision,stayRevision,forecastRevision} from './approvals';
import {weekSummary,adviceSentence} from './forecast-text';

export function pushConfigured(config:OperationConfig){return !!(config.VAPID_PUBLIC_KEY&&config.VAPID_PRIVATE_KEY&&config.VAPID_SUBJECT&&config.ACCESS_ENCRYPTION_KEY);}
export function validatePushSubscription(input:Row){
 let url:URL;try{url=new URL(input?.endpoint);}catch{throw new DomainError('Неверный адрес push-подписки.');}
 const host=url.hostname,allowed=host==='fcm.googleapis.com'||host==='web.push.apple.com'||host==='updates.push.services.mozilla.com'||host.endsWith('.push.services.mozilla.com')||host.endsWith('.notify.windows.com');
 if(url.protocol!=='https:'||url.port||url.username||url.password||url.hash||url.href.length>2048||!allowed)throw new DomainError('Сервис push-доставки не поддерживается.');
 const keys=input.keys||{},valid=(s:unknown,size:number)=>typeof s==='string'&&/^[A-Za-z0-9_-]+$/.test(s)&&Buffer.from(s,'base64url').length===size;
 if(!valid(keys.p256dh,65)||Buffer.from(keys.p256dh,'base64url')[0]!==4||!valid(keys.auth,16))throw new DomainError('Неверные ключи push-подписки.');
 return {endpoint:url.href,keys:{p256dh:keys.p256dh as string,auth:keys.auth as string}};
}
async function activeSession(service:RentalService,sessionHash:string){
 if(!sessionHash||!await one(service.db,'SELECT 1 FROM auth_sessions s JOIN auth_accounts a ON a.id=s.user_id AND a.credential_version=s.credential_version WHERE s.hash=? AND s.user_id=? AND s.expires_at>?',sessionHash,service.userId,epoch()))throw new DomainError('Войдите заново для настройки уведомлений.',401);
}
export async function webPushState(service:RentalService,role:Role,config:OperationConfig,sessionHash:string){
 await service.authorizeWorkspace(role,'account');await activeSession(service,sessionHash);
 const subscription=await one(service.db,'SELECT id FROM push_subscriptions WHERE user_id=? AND session_hash=? AND role=?',service.userId,sessionHash,role);
 return {configured:pushConfigured(config),publicKey:config.VAPID_PUBLIC_KEY||'',enabled:!!subscription};
}
export async function manageWebPush(service:RentalService,role:Role,body:Row,config:OperationConfig,sessionHash:string){
 await service.authorizeWorkspace(role,'account');await activeSession(service,sessionHash);
 if(body.action==='remove'){
  await q(service.db,'DELETE FROM push_subscriptions WHERE user_id=? AND session_hash=? AND role=?',service.userId,sessionHash,role).run();return {message:'Уведомления для этой роли отключены на устройстве.'};
 }
 if(!pushConfigured(config))throw new DomainError('Push-уведомления ещё не настроены на сервере.',503);
 if(body.action==='subscribe'){
  const subscription=validatePushSubscription(body.subscription),endpointHash=await hash(subscription.endpoint),existing=await one(service.db,'SELECT user_id FROM push_subscriptions WHERE endpoint_hash=? AND role=?',endpointHash,role);
  if(existing&&existing.user_id!==service.userId)throw new DomainError('Пересоздайте подписку в настройках браузера.',409);
  const count=await one(service.db,'SELECT COUNT(*) n FROM push_subscriptions WHERE user_id=?',service.userId);if(count&&count.n>=12&&!existing)throw new DomainError('Отключите уведомления на одном из других устройств.',409);
  const ciphertext=await encryptInstructions(JSON.stringify(subscription),config),at=epoch();
  // INSERT SELECT closes the logout/recovery race while encryption was in progress.
  await service.db.batch([
   q(service.db,'DELETE FROM push_subscriptions WHERE user_id=? AND session_hash=? AND role=?',service.userId,sessionHash,role),
   q(service.db,`INSERT INTO push_subscriptions(id,user_id,session_hash,role,endpoint_hash,ciphertext,created_at,updated_at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM auth_sessions s JOIN auth_accounts a ON a.id=s.user_id AND a.credential_version=s.credential_version WHERE s.hash=? AND s.user_id=? AND s.expires_at>?) ON CONFLICT(endpoint_hash,role) DO UPDATE SET session_hash=excluded.session_hash,ciphertext=excluded.ciphertext,updated_at=excluded.updated_at WHERE push_subscriptions.user_id=excluded.user_id`,uuid(),service.userId,sessionHash,role,endpointHash,ciphertext,at,at,sessionHash,service.userId,at)
  ]);
  await activeSession(service,sessionHash);return {message:'Уведомления для этой роли включены на устройстве.'};
 }
 if(body.action==='test'){
  const at=epoch(),id=uuid();
  const result=await service.db.batch([
   q(service.db,'UPDATE push_subscriptions SET last_test_at=? WHERE user_id=? AND session_hash=? AND role=? AND last_test_at<?',at,service.userId,sessionHash,role,at-60),
   q(service.db,"INSERT INTO push_deliveries(id,subscription_id,available_at,created_at) SELECT ?,id,?,? FROM push_subscriptions WHERE user_id=? AND session_hash=? AND role=? AND changes()>0",id,at,at,service.userId,sessionHash,role)
  ]);
  if(!result[1].meta.changes)throw new DomainError('Включите уведомления. Повторная проверка доступна через минуту.',429);
  return {message:'Проверка поставлена в очередь. Обычно доставка занимает до минуты; браузер должен разрешать уведомления.'};
 }
 throw new DomainError('Неизвестное действие.');
}
export function pushPayload(role:Role,test=false,matching=false,price?:Row|null,window?:Row|null,stay?:Row|null,forecast?:Row|null,notice?:{body?:string}|null,target?:PushTarget|null){
 // The price advice is the one notice that carries its content: the owner can answer from the notification itself.
 if(price&&role==='owner'&&price.status==='pending'){const up=price.direction==='up',sum=new Intl.NumberFormat('ru-RU').format(price.to_daily)+' ₸';
  return JSON.stringify({kind:'price',title:(up?'Спрос вырос · ':'Спрос снизился · ')+price.title,body:(up?'Предлагаю поднять цену до ':'Предлагаю снизить цену до ')+sum+' за сутки ('+(up?'+':'−')+price.percent+'%). Без вашего согласия цена не изменится.',url:'/workspace/owner/map',
   decision:{id:'price:'+price.id,revision:priceRevision(price),accept:(up?'Поднять до ':'Снизить до ')+sum,reject:'Оставить'}});}
 // A calendar window: the owner opens the discounted hours right from the notification too.
 if(window&&role==='owner'&&window.status==='suggested'){const sum=(n:number)=>new Intl.NumberFormat('ru-RU').format(n)+' ₸',hm=(n:number)=>new Date(n*1000).toLocaleTimeString('ru-RU',{timeZone:'Asia/Almaty',hour:'2-digit',minute:'2-digit'}),day=new Date(window.start*1000).toLocaleDateString('ru-RU',{timeZone:'Asia/Almaty',weekday:'short'});
  return JSON.stringify({kind:'window',title:'Окно в календаре · '+window.title,body:'Свободно '+day+' '+hm(window.start)+'–'+hm(window.end)+' между бронями. Сдать почасово за '+sum(window.hourly_to)+' вместо '+sum(window.hourly_from)+' (−'+window.percent+'%)? Без вашего согласия ничего не изменится.',url:'/workspace/owner/map',
   decision:{id:'window:'+window.id,revision:windowRevision(window),accept:'Открыть окно',reject:'Не надо',done:{accept:'Окно открыто',reject:'Окно не открываем'}}});}
 // Late checkout or early check-in the guest asked about: answered from the notification.
 if(stay&&role==='guest'&&stay.status==='suggested'){const late=stay.kind==='late',hm=(n:number)=>new Date(n*1000).toLocaleTimeString('ru-RU',{timeZone:'Asia/Almaty',hour:'2-digit',minute:'2-digit'}),when=late?'до '+hm(stay.end):'с '+hm(stay.start);
  return JSON.stringify({kind:'stay',title:(late?'Можно остаться ':'Можно заехать ')+when,body:'Доплата '+new Intl.NumberFormat('ru-RU').format(stay.extra)+' ₸. '+(stay.automatic?'Оформлю сразу.':'Отправлю запрос владельцу.'),url:'/workspace/guest/map',
   decision:{id:'stay:'+stay.id,revision:stayRevision(stay),role:'guest',accept:(late?'Остаться ':'Заехать ')+when,reject:'Не нужно',done:{accept:'Готово',reject:'Время прежнее'}}});}
 // The week ahead: the owner applies the one suggested change from the notification, or just reads it.
 if(forecast&&role==='owner'&&forecast.status==='suggested'){const days=typeof forecast.days==='string'?JSON.parse(forecast.days||'[]'):forecast.days||[],sum=(n:number)=>new Intl.NumberFormat('ru-RU').format(n)+' ₸',none=forecast.advice==='none';
  return JSON.stringify({kind:'forecast',title:'Прогноз на неделю',body:weekSummary(days)+'. '+(none?'Менять ничего не нужно.':adviceSentence(forecast)),url:'/workspace/owner/map',
   decision:{id:'forecast:'+forecast.id,revision:forecastRevision(forecast),accept:none?'Понятно':forecast.advice==='min_hours'?'От '+forecast.to_value+' ч':(forecast.advice==='raise'?'Поднять до ':'Снизить до ')+sum(forecast.to_value),reject:none?'Скрыть':'Оставить',done:{accept:none?'Прогноз прочитан':'Готово',reject:'Оставляем как есть'}}});}
 if(test)return JSON.stringify({title:'AI Аренда',body:'Уведомления на этом устройстве работают.',url:'/workspace/'+role+'/map'});
 // Any other notice says what happened (the notice's own text) and opens the screen it is about.
 const body=String(notice?.body||'').trim();
 return JSON.stringify({title:target?.title||'AI Аренда',body:body?(body.length>300?body.slice(0,299)+'…':body):'Есть новое событие.',url:target?.url||'/workspace/'+role+(matching?'/map':'/chats')});
}
export type PushTarget={url:string;title:string};
const pushId=/^[A-Za-z0-9_-]{1,100}$/;
const ownerMapKinds=new Set(['price','window','forecast','listing','cleaning-fee','matching','matching-auto','autopilot-week']);
// Where a notice leads. The kind and ids come from the notice's dedupe key («role:kind:id:…»); every id is checked
// against the database, so a key can only point at a booking, cleaning, flat or chat the person really takes part in.
export async function pushTarget(db:D1Database,userId:string,role:Role,dedupe:string):Promise<PushTarget|null>{
 const parts=String(dedupe||'').split(':');if(parts[0]!==role)return null;
 const kind=parts[1]||'',ids=parts.slice(2).filter(v=>pushId.test(v)).slice(0,4),base='/workspace/'+role+'/';
 if(kind==='discussion'&&ids[0]){
  const room=await one(db,"SELECT r.id,r.title FROM discussion_rooms r,json_each(r.members) m WHERE r.id=? AND json_extract(m.value,'$.id')=?",ids[0],userId);
  return room?{url:base+'chats?room='+room.id,title:'Сообщение · '+room.title}:{url:base+'chats',title:'Новое сообщение'};
 }
 if(ownerMapKinds.has(kind)||kind==='matching-response'||kind==='stay')return {url:base+'map',title:'AI администратор'};
 if(!ids.length)return null;
 const marks=ids.map(()=>'?').join(','),found=await rows(db,`SELECT 0 o,'booking' kind,b.id,p.title,b.guest_id a,p.owner_id b FROM bookings b JOIN properties p ON p.id=b.property_id WHERE b.id IN (${marks})
  UNION ALL SELECT 1,'booking',b.id,p.title,b.guest_id,p.owner_id FROM booking_changes c JOIN bookings b ON b.id=c.booking_id JOIN properties p ON p.id=b.property_id WHERE c.id IN (${marks})
  UNION ALL SELECT 2,'job',j.id,p.title,j.assigned_to,p.owner_id FROM cleaning_jobs j JOIN properties p ON p.id=j.property_id WHERE j.id IN (${marks})
  UNION ALL SELECT 3,'job',j.id,p.title,j.assigned_to,p.owner_id FROM cleaning_offers o JOIN cleaning_jobs j ON j.id=o.job_id JOIN properties p ON p.id=j.property_id WHERE o.id IN (${marks})
  UNION ALL SELECT 4,'job',j.id,p.title,j.assigned_to,p.owner_id FROM applications x JOIN cleaning_jobs j ON j.id=x.job_id JOIN properties p ON p.id=j.property_id WHERE x.id IN (${marks})
  UNION ALL SELECT 5,'property',p.id,p.title,'',p.owner_id FROM properties p WHERE p.id IN (${marks}) ORDER BY 1`,...ids,...ids,...ids,...ids,...ids,...ids);
 for(const item of found){
  if(item.kind==='booking'&&(role==='guest'?item.a===userId:role==='owner'&&item.b===userId))return {url:base+'bookings?entity='+item.id,title:'Бронь · '+item.title};
  if(item.kind==='job'&&role==='owner'&&item.b===userId)return {url:base+'cleaning?entity='+item.id,title:'Уборка · '+item.title};
  if(item.kind==='job'&&role==='cleaner'){
   const mine=item.a===userId||!!await one(db,'SELECT 1 FROM applications WHERE job_id=? AND user_id=?',item.id,userId);
   return {url:base+(mine?'assignments':'jobs')+'?entity='+item.id,title:'Уборка · '+item.title};
  }
  if(item.kind==='property'&&role==='owner'&&item.b===userId)return {url:base+'properties?entity='+item.id,title:'Квартира · '+item.title};
 }
 return null;
}
export async function deliverWebPush(db:D1Database,config:OperationConfig,limit=12,transport:typeof fetch=fetch){
 if(!pushConfigured(config))return {configured:false,sent:0,failed:0};
 const now=epoch();
 // Expired/revoked sessions cannot retain an endpoint, even if no deliveries are due.
 await q(db,'DELETE FROM push_subscriptions WHERE NOT EXISTS(SELECT 1 FROM auth_sessions a JOIN auth_accounts c ON c.id=a.user_id AND c.credential_version=a.credential_version WHERE a.hash=push_subscriptions.session_hash AND a.user_id=push_subscriptions.user_id AND a.expires_at>?)',now).run();
 await q(db,"DELETE FROM push_deliveries WHERE status='sent' AND sent_at<?",now-7*86400).run();
 const due=await rows(db,`SELECT d.*,n.dedupe,n.body notice_body,s.ciphertext,ps.id price_id,ps.status price_status,ps.direction price_direction,ps.percent price_percent,ps.policy_version price_version,ps.from_daily price_from,ps.to_daily price_to,pr.title price_title,cw.id window_id,cw.status window_status,cw.start window_start,cw.end window_end,cw.percent window_percent,cw.hourly_from window_from,cw.hourly_to window_to,wp.title window_title,so.id stay_id,so.status stay_status,so.kind stay_kind,so.start stay_start,so.end stay_end,so.amount stay_amount,so.extra stay_extra,so.base_version stay_base,so.policy_version stay_policy,so.automatic stay_auto,lf.id forecast_id,lf.status forecast_status,lf.days forecast_days,lf.advice forecast_advice,lf.policy_version forecast_version,lf.from_value forecast_from,lf.to_value forecast_to,lfp.title forecast_title,s.user_id,s.role,s.session_hash,p.settings FROM push_deliveries d JOIN push_subscriptions s ON s.id=d.subscription_id LEFT JOIN notifications n ON n.id=d.notification_id LEFT JOIN price_suggestions ps ON n.dedupe='owner:price:'||ps.id LEFT JOIN properties pr ON pr.id=ps.property_id LEFT JOIN calendar_windows cw ON n.dedupe='owner:window:'||cw.id LEFT JOIN properties wp ON wp.id=cw.property_id LEFT JOIN stay_offers so ON n.dedupe='guest:stay:'||so.id LEFT JOIN load_forecasts lf ON n.dedupe='owner:forecast:'||lf.id LEFT JOIN properties lfp ON lfp.id=lf.property_id LEFT JOIN assistant_preferences p ON p.user_id=s.user_id AND p.role=s.role WHERE (d.status='pending' AND d.available_at<=?) OR (d.status='sending' AND d.lease_until<=?) ORDER BY d.created_at LIMIT ?`,now,now,Math.min(30,Math.max(1,limit)));
 let sent=0,failed=0;
 const deadline=Date.now()+19000;
 for(const item of due){if(Date.now()>deadline)break;
  let settings=defaultAssistantSettings;try{settings={...settings,...JSON.parse(item.settings||'{}')};}catch{}
  if(item.notification_id&&quietNow(settings,epoch())){await q(db,"UPDATE push_deliveries SET available_at=?,status='pending',lease_until=0 WHERE id=? AND (status='pending' OR (status='sending' AND lease_until<=?))",epoch()+300,item.id,epoch()).run();continue;}
  const token=uuid(),claim=await q(db,"UPDATE push_deliveries SET status='sending',attempts=attempts+1,lease_token=?,lease_until=? WHERE id=? AND ((status='pending' AND available_at<=?) OR (status='sending' AND lease_until<=?)) RETURNING attempts",token,epoch()+90,item.id,epoch(),epoch()).first<Row>();if(!claim)continue;
  try{
   const sub=validatePushSubscription(JSON.parse(await decryptInstructions(item.ciphertext,config)));
   // Recheck current ownership, role and session immediately before external delivery.
   if(!await one(db,`SELECT 1 FROM push_subscriptions s JOIN profiles p ON p.id=s.user_id JOIN auth_sessions a ON a.hash=s.session_hash AND a.user_id=s.user_id JOIN auth_accounts c ON c.id=a.user_id AND c.credential_version=a.credential_version WHERE s.id=? AND s.ciphertext=? AND a.expires_at>? AND EXISTS(SELECT 1 FROM json_each(p.roles) WHERE value=s.role)`,item.subscription_id,item.ciphertext,epoch())){await q(db,'DELETE FROM push_subscriptions WHERE id=? AND ciphertext=?',item.subscription_id,item.ciphertext).run();continue;}
   const target=item.notification_id?await pushTarget(db,item.user_id,item.role,String(item.dedupe||'')).catch(()=>null):null;
   const request=generateRequestDetails(sub,pushPayload(item.role,!item.notification_id,String(item.dedupe||'').startsWith(item.role+':matching'),item.price_id?{id:item.price_id,status:item.price_status,direction:item.price_direction,percent:item.price_percent,policy_version:item.price_version,from_daily:item.price_from,to_daily:item.price_to,title:item.price_title}:null,item.window_id?{id:item.window_id,status:item.window_status,start:item.window_start,end:item.window_end,percent:item.window_percent,hourly_from:item.window_from,hourly_to:item.window_to,title:item.window_title}:null,item.stay_id?{id:item.stay_id,status:item.stay_status,kind:item.stay_kind,start:item.stay_start,end:item.stay_end,amount:item.stay_amount,extra:item.stay_extra,base_version:item.stay_base,policy_version:item.stay_policy,automatic:item.stay_auto}:null,item.forecast_id?{id:item.forecast_id,status:item.forecast_status,days:item.forecast_days,advice:item.forecast_advice,policy_version:item.forecast_version,from_value:item.forecast_from,to_value:item.forecast_to,title:item.forecast_title}:null,{body:item.notice_body},target),{TTL:300,urgency:'normal',vapidDetails:{subject:config.VAPID_SUBJECT!,publicKey:config.VAPID_PUBLIC_KEY!,privateKey:config.VAPID_PRIVATE_KEY!}});
   const response=await transport(request.endpoint,{method:'POST',headers:request.headers as Record<string,string>,body:new Uint8Array(request.body!) as BodyInit,redirect:'manual',signal:AbortSignal.timeout(10000)});
   await response.body?.cancel();
   if(response.status===404||response.status===410){await q(db,'DELETE FROM push_subscriptions WHERE id=?',item.subscription_id).run();continue;}
   if(!response.ok){const error=new Error(response.status===429?'rate_limit':response.status>=500?'provider_unavailable':'provider_rejected');throw error;}
   await q(db,"UPDATE push_deliveries SET status='sent',sent_at=?,lease_until=0,last_error='' WHERE id=? AND lease_token=?",epoch(),item.id,token).run();sent++;
  }catch(error){const code=['rate_limit','provider_unavailable','provider_rejected'].includes((error as Error).message)?(error as Error).message:'push_failed';await q(db,"UPDATE push_deliveries SET status=?,available_at=?,lease_until=0,last_error=? WHERE id=? AND lease_token=?",claim.attempts>=5||code==='provider_rejected'?'dead':'pending',epoch()+Math.min(3600,30*2**Math.min(claim.attempts,6)),code,item.id,token).run();failed++;}
 }
 return {configured:true,sent,failed};
}
