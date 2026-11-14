import {RentalService} from './service';
import {defaultAssistantSettings} from './assistant';
import {planAdministrator,quietNow} from './administrator';
import {mandateActive} from './rental-policy';
import type {Role} from './domain';
import {coordinateDispatch} from './dispatch';
import {askForReviews} from './stay-reviews';
import {reviewCleaning,OWNER_REVIEW_SECONDS} from './cleaning-review';
import {offerCalendarWindows} from './calendar-windows';
import {offerWeeklyForecast} from './load-forecast';
import {offerListingTip} from './listing-quality';
import {offerCleaningPriceTip} from './cleaning-price';
import {settleTestMoney} from './finance';

type Row=Record<string,any>;
// How long the owner has to agree the cleaner the AI proposes before it assigns her itself.
export const OWNER_ANSWER_SECONDS=900;
const now=()=>Math.floor(Date.now()/1000);
const all=async(db:D1Database,sql:string,...args:any[])=>(await db.prepare(sql).bind(...args).all<Row>()).results;

async function acquire(db:D1Database,key:string,seconds:number){
 const t=now(),token=crypto.randomUUID();
 const row=await db.prepare(`INSERT INTO administrator_runs(id,token,lease_until,checked_at) VALUES (?,?,?,?)
 ON CONFLICT(id) DO UPDATE SET token=excluded.token,lease_until=excluded.lease_until,checked_at=excluded.checked_at
 WHERE administrator_runs.lease_until<=? RETURNING id`).bind(key,token,t+seconds,t,t).first();
 return row?token:null;
}

async function ownerData(service:RentalService){
 const owner=service.userId;
 const [properties,bookings,jobs,applications,issues]=await Promise.all([
  service.all('SELECT p.*,o.readiness FROM properties p LEFT JOIN property_operations o ON o.property_id=p.id WHERE p.owner_id=? AND p.archived_at IS NULL',owner),
  service.all(`SELECT b.*,t.deposit,t.deposit_status,t.actual_checkin,t.actual_checkout,t.checkout_reported_at,t.paid_amount,t.deposit_returned_at,t.refund_recorded_at FROM bookings b JOIN properties p ON p.id=b.property_id LEFT JOIN booking_terms t ON t.booking_id=b.id WHERE p.owner_id=?`,owner),
  service.all("SELECT j.*,(SELECT status FROM cleaning_holds h WHERE h.job_id=j.id AND h.status IN ('due','paid')) guarantee FROM cleaning_jobs j WHERE j.owner_id=?",owner),
  service.all('SELECT a.* FROM applications a JOIN cleaning_jobs j ON j.id=a.job_id WHERE j.owner_id=?',owner),
  service.all("SELECT * FROM administrator_issues WHERE owner_id=? AND status='open'",owner)
 ]);
 const changes=await service.all('SELECT c.* FROM booking_changes c JOIN bookings b ON b.id=c.booking_id JOIN properties p ON p.id=b.property_id WHERE p.owner_id=?',owner);
 return {ownerId:owner,properties,bookings:bookings.map(b=>({...b,terms:b,changes:changes.filter(c=>c.booking_id===b.id)})),jobs,applications,issues,settings:{} as Record<string,Row>};
}

