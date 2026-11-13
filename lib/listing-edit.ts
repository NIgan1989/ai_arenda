// Editing a property one short step at a time: every step is saved at once, then the AI administrator offers the next one.
// Shared by the site and the app: the body for PUT /api/listings/:id, the line under each step and the AI's next advice.
import {amenities,checkinMethods,kindLabel,propertyTypes} from './listings';
import {clock} from './rental-policy';
type Row=Record<string,any>;

export type EditBody={title:string;city:string;district:string;address:string;description:string;price:number;rooms:number;capacity:number;cleaningMinutes:number;ownStaff:boolean;photos:string[];published:boolean;
 details:{type:string;area:number;beds:number;bathrooms:number;floor:number;floors:number;checkinMethod:string;amenities:string[];pets:boolean;smoking:boolean;parties:boolean};
 rental:{hourlyPrice:number;minHours:number;nightlyPrice:number;deposit:number;checkinTime:string;checkoutTime:string;houseRules:string}};
export type EditStep='photos'|'flat'|'place'|'text'|'amenities'|'prices'|'checkin'|'rules';
export const EDIT_STEPS:{key:EditStep;title:string}[]=[
 {key:'photos',title:'Фотографии'},{key:'flat',title:'Жильё'},{key:'place',title:'Адрес'},{key:'text',title:'Описание'},
 {key:'amenities',title:'Удобства'},{key:'prices',title:'Цены'},{key:'checkin',title:'Заезд'},{key:'rules',title:'Правила'}];

export function editBody(p:Row):EditBody{
 const d=p.details||{},r=p.policy||{};
 return {title:p.title||'',city:p.city||'',district:p.district||'',address:p.address||'',description:p.description||'',price:Number(p.price)||0,rooms:Number(p.rooms)||1,capacity:Number(p.capacity)||1,cleaningMinutes:Number(p.cleaning_minutes)||90,ownStaff:!!Number(p.own_staff),photos:[...(p.photos||[])],published:!!p.published,
  details:{type:propertyTypes[d.type]?d.type:'apartment',area:Number(d.area)||35,beds:Number(d.beds)||Number(p.capacity)||1,bathrooms:Number(d.bathrooms)||1,floor:Number(d.floor??1),floors:Number(d.floors)||5,checkinMethod:checkinMethods[d.checkinMethod]?d.checkinMethod:'meet',amenities:(d.amenities||[]).filter((a:string)=>amenities[a]),pets:!!d.pets,smoking:!!d.smoking,parties:!!d.parties},
  rental:{hourlyPrice:Number(r.hourly_price)||0,minHours:Number(r.min_hours)||2,nightlyPrice:Number(r.nightly_price)||0,deposit:Number(r.deposit)||0,checkinTime:clock(r.checkin_minutes??840),checkoutTime:clock(r.checkout_minutes??720),houseRules:r.house_rules||''}};
}
// What goes to the server: the whole listing with the versions the owner started from.
export function editRequest(b:EditBody,p:Row){return {...b,expectedVersion:p.listing_version||0,policyVersion:p.policy?.version||0};}

const money=(n:number)=>new Intl.NumberFormat('ru-RU').format(n)+' ₸';
// The one line under each step on the overview, so the owner sees what is there without opening it.
export function stepLine(b:EditBody,key:EditStep):string{
 const d=b.details,r=b.rental;
 switch(key){
  case 'photos':return b.photos.length?b.photos.length+' из 8':'Нет фото';
  case 'flat':return [kindLabel(d.type),b.rooms+' комн.',b.capacity+' гост.',b.ownStaff?'свой персонал':''].filter(Boolean).join(' · ');
  case 'place':return b.address||[b.city,b.district].filter(Boolean).join(', ')||'Не указан';
  case 'text':return b.description.trim().length+' знаков';
  case 'amenities':return d.amenities.length?d.amenities.length+' отмечено':'Не отмечены';
  case 'prices':return [money(b.price),r.hourlyPrice?money(r.hourlyPrice)+'/ч':''].filter(Boolean).join(' · ');
  case 'checkin':return r.checkinTime+'–'+r.checkoutTime;
  case 'rules':return r.houseRules.trim()?(d.pets?'с питомцами':'без питомцев'):'Не написаны';
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
 const blocking=[...keep(!b.photos.length&&{step:'photos',text:'Без фото гости не увидят жильё. Добавьте 3–5 снимков, можно сразу несколько.',action:'Добавить фото'}),
  ...keep(short&&{step:'text',text:'Описание короче 80 знаков, с ним объявление не показать. Допишите пару строк о жилье.',action:'Дописать'}),
  ...keep((!b.address.trim()||!b.district.trim())&&{step:'place',text:'Укажите район и точный адрес: по нему ставится метка на карте.',action:'Указать адрес'})];
 if(blocking.length)return blocking[0];
 if(!b.published&&b.photos.length&&!short&&!skipped.includes('publish'))return {step:'publish',text:'Всё нужное есть. Показать жильё гостям на карте?',action:'Показать гостям'};
 const better=[...keep(b.photos.length>0&&b.photos.length<5&&{step:'photos',text:'Добавьте ещё '+(5-b.photos.length)+' фото: кухню, санузел, вид из окна. С пятью снимками бронируют чаще.',action:'Добавить фото'}),
  ...keep(b.details.amenities.length<3&&{step:'amenities',text:'Отметьте удобства: гости ищут по Wi-Fi, кухне и стиральной машине.',action:'Отметить'}),
  ...keep(!b.rental.hourlyPrice&&{step:'prices',text:'Включите почасовую цену: между гостями жильё может приносить доход и днём.',action:'Назначить цену'}),
  ...keep(!b.rental.houseRules.trim()&&{step:'rules',text:'Напишите короткие правила: тишина, курение, возврат депозита. Так меньше споров с гостями.',action:'Написать'})];
 return better[0]||{step:null,text:b.published?'Объявление в порядке, гости видят его на карте. Если что-то изменится, откройте нужный пункт.':'Объявление скрыто от гостей. Когда будете готовы, включите показ ниже.'};
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
export const REVIEW_SENT='Отправил жильё на проверку администратору. Как только он подтвердит, оно само появится на карте, а вам придёт уведомление.';
