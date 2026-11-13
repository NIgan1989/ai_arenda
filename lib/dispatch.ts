import {DomainError,number,required,type Role} from './domain';
import type {RentalService} from './service';
import {epoch,uuid,q,one,rows,type Row} from './operation-core';
import {cleanerStats,rankCleaners} from './cleaner-match';
import {assertPilotAllowed} from './pilot-governance';
import {availableSql,cleanerRegulars} from './regular-cleaner';
import {autopilotFits,livePlanSql} from './autopilot-plans';

export async function saveOperationRules(service:RentalService,body:Row){
 await service.requireRole('owner');const propertyId=required(body.propertyId,'Жильё',100);if(!await service.one('SELECT id FROM properties WHERE id=? AND owner_id=?',propertyId,service.userId))throw new DomainError('Жильё недоступно.',403);
 const version=number(body.expectedVersion??0,'Версия правил',0,10000000),minutes=number(body.offerMinutes,'Срок ответа, минут',2,120);
 const r=await q(service.db,`INSERT INTO operation_rules VALUES (?,?,?,?,?,?,?) ON CONFLICT(property_id) DO UPDATE SET auto_offers=excluded.auto_offers,auto_replace=excluded.auto_replace,require_photos=excluded.require_photos,offer_minutes=excluded.offer_minutes,version=excluded.version,updated_at=excluded.updated_at WHERE operation_rules.version=?`,propertyId,body.autoOffers===true?1:0,body.autoReplace===true?1:0,body.requirePhotos===true?1:0,minutes,version+1,epoch(),version).run();
 if(!r.meta.changes)throw new DomainError('Правила уже изменились.',409);await service.audit(propertyId,'operations.rules_updated').run();return {message:'Правила предложений, замены и фотоотчётов сохранены.'};
}
export async function saveWorkerDispatch(service:RentalService,body:Row){await service.requireRole('cleaner');await q(service.db,'INSERT INTO worker_dispatch VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET receive_offers=excluded.receive_offers,updated_at=excluded.updated_at',service.userId,body.receiveOffers===true?1:0,epoch()).run();return {message:body.receiveOffers?'Предложения по вашему городу включены. Каждое назначение требует вашего отклика на показанные условия.':'Новые предложения отключены. Принятые обязательства сохраняются.'};}
export async function dispatchState(service:RentalService,role:Role){
 if(role==='guest')return {offers:[],rules:[],receiveOffers:false};
 const owner=role==='owner';return {regular:owner?null:await cleanerRegulars(service),offers:await rows(service.db,`SELECT o.*,p.title,p.city,p.district,EXISTS(SELECT 1 FROM regular_cleaners rc WHERE rc.property_id=j.property_id AND rc.cleaner_id=o.worker_id) regular,CASE WHEN o.fee>0 AND ${availableSql('j.owner_id')}>=o.fee THEN 1 ELSE 0 END guaranteed FROM cleaning_offers o JOIN cleaning_jobs j ON j.id=o.job_id JOIN properties p ON p.id=j.property_id WHERE ${owner?'j.owner_id=?':'o.worker_id=?'} ORDER BY o.created_at DESC LIMIT 100`,service.userId),rules:owner?await rows(service.db,'SELECT r.*,p.title FROM operation_rules r JOIN properties p ON p.id=r.property_id WHERE p.owner_id=?',service.userId):[],receiveOffers:!!(await one(service.db,'SELECT receive_offers FROM worker_dispatch WHERE user_id=?',service.userId))?.receive_offers};
}
export async function decideOffer(service:RentalService,body:Row){
 await service.requireRole('cleaner');const offer=await one(service.db,'SELECT o.*,j.status job_status,j.version current_version,j.start current_start,j.end current_end,j.fee current_fee FROM cleaning_offers o JOIN cleaning_jobs j ON j.id=o.job_id WHERE o.id=? AND o.worker_id=?',required(body.id,'Предложение',100),service.userId);
 if(!offer)throw new DomainError('Предложение недоступно.',403);
 if(offer.status==='accepted'&&body.action==='accept')return {message:'Ваше согласие уже сохранено.'};
 if(offer.status!=='offered'||offer.expires_at<=epoch()||offer.job_status!=='open'||offer.current_version!==offer.job_version)throw new DomainError('Время предложения истекло или условия изменились.',409);
 if(!['accept','decline'].includes(body.action))throw new DomainError('Выберите ответ на предложение.');
 if(body.action==='decline'){await q(service.db,"UPDATE cleaning_offers SET status='declined',decided_at=? WHERE id=? AND status='offered'",epoch(),offer.id).run();return {message:'Отказ сохранён. Предложение перейдёт следующему исполнителю.'};}
 const job=await one(service.db,'SELECT property_id FROM cleaning_jobs WHERE id=?',offer.job_id);
 let regular=!!await one(service.db,'SELECT 1 FROM regular_cleaners WHERE property_id=? AND cleaner_id=?',job?.property_id,service.userId);
 if(regular){try{await assertPilotAllowed(service,'assignment',job!.property_id,service.userId);}catch{regular=false;}}
 const at=epoch(),auditId=uuid(),result=await service.db.batch([
  q(service.db,"UPDATE cleaning_offers SET status='accepted',decided_at=? WHERE id=? AND worker_id=? AND status='offered' AND expires_at>? AND EXISTS(SELECT 1 FROM cleaning_jobs WHERE id=? AND status='open' AND version=? AND start=? AND end=? AND fee=?) AND NOT EXISTS(SELECT 1 FROM profile_details WHERE user_id=? AND work_status='away') AND NOT EXISTS(SELECT 1 FROM cleaning_jobs WHERE assigned_to=? AND status IN ('assigned','in_progress','submitted') AND start<? AND end>?)",at,offer.id,service.userId,at,offer.job_id,offer.job_version,offer.start,offer.end,offer.fee,service.userId,service.userId,offer.end,offer.start),
  q(service.db,"INSERT INTO audit_events SELECT ?,?,?,?,? WHERE changes()>0",auditId,service.userId,offer.job_id,JSON.stringify({action:'cleaning.offer_accepted',offerId:offer.id,replacementAllowed:!!offer.replacement_allowed}),at),
  q(service.db,"INSERT INTO applications SELECT ?,job_id,worker_id,'pending',? FROM cleaning_offers WHERE id=? AND EXISTS(SELECT 1 FROM audit_events WHERE id=?) ON CONFLICT(job_id,user_id) DO UPDATE SET status='pending',created_at=excluded.created_at",uuid(),at,offer.id,auditId),
  // A regular cleaner's «yes» is the assignment: the owner chose her in advance.
  ...(regular?[
   q(service.db,"UPDATE cleaning_jobs SET assigned_to=?,status='assigned' WHERE id=? AND status='open' AND version=? AND EXISTS(SELECT 1 FROM regular_cleaners WHERE property_id=cleaning_jobs.property_id AND cleaner_id=?) AND EXISTS(SELECT 1 FROM audit_events WHERE id=?)",service.userId,offer.job_id,offer.job_version,service.userId,auditId),
   q(service.db,"UPDATE applications SET status=CASE WHEN user_id=? THEN 'accepted' ELSE 'rejected' END WHERE job_id=? AND EXISTS(SELECT 1 FROM cleaning_jobs WHERE id=? AND assigned_to=? AND status='assigned' AND version=?)",service.userId,offer.job_id,offer.job_id,service.userId,offer.job_version+1),
   q(service.db,"INSERT OR IGNORE INTO notifications SELECT ?,owner_id,'Постоянный исполнитель '||(SELECT name FROM profiles WHERE id=?)||' принял уборку «'||(SELECT title FROM properties WHERE id=cleaning_jobs.property_id)||'» и назначен на неё. Ничего делать не нужно.',?,0,? FROM cleaning_jobs WHERE id=? AND assigned_to=? AND status='assigned' AND version=?",uuid(),service.userId,'owner:regular-assigned:'+offer.job_id+':'+offer.job_version,at,offer.job_id,service.userId,offer.job_version+1)
  ]:[])
 ]);
 if(!result[0].meta.changes)throw new DomainError('Условия изменились или у вас пересекается другая работа.',409);
 if(regular&&result[3]?.meta.changes)return {message:'Уборка ваша. Адрес и контакт владельца в задании.',assigned:true};
 return {message:'Согласие на условия сохранено. Владелец или AI администратор назначит исполнителя в пределах полномочий.'};
}
export async function declineAssignment(service:RentalService,body:Row){
 await service.requireRole('cleaner');const job=await one(service.db,"SELECT * FROM cleaning_jobs WHERE id=? AND assigned_to=? AND status='assigned'",required(body.jobId,'Задание',100),service.userId);if(!job)throw new DomainError('Отказ доступен до начала назначенной работы.',409);
 const reason=required(body.reason,'Причина отказа',1000),at=epoch(),r=await service.db.batch([
  q(service.db,"UPDATE cleaning_jobs SET status='open',assigned_to=NULL WHERE id=? AND assigned_to=? AND status='assigned' AND version=?",job.id,service.userId,job.version),
  q(service.db,"UPDATE applications SET status='rejected' WHERE job_id=? AND user_id=? AND EXISTS(SELECT 1 FROM cleaning_jobs WHERE id=? AND status='open' AND version=?)",job.id,service.userId,job.id,job.version+1),
  q(service.db,"UPDATE cleaning_offers SET status='declined',decided_at=? WHERE job_id=? AND worker_id=? AND status='accepted' AND EXISTS(SELECT 1 FROM cleaning_jobs WHERE id=? AND status='open' AND version=?)",at,job.id,service.userId,job.id,job.version+1),
  q(service.db,"INSERT OR IGNORE INTO notifications SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM cleaning_jobs WHERE id=? AND status='open' AND version=?)",uuid(),job.owner_id,'Исполнитель отказался до начала уборки: '+reason,'owner:assignment-declined:'+job.id+':'+job.version,0,at,job.id,job.version+1)
 ]);if(!r[0].meta.changes)throw new DomainError('Работа уже началась или условия изменились.',409);return {message:'Отказ сохранён. Владелец уведомлён; начатая работа этим действием не закрывается.'};
}

