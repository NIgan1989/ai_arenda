import type {Role} from './domain';
type Row=Record<string,any>;
export type Approval={id:string;kind:string;entityId:string;revision:string;title:string;subject:string;from:string;to:string;canDecide:boolean;expiresAt?:number;facts:[string,string][];acceptLabel:string;rejectLabel:string;requiresReason?:boolean;cleaningFee?:number;cleaningBudget?:number;detail?:string;price?:PriceTip;window?:WindowTip};
export type WindowTip={percent:number;from:number;to:number;propertyId:string;when:string;hours:number};
export type PriceTip={direction:'up'|'down';percent:number;from:number;to:number;propertyId:string;reasons:string[];rows:[string,number,number][]};
// Same value in the card, the push and the server check: a changed price or tariff makes the answer stale.
export const priceRevision=(p:Row)=>JSON.stringify([p.id,p.status,p.policy_version,p.from_daily,p.to_daily]);
// A calendar window: same idea, the answer goes stale when the window or its price changes.
export const windowRevision=(w:Row)=>JSON.stringify([w.id,w.status,w.start,w.end,w.hourly_to]);
const money=(n:number)=>new Intl.NumberFormat('ru-RU').format(n)+' ₸';
const date=(n:number)=>new Date(n*1000).toLocaleString('ru-RU',{timeZone:'Asia/Almaty',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'});
export function approvalCards(data:Row,role:Role,userId:string,t:number):Approval[]{
 const cards:Approval[]=[];
 for(const b of data.bookings||[]){
  if(role==='cleaner'||(role==='owner'?b.owner_id!==userId:b.guest_id!==userId))continue;
  const owner=role==='owner',terms=b.terms||{};
  if(b.status==='requested'&&b.expires_at>t){
   const property=(data.ownProperties||[]).find((p:Row)=>p.id===b.property_id);
   cards.push({id:'booking:'+b.id,kind:'booking',entityId:b.id,revision:JSON.stringify([b.status,b.start,b.end,b.amount,b.guests,b.expires_at,terms.version]),title:'Запрос на бронирование',subject:b.title,from:owner?(b.guest_name||'Гость'):'Вы',to:owner?'Вам':'Владельцу',canDecide:owner,expiresAt:b.expires_at,facts:[['Заезд',date(b.start)],['Выезд',date(b.end)],['Гостей',String(b.guests)],['Проживание',money(b.amount)],['Депозит',money(terms.deposit||0)]],detail:terms.house_rules,acceptLabel:'Подтвердить бронь',rejectLabel:'Отклонить',cleaningFee:property?.policy?.cleaning_fee||0,cleaningBudget:property?.policy?.cleaning_budget||0});
  }
  for(const c of b.changes||[])if(c.status==='pending'&&c.expires_at>t){
   cards.push({id:'change:'+c.id,kind:'change',entityId:b.id,revision:JSON.stringify([c.id,c.status,c.base_version,terms.version,c.policy_version,c.start,c.end,c.amount,c.expires_at]),title:'Согласование новых условий',subject:b.title,from:c.proposer_role===role?'Вы':c.proposer_role==='owner'?'Владелец':'Гость',to:c.proposer_role!==role?'Вам':'Другой стороне',canDecide:c.proposer_role!==role,expiresAt:c.expires_at,facts:[['Заезд',date(c.start)],['Выезд',date(c.end)],['Новая стоимость',money(c.amount)],['Подтверждено оплаты',money(terms.paid_amount||0)],['Депозит',money(terms.deposit||0)]],detail:c.reason,acceptLabel:'Принимаю условия',rejectLabel:'Отклонить'});
  }
  if(b.status==='confirmed'&&terms.checkout_reported_at&&!terms.actual_checkout)cards.push({id:'checkout:'+b.id,kind:'checkout',entityId:b.id,revision:JSON.stringify([b.status,terms.version,terms.checkout_reported_at,terms.actual_checkout]),title:'Гость сообщил о выезде',subject:b.title,from:owner?(b.guest_name||'Гость'):'Вы',to:owner?'Вам':'Владельцу',canDecide:owner,facts:[['Сообщение о выезде',date(terms.checkout_reported_at)],['Согласованный выезд',date(b.end)]],detail:'Подтверждайте только после проверки, что квартира освобождена. Таймер и статус готовности сами по себе этого не подтверждают.',acceptLabel:'Квартира освобождена',rejectLabel:'Выезд не подтверждён',requiresReason:true});
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
   facts:[['Свободно',when+' ('+hours+' ч)'],['Час',money(w.hourly_from)+' → '+money(w.hourly_to)]],detail:'Квартира пустует между бронями. Гости увидят скидку только внутри окна. Без вашего согласия ничего не изменится.',acceptLabel:'Открыть окно',rejectLabel:'Не надо',
   window:{percent:w.percent,from:w.hourly_from,to:w.hourly_to,propertyId:w.property_id,when,hours}});
 }
 return cards;
}
