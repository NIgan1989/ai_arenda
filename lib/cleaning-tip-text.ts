// The words of the cleaning price tip. Pure, shared by the server (notification, card) and the screens.
export const money=(n:number)=>new Intl.NumberFormat('ru-RU').format(n)+'\u00a0₸';
const plural=(n:number,one:string,few:string,many:string)=>{const a=n%10,b=n%100;return n+' '+(a===1&&b!==11?one:a>=2&&a<=4&&(b<10||b>=20)?few:many);};
export function feeTipText(t:{from_fee:number;to_fee:number;typical:number;refused:number}){
 const parts=[];
 if(t.refused)parts.push('Исполнители '+plural(t.refused,'раз','раза','раз')+' не взяли уборку за '+money(t.from_fee)+'.');
 if(t.typical)parts.push('За похожие квартиры в городе платят около '+money(t.typical)+'.');
 parts.push('Предлагаю '+money(t.to_fee)+' за уборку.');
 return parts.join(' ');
}
