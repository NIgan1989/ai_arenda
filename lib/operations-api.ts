import {safetyState,safetyAction} from './account-safety';
import {matchingAction} from './smart-matching';
import {aiDataPermission,saveAIDataPermission} from './ai-data-permission';
import {buildJourneyRoute} from './journey-routing';
import {mapSearch,saveMapPoint,journeyAction,geocodeFlat,placeFlatByAddress} from './map-workspace';
import {administratorConversation} from './administrator-conversation';
import {DomainError,required,type Role} from './domain';
import {RentalService} from './service';
import {financeState,recordFinance,createPaymentIntent,acceptPaymentEvent} from './finance';
import {dispatchState,saveOperationRules,saveWorkerDispatch,decideOffer,declineAssignment} from './dispatch';
import {saveEvidence,listEvidence,readEvidence} from './evidence';
import {calendarSources,saveCalendarSource,refreshCalendar,commitCalendarImport,previewCalendarImport,createCalendarExport,exportCalendar} from './external-calendar';
import {importState,previewPropertyImport,commitPropertyImport} from './property-import';
import {governanceState,savePilotPolicy,updateOperatorTicket} from './pilot-governance';
import {deliveryState,createTelegramLink,setDeliveryChannel,acceptTelegramLink,integrationStatus,acceptDeliveryReceipt} from './delivery';
import {securityState,requestPhoneCode,verifyPhoneCode,requestParticipantReview,decideParticipantReview,savePropertyAccess,revealPropertyAccess} from './participant-security';
import {operationalHealth,retryBackgroundJob} from './background';
import {listCommands,decideAdministratorCommand} from './administrator-commands';
import {epoch,q,one,rows,validSignature,type Row,type OperationConfig} from './operation-core';
import {aiBudgetState,saveAIBudget} from './ai-budget';
import {boundedRequestText} from './request-body';
import {discussionCandidates,openDiscussion,readDiscussion,sendDiscussionMessage,discussionInbox,discussionPhoto,discussionTyping,discussionAvatar} from './process-discussions';

