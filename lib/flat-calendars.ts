import {t,forms,L} from './i18n';
// The flat editor's calendar screen, shared by the site and the app: one line per connected
// platform calendar, and where the owner finds the links on the big platforms.
type Row=Record<string,any>;

const ago=(seconds:number)=>seconds<90?t('только что'):seconds<3600?t('{n} мин назад',{n:Math.round(seconds/60)}):seconds<86400?t('{n} ч назад',{n:Math.round(seconds/3600)}):t('{n} дн назад',{n:Math.round(seconds/86400)});
// «Не обновляется с 2 ч»: the same span without «назад».
const span=(seconds:number)=>seconds<90?t('только что'):seconds<3600?t('{n} мин',{n:Math.round(seconds/60)}):seconds<86400?t('{n} ч',{n:Math.round(seconds/3600)}):t('{n} дн',{n:Math.round(seconds/86400)});
const busy=(n:number)=>t(forms(n,'занято {n} период','занято {n} периода','занято {n} периодов'),{n});

export function calendarStatus(s:Row,now=Math.floor(Date.now()/1000)):{text:string;tone:'ok'|'warn'|'off'}{
 if(!s.enabled)return {text:t('Отключён'),tone:'off'};
 if(!s.automatic)return {text:t('Загружается файлом в разделе «Управление»'),tone:'off'};
 const fresh=s.last_success&&now-s.last_success<3600&&!s.last_error;
 if(!fresh)return {text:s.last_success?t('Не обновляется с {span}. Новые заявки на это жильё остановлены',{span:span(now-s.last_success)}):t('Ещё не загрузился. Новые заявки на это жильё остановлены'),tone:'warn'};
 return {text:t('Обновлён {ago}',{ago:ago(now-s.last_success)})+' · '+(s.busy?busy(Number(s.busy)):t('занятых дат нет')),tone:'ok'};
}

export const CALENDAR_HELP=L([
 {name:'Airbnb',where:'Календарь → Доступность → Подключить календари → Экспорт календаря'},
 {name:'Booking.com',where:'Тарифы и наличие → Синхронизация календарей → Экспорт'},
 {name:'Суточно, Авито',where:'Календарь объявления → Синхронизация → Ссылка для экспорта'}
]);