export async function coordinateDispatch(service:RentalService){
 const at=epoch(),db=service.db;
 await q(db,"UPDATE cleaning_offers SET status='expired',decided_at=? WHERE status='offered' AND expires_at<=? AND job_id IN(SELECT id FROM cleaning_jobs WHERE owner_id=?)",at,at,service.userId).run();
 await q(db,"UPDATE cleaning_offers SET status='superseded',decided_at=? WHERE status='offered' AND job_id IN(SELECT j.id FROM cleaning_jobs j WHERE j.owner_id=? AND (j.status<>'open' OR j.version<>cleaning_offers.job_version))",at,service.userId).run();
 const late=await service.all("SELECT j.* FROM cleaning_jobs j JOIN operation_rules r ON r.property_id=j.property_id JOIN property_policies pp ON pp.property_id=j.property_id WHERE j.owner_id=? AND r.auto_replace=1 AND pp.auto_assign=1 AND (pp.mandate_until=0 OR pp.mandate_until>?) AND j.status='assigned' AND j.start+900<=? AND j.end>? AND (j.booking_id IS NULL OR EXISTS(SELECT 1 FROM booking_terms WHERE booking_id=j.booking_id AND actual_checkout IS NOT NULL)) AND EXISTS(SELECT 1 FROM cleaning_offers o WHERE o.job_id=j.id AND o.worker_id=j.assigned_to AND o.status='accepted' AND o.replacement_allowed=1 AND o.start=j.start AND o.end=j.end AND o.fee=j.fee AND o.decided_at+900<=?)",service.userId,at,at,at,at);
 for(const job of late){
  const token=uuid(),gate='EXISTS(SELECT 1 FROM audit_events WHERE id=?)';
  await db.batch([
   q(db,"UPDATE cleaning_jobs SET status='open',assigned_to=NULL WHERE id=? AND status='assigned' AND version=? AND EXISTS(SELECT 1 FROM operation_rules r JOIN property_policies p ON p.property_id=r.property_id WHERE r.property_id=cleaning_jobs.property_id AND r.auto_replace=1 AND p.auto_assign=1 AND (p.mandate_until=0 OR p.mandate_until>?))",job.id,job.version,at),
   q(db,'INSERT INTO audit_events SELECT ?,?,?,?,? WHERE changes()>0',token,'system:dispatch',job.id,JSON.stringify({action:'cleaning.no_show_replacement',onBehalfOf:service.userId,previousWorker:job.assigned_to}),at),
   q(db,`UPDATE applications SET status='rejected' WHERE job_id=? AND user_id=? AND ${gate}`,job.id,job.assigned_to,token),
   q(db,`UPDATE cleaning_offers SET status='expired',decided_at=? WHERE job_id=? AND worker_id=? AND status='accepted' AND ${gate}`,at,job.id,job.assigned_to,token),
   q(db,`INSERT OR IGNORE INTO notifications SELECT ?,?,?,?,?,? WHERE ${gate}`,uuid(),job.assigned_to,'Назначение снято: начало уборки не отмечено в согласованный срок. Если это ошибка, свяжитесь с владельцем.','cleaner:no-show:'+job.id+':'+job.version,0,at,token),
   q(db,`INSERT OR IGNORE INTO notifications SELECT ?,?,?,?,?,? WHERE ${gate}`,uuid(),service.userId,'AI администратор снял назначение по принятому правилу невыхода и ищет замену.','owner:no-show:'+job.id+':'+job.version,0,at,token)
  ]);
 }
 // Open cleanings to offer: flats where the owner turned on offers within the AI budget, and every flat with a regular cleaner.
 const jobs=await service.all(`SELECT j.*,p.title,p.city,p.district,COALESCE(r.auto_replace,0) auto_replace,COALESCE(r.offer_minutes,30) offer_minutes,pp.version policy_version,rc.cleaner_id regular_id,(SELECT name FROM profiles WHERE id=rc.cleaner_id) regular_name
  FROM cleaning_jobs j JOIN properties p ON p.id=j.property_id LEFT JOIN operation_rules r ON r.property_id=j.property_id LEFT JOIN property_policies pp ON pp.property_id=j.property_id LEFT JOIN regular_cleaners rc ON rc.property_id=j.property_id
  WHERE j.owner_id=? AND j.status='open' AND j.end>? AND (rc.cleaner_id IS NOT NULL OR (r.auto_offers=1 AND j.fee<=pp.cleaning_budget AND (pp.mandate_until=0 OR pp.mandate_until>?))) ORDER BY j.start LIMIT 50`,service.userId,at,at);
 let offered=0;
 for(const job of jobs){
  if(await one(db,"SELECT id FROM cleaning_offers WHERE job_id=? AND job_version=? AND status IN ('offered','accepted') AND (status='accepted' OR expires_at>?)",job.id,job.version,at))continue;
  // The regular cleaner always comes first, whatever her general offer setting or city, if she is free and has not answered this cleaning yet.
  const regular=job.regular_id&&await one(db,"SELECT p.id FROM profiles p WHERE p.id=? AND NOT EXISTS(SELECT 1 FROM profile_details WHERE user_id=p.id AND work_status='away') AND NOT EXISTS(SELECT 1 FROM cleaning_jobs WHERE assigned_to=p.id AND status IN ('assigned','in_progress','submitted') AND start<? AND end>?) AND NOT EXISTS(SELECT 1 FROM cleaning_offers WHERE job_id=? AND worker_id=p.id AND (job_version=? OR status IN ('declined','expired') AND start=? AND end=? AND fee=? AND (status='declined' OR replacement_allowed=1)))",job.regular_id,job.end,job.start,job.id,job.version,job.start,job.end,job.fee);
  let worker:{id:string;name?:string;reasons:string[]}|undefined,auto=false;
  if(regular){worker={id:job.regular_id,name:job.regular_name,reasons:['ваш постоянный исполнитель']};auto=await autopilotFits(db,job.regular_id,job,at);}
  else{
   const candidates=await rows(db,`SELECT p.id,p.name FROM profiles p LEFT JOIN worker_dispatch d ON d.user_id=p.id WHERE (d.receive_offers=1 OR ${livePlanSql('p.id','cleaner')}) AND p.city=? AND EXISTS(SELECT 1 FROM json_each(p.roles) WHERE value='cleaner') AND p.id<>? AND NOT EXISTS(SELECT 1 FROM profile_details WHERE user_id=p.id AND work_status='away') AND NOT EXISTS(SELECT 1 FROM cleaning_jobs WHERE assigned_to=p.id AND status IN ('assigned','in_progress','submitted') AND start<? AND end>?) AND NOT EXISTS(SELECT 1 FROM cleaning_offers WHERE job_id=? AND worker_id=p.id AND (job_version=? OR status IN ('declined','expired') AND start=? AND end=? AND fee=? AND (status='declined' OR replacement_allowed=1))) ORDER BY (SELECT COUNT(*) FROM cleaning_jobs WHERE assigned_to=p.id AND status='completed') DESC,p.created_at,p.id LIMIT 20`,job.city,service.userId,job.end,job.start,job.id,job.version,job.start,job.end,job.fee);
   // Cleaners on the «Автопилот» plan whose rules fit this cleaning get it first; among them, as among
   // everyone else, the most reliable one and the one who knows this flat comes first.
   const fitting:Row[]=[];for(const c of candidates)if(await autopilotFits(db,c.id,job,at))fitting.push(c);
   worker=rankCleaners(await cleanerStats(db,fitting.length?fitting:candidates,job.property_id,at))[0];
   auto=!!worker&&fitting.some(c=>c.id===worker!.id);
  }
  if(!worker)continue;
  const gate=regular?'EXISTS(SELECT 1 FROM regular_cleaners WHERE property_id=cleaning_jobs.property_id AND cleaner_id=?)':'(EXISTS(SELECT 1 FROM operation_rules r JOIN property_policies p ON p.property_id=r.property_id WHERE r.property_id=cleaning_jobs.property_id AND r.auto_offers=1 AND p.version=? AND cleaning_jobs.fee<=p.cleaning_budget AND (p.mandate_until=0 OR p.mandate_until>?)) OR EXISTS(SELECT 1 FROM regular_cleaners WHERE property_id=cleaning_jobs.property_id))';
  const id=uuid(),expires=Math.min(job.end,at+job.offer_minutes*60),until=new Date(expires*1000).toLocaleTimeString('ru-RU',{timeZone:'Asia/Qyzylorda',hour:'2-digit',minute:'2-digit'});
  const workerText=regular?`Уборка вашего постоянного объекта «${job.title}». Ответьте до ${until}: ваше «да» сразу назначает вас, иначе AI администратор предложит её другому исполнителю.`:'AI администратор предлагает уборку «'+job.title+'». Проверьте время, оплату и правило замены в предложении.';
  const ownerText=regular?`AI администратор предложил уборку «${job.title}» вашему постоянному исполнителю ${worker.name||''}. Если он не сможет, найдёт замену.`:(job.regular_id?`Постоянный исполнитель не может взять уборку «${job.title}». AI администратор предложил её исполнителю `:'AI администратор предложил уборку «'+job.title+'» исполнителю ')+(worker.name||'из вашего города')+': '+worker.reasons.join(', ')+'.';
  const results=await db.batch([
   q(db,`INSERT OR IGNORE INTO cleaning_offers SELECT ?,id,?,version,start,end,fee,?,'offered',?,?,NULL FROM cleaning_jobs WHERE id=? AND status='open' AND version=? AND ${gate}`,id,worker.id,job.auto_replace,at,expires,job.id,job.version,...(regular?[worker.id]:[job.policy_version,at])),
   // A cleaner on autopilot does not get the question: the AI answers for her right after this.
   ...(auto?[]:[q(db,"INSERT OR IGNORE INTO notifications SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM cleaning_offers WHERE id=?)",uuid(),worker.id,workerText,'cleaner:offer:'+id,0,at,id)]),
   // The owner sees whom the cleaning went to first and why.
   q(db,"INSERT OR IGNORE INTO notifications SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM cleaning_offers WHERE id=?)",uuid(),service.userId,ownerText,'owner:offer:'+id,0,at,id)
  ]);offered+=Number(results[0].meta.changes>0);
  if(auto&&results[0].meta.changes)await autopilotAccept(service,id,worker.id,job,workerText,at);
 }
 return {offered,replacements:late.length};
}