async function automaticActions(service:RentalService){
 const policies=await service.all('SELECT pp.* FROM property_policies pp JOIN properties p ON p.id=pp.property_id WHERE p.owner_id=?',service.userId);
 let actions=0;
 for(const policy of policies){
  if(!mandateActive(policy))continue;
  const delegated=new RentalService(service.db,service.userId,{propertyId:policy.property_id,policyVersion:policy.version});
  if(policy.auto_confirm){
   const requests=await service.all("SELECT b.id FROM bookings b JOIN booking_terms t ON t.booking_id=b.id WHERE b.property_id=? AND b.status='requested' AND b.expires_at>? AND t.policy_version=? AND NOT EXISTS(SELECT 1 FROM booking_risks r WHERE r.booking_id=b.id AND r.level='high')",policy.property_id,now(),policy.version);
   for(const b of requests){try{await delegated.bookingAction(b.id,{action:'confirm',cleaningFee:policy.cleaning_fee});await service.notify(service.userId,'AI администратор подтвердил заявку по вашим правилам. Оплата и депозит проверяются отдельно.','administrator-confirmed:'+b.id,'owner').run();actions++;}catch(error){if(!expectedConflict(error))throw error;}}
  }
  if(policy.auto_assign&&policy.auto_confirm){
   // The guest said they left: free the flat so the cleaner can start. The owner is told.
   const left=await service.all("SELECT b.id FROM bookings b JOIN booking_terms t ON t.booking_id=b.id WHERE b.property_id=? AND b.status='confirmed' AND t.checkout_reported_at IS NOT NULL AND t.actual_checkout IS NULL",policy.property_id);
   for(const b of left){try{await delegated.bookingAction(b.id,{action:'checkout'});await service.notify(service.userId,'AI администратор подтвердил выезд по сообщению гостя. Жильё ждёт уборки.','administrator-checkout:'+b.id,'owner').run();actions++;}catch(error){if(!expectedConflict(error))throw error;}}
   // The guest says they arrived: with payment and deposit verified the AI confirms the check-in for the owner;
   // otherwise the owner is told once that only the payment check is missing.
   const arrived=await service.all("SELECT b.id,b.guest_id,b.payment_status,t.deposit_status,p.title FROM bookings b JOIN booking_terms t ON t.booking_id=b.id JOIN properties p ON p.id=b.property_id WHERE b.property_id=? AND b.status='confirmed' AND t.checkin_reported_at IS NOT NULL AND t.actual_checkin IS NULL AND b.end>?",policy.property_id,now());
   for(const b of arrived){
    const title=b.title||'жильё';
    if(b.payment_status!=='owner_verified'||b.deposit_status==='pending'){
     // With in-app payment the guest is the one who can fix it: they are asked to pay in the booking card.
     const inApp=!!(await service.one("SELECT test_payments FROM platform_billing WHERE id='global'").catch(()=>null))?.test_payments;
     if(inApp)await service.notify(b.guest_id,'Вы на месте в «'+title+'». Оплатите '+(b.payment_status!=='owner_verified'?'проживание':'депозит')+' в карточке брони, и AI администратор сразу подтвердит заселение.','administrator-checkin-pay:'+b.id,'guest').run();
     await service.notify(service.userId,'Гость на месте в «'+title+'», но оплата или депозит ещё не подтверждены. '+(inApp?'Гостя попросили оплатить в карточке брони; после оплаты AI администратор сразу подтвердит заселение.':'Проверьте поступление, и AI администратор сразу подтвердит заселение.'),'administrator-checkin-payment:'+b.id,'owner').run();continue;}
    try{await delegated.bookingAction(b.id,{action:'checkin'});await service.notify(service.userId,'AI администратор подтвердил заселение гостя в «'+title+'» по его сообщению.','administrator-checkin:'+b.id,'owner').run();actions++;}catch(error){
     if(!expectedConflict(error))throw error;
     // Paid, but the flat is not marked ready (a new flat, or a cleaning not yet accepted): only the owner can say it is.
     const op=await service.one('SELECT readiness,active_booking_id FROM property_operations WHERE property_id=?',policy.property_id);
     if(op&&op.readiness!=='ready'&&!op.active_booking_id)await service.notify(service.userId,'Гость оплатил и уже на месте в «'+title+'», но жильё не отмечено готовым. Подтвердите готовность в карточке жилья (или примите уборку), и AI администратор сразу заселит гостя.','administrator-checkin-ready:'+b.id,'owner').run();
    }
   }
   // The AI checks each submitted cleaning report. A clean report is offered to the owner for one-tap acceptance;
   // without an answer in OWNER_REVIEW_SECONDS, or when the next guest arrives within two hours, the AI accepts it.
   const submitted=await service.all("SELECT j.*,p.title FROM cleaning_jobs j JOIN properties p ON p.id=j.property_id WHERE j.property_id=? AND j.status='submitted' ORDER BY j.end,j.id",policy.property_id);
   for(const job of submitted){
    const t=now(),review=await reviewCleaning(service.db,job),title=job.title||'жильё';
    if(!review.ok){await service.notify(service.userId,'AI администратор проверил отчёт об уборке «'+title+'» и нашёл замечания: '+review.findings.join('; ')+'. Проверьте фото и примите уборку или верните на доработку.','administrator-review-issue:'+job.id+':'+job.version,'owner').run();continue;}
    const nextGuest=await service.one("SELECT id FROM bookings WHERE property_id=? AND status IN ('requested','confirmed') AND start>? AND start<=?",policy.property_id,t-3600,t+7200);
    if(!nextGuest){
     const asked=await service.one('SELECT created_at FROM notifications WHERE user_id=? AND dedupe=?',service.userId,'owner:administrator-review:'+job.id+':'+job.version);
     if(!asked){await service.notify(service.userId,'AI администратор проверил отчёт об уборке «'+title+'»: фото до ('+review.before+') и после ('+review.after+') сделаны во время уборки, чек-лист выполнен, проблем не указано. Примите уборку в карточке, или через час ИИ примет сам.','administrator-review:'+job.id+':'+job.version,'owner').run();continue;}
     if(asked.created_at+OWNER_REVIEW_SECONDS>t)continue;
    }
    try{await delegated.jobAction(job.id,{action:'approve',expectedVersion:job.version});await service.notify(service.userId,'AI администратор принял уборку «'+title+'» по фотоотчёту. Жильё готово к заселению.','administrator-approved:'+job.id,'owner').run();actions++;}catch(error){if(!expectedConflict(error))throw error;}
   }
   actions+=await settleTestMoney(service,policy.property_id);
  }
  if(policy.auto_assign){
   const jobs=await service.all("SELECT j.*,p.title FROM cleaning_jobs j JOIN properties p ON p.id=j.property_id WHERE j.property_id=? AND j.status='open' AND j.end>? AND j.fee<=? ORDER BY j.start,j.id",policy.property_id,now(),policy.cleaning_budget);
   for(const job of jobs){
    // A pending application is consent to these conditions. Never assign a person who did not apply.
    const candidates=await service.all(`SELECT a.id,a.created_at,p.name FROM applications a JOIN profiles p ON p.id=a.user_id
     WHERE a.job_id=? AND a.status='pending' AND EXISTS(SELECT 1 FROM json_each(p.roles) WHERE value='cleaner')
     AND NOT EXISTS(SELECT 1 FROM profile_details d WHERE d.user_id=a.user_id AND d.work_status='away')
     AND NOT EXISTS(SELECT 1 FROM cleaning_jobs j WHERE j.assigned_to=a.user_id AND j.status IN ('assigned','in_progress','submitted') AND j.start<? AND j.end>?)
     ORDER BY a.created_at,a.id`,job.id,job.end,job.start);
    // The owner agrees the cleaner: the AI proposes the first one who applied and assigns by itself
    // only if the owner has not answered OWNER_ANSWER_SECONDS after the proposal, or the cleaning starts within the hour.
    // The proposal notification is the record of when the owner was asked, however old the application is.
    const first=candidates[0],t=now();
    if(first&&job.start>t+3600){
     const proposed=await service.one('SELECT created_at FROM notifications WHERE user_id=? AND dedupe=?',service.userId,'owner:administrator-propose:'+first.id);
     if(!proposed){await service.notify(service.userId,'AI администратор предлагает исполнителя '+first.name+' на уборку «'+(job.title||'жильё')+'». Назначьте исполнителя в карточке уборки, или через 15 минут ИИ назначит сам.','administrator-propose:'+first.id,'owner').run();continue;}
     if(proposed.created_at+OWNER_ANSWER_SECONDS>t)continue;
    }
    for(const candidate of candidates){try{await delegated.jobAction(job.id,{action:'assign',applicationId:candidate.id,expectedVersion:job.version});await service.notify(service.userId,'AI администратор назначил свободного исполнителя из откликнувшихся в пределах вашего лимита уборки.','administrator-assigned:'+job.id+':'+job.version,'owner').run();actions++;break;}catch(error){if(!expectedConflict(error))throw error;}}
   }
  }
 }
 return actions;
}
function expectedConflict(error:unknown){return [400,403,404,409].includes((error as Row)?.status)||/cleaner_overlap|booking_overlap/.test(String(error));}

