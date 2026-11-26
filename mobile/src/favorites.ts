import {t} from '../../lib/i18n';
import type {Row} from './model';

// «Избранное» and «Снова туда же»: the homes the guest marked with a heart and the homes of the guest's finished
// stays (the server sends both in the guest's state). They come first in what the search found.
export type Mine={favorites:string[];stayed:string[]};
export type Mark='favorite'|'stayed'|'';

const ids=(value:unknown):string[]=>Array.isArray(value)?value.filter((id):id is string=>typeof id==='string'):[];
export const mineOf=(data:Row|null|undefined):Mine=>({favorites:ids(data?.favorites),stayed:ids(data?.stayed)});
export const markOf=(id:string,mine:Mine):Mark=>mine.favorites.includes(id)?'favorite':mine.stayed.includes(id)?'stayed':'';
// venue: в бане и зале бывают, а не живут.
// A favourite says nothing in the line: the filled heart on the card already says it (board «Экраны старой версии»).
export const markLabel=(mark:Mark,venue=false)=>mark==='favorite'?'':mark==='stayed'?(venue?t('Вы здесь были'):t('Вы здесь жили')):'';

/** Favourites, then homes of earlier stays, each in the order the search gave; the rest keep their order. */
export function favouredFirst<T extends {id:string}>(list:T[],mine:Mine):T[]{
 const rank=(p:T)=>({favorite:0,stayed:1,'':2})[markOf(p.id,mine)];
 return list.map((p,i)=>({p,i})).sort((a,b)=>rank(a.p)-rank(b.p)||a.i-b.i).map(v=>v.p);
}

/** «Снова туда же»: the guest's own homes that are still in the catalogue, favourites first, each once. */
export function againList(properties:Row[],mine:Mine,limit=6):Row[]{
 const seen=new Set<string>();
 return [...mine.favorites,...mine.stayed].flatMap(id=>{if(seen.has(id))return [];seen.add(id);const p=properties.find(x=>x.id===id);return p?[p]:[];}).slice(0,limit);
}

/** The heart was tapped: the list as it will be once the server agrees. */
export const toggled=(mine:Mine,id:string,on:boolean):Mine=>({...mine,favorites:on?[id,...mine.favorites.filter(x=>x!==id)]:mine.favorites.filter(x=>x!==id)});
