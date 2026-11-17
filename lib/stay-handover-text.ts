// Shared by the server and the app: what can be wrong after a stay, and where the handover of a booking stands.
export const HANDOVER_ISSUES={dirt:'Сильная грязь',damage:'Поломка или порча',smoking:'Курение',guests:'Больше гостей, чем в брони',party:'Вечеринка или жалоба соседей',late:'Поздний выезд',missing:'Пропали вещи'} as const;
export type HandoverIssue=keyof typeof HANDOVER_ISSUES;
// The owner hands the home over within two days of the checkout; after that a stay without a handover reads «без замечаний».
export const HANDOVER_WINDOW=2*86400;
export const STAY_PHOTO_LIMIT=8;
// В бане и зале не выезжают и не устраивают «вечеринку»: те же коды, свои слова.
const VENUE_ISSUES:Record<string,string>={late:'Задержались дольше брони',party:'Жалоба соседей'};
export const handoverIssueText=(code:string,venue=false)=>(venue&&VENUE_ISSUES[code])||(HANDOVER_ISSUES as Record<string,string>)[code]||code;
export type Handover={verdict:'ok'|'issues';issues:string[];note:string;cleaner_photos:number;created_at:number};
// ask: the owner can still hand over; done: handed over; silent: the time passed without a handover, read as no issues.
export function handoverState(b:{status:string;terms?:{actual_checkout?:number|null}|null;handover?:Handover|null},now:number):'ask'|'done'|'silent'|null{
 if(b.handover)return 'done';
 const out=Number(b.terms?.actual_checkout||0);
 if(b.status!=='completed'||!out)return null;
 return out>now-HANDOVER_WINDOW?'ask':'silent';
}
