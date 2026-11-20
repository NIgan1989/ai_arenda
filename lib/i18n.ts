// Languages of the app: Russian, Kazakh and English (since 2026-11-20).
//
// The Russian text is the key. A screen writes t('Войти'); in Kazakh and English the words come from the tables in
// lib/i18n-*.ts, and a line that has no translation yet stays Russian. So a screen can be translated a piece at a time
// and nothing breaks when a new Russian line appears.
//
// Variable parts go in braces: t('Осталось {n} мин', {n}). The tables keep the same braces, in the place the
// language needs them.
//
// One language at a time for the whole process: the app sets it (mobile/src/lang.ts). The site and the server do
// not call setLang, so for them everything stays Russian. The server, when it speaks to one person, passes the
// language explicitly: tIn('kk', '…').
import {WORDS} from './i18n-words';

export type Lang='ru'|'kk'|'en';
export const LANGS:readonly {id:Lang;title:string}[]=[{id:'kk',title:'Қазақша'},{id:'ru',title:'Русский'},{id:'en',title:'English'}];
const COLUMN={kk:0,en:1} as const;
// Dates and numbers are written the way each language writes them.
export const LOCALE:Record<Lang,string>={ru:'ru-RU',kk:'kk-KZ',en:'en-GB'};

let current:Lang='ru';
const listeners=new Set<(lang:Lang)=>void>();
export const lang=()=>current;
export const isLang=(v:unknown):v is Lang=>v==='ru'||v==='kk'||v==='en';
export function setLang(next:Lang){
  if(!isLang(next)||next===current)return;
  current=next;
  for(const fn of [...listeners])fn(next);
}
/** Calls `fn` on every change of the language; returns the way to stop. */
export function onLang(fn:(lang:Lang)=>void){listeners.add(fn);return ()=>{listeners.delete(fn);};}

/** The language a phone set to `tag` (kk-KZ, ru-RU, en-US…) gets the first time. Kazakh for Kazakh; Russian for
 *  Russian and the languages of the region where Russian is the common one; English for the rest of the world. */
export function langOf(tag:string|null|undefined):Lang{
  const base=String(tag||'').toLowerCase().split(/[-_]/)[0];
  if(base==='kk')return 'kk';
  if(['ru','uk','be','uz','ky','tg','tk','az','hy','ka','mn'].includes(base))return 'ru';
  return base?'en':'ru';
}

