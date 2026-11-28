import {forms,t} from './i18n';
// The page of one place for a guest, in the words of its kind. Housing is entered and left by the day,
// a bath is taken by the hour for a company, a banquet hall is taken for a lunch or an evening at a price per guest.
// One reading for the app (mobile/src/PropertyListing.tsx): the screen only lays the lines out.
import {minutesWords,servicesOf} from './venue-services';
import {propertyTypes,checkinMethods,isBanquet,isHourlyVenue,isAuto} from './listings';
import {clock,prepWords} from './rental-policy';
import {venueHours,sessionLine} from './venue-hours';
type Row=Record<string,any>;
const money=(n:number)=>new Intl.NumberFormat('ru-RU').format(Math.round(n||0))+' ₸';
// «до 6 гостей», «от 20 гостей»: the number with the word in the form that follows «до» and «от».
const guests=(n:number)=>n+' '+forms(n,'гостя','гостей','гостей');

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
 const how=d.checkinMethod==='meet'&&(isHourlyVenue(type)||isBanquet(type))?t('Встречает администратор'):checkinMethods[d.checkinMethod as keyof typeof checkinMethods],deposit=t('Депозит: {v}',{v:money(policy.deposit||0)}),smoking=d.smoking?t('Курение: разрешено'):t('Курение: запрещено'),area=d.area&&!isAuto(type)?t(' · {area} м²',{area:d.area}):'';
 if(isHourlyVenue(type)){
  const included=Number(policy.included_guests)||0,above=Number(policy.extra_guest_price)||0,prep=Number(policy.prep_minutes)||0,hour=Number(policy.hourly_price)||0,car=isAuto(type);
  // A car place shows its services, and its price is the cheapest of them («от 3 000 ₸»).
  const services=servicesOf(d),least=services.length?Math.min(...services.map(s=>s.price)):0;
  return {kind:(name||t('Баня'))+area+'\n'+(car?t('Бокс на время вашей машины'):t('Целиком для вашей компании · до {guests}',{guests:guests(Number(p.capacity)||1)})),
   terms:[services.length?t('Услуги: {v}',{v:services.map(s=>s.name+' · '+minutesWords(s.minutes)+' · '+money(s.price)).join('; ')}):t('Бронь по часам, от {v} ч',{v:(policy.min_hours||1)}),
    ...(included&&above&&!car?[t('В цену входит {guests}, каждый следующий: {price} в час',{guests:included+' '+forms(included,'гость','гостя','гостей'),price:money(above)})]:[]),
    ...(prep?[t('Бронируйте не позже чем за {v}: столько готовят к вашему приходу',{v:prepWords(prep)})]:[]),
    how||t('Как попасть внутрь, уточняется')],
   extra:[deposit],rulesTitle:t('Правила'),allowed:smoking,
   addressNote:t('Точный адрес доступен после подтверждения брони. Свободное время проверим на выбранные часы.'),
   price:least?t('от {v}',{v:money(least)}):hour?money(hour):money(p.price),priceNote:least?t('За услугу'):hour?t('За час · от {v} ч',{v:(policy.min_hours||1)}):t('За сутки'),choose:least?t('Выбрать услугу'):t('Выбрать время')};
 }
 if(isBanquet(type)){
  const least=Math.max(1,Number(policy.included_guests)||1),each=Number(policy.extra_guest_price)||Math.round((Number(p.price)||0)/least);
  return {kind:(name||t('Зал'))+area+'\n'+t('Зал целиком · до {guests}',{guests:guests(Number(p.capacity)||1)}),
   terms:[venueHours(type,policy.venue_hours)!.sessions.map(sessionLine).join(', '),t('Цена считается на гостя, от {v}',{v:guests(least)}),...(typeof d.menu==='string'&&d.menu.trim()?[t('Меню: {v}',{v:d.menu.trim()})]:[]),how||t('Как попасть внутрь, уточняется')],
   extra:[deposit],rulesTitle:t('Правила'),allowed:smoking,
   addressNote:t('Точный адрес доступен после подтверждения брони. Свободен ли зал, проверим на выбранный день.'),
   price:money(each),priceNote:t('За гостя · от {v}',{v:guests(least)}),choose:t('Выбрать день')};
 }
 const beds=Number(d.beds)||0;
 return {kind:(name||t('Жильё'))+t(' · {rooms} комн.',{rooms:p.rooms})+area+'\n'+t('До {capacity} гостей',{capacity:p.capacity})+(beds?' · '+beds+' '+forms(beds,'спальное место','спальных места','спальных мест'):''),
  terms:[t('Заезд: {from} · выезд: {to}',{from:clock(policy.checkin_minutes??840),to:clock(policy.checkout_minutes??720)}),how||t('Способ заезда уточняется'),
   ...(d.floor!==undefined||d.bathrooms?[[d.floor!==undefined?t('Этаж {floor} из {floors}',{floor:d.floor,floors:d.floors}):'',d.bathrooms?t('санузлы: {bathrooms}',{bathrooms:d.bathrooms}):''].filter(Boolean).join(' · ')]:[])],
  extra:[deposit,...(policy.hourly_price?[t('{price} / ч · от {min} ч',{price:money(policy.hourly_price),min:policy.min_hours})]:[]),...(policy.nightly_price?[t('{price} / ночь',{price:money(policy.nightly_price)})]:[])],
  rulesTitle:t('Правила проживания'),allowed:[smoking,d.pets?t('питомцы: разрешены'):t('питомцы: не допускаются'),d.parties?t('вечеринки: разрешены'):t('вечеринки: запрещены')].join(' · '),
  addressNote:t('Точный адрес доступен после подтверждения брони. Доступность проверим на выбранные даты с учётом уборки.'),
  price:money(p.price),priceNote:t('За начатые сутки · 24 часа'),choose:t('Проверить даты')};
}

/** The price an owner sees for one of their places, in the list and on its pin (simulation of 2026-11-28). A home has
 * its day; a bath, a loft or a field its hour; a car place its cheapest service; a hall its price per guest. The stored
 * day price of a place taken by the hour is only a technical number and is never shown. */
export function ownerPrice(p:Row):{amount:number;line:string}{
 const d=p.details||{},policy=p.policy||{},type=String(d.type||'');
 if(isHourlyVenue(type)){
  const services=servicesOf(d);
  if(services.length){const least=Math.min(...services.map(s=>s.price));return {amount:least,line:t('от {v}',{v:money(least)})};}
  const hour=Number(policy.hourly_price)||0;
  return hour?{amount:hour,line:t('{v} / час',{v:money(hour)})}:{amount:0,line:''};
 }
 if(isBanquet(type)){const each=Number(policy.extra_guest_price)||0;return each?{amount:each,line:t('{v} за гостя',{v:money(each)})}:{amount:0,line:''};}
 return {amount:Number(p.price)||0,line:money(Number(p.price)||0)};
}
