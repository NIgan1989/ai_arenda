import {L,t} from './i18n';
// Editing a property one short step at a time: every step is saved at once, then the AI administrator offers the next one.
// Shared by the site and the app: the body for PUT /api/listings/:id, the line under each step and the AI's next advice.
import {amenities,checkinMethods,isBath,isBanquet,isVenue,kindLabel,propertyTypes} from './listings';
import {clock} from './rental-policy';
type Row=Record<string,any>;

export type EditBody={title:string;city:string;district:string;address:string;description:string;price:number;rooms:number;capacity:number;cleaningMinutes:number;ownStaff:boolean;photos:string[];published:boolean;
 details:{type:string;area:number;beds:number;bathrooms:number;floor:number;floors:number;checkinMethod:string;amenities:string[];pets:boolean;smoking:boolean;parties:boolean;menu?:string};
 rental:{hourlyPrice:number;minHours:number;nightlyPrice:number;deposit:number;checkinTime:string;checkoutTime:string;houseRules:string;includedGuests:number;extraGuestPrice:number;prepMinutes:number}};
export type EditStep='photos'|'flat'|'place'|'text'|'amenities'|'prices'|'checkin'|'rules';
export const EDIT_STEPS:{key:EditStep;title:string}[]=L([
 {key:'photos',title:'Фотографии'},{key:'flat',title:'Жильё'},{key:'place',title:'Адрес'},{key:'text',title:'Описание'},
 {key:'amenities',title:'Удобства'},{key:'prices',title:'Цены'},{key:'checkin',title:'Заезд'},{key:'rules',title:'Правила'}]);

export function editBody(p:Row):EditBody{
 const d=p.details||{},r=p.policy||{};
 return {title:p.title||'',city:p.city||'',district:p.district||'',address:p.address||'',description:p.description||'',price:Number(p.price)||0,rooms:Number(p.rooms)||1,capacity:Number(p.capacity)||1,cleaningMinutes:Number(p.cleaning_minutes)||90,ownStaff:!!Number(p.own_staff),photos:[...(p.photos||[])],published:!!p.published,
  details:{type:propertyTypes[d.type]?d.type:'apartment',area:Number(d.area)||35,beds:Number(d.beds)||Number(p.capacity)||1,bathrooms:Number(d.bathrooms)||1,floor:Number(d.floor??1),floors:Number(d.floors)||5,checkinMethod:checkinMethods[d.checkinMethod]?d.checkinMethod:'meet',amenities:(d.amenities||[]).filter((a:string)=>amenities[a]),pets:!!d.pets,smoking:!!d.smoking,parties:!!d.parties,...(typeof d.menu==='string'&&d.menu?{menu:d.menu}:{})},
  rental:{hourlyPrice:Number(r.hourly_price)||0,minHours:Number(r.min_hours)||2,nightlyPrice:Number(r.nightly_price)||0,deposit:Number(r.deposit)||0,checkinTime:clock(r.checkin_minutes??840),checkoutTime:clock(r.checkout_minutes??720),houseRules:r.house_rules||'',includedGuests:Number(r.included_guests)||0,extraGuestPrice:Number(r.extra_guest_price)||0,prepMinutes:Number(r.prep_minutes)||0}};
}
// What goes to the server: the whole listing with the versions the owner started from.
export function editRequest(b:EditBody,p:Row){return {...b,expectedVersion:p.listing_version||0,policyVersion:p.policy?.version||0};}

