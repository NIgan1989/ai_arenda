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

const fill=(text:string,vars?:Record<string,unknown>)=>vars?text.replace(/\{(\w+)\}/g,(whole,k)=>k in vars?String(vars[k]??''):whole):text;
/** The text in the language `l`. */
export function tIn(l:Lang,ru:string,vars?:Record<string,unknown>):string{
  const row=l==='ru'?undefined:WORDS[ru];
  return fill(row?row[COLUMN[l as 'kk'|'en']]:ru,vars);
}
/** The text in the current language. */
export function t(ru:string,vars?:Record<string,unknown>):string{return tIn(current,ru,vars);}

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
