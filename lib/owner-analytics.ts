// Pure counting only: the app imports the types of this file, so it must not pull the database modules in.
// The loader that reads the rows is lib/owner-analytics-db.ts.
type Row=Record<string,any>;

// «Доходы»: the owner's business numbers in the app (2026-11-19). Everything is counted from what the service
// already keeps: the stays booked through it, the cleanings it arranged, what it charged the owner (commission,
// the autopilot plan) and the expenses the owner wrote down himself. No new table and nothing the guest typed.
// A stay counts in the period where it begins; its busy time is clipped to the period for the occupancy.
// The money is what was booked, not a bank statement: the screen says so in one line.
export type AnalyticsPeriod='week'|'month'|'year';
export const ANALYTICS_PERIODS:{id:AnalyticsPeriod;label:string;days:number}[]=[{id:'week',label:'Неделя',days:7},{id:'month',label:'Месяц',days:30},{id:'year',label:'Год',days:365}];
export const DAY=86400;
const KZ=18000,MONTHS=['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
const SOLD=['confirmed','completed'],LOST=['cancelled','expired','rejected'];
export const analyticsPeriod=(value:unknown):AnalyticsPeriod=>ANALYTICS_PERIODS.some(p=>p.id===value)?value as AnalyticsPeriod:'month';

export type AnalyticsInput={
 now:number;owner:string;
 places:Row[];      // id,title,created_at,archived_at,type
 bookings:Row[];    // id,property_id,guest_id,start,end,amount,status,created_at
 jobs:Row[];        // property_id,start,fee,status,cancel_fee,assigned_to
 commissions:Row[]; // booking_id,property_id,amount,created_at (booking commissions) or job commissions with created_at
 plans:Row[];       // autopilot_charges: period_start,amount
 expenses:Row[];    // finance_entries expense/compensation: property_id,amount,created_at
 reviews:Row[];     // property_id,rating,created_at
 views:Row[];       // property_id,day,shown
};
type Money={revenue:number;cleaning:number;commission:number;autopilot:number;other:number;expenses:number;net:number};
const zero=():Money=>({revenue:0,cleaning:0,commission:0,autopilot:0,other:0,expenses:0,net:0});
const n=(v:unknown)=>Number(v)||0;
const pct=(now:number,before:number)=>before>0?Math.round((now-before)/before*100):null;
/** The start of the calendar month in Kazakhstan time, `back` months before the one holding `at`. */
export function monthStart(at:number,back=0){const d=new Date((at+KZ)*1000);const m=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()-back,1));return Math.floor(m.getTime()/1000)-KZ;}
const cleaningCost=(j:Row,owner:string)=>j.assigned_to===owner?0:j.status==='completed'?n(j.fee):j.status==='cancelled'?n(j.cancel_fee):0;

function money(input:AnalyticsInput,from:number,to:number,place?:string):Money{
 const m=zero(),inside=(t:unknown)=>n(t)>=from&&n(t)<to,mine=(r:Row)=>!place||r.property_id===place;
 for(const b of input.bookings)if(mine(b)&&SOLD.includes(b.status)&&inside(b.start))m.revenue+=n(b.amount);
 for(const j of input.jobs)if(mine(j)&&inside(j.start))m.cleaning+=cleaningCost(j,input.owner);
 for(const c of input.commissions)if(mine(c)&&inside(c.at))m.commission+=n(c.amount);
 if(!place)for(const p of input.plans)if(inside(p.period_start))m.autopilot+=n(p.amount);
 for(const e of input.expenses)if(mine(e)&&inside(e.created_at))m.other+=n(e.amount);
 m.expenses=m.cleaning+m.commission+m.autopilot+m.other;m.net=m.revenue-m.expenses;return m;
}
/** How much of the time the places were open in [from,to) a booked stay held them, 0…1. */
function occupancy(input:AnalyticsInput,from:number,to:number,place?:string):number|null{
 let open=0,busy=0;
 for(const p of input.places){if(place&&p.id!==place)continue;const a=Math.max(from,n(p.created_at)),z=Math.min(to,p.archived_at?n(p.archived_at):to);if(z>a)open+=z-a;}
 for(const b of input.bookings){if(place&&b.property_id!==place)continue;if(!SOLD.includes(b.status))continue;const a=Math.max(from,n(b.start)),z=Math.min(to,n(b.end));if(z>a)busy+=z-a;}
 return open>0?Math.min(1,busy/open):null;
}
const count=(v:number)=>new Intl.NumberFormat('ru-RU').format(Math.round(v)).replace(/\s/g,' '),tenge=(v:number)=>count(v)+' ₸';