const money=(n:number)=>new Intl.NumberFormat('ru-RU').format(n)+' ₸';
// A banquet hall is priced per guest with a least number of guests. The service keeps it as a price of the slot for
// that least party (price), the party it covers (includedGuests) and the price of every guest above it
// (extraGuestPrice), so the amount is always guests × price per guest, never less than the least order.
export function banquetPrice(b:Pick<EditBody,'price'|'rental'>){const least=Math.max(1,b.rental.includedGuests||1),perGuest=b.rental.extraGuestPrice||Math.round(b.price/least);return {perGuest,least};}
export function withBanquetPrice<T extends Pick<EditBody,'price'|'rental'>>(b:T,perGuest:number,least:number):T{const n=Math.max(1,Math.floor(least)||1),g=Math.max(0,Math.floor(perGuest)||0);return {...b,price:Math.max(100,g*n),rental:{...b.rental,includedGuests:n,extraGuestPrice:g,hourlyPrice:0,nightlyPrice:0}};}
// A bath is not «жильё» and has no check-in hours: its two steps are named for what the owner fills in there.
export function stepTitle(type:string,key:EditStep):string{
 if(isBath(type)){if(key==='flat')return t('Объект');if(key==='checkin')return t('Приход гостей');}
 if(isBanquet(type)){if(key==='flat')return t('Зал');if(key==='prices')return t('Цена и меню');if(key==='checkin')return t('Приход гостей');}
 return EDIT_STEPS.find(s=>s.key===key)!.title;
}
// The one line under each step on the overview, so the owner sees what is there without opening it.
export function stepLine(b:EditBody,key:EditStep):string{
 const d=b.details,r=b.rental;
 switch(key){
  case 'photos':return b.photos.length?t('{length} из 8',{length:b.photos.length}):t('Нет фото');
  case 'flat':return [kindLabel(d.type),b.ownStaff?t('свой персонал'):'',isVenue(d.type)?'':t('{rooms} комн.',{rooms:b.rooms}),isBanquet(d.type)?t('до {n} гост.',{n:b.capacity}):t('{n} гост.',{n:b.capacity})].filter(Boolean).join(' · ');
  case 'place':return b.address||[b.city,b.district].filter(Boolean).join(', ')||t('Не указан');
  case 'text':return t('{length} знаков',{length:b.description.trim().length});
  case 'amenities':return d.amenities.length?t('{length} отмечено',{length:d.amenities.length}):t('Не отмечены');
  case 'prices':if(isBanquet(d.type)){const q=banquetPrice(b);return [q.perGuest?t('{v} за гостя',{v:money(q.perGuest)}):t('Цена на гостя не задана'),t('от {least} гост.',{least:q.least}),d.menu?t('меню есть'):t('меню нет')].join(' · ');}
   return isBath(d.type)?[r.hourlyPrice?t('{v}/ч',{v:money(r.hourlyPrice)}):t('Цена за час не задана'),r.hourlyPrice?t('от {minHours} ч',{minHours:r.minHours}):'',r.includedGuests&&r.extraGuestPrice?t('+{v} за гостя сверх {includedGuests}',{v:money(r.extraGuestPrice),includedGuests:r.includedGuests}):''].filter(Boolean).join(' · ')
   :[money(b.price),r.hourlyPrice?t('{v}/ч',{v:money(r.hourlyPrice)}):''].filter(Boolean).join(' · ');
  case 'checkin':return isVenue(d.type)?t('{v} · уборка {cleaningMinutes} мин',{v:(checkinMethods[d.checkinMethod]||t('Не выбрано')),cleaningMinutes:b.cleaningMinutes}):r.checkinTime+'–'+r.checkoutTime;
  case 'rules':return r.houseRules.trim()?(d.pets?t('с питомцами'):t('без питомцев')):t('Не написаны');
 }
}
// A step that blocks showing the flat to guests, or that is clearly missing.
export function stepNeeds(b:EditBody,key:EditStep){
 return key==='photos'?!b.photos.length:key==='text'?b.description.trim().length<80:key==='place'?!b.address.trim()||!b.district.trim():key==='rules'?!b.rental.houseRules.trim():false;
}