// A Kazakh ending follows the last sound of the word and its vowels: кіру → кіруді, шығу → шығуды, қонақ → қонақты.
const KK_ENDINGS:Record<string,Record<string,readonly [back:string,front:string]>>={
  // v after a vowel, s after р л й у и ю, n after м н ң, z after ж з, t after the voiceless and б в г д
  acc:{v:['ны','ні'],s:['ды','ді'],n:['ды','ді'],z:['ды','ді'],t:['ты','ті']},
  dat:{v:['ға','ге'],s:['ға','ге'],n:['ға','ге'],z:['ға','ге'],t:['қа','ке']},
  gen:{v:['ның','нің'],s:['дың','дің'],n:['ның','нің'],z:['дың','дің'],t:['тың','тің']},
  abl:{v:['дан','ден'],s:['дан','ден'],n:['нан','нен'],z:['дан','ден'],t:['тан','тен']},
  loc:{v:['да','де'],s:['да','де'],n:['да','де'],z:['да','де'],t:['та','те']},
  // «its»: кіруі, келуі, басталуы. Made for the names of actions on -у; a final қ, к or п of other words is not softened.
  poss:{v:['сы','сі'],s:['ы','і'],n:['ы','і'],z:['ы','і'],t:['ы','і']},
  ins:{v:['мен','мен'],s:['мен','мен'],n:['мен','мен'],z:['бен','бен'],t:['пен','пен']},
};
/** The Kazakh word with the ending of a case: kkCase('шығу','acc') is «шығуды». */
export function kkCase(word:string,ending:string):string{
  const table=KK_ENDINGS[ending],stem=word.toLowerCase().replace(/[ьъ]+$/,''),last=stem.slice(-1);
  if(!table||!/[а-яәғқңөұүһіё]/.test(last))return word;
  const sound='аәеёоөұүыіэя'.includes(last)?'v':'рлйуию'.includes(last)?'s':'мнң'.includes(last)?'n':'жз'.includes(last)?'z':'t';
  // The last vowel decides between the hard and the soft ending; у and ю take the side of the vowel before them,
  // и is soft (депозитті, тарифті). A final ь changes nothing: бронь goes with брондар and брондау (броньды, броньға).
  const vowel=(stem.match(/[аоұыяёәөүіеэи](?=[^аоұыяёәөүіеэи]*$)/)||[''])[0],front=vowel!==''&&'әөүіеэи'.includes(vowel);
  return word+table[sound][front?1:0];
}
// {name} is the value; a translation may ask for its form: {name:cap} with a capital letter, {name:low} without,
// and in Kazakh {name:acc}, {name:dat}, {name:gen}, {name:abl}, {name:loc}, {name:ins} with the ending of the case.
const shape=(value:string,how:string)=>how==='cap'?value.charAt(0).toUpperCase()+value.slice(1):how==='low'?value.charAt(0).toLowerCase()+value.slice(1):kkCase(value,how);
const fill=(text:string,vars?:Record<string,unknown>)=>vars?text.replace(/\{(\w+)((?::\w+)*)\}/g,(whole,k,how:string)=>k in vars?how.split(':').filter(Boolean).reduce(shape,String(vars[k]??'')):whole):text;
/** The text in the language `l`. */
export function tIn(l:Lang,ru:string,vars?:Record<string,unknown>):string{
  const row=l==='ru'?undefined:WORDS[ru];
  return fill(row?row[COLUMN[l as 'kk'|'en']]:ru,vars);
}
/** The text in the current language. */
export function t(ru:string,vars?:Record<string,unknown>):string{return tIn(current,ru,vars);}
/** A line the server wrote in Russian with numbers inside: «срывов: 2» is found in the tables as «срывов: {n}»
 *  (a second number is {n2}). The server speaks Russian to everybody until it learns the language of the person. */
export function tLine(ru:string):string{
  if(current==='ru'||WORDS[ru])return t(ru);
  const vars:Record<string,string>={};let count=0;
  const key=ru.replace(/\d+(?:[.,]\d+)?/g,v=>{const name=count++?'n'+count:'n';vars[name]=current==='en'?v.replace(',','.'):v;return '{'+name+'}';});
  return WORDS[key]?t(key,vars):ru;
}

/** A word after a number. Russian has three forms (1 гость, 2 гостя, 5 гостей), English two, Kazakh one
 *  (the noun after a number does not change: 5 қонақ). */
export function plural(n:number,ru:readonly [string,string,string],en:readonly [string,string],kk:string):string{
  if(current==='kk')return kk;
  if(current==='en')return Math.abs(n)===1?en[0]:en[1];
  const a=Math.abs(n)%100,b=a%10;
  return a>10&&a<20?ru[2]:b===1?ru[0]:b>1&&b<5?ru[1]:ru[2];
}

/** A table of names made once, at the start (the names of roles, the options of a choice), read in the current
 *  language at the moment it is read. Every string inside is passed through t(); keys are left as they are. */
export function L<T extends object>(table:T):T{
  return new Proxy(table,{get(target,key,receiver){
    const v=Reflect.get(target,key,receiver);
    return typeof v==='string'?t(v):v&&typeof v==='object'?L(v):v;
  }});
}

/** A sentence with pieces that are drawn differently (links): t() of `ru`, cut at its {slots}. Each language keeps
 *  the slots where its word order needs them; the screen draws a slot by its name. */
