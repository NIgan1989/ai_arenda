// Texts of the weekly load forecast, shared by the server and the cards (no database code here).
type Row=Record<string,any>;
export type ForecastLevel='busy'|'normal'|'quiet';
export type ForecastDay={day:number;label:string;date:number;load:number;booked:number;level:ForecastLevel};
const money=(n:number)=>new Intl.NumberFormat('ru-RU').format(n)+' ₸';

export const dayList=(days:{label:string}[])=>days.map(d=>d.label).join(', ');
// «Пт и Сб почти заняты в городе, Чт пустой»: the sentence the owner reads first.
export function weekSummary(days:{label:string;level:string}[]){
 const busy=days.filter(d=>d.level==='busy'),quiet=days.filter(d=>d.level==='quiet'),parts:string[]=[];
 if(busy.length)parts.push(dayList(busy)+(busy.length===1?' почти занят':' почти заняты')+' в городе');
 if(quiet.length===7)parts.push('вся неделя тихая');
 else if(quiet.length)parts.push(dayList(quiet)+(quiet.length===1?' пустой':' тихие'));
 if(!parts.length)parts.push('неделя обычная, без пиков и провалов');
 const text=parts.join(', ');
 return text[0].toUpperCase()+text.slice(1);
}

export function adviceSentence(a:Row){
 if(a.advice==='raise')return 'Предлагаю поднять цену «'+a.title+'» до '+money(a.to_value??a.to)+' за сутки.';
 if(a.advice==='lower')return 'Предлагаю снизить цену «'+a.title+'» до '+money(a.to_value??a.to)+' за сутки.';
 if(a.advice==='min_hours')return 'Предлагаю сдавать «'+a.title+'» от '+(a.to_value??a.to)+' ч вместо '+(a.from_value??a.from)+' ч.';
 return '';
}

