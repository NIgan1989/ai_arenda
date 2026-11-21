import { forms, t as tr } from './i18n';
type Filters=Record<string,string>;
export function mapSearchFilters(input:Record<string,unknown>){
 const filters:Filters={city:'',guests:'1',mode:'daily',page:'1'};
 for(const key of ['city','guests','rooms','roomsExact','minPrice','maxPrice','mode','sort','start','end'])if(typeof input[key]==='string'&&input[key].length<=120&&input[key]!=='')filters[key]=input[key];
 return filters;
}
// Lower case, «е» for «ё», and the spellings the rules below do not need to know one by one: «вай фай» and «wi fi» are
// «wifi», «кондей» a «кондиционер». «Завтрак» is set apart first, so that it is never read as «завтра» (it is named
// back as not searched, see UNSEARCHED).
//
// The rules read Russian. A request in Kazakh or in English is first said in the Russian words of the rules: the
// examples the app shows in those languages («Бүгін 20:00-ге 6 адамға монша», «Bathhouse for 6 people today at 20:00»)
// must be read the same as the Russian one. Only the words of a search are known here; the rest is left as it is,
// and what the rules still cannot read goes to the model, as before.
const KK='а-яәіңғүұқөһ',KK_END='(?![а-яәіңғүұқөһ])';
const kkWord=(words:string,to:string):[RegExp,string]=>[new RegExp('(^|[^'+KK+'])(?:'+words+')'+KK_END,'g'),'$1'+to];
const MONTHS_RU=['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
const MONTHS_KK=['қаңтар','ақпан','наурыз','сәуір','мамыр','маусым','шілде','тамыз','қыркүйек','қазан','қараша','желтоқсан'];
const MONTHS_EN=['january','february','march','april','may','june','july','august','september','october','november','december'];
const KZ_WORDS:[RegExp,string][]=[
 // «20:00-ге» is «в 20:00»; «15 000-ға дейін» and «15 мың теңгеге дейін» are «до 15 000».
 [new RegExp('(\\d{1,2}[:.]\\d{2})\\s*-?\\s*(?:ге|ға|де|да|те|та)'+KK_END,'g'),'в $1'],
 [/(\d)\s*мың/g,'$1 тыс'],
 [new RegExp('(\\d[\\d ]*(?:\\s*тыс)?)\\s*(?:теңге(?:ге)?)?\\s*-?\\s*(?:ға|ге|қа|ке)?\\s+дейін'+KK_END,'g'),'до $1'],
 [/қонақ\s*үй[а-яәіңғүұқөһ]*/g,'гостиница'],
 // The party: «6 адамға», «екі адамға», «екеуге».
 [new RegExp('(\\d{1,3})\\s*(?:адам|кісі|қонақ)(?:ға|қа)?'+KK_END,'g'),'на $1 человек'],
 kkWord('екі\\s+(?:адам|кісі)(?:ға|қа)?|екеуге|екеумізге','на двоих'),kkWord('үш\\s+(?:адам|кісі)(?:ға|қа)?|үшеуге|үшеумізге','на троих'),
 // The length: «3 сағатқа», «бір тәулікке», «2 күнге», «түнге».
 [new RegExp('(\\d{1,2})\\s*сағат(?:қа|ка)?'+KK_END,'g'),'на $1 часа'],
 [new RegExp('(\\d{1,2})\\s*тәулік(?:ке)?'+KK_END,'g'),'на $1 суток'],[new RegExp('(\\d{1,2})\\s*күн(?:ге)?'+KK_END,'g'),'на $1 дней'],[new RegExp('(\\d{1,2})\\s*түн(?:ге)?'+KK_END,'g'),'на $1 ночей'],
 kkWord('(?:бір\\s+)?тәулікке','на сутки'),kkWord('(?:бір\\s+)?түнге','на ночь'),
 kkWord('бүрсігүні','послезавтра'),kkWord('бүгін','сегодня'),kkWord('ертең','завтра'),kkWord('қазір','сейчас'),kkWord('кешке|кешкісін','вечером'),kkWord('демалыс\\s+күндері(?:не)?|демалысқа','на выходные'),
 kkWord('орталығында|орталықта|орталық','в центре'),kkWord('арзанырақ|арзан','дешевле'),kkWord('жақынырақ|жақын','ближе'),
 ...MONTHS_KK.map((m,i):[RegExp,string]=>[new RegExp('(\\d{1,2})\\s*-?\\s*'+m+'['+KK+']*','g'),'$1 '+MONTHS_RU[i]]),
 [/п[әа]тер[а-яәіңғүұқөһ]*/g,'квартира'],[/монша[а-яәіңғүұқөһ]*/g,'баня'],[/т[әа]ул[іи]к[а-яәіңғүұқөһ]*/g,'сутки'],[/сағат[а-яәіңғүұқөһ]*/g,'часа']];
const EN_MONTH='('+MONTHS_EN.join('|')+')',enMonth=(name:string)=>MONTHS_RU[MONTHS_EN.indexOf(name)];
const enWords=(text:string)=>!/[a-z]{3}/.test(text)?text:text
 .replace(/\bat\s+(\d{1,2})\s*(am|pm)\b/g,(_,h,half)=>'в '+String(Number(h)%12+(half==='pm'?12:0)).padStart(2,'0')+':00').replace(/\bat\s+(\d{1,2}[:.]\d{2})\b/g,'в $1')
 .replace(/(\d),(\d{3})\b/g,'$1$2').replace(/\b(?:up\s+to|under|below|no\s+more\s+than|max(?:imum)?)\s+(\d[\d ]*)(?:\s*k\b)?/g,(whole,n)=>'до '+n.trim()+(/k$/.test(whole)?' тыс':''))
 .replace(/\b(?:for\s+)?(\d{1,2})\s*(?:hours?|hrs?)\b/g,'на $1 часа').replace(/\b(?:for\s+)?(\d{1,2})\s*days?\b/g,'на $1 дней').replace(/\b(?:for\s+)?(\d{1,2})\s*nights?\b/g,'на $1 ночей')
 .replace(/\b(?:for\s+)?(\d{1,3})\s*(?:people|persons?|guests?|adults?)\b/g,'на $1 человек').replace(/\bfor\s+(\d{1,3})\b(?![:.]\d)/g,'на $1')
 .replace(/\bfor\s+(?:two|a\s+couple)\b/g,'на двоих').replace(/\bfor\s+three\b/g,'на троих')
 .replace(/\b(?:for\s+)?(?:one|a)\s+day\b/g,'на сутки').replace(/\btonight\b/g,'сегодня на ночь').replace(/\b(?:for\s+)?(?:the|a|one)\s+night\b|\bovernight\b/g,'на ночь')
 .replace(/\b(?:the\s+)?day\s+after\s+tomorrow\b/g,'послезавтра').replace(/\btoday\b/g,'сегодня').replace(/\btomorrow\b/g,'завтра').replace(/\b(?:right\s+)?now\b/g,'сейчас').replace(/\b(?:this\s+|in\s+the\s+)?evening\b/g,'вечером')
 .replace(/\b(?:(?:this|at\s+the|on\s+the|for\s+the)\s+)?weekend\b/g,'на выходные').replace(/\b(?:(?:in|near)\s+(?:the\s+)?)?(?:city\s+)?cent(?:re|er)\b|\bdowntown\b/g,'в центре')
 .replace(new RegExp('\\b(?:on\\s+)?(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?'+EN_MONTH+'\\b','g'),(_,d,m)=>d+' '+enMonth(m)).replace(new RegExp('\\b(?:on\\s+)?'+EN_MONTH+'\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b','g'),(_,m,d)=>d+' '+enMonth(m))
 .replace(/\b(?:bath\s*houses?|saunas?|banya)\b/g,'баня').replace(/\btoi\b/g,'той').replace(/\bbanquet(?:\s+hall)?\b/g,'банкетный зал').replace(/\b(?:apartments?|flats?)\b/g,'квартира').replace(/\bhotels?\b/g,'гостиница')
 .replace(/\b(?:cheaper|cheapest|cheap)\b/g,'дешевле').replace(/\b(?:closer|nearer|nearby)\b/g,'ближе').replace(/\bparking\b/g,'парковка').replace(/\b(?:hourly|by\s+the\s+hour)\b/g,'почасовая');
const normal=(text:string)=>enWords(KZ_WORDS.reduce((t,[from,to])=>t.replace(from,to),text.toLocaleLowerCase('ru').replace(/ё/g,'е')))
 .replace(/завтрак[а-я]*/g,'zavtrak').replace(/(?:вай|wi)[\s-]+(?:фай|fi)/g,'wifi').replace(/(?:^|[^а-я])конд(?:ей|еем|ея|ик[а-я]*)(?=$|[^а-я])/g,' кондиционер');
export function mapSearchRequest(text:string,current:Filters,cities:string[],now=Date.now()){
 const request=normal(text),filters:Filters={...current,page:'1'},applied:string[]=[],notes:string[]=[];
 const city=[...new Set(cities)].sort((a,b)=>b.length-a.length).find(city=>{const stem=normal(city).replace(/[а-я]$/u,c=>/[аыь]$/.test(c)?'':c);return stem.length>=3&&new RegExp('(?:^|[^а-я])'+stem.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?:[аеуы]?)(?=$|[^а-я])','u').test(request);});
 if(city){filters.city=city;applied.push(city);}
 const rooms=request.match(/(?:^|\s)([1-9])\s*[-–]?\s*(?:комнат|комн|ком\b)/),wordRoom=request.match(/(одно|двух|трех|четырех|пяти)комнат/);
 const room=rooms?.[1]||(wordRoom?({одно:'1',двух:'2',трех:'3',четырех:'4',пяти:'5'} as Record<string,string>)[wordRoom[1]]:null);
 if(room){filters.rooms=room;filters.roomsExact=/(?:от|не менее|минимум)\s*(?:[1-9]|одно|двух|трех|четырех|пяти)/.test(request)?'0':'1';applied.push((filters.roomsExact==='1'?'ровно ':'от ')+room+' комн.');}
 const guests=request.match(/(?:для|на)\s*(\d{1,2})\s*(?:гост|человек|чел\b)/);if(guests&&+guests[1]>0&&+guests[1]<=50){filters.guests=guests[1];applied.push(guests[1]+' гостей');}
 const budget=request.match(/(?:до|не дороже)\s*(\d[\d ]*(?:[.,]\d+)?)\s*(тыс(?:яч)?\.?|к\b)?/);if(budget&&!/^\s*[-.]\d/.test(request.slice((budget.index||0)+budget[0].length))){const value=Number(budget[1].replace(/ /g,'').replace(',','.'))*(budget[2]?1000:1);if(value>0&&value<=100000000){filters.maxPrice=String(Math.round(value));applied.push('до '+Math.round(value)+' ₸');}}
 if(/почас|на\s+\d+\s*час/.test(request))filters.mode='hourly';else if(/посуточ|сутк|суток|дн[яей]/.test(request))filters.mode='daily';
 if(/дешевле|подешевле/.test(request)){filters.sort='price-asc';applied.push('сначала дешевле');}else if(/дороже/.test(request)&&!/не\s+дороже/.test(request)){filters.sort='price-desc';applied.push('сначала дороже');}
 const format=(time:number)=>new Date(time+5*3600000).toISOString().slice(0,16);
 const localNow=new Date(now+5*3600000),today=localNow.toISOString().slice(0,10),tomorrow=new Date(now+86400000+5*3600000).toISOString().slice(0,10);
 let start:number|null=null,end:number|null=null;
 const explicit=request.match(/с\s*(\d{4}-\d{2}-\d{2})\s*(?:по|до)\s*(\d{4}-\d{2}-\d{2})/);
 if(explicit){const parse=(date:string)=>{const time=Date.parse(date+'T14:00:00+05:00');return Number.isFinite(time)&&format(time).slice(0,10)===date?time:NaN;};start=parse(explicit[1]);end=parse(explicit[2]);}
 else if(/сегодня|завтра/.test(request)||filters.start&&/на\s*\d{1,2}\s*(?:сут|дн|час)/.test(request)){
  const day=/завтра/.test(request)?tomorrow:today;start=/сегодня|завтра/.test(request)?Math.max(Date.parse(day+'T14:00:00+05:00'),now+300000):Date.parse(filters.start+(filters.start.length===16?'+05:00':''));
  const length=request.match(/на\s*(\d{1,2})\s*(сут(?:ки|ок)?|дн(?:я|ей)?|час(?:а|ов)?)/),hours=length&&length[2].startsWith('час'),duration=length?+length[1]:1;
  if(duration>0&&duration<32){if(hours)filters.mode='hourly';end=start+duration*(hours?3600000:86400000);}
 }
 if(start!==null){if(!Number.isFinite(start)||!Number.isFinite(end)||end===null||end<=start||start<now){delete filters.start;delete filters.end;notes.push('Уточните будущие даты в фильтрах.');}else{filters.start=format(start);filters.end=format(end);applied.push(filters.start.replace('T',' ')+' → '+filters.end.replace('T',' '));}}
 if(!filters.start||!filters.end)notes.push('Для проверки свободных дат выберите заезд и выезд.');
 if(!applied.length)applied.push(filters.city||'Все города');
 return {filters,citySpecified:!!city,nearby:/рядом|поблизости|недалеко|возле меня/.test(request),summary:applied.join(' · '),notes};
}

// ---------- Guest request on the first screen: free text and the stay it describes ----------
// Additions for the one-line request of the guest map (components/smart-guest-map.tsx).
// A stay is two Kazakhstan-local strings 'YYYY-MM-DDTHH:mm' (UTC+5, no daylight saving): the format the request
// form and /api/public/matching already use. No model is called here; tests/map-search-request.test.mjs covers the rules.

type Row = Record<string, any>;

// 'night' is a daily stay priced by the owner's nightly tariff where it is cheaper («На ночь»).
export type GuestStay = { mode: 'daily' | 'hourly' | 'night'; start: string; end: string };

export type GuestSearch = {
  /** The current conditions with everything the text says applied. */
  filters: Row;
  /** What the text itself named; the screen asks for the rest. */
  stated: { city: boolean; district: boolean; when: boolean; guests: boolean; budget: boolean; wishes: boolean; home: boolean };
  /** The guest asked for a place near them: the screen needs a point before it can search. */
  nearby: boolean;
  /** A landmark to search around («у вокзала»), in words for a map search; the screen finds its point. */
  place?: string;
  understood: boolean;
  /**
   * The day or the hour the text names is already behind ("10 ноября", "вчера", "сегодня в 9" said at noon).
   * Nothing is moved to another day or another year and nothing is searched: the screen says so and asks for the date.
   */
  past?: 'date' | 'time';
  /** What was asked for and could not be taken as written, each a short sentence for a note on the screen. */
  remarks: string[];
};

// Check-in and check-out hours of a daily stay: the defaults of lib/rental-policy.ts (840 and 720 minutes).
export const CHECKIN_TIME = '14:00';
export const CHECKOUT_TIME = '12:00';
// Sent as the budget when the guest named none: the largest amount the matching API accepts.
export const NO_BUDGET = '100000000';
export const HOUR_CHOICES = [2, 3, 4, 6, 12];
// The longest stay the line searches for by the hour and by the day, and the largest party the service accepts.
export const MAX_HOURS = 23;
export const MAX_DAYS = 30;
export const MAX_GUESTS = 50;

const KZ = 5 * 3600000, HALF_HOUR = 1800000, HOUR = 3600000, DAY = 86400000;
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTH_STEMS = ['январ', 'феврал', 'март', 'апрел', 'ма[яй]', 'июн', 'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр'];
const MONTH = '(январ[яь]|феврал[яь]|марта?|апрел[яь]|ма[яй]|июн[яь]|июл[яь]|августа?|сентябр[яь]|октябр[яь]|ноябр[яь]|декабр[яь])';
const COUNT: Record<string, number> = {
  один: 1, одну: 1, одни: 1, два: 2, две: 2, двое: 2, пару: 2, три: 3, трое: 3,
  четыре: 4, пять: 5, шесть: 6, семь: 7, несколько: 3,
};
const WEEKDAYS: [RegExp, number][] = [
  [/воскресень/, 0],
  [/понедельник/, 1],
  [/вторник/, 2],
  [/(?:в|во|на)\s+сред[уы]/, 3],
  [/четверг/, 4],
  [/пятниц/, 5],
  [/суббот/, 6],
];
// "двое суток" is a length of stay, not two guests.
const NOT_A_STAY = '(?!\\s+(?:сут|дн|ноч))';
const PARTY: [RegExp, number][] = [
  [new RegExp('двоих|вдвоем|(?:^|[^а-я])двое' + NOT_A_STAY), 2],
  [new RegExp('троих|втроем|(?:^|[^а-я])трое' + NOT_A_STAY), 3],
  [new RegExp('четверых|вчетвером|(?:^|[^а-я])четверо' + NOT_A_STAY), 4],
  [/пятерых|впятером/, 5],
  [/(?:для|на)\s+одного|(?:^|[^а-я])одному/, 1],
];
// A part of the day: the hour a stay starts at, and the hour (counted from midnight) at which that part is over.
const PART_OF_DAY: [RegExp, string, number][] = [
  [/утром|с утра/, '09:00', 12],
  [/днем/, '13:00', 18],
  [/вечером/, '19:00', 24],
  [/ночью/, '22:00', 30],
];
// The type of home the text names, as the ids of lib/listings.ts (propertyTypes). "Квартира" is how most guests
// say "жильё" and narrows nothing; a "гостевой дом" is not a "дом", an "апарт-отель" not an "отель".
/** The hour a bath is searched from when a day is named without one. */
export const BATH_EVENING = '19:00';
/** The types of the category «Баня» (lib/listings.ts categories.bath). */
export const BATH_KINDS = ['banya', 'sauna'];
/** The types of the category «Банкет» (lib/listings.ts categories.banquet): a hall taken whole, priced per guest. */
export const BANQUET_KINDS = ['banquet', 'cafe'];
export const MAX_BANQUET_GUESTS = 1000;
/** The two slots of a banquet day (lib/listings.ts banquetSlots); the evening ends at midnight. */
export const BANQUET_SLOTS: Record<'lunch' | 'evening', { title: string; from: string; to: string }> = {
  lunch: { title: 'Обед', from: '12:00', to: '17:00' },
  evening: { title: 'Вечер', from: '18:00', to: '00:00' },
};
export type BanquetSlot = keyof typeof BANQUET_SLOTS;
export const isBanquetRequest = (kinds: unknown) => Array.isArray(kinds) && kinds.length > 0 && kinds.every(k => BANQUET_KINDS.includes(k));
/** What the hall is taken for, as the ids of lib/listings.ts occasions; '' when the text names none. */
export function statedOccasion(text: string): string {
  if (/помин|(?:^|[^а-я])ас(?=$|[^а-я])|садака|кудайы|құдайы|жетіс|қырқ|кырк|жылдық|жылдык|годовщин[а-я]* смерти|похорон/.test(text)) return 'memorial';
  if (/[кқ]ыз\s*[уұ]зат|узату|ұзату/.test(text)) return 'uzatu';
  if (/[кқ][уұ]далы|сватовств|сватан/.test(text)) return 'kudalyk';
  if (/беташар/.test(text)) return 'betashar';
  if (/с[уү]ндет|обрезан/.test(text)) return 'sundet';
  if (/т[уұ]саукес/.test(text)) return 'tusau';
  if (/б[еі]сік|бесик|ш[іи]лдехан|рождени[ея] реб/.test(text)) return 'besik';
  if (/свадьб|свадеб|тойхан|(?:^|[^а-я])той(?=$|\s+(?:на|в|для|\d)|[,.!?])|(?:^|[^а-я])то[яю](?=$|[^а-я])/.test(text)) return 'toi';
  if (/детск[а-я]* (?:праздник|день рожд)/.test(text)) return 'kids';
  if (/день рождени|днюх/.test(text)) return 'birthday';
  if (/корпоратив/.test(text)) return 'corporate';
  if (/выпускн/.test(text)) return 'graduation';
  if (/новый год|новогодн/.test(text)) return 'newyear';
  if (/конференц|семинар|тренинг|форум/.test(text)) return 'conference';
  if (/юбиле|мерейто|праздн[а-я]* (?:отметить|провести)|(?:отметить|провести) праздн/.test(text)) return 'party';
  return '';
}
const KINDS: [RegExp, string][] = [
  [/студи/, 'studio'],
  [/апарт[- ]?отел/, 'aparthotel'],
  [/гостев[а-я]*\s+дом/, 'guesthouse'],
  [/гостиниц|(?:^|[^а-я])отел[ьяеию]|(?:^|[^а-я])номер(?:ок|а|е)?(?=$|[^а-я])/, 'hotel'],
  [/хостел/, 'hostel'],
  [/(?:^|[^а-я])(?:дом|домик|коттедж|дач)(?:а|е|у|ом|ик|ика|ке|ку)?(?=$|[^а-я])/, 'house'],
  [/(?:^|[^а-я])комнат(?:а|у|ку|ка|ой)(?=$|[^а-я])/, 'room'],
  // A bath or a sauna: the category «Баня» (lib/listings.ts categories), searched by the hour.
  [/(?:^|[^а-я])бан(?:я|ю|е|и|ька|ьку|ьке|ный|ном|ного)(?=$|[^а-я])/, 'banya'],
  [/саун/, 'sauna'],
  // A hall for an event: the category «Банкет», a slot of one day at a price per guest.
  [/банкет|тойхан|зал[а-я]*\s+(?:для\s+)?(?:торжеств|свадьб|праздник)|ресторан/, 'banquet'],
  [/(?:^|[^а-я])кафе(?=$|[^а-я])/, 'cafe'],
];
const ROOM_WORDS: [RegExp, number][] = [
  [/однушк|однокомнат|(?:^|[^а-я])одно\s*комнат/, 1],
  [/двушк|двухкомнат|(?:^|[^а-я])двух\s*комнат/, 2],
  [/трешк|трехкомнат|(?:^|[^а-я])трех\s*комнат/, 3],
  [/четырехкомнат|(?:^|[^а-я])четырех\s*комнат/, 4],
];

/**
 * Rooms the text asks for: '2' for exactly two ("двушка", "2-комнатная", "2 комнаты"), '2+' for at least two
 * ("от 2 комнат", "минимум двухкомнатная"); '' when the text names none.
 */
export function statedRooms(text: string): string {
  const digit = text.match(/(?:^|[^\d])([1-6])\s*[-–]?\s*(?:х\s*)?комн/), word = ROOM_WORDS.find(([pattern]) => pattern.test(text));
  const rooms = digit ? Number(digit[1]) : word ? word[1] : 0;
  if (!rooms) return '';
  return /(?:от|не менее|минимум|хотя бы)\s*(?:[1-6]|одно|двух|трех|четырех)/.test(text) ? rooms + '+' : String(rooms);
}

/** The types of home the text names, in the order of KINDS. */
export function statedKinds(text: string): string[] {
  const kinds = KINDS.filter(([pattern]) => pattern.test(text)).map(([, id]) => id);
  return kinds.filter(id => !(id === 'house' && kinds.includes('guesthouse')) && !(id === 'hotel' && kinds.includes('aparthotel')));
}

// Towns the service has no homes in yet, with the service city nearest to each. A guest who names one is told so
// and shown the nearest city, instead of the search quietly staying in the city it was in.
export const OTHER_TOWNS: Record<string, string> = {
  Экибастуз: 'Павлодар', Аксу: 'Павлодар', Темиртау: 'Караганда', Сарань: 'Караганда', Шахтинск: 'Караганда', Жезказган: 'Караганда',
  Сатпаев: 'Караганда', Балхаш: 'Караганда', Талдыкорган: 'Алматы', Конаев: 'Алматы', Капчагай: 'Алматы', Каскелен: 'Алматы',
  Талгар: 'Алматы', Есик: 'Алматы', Жаркент: 'Алматы', Рудный: 'Костанай', Лисаковск: 'Костанай', Аркалык: 'Костанай',
  Степногорск: 'Астана', Атбасар: 'Астана', Косшы: 'Астана', Щучинск: 'Кокшетау', Бурабай: 'Кокшетау', Боровое: 'Кокшетау',
  Риддер: 'Усть-Каменогорск', Зайсан: 'Усть-Каменогорск', Аягоз: 'Семей', Курчатов: 'Семей', Жанаозен: 'Актау',
  Кульсары: 'Атырау', Хромтау: 'Актобе', Кандыагаш: 'Актобе', Аксай: 'Уральск', Байконур: 'Кызылорда', Кентау: 'Туркестан',
  Сарыагаш: 'Шымкент', Ленгер: 'Шымкент', Жетысай: 'Шымкент', Каратау: 'Тараз',
};

/** The town outside the service the text names ("в Экибастузе"), or null. The text is already lower case. */
export function otherTown(text: string): string | null {
  for (const town of Object.keys(OTHER_TOWNS)) {
    const stem = normal(town).replace(/[аяеьйо]$/, '');
    if (new RegExp('(?:^|[^а-я])' + stem + '[а-я]{0,3}(?=$|[^а-я])').test(text)) return town;
  }
  return null;
}

// Every amenity an owner can mark (lib/listings.ts amenities), and 'pets': the owner's rule «можно с питомцами».
const WISHES: [RegExp, string][] = [
  [/парков|паркинг/, 'parking'],
  [/wi-?fi|вай-?фай|интернет/, 'wifi'],
  [/кухн/, 'kitchen'],
  [/рабоч[а-я]*\s+мест|для работы/, 'workspace'],
  [/стиральн|стиралк/, 'washer'],
  [/кондиционер|(?:^|[^а-я])кондер/, 'aircon'],
  [/телевизор|(?:^|[^а-я])тв(?=$|[^а-я])/, 'tv'],
  [/балкон|лоджи/, 'balcony'],
  [/лифт/, 'elevator'],
  [/(?:^|[^а-я])фен(?:ом)?(?=$|[^а-я])/, 'hairdryer'],
  [/утюг/, 'iron'],
  [/детск[а-я]*\s+кроват|кроватк/, 'crib'],
  [/(?:постельн[а-я]*\s+)?бель[ея]|простын/, 'linen'],
  [/полотенц/, 'towels'],
  [/джакузи|гидромассаж/, 'jacuzzi'],
  [/собак|собач|(?:^|[^а-я])пс(?:ом|а)(?=$|[^а-я])|кошк|(?:^|[^а-я])кот(?:ом|а|иком)(?=$|[^а-я])|питом|животн/, 'pets'],
];
// What a company asks of a bath (lib/listings.ts categoryAmenities.bath): read only in a bath request.
const BATH_WISHES: [RegExp, string][] = [
  [/бассейн/, 'pool'],
  [/купел/, 'plunge'],
  [/веник/, 'brooms'],
  [/караоке/, 'karaoke'],
  [/мангал|шашлык/, 'grill'],
  [/биль[яа]рд/, 'billiards'],
  [/полотенц|простын/, 'towels'],
  [/парилк|(?:^|[^а-я])парн(?:ая|ой|ую)(?=$|[^а-я])/, 'steam'],
  [/джакузи|гидромассаж/, 'jacuzzi'],
];
// A wish that was read is not named back as not searched.
const READ_WORDS: Record<string, string[]> = { smoking: ['курение'], parties: ['праздник'], nodeposit: ['депозит'], jacuzzi: ['джакузи'], steam: ['баня'] };
// The owner's rules and ways of check-in a guest of a home asks for (lib/smart-matching.ts ruleFits).
// «Без депозита» is read apart from the other «без …»: it asks for something, it does not take a wish off.
const RULES: [RegExp, string][] = [
  [/(?:^|[^а-я])(?:можно|разреш[а-я]*)\s+(?:курить|курени)|(?:^|[^а-я])для\s+курящ/, 'smoking'],
  [/вечеринк|тусовк|(?:^|[^а-я])праздн|день\s+рождени/, 'parties'],
  [/самозасел|бесконтакт|(?:^|[^а-я])сейф|умн[а-я]*\s+замок|кодов[а-я]*\s+замок/, 'selfcheckin'],
];
// What is asked of a banquet hall (lib/listings.ts categoryAmenities.banquet): read only in a banquet request.
const BANQUET_WISHES: [RegExp, string][] = [
  [/халял/, 'halal'],
  [/намаз/, 'prayer'],
  [/сцен/, 'stage'],
  [/микрофон|звук|аппаратур/, 'sound'],
  [/танцпол/, 'dancefloor'],
  [/караоке/, 'karaoke'],
  [/сво[иейя][а-я]*\s+(?:продукт|ед[аоу]|напитк|алкогол)|со своим/, 'ownfood'],
  [/детск[а-я]*\s+комнат/, 'kidsroom'],
];
// What guests ask for and the search cannot check yet. It is named back («Пока не умею искать: отзывы»), never
// dropped in silence and never guessed.
const UNSEARCHED: [RegExp, string][] = [
  // «Дом с баней»: a home that has one. A request for a bath itself is the category «Баня» and is searched.
  [/(?:^|[^а-я])бан(?:я|ей|ю|и|ька|ькой)(?=$|[^а-я])|саун/, 'баня'],
  [/бассейн/, 'бассейн'],
  [/мангал|барбекю|шашлы/, 'мангал'],
  [/отзыв|рейтинг|оценк/, 'отзывы'],
  [/депозит|залог/, 'депозит'],
  [/zavtrak/, 'завтрак'],
  [/(?:^|[^а-я])вид(?:ом)?\s+на/, 'вид из окна'],
  [/(?:^|[^а-я])этаж/, 'этаж'],
  [/курить|курени|курящ/, 'курение'],
  [/вечеринк|день рождени|праздник/, 'праздник'],
];

// «Рядом с вокзалом», «возле ТРЦ Батыр Молл», «у набережной»: a landmark, not «рядом со мной». Up to three words
// after the preposition, stopping at the words of a stay, a day or a home.
const PLACE_STOP = '(?:на|до|с|со|для|и|в|за|от|завтра|сегодня|послезавтра|сейчас|срочно|вечером|утром|днем|ночью|недорог[а-я]*|дешев[а-я]*|подешевле|посуточно|почасов[а-я]*|нужн[а-я]*|нас|мной|меня|двушк[а-я]*|однушк[а-я]*|трешк[а-я]*|студи[а-я]*|квартир[а-я]*|комнат[а-я]*|[а-я]+комнатн[а-я]*|жиль[а-я]*|дом|домик|гостиниц[а-я]*|хостел[а-я]*|отел[а-я]*|апартамент[а-я]*|номер|ищу|хочу|снять|сниму)(?=$|[^а-я])';
const PLACE_WORD = '(?!' + PLACE_STOP + ')[а-яa-z][а-яa-z0-9«»"-]*';
const PLACE_AFTER = new RegExp('(?:рядом\\s+со?|недалеко\\s+от|неподалеку\\s+от|около|возле|вблизи|близко\\s+к|в\\s+районе)\\s+(' + PLACE_WORD + '(?:\\s+' + PLACE_WORD + '){0,2})');
const PLACE_AT = new RegExp('(?:^|[^а-я])у\\s+((?:жд\\s+|железнодорожн[а-я]+\\s+)?(?:вокзал|автовокзал|набережн|парк|рынк|аэропорт|больниц|университет|трц|тц|мечет|стадион|цум)[а-я]*(?:\\s+' + PLACE_WORD + '){0,2})');
// The usual landmarks in the form a map search finds: «вокзала» is «железнодорожный вокзал».
const PLACE_NAMES: [RegExp, string][] = [
  [/^автовокзал[а-я]*$/, 'автовокзал'],
  [/^(?:жд\s+|железнодорожн[а-я]+\s+)?вокзал[а-я]*$/, 'железнодорожный вокзал'],
  [/^аэропорт[а-я]*$/, 'аэропорт'],
  [/^набережн[а-я]*$/, 'набережная'],
  [/^(?:центральн[а-я]+\s+)?рын(?:ок|к[а-я]*)$/, 'центральный рынок'],
  [/^больниц[а-я]*$/, 'больница'],
  [/^университет[а-я]*$/, 'университет'],
  [/^мечет[а-я]*$/, 'мечеть'],
  [/^стадион[а-я]*$/, 'стадион'],
  [/^парк[а-я]{0,2}$/, 'парк'],
  [/^цум[а-я]{0,2}$/, 'цум'],
];

/** The landmark the text asks to be near, in words for a map search: 'железнодорожный вокзал', 'трц батыр молл'; '' when none. */
// «На Торайгырова», «улица Ломова», «мкр Усольский»: a street or a микрорайон is searched around as a landmark is.
const PLACE_STREET = new RegExp('(?:^|[^а-я])(улиц[аеуы]|ул\\.?|проспект[а-я]*|пр-т|мкр\\.?|микрорайон[а-я]*)\\s+(' + PLACE_WORD + '(?:\\s+' + PLACE_WORD + ')?)');
const PLACE_ON = /(?:^|[^а-я])на\s+([а-я]{3,}(?:ова|ева|ина|ына))(?=$|[^а-я])/;
export function statedPlace(text: string): string {
  const street = text.match(PLACE_STREET), on = text.match(PLACE_ON);
  if (street) return (/^(?:мкр|микро)/.test(street[1]) ? 'микрорайон ' : 'улица ') + street[2].replace(/[«»"]/g, '').trim();
  if (on && !/^(?:двоих|троих|одного|сына|часова)$/.test(on[1])) return 'улица ' + on[1];
  const said = (text.match(PLACE_AFTER) || text.match(PLACE_AT))?.[1]?.replace(/[«»"]/g, '').trim() || '';
  if (said.length < 3) return '';
  return PLACE_NAMES.find(([pattern]) => pattern.test(said))?.[1] || said;
}

/** What the text asks for that the search cannot check: ['джакузи', 'отзывы']. The text is already lower case. */
// What a bath request can check (BATH_WISHES) or takes for granted (a company) is not named back there.
const BATH_SEARCHED = ['баня', 'бассейн', 'мангал', 'праздник'];
export function unsearched(text: string, bath = false, read: string[] = []): string[] {
  return UNSEARCHED.filter(([pattern, word]) => pattern.test(text) && !(bath && BATH_SEARCHED.includes(word)) && !read.includes(word)).map(([, word]) => word);
}

const localISO = (time: number) => new Date(time + KZ).toISOString().slice(0, 16);
const localTime = (local: string) => Date.parse(local + ':00Z') - KZ;
/** A date 'YYYY-MM-DD' moved by a number of days. */
export const addDays = (date: string, days: number) => new Date(Date.parse(date + 'T00:00:00Z') + days * DAY).toISOString().slice(0, 10);
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const two = (value: number) => String(value).padStart(2, '0');
const realDate = (date: string) => {
  const time = Date.parse(date + 'T00:00:00Z');
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === date;
};

/** Today's date in Kazakhstan, 'YYYY-MM-DD'. */
export const kzToday = (now = Date.now()) => localISO(now).slice(0, 10);

/** The nearest half-hour that still leaves the guest `lead` minutes. */
export function nextSlot(now = Date.now(), lead = 30) {
  return Math.ceil((now + lead * 60000) / HALF_HOUR) * HALF_HOUR;
}

/** The word after a number, in the language of the app (lib/i18n.ts forms): in Russian by the Russian rule. */
export function plural(count: number, one: string, few: string, many: string) {
  return forms(count, one, few, many);
}

/** Started days of a stay, the way the daily tariff counts them. */
export const stayNights = (start: string, end: string) => Math.max(1, Math.ceil((localTime(end) - localTime(start)) / DAY));
export const stayHours = (start: string, end: string) => Math.max(1, Math.ceil((localTime(end) - localTime(start)) / HOUR));

/** Before this hour a stay "today" is the night that has already begun: from now until the morning's check-out. */
export const NIGHT_UNTIL = '06:00';

/**
 * A check-in date and a check-out date as a stay: in at 14:00 (or at `time`), out at 12:00.
 * A check-in date that has passed means today until at least tomorrow. A check-in hour that has passed
 * today moves to the nearest half-hour that leaves `lead` minutes; a check-out that is not later than the
 * check-in moves to the first noon after it. `nights`: the stay was asked as a number of nights from today, not
 * as dates; then today before 06:00 without a later hour is the night under way: in at the nearest half-hour,
 * and the first of the nights ends at this morning's noon (a guest at 01:00 wants a bed now, not at 14:00).
 */
export function dailyStay(checkin: string, checkout: string, now = Date.now(), time?: string, lead = 30, nights = false): { start: string; end: string } {
  const today = kzToday(now);
  if (checkin < today) return dailyStay(today, checkout > today ? checkout : addDays(today, 1), now, time ?? CHECKIN_TIME, lead);
  // A named hour that is the nearest one anyway («сейчас» at 01:10) is the same night.
  const tonight = nights && checkin === today && localISO(now).slice(11) < NIGHT_UNTIL && checkout > today
    && (time === undefined || localTime(today + 'T' + time) <= nextSlot(now, lead));
  if (tonight) return { start: localISO(nextSlot(now, lead)), end: addDays(checkout, -1) + 'T' + CHECKOUT_TIME };
  const start = Math.max(localTime(checkin + 'T' + (time ?? CHECKIN_TIME)), nextSlot(now, lead)), from = localISO(start);
  let end = localTime(checkout + 'T' + CHECKOUT_TIME);
  if (!(end > start)) end = localTime(addDays(from.slice(0, 10), from.slice(11) < CHECKOUT_TIME ? 0 : 1) + 'T' + CHECKOUT_TIME);
  return { start: from, end: localISO(end) };
}

/** A start date, a start time and a number of hours as a stay. */
export function hourlyStay(date: string, time: string, hours: number): { start: string; end: string } {
  const start = localTime(date + 'T' + time);
  return { start: localISO(start), end: localISO(start + clamp(Math.round(hours) || 1, 1, 720) * HOUR) };
}

/** A banquet: the slot of one day. The evening ends at the midnight that follows. */
export function banquetStay(date: string, slot: BanquetSlot): { start: string; end: string } {
  return slot === 'lunch' ? { start: date + 'T12:00', end: date + 'T17:00' } : { start: date + 'T18:00', end: addDays(date, 1) + 'T00:00' };
}
export const banquetSlot = (start: string): BanquetSlot => (String(start).slice(11) < '17:00' ? 'lunch' : 'evening');
/** What a banquet request starts with: the nearest Saturday evening that is at least a day ahead; a memorial meal, tomorrow's lunch. */
export function defaultBanquet(now = Date.now(), occasion = ''): GuestStay {
  const today = kzToday(now), weekday = new Date(now + KZ).getUTCDay(), ahead = (6 - weekday + 7) % 7 || 7;
  return { mode: 'daily', ...(occasion === 'memorial' ? banquetStay(addDays(today, 1), 'lunch') : banquetStay(addDays(today, ahead), 'evening')) };
}
/** "20 декабря, вечер 18:00–00:00". */
export function banquetWhen(start: string, now = Date.now()) {
  const slot = BANQUET_SLOTS[banquetSlot(start)], today = kzToday(now), date = start.slice(0, 10);
  return (date === today ? tr('сегодня') : date === addDays(today, 1) ? tr('завтра') : dayMonth(start, now)) + ', ' + tr(slot.title).toLocaleLowerCase('ru') + ' ' + slot.from + '–' + slot.to;
}

/** What the request form starts with: today until tomorrow, or the nearest three hours. */
export function defaultStay(mode: string, now = Date.now(), hours = 3): GuestStay {
  if (mode === 'hourly') {
    const start = localISO(nextSlot(now));
    return { mode: 'hourly', ...hourlyStay(start.slice(0, 10), start.slice(11), hours) };
  }
  const today = kzToday(now);
  return { mode: mode === 'night' ? 'night' : 'daily', ...dailyStay(today, addDays(today, 1), now, undefined, 30, true) };
}

/** The nearest Saturday to Sunday: today when it is Saturday, the next weekend when it is Sunday. */
export function weekendStay(now = Date.now()): GuestStay {
  const weekday = new Date(now + KZ).getUTCDay(), saturday = addDays(kzToday(now), (6 - weekday + 7) % 7);
  return { mode: 'daily', ...dailyStay(saturday, addDays(saturday, 1), now, CHECKIN_TIME) };
}

/** The stay for the other tariff on the same day: a day from 14:00, or three hours. */
export function switchStay(mode: string, start: string, now = Date.now()): GuestStay {
  const today = kzToday(now), date = start && start.slice(0, 10) > today ? start.slice(0, 10) : today;
  if (mode !== 'hourly') return { mode: mode === 'night' ? 'night' : 'daily', ...dailyStay(date, addDays(date, 1), now, undefined, 30, true) };
  return date === today ? defaultStay('hourly', now) : { mode: 'hourly', ...hourlyStay(date, CHECKIN_TIME, 3) };
}

/** The same stay moved out of the past, for a form that stayed open: the length is kept. */
export function freshStay(stay: GuestStay, now = Date.now()): { start: string; end: string } {
  const { start, end } = stay;
  if (localTime(start) >= nextSlot(now, 5)) return { start, end };
  if (stay.mode === 'hourly') {
    const from = localISO(nextSlot(now));
    return hourlyStay(from.slice(0, 10), from.slice(11), stayHours(start, end));
  }
  const today = kzToday(now), out = end.slice(0, 10);
  // Before 06:00 the night under way stays a night: from the nearest half-hour, out at the same noon as before.
  if (localISO(now).slice(11) < NIGHT_UNTIL && out >= today) return dailyStay(today, addDays(out, 1), now, undefined, 30, true);
  return dailyStay(today, out > today ? out : addDays(today, 1), now);
}

/** Half-hour start times of the chosen date; today only the ones still ahead. `keep` stays in the list. */
export function startTimes(date: string, now = Date.now(), keep = ''): string[] {
  const first = nextSlot(now, 10), times: string[] = [];
  for (let minutes = 0; minutes < 1440; minutes += 30) {
    const time = two(Math.floor(minutes / 60)) + ':' + two(minutes % 60);
    if (localTime(date + 'T' + time) >= first) times.push(time);
  }
  // Late in the evening nothing is left today: the list must not come out empty.
  if (keep && !times.includes(keep)) times.push(keep);
  return times.sort();
}

// "12 ноября"; with the year when it is not the current one, so that a stay next year is never read as this year's.
const dayMonth = (local: string, now: number) =>
  Number(local.slice(8, 10)) + ' ' + tr(MONTHS[Number(local.slice(5, 7)) - 1]) + (local.slice(0, 4) === kzToday(now).slice(0, 4) ? '' : ' ' + local.slice(0, 4));

/** "12 ноября, 14:00 — 13 ноября, 12:00 · 1 сутки"; within one day "12 ноября, 19:00–22:00 · 3 часа". */
export function stayLine(start: string, end: string, mode: string, now = Date.now()) {
  const hours = stayHours(start, end), nights = stayNights(start, end);
  const length = mode === 'hourly'
    ? hours + ' ' + plural(hours, 'час', 'часа', 'часов')
    : nights + ' ' + plural(nights, 'сутки', 'суток', 'суток');
  const span = start.slice(0, 10) === end.slice(0, 10)
    ? dayMonth(start, now) + ', ' + start.slice(11) + '–' + end.slice(11)
    : dayMonth(start, now) + ', ' + start.slice(11) + ' — ' + dayMonth(end, now) + ', ' + end.slice(11);
  return span + ' · ' + length;
}

/** The short "when" of the one-line summary: "сегодня 19:00–22:00", "12–13 ноября", "10–15 ноября 2027". */
export function stayWhen(start: string, end: string, mode: string, now = Date.now()) {
  const today = kzToday(now), tomorrow = addDays(today, 1);
  const day = (local: string) => local.slice(0, 10) === today ? tr('сегодня') : local.slice(0, 10) === tomorrow ? tr('завтра') : dayMonth(local, now);
  if (mode === 'hourly') {
    return start.slice(0, 10) === end.slice(0, 10)
      ? day(start) + ' ' + start.slice(11) + '–' + end.slice(11)
      : day(start) + ' ' + start.slice(11) + ' — ' + day(end) + ' ' + end.slice(11);
  }
  if (start.slice(0, 10) === end.slice(0, 10)) return dayMonth(start, now);
  return start.slice(0, 7) === end.slice(0, 7)
    ? Number(start.slice(8, 10)) + '–' + dayMonth(end, now)
    : dayMonth(start, now) + ' — ' + dayMonth(end, now);
}

/** One line that says what will be searched: "Павлодар · сегодня 19:00–22:00 · 2 гостя". */
export function guestRequestLine(draft: Row, now = Date.now()) {
  const guests = Number(draft.guests) || 1, budget = Number(draft.maxPrice);
  const limit = budget > 0 && String(draft.maxPrice) !== NO_BUDGET
    ? tr('до {v} ₸', { v: new Intl.NumberFormat('ru-RU').format(budget).replace(/\s/g, ' ') })
    : '';
  return [
    String(draft.city || '') + (draft.district ? ', ' + draft.district : '') + (draft.near ? ', ' + tr('рядом с выбранным местом') : ''),
    isBanquetRequest(draft.kinds) ? banquetWhen(draft.start, now) : stayWhen(draft.start, draft.end, draft.mode, now),
    guests + ' ' + plural(guests, 'гость', 'гостя', 'гостей'),
    limit,
  ].filter(Boolean).join(' · ');
}

/**
 * The same line for the screen: a narrow sheet wraps it only after a " · ". The spaces inside each part
 * and the one before the dot do not break, so neither "гостя" nor "₸" nor the dot starts a line; a word
 * joiner after the dash keeps "13–14 ноября" and "19:00–22:00" whole.
 */
export const unbrokenParts = (line: string) => line.split(' · ')
  .map(part => part.replace(/ /g, '\u00a0').replace(/–/g, '–\u2060'))
  .join('\u00a0· ');

// A day and a month without a year mean the nearest such date. One that passed within half a year is a slip
// ("10 ноября" typed on the 12th), not a wish for next year; only an older one is next year's ("5 января" in November).
const SLIP_DAYS = 183;
type NamedDay = { date: string; past: boolean };

function nearestDay(dayText: string, month: number, today: string): NamedDay | null {
  const year = Number(today.slice(0, 4)), date = year + '-' + two(month + 1) + '-' + two(Number(dayText));
  if (month < 0 || !realDate(date)) return null;
  if (date >= today) return { date, past: false };
  if (date >= addDays(today, -SLIP_DAYS)) return { date, past: true };
  const next = (year + 1) + date.slice(4);
  return realDate(next) ? { date: next, past: false } : null;
}

type StatedDates = { from: string; to?: string; weekend?: boolean; past?: boolean };

// The day the text names, as a Kazakhstan date; a second date when the text gives a range.
// `past` is set when that day is already behind.
function statedDates(text: string, now: number): StatedDates | null {
  const today = kzToday(now);
  const monthOf = (word: string) => MONTH_STEMS.findIndex(stem => new RegExp('^' + stem).test(word));
  // "до 15 ноября" with no first day is a stay from today until that day.
  const until = (day: NamedDay): StatedDates =>
    day.past ? { from: day.date, past: true } : day.date > today ? { from: today, to: day.date } : { from: today };

  const iso = text.match(/(\d{4}-\d{2}-\d{2})(?:\s*(?:по|до|-|–|—)\s*(\d{4}-\d{2}-\d{2}))?/);
  if (iso && realDate(iso[1])) {
    if (iso[1] < today) return { from: iso[1], past: true };
    return { from: iso[1], to: iso[2] && realDate(iso[2]) && iso[2] > iso[1] ? iso[2] : undefined };
  }

  // "14 ноября", "с 14 по 16 ноября", "14–16 ноября", "с 30 ноября по 2 декабря"
  const range = text.match(new RegExp('(\\d{1,2})(?:\\s+' + MONTH + ')?\\s*(?:по|до|-|–|—)\\s*(\\d{1,2})\\s+' + MONTH));
  if (range) {
    const to = nearestDay(range[3], monthOf(range[4]), today), from = nearestDay(range[1], monthOf(range[2] || range[4]), today);
    if (from && to) {
      if (from.past || to.past) return { from: from.date, past: true };
      // "с 28 декабря по 3 января" read in January: the first day is the December that has just passed.
      const before = (Number(from.date.slice(0, 4)) - 1) + from.date.slice(4);
      if (to.date < from.date && before >= addDays(today, -SLIP_DAYS)) return { from: before, past: true };
      return { from: from.date, to: to.date > from.date ? to.date : undefined };
    }
  }
  const single = text.match(new RegExp('(?:^|[^\\d:.])(\\d{1,2})\\s+' + MONTH));
  if (single) {
    const day = nearestDay(single[1], monthOf(single[2]), today);
    if (day && new RegExp('(?:^|\\s)(?:до|по)\\s+' + single[1] + '\\s+' + MONTH).test(text)) return until(day);
    if (day) return day.past ? { from: day.date, past: true } : { from: day.date };
  }
  // "14.11", "с 14.11 по 16.11". A time is told apart by its minutes: "18.30" has no month 30.
  const dotted = [...text.matchAll(/(?:^|[^\d.:])(\d{1,2})\.(\d{2})(?:\.(\d{4}))?(?![\d.:])/g)].flatMap((match): NamedDay[] => {
    if (!match[3]) return [nearestDay(match[1], Number(match[2]) - 1, today)].filter(day => !!day) as NamedDay[];
    const date = match[3] + '-' + match[2] + '-' + two(Number(match[1]));
    return realDate(date) ? [{ date, past: date < today }] : [];
  });
  if (dotted.length) {
    const [first, second] = dotted;
    if (first.past) return { from: first.date, past: true };
    if (!second && /(?:^|\s)(?:до|по)\s+\d{1,2}\.\d{2}/.test(text)) return until(first);
    return { from: first.date, to: second && !second.past && second.date > first.date ? second.date : undefined };
  }

  // «На Новый год»: the night of 31 December, the nearest one.
  if (/нов[а-я]+\s+год/.test(text)) {
    const eve = today.slice(0, 4) + '-12-31';
    return { from: eve, to: addDays(eve, 1) };
  }
  if (/позавчера/.test(text)) return { from: addDays(today, -2), past: true };
  if (/вчера/.test(text)) return { from: addDays(today, -1), past: true };
  if (/послезавтра/.test(text)) return { from: addDays(today, 2) };
  if (/завтра/.test(text)) return { from: addDays(today, 1) };
  if (/сегодня|сейчас|срочно/.test(text)) return { from: today };
  const weekday = new Date(now + KZ).getUTCDay();
  if (/выходн/.test(text)) return { from: addDays(today, (6 - weekday + 7) % 7), weekend: true };
  for (const [pattern, target] of WEEKDAYS) if (pattern.test(text)) return { from: addDays(today, (target - weekday + 7) % 7) };
  return null;
}

// "9 вечера" is 21:00, "12 ночи" is midnight; the same reading for a single hour and for a range.
function clockHour(hour: number, part?: string) {
  if ((part === 'дня' || part === 'вечера') && hour < 12) return hour + 12;
  if (part === 'ночи' && hour >= 8 && hour < 12) return hour + 12;
  if ((part === 'ночи' || part === 'утра') && hour === 12) return 0;
  return hour;
}

// The start time the text names, on the half-hour grid: "в 18:30", "в 9 утра", "вечером".
// `exact` tells a named hour from a part of the day; `until` is the hour at which that part of the day is over.
type StatedTime = { time: string; exact: boolean; until: number };

function statedTime(text: string): StatedTime | null {
  const clock = text.match(/(?:^|\s)(?:в|к|с|на)\s+(\d{1,2})(?::(\d{2})|\.(00|30))(?![\d.])/);
  if (clock && Number(clock[1]) <= 23 && Number(clock[2] || clock[3]) <= 59) {
    const minutes = Math.ceil((Number(clock[1]) * 60 + Number(clock[2] || clock[3])) / 30) * 30;
    if (minutes < 1440) return { time: two(Math.floor(minutes / 60)) + ':' + two(minutes % 60), exact: true, until: 24 };
  }
  // «Послезавтра 20:00»: an hour with a colon needs no «в». «До 22:00» is the end of a stay, not its start.
  for (const match of text.matchAll(/(?:^|\s)(?:(до|по)\s+)?(\d{1,2}):(\d{2})(?![\d.:])/g)) {
    if (match[1] || Number(match[2]) > 23 || Number(match[3]) > 59) continue;
    const minutes = Math.ceil((Number(match[2]) * 60 + Number(match[3])) / 30) * 30;
    if (minutes < 1440) return { time: two(Math.floor(minutes / 60)) + ':' + two(minutes % 60), exact: true, until: 24 };
  }
  for (const match of text.matchAll(/(?:^|\s)(?:в|к|с)\s+(\d{1,2})\s*(?:(час)[а-я]*\s*)?(утра|дня|вечера|ночи)?/g)) {
    if (!match[2] && !match[3]) continue;
    const hour = clockHour(Number(match[1]), match[3]);
    if (hour <= 23) return { time: two(hour) + ':00', exact: true, until: 24 };
  }
  for (const [pattern, time, until] of PART_OF_DAY) if (pattern.test(text)) return { time, exact: false, until };
  return null;
}

// "с 18 до 21", "с 18:00 до 21:30", "с 6 до 9 вечера", "с 22 до 2": a start and a number of hours.
// "с 14 по 16 ноября" and "с 14.11 по 16.11" are dates and are left to statedDates.
const DAY_PART = '(утра|дня|вечера|ночи)';
const CLOCK = '(\\d{1,2})(?::(\\d{2})|\\.(00|30))?(?![\\d:.])(?:\\s*час[а-я]*)?(?:\\s+' + DAY_PART + ')?';
const HOURS_RANGE = new RegExp('(?:^|\\s)с\\s+' + CLOCK + '\\s+(до|по)\\s+' + CLOCK + '(?!\\s*(?:' + MONTH + '|числ))');

function statedHours(text: string): { time: string; hours: number } | null {
  const match = text.match(HOURS_RANGE);
  if (!match) return null;
  const [, h1, m1a, m1b, part1, word, h2, m2a, m2b, part2] = match;
  // "с 10 по 12" without minutes or a part of the day reads as days of the month.
  if (word === 'по' && !m1a && !m1b && !part1 && !m2a && !m2b && !part2) return null;
  let first = clockHour(Number(h1), part1);
  const last = clockHour(Number(h2), part2);
  // "с 6 до 9 вечера": the part of the day belongs to both hours.
  if (!part1 && (part2 === 'дня' || part2 === 'вечера') && first < 12 && Number(h1) <= Number(h2)) first += 12;
  const minutes1 = Number(m1a || m1b || 0), minutes2 = Number(m2a || m2b || 0);
  if (first > 23 || last > 24 || minutes1 > 59 || minutes2 > 59) return null;
  const from = first * 60 + minutes1;
  let to = last * 60 + minutes2;
  // "с 22 до 2" ends after midnight.
  if (to <= from) to += 1440;
  const start = Math.ceil(from / 30) * 30, hours = Math.ceil((to - start) / 60);
  if (start >= 1440 || hours < 1 || hours > MAX_HOURS) return null;
  return { time: two(Math.floor(start / 60)) + ':' + two(start % 60), hours };
}

// "на 3 часа", "на сутки", "на двое суток", "на неделю", "почасовая".
// A stay longer than the line searches for is cut to the longest one, and `remarks` says so.
function statedLength(text: string, remarks: string[]): { mode: 'daily' | 'hourly' | 'night' | null; units: number | null } {
  const stay = text.match(/на\s+(?:(\d{1,3}|один|одну|одни|два|две|двое|пару|три|трое|четыре|пять|шесть|семь|несколько)\s+)?(час|сутк|суток|ноч|дн|день|недел|месяц)(?![а-я]*\s+рожд)/);
  if (stay) {
    const count = Math.max(1, stay[1] ? COUNT[stay[1]] ?? Number(stay[1]) : 1);
    if (stay[2] === 'час') {
      if (count > MAX_HOURS) remarks.push(tr('Максимум {n} часа, ищу на {n}.', { n: MAX_HOURS }));
      return { mode: 'hourly', units: Math.min(count, MAX_HOURS) };
    }
    const days = stay[2] === 'недел' ? count * 7 : stay[2] === 'месяц' ? count * 30 : count;
    if (days > MAX_DAYS) remarks.push(tr('Максимум {n} суток, ищу на {n}.', { n: MAX_DAYS }));
    return { mode: stay[2] === 'ноч' ? 'night' : 'daily', units: Math.min(days, MAX_DAYS) };
  }
  if (/переночевать|ночл[её]г|до утра/.test(text)) return { mode: 'night', units: 1 };
  if (/почас/.test(text)) return { mode: 'hourly', units: null };
  if (/посуточ|сутк|суток/.test(text)) return { mode: 'daily', units: null };
  return { mode: null, units: null };
}

// "до 15000", "до 15 тысяч", "не дороже 20 000". A time, a date or a count after "до" is not money.
// `perUnit`: the amount is a price per day, night or hour ("до 15 тысяч за сутки"), not for the whole stay.
function statedBudget(text: string, banquet = false): { value: string; perUnit: boolean } | null {
  const match = text.match(/(?:^|[^а-я])(?:до|не дороже|не больше|максимум|бюджет|за)\s*(\d{1,3}(?:[ . ]\d{3})+|\d+(?:[.,]\d)?)\s*(тыс[а-я]*\.?|к(?![а-я])|млн\.?|миллион[а-я]*)?/);
  if (!match) return null;
  const times = !match[2] ? 1 : /^(?:млн|миллион)/.test(match[2]) ? 1000000 : 1000;
  // «До 1,5» without «млн» is no sum; «до 15.000» is fifteen thousand with a dot between the thousands.
  if (!match[2] && /^\d+[.,]\d$/.test(match[1])) return null;
  const rest = text.slice((match.index || 0) + match[0].length);
  // «До 8 000 за гостя», «с человека»: the price per guest of a banquet. A sum too small for a whole hall is one too.
  const each = '(?:за|с|на)\\s+(?:одного\\s+|каждого\\s+)?(?:гостя|человека|персону|чел(?![а-я]))';
  if (banquet) {
    const sum = (/^\d+[.,]\d$/.test(match[1]) ? Number(match[1].replace(',', '.')) : Number(match[1].replace(/\D/g, ''))) * times;
    if (!(sum >= 500 && sum <= Number(NO_BUDGET))) return null;
    const named = new RegExp('^\\s*(?:₸|тг|тенге)?\\s*' + each).test(rest) || new RegExp(each + '\\s+(?:до|не дороже|не больше|максимум)').test(text);
    if (!named && !match[2] && /^\s*(?:гост|человек|чел)/.test(rest)) return null;
    return { value: String(Math.round(sum)), perUnit: named || sum < 50000 };
  }
  if (!match[2] && new RegExp('^\\s*(?:[:.]\\d|час|гост|человек|чел|сут|дн|ноч|комн|утра|вечера|' + MONTH + ')').test(rest)) return null;
  const value = (/^\d+[.,]\d$/.test(match[1]) ? Number(match[1].replace(',', '.')) : Number(match[1].replace(/\D/g, ''))) * times;
  if (!(value >= 500 && value <= Number(NO_BUDGET))) return null;
  const unit = '(?:за|в)\\s+(?:сутки|ночь|день|час)';
  const perUnit = new RegExp('^\\s*(?:₸|тг|тенге)?\\s*' + unit + '(?=$|[^а-я])').test(rest) || new RegExp(unit + '\\s+(?:до|не дороже|не больше|максимум)').test(text);
  return { value: String(Math.round(value)), perUnit };
}

/**
 * The guest's free text ("квартира на 3 часа сегодня вечером в центре") as the conditions of the request form.
 * The city is found by mapSearchRequest above; the day, the time, the length of stay, guests, district, budget
 * and wishes are read here. Nothing is invented: what the text does not name keeps its current value, and
 * `stated` tells the screen what it still has to ask for. A day or an hour that has passed is reported in `past`
 * and not applied; anything else that could not be taken as written is said in `remarks`.
 */
export function guestSearchRequest(text: string, current: Row, cities: string[], now = Date.now(), options: { places?: boolean } = {}): GuestSearch {
  const request = normal(text), filters: Row = { ...current }, remarks: string[] = [];
  const stated = { city: false, district: false, when: false, guests: false, budget: false, wishes: false, home: false };
  const shared = mapSearchRequest(text, {
    city: String(current.city || ''), guests: String(current.guests || '1'), mode: String(current.mode || 'daily'),
  }, cities, now);

  if (shared.citySpecified) {
    stated.city = true;
    if (shared.filters.city !== current.city) Object.assign(filters, { city: shared.filters.city, district: '', near: null });
  } else {
    // A town the service is not in yet: said, and the nearest city is searched instead.
    const town = otherTown(request), nearest = town ? OTHER_TOWNS[town] : '';
    if (town && cities.includes(nearest)) {
      stated.city = true;
      remarks.push(tr('{town}: жилья в сервисе пока нет. Ищу в ближайшем городе — {nearest}.', { town, nearest }));
      if (nearest !== current.city) Object.assign(filters, { city: nearest, district: '', near: null });
    }
  }
  const rooms = statedRooms(request), kinds = statedKinds(request);
  // «Квартира с сауной», «дом с баней»: a home that has one, not the category «Баня» (it is named as not searched).
  if (/(?:^|[^а-я])с\s+(?:[а-я]+\s+)?(?:бан(?:ей|ькой)|сауной)(?=$|[^а-я])/.test(request) && /квартир|жиль[ея]|однушк|двушк|трешк|студи|комнат|(?:^|[^а-я])(?:дом|домик|коттедж|дач)|гостиниц|отел|хостел/.test(request)) {
    for (const id of BATH_KINDS) if (kinds.includes(id)) kinds.splice(kinds.indexOf(id), 1);
  }
  // «Баня» said alone is the whole category: a sauna with a pool answers «баня с бассейном» too. «Русская баня» and
  // «на дровах» name the one kind. «Попариться», «парная», «хаммам» name the category without a kind.
  if (kinds.includes('banya') && !kinds.includes('sauna') && kinds.every(id => BATH_KINDS.includes(id)) && !/русск|дров/.test(request)) kinds.push('sauna');
  if (!kinds.length && /(?:^|[^а-я])(?:по)?парить|хамм?ам|(?:^|[^а-я])парн(?:ая|ую|ой)(?=$|[^а-я])/.test(request)) kinds.push(...BATH_KINDS);
  if (rooms) filters.rooms = rooms;
  // A banquet is named by the hall («банкетный зал») or by what it is for («той на 100 человек», «поминки»): any hall
  // of the category, or only a «кафе» when that alone is said. The category chosen before stays for a bare phrase.
  const occasion = statedOccasion(request);
  // «Квартира на день рождения» is a home for a party, not a hall: an occasion makes a hall only when no home is named.
  const homeNamed = /квартир|жиль[ея]|однушк|двушк|трешк|студи|(?:^|[^а-я])(?:дом|домик|коттедж)(?=$|[^а-я])|гостиниц|хостел/.test(request);
  // «На Новый год» is mostly a home for the night: only a hall named makes it a banquet.
  const hall = kinds.includes('banquet') || (!!occasion && occasion !== 'newyear' && !homeNamed && !kinds.some(k => !BANQUET_KINDS.includes(k)));
  if (hall) kinds.splice(0, kinds.length, ...(kinds.includes('cafe') && !kinds.includes('banquet') ? ['cafe'] : BANQUET_KINDS));
  if (kinds.length) filters.kinds = kinds;
  const banquet = isBanquetRequest(filters.kinds || current.kinds);
  if (banquet && occasion) filters.occasion = occasion;
  // «Студия или однушка»: either of the two. A room word names a flat, so a flat joins the types; the room count
  // stays only when it is one (a studio has one room too), otherwise it would rule the studio out.
  if (rooms && kinds.length && new RegExp('(?:^|[^а-я])или(?=$|[^а-я])').test(request) && !kinds.includes('apartment')) {
    filters.kinds = [...kinds, 'apartment'];
    if (rooms !== '1') {
      filters.rooms = '';
      remarks.push(tr('Ищу любой из названных типов жилья, без числа комнат.'));
    }
  }
  if (rooms || kinds.length) stated.home = true;
  if (/(?:^|[^а-я])центр/.test(request)) {
    filters.district = 'Центр';
    stated.district = true;
  }

  const party = PARTY.find(([pattern]) => pattern.test(request))?.[1];
  // A bath or a hall is taken for a party: «баня на 6 в 20:00», «той на 150, 5 декабря». The bare number is the party
  // when a time, a day or the end of the phrase follows it; «на 3 часа» stays a length.
  const venueAsked = banquet || (filters.kinds || current.kinds || []).some((id: string) => BATH_KINDS.includes(id));
  const counted = request.match(/(?:^|\D)(\d{1,4})\s*(?:гост|человек|чел(?![а-я])|взросл|персон)/)
    || (venueAsked ? request.match(/(?:^|[^а-я])на\s+(\d{1,4})(?=\s*(?:$|,|в\s+\d|\d{1,2}\s+[а-я]|сегодня|завтра|послезавтра|вечером|днем|утром))/) : null);
  const most = banquet ? MAX_BANQUET_GUESTS : MAX_GUESTS;
  // «С ребёнком», «семья с двумя детьми»: the children come on top of the grown-ups (two when none are counted).
  const child = request.match(/(?:^|[^а-я])(?:с|и)\s+(?:(\d|двумя|двое|тремя|трое|одним)\s+)?(?:реб[еи]н[а-я]*|малыш[а-я]*|дет(?:ьми|ей|и)|дочк[а-я]*|сын[а-я]*)(?=$|[^а-я])/);
  const kids = !child ? 0 : /^\d$/.test(child[1] || '') ? Math.max(1, Number(child[1])) : ({ двумя: 2, двое: 2, тремя: 3, трое: 3 } as Record<string, number>)[child[1] || ''] || (/дет/.test(child[0]) && !child[1] ? 2 : 1);
  const adults = party ?? (counted ? Number(counted[1]) : null);
  const grown = counted && !/взросл/.test(counted[0]) && adults !== null ? adults : null; // «на 4 гостей с ребёнком»: the four are everyone
  const guests = kids && !banquet ? (grown ?? (adults ?? 2) + kids) : adults;
  if (guests !== null && guests >= 1) {
    if (guests > most) remarks.push(tr('Гостей не больше {n}, ищу на {n}.', { n: most }));
    filters.guests = String(Math.min(guests, most));
    stated.guests = true;
  }

  const budget = statedBudget(request, banquet);
  if (budget) {
    filters.maxPrice = budget.value;
    filters.perUnit = budget.perUnit;
    stated.budget = true;
  }
  if (/дешев|недорог|бюджетн|эконом/.test(request)) {
    filters.priority = 'cheaper';
    stated.wishes = true;
  }
  // A bath or a sauna is taken by the hour: «баня на вечер» is a few hours, not a day.
  const bath = (filters.kinds || current.kinds || []).length > 0 && (filters.kinds || current.kinds || []).every((k: string) => BATH_KINDS.includes(k));
  // «Без парковки», «без животных»: what follows «без» is taken off the wishes, not asked for.
  const without = [...request.matchAll(/(?:^|[^а-я])без\s+([а-яa-z -]+?)(?=$|[,.;!?]|\s+(?:с|со|но|а|зато|и\s+со?)\s)/g)].map(match => match[1]).join(' , ');
  const asked = without ? request.replace(/(?:^|[^а-я])без\s+[а-яa-z -]+?(?=$|[,.;!?]|\s+(?:с|со|но|а|зато|и\s+со?)\s)/g, ' ') : request;
  // Only what the owners of the category can mark: a bath has no balcony, a home no pool.
  const known = banquet ? [...BANQUET_WISHES, ...WISHES.filter(([, id]) => ['parking', 'aircon', 'wifi'].includes(id))]
    : bath ? [...BATH_WISHES, ...WISHES.filter(([, id]) => ['wifi', 'kitchen', 'tv', 'parking'].includes(id))]
    : [...WISHES, ...RULES];
  const wishes = known.filter(([pattern]) => pattern.test(asked)).map(([, id]) => id);
  // «Без депозита», «без залога»: a home whose owner asks for none.
  if (!bath && !banquet && /(?:^|[^а-я])без\s+(?:депозит|залог)/.test(request)) wishes.push('nodeposit');
  const dropped = without ? known.filter(([pattern]) => pattern.test(without)).map(([, id]) => id) : [];
  if (wishes.length || dropped.length) {
    filters.features = [...new Set([...(Array.isArray(current.features) ? current.features : []), ...wishes])].filter(id => !dropped.includes(id) || wishes.includes(id));
    stated.wishes = true;
  }

  // «Первый этаж», «не выше 3 этажа»: the highest floor a home may be on.
  // «Не на первом этаже» is not a cap: it is left unsearched and said so (the word «этаж» stays in the note).
  const floor = bath || banquet || /(?:^|[^а-я])не\s+(?:на\s+)?(?:перв(?:ый|ом)|1-?(?:й|м|ом))\s+этаж/.test(request) ? 0 : /(?:^|[^а-я])(?:перв(?:ый|ом)|1-?(?:й|м|ом))\s+этаж/.test(request) ? 1
    : Number(request.match(/(?:не\s+выше|до|максимум|не\s+выше\s+чем)\s+(\d{1,2})(?:-?(?:го|й|ого))?\s+этаж/)?.[1] || 0);
  if (floor >= 1) {
    filters.maxFloor = floor;
    stated.wishes = true;
  }

  // «Сейчас»: the nearest half-hour that leaves 15 minutes, the time the check-in window opens.
  const urgent = /сейчас|срочно/.test(request), lead = urgent ? 15 : 30, soon = nextSlot(now, lead), today = kzToday(now);
  const dates = statedDates(request, now), hours = statedHours(request);
  const said = hours ? { mode: 'hourly' as const, units: hours.hours } : statedLength(request, remarks);
  const clock: StatedTime | null = hours ? { time: hours.time, exact: true, until: 24 } : statedTime(request);
  const time = urgent ? localISO(soon).slice(11) : clock?.time || null;
  const kept = current.mode === 'hourly' || current.mode === 'night' ? current.mode : 'daily';
  // «Баня на сутки» or «на ночь» is still by the hour, and the guest is told: days are not read as hours.
  const daysOfBath = bath && ((!!said.mode && said.mode !== 'hourly') || /ночевк|переночев/.test(request));
  if (daysOfBath) remarks.push(tr('Баню бронируют по часам, ищу на 3 часа.'));
  const length = daysOfBath ? { mode: 'hourly' as const, units: null } : said;
  const mode: 'daily' | 'hourly' | 'night' = banquet ? 'daily' : length.mode ?? (bath ? 'hourly' : dates?.to || dates?.weekend ? (kept === 'night' ? 'night' : 'daily') : kept);
  if (urgent) filters.now = true;
  if (mode !== current.mode) filters.mode = mode;

  // Whether the hour the text names is still ahead today: a named hour until it strikes,
  // a part of the day ("вечером") until that part is over.
  const ahead = !clock || urgent
    || (clock.exact ? localTime(today + 'T' + clock.time) >= now : localTime(today + 'T00:00') + clock.until * HOUR > now);
  let past = dates?.past ? 'date' as const : !banquet && dates?.from === today && !ahead ? 'time' as const : undefined;

  if (banquet) {
    // A banquet is a slot of one day: «обед» 12:00–17:00 or «вечер» 18:00–00:00. A named hour picks the slot; no slot
    // named keeps the one chosen before, a memorial meal is at lunch, anything else in the evening.
    const was = isBanquetRequest(current.kinds) && current.mode === 'daily' && current.start ? { date: String(current.start).slice(0, 10), slot: banquetSlot(current.start) } : null;
    const first = defaultBanquet(now, occasion || String(current.occasion || ''));
    const said: BanquetSlot | null = /обед|днем|дневн/.test(request) ? 'lunch' : /вечер|ужин/.test(request) ? 'evening' : clock ? (clock.time < '17:00' ? 'lunch' : 'evening') : null;
    let slot: BanquetSlot = said || (occasion === 'memorial' ? 'lunch' : was?.slot || banquetSlot(first.start));
    const day = dates && !dates.past ? dates.from : was && was.date >= today ? was.date : first.start.slice(0, 10);
    if (!past) {
      if (dates || said) stated.when = true;
      if (day === today && localTime(banquetStay(day, slot).start) < soon) {
        if (slot === 'lunch' && localTime(banquetStay(day, 'evening').start) >= soon) { slot = 'evening'; remarks.push(tr('Обед сегодня уже начался, ищу на вечер.')); }
        else past = 'time';
      }
    }
    Object.assign(filters, past ? first : banquetStay(day, slot));
  } else if (past) {
    // Nothing is searched for a day or an hour that is behind: the screen asks for the date. A tariff the text
    // changed still opens with a stay of its own kind, so the fields do not show hours as days.
    if (mode !== current.mode) Object.assign(filters, defaultStay(mode, now, length.units ?? 3));
  } else if (dates || time || length.units !== null) {
    stated.when = true;
    // An hour that is behind today, named without a day, is tomorrow's, and the guest is told so.
    const day = dates?.from || (ahead ? today : addDays(today, 1));
    if (!dates && !ahead && clock) remarks.push(clock.exact ? tr('Сегодня {time} уже прошло, ищу на завтра.', { time: clock.time }) : tr('Сегодня это время уже прошло, ищу на завтра.'));
    // A named hour closer than the nearest half-hour that can still be taken starts at that half-hour.
    if (!urgent && clock?.exact && day === today && localTime(today + 'T' + clock.time) < soon) {
      remarks.push(tr('Ближайшее время — {time}.', { time: localISO(soon).slice(11) }));
    }
    if (mode === 'hourly') {
      const kept = current.mode === 'hourly' && current.start && current.end ? clamp(stayHours(current.start, current.end), 1, MAX_HOURS) : 3;
      // Today without a named hour starts at the nearest half-hour; another day without one, at 14:00.
      // A bath on another day without an hour is an evening, as the chip «Вечером» is.
      const wanted = day === today && !time ? soon : localTime(day + 'T' + (time || (bath ? BATH_EVENING : CHECKIN_TIME)));
      const from = localISO(Math.max(wanted, soon));
      Object.assign(filters, hourlyStay(from.slice(0, 10), from.slice(11), length.units ?? kept));
    } else {
      const byDates = length.units === null && !!dates?.to, checkout = byDates ? dates!.to! : addDays(day, length.units ?? 1);
      Object.assign(filters, dailyStay(day, checkout, now, time || undefined, lead, !byDates));
    }
  } else if (bath && mode !== current.mode) {
    // «Баня» with no hour named: the nearest three hours, as the chip «На часы» does.
    Object.assign(filters, defaultStay('hourly', now, 3));
  }

  // «Хочу снять квартиру», «нужно жильё», «посуточно»: a request with nothing to narrow it is still a request.
  const plain = /квартир|жиль[ея]|(?:^|[^а-я])(?:снять|сниму|снимем|арендовать|арендую)(?=$|[^а-я])|где\s+(?:остановиться|переночевать|пожить)/.test(request) || length.mode !== null;
  const nearby = /(?:рядом|около|возле|недалеко)\s+(?:со?\s+|от\s+)?(?:мной|меня)|поблизости|(?:^|\s)рядом(?=$|[.,!?]|\s+(?!с\s|со\s|от\s))/.test(request);
  const place = nearby ? '' : statedPlace(request);
  const understood = nearby || plain || !!place || !!past || remarks.length > 0 || filters.mode !== current.mode || Object.values(stated).some(Boolean);
  // Said after `understood` is settled: a phrase of nothing but such words is not a request the rules can run.
  // A caller that does not find landmarks on the map (options.places) still tells the guest so.
  const read = [...(Array.isArray(filters.features) ? filters.features : []).flatMap((id: string) => READ_WORDS[id] || []), ...(filters.maxFloor ? ['этаж'] : [])];
  const missed = [...unsearched(request, bath || banquet, read), ...(place && !options.places ? ['место рядом с ориентиром'] : [])];
  if (missed.length) remarks.push(tr('Пока не умею искать: {v}.', { v: missed.join(', ') }));
  return { filters, stated, nearby, ...(place ? { place } : {}), understood, ...(past ? { past } : {}), remarks };
}
