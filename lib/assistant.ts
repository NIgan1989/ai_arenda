import {DomainError,number,type Role} from './domain';
type Row=Record<string,any>;
export const defaultAssistantSettings={mode:'proactive',leadMinutes:60,repeatMinutes:60,quietEnabled:false,quietStart:'22:00',quietEnd:'08:00',urgentInQuiet:true,version:0};
function minute(value:unknown){if(typeof value!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))throw new DomainError('Укажите время в формате ЧЧ:ММ.');const [h,m]=value.split(':').map(Number);return h*60+m;}
export function assistantSettingsInput(body:Row){
  if(!['reactive','important','proactive'].includes(body.mode))throw new DomainError('Выберите режим инициативности.');
  const leadMinutes=number(body.leadMinutes,'Заблаговременность',15,1440),repeatMinutes=number(body.repeatMinutes,'Повтор подсказок',15,1440);
  minute(body.quietStart);minute(body.quietEnd);
  if(body.quietEnabled===true&&body.quietStart===body.quietEnd)throw new DomainError('Начало и окончание тихих часов должны отличаться.');
  return {mode:String(body.mode),leadMinutes,repeatMinutes,quietEnabled:body.quietEnabled===true,quietStart:String(body.quietStart),quietEnd:String(body.quietEnd),urgentInQuiet:body.urgentInQuiet===true};
}
export function assistantBrief(data:Row,role:Role,settings:Row,t:number){
  const tasks:Row[]=[],horizon=t+settings.leadMinutes*60;
  const add=(key:string,title:string,reason:string,kind:string,section:string,entityId:string,priority:number,at=t,intent?:string)=>tasks.push({id:key,title,reason,kind,section,entityId,priority,at,intent});
  for(const b of data.bookings||[]){
    if(b.status==='requested'&&b.expires_at>t&&role==='owner')add('request:'+b.id,'Ответить на заявку',b.title+' · резерв скоро истечёт','booking','bookings',b.id,b.expires_at-t<=600?3:2,b.expires_at);
    if(b.status!=='confirmed')continue;
    if(!b.terms?.actual_checkout&&b.end<=t){add('checkout:'+b.id,role==='owner'?'Проверить фактический выезд':'Уточнить завершение проживания',b.title+' · время выезда прошло; освобождение ещё не подтверждено','booking','bookings',b.id,3,b.end);continue;}
    if(role==='guest'){
      const leaving=b.start<=t&&b.end<=horizon;
      add('arrival:'+b.id,leaving?'Подготовиться к выезду':b.start>t?'Проверить предстоящий заезд':'Проверить данные проживания',b.title+' · даты, адрес и условия уже сохранены в вашей брони','booking','bookings',b.id,leaving||b.start>t&&b.start<=horizon?2:1,leaving?b.end:b.start);
      continue;
    }
    if(role==='owner'&&b.terms?.checkout_reported_at&&!b.terms.actual_checkout)add('reported:'+b.id,'Проверить освобождение квартиры',b.title+' · гость сообщил о выезде','booking','bookings',b.id,2,b.terms.checkout_reported_at);
    if(b.start>horizon)continue;
    if(role==='owner'){
      if(b.payment_status!=='owner_verified')add('payment:'+b.id,'Проверить оплату до заселения',b.title+' · поступление не подтверждено','booking','bookings',b.id,2,b.start);
      if(b.terms?.deposit_status==='pending')add('deposit:'+b.id,'Проверить получение депозита',b.title+' · депозит предусмотрен условиями','booking','bookings',b.id,2,b.start);
      if(b.readiness&&b.readiness!=='ready'&&!b.terms?.actual_checkin)add('ready:'+b.id,'Подготовить квартиру к заезду',b.title+' · готовность не подтверждена','property','properties',b.property_id,2,b.start);
      if(b.start<=t&&b.end>t&&!b.terms?.actual_checkin&&b.readiness==='ready'&&b.payment_status==='owner_verified'&&b.terms?.deposit_status!=='pending')add('checkin:'+b.id,'Подтвердить фактическое заселение',b.title+' · время заезда наступило','booking','bookings',b.id,2,b.start);
    }
  }
  for(const j of data.jobs||[]){
    if(role==='owner'&&j.status==='submitted')add('report:'+j.id,'Проверить отчёт об уборке',j.title+' · результат ожидает приёмки','job','cleaning',j.id,2,j.end);
    else if(['open','assigned','in_progress'].includes(j.status)&&j.end<=t&&(role==='owner'||j.assigned_to===data.profile?.id))add('late:'+j.id,'Разобраться с просроченной уборкой',j.title+' · срок задания прошёл','job',role==='owner'?'cleaning':'assignments',j.id,3,j.end);
    else if(role==='owner'&&j.status==='open')add('assign:'+j.id,'Найти исполнителя уборки',j.title+' · исполнитель ещё не назначен','job','cleaning',j.id,j.start<=horizon?2:1,j.start);
    else if(role==='cleaner'&&j.assigned_to===data.profile?.id&&j.status==='assigned'&&j.start<=horizon)add('start:'+j.id,j.checkout_confirmed?'Подготовиться к назначенной уборке':'Дождаться подтверждения выезда',j.title+' · '+(j.checkout_confirmed?'проверьте инструкции и время':'начинать уборку пока нельзя'),'job','assignments',j.id,j.checkout_confirmed?2:1,j.start);
  }
  if(role==='owner'){
    if(!data.ownProperties?.length)add('setup:property','Добавить первую квартиру','Укажите объект, тарифы и правила для работы ассистента.','setup','properties','',1,t,'property');
    for(const p of data.ownProperties||[])if(!p.policy?.version)add('rules:'+p.id,'Настроить правила владельца',p.title+' · задайте тарифы, депозит и разрешение на автоподтверждение','property','properties',p.id,1);
  }
  if(role==='guest'&&!tasks.length)add('setup:trip','Подобрать квартиру','Укажите даты, район, бюджет и число гостей.','setup','catalog','',1,t,'properties');
  if(role==='cleaner'&&!tasks.length)add('setup:jobs','Посмотреть доступные задания','Выберите подходящее задание по времени и району.','setup','jobs','',1,t,'jobs');
  tasks.sort((a,b)=>b.priority-a.priority||a.at-b.at||a.id.localeCompare(b.id));
  const localMinute=Math.floor((t+18000)%86400/60),start=minute(settings.quietStart),end=minute(settings.quietEnd);
  const quiet=settings.quietEnabled&&(start<end?localMinute>=start&&localMinute<end:localMinute>=start||localMinute<end);
  const candidates=tasks.filter(task=>settings.mode==='proactive'||settings.mode==='important'&&task.priority>=2);
  const prompts=settings.mode==='reactive'?[]:candidates.filter(task=>!quiet||settings.urgentInQuiet&&task.priority===3);
  return {generatedAt:t,mode:settings.mode,quiet,automatic:prompts.length>0,signature:prompts.slice(0,5).map(task=>task.id+':'+task.priority).join('|'),
    summary:tasks.length?'Сейчас главное: '+tasks[0].title.toLowerCase()+'.':'Срочных задач нет. Продолжаю показывать актуальные события.',tasks:tasks.slice(0,8),prompts:prompts.slice(0,5),
    capabilities:{modelActions:false,backgroundDelivery:false,payments:false}};
}
