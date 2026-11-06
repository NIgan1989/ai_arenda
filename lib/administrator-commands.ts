import {DomainError,required,number,interval,type Role} from './domain';
import type {RentalService} from './service';
import {coordinateDispatch} from './dispatch';
import {epoch,uuid,q,one,rows,hash,type Row} from './operation-core';

export type PreparedCommand={id:string;kind:string;preview:Row;status:string;version:number;expires_at:number};
export async function listCommands(service:RentalService,role:Role){return (await rows(service.db,'SELECT id,kind,preview,status,version,expires_at,result,lease_until FROM administrator_commands WHERE user_id=? AND role=? ORDER BY created_at DESC LIMIT 30',service.userId,role)).map(c=>({...c,preview:JSON.parse(c.preview),result:c.result?JSON.parse(c.result):null}));}
export async function prepareAdministratorCommand(service:RentalService,role:Role,args:Row,requestKey:string){
 await service.authorizeWorkspace(role,'chat');const kind=required(args.action,'Действие',50);
 if(kind==='show_status'){const state=await service.roleState(role),tasks=state.administrator.tasks.slice(0,5);return {text:'На контроле '+state.administrator.total+' шагов, требуют внимания '+state.administrator.urgent+'. '+tasks.map((t:Row)=>t.title+' ('+t.role+')').join('; '),commands:[]};}
 let payload:Row,preview:Row;
 if(kind==='create_cleaning'){
  if(role!=='owner')throw new DomainError('Создать уборку может владелец.',403);const property=await service.one('SELECT p.*,pp.version policy_version,pp.cleaning_budget FROM properties p LEFT JOIN property_policies pp ON pp.property_id=p.id WHERE p.id=? AND p.owner_id=?',required(args.propertyId,'Квартира',100),service.userId);if(!property)throw new DomainError('Квартира недоступна.',403);
  const dates=interval(args.start,args.end),fee=number(args.fee,'Стоимость уборки',100,1000000);if(!property.policy_version||fee>property.cleaning_budget)throw new DomainError('Сначала задайте в правилах квартиры достаточный лимит уборки.',409);
  const occupied=await service.one("SELECT id FROM bookings WHERE property_id=? AND (status='confirmed' OR (status='requested' AND expires_at>?)) AND start<? AND occupied_until>? UNION ALL SELECT id FROM cleaning_jobs WHERE property_id=? AND status IN ('open','assigned','in_progress','submitted') AND start<? AND end>?",property.id,epoch(),dates.end,dates.start,property.id,dates.end,dates.start);if(occupied)throw new DomainError('У квартиры уже есть бронь или уборка на это время.',409);
  payload={propertyId:property.id,start:new Date(dates.start*1000).toISOString(),end:new Date(dates.end*1000).toISOString(),fee,description:required(args.note,'Состав работ',1500),policyVersion:property.policy_version};preview={title:'Создать уборку',subject:property.title,start:dates.start,end:dates.end,amount:fee,currency:'KZT',description:payload.description};
 }else if(kind==='extend_booking'){
  if(role!=='guest')throw new DomainError('Продление в этом поручении запрашивает гость. Владелец может предложить новые условия из карточки брони.',403);
  const bookingId=required(args.bookingId,'Бронь',100),booking=await service.one("SELECT b.*,p.title FROM bookings b JOIN properties p ON p.id=b.property_id WHERE b.id=? AND b.guest_id=? AND b.status='confirmed'",bookingId,service.userId);if(!booking)throw new DomainError('Бронь недоступна.',403);
  const terms=await service.one('SELECT billing_mode FROM booking_terms WHERE booking_id=?',bookingId),quote=await service.bookingChangeQuote(bookingId,role,{start:new Date(booking.start*1000).toISOString(),end:args.end,billingMode:terms?.billing_mode,discountPercent:0});
  if(quote.end<=booking.end)throw new DomainError('Продление должно увеличивать время выезда.');
  payload={bookingId,start:new Date(quote.start*1000).toISOString(),end:new Date(quote.end*1000).toISOString(),billingMode:quote.billingMode,discountPercent:0,expectedAmount:quote.amount,baseVersion:quote.baseVersion,policyVersion:quote.policyVersion,reason:required(args.note,'Причина',1000),acceptTerms:true};preview={title:'Запросить продление',subject:booking.title,start:quote.start,end:quote.end,amount:quote.amount,currency:'KZT',description:'Новая полная стоимость. Изменение применяется после согласования или по разрешённым правилам владельца.'};
 }else if(kind==='report_issue'){
  const isJob=!!args.jobId,id=required(isJob?args.jobId:args.bookingId,'Бронь или задание',100),state=await service.roleState(role),item=(isJob?state.jobs:state.bookings).find((v:Row)=>v.id===id&&(role!=='cleaner'||v.assigned_to===service.userId));if(!item)throw new DomainError('Запись недоступна в этой роли.',403);
  payload={entityKind:isJob?'job':'booking',entityId:id,issue:required(args.note,'Описание обращения',1500)};preview={title:'Передать обращение',subject:item.title,description:payload.issue};
 }else if(kind==='offer_cleaning'){
  if(role!=='owner')throw new DomainError('Поиск исполнителя запускает владелец.',403);const propertyId=required(args.propertyId,'Квартира',100),property=await service.one('SELECT p.title,r.auto_offers FROM properties p JOIN operation_rules r ON r.property_id=p.id WHERE p.id=? AND p.owner_id=?',propertyId,service.userId);if(!property?.auto_offers)throw new DomainError('Сначала включите предложения исполнителям в правилах квартиры.',409);payload={propertyId};preview={title:'Запустить подбор исполнителя',subject:property.title,description:'Предложения получают свободные исполнители, которые включили их приём. Назначение требует согласия на условия.'};
 }else throw new DomainError('Это действие пока не доступно через поручения.');
 const existing=await one(service.db,'SELECT * FROM administrator_commands WHERE user_id=? AND role=? AND request_key=?',service.userId,role,requestKey);if(existing)return {text:'Поручение уже подготовлено.',commands:[{...existing,preview:JSON.parse(existing.preview)}]};
 const id=uuid(),at=epoch();await q(service.db,'INSERT INTO administrator_commands(id,user_id,role,kind,payload,preview,request_key,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?)',id,service.userId,role,kind,JSON.stringify(payload),JSON.stringify(preview),requestKey,at,at+900).run();return {text:'Подготовил поручение. Проверьте условия в карточке и подтвердите выполнение.',commands:[{id,kind,preview,status:'draft',version:1,expires_at:at+900}]};
}
export async function decideAdministratorCommand(service:RentalService,role:Role,body:Row){
 await service.authorizeWorkspace(role,'chat');const id=required(body.id,'Поручение',100),command=await one(service.db,'SELECT * FROM administrator_commands WHERE id=? AND user_id=? AND role=?',id,service.userId,role);if(!command)throw new DomainError('Поручение недоступно.',403);
 if(command.status==='executed')return JSON.parse(command.result);
 if(command.status==='running'){
  const receiptKind=command.kind==='create_cleaning'?'create_job':command.kind==='report_issue'?(JSON.parse(command.payload).entityKind==='job'?'job_issue':'booking_issue'):null;
  const receipt=receiptKind?await one(service.db,'SELECT result FROM operation_receipts WHERE user_id=? AND kind=? AND request_key=?',service.userId,receiptKind,'command:'+id):null;
  if(receipt){await q(service.db,"UPDATE administrator_commands SET status='executed',result=?,lease_until=0 WHERE id=? AND status='running'",receipt.result,id).run();return JSON.parse(receipt.result);}
  if(command.kind==='extend_booking'){
   const saved=await one(service.db,'SELECT id FROM booking_changes WHERE proposed_by=? AND request_key=?',service.userId,'command:'+id);
   if(saved){const result={id:saved.id,message:'Предложение об изменении проживания сохранено.'};await q(service.db,"UPDATE administrator_commands SET status='executed',result=?,lease_until=0 WHERE id=? AND status='running'",JSON.stringify(result),id).run();return result;}
  }
 }
 if(command.expires_at<=epoch())throw new DomainError('Срок поручения истёк. Запросите актуальный расчёт.',409);
 if(body.action==='reject'){const r=await q(service.db,"UPDATE administrator_commands SET status='rejected',version=version+1 WHERE id=? AND status='draft' AND version=?",id,number(body.expectedVersion,'Версия',1,10000000)).run();if(!r.meta.changes)throw new DomainError('Поручение уже изменилось.',409);return {message:'Поручение отклонено.'};}
 if(body.action!=='execute'||body.confirmed!==true)throw new DomainError('Подтвердите показанные условия поручения.');
 const claimed=await q(service.db,"UPDATE administrator_commands SET status='running',lease_until=?,version=version+1 WHERE id=? AND version=? AND (status='draft' OR status='running' AND lease_until<=?) RETURNING version",epoch()+90,id,number(body.expectedVersion,'Версия',1,10000000),epoch()).first<Row>();if(!claimed)throw new DomainError('Поручение уже выполняется или изменилось.',409);
 const payload=JSON.parse(command.payload),requestKey='command:'+id;let result:Row;
 try{
  if(command.kind==='create_cleaning'){
   const policy=await service.one('SELECT version,cleaning_budget FROM property_policies WHERE property_id=?',payload.propertyId);if(!policy||policy.version!==payload.policyVersion||payload.fee>policy.cleaning_budget)throw new DomainError('Правила квартиры изменились. Подготовьте поручение заново.',409);
   result=await service.createJob({...payload,requestKey});
  }else if(command.kind==='extend_booking')result=await service.proposeBookingChange(payload.bookingId,role,{...payload,requestKey});
  else if(command.kind==='report_issue')result=payload.entityKind==='job'?await service.jobAction(payload.entityId,{action:'issue',issue:payload.issue,requestKey}):await service.bookingAction(payload.entityId,{action:'issue',issue:payload.issue,requestKey});
  else if(command.kind==='offer_cleaning'){
   // Dispatch writes versioned offers with a unique key; repeating the scan is safe.
   await service.requireRole('owner');const value=await coordinateDispatch(service);result={message:'Подбор проверен. Новых предложений: '+value.offered+'. Без подтверждённого согласия исполнитель не назначается.'};
  }else throw new DomainError('Неизвестный вид поручения.');
  await q(service.db,"UPDATE administrator_commands SET status='executed',result=?,lease_until=0 WHERE id=? AND version=? AND status='running'",JSON.stringify(result),id,claimed.version).run();return result;
 }catch(error){if(error instanceof DomainError)await q(service.db,"UPDATE administrator_commands SET status='failed',result=?,lease_until=0 WHERE id=? AND version=? AND status='running'",JSON.stringify({message:error.message}),id,claimed.version).run();throw error;}
}
