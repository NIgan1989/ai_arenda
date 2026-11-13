import {DomainError,number} from './domain';
import {isPlatformAdmin} from './account';
import type {RentalService} from './service';
import type {OperationConfig} from './operation-core';
import {buildRuntimeHealth} from './runtime-health';
import {integrationStatus} from './delivery';
import {securityState,decideParticipantReview} from './participant-security';
import {governanceState,savePilotPolicy,updateOperatorTicket} from './pilot-governance';
import {operationalHealth,retryBackgroundJob} from './background';
import {aiBudgetState} from './ai-budget';
import {publicPoint,mapCities} from './map-workspace';
import {AI_REVIEWER,sweepReviews} from './admin-autocheck';
import {billingState,billingOwners,saveBillingSettings,recordBalanceEntry} from './platform-billing';
type Config=OperationConfig&{PLATFORM_ADMIN_IDS?:string;ADMINISTRATOR_RUNNER_SECRET?:string;OPENAI_API_KEY?:string;OPENAI_MODEL?:string};
type Row=Record<string,any>;
export function requirePlatformAdmin(userId:string,config:Config){if(!isPlatformAdmin(userId,config.PLATFORM_ADMIN_IDS))throw new DomainError('Управление сервисом доступно только администратору.',403);}
export async function readPlatformAdmin(service:RentalService,route:string,params:Row,config:Config){
 requirePlatformAdmin(service.userId,config);
 if(route==='map'){
  const entries=await service.all("SELECT p.id,p.title,p.city,p.district,p.price,p.published,l.longitude,l.latitude,(SELECT COUNT(*) FROM bookings b WHERE b.property_id=p.id AND (b.status='confirmed' OR (b.status='requested' AND b.expires_at>unixepoch()))) bookings,(SELECT COUNT(*) FROM cleaning_jobs j WHERE j.property_id=p.id AND j.status IN ('open','assigned','in_progress','submitted')) jobs FROM properties p LEFT JOIN property_locations l ON l.property_id=p.id AND l.address_fingerprint=p.city||'|'||p.district||'|'||p.address WHERE p.demo_owner IS NULL ORDER BY p.created_at DESC,p.id LIMIT 60");
  const matching=await service.one("SELECT COUNT(*) active,SUM(status='ready') ready FROM matching_requests WHERE status IN ('searching','ready','booking') AND expires_at>unixepoch()");
  return {properties:entries.map(({longitude,latitude,...p})=>({...p,mapKey:'property:'+p.id,location:longitude!==null&&latitude!==null?publicPoint({longitude,latitude,source:'owner'}):null})),matching:{active:matching?.active||0,ready:matching?.ready||0},center:mapCities[entries[0]?.city]||mapCities['Павлодар'],limit:60};
 }
 if(route==='users')return service.listUsers(true,{role:params.role,search:params.search,page:params.page||0});
 if(route==='reviews'){
  const state=await securityState(service,'guest',true);
  // The AI administrator's checks travel with each request; requests it asks about come first, those waiting on the participant last.
  const parse=(r:Row)=>{let checks=[];try{checks=JSON.parse(r.ai_checks||'[]');}catch{}return {...r,ai_checks:checks};};
  const pendingReviews=(await service.all("SELECT r.*,u.name,p.title,p.city,p.district,p.address,p.price,COALESCE((SELECT json_array_length(d.photos) FROM property_details d WHERE d.property_id=p.id),0) photos FROM participant_reviews r JOIN profiles u ON u.id=r.user_id LEFT JOIN properties p ON p.id=r.property_id WHERE r.status='pending' ORDER BY CASE r.ai_verdict WHEN 'escalate' THEN 0 WHEN '' THEN 1 WHEN 'approve' THEN 1 ELSE 2 END,r.created_at LIMIT 100")).map(parse);
  const aiDecided=(await service.all("SELECT r.id,r.role,r.status,r.reviewed_at,r.valid_until,r.ai_checks,u.name,p.title,p.city FROM participant_reviews r JOIN profiles u ON u.id=r.user_id LEFT JOIN properties p ON p.id=r.property_id WHERE r.reviewer_id=? AND r.reviewed_at>? ORDER BY r.reviewed_at DESC LIMIT 30",AI_REVIEWER,Math.floor(Date.now()/1000)-7*86400)).map(parse);
  const policy=await service.one("SELECT ai_review,require_owner_review,require_cleaner_review,version FROM pilot_policy WHERE id='global'");
  await service.audit(service.userId,'admin.reviews_viewed').run();return {...state,pendingReviews,aiDecided,policy};
 }
 if(route==='billing/owners')return billingOwners(service,params);
 if(route==='billing'){const state=await billingState(service);await service.audit(service.userId,'admin.billing_viewed').run();return state;}
 if(route==='governance')return {...await governanceState(service,'guest',true),admissions:[],testMode:config.TEST_DATA_ONLY==='1'};
 if(route==='health')return {runtime:await buildRuntimeHealth(service.db,config),queue:await operationalHealth(service,'guest',true),integrations:integrationStatus(config),aiBudget:await aiBudgetState(service,config,true)};
 if(route==='properties'){
  const search=String(params.search||'').trim();if(search.length>100)throw new DomainError('Сократите запрос.');
  const page=number(params.page||0,'Страница',0,100000),pattern='%'+search.replace(/[\\%_]/g,'\\$&')+'%';
  const where="p.demo_owner IS NULL AND (p.title LIKE ? ESCAPE '\\' OR p.city LIKE ? ESCAPE '\\' OR o.name LIKE ? ESCAPE '\\')";
  const total=await service.one(`SELECT COUNT(*) count FROM properties p LEFT JOIN profiles o ON o.id=p.owner_id WHERE ${where}`,pattern,pattern,pattern);
  const items=await service.all(`SELECT p.id,p.title,p.city,p.district,p.price,p.published,o.name owner_name,COALESCE(json_array_length(d.photos),0) photos,EXISTS(SELECT 1 FROM property_locations l WHERE l.property_id=p.id) has_location,(SELECT r.status FROM participant_reviews r WHERE r.property_id=p.id AND r.role='owner' ORDER BY r.created_at DESC,r.rowid DESC LIMIT 1) review_status FROM properties p LEFT JOIN profiles o ON o.id=p.owner_id LEFT JOIN property_details d ON d.property_id=p.id WHERE ${where} ORDER BY p.created_at DESC,p.id LIMIT 25 OFFSET ?`,pattern,pattern,pattern,page*25);
  await service.audit(service.userId,'admin.properties_viewed').run();return {items,total:total?.count||0,page,limit:25};
 }
 if(route==='overview'){
  const [users,properties,bookings,jobs,reviews,issues,reports]=await Promise.all([
   service.one('SELECT COUNT(*) count FROM profiles'),service.one("SELECT COUNT(*) count,SUM(p.published=1) published,SUM(p.published=0) drafts,SUM(p.published=1 AND NOT EXISTS(SELECT 1 FROM property_locations l WHERE l.property_id=p.id)) unmapped,SUM(p.published=1 AND COALESCE((SELECT json_array_length(d.photos) FROM property_details d WHERE d.property_id=p.id),0)=0) without_photos FROM properties p WHERE p.demo_owner IS NULL"),service.one("SELECT COUNT(*) count FROM bookings WHERE status IN ('requested','confirmed')"),service.one("SELECT COUNT(*) count FROM cleaning_jobs WHERE status IN ('open','assigned','in_progress','submitted')"),service.one("SELECT COUNT(*) count FROM participant_reviews WHERE status='pending' AND (ai_verdict<>'fix' OR (SELECT ai_review FROM pilot_policy WHERE id='global')=0)"),service.one("SELECT COUNT(*) count FROM administrator_issues WHERE status<>'resolved'"),service.one("SELECT COUNT(*) count FROM content_reports WHERE status<>'resolved'")
  ]);
  return {counts:{users:users?.count||0,properties:properties?.count||0,published:properties?.published||0,drafts:properties?.drafts||0,unmapped:properties?.unmapped||0,withoutPhotos:properties?.without_photos||0,bookings:bookings?.count||0,jobs:jobs?.count||0,reviews:reviews?.count||0,issues:issues?.count||0,reports:reports?.count||0},runtime:await buildRuntimeHealth(service.db,config)};
 }
 throw new DomainError('Раздел управления не найден.',404);
}
export async function writePlatformAdmin(service:RentalService,route:string,body:Row,config:Config){
 requirePlatformAdmin(service.userId,config);
 if(route==='reviews/ai'){
  if(typeof body.enabled!=='boolean')throw new DomainError('Выберите, кто проверяет заявки.');
  await service.db.batch([service.query("UPDATE pilot_policy SET ai_review=?,version=version+1,updated_by=?,updated_at=unixepoch() WHERE id='global'",body.enabled?1:0,service.userId),service.audit(service.userId,'admin.ai_review_'+(body.enabled?'on':'off')),...(body.enabled?[service.query("UPDATE participant_reviews SET ai_checked_at=NULL WHERE status='pending' AND ai_verdict IN ('approve','fix')")]:[])]);
  if(body.enabled)await sweepReviews(service.db,config);
  return {message:body.enabled?'Теперь заявки проверяет ИИ-администратор, спорные приходят вам.':'Теперь все заявки решаете вы. ИИ только показывает свои проверки.'};
 }
 if(route==='reviews/decide'){if(body.confirmed!==true)throw new DomainError('Подтвердите фактическую проверку сведений.');return decideParticipantReview(service,body,true);}
 if(route==='governance/policy'){
  if(config.TEST_DATA_ONLY==='1'&&[body.requireOwnerReview,body.requireCleanerReview,body.requirePhone].some(v=>v===true))throw new DomainError('Правила рабочего сервиса настраиваются вне учебного стенда.',409);
  return savePilotPolicy(service,body,true);
 }
 if(route==='governance/ticket')return updateOperatorTicket(service,'guest',body,true);
 if(route==='billing/settings')return saveBillingSettings(service,body);
 if(route==='billing/balance')return recordBalanceEntry(service,body);
 if(route==='background/retry')return retryBackgroundJob(service,body,true);
 throw new DomainError('Операция управления не найдена.',404);
}
