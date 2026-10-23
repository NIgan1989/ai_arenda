import {DomainError,number,required} from './domain';
type Row=Record<string,any>;
export const propertyTypes:Record<string,string>={apartment:'Квартира',studio:'Студия',house:'Дом',aparthotel:'Апартаменты'};
export const amenities:Record<string,string>={wifi:'Wi-Fi',kitchen:'Кухня',washer:'Стиральная машина',aircon:'Кондиционер',tv:'Телевизор',workspace:'Рабочее место',parking:'Парковка',balcony:'Балкон',elevator:'Лифт',linen:'Постельное бельё',towels:'Полотенца',hairdryer:'Фен',iron:'Утюг',crib:'Детская кроватка'};
export const checkinMethods:Record<string,string>={meet:'Встреча с хозяином',lockbox:'Сейф для ключей',smartlock:'Умный замок',reception:'Стойка регистрации'};
export function listingInput(b:Row){
 const details=b.details||{};
 if(!propertyTypes[details.type]||!checkinMethods[details.checkinMethod])throw new DomainError('Выберите тип жилья и способ заселения.');
 if(!Array.isArray(details.amenities)||details.amenities.some((v:unknown)=>typeof v!=='string'||!amenities[v]))throw new DomainError('Выберите удобства из списка.');
 if(!Array.isArray(b.photos)||b.photos.length>8||b.photos.some((v:unknown)=>typeof v!=='string'||v.length>100)||new Set(b.photos).size!==b.photos.length)throw new DomainError('Можно добавить до 8 разных фотографий.');
 if(typeof b.published!=='boolean')throw new DomainError('Выберите видимость объявления.');
 const p={title:required(b.title,'Название',120),city:required(b.city,'Город',80),district:required(b.district,'Район',120),address:required(b.address,'Точный адрес',300),description:required(b.description,'Описание',2500),price:number(b.price,'Цена за сутки',100,10000000),rooms:number(b.rooms,'Комнаты',1,20),capacity:number(b.capacity,'Гости',1,50),cleaningMinutes:number(b.cleaningMinutes,'Время уборки',30,1440)};
 const d={type:details.type,area:number(details.area,'Площадь',5,2000),beds:number(details.beds,'Спальные места',1,50),bathrooms:number(details.bathrooms,'Санузлы',1,20),floor:number(details.floor,'Этаж',0,100),floors:number(details.floors,'Этажей в доме',1,100),checkinMethod:details.checkinMethod,amenities:[...new Set<string>(details.amenities)],pets:details.pets===true,smoking:details.smoking===true,parties:details.parties===true};
 if(d.floor>d.floors)throw new DomainError('Этаж не может быть выше этажности дома.');
 if(d.beds<p.capacity)throw new DomainError('Спальных мест должно хватать для заявленного числа гостей.');
 if(b.published&&(!b.photos.length||p.description.length<80))throw new DomainError('Для публикации добавьте фото и описание от 80 символов. Черновик можно сохранить сейчас.');
 return {p,details:d,photos:b.photos as string[],published:b.published?1:0,expectedVersion:number(b.expectedVersion??0,'Версия объявления',0,10000000)};
}
export function propertyStatus(p:Row,operation?:Row,busy=false){
 if(p.published===0)return {code:'draft',label:'Черновик',tone:'muted'};
 const map:Record<string,string>={ready:'Готова к заселению',inspection:'Требует проверки',occupied:'Проживают гости',awaiting_cleaning:'Ожидает уборки',cleaning:'На уборке',maintenance:'На ремонте',blocked:'Временно недоступна'};
 const code=operation?.active_booking_id?'occupied':operation?.readiness||'inspection';
 return {code,label:map[code]||map.inspection,tone:code==='ready'?'good':['maintenance','blocked'].includes(code)?'danger':'warning',reservedNow:busy};
}
export function cleanerStatus(workStatus:string,jobs:Row[],t:number){
 if(jobs.some(j=>j.status==='in_progress'))return {code:'working',label:'На уборке',tone:'warning'};
 if(jobs.some(j=>j.status==='submitted'))return {code:'review',label:'Отчёт на проверке',tone:'warning'};
 if(jobs.some(j=>j.status==='assigned'&&j.end<=t))return {code:'late_assignment',label:'Просрочено начало уборки',tone:'warning'};
 if(jobs.some(j=>j.status==='assigned'&&j.start<=t&&j.end>t))return {code:'assigned',label:'Назначена уборка',tone:'warning'};
 if(workStatus==='away')return {code:'away',label:'Не принимает задания',tone:'muted'};
 return {code:'available',label:'Принимает предложения',tone:'good',upcoming:jobs.some(j=>j.status==='assigned'&&j.start>t)};
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
