type Row=Record<string,any>;

// A cleaning whose agreed end has passed while the work is not handed over. Both sides get a way out right in the
// card: the cleaner sends the report, asks for more time or gives the task back; the owner adds time, finds another
// cleaner, closes a cleaning that was in fact done, or cancels it. The AI administrator moves the steps on its own:
// 1 — reminded both sides at the deadline, 2 — 30 minutes without an answer, 3 — two hours: the service administrator.
export const extendChoices=[30,60,120] as const;
export const OVERDUE_SILENT=30*60,OVERDUE_ESCALATE=2*3600;
export function isOverdue(job:Row,t:number){return ['assigned','in_progress'].includes(job.status)&&!!job.assigned_to&&Number(job.end)<=t;}
export function extendLabel(minutes:number){return minutes<60?minutes+' мин':minutes/60+' ч';}
export function overdueNote(job:Row,role:'owner'|'cleaner',t:number):{title:string;text:string;ai:string}|null{
 if(!isOverdue(job,t))return null;
 const step=Number(job.overdue_step)||0,started=job.status==='in_progress',blocked=!started&&job.checkout_confirmed===false;
 if(role==='cleaner'){
  const text=started?'Если всё готово, отправьте отчёт. Нужно больше времени — продлите срок, владелец получит уведомление.':blocked?'Начать нельзя, пока владелец не подтвердит выезд гостя. Можно продлить срок или отказаться от задания.':'Начните уборку или продлите срок. Если не получится, откажитесь: ИИ-администратор найдёт замену.';
  const ai=step>=3?'ИИ-администратор передал задержку администратору сервиса.':step>=2&&!started&&!blocked?'Без ответа ИИ-администратор передаст задание другому исполнителю.':'ИИ-администратор сообщил владельцу о задержке.';
  return {title:'Срок уборки истёк',text,ai};
 }
 const text=blocked?'Исполнитель не может начать: выезд гостя не подтверждён. Подтвердите выезд в брони или продлите срок.':started?'Продлите срок, если исполнителю нужно время. Если уборка уже сделана, закройте её сами. Можно и найти другого исполнителя.':'Исполнитель так и не начал. Продлите срок или найдите другого исполнителя.';
 const ai=step>=3?'ИИ-администратор передал ситуацию администратору сервиса, с вами свяжутся.':step>=2?'Исполнитель не ответил 30 минут после напоминания.'+(started?' Через 2 часа после срока ИИ-администратор подключит администратора сервиса.':''):'ИИ-администратор напомнил исполнителю о сроке.'+(!started&&!blocked?' Если он не ответит за 30 минут, ИИ сам вернёт уборку в поиск.':'');
 return {title:'Уборка просрочена',text,ai};
}