export type Advice={step:EditStep|'publish'|null;text:string;action?:string};
// The AI administrator's next advice: what to do now so the flat is shown and booked more often.
// Steps the owner put off with «Не сейчас» are skipped.
export function nextAdvice(b:EditBody,skipped:string[]=[]):Advice{
 const short=b.description.trim().length<80,keep=(a:Advice|false)=>a&&!skipped.includes(a.step||'')?[a]:[];
 // First what stops the flat from being shown, then showing it, then what makes it booked more often.
 const blocking=[...keep(!b.photos.length&&{step:'photos',text:t('Без фото гости не увидят жильё. Добавьте 3–5 снимков, можно сразу несколько.'),action:t('Добавить фото')}),
  ...keep(short&&{step:'text',text:isBanquet(b.details.type)?t('Описание короче 80 знаков, с ним объявление не показать. Допишите пару строк о зале.'):isBath(b.details.type)?t('Описание короче 80 знаков, с ним объявление не показать. Допишите пару строк об объекте.'):t('Описание короче 80 знаков, с ним объявление не показать. Допишите пару строк о жилье.'),action:t('Дописать')}),
  ...keep((!b.address.trim()||!b.district.trim())&&{step:'place',text:t('Укажите район и точный адрес: по нему ставится метка на карте.'),action:t('Указать адрес')}),
  // A bath is found only by the hour: without an hourly price no guest sees it.
  ...keep(isBath(b.details.type)&&!b.rental.hourlyPrice&&{step:'prices',text:t('Баню ищут по часам. Назначьте цену за час, иначе гости её не найдут.'),action:t('Назначить цену')}),
  ...keep(isBanquet(b.details.type)&&!b.rental.extraGuestPrice&&{step:'prices',text:t('Зал выбирают по цене на гостя. Назначьте её и наименьшее число гостей.'),action:t('Назначить цену')})];
 if(blocking.length)return blocking[0];
 if(!b.published&&b.photos.length&&!short&&!skipped.includes('publish'))return {step:'publish',text:isBanquet(b.details.type)?t('Всё нужное есть. Показать зал гостям на карте?'):isBath(b.details.type)?t('Всё нужное есть. Показать объект гостям на карте?'):t('Всё нужное есть. Показать жильё гостям на карте?'),action:t('Показать гостям')};
 const better=[...keep(b.photos.length>0&&b.photos.length<5&&{step:'photos',text:isBanquet(b.details.type)?t('Добавьте ещё {n} фото: зал с накрытыми столами, сцену, вход. С пятью снимками бронируют чаще.',{n:5-b.photos.length}):isBath(b.details.type)?t('Добавьте ещё {n} фото: парную, комнату отдыха, двор. С пятью снимками бронируют чаще.',{n:5-b.photos.length}):t('Добавьте ещё {n} фото: кухню, санузел, вид из окна. С пятью снимками бронируют чаще.',{n:5-b.photos.length}),action:t('Добавить фото')}),
  ...keep(b.details.amenities.length<3&&{step:'amenities',text:isBanquet(b.details.type)?t('Отметьте, что есть: халяль, комната для намаза, сцена, звук. По ним выбирают зал.'):isBath(b.details.type)?t('Отметьте, что есть: парилка, бассейн, купель, веники. По ним гости выбирают баню.'):t('Отметьте удобства: гости ищут по Wi-Fi, кухне и стиральной машине.'),action:t('Отметить')}),
  ...keep(isBath(b.details.type)&&!b.rental.prepMinutes&&{step:'prices',text:t('Укажите, сколько нужно, чтобы затопить баню: напомню вовремя и не приму бронь раньше.'),action:t('Указать')}),
  ...keep(isBanquet(b.details.type)&&!b.details.menu&&{step:'prices',text:t('Добавьте меню: по нему гости понимают, что входит в цену на гостя.'),action:t('Добавить меню')}),
  ...keep(!isBanquet(b.details.type)&&!b.rental.hourlyPrice&&{step:'prices',text:t('Включите почасовую цену: между гостями жильё может приносить доход и днём.'),action:t('Назначить цену')}),
  ...keep(!b.rental.houseRules.trim()&&{step:'rules',text:isBanquet(b.details.type)?t('Напишите короткие правила: свои продукты и напитки, музыка, до какого часа. Так меньше споров с гостями.'):t('Напишите короткие правила: тишина, курение, возврат депозита. Так меньше споров с гостями.'),action:t('Написать')})];
 return better[0]||{step:null,text:b.published?t('Объявление в порядке, гости видят его на карте. Если что-то изменится, откройте нужный пункт.'):t('Объявление скрыто от гостей. Когда будете готовы, включите показ ниже.')};
}
// A save can fail because of another step (an older listing without rules, say): the step to open next.
export function stepForError(message:string):EditStep|null{
 const m=message.toLowerCase();
 return /правил/.test(m)?'rules':/описан|80 символ/.test(m)?'text':/фото/.test(m)?'photos':/адрес|район|город/.test(m)?'place':/цен|депозит|час/.test(m)?'prices':/этаж|спальн|комнат|гост|площад/.test(m)?'flat':/заезд|выезд|заселен|уборк/.test(m)?'checkin':/удобств/.test(m)?'amenities':null;
}

// When publishing waits for the administrator's check, the flat is sent for review with this reference;
// approving such a review shows the flat to guests at once (lib/participant-security.ts).
export const PUBLISH_REVIEW='Показать гостям после проверки';
export const needsReview=(message:string)=>/провер|допуск/i.test(message)&&!/телефон/i.test(message);
export function reviewRequest(p:{id:string;title?:string;city?:string;address?:string}){return {propertyId:p.id,reference:PUBLISH_REVIEW+': «'+(p.title||'жильё')+'», '+[p.city,p.address].filter(Boolean).join(', ')};}
// Shown through t(REVIEW_SENT) in the app; the list is what the translation tables are checked against.
const REVIEW_WORDS=/* i18n */['Отправил жильё на проверку администратору. Как только он подтвердит, оно само появится на карте, а вам придёт уведомление.'];
export const REVIEW_SENT=REVIEW_WORDS[0];
