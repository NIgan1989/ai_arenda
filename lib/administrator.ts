import type {Role} from './domain';

type Row=Record<string,any>;
export type AdministratorTask={id:string;owner_id:string;user_id:string;role:Role;property_id:string;entity_kind:string;entity_id:string;stage:string;title:string;reason:string;section:string;deadline:number;priority:number};
export const administratorStages=['Заявка','Оплата и депозит','Подготовка','Заселение','Проживание','Выезд','Уборка','Приёмка','Расчёты'];
export function quietNow(settings:Row,t:number){
 const value=(s:string)=>{const [h,m]=s.split(':').map(Number);return h*60+m;};
 const minute=Math.floor(((t+18000)%86400)/60),start=value(settings.quietStart),end=value(settings.quietEnd);
 return !!settings.quietEnabled&&(start<end?minute>=start&&minute<end:minute>=start||minute<end);
}

// Facts and deadlines drive the workflow. The model never invents completion events.
export function planAdministrator(data:Row,t:number):AdministratorTask[]{
 const tasks:AdministratorTask[]=[],owner=data.ownerId,properties=new Map<string,Row>((data.properties||[]).map((p:Row)=>[p.id,p]));
 const add=(item:Row,kind:string,stage:string,user:string,role:Role,title:string,reason:string,deadline:number,priority=2)=>{
  if(!user)return;
  tasks.push({id:JSON.stringify([owner,kind,item.id,stage,user,role]),owner_id:owner,user_id:user,role,property_id:item.property_id,entity_kind:kind,entity_id:item.id,stage,title,reason,section:kind==='job'?(role==='owner'?'cleaning':'assignments'):kind==='property'?'properties':kind==='issue'?'assistant':'bookings',deadline,priority});
 };
 const setting=(user:string,role:Role)=>data.settings?.[user+':'+role]||{leadMinutes:60};
 const due=(at:number,user:string,role:Role)=>at<=t+setting(user,role).leadMinutes*60;
 const bookingTask=(b:Row,stage:string,title:string,reason:string,at:number,roles:Role[]= ['owner','guest'],urgent=false)=>{
  const guestTitles:Record<string,string>={payment:'Согласовать оплату и дождаться проверки',deposit:'Передать депозит и дождаться проверки',checkin:'Уточнить готовность к заселению',checkout:'Сообщить о фактическом выезде'};
  for(const role of roles){const user=role==='owner'?owner:b.guest_id;if(due(at,user,role))add(b,'booking',stage,user,role,role==='guest'?guestTitles[stage]||title:title,reason,at,urgent||at<=t?3:2);}
 };
 for(const b of data.bookings||[]){
  const p=properties.get(b.property_id),terms=b.terms||{},subject=p?.title||b.title||'Жильё';
  if(b.status==='requested'&&b.expires_at>t){
   add(b,'booking','request',owner,'owner','Рассмотреть заявку',subject+' · ожидается решение владельца',b.expires_at,b.expires_at-t<=600?3:2);
   add(b,'booking','request',b.guest_id,'guest','Ожидается решение по заявке',subject+' · резерв действует до срока в карточке',b.expires_at,1);
  }
  for(const c of b.changes||[])if(c.status==='pending'&&c.expires_at>t){
   const role=c.proposer_role==='owner'?'guest':'owner',user=role==='owner'?owner:b.guest_id;
   add(b,'booking','change:'+c.id,user,role,'Согласовать новые условия',subject+' · действуют прежние даты до принятия предложения',c.expires_at,c.expires_at-t<=600?3:2);
  }
  if(['cancelled','expired'].includes(b.status)&&terms.paid_amount>0&&!terms.refund_recorded_at)add(b,'booking','refund',owner,'owner','Проверить возврат оплаты',subject+' · бронь закрыта, возврат фактически полученной оплаты ещё не отмечен',b.created_at,2);
  if(b.status==='completed'){
   if(terms.deposit_status==='owner_verified'&&!terms.deposit_returned_at)add(b,'booking','deposit-return',owner,'owner','Закрыть расчёт по депозиту',subject+' · после проверки жилья отметьте фактический возврат или разберите спор',(terms.actual_checkout||b.end)+86400,t>=(terms.actual_checkout||b.end)+86400?3:2);
   continue;
  }
  if(b.status!=='confirmed')continue;
  if(b.payment_status!=='owner_verified')bookingTask(b,'payment','Проверить оплату проживания',subject+' · поступление не подтверждено владельцем',b.start);
  if(terms.deposit_status==='pending')bookingTask(b,'deposit','Проверить депозит',subject+' · депозит предусмотрен согласованными условиями',b.start);
  if(!terms.actual_checkin&&!terms.actual_checkout){
   if(p?.readiness!=='ready')bookingTask(b,'readiness','Подготовить жильё к заезду',subject+' · готовность жилья не подтверждена',b.start,['owner']);
   bookingTask(b,'checkin','Проверить заселение',subject+' · фактический заезд ещё не подтверждён; сначала нужны готовность, оплата и депозит',b.start);
  }
  if(!terms.actual_checkout){
   if(terms.checkout_reported_at)add(b,'booking','checkout-reported',owner,'owner','Проверить сообщение о выезде',subject+' · гость сообщил о выезде; подтвердите освобождение после проверки',terms.checkout_reported_at+900,t>=terms.checkout_reported_at+900?3:2);
   bookingTask(b,'checkout',b.end<=t?'Просрочен выезд':'Подготовиться к выезду',subject+' · освобождение жилья подтверждается отдельно',b.end,undefined,b.end<=t);
  }
  // Own staff cleans this property: no cleaning task for executors is expected.
  if(!Number(p?.own_staff)&&!data.jobs.some((j:Row)=>j.booking_id===b.id&&j.status!=='cancelled'))add(b,'booking','missing-cleaning',owner,'owner','Запланировать уборку после выезда',subject+' · связанного задания нет; проверьте стоимость и создайте уборку',b.end,2);
 }
 for(const j of data.jobs||[]){
  const subject=properties.get(j.property_id)?.title||'Жильё',base=data.bookings.find((b:Row)=>b.id===j.booking_id);
  if(j.status==='open'){
   const applicants=(data.applications||[]).filter((a:Row)=>a.job_id===j.id&&a.status==='pending');
   add(j,'job','assignment',owner,'owner',applicants.length?'Выбрать исполнителя из откликов':'Найти исполнителя уборки',subject+' · '+(applicants.length?'есть отклики; назначение ещё не выполнено':'откликов пока нет'),j.start,j.start<=t?3:due(j.start,owner,'owner')?2:1);
  }
  if(j.status==='assigned'){
   if(j.booking_id&&!base?.terms?.actual_checkout&&due(j.start,owner,'owner'))add(j,'job','vacancy',owner,'owner','Уборка ждёт подтверждения выезда',subject+' · исполнителю нельзя начинать, пока жильё не освобождено',j.start,j.start<=t?3:2);
   if(due(j.start,j.assigned_to,'cleaner'))add(j,'job','start',j.assigned_to,'cleaner',j.booking_id&&!base?.terms?.actual_checkout?'Дождаться освобождения жилья':'Начать назначенную уборку',subject+' · проверьте время, условия и подтверждение выезда',j.start,j.start+900<=t?3:2);
   if(j.start+900<=t)add(j,'job','no-start',owner,'owner','Исполнитель не отметил начало',subject+' · свяжитесь с исполнителем и проверьте необходимость замены',j.start+900,3);
  }
  if(['open','assigned','in_progress'].includes(j.status)&&j.end<=t){
   add(j,'job','overdue',owner,'owner','Уборка просрочена',subject+' · срок истёк, результат ещё не передан',j.end,3);
   if(j.assigned_to)add(j,'job','overdue',j.assigned_to,'cleaner','Передать результат или сообщить о задержке',subject+' · срок уборки истёк',j.end,3);
  }else if(j.status==='in_progress'&&due(j.end,j.assigned_to,'cleaner'))add(j,'job','report',j.assigned_to,'cleaner','Завершить уборку и передать отчёт',subject+' · заполните чек-лист и опишите результат',j.end,2);
  if(j.status==='submitted')add(j,'job','review',owner,'owner','Принять уборку или вернуть на доработку',subject+' · исполнитель передал отчёт; готовность ожидает проверки',(j.submitted_at||j.end)+1800,t>=(j.submitted_at||j.end)+1800?3:2);
  // A cleaning paid from the reserve is settled by the service, the owner owes nothing more.
  if(j.status==='completed'&&!j.settled_at&&!j.guarantee)add(j,'job','settlement',owner,'owner','Рассчитаться с исполнителем',subject+' · работа принята; отметьте фактическую оплату после расчёта',j.end+86400,j.end+86400<=t?3:2);
  if(['open','assigned','in_progress','submitted'].includes(j.status)){
   const next=data.bookings.filter((b:Row)=>b.property_id===j.property_id&&b.id!==j.booking_id&&b.status==='confirmed'&&!b.terms?.actual_checkin&&!b.terms?.actual_checkout&&b.start>=j.start).sort((a:Row,b:Row)=>a.start-b.start)[0];
   if(next&&(j.end>next.start||next.start<=t+3600))add(j,'job','next-arrival',owner,'owner','Под угрозой следующий заезд',subject+' · уборка и проверка ещё не завершены; согласуйте подготовку и предупредите следующего гостя',next.start,3);
  }
 }
 for(const issue of data.issues||[]){
  if(issue.status!=='open')continue;
  const item={id:issue.id,property_id:issue.property_id};
  const recipients=new Map<string,{user:string;role:Role}>([[owner+':owner',{user:owner,role:'owner'}],[issue.other_user+':'+issue.other_role,{user:issue.other_user,role:issue.other_role}]]);
  for(const {user,role} of recipients.values())add(item,'issue','issue',user,role,'Разобрать обращение участника',issue.description,issue.created_at+1800,t>=issue.created_at+1800?3:2);
 }
 return tasks.sort((a,b)=>b.priority-a.priority||a.deadline-b.deadline||a.id.localeCompare(b.id));
}

