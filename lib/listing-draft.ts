// The owner describes a flat in one message, the way he would tell a friend; this file turns that
// message into a listing draft without a model call: instant, free and the same on the site and in the app.
// Everything the text does not say gets a safe default and is marked as guessed, so the check screen
// can ask the owner to look at it. Only the address, the district and the daily price are asked for.
import {propertyTypes,amenities,checkinMethods} from './listings';
type Row=Record<string,any>;

export type ListingDraft={
 type:string;rooms:number;capacity:number;beds:number;bathrooms:number;area:number;floor:number;floors:number;
 city:string;district:string;address:string;
 price:number;hourlyPrice:number;minHours:number;nightlyPrice:number;deposit:number;cleaningFee:number;
 amenities:string[];pets:boolean;smoking:boolean;parties:boolean;
 checkinMethod:string;checkinTime:string;checkoutTime:string;cleaningMinutes:number;
 title:string;description:string;houseRules:string;
 // Keys the owner said or set himself; the rest are defaults the AI picked.
 known:string[];
};
export type DraftQuestion={key:'address'|'district'|'price';label:string;question:string;placeholder:string};

export function emptyDraft(city=''):ListingDraft{
 return {type:'apartment',rooms:1,capacity:2,beds:2,bathrooms:1,area:35,floor:1,floors:5,city,district:'',address:'',
  price:0,hourlyPrice:0,minHours:2,nightlyPrice:0,deposit:0,cleaningFee:0,amenities:[],pets:false,smoking:false,parties:false,
  checkinMethod:'meet',checkinTime:'14:00',checkoutTime:'12:00',cleaningMinutes:90,title:'',description:'',houseRules:'',known:city?['city']:[]};
}

const lower=(text:string)=>text.toLocaleLowerCase('ru').replace(/ё/g,'е');
// «14 000», «14000», «14к», «14 тыс», «2,5 тыс».
const NUM='(\\d{1,3}(?:[ \\u00a0]\\d{3})+|\\d+(?:[.,]\\d+)?)\\s*(к|тыс(?:\\.|яч[а-я]*)?)?(?![а-я])';
function amount(raw:string,unit?:string){const value=Number(raw.replace(/[  ]/g,'').replace(',','.'))*(unit?1000:1);return Number.isFinite(value)?Math.round(value):0;}
function priceNear(text:string,period:string){
 const money='\\s*(?:₸|тг|тенге)?\\.?\\s*';
 const after=new RegExp(NUM+money+'(?:в|за|\\/|-|–)?\\s*'+period,'u').exec(text);if(after)return amount(after[1],after[2]);
 const before=new RegExp(period+'[а-я]*\\s*(?:[:—–-]|по|стоит|=)?\\s*'+NUM,'u').exec(text);if(before)return amount(before[1],before[2]);
 return 0;
}
const WORD_ROOMS:Record<string,number>={одно:1,одн:1,двух:2,дву:2,трех:3,тре:3,четырех:4,пяти:5};
const AMENITY_WORDS:[string,RegExp][]=[
 ['wifi',/wi-?fi|вай-?фай|интернет/],['kitchen',/кухн/],['washer',/стирал|стиралк/],['aircon',/кондиц/],['tv',/телевиз|smart ?tv|(?<![а-я])тв(?![а-я])/],
 ['workspace',/рабоч[а-я]* (?:мест|стол)/],['parking',/парков/],['balcony',/балкон|лоджи/],['elevator',/лифт/],['linen',/бель/],['towels',/полотенц/],
 ['hairdryer',/(?<![а-я])фен(?![а-я])/],['iron',/утюг/],['crib',/кроватк|детск[а-я]* кроват/]
];
const STREET='(?:ул(?:ица|\\.)?|пр(?:оспект|-т|-кт|\\.)?|мкр(?:н|\\.)?|микрорайон|бул(?:ьвар|\\.)?|пер(?:еулок|\\.)?|шоссе|ш\\.)';

