// What a sheet over the map is called, on the site and in the app. The bottom bar used to name the page;
// now the head of the sheet does. `fallback` is the section's own title for the sections not renamed here.
const titles:Record<string,string>={account:'Меню',chats:'Чаты',bookings:'Мои брони',properties:'Моё жильё',assignments:'Мои задания',jobs:'Задания рядом'};
export function sheetName(role:string,section:string,fallback=''){
 if(role==='owner'&&section==='bookings')return 'Заявки';
 return titles[section]||fallback;
}
