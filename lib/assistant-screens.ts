import type {Role} from './domain';

// Screens of the app the AI administrator can point to: under its answer the app shows one button that opens it.
// Ids are the ones the app already opens (mobile/App.tsx openScreen); the label is the button text.
export const ASSISTANT_SCREENS:Record<Role,Record<string,string>>={
 guest:{
  map:'Открыть карту',catalog:'Открыть список жилья',bookings:'Открыть мои брони',calendar:'Открыть календарь',
  'home-cleaning':'Заказать уборку дома',notices:'Открыть уведомления',profile:'Открыть профиль',invite:'Пригласить друзей',
 },
 owner:{
  map:'Открыть карту',properties:'Открыть мои объекты','add-property':'Добавить жильё',bookings:'Открыть брони',
  cleaning:'Открыть уборки',job:'Создать уборку',calendar:'Открыть календарь',autopilot:'Открыть автопилот',
  money:'Открыть доход',notices:'Открыть уведомления',profile:'Открыть профиль',invite:'Пригласить владельцев',
 },
 cleaner:{
  map:'Открыть карту',jobs:'Открыть задания',assignments:'Открыть мои уборки',calendar:'Открыть календарь',
  autopilot:'Открыть автопилот',money:'Открыть заработок',notices:'Открыть уведомления',profile:'Открыть профиль',
  invite:'Пригласить друзей',
 },
};
// What each screen is for, for the model: it picks the one that moves the person forward.
const MEANING:Record<string,string>={
 map:'карта: поиск и выбор жилья, бань и залов (гость), свои объекты и дела на карте',catalog:'список найденного жилья',
 bookings:'брони и заявки: статус, оплата, чек, отмена, продление',calendar:'календарь занятости и дел',
 'home-cleaning':'заказать уборку своего дома или квартиры',notices:'уведомления',profile:'профиль, имя, телефон, город, язык, документы',
 invite:'приглашения и промокоды',properties:'свои объекты: правка объявления, цены, правила, фото',
 'add-property':'добавить новое жильё или заведение',cleaning:'уборки своих объектов: исполнители, отчёты, приёмка',
 job:'создать задание на уборку',autopilot:'автопилот: что ИИ делает сам и его правила',money:'доход и расчёты',
 jobs:'свободные задания на уборку рядом',assignments:'свои назначенные уборки: начать, чек-лист, отчёт',
};
export const screenCatalog=(role:Role)=>Object.keys(ASSISTANT_SCREENS[role]).map(id=>`${id} — ${MEANING[id]}`).join('; ');
export const validScreen=(role:Role,value:unknown):string|null=>typeof value==='string'&&Object.prototype.hasOwnProperty.call(ASSISTANT_SCREENS[role],value)?value:null;

// The screen travels with the stored answer as an invisible tail, so the history and the moderation see one message.
const TAIL=/\n?⁣screen:([a-z-]{1,30})$/;
export const withScreen=(text:string,screen:string|null)=>screen?text+'\n⁣screen:'+screen:text;
export function splitScreen(body:unknown):{body:string;screen?:string}{
 const text=String(body??''),found=text.match(TAIL);
 return found?{body:text.slice(0,found.index),screen:found[1]}:{body:text};
}
