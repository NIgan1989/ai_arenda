// Words for «Моя уборщица», shared by the site and the app. Short lines about what the owner and the cleaner
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
 const g=state.guarantee||{},covered=Number(g.covered||0),name=String(state.regular?.name||'Она').split(' ')[0];
 return [
  {key:'first',title:'Уборки сами приходят ей',text:`${state.regular?name:'Уборщица'} получает каждую уборку первой. Её «да» сразу назначает, без переписки.`},
  {key:'backup',title:'Замена, если не сможет',text:'Заболела или молчит до срока ответа: ИИ сам предложит уборку другому надёжному исполнителю.'},
  covered>0?{key:'guarantee',title:'Оплата гарантирована',text:`Сумма уборки резервируется с вашего баланса (хватит на ${plural(covered,'уборку','уборки','уборок')}). Уборщица видит гарантию и получает деньги после вашей приёмки.`}
   :{key:'guarantee',title:'Включите гарантию оплаты',text:`Пополните баланс${g.fee?` хотя бы на ${money(g.fee)}`:''}: сумма уборки будет резервироваться заранее, уборщица увидит гарантию и охотнее берёт вашу квартиру.`,warn:true},
  {key:'fee',title:'Комиссия ниже',text:String(state.terms?.text||'')},
  {key:'proof',title:'Фото до и после',text:'Отчёт с фото и временем хранится в сервисе. Если что-то испортят, есть чем доказать.'},
 ];
}
// The cleaner's side, one line per fact, for her list of regular flats.
export function cleanerMoneyLine(m:Row){
 const parts=[m.held?money(m.held)+' зарезервировано':'',m.due?money(m.due)+' к выплате':'',m.paid?money(m.paid)+' получено':''].filter(Boolean);
 return parts.length?parts.join(' · '):'';
}
// Under the cleaning's sum: who pays and whether the money is already set aside.
export function jobPayNote(item:Row){
 if(item.guarantee==='held')return 'оплата гарантирована, сумма зарезервирована';
 if(item.guarantee==='due')return 'работа принята, сервис выплачивает';
 if(item.guarantee==='paid')return 'выплачено сервисом';
 return 'за выполнение';
}