export async function readAdministratorState(db:D1Database,userId:string,role:Role){
 const scope=role==='owner'?'owner_id=?':'user_id=? AND role=?',args=role==='owner'?[userId]:[userId,role];
 const tasks=(await db.prepare(`SELECT * FROM administrator_tasks WHERE ${scope} AND status='open' ORDER BY priority DESC,deadline,id LIMIT 100`).bind(...args).all<Row>()).results;
 const counts=await db.prepare(`SELECT COUNT(*) total,SUM(CASE WHEN priority=3 THEN 1 ELSE 0 END) urgent FROM administrator_tasks WHERE ${scope} AND status='open'`).bind(...args).first<Row>();
 const issues=(await db.prepare("SELECT i.* FROM administrator_issues i WHERE (i.owner_id=? AND ?='owner') OR (i.opened_by=? AND i.opened_role=?) OR (i.other_user=? AND i.other_role=?) ORDER BY i.status='open' DESC,i.created_at DESC LIMIT 50").bind(userId,role,userId,role,userId,role).all<Row>()).results;
 const run=await db.prepare("SELECT checked_at,last_success,last_error FROM administrator_runs WHERE id=?").bind('owner:'+userId).first<Row>();
 const heartbeat=await db.prepare("SELECT last_success,last_error FROM administrator_runs WHERE id='scheduler'").first<Row>();
 return {name:'AI администратор',stages:administratorStages,tasks,total:counts?.total||0,urgent:counts?.urgent||0,issues,checkedAt:role==='owner'?run?.last_success||null:tasks.reduce((at,n)=>Math.max(at,n.updated_at),0)||null,backgroundAlive:!!heartbeat?.last_success&&heartbeat.last_success>Math.floor(Date.now()/1000)-180,backgroundError:heartbeat?.last_error?true:false};
}