export function readListingText(text:string,base:ListingDraft):{draft:ListingDraft;found:string[]}{
 const t=lower(text),d:ListingDraft={...base,amenities:[...base.amenities],known:[...base.known]},found:string[]=[];
 const set=<K extends keyof ListingDraft>(key:K,value:ListingDraft[K])=>{(d as Row)[key]=value;if(!found.includes(key))found.push(key);};

 if(/студи/.test(t))set('type','studio');else if(/апарт/.test(t))set('type','aparthotel');else if(/(?<![а-я])(?:дом|коттедж)(?![а-я])/.test(t))set('type','house');
 else if(/квартир|однушк|двушк|трешк|комнатн/.test(t))set('type','apartment');
 const rooms=t.match(/(?<!\d)([1-9])\s*[-–]?\s*(?:х\s*)?(?:комн|к(?:\.|\s|-)?\s*кв|к(?![а-я]))/)?.[1]
  ||(t.match(/(одно|двух|трех|четырех|пяти)комнат/)?.[1])||(t.match(/(одн|дву|тре)у?шк/)?.[1]);
 if(rooms)set('rooms',Number(rooms)||WORD_ROOMS[rooms]||1);else if(d.type==='studio')set('rooms',1);

 const area=t.match(/(\d+(?:[.,]\d+)?)\s*(?:м²|м2|кв\.?\s*м|квадрат|метр)/);if(area){const v=Math.round(Number(area[1].replace(',','.')));if(v>=5&&v<=2000)set('area',v);}
 const floorPair=t.match(/(\d{1,2})\s*\/\s*(\d{1,2})\s*эт/)||t.match(/(\d{1,2})\s*(?:-?(?:й|ий|ой))?\s*этаж[а-я]*\s*(?:из\s*(\d{1,2}))?/);
 if(floorPair){set('floor',Number(floorPair[1]));if(floorPair[2])set('floors',Number(floorPair[2]));}
 const floors=t.match(/(\d{1,2})\s*-?\s*этажн/);if(floors)set('floors',Number(floors[1]));
 if(d.floor>d.floors)d.floors=d.floor;
 const baths=t.match(/(\d)\s*(?:санузл|ванн)/);if(baths)set('bathrooms',Number(baths[1]));

 const guests=t.match(/(?:до|на|для)\s*(\d{1,2})\s*(?:-?х\s*)?(?:гост|человек|чел(?![а-я])|персон)/)||t.match(/(\d{1,2})\s*(?:гост|человек|чел(?![а-я]))/)||t.match(/(?:вместимость|спит|размест[а-я]*)\s*(?:до\s*)?(\d{1,2})/);
 if(guests&&+guests[1]>0&&+guests[1]<=50)set('capacity',Number(guests[1]));
 const beds=t.match(/(\d{1,2})\s*спальн[а-я]*\s*мест/);if(beds&&+beds[1]>0)set('beds',Number(beds[1]));
 if(!found.includes('capacity')&&found.includes('beds'))set('capacity',d.beds);
 if(!found.includes('capacity')&&found.includes('rooms')&&!d.known.includes('capacity'))d.capacity=d.type==='studio'?2:Math.min(50,d.rooms*2);
 if(d.beds<d.capacity)d.beds=d.capacity;

 const daily=priceNear(t,'(?:сут(?:ки|ок)?|день|дня|в день|посуточн)');if(daily>=100)set('price',daily);
 const hourly=priceNear(t,'(?:час(?!т)|почасов)');if(hourly>=100)set('hourlyPrice',hourly);
 const nightly=priceNear(t,'(?:ноч[ьи])');if(nightly>=100)set('nightlyPrice',nightly);
 if(!found.includes('price')){const bare=new RegExp('(?:цена|стоимость|стоит)?\\s*'+NUM+'\\s*(?:₸|тг|тенге)','u').exec(t);if(bare){const v=amount(bare[1],bare[2]);if(v>=100&&v!==d.hourlyPrice&&v!==d.nightlyPrice)set('price',v);}}
 const minHours=t.match(/(?:от|минимум|мин\.?)\s*(\d{1,2})\s*час/);if(minHours&&+minHours[1]>=1&&+minHours[1]<=24)set('minHours',Number(minHours[1]));
 if(/без (?:депозит|залог)/.test(t))set('deposit',0);else{const deposit=new RegExp('(?:депозит|залог)[а-я]*\\s*(?:[:—–-]|в)?\\s*'+NUM,'u').exec(t);if(deposit)set('deposit',amount(deposit[1],deposit[2]));}
 const fee=new RegExp('уборк[а-я]*\\s*(?:[:—–-]|стоит|за)?\\s*'+NUM,'u').exec(t);if(fee){const v=amount(fee[1],fee[2]);if(v>=100)set('cleaningFee',v);}

 // «без лифта», «нет кондиционера» name what the flat lacks, so a negated mention removes the amenity.
 const negated=(at:number)=>/(?:^|[^а-я])(?:без|нет|не)\s+(?:[а-я-]+\s+)?$/.test(t.slice(Math.max(0,at-24),at));
 const mentions=AMENITY_WORDS.map(([id,re])=>{const all=[...t.matchAll(new RegExp(re.source,'g'))];return {id,said:all.length>0,has:all.some(m=>{const at=m.index||0;return !negated(at)&&!/^[а-я-]*\s+(?:нет|не\s|отсутств)/.test(t.slice(at+m[0].length,at+m[0].length+24));})};}).filter(m=>m.said);
 if(mentions.length)set('amenities',[...new Set([...d.amenities.filter(a=>!mentions.some(m=>m.id===a&&!m.has)),...mentions.filter(m=>m.has).map(m=>m.id)])]);
 if(/(?:можно|разрешен[а-я]*|допуска[а-я]*)\s*(?:с\s*)?(?:питом|животн|собак|кош)|(?:питом|животн)[а-я]*\s*(?:можно|разрешен|допуска)|pet.?friendly/.test(t))set('pets',true);
 else if(/без (?:питом|животн)|(?:питом|животн)[а-я]*\s*(?:нельзя|запрещ|не допуска)/.test(t))set('pets',false);
 if(/(?:можно|разрешено)\s*курить|курение\s*разрешено|курить можно/.test(t))set('smoking',true);
 else if(/не курить|без курения|курить нельзя|курение\s*запрещено|не курящ/.test(t))set('smoking',false);
 if(/вечеринк[а-я]*\s*(?:можно|разрешен)|(?:можно|разрешены)\s*вечеринк/.test(t))set('parties',true);else if(/без вечеринок|вечеринк[а-я]*\s*(?:нельзя|запрещ)/.test(t))set('parties',false);
 if(/сейф|ключниц|бокс для ключ/.test(t))set('checkinMethod','lockbox');else if(/(?:умн|кодов|электронн)[а-я]*\s*замок|по коду/.test(t))set('checkinMethod','smartlock');else if(/ресепшн|ресепшен|стойк/.test(t))set('checkinMethod','reception');else if(/встреч|лично/.test(t))set('checkinMethod','meet');
 const hh=(h:string,m?:string)=>{const v=Number(h);return v>=0&&v<=23?String(v).padStart(2,'0')+':'+(m||'00'):'';};
 const checkin=t.match(/заезд[а-я]*\s*(?:с|после|в|от)?\s*(\d{1,2})(?:[:.](\d{2}))?/);if(checkin&&hh(checkin[1],checkin[2]))set('checkinTime',hh(checkin[1],checkin[2]));
 const checkout=t.match(/выезд[а-я]*\s*(?:до|в|к)?\s*(\d{1,2})(?:[:.](\d{2}))?/);if(checkout&&hh(checkout[1],checkout[2]))set('checkoutTime',hh(checkout[1],checkout[2]));

 // The address keeps the owner's own spelling, so it is read from the original text.
 const street=new RegExp('(?:^|[\\s,(])('+STREET+'\\s*[A-ZА-ЯЁa-zа-яё0-9][^,\\n;]*?\\d+[а-яА-Яa-z]?(?:\\s*\\/\\s*\\d+)?)(?:\\s*,?\\s*(?:д\\.?\\s*\\d+[а-я]?\\s*,?\\s*)?(?:кв\\.?|квартира)\\s*(\\d+))?','iu').exec(text)
  ||/(?:^|[\s,])(?:на|по)\s+((?:[А-ЯЁ][а-яё-]+\s){0,2}[А-ЯЁ][а-яё-]+,?\s*(?:д\.?\s*)?\d+[а-яa-z]?(?:\s*\/\s*\d+)?)(?:\s*,?\s*(?:кв\.?|квартира)\s*(\d+))?/u.exec(text);
 if(street){const value=street[1].replace(/\s+/g,' ').replace(/[,\s]+$/,'').trim();set('address',value+(street[2]?', кв. '+street[2]:''));}

 const district=text.match(/(?:район|р-н|мкр\.?|микрорайон)\s+([А-ЯЁA-Zа-яё0-9][А-ЯЁа-яё0-9-]*(?:\s[А-ЯЁ][а-яё-]+)?)/u)||text.match(/([А-ЯЁ][а-яё-]+(?:ий|ый|ой))\s+район/u);
 if(district)set('district',district[1].replace(/^./,c=>c.toLocaleUpperCase('ru')));
 else if(/(?:в|около|возле|у)\s+центр|центр города/.test(t))set('district','Центр');
 else if(found.includes('address')&&/^мкр/i.test(d.address))set('district',d.address.split(',')[0].replace(/^мкр\.?\s*/i,'Мкр ').trim());

 d.known=[...new Set([...d.known,...found])];
 return {draft:d,found};
}

