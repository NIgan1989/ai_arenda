import {t} from './i18n';
import {isHome,wordsOf} from './stay-words';
type Row=Record<string,any>;
export function processStatus(kind:string,item:Row,role:string,userId:string,application?:Row){
 if(kind==='property')return {label:item.display_status?.label?t(item.display_status.label):t('Ожидает проверки'),tone:['ready','good'].includes(item.display_status?.tone)?'success':item.display_status?.tone==='danger'?'danger':item.display_status?.tone==='warning'?'warning':'neutral',bucket:'active'};
 if(kind==='job'&&role==='cleaner'&&item.assigned_to!==userId&&application){if(application.status==='pending')return {label:t('Отклик отправлен'),tone:'warning',bucket:'waiting'};if(application.status==='rejected')return {label:t('Отклик отклонён'),tone:'neutral',bucket:'done'};}
 // An overdue cleaning reads as such already in the list, before the card is opened.
 if(kind==='job'&&['assigned','in_progress'].includes(item.status)&&item.assigned_to&&Number(item.end)<=Date.now()/1000)return {label:t('Уборка просрочена'),tone:'danger',bucket:'active'};
 if(kind==='job'&&role==='owner'&&item.status==='open'&&!item.assigned_to&&Number(item.end)<=Date.now()/1000)return {label:t('Срок прошёл · нет исполнителя'),tone:'danger',bucket:'active'};
 const labels:Row=kind==='booking'?{requested:t('Ожидает подтверждения'),confirmed:item.terms?.actual_checkin?(isHome(item)?t('Гость заселён'):wordsOf(item).guestIn):t('Бронь подтверждена'),completed:wordsOf(item).done,cancelled:t('Бронь отменена'),rejected:t('Заявка отклонена'),expired:t('Срок заявки истёк')}:{open:role==='cleaner'?t('Можно откликнуться'):t('Нужен исполнитель'),assigned:role==='cleaner'&&item.assigned_to===userId?t('Вы назначены'):t('Исполнитель назначен'),in_progress:t('Уборка в работе'),submitted:t('Результат на проверке'),completed:t('Уборка принята'),cancelled:t('Задание отменено')};
 const done=['completed','cancelled','rejected','expired'].includes(item.status),waiting=['requested','open','submitted'].includes(item.status);
 return {label:labels[item.status]||t('Ожидает проверки'),tone:done?(item.status==='completed'?'success':'neutral'):waiting?'warning':'active',bucket:done?'done':waiting?'waiting':'active'};
}
