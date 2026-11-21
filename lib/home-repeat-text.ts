import {t} from './i18n';
// Повтор уборки на дом: расчёт следующей даты и подписи. Без сервера, чтобы этим же пользовалось приложение.
export const REPEAT_DAYS=[7,14,28] as const,REPEAT_AHEAD=3*86400;
const REPEAT_WORDS:Record<number,string>=/* i18n */{7:'Каждую неделю',14:'Раз в 2 недели',28:'Раз в 4 недели'};
export const repeatLabel=(every:unknown)=>t(REPEAT_WORDS[Number(every)]||'Не повторять');
// Следующая дата: тот же день недели и час, что у последней уборки, не раньше чем через час от «сейчас».
export function nextRepeat(lastStart:number,every:number,at:number){
 let next=Number(lastStart)+every*86400;
 while(next<=at+3600)next+=every*86400;
 return next;
}