// The cleaner's autopilot answers «yes» with her own consent rules: the same decideOffer she would tap, as her.
// If that fails (a clash appeared), she gets the usual offer to answer herself.
async function autopilotAccept(service:RentalService,offerId:string,workerId:string,job:Row,workerText:string,at:number){
 const db=service.db,Service=service.constructor as new(db:D1Database,userId:string)=>RentalService;
 try{
  const r=await decideOffer(new Service(db,workerId),{id:offerId,action:'accept'});
  const when=new Date(job.start*1000).toLocaleString('ru-RU',{timeZone:'Asia/Qyzylorda',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'});
  await db.batch([
   q(db,'INSERT INTO audit_events VALUES (?,?,?,?,?)',uuid(),'system:cleaner-autopilot',offerId,JSON.stringify({action:'cleaning.autopilot_accepted',worker:workerId,jobId:job.id,assigned:!!(r as Row).assigned}),at),
   q(db,'INSERT OR IGNORE INTO notifications(id,user_id,body,dedupe,read,created_at) VALUES (?,?,?,?,0,?)',uuid(),workerId,`AI администратор взял для вас уборку «${job.title}» по вашим правилам: ${when}, ${new Intl.NumberFormat('ru-RU').format(job.fee)} ₸.${(r as Row).assigned?' Вы назначены.':' Владелец подтвердит назначение.'} Если не сможете, откажитесь в задании.`,'cleaner:autopilot-took:'+offerId,at)
  ]);
 }catch(e){
  if(!(e instanceof DomainError))throw e;
  await q(db,'INSERT OR IGNORE INTO notifications(id,user_id,body,dedupe,read,created_at) VALUES (?,?,?,?,0,?)',uuid(),workerId,workerText,'cleaner:offer:'+offerId,at).run();
 }
}
