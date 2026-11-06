type Filters=Record<string,string>;
export function mapSearchFilters(input:Record<string,unknown>){
 const filters:Filters={city:'',guests:'1',mode:'daily',page:'1'};
 for(const key of ['city','guests','rooms','roomsExact','minPrice','maxPrice','mode','sort','start','end'])if(typeof input[key]==='string'&&input[key].length<=120&&input[key]!=='')filters[key]=input[key];
 return filters;
}
const normal=(text:string)=>text.toLocaleLowerCase('ru').replace(/ё/g,'е');
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