// A money answer: «3000», «3 000 ₸», «2,5 тыс», «3к».
export function moneyAnswer(text:string){const m=new RegExp(NUM,'u').exec(lower(text));return m?amount(m[1],m[2]):0;}

// The owner's answer to one question changes only that field, never what he said before.
export function answerDraft(draft:ListingDraft,key:DraftQuestion['key'],answer:string):ListingDraft{
 const text=answer.trim();if(!text)return draft;
 let value:string|number;
 if(key==='price'){value=moneyAnswer(text);if(!(value>=100))return draft;}
 else{const {draft:read}=readListingText(text,draft);value=read.known.includes(key)&&read[key]!==draft[key]?read[key]:text.slice(0,key==='address'?300:120);}
 return {...draft,[key]:value,known:[...new Set([...draft.known,key])]};
}

export function draftQuestions(d:ListingDraft):DraftQuestion[]{
 const q:DraftQuestion[]=[];
 if(!d.address.trim())q.push({key:'address',label:'Адрес',question:'Какой точный адрес? Гости увидят его только после брони.',placeholder:'Улица, дом, квартира'});
 if(!d.district.trim())q.push({key:'district',label:'Район',question:'В каком районе квартира? Его гости видят на карте.',placeholder:'Например, Центр'});
 if(!(d.price>=100))q.push({key:'price',label:'Цена за сутки',question:'Сколько стоят сутки?',placeholder:'Например, 15 000'});
 return q;
}

