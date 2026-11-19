// Words for «Постоянный исполнитель», shared by the site and the app. Short lines about what the owner and the cleaner
// get from working through the service rather than a messenger.
type Row=Record<string,any>;
const plural=(n:number,one:string,few:string,many:string)=>{const a=n%10,b=n%100;return n+' '+(a===1&&b!==11?one:a>=2&&a<=4&&(b<10||b>=20)?few:many);};
const money=(n:number)=>new Intl.NumberFormat('ru-RU').format(n)+' ₸';
const day=(at:number)=>new Date(at*1000).toLocaleDateString('ru-RU',{timeZone:'Asia/Qyzylorda',day:'numeric',month:'long'});

export function regularSince(r:Row){
 const facts=[r.since?'с '+day(r.since):'',r.here?plural(r.here,'уборка','уборки','уборок')+' здесь':'',r.noShows?plural(r.noShows,'срыв','срыва','срывов'):r.completed?'без срывов':''].filter(Boolean);
 return facts.join(' · ');
}
export type Benefit={key:'first'|'backup'|'guarantee'|'fee'|'proof';title:string;text:string;warn?:boolean};
export function regularBenefits(state:Row):Benefit[]{
 const name=String(state.regular?.name||'').split(' ')[0];
 return [
  {key:'first',title:'Уборки приходят первыми',text:`${state.regular&&name?name:'Исполнитель'} получает каждую уборку первым. Ответ «да» сразу назначает, без переписки.`},
  {key:'backup',title:'Замена, если не сможет',text:'Если исполнитель заболел или не ответил вовремя, ИИ сам предложит уборку другому надёжному исполнителю.'},
  {key:'guarantee',title:'Оплата напрямую',text:'После приёмки вы переводите исполнителю сумму уборки на его Kaspi и отмечаете «Оплатил уборку», он подтверждает получение. Сервис эти деньги не принимает.'},
  {key:'fee',title:'Комиссия ниже',text:String(state.terms?.text||'')},
  {key:'proof',title:'Фото до и после',text:'Отчёт с фото и временем хранится в сервисе. Если что-то испортят, есть чем доказать.'},
 ];
}
// The cleaner's side: the reserves of the old model are gone, so there is nothing to sum up here.
export function cleanerMoneyLine(_m:Row){return '';}
// Under the cleaning's sum: who pays.
export function jobPayNote(item:Row){
 if(item.payment_received_at)return 'оплата получена';
 if(item.settled_at)return 'заказчик отметил оплату';
 return 'заказчик платит напрямую после приёмки';
}
