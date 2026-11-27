// «Заголовок объявления» (2026-11-27): every listing a guest sees reads alike — «2-комнатная · у набережной».
// The start comes from the fields (the type, and the rooms of a flat), the owner writes only what sets the place
// apart: a place nearby, a street or a view. A bath, a hotel or a hall writes its name instead: «Баня «Арасан»».
// What the owner typed is tidied by rules, never by the model: shouting capitals, «!!!», emoji, contacts, the type
// said again and the district (it is on the line under the title already) go away, and the rest is cut short.
// The same rules run in the app while the owner types, on the server when the listing is saved, and once over the
// listings saved before (scripts/listing-titles.mjs), so the guest's list reads in one format.
type Place={district?:string;city?:string};
// The start of the title, in Russian like the rest of what owners write.
const HEADS:Record<string,string>={studio:'Студия',room:'Комната',house:'Дом',guesthouse:'Гостевой дом',hostel:'Хостел',hotel:'Гостиница',aparthotel:'Апарт-отель',resort:'База отдыха',banya:'Баня',sauna:'Сауна',banquet:'Банкетный зал',cafe:'Кафе'};
// The kinds a guest knows by their name.
export const NAMED_KINDS=['guesthouse','hostel','hotel','aparthotel','resort','banya','sauna','banquet','cafe'];
export const isNamedKind=(type?:string)=>NAMED_KINDS.includes(type||'');
// How long the owner's part may be: what fits the list next to the price.
export const TITLE_TAIL_MAX=28;
export function titleHead(type?:string,rooms?:number){
 if(type==='apartment'||!type)return Math.max(1,Math.round(Number(rooms)||1))+'-комнатная';
 return HEADS[type]||'Жильё';
}
// A flat said again, in any of the ways owners say it; the type's own word; the words that only shout.
const FLAT=/\d+\s*-?\s*(?:х\s*)?-?\s*комн\.?(?:атн\p{L}*)?|(?:одно|одна|двух|двух-|трёх|трех|четырёх|четырех|пяти|много)\s*-?\s*комнатн\p{L}*|однушк\p{L}*|двушк\p{L}*|тр[её]шк\p{L}*|квартир\p{L}*|кв\.|апартамент\p{L}*|гостев\p{L}*\s+дом\p{L}*|банкетн\p{L}*\s+зал\p{L}*|апарт\s*-?\s*отел\p{L}*|баз\p{L}*\s+отдыха/giu;
const OWN:Record<string,RegExp>={studio:/студи\p{L}*/giu,room:/(?<!\p{L})комнат[аыуе]?(?!\p{L})/giu,house:/(?<!\p{L})дом(?:ик)?(?!\p{L})/giu,hostel:/хостел\p{L}*/giu,hotel:/гостиниц\p{L}*|(?<!\p{L})отел\p{L}*/giu,banya:/(?<!\p{L})бан(?:я|и|ю|е|ька|ьку)(?!\p{L})/giu,sauna:/саун\p{L}*/giu,banquet:/(?<!\p{L})зал(?!\p{L})/giu,cafe:/(?<!\p{L})кафе(?!\p{L})/giu};
const HYPE=/(?<!\p{L})(?:супер|шикарн\p{L}*|топ|лучш\p{L}*|недорого|дёшево|дешево|срочно|акция|скидк\p{L}*)(?!\p{L})/giu;
const CONTACTS=/https?:\/\/\S*|www\.\S*|\S+\.(?:kz|ru|com)\S*|t\.me\/\S*|wa\.me\/\S*|@[\p{L}\d_.]{3,}|\+?\d[\d\s\-().]{6,}\d/giu;
const EMOJI=/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}️‍⃣]/gu;
// The words a title may start with in lower case: «у набережной», «с баней», «вид на Иртыш».
const SOFT=/^(?:у|в|во|на|возле|около|рядом|напротив|с|со|для|за|под|над|недалеко|близко|между|при|от|до|по|вид|видом|новостройк\p{L}*|свеж\p{L}*|уютн\p{L}*|просторн\p{L}*|светл\p{L}*|т[её]пл\p{L}*|русск\p{L}*|финск\p{L}*|турецк\p{L}*|больш\p{L}*|мал\p{L}*|нов\p{L}*|тих\p{L}*|семейн\p{L}*|центр)$/iu;
const QUOTED=/[«"„“]([^«»"„“”]{1,40})[»"“”]/u;
const lowerShout=(s:string)=>s.replace(/[\p{Lu}]{5,}/gu,w=>w.toLocaleLowerCase('ru'));
const cap=(s:string)=>s.charAt(0).toLocaleUpperCase('ru')+s.slice(1);
const tidy=(s:string)=>s.replace(/\s+/g,' ').replace(/\s+([,.;:!?)»])/g,'$1').replace(/([(«])\s+/g,'$1').replace(/(?:^[\s.,;:!?·\-–—|/+*()]+)|(?:[\s.,;:!?·\-–—|/+*(]+$)/g,'').trim();
// Cut at a word, never in the middle of one.
function short(s:string,max:number){if(s.length<=max)return s;const cut=s.slice(0,max+1);const at=cut.lastIndexOf(' ');return tidy(at>max/2?cut.slice(0,at):s.slice(0,max));}
function clean(text:string,type?:string){
 let s=lowerShout(String(text||'')).replace(CONTACTS,' ').replace(EMOJI,' ').replace(/[!?]{2,}/g,' ').replace(/[!]/g,' ');
 s=s.replace(FLAT,' ').replace(HYPE,' ');const own=OWN[type||''];if(own)s=s.replace(own,' ');
 // Dangling joiners the removed words leave: «в · с баней», «, и у парка».
 s=tidy(s.replace(/\s*·\s*/g,' ').replace(/(?:^|\s)[,;]+/g,' ')).replace(/^(?:и|а|,)\s+/iu,'');
 return tidy(s);
}
// The owner's part as it will be shown: a name in «», a place-word in lower case, without the district again.
export function titleParts(raw:string,type?:string,place:Place={}){
 const text=String(raw||'');let name='',rest=text;
 // «Сауна · у реки»: what comes after the dot is a place-word, not a name.
 const dotted=/^\s*·/.test(text);
 const quoted=QUOTED.exec(text);
 if(quoted&&isNamedKind(type)){name=tidy(lowerShout(quoted[1]).replace(CONTACTS,' ').replace(EMOJI,' '));rest=text.replace(quoted[0],' ');}
 let tail=clean(rest,type);
 if(isNamedKind(type)&&!name&&tail&&!dotted){const first=tail.split(' ')[0];if(!SOFT.test(first)&&!/^[\p{Ll}]/u.test(first)){name=tail;tail='';}}
 if(tail){const first=tail.split(' ')[0];if(SOFT.test(first))tail=tail.charAt(0).toLocaleLowerCase('ru')+tail.slice(1);}
 const same=(a?:string)=>!!a&&tail.toLocaleLowerCase('ru')===String(a).trim().toLocaleLowerCase('ru');
 if(same(place.district)||same(place.city))tail='';
 const sameName=(a?:string)=>!!a&&name.toLocaleLowerCase('ru')===String(a).trim().toLocaleLowerCase('ru');
 if(sameName(place.district)||sameName(place.city))name='';
 return {name:name?short(cap(name),TITLE_TAIL_MAX):'',tail:short(tail,TITLE_TAIL_MAX)};
}
// Any start a title may have, also of another type or another number of rooms: the type may have changed since.
const ANY_HEAD=new RegExp('^\\s*(?:\\d+-комнатная|'+Object.values(HEADS).sort((a,b)=>b.length-a.length).join('|')+')(?!\\p{L})','iu');
// The title without its start; «· » stays in front when a dot followed it, so a place-word is not taken for a name.
export function titleRest(title:string){
 const s=String(title||''),m=ANY_HEAD.exec(s);if(!m)return s.trim();
 const rest=s.slice(m[0].length);return (/^\s*·/.test(rest)?'· ':'')+rest.replace(/^\s*·?\s*/,'');
}
// The title already says the type (and the rooms of a flat): the line under it does not say them again.
export const titleSaysKind=(title?:string)=>ANY_HEAD.test(String(title||''));
export const titleSaysRooms=(title?:string)=>/^\s*\d+-комнатная/.test(String(title||''));
// What the owner wrote after the start, for the field: only the front is cut, so the space being typed stays.
export const titleInput=(title:string)=>titleRest(title).replace(/^·\s*/,'');
// The title as typed: the start, then a place-word after a dot; a named kind takes a space, so its name stays a name.
export function joinTitle(value:string,type?:string,rooms?:number){const v=value.replace(/^\s+/,'');return titleHead(type,rooms)+(v.trim()?(isNamedKind(type)?' ':' · ')+v:'');}
// The whole title from the fields and the owner's words.
export function formatTitle(raw:string,type?:string,rooms?:number,place:Place={}){
 const head=titleHead(type,rooms),{name,tail}=titleParts(titleRest(raw),type,place);
 return (head+(name?' «'+name+'»':'')+(tail?' · '+tail:'')).slice(0,120);
}
// The example the field shows while it is empty; it goes away with the first letter.
export function titleExample(type?:string){
 if(isNamedKind(type))return type==='banya'||type==='sauna'?'«Арасан»':type==='banquet'||type==='cafe'?'«Мерей»':'«Ертіс»';
 return ({studio:'возле ТРЦ «Батыр Молл»',room:'у вокзала',house:'с баней и двором'} as Record<string,string>)[type||'']||'у набережной';
}