const fmt=(n:number)=>new Intl.NumberFormat('ru-RU').format(n)+' ₸';
const plural=(n:number,one:string,few:string,many:string)=>{const a=Math.abs(n)%100,b=a%10;return a>10&&a<20?many:b>1&&b<5?few:b===1?one:many;};
export function draftKind(d:ListingDraft){return d.type==='apartment'?d.rooms+'-комнатная квартира':d.type==='studio'?'Студия':d.type==='house'?(d.rooms>1?'Дом, '+d.rooms+' комн.':'Дом'):(d.rooms>1?d.rooms+'-комнатные апартаменты':'Апартаменты');}
export function draftTitle(d:ListingDraft){return (d.title.trim()||[draftKind(d),d.district.trim()].filter(Boolean).join(' · ')).slice(0,120);}
export function draftDescription(d:ListingDraft){
 if(d.description.trim())return d.description.trim().slice(0,2500);
 const where=[d.city,d.district&&('район '+d.district)].filter(Boolean).join(', ');
 const parts=[draftKind(d)+(where?', '+where:'')+'.'];
 const size=[d.known.includes('area')&&d.area+' м²',d.known.includes('floor')&&(d.floor===0?'цокольный этаж':d.floor+' этаж'+(d.known.includes('floors')?' из '+d.floors:''))].filter(Boolean);
 if(size.length)parts.push(String(size.join(', ')).replace(/^./,c=>c.toUpperCase())+'.');
 parts.push('До '+d.capacity+' '+plural(d.capacity,'гостя','гостей','гостей')+', '+d.beds+' '+plural(d.beds,'спальное место','спальных места','спальных мест')+'.');
 if(d.amenities.length)parts.push('Есть: '+d.amenities.map(a=>amenities[a]).filter(Boolean).map((v,i)=>i&&v!=='Wi-Fi'?v.toLocaleLowerCase('ru'):v).join(', ')+'.');
 if(d.pets)parts.push('Можно с питомцами.');
 parts.push('Заселение с '+d.checkinTime+', выезд до '+d.checkoutTime+'.');
 parts.push('Точный адрес и инструкцию по заселению гость получит после подтверждения брони.');
 return parts.join(' ').slice(0,2500);
}
export function draftRules(d:ListingDraft){
 if(d.houseRules.trim())return d.houseRules.trim().slice(0,2500);
 return ['Тишина с 23:00 до 08:00.',d.smoking?'Курение разрешено.':'Курение в квартире запрещено.',d.parties?'Вечеринки по согласованию.':'Без вечеринок.',d.pets?'Можно с питомцами.':'Без питомцев.',
  d.deposit>0?'Депозит '+fmt(d.deposit)+' возвращается после выезда, если квартира в порядке.':'Депозит не берётся.'].join(' ');
}

