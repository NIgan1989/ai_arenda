import {t,forms,dateText} from './i18n';
// Words for «Постоянный исполнитель», shared by the site and the app. Short lines about what the owner and the cleaner
// get from working through the service rather than a messenger.
type Row=Record<string,any>;
const money=(n:number)=>new Intl.NumberFormat('ru-RU').format(n)+' ₸';
const day=(at:number)=>dateText(at*1000,{timeZone:'Asia/Qyzylorda',day:'numeric',month:'long'});

export function regularSince(r:Row){
 const facts=[r.since?t('с {date}',{date:day(r.since)}):'',r.here?t(forms(r.here,'{n} уборка здесь','{n} уборки здесь','{n} уборок здесь'),{n:r.here}):'',r.noShows?t(forms(r.noShows,'{n} срыв','{n} срыва','{n} срывов'),{n:r.noShows}):r.completed?t('без срывов'):''].filter(Boolean);
 return facts.join(' · ');
}
export type Benefit={key:'first'|'backup'|'guarantee'|'fee'|'proof';title:string;text:string;warn?:boolean};
export function regularBenefits(state:Row):Benefit[]{
 const name=String(state.regular?.name||'').split(' ')[0];
 return [
  {key:'first',title:t('Уборки приходят первыми'),text:state.regular&&name?t('{name} получает каждую уборку первым. Ответ «да» сразу назначает, без переписки.',{name}):t('Исполнитель получает каждую уборку первым. Ответ «да» сразу назначает, без переписки.')},
  {key:'backup',title:t('Замена, если не сможет'),text:t('Если исполнитель заболел или не ответил вовремя, ИИ сам предложит уборку другому надёжному исполнителю.')},
  {key:'guarantee',title:t('Оплата напрямую'),text:t('После приёмки вы переводите исполнителю сумму уборки на его Kaspi и отмечаете «Оплатил уборку», он подтверждает получение. Сервис эти деньги не принимает.')},
  {key:'fee',title:t('Комиссия ниже'),text:String(state.terms?.text||'')},
  {key:'proof',title:t('Фото до и после'),text:t('Отчёт с фото и временем хранится в сервисе. Если что-то испортят, есть чем доказать.')},
 ];
}
// The cleaner's side: the reserves of the old model are gone, so there is nothing to sum up here.
export function cleanerMoneyLine(_m:Row){return '';}
// Under the cleaning's sum: who pays.
export function jobPayNote(item:Row){
 if(item.payment_received_at)return t('оплата получена');
 if(item.settled_at)return t('заказчик отметил оплату');
 return t('заказчик платит напрямую после приёмки');
}
