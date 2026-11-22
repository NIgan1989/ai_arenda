// The owner describes a flat in one message, the way he would tell a friend; this file turns that
// message into a listing draft without a model call: instant, free and the same on the site and in the app.
// Everything the text does not say gets a safe default and is marked as guessed, so the check screen
// can ask the owner to look at it. Only the address, the district and the price are asked for: the day for
// housing, the hour for a bath, the guest for a banquet hall.
import {t as tr} from './i18n';
import {isBanquet,isBath,propertyTypes,amenities,categoryAmenities,kindCategory,checkinMethods,defaultOwnStaff} from './listings';
type Row=Record<string,any>;

export type ListingDraft={
 type:string;rooms:number;capacity:number;beds:number;bathrooms:number;area:number;floor:number;floors:number;
 city:string;district:string;address:string;
 price:number;hourlyPrice:number;minHours:number;nightlyPrice:number;deposit:number;cleaningFee:number;
 amenities:string[];pets:boolean;smoking:boolean;parties:boolean;
 checkinMethod:string;checkinTime:string;checkoutTime:string;cleaningMinutes:number;
 // «Свой персонал»: own staff cleans, the AI does not look for executors.
 ownStaff:boolean;
 // A banquet hall: `price` is the price per guest there, and this is the least party it takes.
 leastGuests?:number;
 // A bath, taken by the hour: guests the hourly price covers, the pay per hour for every guest above them,
 // and the minutes the owner needs to get it ready (heat it) before guests.
 includedGuests?:number;extraGuestPrice?:number;prepMinutes?:number;
 title:string;description:string;houseRules:string;
 // Keys the owner said or set himself; the rest are defaults the AI picked.
 known:string[];
};
export type DraftQuestion={key:'address'|'district'|'price';label:string;question:string;placeholder:string};

export function emptyDraft(city=''):ListingDraft{
 return {type:'apartment',rooms:1,capacity:2,beds:2,bathrooms:1,area:35,floor:1,floors:5,city,district:'',address:'',
  price:0,hourlyPrice:0,minHours:2,nightlyPrice:0,deposit:0,cleaningFee:0,amenities:[],pets:false,smoking:false,parties:false,
  checkinMethod:'meet',checkinTime:'14:00',checkoutTime:'12:00',cleaningMinutes:90,ownStaff:false,title:'',description:'',houseRules:'',known:city?['city']:[]};
}

const lower=(text:string)=>text.toLocaleLowerCase('ru').replace(/ё/g,'е');
// «14 000», «14000», «14к», «14 тыс», «2,5 тыс».
const NUM='(\\d{1,3}(?:[ \\u00a0]\\d{3})+|\\d+(?:[.,]\\d+)?)\\s*(к|тыс(?:\\.|яч[а-я]*)?)?(?![а-я])';
function amount(raw:string,unit?:string){const value=Number(raw.replace(/[  ]/g,'').replace(',','.'))*(unit?1000:1);return Number.isFinite(value)?Math.round(value):0;}
function priceNear(text:string,period:string){
 const money='\\s*(?:₸|тг|тенге)?\\.?\\s*';
 // «от 2 часов, 5 000 в час»: a small number next to the word is hours, not money, so the first real sum wins.
 for(const m of text.matchAll(new RegExp(NUM+money+'(?:в|за|\\/|-|–)?\\s*'+period,'gu'))){const v=amount(m[1],m[2]);if(v>=100)return v;}
 for(const m of text.matchAll(new RegExp(period+'[а-я]*\\s*(?:[:—–-]|по|стоит|=)?\\s*'+NUM,'gu'))){const v=amount(m[1],m[2]);if(v>=100)return v;}
 return 0;
}
const WORD_ROOMS:Record<string,number>={одно:1,одн:1,двух:2,дву:2,трех:3,тре:3,четырех:4,пяти:5};
const AMENITY_WORDS:[string,RegExp][]=[
 ['wifi',/wi-?fi|вай-?фай|интернет/],['kitchen',/кухн/],['washer',/стирал|стиралк/],['aircon',/кондиц/],['tv',/телевиз|smart ?tv|(?<![а-я])тв(?![а-я])/],
 ['workspace',/рабоч[а-я]* (?:мест|стол)/],['parking',/парков/],['balcony',/балкон|лоджи/],['elevator',/лифт/],['linen',/бель/],['towels',/полотенц/],
 ['hairdryer',/(?<![а-я])фен(?![а-я])/],['iron',/утюг/],['crib',/кроватк|детск[а-я]* кроват/],
 // A bath and a hall have their own lists (lib/listings.ts categoryAmenities).
 ['steam',/парилк|парн(?:ая|ую|ой)(?![а-я])/],['pool',/бассейн/],['plunge',/купел/],['jacuzzi',/джакузи|гидромассаж/],['brooms',/веник/],['karaoke',/караоке/],['billiards',/бильярд/],['grill',/мангал|барбекю/],
 ['stage',/(?<![а-я])сцен[аыу](?![а-я])/],['sound',/микрофон|аппаратур|звук/],['dancefloor',/танцпол/],['prayer',/намаз/],['halal',/халял/],['ownfood',/сво[ияю] (?:продукт|еду|еда)/],['kidsroom',/детск[а-я]* комнат/]
];
const STREET='(?:ул(?:ица|\\.)?|пр(?:оспект|-т|-кт|\\.)?|мкр(?:н|\\.)?|микрорайон|бул(?:ьвар|\\.)?|пер(?:еулок|\\.)?|шоссе|ш\\.)';