// The body POST /api/listings expects (see listingInput), built from the draft.
export function draftListingBody(d:ListingDraft,photos:string[],published:boolean):Row{
 const type=propertyTypes[d.type]?d.type:'apartment',method=checkinMethods[d.checkinMethod]?d.checkinMethod:'meet';
 return {title:draftTitle(d),city:d.city.trim(),district:d.district.trim(),address:d.address.trim(),description:draftDescription(d),price:d.price,rooms:d.rooms,capacity:d.capacity,cleaningMinutes:d.cleaningMinutes,
  photos,published,expectedVersion:0,policyVersion:0,
  details:{type,area:d.area,beds:Math.max(d.beds,d.capacity),bathrooms:d.bathrooms,floor:d.floor,floors:Math.max(d.floors,d.floor,1),checkinMethod:method,amenities:d.amenities.filter(a=>amenities[a]),pets:d.pets,smoking:d.smoking,parties:d.parties},
  rental:{hourlyPrice:d.hourlyPrice,minHours:d.minHours,nightlyPrice:d.nightlyPrice,checkinTime:d.checkinTime,checkoutTime:d.checkoutTime,deposit:d.deposit,houseRules:draftRules(d)}};
}

// A ready-made description the "Пример" chip puts into the line.
export const DRAFT_EXAMPLE='Однушка на Торайгырова 64, кв 12, район Центр. 4 этаж из 9, 42 м², до 3 гостей. Есть Wi-Fi, кухня, стиралка и кондиционер. 15 000 в сутки, 2 500 в час от 2 часов. Без курения, ключи в сейфе.';