export async function checkAdministratorOwner(db:D1Database,ownerId:string){
 const key='owner:'+ownerId,token=await acquire(db,key,120);
 if(!token)return {checked:false,actions:0};
 const service=new RentalService(db,ownerId),t=now();
 try{
  if(!await service.one('SELECT id FROM properties WHERE owner_id=? LIMIT 1',ownerId))return {checked:false,actions:0};
  // Expiry is a calendar fact; it never implies a physical checkout or completed work.
  const expired=await service.all("SELECT b.id,b.guest_id FROM bookings b JOIN properties p ON p.id=b.property_id WHERE p.owner_id=? AND b.status='requested' AND b.expires_at<=?",ownerId,t);
  for(const b of expired){
   await db.batch([
    service.query("UPDATE bookings SET status='expired' WHERE id=? AND status='requested' AND expires_at<=?",b.id,t),
    service.notify(b.guest_id,'AI администратор: срок заявки истёк. Интервал больше не удерживается; выберите даты заново.','expired:'+b.id,'guest'),
    service.notify(ownerId,'AI администратор: заявка истекла без решения. Проверьте новые обращения.','expired:'+b.id,'owner')
   ]);
  }
  await service.query("UPDATE booking_changes SET status='expired',decided_at=? WHERE status='pending' AND expires_at<=? AND booking_id IN(SELECT b.id FROM bookings b JOIN properties p ON p.id=b.property_id WHERE p.owner_id=?)",t,t,ownerId).run();
  await coordinateDispatch(service);
  await askForReviews(service);
  // Gaps between stays: optional advice, a failure never stops the owner's check.
  try{await offerCalendarWindows(db,ownerId,t);}catch(error){console.error('Calendar windows failed',error instanceof Error?error.message:'');}
  // The week ahead: once a week, the same rule: advice only, a failure never stops the check.
  try{await offerWeeklyForecast(db,ownerId,t);}catch(error){console.error('Load forecast failed',error instanceof Error?error.message:'');}
  try{await offerListingTip(db,ownerId,t);}catch(error){console.error('Listing tip failed',error instanceof Error?error.message:'');}
  try{await offerCleaningPriceTip(db,ownerId,t);}catch(error){console.error('Cleaning price tip failed',error instanceof Error?error.message:'');}
  const actions=await automaticActions(service),data=await ownerData(service),tasks=planAdministrator(data,t);
  // Renew before writes; a superseded scan cannot close another scan's tasks.
  const renew=async()=>{const r=await service.query('UPDATE administrator_runs SET lease_until=? WHERE id=? AND token=?',now()+120,key,token).run();if(!r.meta.changes)throw new Error('Administrator lease was superseded');};
  await renew();let processed=0;
  for(const task of tasks){
   if(processed++%20===0)await renew();
   await service.query(`INSERT INTO administrator_tasks(id,owner_id,user_id,role,property_id,entity_kind,entity_id,stage,title,reason,section,deadline,priority,first_seen,updated_at,seen_run)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,reason=excluded.reason,section=excluded.section,deadline=excluded.deadline,priority=excluded.priority,status='open',resolved_at=NULL,first_seen=CASE WHEN administrator_tasks.status='resolved' THEN excluded.first_seen ELSE administrator_tasks.first_seen END,last_notified=CASE WHEN administrator_tasks.status='resolved' THEN 0 ELSE administrator_tasks.last_notified END,notified_priority=CASE WHEN administrator_tasks.status='resolved' THEN 0 ELSE administrator_tasks.notified_priority END,updated_at=excluded.updated_at,seen_run=excluded.seen_run`,task.id,task.owner_id,task.user_id,task.role,task.property_id,task.entity_kind,task.entity_id,task.stage,task.title,task.reason,task.section,task.deadline,task.priority,t,t,token).run();
  }
  // Only a complete successful scan can close tasks that no longer have a factual cause.
  await renew();await service.query("UPDATE administrator_tasks SET status='resolved',resolved_at=?,updated_at=? WHERE owner_id=? AND status='open' AND seen_run<>? AND EXISTS(SELECT 1 FROM administrator_runs WHERE id=? AND token=?)",t,t,ownerId,token,key,token).run();
  const persisted=await service.all("SELECT * FROM administrator_tasks WHERE owner_id=? AND status='open'",ownerId);
  for(const task of persisted){
   const settings=data.settings[task.user_id+':'+task.role]||defaultAssistantSettings;
   const priority=task.priority>=2&&task.first_seen+settings.repeatMinutes*120<=t?3:task.priority;
   if(priority!==task.priority)await service.query('UPDATE administrator_tasks SET priority=? WHERE id=?',priority,task.id).run();
   if(priority<2||settings.mode==='reactive'||quietNow(settings,t)&&!(settings.urgentInQuiet&&priority===3))continue;
   if(task.last_notified&&task.last_notified+settings.repeatMinutes*60>t&&task.notified_priority>=priority)continue;
   const noticeToken=crypto.randomUUID();
   await db.batch([
    service.query('UPDATE administrator_tasks SET last_notified=?,notified_priority=?,notice_revision=notice_revision+1,notice_run=? WHERE id=? AND status=\'open\' AND (last_notified=0 OR last_notified+?<=? OR notified_priority<?)',t,priority,noticeToken,task.id,settings.repeatMinutes*60,t,priority),
    service.query(`INSERT OR IGNORE INTO notifications SELECT ?,user_id,?,role||':administrator:'||id||':'||notice_revision,0,? FROM administrator_tasks WHERE id=? AND notice_run=?`,crypto.randomUUID(),'AI администратор: '+(priority===3?'Требует внимания. ':'')+task.title+'. '+task.reason,t,task.id,noticeToken)
   ]);
  }
  await service.query("UPDATE administrator_runs SET last_success=?,last_error='',lease_until=? WHERE id=? AND token=?",now(),now()+30,key,token).run();
  return {checked:true,actions,tasks:tasks.length};
 }catch(error){
  await service.query("UPDATE administrator_runs SET last_error='Проверка не завершена',lease_until=? WHERE id=? AND token=?",now()+15,key,token).run();
  throw error;
 }finally{
  await service.query('UPDATE administrator_runs SET lease_until=MIN(lease_until,?) WHERE id=? AND token=?',now()+30,key,token).run();
 }
}

