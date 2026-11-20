import {dateText,t} from './i18n';
// What a guest sees on a flat with an open calendar window: «Окно до 20:00 · −20%».
// Pure, shared by the site and the app.
export function windowBadge(w:{percent?:number;end?:number}|null|undefined){
 if(!w||!w.percent||!w.end)return '';
 return t('Окно до {v} · −{percent}%',{v:dateText(new Date(w.end*1000),{timeZone:'Asia/Almaty',hour:'2-digit',minute:'2-digit'}),percent:w.percent});
}
