import type {Role} from './domain';
import {weekSummary,adviceSentence} from './forecast-text';
import {tipText} from './listing-tip-text';
import {feeTipText} from './cleaning-tip-text';
import {riskAdvice,riskLabel,type BookingRisk} from './booking-risk-text';
import type {Reliability} from './reliability-text';
import {amenities} from './listings';
type Row=Record<string,any>;
export type Approval={id:string;kind:string;entityId:string;revision:string;title:string;subject:string;from:string;to:string;canDecide:boolean;expiresAt?:number;facts:[string,string][];acceptLabel:string;rejectLabel:string;requiresReason?:boolean;cleaningFee?:number;cleaningBudget?:number;detail?:string;price?:PriceTip;window?:WindowTip;stay?:StayTip;forecast?:ForecastTip;listing?:ListingTip;cleaningTip?:CleaningTip;risk?:RiskTip;depositLabel?:string;reliability?:Reliability};
export type RiskTip=BookingRisk&{label:string;advice:string};
export type CleaningTip={from:number;to:number;typical:number;refused:number;text:string};
export type ListingTip={kind:'photos'|'amenity'|'hourly'|'checkin'|'text';amenity:string;mine:number;theirs:number;count:number;leaders:number;value:number;text:string;title:string};
export type ForecastTip={days:{label:string;date:number;load:number;level:'busy'|'normal'|'quiet'}[];summary:string;advice:'none'|'raise'|'lower'|'min_hours';from:number;to:number;percent:number;title:string;reasons:string[]};
export type StayTip={kind:'late'|'early';when:string;hours:number;extra:number;amount:number;automatic:boolean};
export type WindowTip={percent:number;from:number;to:number;propertyId:string;when:string;hours:number};
export type PriceTip={direction:'up'|'down';percent:number;from:number;to:number;propertyId:string;reasons:string[];rows:[string,number,number][]};
// Same value in the card, the push and the server check: a changed price or tariff makes the answer stale.
export const priceRevision=(p:Row)=>JSON.stringify([p.id,p.status,p.policy_version,p.from_daily,p.to_daily]);
// A calendar window: same idea, the answer goes stale when the window or its price changes.
export const windowRevision=(w:Row)=>JSON.stringify([w.id,w.status,w.start,w.end,w.hourly_to]);
export const forecastRevision=(f:Row)=>JSON.stringify([f.id,f.status,f.advice,f.policy_version,f.from_value,f.to_value]);
export const cleaningTipRevision=(c:Row)=>JSON.stringify([c.id,c.status,c.from_fee,c.to_fee,c.policy_version,c.current_fee]);
export const listingRevision=(l:Row)=>JSON.stringify([l.id,l.status,l.kind,l.subject,l.value,l.details_version,l.policy_version]);
export const stayRevision=(o:Row)=>JSON.stringify([o.id,o.status,o.start,o.end,o.amount,o.base_version,o.policy_version]);
const money=(n:number)=>new Intl.NumberFormat('ru-RU').format(n)+' ₸';
const date=(n:number)=>new Date(n*1000).toLocaleString('ru-RU',{timeZone:'Asia/Almaty',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'});
export function approvalCards(data:Row,role:Role,userId:string,t:number):Approval[]{
 const cards:Approval[]=[];
 for(const b of data.bookings||[]){
  if(role==='cleaner'||(role==='owner'?b.owner_id!==userId:b.guest_id!==userId))continue;
  const owner=role==='owner',terms=b.terms||{};
  if(b.status==='requested'&&b.expires_at>t){
   const property=(data.ownProperties||[]).find((p:Row)=>p.id===b.property_id);
   cards.push({id:'booking:'+b.id,kind:'booking',entityId:b.id,revision:JSON.stringify([b.status,b.start,b.end,b.amount,b.guests,b.expires_at,terms.version]),title:'Запрос на бронирование',subject:b.title,from:owner?(b.guest_name||'Гость'):'Вы',to:owner?'Вам':'Владельцу',canDecide:owner,expiresAt:b.expires_at,facts:[['Заезд',date(b.start)],['Выезд',date(b.end)],['Гостей',String(b.guests)],['Проживание',money(b.amount)],['Депозит',money(terms.deposit||0)]],detail:terms.house_rules,acceptLabel:'Подтвердить бронь',rejectLabel:'Отклонить',cleaningFee:property?.policy?.cleaning_fee||0,cleaningBudget:property?.policy?.cleaning_budget||0,
    ...(owner&&b.guest_reliability?{reliability:b.guest_reliability}:{}),...(owner&&b.risk?{risk:{...b.risk,label:riskLabel[b.risk.level as 'low'],advice:riskAdvice(b.risk,terms.deposit||0)},...(b.risk.deposit>0&&!terms.deposit?{depositLabel:'С депозитом '+money(b.risk.deposit)}:{})}:{})});
  }
  for(const c of b.changes||[])if(c.status==='pending'&&c.expires_at>t){
   cards.push({id:'change:'+c.id,kind:'change',entityId:b.id,revision:JSON.stringify([c.id,c.status,c.base_version,terms.version,c.policy_version,c.start,c.end,c.amount,c.expires_at]),title:'Согласование новых условий',subject:b.title,from:c.proposer_role===role?'Вы':c.proposer_role==='owner'?'Владелец':'Гость',to:c.proposer_role!==role?'Вам':'Другой стороне',canDecide:c.proposer_role!==role,expiresAt:c.expires_at,facts:[['Заезд',date(c.start)],['Выезд',date(c.end)],['Новая стоимость',money(c.amount)],['Подтверждено оплаты',money(terms.paid_amount||0)],['Депозит',money(terms.deposit||0)]],detail:c.reason,acceptLabel:'Принимаю условия',rejectLabel:'Отклонить'});
  }
  if(b.status==='confirmed'&&terms.checkout_reported_at&&!terms.actual_checkout)cards.push({id:'checkout:'+b.id,kind:'checkout',entityId:b.id,revision:JSON.stringify([b.status,terms.version,terms.checkout_reported_at,terms.actual_checkout]),title:'Гость сообщил о выезде',subject:b.title,from:owner?(b.guest_name||'Гость'):'Вы',to:owner?'Вам':'Владельцу',canDecide:owner,facts:[['Сообщение о выезде',date(terms.checkout_reported_at)],['Согласованный выезд',date(b.end)]],detail:'Подтверждайте только после проверки, что жильё освобождено. Таймер и статус готовности сами по себе этого не подтверждают.',acceptLabel:'Жильё освобождено',rejectLabel:'Выезд не подтверждён',requiresReason:true});
 }
 for(const j of data.jobs||[]){
  if(role==='guest'||role==='owner'&&j.owner_id!==userId||role==='cleaner'&&j.assigned_to!==userId&&j.status!=='open')continue;
  if(j.status==='open'&&j.end>t)for(const a of (data.applications||[]).filter((a:Row)=>a.job_id===j.id&&a.status==='pending'&&(role==='owner'||a.user_id===userId)))cards.push({id:'application:'+a.id,kind:'application',entityId:j.id,revision:JSON.stringify([j.version,j.start,j.end,j.fee,a.id,a.status,a.created_at]),title:'Отклик на уборку',subject:j.title,from:role==='owner'?(a.name||'Исполнитель'):'Вы',to:role==='owner'?'Вам':'Владельцу',canDecide:role==='owner',expiresAt:j.end,facts:[['Начало',date(j.start)],['Окончание',date(j.end)],['Оплата за работу',money(j.fee)],['Исполнитель',a.name||'Исполнитель']],detail:a.experience,acceptLabel:'Назначить исполнителя',rejectLabel:'Отклонить отклик'});
  if(j.status==='submitted')cards.push({id:'report:'+j.id,kind:'report',entityId:j.id,revision:JSON.stringify([j.version,j.status,j.submitted_at,j.assigned_to,j.report]),title:'Приёмка уборки',subject:j.title,from:role==='owner'?'Исполнитель':'Вы',to:role==='owner'?'Вам':'Владельцу',canDecide:role==='owner',facts:[['Оплата за работу',money(j.fee)],['Чек-лист',(JSON.parse(j.checklist||'[]') as boolean[]).filter(Boolean).length+' из 4'],['Отчёт передан',j.submitted_at?date(j.submitted_at):'Ранее, время не зафиксировано']],detail:j.report,acceptLabel:'Принять работу',rejectLabel:'Вернуть на доработку',requiresReason:true});
 }
 // The AI administrator's price advice: the owner answers with one button, nothing changes without it.
 if(role==='owner')for(const p of data.priceSuggestions||[])if(p.owner_id===userId&&p.status==='pending'&&p.expires_at>t){
  const up=p.direction==='up',rows:[string,number,number][]=[['Сутки',p.from_daily,p.to_daily],...(p.from_nightly?[['Ночь',p.from_nightly,p.to_nightly] as [string,number,number]]:[]),...(p.from_hourly?[['Час',p.from_hourly,p.to_hourly] as [string,number,number]]:[])];
  cards.unshift({id:'price:'+p.id,kind:'price',entityId:p.property_id,revision:priceRevision(p),title:up?'Спрос вырос: можно поднять цену':'Спрос снизился: можно снизить цену',subject:p.title,from:'AI администратор',to:'Вам',canDecide:true,expiresAt:p.expires_at,
   facts:rows.map(([label,from,to])=>[label,money(from)+' → '+money(to)] as [string,string]),detail:(p.reasons||[]).join(' · ')+'. Без вашего согласия цена не изменится.',acceptLabel:(up?'Поднять до ':'Снизить до ')+money(p.to_daily),rejectLabel:'Оставить '+money(p.from_daily),
   price:{direction:p.direction,percent:p.percent,from:p.from_daily,to:p.to_daily,propertyId:p.property_id,reasons:p.reasons||[],rows}});
 }
 // A gap between stays: the AI administrator asks before letting it by the hour at a discount.
 if(role==='owner')for(const w of data.calendarWindows||[])if(w.owner_id===userId&&w.status==='suggested'&&w.start>t+1800){
  const hours=Math.round((w.end-w.start)/360)/10,day=new Date(w.start*1000).toLocaleString('ru-RU',{timeZone:'Asia/Almaty',weekday:'short',day:'numeric',month:'short'}),hm=(n:number)=>new Date(n*1000).toLocaleTimeString('ru-RU',{timeZone:'Asia/Almaty',hour:'2-digit',minute:'2-digit'}),when=day+', '+hm(w.start)+'–'+hm(w.end);
  cards.unshift({id:'window:'+w.id,kind:'window',entityId:w.property_id,revision:windowRevision(w),title:'Окно в календаре: сдать почасово',subject:w.title,from:'AI администратор',to:'Вам',canDecide:true,expiresAt:w.start,
   facts:[['Свободно',when+' ('+hours+' ч)'],['Час',money(w.hourly_from)+' → '+money(w.hourly_to)]],detail:'Жильё пустует между бронями. Гости увидят скидку только внутри окна. Без вашего согласия ничего не изменится.',acceptLabel:'Открыть окно',rejectLabel:'Не надо',
   window:{percent:w.percent,from:w.hourly_from,to:w.hourly_to,propertyId:w.property_id,when,hours}});
 }
 // The week ahead: the city's busy and quiet evenings, and one change for one flat (or none).
 if(role==='owner')for(const f of data.loadForecasts||[])if(f.owner_id===userId&&f.status==='suggested'&&f.expires_at>t){
  const money=(n:number)=>new Intl.NumberFormat('ru-RU').format(n)+' ₸',days=(f.days||[]) as Row[],summary=weekSummary(days as {label:string;level:string}[]),first=days[0],last=days[days.length-1];
  const change=f.advice==='raise'||f.advice==='lower'?[['Сутки',money(f.from_value)+' → '+money(f.to_value)] as [string,string]]:f.advice==='min_hours'?[['Минимум',f.from_value+' ч → '+f.to_value+' ч'] as [string,string]]:[];
  cards.unshift({id:'forecast:'+f.id,kind:'forecast',entityId:f.property_id||f.id,revision:forecastRevision(f),title:'Прогноз на неделю',subject:f.advice==='none'?f.city:f.title,from:'AI администратор',to:'Вам',canDecide:true,expiresAt:f.expires_at,
   facts:[['Неделя',first?first.label+' '+first.date+' – '+last.label+' '+last.date:''],...change],detail:summary+'. '+(f.advice==='none'?'Менять ничего не нужно.':adviceSentence(f)+' Без вашего согласия ничего не изменится.'),
   acceptLabel:f.advice==='raise'?'Поднять до '+money(f.to_value):f.advice==='lower'?'Снизить до '+money(f.to_value):f.advice==='min_hours'?'От '+f.to_value+' ч':'Понятно',rejectLabel:f.advice==='none'?'Скрыть':'Оставить',
   forecast:{days:days.map(d=>({label:d.label,date:d.date,load:d.load,level:d.level})),summary,advice:f.advice,from:f.from_value,to:f.to_value,percent:f.percent,title:f.title||'',reasons:f.reasons||[]}});
 }
 // Listing quality: one difference from similar flats that are booked more often, one button.
 if(role==='owner')for(const l of data.listingTips||[])if(l.owner_id===userId&&l.status==='suggested'&&l.expires_at>t){
  const w=tipText(l);
  cards.unshift({id:'listing:'+l.id,kind:'listing',entityId:l.property_id,revision:listingRevision(l),title:'Совет по объявлению',subject:l.title,from:'AI администратор',to:'Вам',canDecide:true,expiresAt:l.expires_at,
   facts:[['Сравнение',l.count+' из '+l.leaders+' похожих объектов, которые бронируют чаще']],detail:w.text,acceptLabel:w.accept,rejectLabel:w.reject,
   listing:{kind:l.kind,amenity:l.kind==='amenity'?amenities[l.subject]||l.subject:'',mine:l.mine,theirs:l.theirs,count:l.count,leaders:l.leaders,value:l.value,text:w.text,title:w.title}});
 }
 // Cleaning price: cleaners refuse it or similar flats pay clearly more; one new price, one button.
 if(role==='owner')for(const c of data.cleaningTips||[])if(c.owner_id===userId&&c.status==='suggested'&&c.expires_at>t){
  const text=feeTipText(c);
  cards.unshift({id:'cleaning-fee:'+c.id,kind:'cleaning-fee',entityId:c.property_id,revision:cleaningTipRevision(c),title:'Цена уборки',subject:c.title,from:'AI администратор',to:'Вам',canDecide:true,expiresAt:c.expires_at,
   facts:[['Сейчас',money(c.from_fee)],['Предлагаю',money(c.to_fee)]],detail:text,acceptLabel:'Поставить '+money(c.to_fee),rejectLabel:'Оставить',
   cleaningTip:{from:c.from_fee,to:c.to_fee,typical:c.typical,refused:c.refused,text}});
 }
 // Late checkout or early check-in the guest asked about: one button, the usual change of the stay.
 if(role==='guest')for(const o of data.stayOffers||[])if(o.guest_id===userId&&o.status==='suggested'&&o.expires_at>t){
  const late=o.kind==='late',hm=(n:number)=>new Date(n*1000).toLocaleTimeString('ru-RU',{timeZone:'Asia/Almaty',hour:'2-digit',minute:'2-digit'}),when=late?'до '+hm(o.end):'с '+hm(o.start);
  cards.unshift({id:'stay:'+o.id,kind:'stay',entityId:o.booking_id,revision:stayRevision(o),title:late?'Поздний выезд':'Ранний заезд',subject:o.title,from:'AI администратор',to:'Вам',canDecide:true,expiresAt:o.expires_at,
   facts:[[late?'Выезд':'Заезд',when],['Доплата',money(o.extra)],['Итого за проживание',money(o.amount)]],detail:o.automatic?'Оформлю сразу, по правилам владельца.':'Отправлю запрос владельцу, время изменится после его подтверждения.',acceptLabel:(late?'Остаться ':'Заехать ')+when,rejectLabel:'Не нужно',
   stay:{kind:o.kind,when,hours:o.hours,extra:o.extra,amount:o.amount,automatic:!!o.automatic}});
 }
 return cards;
}
