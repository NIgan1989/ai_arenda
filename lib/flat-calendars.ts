// The flat editor's calendar screen, shared by the site and the app: one line per connected
// platform calendar, and where the owner finds the links on the big platforms.
type Row=Record<string,any>;

const ago=(seconds:number)=>seconds<90?'только что':seconds<3600?Math.round(seconds/60)+' мин назад':seconds<86400?Math.round(seconds/3600)+' ч назад':Math.round(seconds/86400)+' дн назад';
const periods=(n:number)=>n%10===1&&n%100!==11?'период':n%10>=2&&n%10<=4&&(n%100<10||n%100>=20)?'периода':'периодов';

export function calendarStatus(s:Row,now=Math.floor(Date.now()/1000)):{text:string;tone:'ok'|'warn'|'off'}{
 if(!s.enabled)return {text:'Отключён',tone:'off'};
 if(!s.automatic)return {text:'Загружается файлом в разделе «Управление»',tone:'off'};
 const fresh=s.last_success&&now-s.last_success<3600&&!s.last_error;
 if(!fresh)return {text:s.last_success?'Не обновляется с '+ago(now-s.last_success).replace(' назад','')+'. Новые заявки на это жильё остановлены':'Ещё не загрузился. Новые заявки на это жильё остановлены',tone:'warn'};
 return {text:'Обновлён '+ago(now-s.last_success)+' · '+(s.busy?'занято '+s.busy+' '+periods(Number(s.busy)):'занятых дат нет'),tone:'ok'};
}

export const CALENDAR_HELP=[
 {name:'Airbnb',where:'Календарь → Доступность → Подключить календари → Экспорт календаря'},
 {name:'Booking.com',where:'Тарифы и наличие → Синхронизация календарей → Экспорт'},
 {name:'Суточно, Авито',where:'Календарь объявления → Синхронизация → Ссылка для экспорта'}
];