const active=(role:Role,allowed:Role[])=>{if(!allowed.includes(role))throw new DomainError('Операция недоступна в текущей роли.',403);};
export async function readOperations(service:RentalService,role:Role,path:string[],config:OperationConfig={},platformAdmin=false){
 await service.authorizeWorkspace(role,'operations');
 const route=path.join('/');
 if(route==='discussion/blocks')return {userId:service.userId,blocks:await rows(service.db,'SELECT room_id FROM discussion_blocks WHERE blocker_id=? AND blocker_role=?',service.userId,role)};
 if(route==='ai-data-permission')return {permission:await aiDataPermission(service)};
 if(route==='safety')return safetyState(service,role,platformAdmin);
 if(route==='administrator/conversation')return administratorConversation(service,role);
 if(route==='discussion/inbox')return discussionInbox(service,role);
 if(route==='discussion/candidates')return discussionCandidates(service,role);
 if(route==='commands')return {commands:await listCommands(service,role)};
 if(route==='import/state'){active(role,['owner']);return importState(service);}
 if(path[0]==='evidence'&&path[1])return path[2]==='photo'?readEvidence(service,role,path[1],config):{photos:await listEvidence(service,role,path[1])};
 if(route!=='state')throw new DomainError('Раздел не найден.',404);
 const [finance,dispatch,delivery,security,health,commands]=await Promise.all([financeState(service,role),dispatchState(service,role),deliveryState(service,role,config),securityState(service,role,platformAdmin),operationalHealth(service,role,platformAdmin),listCommands(service,role)]);
 const properties=role==='owner'?await rows(service.db,'SELECT p.id,p.title,COALESCE(r.version,0) rules_version,COALESCE(r.auto_offers,0) auto_offers,COALESCE(r.auto_replace,0) auto_replace,COALESCE(r.require_photos,0) require_photos,COALESCE(r.offer_minutes,10) offer_minutes,COALESCE(a.version,0) access_version FROM properties p LEFT JOIN operation_rules r ON r.property_id=p.id LEFT JOIN property_access a ON a.property_id=p.id WHERE p.owner_id=? ORDER BY p.created_at DESC',service.userId):[];
 const sources=role==='owner'?await calendarSources(service):[];
 return {finance,dispatch,delivery,security,health:{...health,cloudBackupConfigured:!!(config.BUCKET&&config.ACCESS_ENCRYPTION_KEY)},commands,properties,sources,aiBudget:await aiBudgetState(service,config,platformAdmin),governance:{...await governanceState(service,role,platformAdmin),testMode:config.TEST_DATA_ONLY==='1'},imports:role==='owner'?await importState(service):null,configured:integrationStatus(config),photoStorage:config.BUCKET?'object-storage':'local-database',providers:{kaspi:'not_connected',halyk:'not_connected',note:'Прямой банковский адаптер подключается после договора и получения документированного API. Общий шлюз работает по проверяемому контракту.'}};
}
export async function writeOperations(service:RentalService,role:Role,path:string[],body:Row,config:OperationConfig={},platformAdmin=false){
 await service.authorizeWorkspace(role,'operations');const route=path.join('/');
 if(path[0]==='matching')return matchingAction(service,role,path[1],body);
 if(route==='ai-data-permission')return saveAIDataPermission(service,body);
 if(path[0]==='safety')return safetyAction(service,role,path[1],body,platformAdmin);
 if(route==='administrator/history')return administratorConversation(service,role,body.before);
 if(route==='map/route')return buildJourneyRoute(service,role,body,config);
 if(route==='map/search')return mapSearch(service,role,body,config);
 if(route==='map/location')return saveMapPoint(service,role,body);
 if(route==='map/geocode')return geocodeFlat(service,role,body);
 if(route==='map/place')return placeFlatByAddress(service,role,body);
 if(path[0]==='map'&&path[1]==='journey')return journeyAction(service,role,path[2],body);
 if(route==='discussion/open')return openDiscussion(service,role,body);
 if(route==='discussion/read')return readDiscussion(service,role,body);
 if(route==='discussion/avatar')return discussionAvatar(service,role,body);
 if(route==='discussion/photo')return discussionPhoto(service,role,body);
 if(route==='discussion/typing')return discussionTyping(service,role,body);
 if(route==='discussion/send')return sendDiscussionMessage(service,role,body);
 if(route==='ai-budget')return saveAIBudget(service,body);
 if(route==='commands')return decideAdministratorCommand(service,role,body);
 if(route==='import/preview'){active(role,['owner']);return previewPropertyImport(service,body);}
 if(route==='import/commit'){active(role,['owner']);return commitPropertyImport(service,body);}
 if(route==='governance/policy'){if(platformAdmin&&config.TEST_DATA_ONLY==='1'&&[body.requireOwnerReview,body.requireCleanerReview,body.requirePhone].some(v=>v===true))throw new DomainError('На учебном стенде обязательные проверки отключены, чтобы проходить тестовые процессы. Рабочие проверки настраиваются отдельно.',409);return savePilotPolicy(service,body,platformAdmin);}
 if(route==='governance/ticket')return updateOperatorTicket(service,role,body,platformAdmin);
 if(route==='delivery/telegram')return createTelegramLink(service,role,config);
 if(route==='delivery/channel')return setDeliveryChannel(service,role,body,config);
 if(route==='finance'){active(role,['owner']);return recordFinance(service,body);}
 if(route==='payment-intent'){active(role,['guest']);return createPaymentIntent(service,body,config);}
 if(route==='dispatch/preferences'){active(role,['cleaner']);return saveWorkerDispatch(service,body);}
 if(route==='dispatch/offer'){active(role,['cleaner']);return decideOffer(service,body);}
 if(route==='dispatch/decline'){active(role,['cleaner']);return declineAssignment(service,body);}
 if(route==='rules'){active(role,['owner']);return saveOperationRules(service,body);}
 if(route==='evidence'){active(role,['cleaner']);return saveEvidence(service,body,config);}
 if(route==='calendar/source'){active(role,['owner']);if(body.ics)throw new DomainError('Создайте источник, затем проверьте файл в предпросмотре.');return saveCalendarSource(service,body,config);}
 if(route==='calendar/preview'){active(role,['owner']);return previewCalendarImport(service,body);}
 if(route==='calendar/import'){active(role,['owner']);return commitCalendarImport(service,body);}
 if(route==='calendar/refresh'){active(role,['owner']);const source=await one(service.db,'SELECT id FROM calendar_sources WHERE id=? AND owner_id=? AND enabled=1',required(body.sourceId,'Источник',100),service.userId);if(!source)throw new DomainError('Источник недоступен.',403);return refreshCalendar(service.db,source.id,config);}
 if(route==='calendar/export'){active(role,['owner']);return createCalendarExport(service,body,config);}
 if(route==='calendar/revoke'){active(role,['owner']);const propertyId=required(body.propertyId,'Квартира',100);await q(service.db,'UPDATE calendar_exports SET revoked_at=? WHERE property_id=? AND owner_id=? AND revoked_at IS NULL',epoch(),propertyId,service.userId).run();return {message:'Ранее выданные ссылки на календарь отозваны.'};}
 if(route==='phone/request')return requestPhoneCode(service,config);
 if(route==='phone/verify')return verifyPhoneCode(service,body);
 if(route==='reviews/request')return requestParticipantReview(service,role,body,config);
 if(route==='reviews/decide')return decideParticipantReview(service,body,platformAdmin);
 if(route==='access/save'){active(role,['owner']);return savePropertyAccess(service,body,config);}
 if(route==='access/open')return revealPropertyAccess(service,role,body,config);
 if(route==='background/retry'){active(role,['owner']);return retryBackgroundJob(service,body,platformAdmin);}
 throw new DomainError('Операция не найдена.',404);
}
export async function publicOperationsRequest(db:D1Database,request:Request,path:string[],config:OperationConfig){
 if(request.method==='GET'&&path.length===3&&path[0]==='calendar'&&path[1]==='feed'){
  if(!/^[a-f0-9]{48}(?:\.ics)?$/.test(path[2]))throw new DomainError('Календарь недоступен.',404);
  return new Response(await exportCalendar(db,path[2].replace(/\.ics$/,'')),{headers:{'Content-Type':'text/calendar; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 }
 if(path.length!==2||path[0]!=='hooks')return null;
 if(request.method!=='POST')throw new DomainError('Используйте POST.',405);
 const raw=await boundedRequestText(request,64000);
 if(path[1]==='telegram'){let body:Row;try{body=JSON.parse(raw);}catch{throw new DomainError('Неверный формат события.');}return Response.json(await acceptTelegramLink(db,body,request.headers.get('X-Telegram-Bot-Api-Secret-Token'),config));}
 if(path[1]==='payment'){
  if(!await validSignature(config.PAYMENT_WEBHOOK_SECRET,raw,request.headers.get('X-Event-Timestamp'),request.headers.get('X-Event-Signature')))throw new DomainError('Подпись события не подтверждена.',403);
  return Response.json(await acceptPaymentEvent(db,raw,id=>new RentalService(db,id)));
 }
 if(path[1]==='delivery'){
  if(!await validSignature(config.DELIVERY_WEBHOOK_SECRET,raw,request.headers.get('X-Event-Timestamp'),request.headers.get('X-Event-Signature')))throw new DomainError('Подпись доставки не подтверждена.',403);
  return Response.json(await acceptDeliveryReceipt(db,raw));
 }
 throw new DomainError('Обработчик не найден.',404);
}
