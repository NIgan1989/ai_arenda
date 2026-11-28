import {L,t as tr} from './i18n';
import {DomainError,number,required} from './domain';
import {servicesInput} from './venue-services';
type Row=Record<string,any>;
// Kinds of housing. The service is not only about flats: a hostel, a hotel or an apart-hotel has its own staff,
// so for them the AI administrator does not look for executors (own_staff, see staffedTypes).
export const propertyTypes:Record<string,string>=L({apartment:'Квартира',studio:'Студия',room:'Комната',house:'Дом',guesthouse:'Гостевой дом',hostel:'Хостел',hotel:'Гостиница',aparthotel:'Апарт-отель',resort:'База отдыха',banya:'Баня',sauna:'Сауна',banquet:'Банкетный зал',cafe:'Кафе',
 // «Досуг», «Спорт», «Авто» (2026-11-28): places taken whole for a few hours, by the hour, with their own staff.
 loft:'Лофт',photostudio:'Фотостудия',meeting:'Конференц-зал',karaoke_room:'Караоке-кабинка',playroom:'Детская комната',gazebo:'Беседка, юрта',quest:'Квест',
 field:'Футбольное поле',court:'Корт',sporthall:'Спортзал',billiard:'Бильярд',gameclub:'Игровой клуб',
 carwash:'Автомойка',tires:'Шиномонтаж',carservice:'Автосервис',detailing:'Детейлинг'});
