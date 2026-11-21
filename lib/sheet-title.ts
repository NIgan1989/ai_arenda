import {t,L} from './i18n';
// What a sheet over the map is called, on the site and in the app. The bottom bar used to name the page;
// now the head of the sheet does. `fallback` is the section's own title for the sections not renamed here.
const titles:Record<string,string>=L({account:'Меню',chats:'Чаты',bookings:'Мои брони',properties:'Моё жильё',assignments:'Мои задания',jobs:'Задания рядом'});
// `venues`: the owner also has a bath or a hall, so the list is not only «жильё».
export function sheetName(role:string,section:string,fallback='',venues=false){
 if(role==='owner'&&section==='bookings')return t('Заявки');
 if(section==='properties'&&venues)return t('Мои объекты');
 return titles[section]||fallback;
}
