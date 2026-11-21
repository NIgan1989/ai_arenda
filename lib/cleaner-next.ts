import {t} from './i18n';

type Row=Record<string,any>;
// What the cleaner should expect next on one cleaning, said once on the card. The site and the app show the same words.
// `action` names the one thing the cleaner can do here, when there is one.
export type CleanerNext={title:string;text:string;tone:'info'|'warning'|'danger';action?:'request-review'};
export function cleanerNext(job:Row,application:Row|undefined,admission:string|undefined,userId:string):CleanerNext|null{
 if(job.assigned_to===userId){
  if(job.status==='assigned')return job.checkout_confirmed?{title:job.booking_id===null?t('Вы назначены'):t('Жильё свободно'),text:t('Можно начинать. Нажмите «Начать уборку», когда будете на месте.'),tone:'info'}:{title:t('Вы назначены'),text:t('Адрес и контакт владельца выше. Кнопка «Начать уборку» появится, когда владелец подтвердит выезд гостя.'),tone:'info'};
  if(job.status==='submitted')return {title:t('Отчёт у владельца'),text:t('Владелец проверит фото и чек-лист. Если нужно что-то исправить, он напишет в чат задания.'),tone:'info'};
  return null;
 }
 if(!application)return null;
 if(job.status!=='open')return {title:t('Выбран другой исполнитель'),text:t('На это задание назначен другой исполнитель. Посмотрите другие уборки в «Найти задания».'),tone:'warning'};
 if(application.status==='rejected')return {title:t('Отклик отклонён'),text:t('Владелец отклонил отклик. Можно откликнуться снова или посмотреть другие уборки в «Найти задания».'),tone:'warning'};
 if(admission==='none'||admission==='expired')return {title:t('Нужна проверка анкеты'),text:t('Владелец сможет назначить вас только после проверки анкеты администратором платформы. Отправьте её на проверку.'),tone:'warning',action:'request-review'};
 if(admission==='pending')return {title:t('Отклик у владельца, анкета на проверке'),text:t('Администратор платформы проверяет вашу анкету. После проверки владелец сможет вас назначить, мы пришлём уведомление.'),tone:'info'};
 if(admission==='rejected')return {title:t('Анкета не прошла проверку'),text:t('Пока проверка не пройдена, владелец не сможет вас назначить. Причину смотрите в профиле, во вкладке «Проверки».'),tone:'danger'};
 return {title:t('Отклик у владельца'),text:t('Ждём его решения. Когда вас назначат, здесь появятся адрес, контакт и кнопка «Начать уборку».'),tone:'info'};
}