export async function checkAdministratorForUser(db:D1Database,userId:string,role:Role){
 const owners=role==='owner'?[{owner_id:userId}]:await all(db,role==='guest'?
  "SELECT DISTINCT p.owner_id FROM bookings b JOIN properties p ON p.id=b.property_id WHERE b.guest_id=? AND (b.status IN ('requested','confirmed') OR b.end>unixepoch()-604800)":
  "SELECT DISTINCT owner_id FROM cleaning_jobs WHERE assigned_to=? AND (status IN ('assigned','in_progress','submitted') OR end>unixepoch()-604800)",userId);
 for(const owner of owners)await checkAdministratorOwner(db,owner.owner_id);
}

export async function runAdministrator(db:D1Database){
 const token=await acquire(db,'scheduler',120);if(!token)return {checked:0,actions:0,busy:true};
 let checked=0,actions=0,failures=0;
 try{
  const run=await db.prepare("SELECT cursor,last_success FROM administrator_runs WHERE id='scheduler'").first<Row>();
  let owners=await all(db,'SELECT DISTINCT owner_id FROM properties WHERE owner_id>? ORDER BY owner_id LIMIT 25',run?.cursor||'');
  if(!owners.length)owners=await all(db,'SELECT DISTINCT owner_id FROM properties ORDER BY owner_id LIMIT 25');
  for(const owner of owners){try{const result=await checkAdministratorOwner(db,owner.owner_id);checked+=Number(result.checked);actions+=result.actions;}catch{failures++;}}
  await db.prepare("UPDATE administrator_runs SET cursor=?,last_success=?,last_error=?,lease_until=? WHERE id='scheduler' AND token=?").bind(owners.at(-1)?.owner_id||'',failures?run?.last_success||0:now(),failures?'Есть незавершённые проверки':'',now()+15,token).run();
  return {checked,actions,failures};
 }catch(error){
  await db.prepare("UPDATE administrator_runs SET last_error='Планировщик остановился с ошибкой',lease_until=? WHERE id='scheduler' AND token=?").bind(now()+15,token).run();throw error;
 }
}
