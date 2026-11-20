import {t} from './i18n';
// Pure text helpers for the booking risk: shared by the server, the site and the app.
export type RiskLevel='low'|'medium'|'high';
export type BookingRisk={level:RiskLevel;score:number;reasons:string[];deposit:number;phone:boolean;held?:boolean};
const money=(n:number)=>new Intl.NumberFormat('ru-RU').format(n)+' ₸';
export const riskLabel:Record<RiskLevel,string>={low:'Риск низкий',medium:'Риск средний',high:'Риск высокий'};
export function riskAdvice(r:BookingRisk,currentDeposit=0){
 if(r.level==='low')return t('Можно подтверждать без дополнительных условий.');
 const deposit=r.deposit>0&&!currentDeposit?t('взять возвратный депозит {v}',{v:money(r.deposit)}):'';
 const phone=!r.phone?t('попросить подтвердить телефон'):'';
 const parts=[deposit,phone].filter(Boolean);
 if(!parts.length)return r.level==='high'?t('Проверьте гостя перед подтверждением.'):t('Депозит уже предусмотрен правилами, можно подтверждать.');
 const text=parts.join(t(' и '));
 return r.level==='high'?t('Советую {what}.',{what:text}):t('Можно {what}.',{what:text});
}