// Categories a guest chooses on the map, like the tariffs of a taxi (since 2026-11-17). «Жильё» is a place to stay,
// «Баня» a bath or a sauna taken whole for a few hours. A search without a category is a search for «Жильё»:
// a guest who asks for a flat never sees a sauna.
export const categories:Record<string,{label:string;types:string[]}>=L({
 stay:{label:'Жильё',types:['apartment','studio','room','house','guesthouse','hostel','hotel','aparthotel','resort']},
 bath:{label:'Баня',types:['banya','sauna']},
 // «Банкет» (2026-11-17): a hall taken whole for a wedding, a той, an anniversary or a memorial meal. The price is
 // per guest with a least number of guests, the time is a slot of the day (banquetSlots), not a night.
 banquet:{label:'Банкет',types:['banquet','cafe']},
 // «Досуг», «Спорт», «Авто» (thread «Найти новые виды заведений», 2026-11-28): each is taken by the hour, as a bath is,
 // inside the hours the place sets itself (lib/venue-hours.ts). A field, a table or a box of one kind comes in
 // a number alike (lib/room-units.ts unitKinds): the guest books the first free one.
 leisure:{label:'Досуг',types:['loft','photostudio','meeting','karaoke_room','playroom','gazebo','quest']},
 sport:{label:'Спорт',types:['field','court','sporthall','billiard','gameclub']},
 auto:{label:'Авто',types:['carwash','tires','carservice','detailing']},
});
export const kindCategory=(type?:string)=>Object.entries(categories).find(([,c])=>c.types.includes(type||''))?.[0]||'stay';
// The category a search is in: «Баня» or «Банкет» when every type asked for is of it, «Жильё» otherwise, also when no type is named.
export const searchCategory=(kinds:string[]=[])=>{const found=kinds.length?kindCategory(kinds[0]):'stay';return found!=='stay'&&kinds.every(k=>kindCategory(k)===found)?found:'stay';};
export const isBath=(type?:string)=>kindCategory(type)==='bath';
export const isBanquet=(type?:string)=>kindCategory(type)==='banquet';
// Taken whole by the hour inside the place's own hours: a bath, and every place of «Досуг», «Спорт», «Авто».
export const HOURLY_CATEGORIES=['bath','leisure','sport','auto'];
export const isHourlyVenue=(type?:string)=>HOURLY_CATEGORIES.includes(kindCategory(type));
// A car is brought, not a company: «Авто» counts no guests and is booked for a service of the place (lib/venue-services.ts).
export const isAuto=(type?:string)=>kindCategory(type)==='auto';
// A place where nobody sleeps: its guests come for a few hours.
export const isVenue=(type?:string)=>kindCategory(type)!=='stay';
// The largest party: fifty in a home or a bath, a thousand in a banquet hall.
export const maxGuests=(type?:string)=>isBanquet(type)?1000:50;
// The two slots of a banquet day, Kazakhstan time; the evening ends at midnight.
export const banquetSlots:Record<string,{label:string;from:string;to:string}>=L({lunch:{label:'Днём',from:'12:00',to:'17:00'},evening:{label:'Вечер',from:'18:00',to:'00:00'}});
// What the hall is taken for. A memorial meal is spoken of quietly everywhere: no festive words, no celebration.
// Every kind of event a hall in Kazakhstan is taken for (2026-11-22): the family тои, the holidays, work events and
// the memorial meals. 'toi', 'party' and 'memorial' are the old ids and stay.
export const occasions:Record<string,string>=L({toi:'Свадьба, той',uzatu:'Қыз ұзату',kudalyk:'Құдалық, сватовство',betashar:'Беташар',sundet:'Сүндет той',tusau:'Тұсаукесер',besik:'Бесік той, шілдехана',party:'Юбилей, мерейтой',birthday:'День рождения',corporate:'Корпоратив',graduation:'Выпускной',newyear:'Новый год',kids:'Детский праздник',conference:'Конференция, семинар',memorial:'Поминки: ас, жетісі, қырқы',other:'Другое'});
export const occasionLabel=(id?:string)=>occasions[id||'']||'';
// Kinds that usually clean with their own staff: «Свой персонал» is on by default, the owner can change it.
// A sauna is mostly a complex with an administrator; a «баня» is often a private one, cleaned by our executor.
// Every place of «Досуг», «Спорт», «Авто» works with its own people (2026-11-28): no cleaning is looked for by default.
export const staffedTypes=['hostel','hotel','aparthotel','resort','sauna','banquet','cafe',...categories.leisure.types,...categories.sport.types,...categories.auto.types];
// «Номера одного типа» (lib/room-units.ts): the kinds sold by the room, many rooms alike under one roof.
export const roomKinds=['hotel','hostel','aparthotel','resort'];
// «N одинаковых» (2026-11-28): the same card for many alike also sells fields, courts, tables, cabins, gaming seats and
// car bays. The guest books the card, the service gives the first free one (lib/room-units.ts pickRoom).
export const unitKinds=[...roomKinds,'field','court','billiard','gameclub','karaoke_room','carwash','tires','carservice','detailing'];
type UnitWords={title:string;count:string;free:string;forms:[string,string,string]};
const ROOM_WORDS:UnitWords={title:'Номера',count:'Таких номеров',free:'Свободно номеров: {free} из {total}',forms:['{n} номер','{n} номера','{n} номеров']};
const UNIT_WORDS:Record<string,UnitWords>={
 field:{title:'Поля',count:'Таких полей',free:'Свободно полей: {free} из {total}',forms:['{n} поле','{n} поля','{n} полей']},
 court:{title:'Корты',count:'Таких кортов',free:'Свободно кортов: {free} из {total}',forms:['{n} корт','{n} корта','{n} кортов']},
 billiard:{title:'Столы',count:'Таких столов',free:'Свободно столов: {free} из {total}',forms:['{n} стол','{n} стола','{n} столов']},
 gameclub:{title:'Места',count:'Таких мест',free:'Свободно мест: {free} из {total}',forms:['{n} место','{n} места','{n} мест']},
 karaoke_room:{title:'Кабинки',count:'Таких кабинок',free:'Свободно кабинок: {free} из {total}',forms:['{n} кабинка','{n} кабинки','{n} кабинок']},
};
const BAY_WORDS:UnitWords={title:'Боксы',count:'Таких боксов',free:'Свободно боксов: {free} из {total}',forms:['{n} бокс','{n} бокса','{n} боксов']};
/** The Russian words of the units of a kind: rooms of a hotel, fields, tables, bays. The screen translates them with t(). */
export const unitWords=(type?:string):UnitWords=>UNIT_WORDS[type||'']||(kindCategory(type)==='auto'?BAY_WORDS:ROOM_WORDS);
export const defaultOwnStaff=(type:string)=>staffedTypes.includes(type);
// «home» — частный адрес заказчика уборки на дом (lib/home-cleaning.ts): не сдаётся, в списках типов его нет.
export const kindLabel=(type?:string)=>type==='home'?tr('Мой дом'):propertyTypes[type||'']||tr('Жильё');
export const amenities:Record<string,string>=L({wifi:'Wi-Fi',kitchen:'Кухня',washer:'Стиральная машина',aircon:'Кондиционер',tv:'Телевизор',workspace:'Рабочее место',parking:'Парковка',balcony:'Балкон',elevator:'Лифт',linen:'Постельное бельё',towels:'Полотенца',hairdryer:'Фен',iron:'Утюг',crib:'Детская кроватка',steam:'Парилка',pool:'Бассейн',plunge:'Купель',brooms:'Веники',karaoke:'Караоке',billiards:'Бильярд',grill:'Мангал',stage:'Сцена',sound:'Звук и микрофон',dancefloor:'Танцпол',prayer:'Комната для намаза',halal:'Халяль',ownfood:'Можно свои продукты',kidsroom:'Детская комната',jacuzzi:'Джакузи',
 projector:'Проектор',studiolight:'Студийный свет',lockers:'Раздевалка',shower:'Душ',indoor:'Крытое, тёплое',inventory:'Инвентарь',lighting:'Вечернее освещение',waitroom:'Зона ожидания',coffee:'Кофе',lift:'Подъёмник',warmbox:'Тёплый бокс',bigcars:'Большие машины'});
