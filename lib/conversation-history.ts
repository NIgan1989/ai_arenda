import {t as tr,L,dateText} from './i18n';
// What the AI administrator said earlier (the conversation kept on the server, 120 messages at most) is history, not the page.
// Since 2026-11-18 the app shows on a page only what was said after it opened; on «Сводка» the rest folds into one list
// «История» (a line per message, by day), and anything older than a week is dropped when the conversation loads.
type Row=Record<string,any>;
export type HistoryMessage={id:string;sender:'user'|'assistant';text:string;block?:string;payload?:Row;done?:boolean;result?:string};
export const HISTORY_DAYS=7;
const DAY=86400000,SHIFT=5*3600000; // Kazakhstan, UTC+5
// A message id starts with the time it was said, in base 36 (mobile/src/model.ts uid). Other ids have no time: 0.
export function messageTime(id:string):number{
 const head=String(id||'').split('-')[0];
 if(!/^[0-9a-z]{7,9}$/.test(head))return 0;
 const at=parseInt(head,36);
 return at>1.5e12&&at<4e12?at:0;
}
// Older than a week goes; a message without a time stays (it cannot be dated, and it is rare).
export function pruneHistory<T extends HistoryMessage>(messages:T[],now=Date.now(),days=HISTORY_DAYS):T[]{
 const edge=now-days*DAY;
 return (messages||[]).filter(m=>{const at=messageTime(m.id);return !at||at>=edge;});
}
// The messages said after `start` (the last message before the page opened); '' or an id no longer there: all of them.
export function splitAt<T extends {id:string}>(messages:T[],start:string):{before:T[];after:T[]}{
 const at=start?messages.findIndex(m=>m.id===start):-1;
 return at<0?{before:[],after:messages}:{before:messages.slice(0,at+1),after:messages.slice(at+1)};
}
const BLOCKS:Record<string,string>=L({
 bookings:'Брони',jobs:'Уборки',properties:'Жильё',workspace:'Сводка',notifications:'Уведомления',confirm:'Подтверждение',
 'property-editor':'Изменение жилья','property-quick':'Новое жильё','property-settings':'Правила жилья','stay-form':'Бронирование',
 'job-form':'Заказ уборки','home-order':'Уборка на дом',review:'Проверка брони',report:'Отчёт об уборке',auth:'Вход',help:'Подсказки'
});
// One line for a message: what the person wrote, or what the AI said and what it showed.
export function historyLine(m:HistoryMessage):string{
 const text=String(m.text||'').replace(/\s+/g,' ').trim();
 if(m.sender==='user')return tr('Вы: {text}',{text:text||tr('сообщение')});
 const what=m.block==='confirm'&&m.payload?.title?String(m.payload.title):m.block?BLOCKS[m.block]||'':'';
 const head=text&&what&&!text.toLowerCase().includes(what.toLowerCase())?text.replace(/\.$/,'')+' · '+what:text||what||tr('Сообщение');
 return m.done&&m.result?head+' — '+m.result:head;
}
// The day a message belongs to, said the way a person says it: «Сегодня», «Вчера», «16 ноября».
export function historyDay(at:number,now=Date.now()):string{
 if(!at)return tr('Раньше');
 const day=(t:number)=>Math.floor((t+SHIFT)/DAY),d=day(now)-day(at);
 if(d<=0)return tr('Сегодня');if(d===1)return tr('Вчера');
 return dateText(at,{timeZone:'Asia/Almaty',day:'numeric',month:'long'});
}
// Newest first, each with its day title where a day starts.
export function historyRows<T extends HistoryMessage>(messages:T[],now=Date.now()):{message:T;line:string;time:string;day:string}[]{
 const rows=[...messages].reverse().map(message=>{const at=messageTime(message.id);return {message,line:historyLine(message),time:at?new Date(at).toLocaleTimeString('ru-RU',{timeZone:'Asia/Almaty',hour:'2-digit',minute:'2-digit'}):'',day:historyDay(at,now)};});
 return rows.map((r,i)=>({...r,day:i===0||rows[i-1].day!==r.day?r.day:''}));
}
