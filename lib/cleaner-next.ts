type Row=Record<string,any>;
// What the cleaner should expect next on one cleaning, said once on the card. The site and the app show the same words.
// `action` names the one thing the cleaner can do here, when there is one.
export type CleanerNext={title:string;text:string;tone:'info'|'warning'|'danger';action?:'request-review'};
export function cleanerNext(job:Row,application:Row|undefined,admission:string|undefined,userId:string):CleanerNext|null{
 if(job.assigned_to===userId){
  if(job.status==='assigned')return job.checkout_confirmed?{title:'Жильё свободно',text:'Можно начинать. Нажмите «Начать уборку», когда будете на месте.',tone:'info'}:{title:'Вы назначены',text:'Адрес и контакт владельца выше. Кнопка «Начать уборку» появится, когда владелец подтвердит выезд гостя.',tone:'info'};
  if(job.status==='submitted')return {title:'Отчёт у владельца',text:'Владелец проверит фото и чек-лист. Если нужно что-то исправить, он напишет в чат задания.',tone:'info'};
  return null;
 }
 if(!application)return null;
 if(job.status!=='open')return {title:'Выбран другой исполнитель',text:'На это задание назначен другой исполнитель. Посмотрите другие уборки в «Найти задания».',tone:'warning'};
 if(application.status==='rejected')return {title:'Отклик отклонён',text:'Владелец отклонил отклик. Можно откликнуться снова или посмотреть другие уборки в «Найти задания».',tone:'warning'};
 if(admission==='none'||admission==='expired')return {title:'Нужна проверка анкеты',text:'Владелец сможет назначить вас только после проверки анкеты администратором платформы. Отправьте её на проверку.',tone:'warning',action:'request-review'};
 if(admission==='pending')return {title:'Отклик у владельца, анкета на проверке',text:'Администратор платформы проверяет вашу анкету. После проверки владелец сможет вас назначить, мы пришлём уведомление.',tone:'info'};
 if(admission==='rejected')return {title:'Анкета не прошла проверку',text:'Пока проверка не пройдена, владелец не сможет вас назначить. Причину смотрите в профиле, во вкладке «Проверки».',tone:'danger'};
 return {title:'Отклик у владельца',text:'Ждём его решения. Когда вас назначат, здесь появятся адрес, контакт и кнопка «Начать уборку».',tone:'info'};
}