export function buildOwnerAnalytics(input:AnalyticsInput,period:AnalyticsPeriod){
 const days=ANALYTICS_PERIODS.find(p=>p.id===period)!.days,to=input.now,from=to-days*DAY,prevFrom=from-days*DAY;
 const now=money(input,from,to),before=money(input,prevFrom,from);
 const inPeriod=(b:Row)=>n(b.created_at)>=from&&n(b.created_at)<=to;
 // Booked and not begun yet: the money already waiting ahead.
 const upcoming=input.bookings.filter(b=>b.status==='confirmed'&&n(b.start)>to);
 const requests=input.bookings.filter(inPeriod),sold=input.bookings.filter(b=>SOLD.includes(b.status)&&n(b.start)>=from&&n(b.start)<to);
 const lost=requests.filter(b=>LOST.includes(b.status)),cancelled=requests.filter(b=>b.status==='cancelled');
 const stayTime=sold.reduce((s,b)=>s+Math.max(0,n(b.end)-n(b.start)),0),nights=Math.round(stayTime/DAY);
 // A guest who stayed before this period and came back in it.
 const earlier=new Set(input.bookings.filter(b=>SOLD.includes(b.status)&&n(b.start)<from).map(b=>b.guest_id));
 const repeat=new Set(sold.filter(b=>earlier.has(b.guest_id)).map(b=>b.guest_id)).size,guests=new Set(sold.map(b=>b.guest_id)).size;
 const reviews=input.reviews.filter(r=>n(r.created_at)>=from&&n(r.created_at)<to),rating=reviews.length?Math.round(reviews.reduce((s,r)=>s+n(r.rating),0)/reviews.length*10)/10:null;
 // «Показы» are kept for 30 days (property-views.ts): the year shows the last month only and says so.
 const viewDays=Math.min(days,30),today=Math.floor((to+KZ)/DAY),views=input.views.filter(v=>n(v.day)>today-viewDays).reduce((s,v)=>s+n(v.shown),0);
 const viewRequests=input.bookings.filter(b=>n(b.created_at)>=to-viewDays*DAY&&n(b.created_at)<=to).length;
 // No open time before (the objects are newer than that): there is nothing to compare with.
 const occ=occupancy(input,from,to)??0,occBefore=occupancy(input,prevFrom,from);
 const places=input.places.map(p=>{const m=money(input,from,to,p.id);return {id:p.id,title:String(p.title||'Объект'),type:p.type||'',revenue:m.revenue,expenses:m.expenses,net:m.net,occupancy:Math.round((occupancy(input,from,to,p.id)??0)*100),bookings:sold.filter(b=>b.property_id===p.id).length,archived:!!p.archived_at};})
  .filter(p=>!p.archived||p.revenue||p.expenses).sort((a,b)=>b.revenue-a.revenue||b.occupancy-a.occupancy);
 const trend=Array.from({length:6},(_,i)=>{const a=monthStart(to,5-i),z=i===5?to:monthStart(to,4-i),m=money(input,a,z),d=new Date((a+KZ)*1000);return {month:a,label:MONTHS[d.getUTCMonth()],revenue:m.revenue,expenses:m.expenses,net:m.net};});
 const result={
  period,days,from,to,objects:input.places.filter(p=>!p.archived_at).length,
  money:{...now,margin:now.revenue>0?Math.round(now.net/now.revenue*100):null,change:{revenue:pct(now.revenue,before.revenue),net:before.net>0?pct(now.net,before.net):null},before:{revenue:before.revenue,net:before.net}},
  stays:{sold:sold.length,requests:requests.length,lost:lost.length,cancelled:cancelled.length,cancelRate:requests.length?Math.round(cancelled.length/requests.length*100):0,
   occupancy:Math.round(occ*100),occupancyChange:occBefore===null?null:Math.round((occ-occBefore)*100),average:sold.length?Math.round(now.revenue/sold.length):0,
   perNight:stayTime>=DAY?Math.round(now.revenue/(stayTime/DAY)):0,nights,hours:Math.round(stayTime/3600),guests,repeat,rating,reviews:reviews.length},
  funnel:{days:viewDays,views,requests:viewRequests,conversion:views>0?Math.round(viewRequests/views*1000)/10:null},
  ahead:{count:upcoming.length,amount:upcoming.reduce((s,b)=>s+n(b.amount),0)},
  places,trend,advice:[] as string[],
  note:'Считаем по броням и уборкам в сервисе. Пока оплата тестовая, это учёт, а не банковская выписка.',
 };
 result.advice=ownerAdvice(result);
 return result;
}
export type OwnerAnalytics=ReturnType<typeof buildOwnerAnalytics>;

/** Up to three plain sentences from the numbers: what to do next. Rules, not the model: it costs nothing. */
export function ownerAdvice(r:Omit<OwnerAnalytics,'advice'>&{advice?:string[]}):string[]{
 const out:string[]=[],m=r.money,s=r.stays;
 if(!r.objects)return ['Добавьте жильё: как только гости начнут бронировать, здесь появятся доход и загрузка.'];
 if(!s.sold&&!m.revenue)return [r.funnel.views>0?`Жильё видели ${count(r.funnel.views)} раз, но броней пока нет. Проверьте цену и первое фото.`:'За этот срок броней нет. Попросите ИИ-администратора проверить цену и описание.'];
 const weak=r.places.find(p=>!p.archived&&p.occupancy<35&&r.days>=7);
 if(weak)out.push(`У «${weak.title}» загрузка ${weak.occupancy}%. Снизьте цену в будни на 10% или откройте почасовые окна.`);
 if(m.revenue>0&&m.cleaning/m.revenue>0.25)out.push(`Уборки забирают ${Math.round(m.cleaning/m.revenue*100)}% выручки. Постоянный исполнитель обходится дешевле: комиссия пары 5%.`);
 if(s.requests>=4&&s.cancelRate>=20)out.push(`Отменяется ${s.cancelRate}% заявок. Депозит и предоплата уменьшат отмены.`);
 if(r.funnel.views>=50&&r.funnel.conversion!==null&&r.funnel.conversion<2)out.push(`Из ${count(r.funnel.views)} показов заявок ${r.funnel.requests}. Обновите фото и первую строку описания.`);
 if(m.change.net!==null&&m.change.net>=10)out.push(`Чистая прибыль выросла на ${m.change.net}% к прошлому сроку.`);
 if(s.occupancy>=85)out.push(`Загрузка ${s.occupancy}%: спрос высокий, можно поднять цену на 5–10%.`);
 if(!out.length)out.push(m.net>=0?`Чистыми ${tenge(m.net)}. Всё идёт ровно, ИИ продолжает следить за ценой и уборками.`:`Расходы выше выручки на ${tenge(-m.net)}. Посмотрите, что дороже всего, ниже в «Расходы».`);
 return out.slice(0,3);
}