export function readListingText(text:string,base:ListingDraft):{draft:ListingDraft;found:string[]}{
 const t=lower(text),d:ListingDraft={...base,amenities:[...base.amenities],known:[...base.known]},found:string[]=[];
 const set=<K extends keyof ListingDraft>(key:K,value:ListingDraft[K])=>{(d as Row)[key]=value;if(!found.includes(key))found.push(key);};

  // «дом с баней», «коттедж с сауной» is housing with a bath in it, not a bath.
 const withBath=/(?<![а-я])с\s+(?:сауной|баней|банькой)/.test(t);
 if(/банкет|тойхан|зал[а-я]* (?:торжеств|для торжеств)|ресторан/.test(t))set('type','banquet');else if(/(?<![а-я])кафе(?![а-я])/.test(t))set('type','cafe');else if(!withBath&&/саун/.test(t))set('type','sauna');else if(!withBath&&/(?<![а-я])бан(?:я|ю|е|и|ька|ьку)(?![а-я])/.test(t))set('type','banya');else if(/хостел/.test(t))set('type','hostel');else if(/апарт-?отел|апарт-?гостиниц/.test(t))set('type','aparthotel');else if(/гостиниц|(?<![а-я])(?:мини-?)?отел/.test(t))set('type','hotel');
 else if(/гостев[а-я]* дом/.test(t))set('type','guesthouse');else if(/студи/.test(t))set('type','studio');else if(/апарт/.test(t))set('type','aparthotel');else if(/баз[а-я]* отдых|дом[а-я]* отдых|курорт|пансионат/.test(t))set('type','resort');else if(/(?<![а-я])(?:дом|коттедж)(?![а-я])/.test(t))set('type','house');
 else if(/(?<![а-я])комнат[ау](?![а-я])/.test(t)&&!/квартир|комнатн/.test(t))set('type','room');
 else if(/квартир|однушк|двушк|трешк|комнатн/.test(t))set('type','apartment');
 // Hotels and hostels clean with their own staff; the owner can also just say so.
 if(/сво[йиея][а-я]* (?:персонал|горничн|уборщ|клининг|сотрудник)|горничн/.test(t))set('ownStaff',true);else if(found.includes('type'))d.ownStaff=defaultOwnStaff(d.type);
 const rooms=t.match(/(?<!\d)([1-9])\s*[-–]?\s*(?:х\s*)?(?:комн|к(?:\.|\s|-)?\s*кв|к(?![а-я]))/)?.[1]
  ||(t.match(/(одно|двух|трех|четырех|пяти)комнат/)?.[1])||(t.match(/(одн|дву|тре)у?шк/)?.[1]);
 if(rooms)set('rooms',Number(rooms)||WORD_ROOMS[rooms]||1);else if(d.type==='studio')set('rooms',1);

 const area=t.match(/(\d+(?:[.,]\d+)?)\s*(?:м²|м2|кв\.?\s*м|квадрат|метр)/);if(area){const v=Math.round(Number(area[1].replace(',','.')));if(v>=5&&v<=2000)set('area',v);}
 const floorPair=t.match(/(\d{1,2})\s*\/\s*(\d{1,2})\s*эт/)||t.match(/(\d{1,2})\s*(?:-?(?:й|ий|ой))?\s*этаж[а-я]*\s*(?:из\s*(\d{1,2}))?/);
 if(floorPair){set('floor',Number(floorPair[1]));if(floorPair[2])set('floors',Number(floorPair[2]));}
 const floors=t.match(/(\d{1,2})\s*-?\s*этажн/);if(floors)set('floors',Number(floors[1]));
 if(d.floor>d.floors)d.floors=d.floor;
 const baths=t.match(/(\d)\s*(?:санузл|ванн)/);if(baths)set('bathrooms',Number(baths[1]));

 // A banquet hall: «до 200 гостей», «от 50 человек», «8 000 с человека».
 const hall=isBanquet(d.type);
 if(hall){
  const most=t.match(/(?:до|на|вмеща[а-я]*|вместимость)\s*(\d{1,4})\s*(?:гост|человек|чел(?![а-я])|персон|мест)/);if(most&&+most[1]>0&&+most[1]<=1000)set('capacity',Number(most[1]));
  const least=t.match(/(?:от|минимум|мин\.?)\s*(\d{1,4})\s*(?:гост|человек|чел(?![а-я])|персон)/);if(least&&+least[1]>0&&+least[1]<=1000)set('leastGuests',Number(least[1]));
  if(!found.includes('capacity')&&!d.known.includes('capacity'))d.capacity=Math.max(d.leastGuests||0,100);
  const person='(?:одного\\s+|каждого\\s+)?(?:гост|человек|чел(?![а-я])|персон)';
  const each=new RegExp(NUM+'\\s*(?:₸|тг|тенге)?\\.?\\s*(?:с|за|на|\\/)\\s*'+person,'u').exec(t)||new RegExp('(?:с|за|на)\\s+'+person+'[а-я]*\\s*(?:[:—–-]|по)?\\s*'+NUM+'\\s*(?:₸|тг|тенге)','u').exec(t);
  if(each&&amount(each[1],each[2])>=100)set('price',amount(each[1],each[2]));
  if(!d.known.includes('cleaningMinutes'))d.cleaningMinutes=60;
 }
 // A bath or a sauna: guests the hourly price covers, the pay for every guest above them, the time to heat it
 // and its own name. What is read here is taken out of the text, so «6 человек в цене» is not the capacity
 // and «топить 2 часа» is not a price.
 const bath=isBath(d.type);let rest=t;
 if(bath){
  const who='(?:гост[а-я]*|человек[а-я]*|чел\\.?|персон[а-я]*)';
  const inc=new RegExp('в (?:цену|стоимость)\\s*(?:входит|входят|включен[оы]?)\\s*(?:до\\s*)?(\\d{1,2})(?:\\s*'+who+')?(?!\\s*(?:час|\\d))','u').exec(t)||new RegExp('(?:до\\s*)?(\\d{1,2})\\s*'+who+'\\s*(?:входит |входят |включен[оы] )?в (?:цену|цене|стоимость)','u').exec(t);
  if(inc&&+inc[1]>0){set('includedGuests',Number(inc[1]));rest=rest.replace(inc[0],' ');}
  const extra=new RegExp('(?:доплат[а-я]*|сверх[а-я]*|кажд[а-я]+ (?:следующ[а-я]+|дополнительн[а-я]+|лишн[а-я]+)(?:\\s+'+who+')?|дополнительн[а-я]+ '+who+')[^\\d]{0,24}'+NUM+'(?:\\s*(?:₸|тг|тенге))?(?:\\s*(?:за|с)\\s*'+who+')?(?:\\s*(?:в|за)\\s*час)?','u').exec(rest);
  if(extra&&amount(extra[1],extra[2])>=100){set('extraGuestPrice',amount(extra[1],extra[2]));rest=rest.replace(extra[0],' ');}
  const prep=/(?:топи[а-я]*|затопи[а-я]*|протопи[а-я]*|растопи[а-я]*|подготов[а-я]*|готови[а-я]*|нагрев[а-я]*)\s*(?:баню\s*|сауну\s*|парную\s*)?(?:нужно\s*|надо\s*|занимает\s*|[:—–-]\s*)?(?:за\s*)?(?:(\d+(?:[.,]\d+)?)\s*(час|ч(?![а-я])|мин)[а-я]*|(полчаса|полтора часа|час(?![а-я])))/.exec(rest);
  if(prep){const v=prep[3]?({полчаса:30,час:60}[prep[3]]||90):Number(prep[1].replace(',','.'))*(prep[2]==='мин'?1:60);if(v>0&&v<=720){set('prepMinutes',Math.max(30,Math.round(v/30)*30));rest=rest.replace(prep[0],' ');}}
  if(!d.known.includes('parties'))d.parties=true;
 }
 // «баня „Берёзка“», «зал «Сарыарка»»: a place guests know by its name keeps it in the title.
 if(bath||hall){const name=/[«"„“]([^«»"„“”\n]{2,40})[»"“”]/u.exec(text);if(name&&!d.known.includes('title'))set('title',(draftKind(d)+' «'+name[1].trim()+'»').slice(0,120));}
 const guests=hall?null:rest.match(/(?:до|на|для)\s*(\d{1,2})\s*(?:-?х\s*)?(?:гост|человек|чел(?![а-я])|персон)/)||rest.match(/(\d{1,2})\s*(?:гост|человек|чел(?![а-я]))/)||rest.match(/(?:вместимость|спит|размест[а-я]*)\s*(?:до\s*)?(\d{1,2})/);
 if(guests&&+guests[1]>0&&+guests[1]<=50)set('capacity',Number(guests[1]));
 const beds=t.match(/(\d{1,2})\s*спальн[а-я]*\s*мест/);if(beds&&+beds[1]>0)set('beds',Number(beds[1]));
 if(!found.includes('capacity')&&found.includes('beds'))set('capacity',d.beds);
 if(!found.includes('capacity')&&found.includes('rooms')&&!d.known.includes('capacity'))d.capacity=d.type==='studio'?2:Math.min(50,d.rooms*2);
 if(bath&&!found.includes('capacity')&&!d.known.includes('capacity'))d.capacity=Math.max(d.includedGuests||0,6);
 if(d.beds<d.capacity)d.beds=d.capacity;

 const daily=hall?0:priceNear(t,'(?:сут(?:ки|ок)?|день|дня|в день|посуточн)');if(daily>=100)set('price',daily);
 const hourly=priceNear(rest,'(?:час(?!т)|почасов)');if(hourly>=100)set('hourlyPrice',hourly);
 const nightly=priceNear(t,'(?:ноч[ьи])');if(nightly>=100)set('nightlyPrice',nightly);
 if(!found.includes('price')&&!hall&&!(bath&&found.includes('hourlyPrice'))){const bare=new RegExp('(?:цена|стоимость|стоит)?\\s*'+NUM+'\\s*(?:₸|тг|тенге)','u').exec(rest);if(bare){const v=amount(bare[1],bare[2]);if(v>=100&&v!==d.hourlyPrice&&v!==d.nightlyPrice)set(bath?'hourlyPrice':'price',v);}}
 const minHours=t.match(/(?:от|минимум|мин\.?)\s*(\d{1,2})\s*час/);if(minHours&&+minHours[1]>=1&&+minHours[1]<=24)set('minHours',Number(minHours[1]));
 if(/без (?:депозит|залог)/.test(t))set('deposit',0);else{const deposit=new RegExp('(?:депозит|залог)[а-я]*\\s*(?:[:—–-]|в)?\\s*'+NUM,'u').exec(t);if(deposit)set('deposit',amount(deposit[1],deposit[2]));}
 const fee=new RegExp('уборк[а-я]*\\s*(?:[:—–-]|стоит|за)?\\s*'+NUM,'u').exec(t);if(fee){const v=amount(fee[1],fee[2]);if(v>=100)set('cleaningFee',v);}
 // «Однушка, Торайгырова 64, 12000»: a part of the message that is a bare sum is the price (a bath's is for an hour).
 if(!hall&&!found.includes('price')&&!found.includes('hourlyPrice')){const sums=t.split(/[,;\n]/).map(x=>x.trim()).filter(x=>new RegExp('^'+NUM+'\\s*(?:₸|тг|тенге)?$','u').test(x));if(sums.length===1){const m=new RegExp(NUM,'u').exec(sums[0])!;const v=amount(m[1],m[2]);if(v>=1000&&v!==d.cleaningFee)set(bath?'hourlyPrice':'price',v);}}

 // «без лифта», «нет кондиционера» name what the flat lacks, so a negated mention removes the amenity.
 const negated=(at:number)=>/(?:^|[^а-я])(?:без|нет|не)\s+(?:[а-я-]+\s+)?$/.test(t.slice(Math.max(0,at-24),at));
 const mentions=AMENITY_WORDS.map(([id,re])=>{const all=[...t.matchAll(new RegExp(re.source,'g'))];return {id,said:all.length>0,has:all.some(m=>{const at=m.index||0;return !negated(at)&&!/^[а-я-]*\s+(?:нет|не\s|отсутств)/.test(t.slice(at+m[0].length,at+m[0].length+24));})};}).filter(m=>m.said);
 // Only what this kind of place can have: a flat keeps no «парилка», a bath no «лифт».
 const fits=(a:string)=>categoryAmenities[kindCategory(d.type)].includes(a);
 if(mentions.length)set('amenities',[...new Set([...d.amenities.filter(a=>!mentions.some(m=>m.id===a&&!m.has)),...mentions.filter(m=>m.has).map(m=>m.id)])].filter(fits));
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
 // «…, Торайгырова 64, …»: a part that is a name and a house number is the address, though no «ул.» or «на» comes before it.
 else{const city=lower(d.city.trim()),parts=text.split(/[,;\n]/).map(x=>x.trim()),at=parts.findIndex(x=>/^[А-ЯЁ][а-яё-]+(?:\s[А-ЯЁ][а-яё-]+)?\s+\d{1,4}[а-яa-z]?(?:\s*\/\s*\d+)?$/u.test(x)&&!/^(?:этаж|комнат|гост|цен|уборк|депозит|площад|кв|дом|квартир|вместим|санузл|спал|спальн|кроват|мест|человек|персон|душ|туалет|ванн|зал|парилк|бассейн|час|мин|сут|ноч|макс|до\s|от\s|размер|высот|возраст)/i.test(x)&&lower(x.split(/\s/)[0])!==city);
  // The flat number said right after it stays with it: «Ленина 5, кв 3».
  if(at>=0)set('address',(parts[at]+(/^(?:кв\.?|квартира)\s*\d+$/i.test(parts[at+1]||'')?', '+parts[at+1]:'')).replace(/\s+/g,' '));}

 const district=text.match(/(?:район|р-н|мкр\.?|микрорайон)\s+([А-ЯЁA-Zа-яё0-9][А-ЯЁа-яё0-9-]*(?:\s[А-ЯЁ][а-яё-]+)?)/u)||text.match(/([А-ЯЁ][а-яё-]+(?:ий|ый|ой))\s+район/u);
 if(district)set('district',district[1].replace(/^./,c=>c.toLocaleUpperCase('ru')));
 else if(/(?:в|около|возле|у)\s+центр|центр города/.test(t))set('district','Центр');
 // «В Усольском», «в Центральном»: the district said without the word «район».
 else if(/(?:^|[\s,])в\s+[А-ЯЁ][а-яё]+(?:[сц]ком|ном)(?=$|[\s,.;])/u.test(text)){const m=/(?:^|[\s,])в\s+([А-ЯЁ][а-яё]+?)([сц]ком|ном)(?=$|[\s,.;])/u.exec(text)!;set('district',m[1]+(m[2]==='ном'?'ный':m[2][0]+'кий'));}
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
 if(key==='price'){value=moneyAnswer(text);if(!(value>=100))return draft;
  // A bath is priced by the hour, so the answer to «Сколько стоит час?» is its hourly price.
  if(isBath(draft.type))return {...draft,hourlyPrice:value,known:[...new Set([...draft.known,'hourlyPrice'])]};}
 else{const {draft:read}=readListingText(text,draft);value=read.known.includes(key)&&read[key]!==draft[key]?read[key]:text.slice(0,key==='address'?300:120);}
 return {...draft,[key]:value,known:[...new Set([...draft.known,key])]};
}

export function draftQuestions(d:ListingDraft):DraftQuestion[]{
 const q:DraftQuestion[]=[];
 if(!d.address.trim())q.push({key:'address',label:tr('Адрес'),question:tr('Какой точный адрес? Гости увидят его только после брони.'),placeholder:tr('Улица, дом, номер')});
 if(!d.district.trim())q.push({key:'district',label:tr('Район'),question:isBanquet(d.type)?tr('В каком районе зал? Его гости видят на карте.'):isBath(d.type)?(d.type==='sauna'?tr('В каком районе сауна? Его гости видят на карте.'):tr('В каком районе баня? Его гости видят на карте.')):tr('В каком районе жильё? Его гости видят на карте.'),placeholder:tr('Например, Центр')});
 if(isBath(d.type)){if(!(d.hourlyPrice>=100))q.push({key:'price',label:tr('Цена за час'),question:tr('Сколько стоит час?'),placeholder:tr('Например, 5 000')});}
 else if(!(d.price>=100))q.push(isBanquet(d.type)?{key:'price',label:tr('Цена на гостя'),question:tr('Сколько стоит банкет на одного гостя?'),placeholder:tr('Например, 8 000')}:{key:'price',label:tr('Цена за сутки'),question:tr('Сколько стоят сутки?'),placeholder:tr('Например, 15 000')});
 return q;
}

const fmt=(n:number)=>new Intl.NumberFormat('ru-RU').format(n)+' ₸';
const plural=(n:number,one:string,few:string,many:string)=>{const a=Math.abs(n)%100,b=a%10;return a>10&&a<20?many:b>1&&b<5?few:b===1?one:many;};
export function draftKind(d:ListingDraft){
 switch(d.type){
  case 'apartment':return d.rooms+'-комнатная квартира';
  case 'studio':return 'Студия';
  case 'room':return 'Комната';
  case 'house':return d.rooms>1?'Дом, '+d.rooms+' комн.':'Дом';
  case 'guesthouse':return 'Гостевой дом';
  case 'hostel':return 'Хостел';
  case 'banquet':return 'Банкетный зал';
  case 'cafe':return 'Кафе';
  case 'banya':return 'Баня';
  case 'sauna':return 'Сауна';
  case 'hotel':return 'Гостиница';
  default:return d.rooms>1?'Апарт-отель, '+d.rooms+' комн.':'Апарт-отель';
 }
}
export function draftTitle(d:ListingDraft){return (d.title.trim()||[draftKind(d),d.district.trim()].filter(Boolean).join(' · ')).slice(0,120);}
export function draftDescription(d:ListingDraft){
 if(d.description.trim())return d.description.trim().slice(0,2500);
 const where=[d.city,d.district&&('район '+d.district)].filter(Boolean).join(', ');
 const parts=[draftKind(d)+(where?', '+where:'')+'.'];
 const size=[d.known.includes('area')&&d.area+' м²',d.known.includes('floor')&&(d.floor===0?'цокольный этаж':d.floor+' этаж'+(d.known.includes('floors')?' из '+d.floors:''))].filter(Boolean);
 if(size.length)parts.push(String(size.join(', ')).replace(/^./,c=>c.toUpperCase())+'.');
 if(isBanquet(d.type)){
  parts.push('Зал целиком до '+d.capacity+' '+plural(d.capacity,'гостя','гостей','гостей')+': той, свадьба, юбилей, поминальный обед.');
  if(d.amenities.length)parts.push('Есть: '+d.amenities.map(a=>amenities[a]).filter(Boolean).map((v,i)=>i&&v!=='Wi-Fi'?v.toLocaleLowerCase('ru'):v).join(', ')+'.');
  parts.push('Обед с 12:00 до 17:00, вечер с 18:00 до полуночи. Цена считается на гостя, меню обсуждается после брони.');
  parts.push('Точный адрес гость получит после подтверждения брони.');
  return parts.join(' ').slice(0,2500);
 }
 if(isBath(d.type)){
  parts.push('Целиком для вашей компании, до '+d.capacity+' '+plural(d.capacity,'гостя','гостей','гостей')+'.');
  if(d.amenities.length)parts.push('Есть: '+d.amenities.map(a=>amenities[a]).filter(Boolean).map((v,i)=>i&&v!=='Wi-Fi'?v.toLocaleLowerCase('ru'):v).join(', ')+'.');
  parts.push('Бронь по часам, от '+d.minHours+' '+plural(d.minHours,'часа','часов','часов')+'.');
  if(d.includedGuests&&d.extraGuestPrice)parts.push('В цену входит '+d.includedGuests+' '+plural(d.includedGuests,'гость','гостя','гостей')+', каждый следующий: '+fmt(d.extraGuestPrice)+' в час.');
  parts.push('Точный адрес гость получит после подтверждения брони.');
  return parts.join(' ').slice(0,2500);
 }
 parts.push('До '+d.capacity+' '+plural(d.capacity,'гостя','гостей','гостей')+', '+d.beds+' '+plural(d.beds,'спальное место','спальных места','спальных мест')+'.');
 if(d.amenities.length)parts.push('Есть: '+d.amenities.map(a=>amenities[a]).filter(Boolean).map((v,i)=>i&&v!=='Wi-Fi'?v.toLocaleLowerCase('ru'):v).join(', ')+'.');
 if(d.pets)parts.push('Можно с питомцами.');
 parts.push('Заселение с '+d.checkinTime+', выезд до '+d.checkoutTime+'.');
 parts.push('Точный адрес и инструкцию по заселению гость получит после подтверждения брони.');
 return parts.join(' ').slice(0,2500);
}
export function draftRules(d:ListingDraft){
 if(d.houseRules.trim())return d.houseRules.trim().slice(0,2500);
 if(isBanquet(d.type))return ['Число гостей уточняется не позже чем за три дня.','Свои продукты и напитки по согласованию.',d.smoking?'Курение разрешено.':'Курение в зале запрещено.',d.deposit>0?'Депозит '+fmt(d.deposit)+' возвращается после мероприятия, если всё в порядке.':'Депозит не берётся.'].join(' ');
 if(isBath(d.type))return ['Приходите ко времени брони и освобождайте вовремя: после вас ждут другие гости.','Свои продукты и напитки можно.',d.smoking?'Курение разрешено.':'Курение в помещении запрещено.',d.deposit>0?'Депозит '+fmt(d.deposit)+' возвращается после ухода гостей, если всё в порядке.':'Депозит не берётся.'].join(' ');
 return ['Тишина с 23:00 до 08:00.',d.smoking?'Курение разрешено.':'Курение в помещении запрещено.',d.parties?'Вечеринки по согласованию.':'Без вечеринок.',d.pets?'Можно с питомцами.':'Без питомцев.',
  d.deposit>0?'Депозит '+fmt(d.deposit)+' возвращается после выезда, если всё в порядке.':'Депозит не берётся.'].join(' ');
}

// The body POST /api/listings expects (see listingInput), built from the draft.
export function draftListingBody(d:ListingDraft,photos:string[],published:boolean):Row{
 const type=propertyTypes[d.type]?d.type:'apartment',method=checkinMethods[d.checkinMethod]?d.checkinMethod:'meet';
 // A banquet hall: the price of the slot is the least party at the price per guest (lib/listing-edit.ts banquetPrice).
 const hall=isBanquet(type),least=hall?Math.max(1,Math.min(d.capacity,d.leastGuests||Math.min(d.capacity,30))):0;
 if(hall)return {title:draftTitle(d),city:d.city.trim(),district:d.district.trim(),address:d.address.trim(),description:draftDescription(d),price:Math.max(100,d.price*least),rooms:d.rooms,capacity:d.capacity,cleaningMinutes:d.cleaningMinutes,ownStaff:!!d.ownStaff,
  photos,published,expectedVersion:0,policyVersion:0,
  details:{type,area:d.area,beds:d.capacity,bathrooms:d.bathrooms,floor:d.floor,floors:Math.max(d.floors,d.floor,1),checkinMethod:method,amenities:d.amenities.filter(a=>amenities[a]),pets:false,smoking:d.smoking,parties:true},
  rental:{hourlyPrice:0,minHours:d.minHours,nightlyPrice:0,checkinTime:'12:00',checkoutTime:'00:00',deposit:d.deposit,houseRules:draftRules(d),includedGuests:least,extraGuestPrice:d.price}};
 // A bath is taken by the hour. The day price the service needs is twelve hours, as in the editor (PropertyEdit).
 if(isBath(type))return {title:draftTitle(d),city:d.city.trim(),district:d.district.trim(),address:d.address.trim(),description:draftDescription(d),price:d.price>=100?d.price:Math.max(100,d.hourlyPrice*12),rooms:d.rooms,capacity:d.capacity,cleaningMinutes:d.cleaningMinutes,ownStaff:!!d.ownStaff,
  photos,published,expectedVersion:0,policyVersion:0,
  details:{type,area:d.area,beds:d.capacity,bathrooms:d.bathrooms,floor:d.floor,floors:Math.max(d.floors,d.floor,1),checkinMethod:method,amenities:d.amenities.filter(a=>amenities[a]&&categoryAmenities.bath.includes(a)),pets:false,smoking:d.smoking,parties:true},
  rental:{hourlyPrice:d.hourlyPrice,minHours:Math.max(1,d.minHours),nightlyPrice:0,checkinTime:d.checkinTime,checkoutTime:d.checkoutTime,deposit:d.deposit,houseRules:draftRules(d),includedGuests:d.extraGuestPrice?Math.min(d.capacity,d.includedGuests||0):0,extraGuestPrice:d.includedGuests?d.extraGuestPrice||0:0,prepMinutes:d.prepMinutes||0}};
 return {title:draftTitle(d),city:d.city.trim(),district:d.district.trim(),address:d.address.trim(),description:draftDescription(d),price:d.price,rooms:d.rooms,capacity:d.capacity,cleaningMinutes:d.cleaningMinutes,ownStaff:!!d.ownStaff,
  photos,published,expectedVersion:0,policyVersion:0,
  details:{type,area:d.area,beds:Math.max(d.beds,d.capacity),bathrooms:d.bathrooms,floor:d.floor,floors:Math.max(d.floors,d.floor,1),checkinMethod:method,amenities:d.amenities.filter(a=>amenities[a]),pets:d.pets,smoking:d.smoking,parties:d.parties},
  rental:{hourlyPrice:d.hourlyPrice,minHours:d.minHours,nightlyPrice:d.nightlyPrice,checkinTime:d.checkinTime,checkoutTime:d.checkoutTime,deposit:d.deposit,houseRules:draftRules(d)}};
}

// A ready-made description the "Пример" chip puts into the line.
export const DRAFT_EXAMPLE='Однушка на Торайгырова 64, кв 12, район Центр. 4 этаж из 9, 42 м², до 3 гостей. Есть Wi-Fi, кухня, стиралка и кондиционер. 15 000 в сутки, 2 500 в час от 2 часов. Без курения, ключи в сейфе.';
export const DRAFT_EXAMPLE_BATH='Баня «Берёзка» на Лесной 5, район Дачный. До 10 гостей, в цену входит 6, доплата 1 000 за гостя в час. 5 000 в час от 2 часов. Парилка, бассейн, веники, мангал. Топить за 1,5 часа.';

// «ИИ заполняет поля»: what the model read from the owner's message (lib/listing-understand.ts). The model only fills
// the gaps the rules left: what the rules read from the text stays, and every value the model gives is checked here,
// so a wrong type, an amenity we do not have or an absurd number is simply dropped.
export const MODEL_LISTING_KEYS=['type','rooms','capacity','beds','bathrooms','area','floor','floors','city','district','address','price','hourlyPrice','minHours','nightlyPrice','deposit','cleaningFee','leastGuests','includedGuests','extraGuestPrice','prepMinutes','amenities','pets','smoking','parties','checkinMethod','checkinTime','checkoutTime','ownStaff','name'] as const;
const LIMITS:Record<string,[number,number]>={rooms:[1,20],capacity:[1,1000],beds:[1,200],bathrooms:[1,20],area:[5,5000],floor:[0,100],floors:[1,100],price:[100,10000000],hourlyPrice:[100,10000000],minHours:[1,24],nightlyPrice:[100,10000000],deposit:[0,10000000],cleaningFee:[100,1000000],leastGuests:[1,1000],includedGuests:[1,50],extraGuestPrice:[100,1000000],prepMinutes:[30,720]};
export function cleanModelListing(raw:unknown):Partial<ListingDraft>&{name?:string}{
 const out:Row={};if(!raw||typeof raw!=='object')return out;const r=raw as Row;
 if(typeof r.type==='string'&&propertyTypes[r.type])out.type=r.type;
 for(const [key,[lo,hi]] of Object.entries(LIMITS)){const v=r[key];if(typeof v==='number'&&Number.isFinite(v)&&v>=lo&&v<=hi)out[key]=Math.round(v);}
 if(out.prepMinutes)out.prepMinutes=Math.max(30,Math.round(out.prepMinutes/30)*30);
 const text=(v:unknown,max:number)=>typeof v==='string'?v.replace(/\s+/g,' ').trim().slice(0,max):'';
 for(const [key,max] of [['city',80],['district',120],['address',300],['name',40]] as const){const v=text(r[key],max);if(v)out[key]=v;}
 if(out.district)out.district=out.district.replace(/^(?:район|р-н)\s+|\s+(?:район|р-н)$/i,'').replace(/^./,(c:string)=>c.toLocaleUpperCase('ru'));
 if(Array.isArray(r.amenities)){const ids=[...new Set(r.amenities.filter((a:unknown)=>typeof a==='string'&&amenities[a as string]))];if(ids.length)out.amenities=ids;}
 for(const key of ['pets','smoking','parties','ownStaff'])if(typeof r[key]==='boolean')out[key]=r[key];
 if(typeof r.checkinMethod==='string'&&checkinMethods[r.checkinMethod])out.checkinMethod=r.checkinMethod;
 for(const key of ['checkinTime','checkoutTime']){const m=typeof r[key]==='string'?/^(\d{1,2})[:.](\d{2})$/.exec(r[key].trim()):null;if(m&&+m[1]<=23&&+m[2]<=59)out[key]=m[1].padStart(2,'0')+':'+m[2];}
 return out;
}
// The rules' draft plus what the model read: a field the rules found stays theirs; the rest comes from the model and is
// marked as said (not guessed), since the owner did say it. The type decides the defaults, so it goes first.
export function mergeModelDraft(draft:ListingDraft,found:string[],raw:unknown):{draft:ListingDraft;found:string[]}{
 const m=cleanModelListing(raw),d:ListingDraft={...draft,amenities:[...draft.amenities],known:[...draft.known]},took=[...found];
 const free=(key:string)=>!found.includes(key)&&!draft.known.includes(key)||(key==='city'&&!found.includes('city'));
 const take=(key:string,value:unknown)=>{(d as Row)[key]=value;if(!took.includes(key))took.push(key);};
 if(m.type&&free('type')){take('type',m.type);if(m.ownStaff===undefined&&free('ownStaff'))d.ownStaff=defaultOwnStaff(m.type);}
 for(const key of MODEL_LISTING_KEYS){if(key==='type'||key==='name'||key==='amenities')continue;const v=(m as Row)[key];if(v!==undefined&&free(key))take(key,v);}
 if(m.amenities){const fits=categoryAmenities[kindCategory(d.type)];const all=[...new Set([...d.amenities,...m.amenities])].filter(a=>fits.includes(a));if(all.length!==d.amenities.length)take('amenities',all);}
 if(m.name&&free('title')&&(isBath(d.type)||isBanquet(d.type)))take('title',(draftKind(d)+' «'+m.name.replace(/[«»"„“”]/g,'')+'»').slice(0,120));
 // What the counts say together: a guest needs a bed, a floor is not above the last one.
 if(took.includes('capacity')&&!found.includes('beds')&&!draft.known.includes('beds'))d.beds=Math.max(d.beds,d.capacity);
 if(d.beds<d.capacity&&!isBanquet(d.type))d.beds=d.capacity;
 if(d.floor>d.floors)d.floors=d.floor;
 if(!took.includes('capacity')&&took.includes('rooms')&&!draft.known.includes('capacity')&&!isBanquet(d.type)&&!isBath(d.type))d.capacity=d.type==='studio'?2:Math.min(50,d.rooms*2);
 d.known=[...new Set([...d.known,...took])];
 return {draft:d,found:took};
}
