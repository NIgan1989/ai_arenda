export type Row=Record<string,any>;
export type Role='guest'|'owner'|'cleaner';
export type Message={id:string;sender:'user'|'assistant';text:string;block?:string;payload?:Row;done?:boolean;result?:string};
export type Question={key:string;text:string;label:string;min?:number;max?:number;date?:boolean;choices?:{label:string;value:string}[]};
export type Flow={kind:string;questions:Question[];index:number;answers:Row;after:string;role:Role;endpoint:string;extra?:Row};
export const empty={user:null,profile:null,properties:[],ownProperties:[],bookings:[],jobs:[],applications:[],notifications:[]};
export const money=(n:number)=>new Intl.NumberFormat('ru-RU').format(n)+' ₸';
export const date=(n:number)=>new Date(n*1000).toLocaleString('ru-RU',{timeZone:'Asia/Almaty',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
export const labels:Row={requested:'Ожидает владельца',confirmed:'Подтверждено',cancelled:'Отменено',expired:'Срок заявки истёк',open:'Открыта',assigned:'Исполнитель назначен',in_progress:'В работе',submitted:'На проверке',completed:'Завершено',pending:'Отклик отправлен',accepted:'Вы назначены',rejected:'Выбран другой исполнитель'};
let sequence=0;
export const uid=()=>Date.now().toString(36)+'-'+(++sequence)+'-'+Math.random().toString(36).slice(2,10);
export const baseQuestions:Question[]=[{key:'name',text:'Как к вам обращаться?',label:'Имя'},{key:'contact',text:'Напишите телефон или контакт в мессенджере для связи по заявкам.',label:'Контакт'},{key:'city',text:'В каком городе вы будете пользоваться сервисом?',label:'Город'}];
export const cleanerQuestions:Question[]=[{key:'districts',text:'В каких районах удобно брать уборки?',label:'Районы'},{key:'experience',text:'Расскажите об опыте уборки. Что умеете и сколько работаете?',label:'Опыт'},{key:'availability',text:'В какие дни и часы вы готовы работать?',label:'График'}];
export const propertyQuestions:Question[]=[
  {key:'title',text:'Как назовём квартиру? Например, «Студия у набережной».',label:'Название'},
  {key:'city',text:'В каком городе квартира?',label:'Город'},
  {key:'district',text:'В каком районе?',label:'Район'},
  {key:'address',text:'Напишите точный адрес. Он будет виден вам, подтверждённому гостю и назначенному исполнителю.',label:'Адрес'},
  {key:'price',text:'Сколько стоит проживание за сутки, в тенге?',label:'За сутки, ₸',min:100,max:10000000},
  {key:'rooms',text:'Сколько комнат?',label:'Комнаты',min:1,max:20},
  {key:'capacity',text:'Сколько гостей можно разместить?',label:'Гости',min:1,max:50},
  {key:'cleaningMinutes',text:'Сколько минут нужно на уборку между гостями?',label:'Уборка, минут',min:30,max:1440},
  {key:'description',text:'Какие удобства и правила важно знать гостю?',label:'Удобства и правила'}
];
export function parseDate(value:string){
  // All housing schedules use the business timezone UTC+05:00, regardless of device timezone.
  const match=value.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})$/);
  if(!match)throw new Error('Напишите дату в формате ДД.ММ.ГГГГ ЧЧ:ММ, например 25.10.2026 14:00. Время Казахстана (UTC+5).');
  const [,d,m,y,h,min]=match;const stamp=Date.parse(`${y}-${m}-${d}T${h}:${min}:00+05:00`);
  const shifted=new Date(stamp+5*3600000);
  if(!Number.isFinite(stamp)||shifted.getUTCDate()!==+d||shifted.getUTCMonth()+1!==+m||shifted.getUTCFullYear()!==+y||shifted.getUTCHours()!==+h||shifted.getUTCMinutes()!==+min)throw new Error('Такой даты или времени нет. Проверьте ввод.');
  return new Date(stamp).toISOString();
}