export function tParts(ru:string):(string|{slot:string})[]{
  return t(ru).split(/(\{\w+\})/).filter(Boolean).map(p=>/^\{\w+\}$/.test(p)?{slot:p.slice(1,-1)}:p);
}

/** A word after a number, given as its three Russian forms: forms(n, 'гость', 'гостя', 'гостей'). In Russian the form
 *  by the Russian rule; in English the translation of the first form for one and of the third for many; in Kazakh the
 *  translation of the first (a noun after a number does not change). The tables translate the first and the third. */
export function forms(n:number,one:string,few:string,many:string):string{
  if(current==='ru'){const a=Math.abs(n)%100,b=a%10;return a>10&&a<20?many:b===1?one:b>1&&b<5?few:many;}
  if(current==='kk')return t(one);
  return Math.abs(n)===1?t(one):t(many);
}

// A phone or a browser may have no Kazakh names of months and days: it then writes «M11 20» for 20 November.
// On such a device the date is written by the Russian rules and its names are replaced by the Kazakh ones.
const KK_MONTHS=['қаңтар','ақпан','наурыз','сәуір','мамыр','маусым','шілде','тамыз','қыркүйек','қазан','қараша','желтоқсан'];
const RU_MONTH_STEMS=['янв','фев','мар','апр','ма','июн','июл','авг','сен','окт','ноя','дек'];
const KK_DAYS:Record<string,string>={вс:'жс',пн:'дс',вт:'сс',ср:'ср',чт:'бс',пт:'жм',сб:'сб',воскресенье:'жексенбі',понедельник:'дүйсенбі',вторник:'сейсенбі',среда:'сәрсенбі',четверг:'бейсенбі',пятница:'жұма',суббота:'сенбі',г:'ж'};
let kkDates:boolean|undefined;
const kkDatesWork=()=>kkDates??=(()=>{try{return /[а-яәғқңөұүһі]{3}/i.test(new Intl.DateTimeFormat(LOCALE.kk,{month:'long',timeZone:'UTC'}).format(Date.UTC(2026,10,20)));}catch{return false;}})();
/** A Russian date with the Kazakh names: «20 нояб., пт» is «20 қар., жм». */
export const kkDateNames=(text:string)=>text.replace(/[а-яё]+\.?/gi,word=>{
  const dot=word.endsWith('.'),w=word.toLowerCase().replace('.',''),day=KK_DAYS[w];
  if(day)return day+(dot?'.':'');
  const month=w==='май'||w==='мая'?4:RU_MONTH_STEMS.findIndex((stem,i)=>i!==4&&w.startsWith(stem));
  return month<0?word:dot?KK_MONTHS[month].slice(0,3)+'.':KK_MONTHS[month];
});
const kkByHand=()=>current==='kk'&&!kkDatesWork();
/** A date in the words of the current language: dateText(date, {day:'numeric', month:'long'}). */
export function dateText(date:Date|number,options:Intl.DateTimeFormatOptions):string{
  return kkByHand()?kkDateNames(new Intl.DateTimeFormat(LOCALE.ru,options).format(date)):new Intl.DateTimeFormat(LOCALE[current],options).format(date);
}
/** The locale of dates in the current language, for a place where only numbers are written. Dates with the names of
 *  months and days go through dateText: it knows what to do on a phone without the Kazakh names. */
export const dateLocale=()=>kkByHand()?LOCALE.ru:LOCALE[current];
/** A date format that follows the language: dateFormat(options).format(date). One Intl object per language. */
export function dateFormat(options:Intl.DateTimeFormatOptions){
  const made:Partial<Record<string,Intl.DateTimeFormat>>={};
  return {format:(date:Date|number)=>{const text=(made[dateLocale()]||=new Intl.DateTimeFormat(dateLocale(),options)).format(date);return kkByHand()?kkDateNames(text):text;}};
}
