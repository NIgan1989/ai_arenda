import {L,t as tr} from './i18n';
import {kindCategory} from './listings';
type Row=Record<string,any>;

// Classes of a place to stay (2026-11-26), like the tariffs of a taxi: Эконом, Стандарт, Комфорт, Премиум.
// The AI suggests the class when the place is added: the renovation (on the photos when the model may look at them,
// else in the owner's words), the space per guest and the amenities. The owner confirms or changes it, a platform
// administrator may correct it (properties.stay_class, stay_class_by). The guest sees the class on the card and may
// search by it; the price hint compares a place only with places of its own class. The service fee does not depend on it.
// A bath and a banquet hall have no class: the classes are for places to stay only.
export const STAY_CLASSES=['economy','standard','comfort','premium'] as const;
export type StayClass=typeof STAY_CLASSES[number];
export const stayClasses:Record<StayClass,string>=L({economy:'Эконом',standard:'Стандарт',comfort:'Комфорт',premium:'Премиум'});
// One line under each class, for the owner choosing it and the guest reading the filter.
export const stayClassNotes:Record<StayClass,string>=L({economy:'Простое жильё по низкой цене',standard:'Обычный ремонт и всё нужное',comfort:'Свежий ремонт, просторно, много удобств',premium:'Дизайнерский ремонт и лучшие удобства'});
export const isStayClass=(v:unknown):v is StayClass=>typeof v==='string'&&(STAY_CLASSES as readonly string[]).includes(v);
export const classLabel=(v?:string|null)=>isStayClass(v)?stayClasses[v]:'';
export const hasClass=(type?:string)=>kindCategory(type)==='stay';

// What the photos showed, when the model looked at them.
export const RENOVATIONS=['old','ordinary','good','designer'] as const;
export type Renovation=typeof RENOVATIONS[number];
const RENOVATION_WEIGHT:Record<Renovation,number>={old:-1,ordinary:0,good:1,designer:2};
const RENOVATION_SAID:Record<Renovation,string>={old:'старый ремонт',ordinary:'обычный ремонт',good:'свежий ремонт',designer:'дизайнерский ремонт'};

export type ClassFacts={type?:string;area?:number;capacity?:number;rooms?:number;amenities?:string[];text?:string;photos?:Renovation|null};
export type ClassGuess={stayClass:StayClass;reasons:string[];from:'photos'|'rules'};

// Words about the renovation and the level in the owner's story or the description.
const HIGH=/дизайн|премиум|люкс|элитн|панорамн|vip|вип|бизнес[- ]класс|пентхаус/i;
const GOOD=/евро\s*ремонт|евроремонт|нов(?:ый|ым)\s+ремонт|свеж(?:ий|им)\s+ремонт|современн|новостройк|жк\s|жилой комплекс|после ремонта|ремонт\s+202\d/i;
const POOR=/стар(?:ый|ым)\s+ремонт|без ремонта|советск|бабушкин|косметическ|требует ремонта|скромн|простенько|простое жиль/i;
// Amenities that make a stay more comfortable than the usual set.
const COMFORT=['aircon','washer','workspace','parking','elevator','hairdryer','iron','balcony','tv','linen','towels'];

/** The class the rules suggest, with the reasons said plainly. Pure, so the owner's app, the server and the tests agree. */
export function suggestClass(f:ClassFacts):ClassGuess{
 const reasons:string[]=[];let score=0;
 const text=String(f.text||''),amen=f.amenities||[],area=Number(f.area)||0,guests=Math.max(1,Number(f.capacity)||1);
 if(f.photos){score+=RENOVATION_WEIGHT[f.photos];reasons.push(tr('На фото: {v}',{v:tr(RENOVATION_SAID[f.photos])}));}
 else if(HIGH.test(text)){score+=2;reasons.push(tr('В описании: дизайнерский ремонт'));}
 else if(GOOD.test(text)){score+=1;reasons.push(tr('В описании: свежий ремонт'));}
 else if(POOR.test(text)){score-=1;reasons.push(tr('В описании: простой ремонт'));}
 if(area>=5){const each=Math.round(area/guests);
  if(each>=20){score+=1;reasons.push(tr('Просторно: {n} м² на гостя',{n:each}));}
  else if(each<10){score-=1;reasons.push(tr('Тесно: {n} м² на гостя',{n:each}));}}
 const extra=amen.filter(a=>COMFORT.includes(a)).length;
 if(amen.includes('jacuzzi')){score+=1;reasons.push(tr('Есть джакузи'));}
 if(extra>=6){score+=1;reasons.push(tr('Много удобств: {n}',{n:extra}));}
 else if(amen.length<=2){score-=1;reasons.push(tr('Мало удобств'));}
 // A hostel bed or a room in a shared flat is never more than «Стандарт».
 if(f.type==='hostel'||f.type==='room'){score=Math.min(score,0);reasons.push(f.type==='hostel'?tr('Хостел'):tr('Комната, не всё жильё'));}
 const stayClass:StayClass=score<=-1?'economy':score===0?'standard':score<=2?'comfort':'premium';
 return {stayClass,reasons:reasons.slice(0,3),from:f.photos?'photos':'rules'};
}

const parse=(v:unknown)=>{if(v&&typeof v==='object')return v as Row;try{return JSON.parse(String(v||'{}'))||{};}catch{return {};}};
/** The class a listing shows: the one set by the owner, the AI or an administrator, else what the rules estimate from it. */
export function classOfRow(p:Row,detailsValue?:unknown):StayClass|null{
 const d=parse(detailsValue??p.details);
 if(!hasClass(d.type||'apartment'))return null;
 if(isStayClass(p.stay_class))return p.stay_class;
 return suggestClass({type:d.type,area:d.area,capacity:p.capacity,rooms:p.rooms,amenities:Array.isArray(d.amenities)?d.amenities:[],text:p.description}).stayClass;
}