// The amenities each category shows the owner and the guest; a stored id of the other category stays valid.
export const categoryAmenities:Record<string,string[]>={
 stay:['wifi','kitchen','washer','aircon','tv','workspace','parking','balcony','elevator','linen','towels','hairdryer','iron','crib','jacuzzi'],
 bath:['steam','pool','plunge','jacuzzi','brooms','towels','karaoke','billiards','grill','tv','wifi','parking','kitchen'],
 banquet:['halal','prayer','stage','sound','dancefloor','karaoke','ownfood','kidsroom','aircon','parking','wifi'],
 leisure:['wifi','projector','studiolight','sound','karaoke','tv','aircon','kitchen','ownfood','grill','parking'],
 sport:['indoor','lockers','shower','inventory','lighting','parking','wifi','tv'],
 auto:['warmbox','lift','bigcars','waitroom','coffee','wifi','parking'],
};
export const checkinMethods:Record<string,string>=L({meet:'Встреча с хозяином',lockbox:'Сейф для ключей',smartlock:'Умный замок',reception:'Стойка регистрации'});
export function listingInput(b:Row){
 const details=b.details||{};
 if(!propertyTypes[details.type]||!checkinMethods[details.checkinMethod])throw new DomainError('Выберите тип жилья и способ заселения.');
 if(!Array.isArray(details.amenities)||details.amenities.some((v:unknown)=>typeof v!=='string'||!amenities[v]))throw new DomainError('Выберите удобства из списка.');
 if(!Array.isArray(b.photos)||b.photos.length>8||b.photos.some((v:unknown)=>typeof v!=='string'||v.length>100)||new Set(b.photos).size!==b.photos.length)throw new DomainError('Можно добавить до 8 разных фотографий.');
 if(typeof b.published!=='boolean')throw new DomainError('Выберите видимость объявления.');
 const p={title:required(b.title,'Название',120),city:required(b.city,'Город',80),district:required(b.district,'Район',120),address:required(b.address,'Точный адрес',300),description:required(b.description,'Описание',2500),price:number(b.price,'Цена за сутки',100,10000000),rooms:number(b.rooms,'Комнаты',1,20),capacity:number(b.capacity,'Гости',1,maxGuests(details.type)),cleaningMinutes:number(b.cleaningMinutes,'Время уборки',0,1440),ownStaff:(typeof b.ownStaff==='boolean'?b.ownStaff:defaultOwnStaff(details.type))?1:0};
 const d={type:details.type,area:isVenue(details.type)&&!Number(details.area)?0:number(details.area,'Площадь',5,2000),beds:number(details.beds,'Спальные места',1,maxGuests(details.type)),bathrooms:number(details.bathrooms,'Санузлы',1,20),floor:number(details.floor,'Этаж',0,100),floors:number(details.floors,'Этажей в доме',1,100),checkinMethod:details.checkinMethod,amenities:[...new Set<string>(details.amenities)],pets:details.pets===true,smoking:details.smoking===true,parties:details.parties===true,
  // The menu of a banquet hall, as the owner writes it; other kinds keep none.
  ...(isBanquet(details.type)&&typeof details.menu==='string'&&details.menu.trim()?{menu:details.menu.trim().slice(0,1500)}:{}),
  // «Авто»: the services the place sells, each with its own minutes and price (lib/venue-services.ts).
  ...(isAuto(details.type)&&details.services!==undefined?{services:servicesInput(details.type,details.services)}:{})};
 if(d.floor>d.floors)throw new DomainError('Этаж не может быть выше этажности дома.');
 // A home needs half an hour at least to be cleaned; a place taken by the hour may be ready at once: a car bay is free
 // for the next car, a loft is tidied by its own staff in a quarter of an hour (simulation of 2026-11-28).
 if(!isHourlyVenue(d.type)&&p.cleaningMinutes<30)throw new DomainError('Время уборки: от 30 минут.');
 // A bath has no beds: its guests come for a few hours, so the beds follow the guests there.
 if(isVenue(d.type))d.beds=Math.max(d.beds,p.capacity);
 if(d.beds<p.capacity)throw new DomainError('Спальных мест должно хватать для заявленного числа гостей.');
 if(b.published&&(!b.photos.length||p.description.length<80))throw new DomainError('Для публикации добавьте фото и описание от 80 символов. Черновик можно сохранить сейчас.');
 return {p,details:d,photos:b.photos as string[],published:b.published?1:0,expectedVersion:number(b.expectedVersion??0,'Версия объявления',0,10000000)};
}
export function propertyStatus(p:Row,operation?:Row,busy=false,type=''){
 if(p.published===0)return {code:'draft',label:tr('Черновик'),tone:'muted'};
 // Places other than housing are not moved into: a car wash takes cars, a loft or a bath takes guests for hours.
 const car=isAuto(type),venue=isVenue(type);
 const map:Record<string,string>={ready:car?tr('Готово к приёму машин'):venue?tr('Готово к приходу гостей'):tr('Готово к заселению'),inspection:tr('Требует проверки'),occupied:car?tr('Бокс занят'):venue?tr('Гости на месте'):tr('Проживают гости'),awaiting_cleaning:tr('Ожидает уборки'),cleaning:tr('На уборке'),maintenance:tr('На ремонте'),blocked:tr('Временно недоступно')};
 const code=operation?.active_booking_id?'occupied':operation?.readiness||'inspection';
 return {code,label:map[code]||map.inspection,tone:code==='ready'?'good':['maintenance','blocked'].includes(code)?'danger':'warning',reservedNow:busy};
}
export function cleanerStatus(workStatus:string,jobs:Row[],t:number){
 if(jobs.some(j=>j.status==='in_progress'))return {code:'working',label:tr('На уборке'),tone:'warning'};
 if(jobs.some(j=>j.status==='submitted'))return {code:'review',label:tr('Отчёт на проверке'),tone:'warning'};
 if(jobs.some(j=>j.status==='assigned'&&j.end<=t))return {code:'late_assignment',label:tr('Просрочено начало уборки'),tone:'warning'};
 if(jobs.some(j=>j.status==='assigned'&&j.start<=t&&j.end>t))return {code:'assigned',label:tr('Назначена уборка'),tone:'warning'};
 if(workStatus==='away')return {code:'away',label:tr('Не принимает задания'),tone:'muted'};
 return {code:'available',label:tr('Принимает предложения'),tone:'good',upcoming:jobs.some(j=>j.status==='assigned'&&j.start>t)};
}
// Only bounded JPEGs are persisted. APP metadata (including EXIF/GPS) and comments are discarded.
export function jpegInput(value:unknown,kind:string){
 if(!['property','avatar'].includes(kind)||typeof value!=='string'||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)||value.length>500000)throw new DomainError('Выберите фотографию JPEG, PNG или WebP через форму загрузки.');
 let raw:string;try{raw=atob(value.slice(23));}catch{throw new DomainError('Не удалось прочитать фотографию.');}
 const max=kind==='avatar'?80000:360000,limit=kind==='avatar'?512:1600;
 if(raw.length>max||raw.charCodeAt(0)!==255||raw.charCodeAt(1)!==216)throw new DomainError('Фотография слишком большая или повреждена.');
 const byte=(i:number)=>raw.charCodeAt(i),parts=[raw.slice(0,2)];let pos=2,width=0,height=0,scan=false;
 while(pos<raw.length){
  if(byte(pos)!==255)throw new DomainError('Повреждён JPEG.');
  const marker=byte(pos+1),len=byte(pos+2)*256+byte(pos+3),end=pos+2+len;
  if(!Number.isFinite(len)||len<2||end>raw.length)throw new DomainError('Повреждён JPEG.');
  if([0xc0,0xc1,0xc2].includes(marker)){height=byte(pos+5)*256+byte(pos+6);width=byte(pos+7)*256+byte(pos+8);}
  if(marker===0xda){if(byte(raw.length-2)!==255||byte(raw.length-1)!==217)throw new DomainError('Повреждён JPEG.');parts.push(raw.slice(pos));scan=true;break;}
  if(!(marker>=0xe0&&marker<=0xef)&&marker!==0xfe)parts.push(raw.slice(pos,end));pos=end;
 }
 if(!scan||!width||!height||width>limit||height>limit)throw new DomainError('Изображение не прошло проверку размера. Загрузите его через форму.');
 const clean=parts.join('');return {data:'data:image/jpeg;base64,'+btoa(clean),width,height,bytes:clean.length};
}
