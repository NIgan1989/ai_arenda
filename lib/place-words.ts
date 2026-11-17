// The page of one place for a guest, in the words of its kind. Housing is entered and left by the day,
// a bath is taken by the hour for a company, a banquet hall is taken for a lunch or an evening at a price per guest.
// One reading for the app (mobile/src/PropertyListing.tsx): the screen only lays the lines out.
import {propertyTypes,checkinMethods,isBath,isBanquet} from './listings';
import {clock,prepWords} from './rental-policy';
type Row=Record<string,any>;
const money=(n:number)=>new Intl.NumberFormat('ru-RU').format(Math.round(n||0))+' ₸';
const plural=(n:number,one:string,few:string,many:string)=>{const a=Math.abs(n)%100,b=a%10;return a>10&&a<20?many:b>1&&b<5?few:b===1?one:many;};
const guests=(n:number)=>n+' '+plural(n,'гостя','гостей','гостей');

export type PlaceWords={
 // Under the title: what it is and how many it takes.
 kind:string;
 // «Все условия»: how guests come, what the price covers.
 terms:string[];
 // Prices besides the main one.
 extra:string[];
 rulesTitle:string;
 // Курение, питомцы, вечеринки: only what makes sense for the kind.
 allowed:string;
 addressNote:string;
 // The main price and the line under it.
 price:string;priceNote:string;
 // The guest's button when no dates are chosen yet.
 choose:string;
};

export function placeWords(p:Row):PlaceWords{
 const d=p.details||{},policy=p.policy||{},type=String(d.type||''),name=propertyTypes[type as keyof typeof propertyTypes];
 const how=checkinMethods[d.checkinMethod as keyof typeof checkinMethods],deposit='Депозит: '+money(policy.deposit||0),smoking='Курение: '+(d.smoking?'разрешено':'запрещено');
 if(isBath(type)){
  const included=Number(policy.included_guests)||0,above=Number(policy.extra_guest_price)||0,prep=Number(policy.prep_minutes)||0,hour=Number(policy.hourly_price)||0;
  return {kind:(name||'Баня')+(d.area?' · '+d.area+' м²':'')+'\nЦеликом для вашей компании · до '+guests(Number(p.capacity)||1),
   terms:['Бронь по часам, от '+(policy.min_hours||1)+' ч',
    ...(included&&above?['В цену входит '+included+' '+plural(included,'гость','гостя','гостей')+', каждый следующий: '+money(above)+' в час']:[]),
    ...(prep?['Бронируйте не позже чем за '+prepWords(prep)+': столько готовят к вашему приходу']:[]),
    how||'Как попасть внутрь, уточняется'],
   extra:[deposit],rulesTitle:'Правила',allowed:smoking,
   addressNote:'Точный адрес доступен после подтверждения брони. Свободное время проверим на выбранные часы.',
   price:hour?money(hour):money(p.price),priceNote:hour?'За час · от '+(policy.min_hours||1)+' ч':'За сутки',choose:'Выбрать время'};
 }
 if(isBanquet(type)){
  const least=Math.max(1,Number(policy.included_guests)||1),each=Number(policy.extra_guest_price)||Math.round((Number(p.price)||0)/least);
  return {kind:(name||'Зал')+(d.area?' · '+d.area+' м²':'')+'\nЗал целиком · до '+guests(Number(p.capacity)||1),
   terms:['Обед с 12:00 до 17:00, вечер с 18:00 до полуночи','Цена считается на гостя, от '+guests(least),...(typeof d.menu==='string'&&d.menu.trim()?['Меню: '+d.menu.trim()]:[]),how||'Как попасть внутрь, уточняется'],
   extra:[deposit],rulesTitle:'Правила',allowed:smoking,
   addressNote:'Точный адрес доступен после подтверждения брони. Свободен ли зал, проверим на выбранный день.',
   price:money(each),priceNote:'За гостя · от '+guests(least),choose:'Выбрать день'};
 }
 const beds=Number(d.beds)||0;
 return {kind:(name||'Жильё')+' · '+p.rooms+' комн.'+(d.area?' · '+d.area+' м²':'')+'\nДо '+p.capacity+' гостей'+(beds?' · '+beds+' '+plural(beds,'спальное место','спальных места','спальных мест'):''),
  terms:['Заезд: '+clock(policy.checkin_minutes??840)+' · выезд: '+clock(policy.checkout_minutes??720),how||'Способ заезда уточняется',
   ...(d.floor!==undefined||d.bathrooms?[[d.floor!==undefined?'Этаж '+d.floor+' из '+d.floors:'',d.bathrooms?'санузлы: '+d.bathrooms:''].filter(Boolean).join(' · ')]:[])],
  extra:[deposit,...(policy.hourly_price?[money(policy.hourly_price)+' / ч · от '+policy.min_hours+' ч']:[]),...(policy.nightly_price?[money(policy.nightly_price)+' / ночь']:[])],
  rulesTitle:'Правила проживания',allowed:smoking+' · питомцы: '+(d.pets?'разрешены':'не допускаются')+' · вечеринки: '+(d.parties?'разрешены':'запрещены'),
  addressNote:'Точный адрес доступен после подтверждения брони. Доступность проверим на выбранные даты с учётом уборки.',
  price:money(p.price),priceNote:'За начатые сутки · 24 часа',choose:'Проверить даты'};
}
