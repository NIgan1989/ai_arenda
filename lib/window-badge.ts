// What a guest sees on a flat with an open calendar window: «Окно до 20:00 · −20%».
// Pure, shared by the site and the app.
export function windowBadge(w:{percent?:number;end?:number}|null|undefined){
 if(!w||!w.percent||!w.end)return '';
 return 'Окно до '+new Date(w.end*1000).toLocaleTimeString('ru-RU',{timeZone:'Asia/Almaty',hour:'2-digit',minute:'2-digit'})+' · −'+w.percent+'%';
}
