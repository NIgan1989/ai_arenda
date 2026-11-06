type Row=Record<string,any>;
export function processStatus(kind:string,item:Row,role:string,userId:string,application?:Row){
 if(kind==='property')return {label:item.display_status?.label||'Ожидает проверки',tone:['ready','good'].includes(item.display_status?.tone)?'success':item.display_status?.tone==='danger'?'danger':item.display_status?.tone==='warning'?'warning':'neutral',bucket:'active'};
 if(kind==='job'&&role==='cleaner'&&item.assigned_to!==userId&&application){if(application.status==='pending')return {label:'Отклик отправлен',tone:'warning',bucket:'waiting'};if(application.status==='rejected')return {label:'Отклик отклонён',tone:'neutral',bucket:'done'};}
 const labels:Row=kind==='booking'?{requested:'Ожидает подтверждения',confirmed:item.terms?.actual_checkin?'Гость заселён':'Бронь подтверждена',completed:'Проживание завершено',cancelled:'Бронь отменена',rejected:'Заявка отклонена',expired:'Срок заявки истёк'}:{open:role==='cleaner'?'Можно откликнуться':'Нужен исполнитель',assigned:'Исполнитель назначен',in_progress:'Уборка в работе',submitted:'Результат на проверке',completed:'Уборка принята',cancelled:'Задание отменено'};
 const done=['completed','cancelled','rejected','expired'].includes(item.status),waiting=['requested','open','submitted'].includes(item.status);
 return {label:labels[item.status]||'Ожидает проверки',tone:done?(item.status==='completed'?'success':'neutral'):waiting?'warning':'active',bucket:done?'done':waiting?'waiting':'active'};
}
