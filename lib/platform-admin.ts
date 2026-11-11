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
type Config=OperationConfig&{PLATFORM_ADMIN_IDS?:string;ADMINISTRATOR_RUNNER_SECRET?:string;OPENAI_API_KEY?:string;OPENAI_MODEL?:string};
type Row=Record<string,any>;
export function requirePlatformAdmin(userId:string,config:Config){if(!isPlatformAdmin(userId,config.PLATFORM_ADMIN_IDS))throw new DomainError('Управление сервисом доступно только администратору.',403);}
export async function readPlatformAdmin(service:RentalService,route:string,params:Row,config:Config){
 requirePlatformAdmin(service.userId,config);
 if(route==='users')return service.listUsers(true,{role:params.role,search:params.search,page:params.page||0});
 if(route==='reviews'){
  const state=await securityState(service,'guest',true);
  const pendingReviews=await service.all("SELECT r.*,u.name,p.title,p.city,p.district,p.address FROM participant_reviews r JOIN profiles u ON u.id=r.user_id LEFT JOIN properties p ON p.id=r.property_id WHERE r.status='pending' ORDER BY r.created_at LIMIT 100");
  await service.audit(service.userId,'admin.reviews_viewed').run();return {...state,pendingReviews};
 }
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
   service.one('SELECT COUNT(*) count FROM profiles'),service.one("SELECT COUNT(*) count,SUM(p.published=1) published,SUM(p.published=0) drafts,SUM(p.published=1 AND NOT EXISTS(SELECT 1 FROM property_locations l WHERE l.property_id=p.id)) unmapped,SUM(p.published=1 AND COALESCE((SELECT json_array_length(d.photos) FROM property_details d WHERE d.property_id=p.id),0)=0) without_photos FROM properties p WHERE p.demo_owner IS NULL"),service.one("SELECT COUNT(*) count FROM bookings WHERE status IN ('requested','confirmed')"),service.one("SELECT COUNT(*) count FROM cleaning_jobs WHERE status IN ('open','assigned','in_progress','submitted')"),service.one("SELECT COUNT(*) count FROM participant_reviews WHERE status='pending'"),service.one("SELECT COUNT(*) count FROM administrator_issues WHERE status<>'resolved'"),service.one("SELECT COUNT(*) count FROM content_reports WHERE status<>'resolved'")
  ]);
  return {counts:{users:users?.count||0,properties:properties?.count||0,published:properties?.published||0,drafts:properties?.drafts||0,unmapped:properties?.unmapped||0,withoutPhotos:properties?.without_photos||0,bookings:bookings?.count||0,jobs:jobs?.count||0,reviews:reviews?.count||0,issues:issues?.count||0,reports:reports?.count||0},runtime:await buildRuntimeHealth(service.db,config)};
 }
 throw new DomainError('Раздел управления не найден.',404);
}
export async function writePlatformAdmin(service:RentalService,route:string,body:Row,config:Config){
 requirePlatformAdmin(service.userId,config);
 if(route==='reviews/decide'){if(body.confirmed!==true)throw new DomainError('Подтвердите фактическую проверку сведений.');return decideParticipantReview(service,body,true);}
 if(route==='governance/policy'){
  if(config.TEST_DATA_ONLY==='1'&&[body.requireOwnerReview,body.requireCleanerReview,body.requirePhone].some(v=>v===true))throw new DomainError('Правила рабочего сервиса настраиваются вне учебного стенда.',409);
  return savePilotPolicy(service,body,true);
 }
 if(route==='governance/ticket')return updateOperatorTicket(service,'guest',body,true);
 if(route==='background/retry')return retryBackgroundJob(service,body,true);
 throw new DomainError('Операция управления не найдена.',404);
}
