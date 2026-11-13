// Texts of a listing-quality tip, shared by the server and the cards (no database code here).
import {amenities} from './listings';
const plural=(n:number,one:string,few:string,many:string)=>{const a=n%10,b=n%100;return n+' '+(a===1&&b!==11?one:a>=2&&a<=4&&(b<10||b>=20)?few:many);};
export const money=(n:number)=>new Intl.NumberFormat('ru-RU').format(n)+' ₸';

// The words of a tip: one sentence about the others, one about what to do.
export function tipText(t:{kind:string;subject:string;mine:number;theirs:number;count:number;leaders:number;value:number}){
 const who='У '+t.count+' из '+t.leaders+' похожих объектов, которые бронируют чаще,';
 if(t.kind==='photos')return {title:'Добавьте фото',text:'Похожие объекты, которые бронируют чаще, показывают в среднем '+plural(t.theirs,'фото','фото','фото')+', у вас '+t.mine+'. Добавьте кухню, санузел и вид из окна.',accept:'Добавить фото',reject:'Не сейчас'};
 if(t.kind==='amenity'){const name=(amenities[t.subject]||t.subject).toLocaleLowerCase('ru');return {title:'Отметьте удобство',text:who+' отмечено «'+name+'». Если у вас тоже есть, отметьте: гости ищут по удобствам.',accept:'Да, есть',reject:'Нет'};}
 if(t.kind==='hourly')return {title:'Сдавайте и почасово',text:who+' есть почасовая цена. Для вашего жилья подойдёт '+money(t.value)+' в час.',accept:'Сдавать за '+money(t.value)+'/ч',reject:'Не нужно'};
 if(t.kind==='checkin')return {title:'Заселение без встречи',text:who+' гости заселяются сами: сейф для ключей или умный замок. Так можно бронировать и поздно вечером.',accept:'Изменить заезд',reject:'Не сейчас'};
 return {title:'Допишите описание',text:'У похожих объектов, которые бронируют чаще, описание около '+plural(t.theirs,'знака','знаков','знаков')+', у вас '+t.mine+'. Расскажите про район, кровати и что рядом.',accept:'Дописать',reject:'Не сейчас'};
}
// Steps of the listing editor that a tip opens.
export const tipStep=(kind:string)=>kind==='photos'?'photos':kind==='checkin'?'checkin':kind==='text'?'text':null;

