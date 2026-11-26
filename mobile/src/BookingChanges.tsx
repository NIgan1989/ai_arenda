import {t} from '../../lib/i18n';
import React,{useEffect,useRef,useState} from 'react';
import {View,Text,Pressable,StyleSheet} from 'react-native';
import {s,C,type} from './styles';
import {date,money,uid,type Row} from './model';
import {isBath,isBanquet} from '../../lib/listings';
import {recordSpan} from '../../lib/record-span';
import {settleStay,stayDay,stayFromInterval,stayInterval,stayLimits,stayStamp,type StayChoice,type StayMode} from '../../lib/stay-choice';
import {useActivityClock} from './ActivityTimer';
import {Days,GuestsRow,Segments,Stepper,StayWhen} from './StayRequest';
import {PopSheet} from './PopSheet';
import {SwipeConfirm} from './SwipeConfirm';
import {Thinking} from './Thinking';
// The kind decides what may change (audit of 2026-11-22, lib/service.ts kindMode): a bath stays by the hour, a hall
// moves only to the lunch (12:00–17:00) or the evening (18:00–00:00) of another day.
const SLOTS={lunch:[12,5],evening:[18,6]} as const;
const minutesOf=(at:number)=>Math.round(((at+18000)%86400)/60);
// «Изменить бронь» on its own sheet (board «Экраны старой версии», 2026-11-26, as the change of a trip in Airbnb): the same
// choice of days and hours as in the request, the guests, the new price in one line, and «Проведите» at the bottom.
// The tariff stays the booking's own; nothing is typed as a date. The reason the server keeps is written from the choice.
export function BookingChanges({booking:b,capacity=0,role,busy,editing,onEditing,onQuote,onPropose,onDecide,onReview}:{booking:Row;capacity?:number;role:string;busy:boolean;editing:boolean;onEditing:(open:boolean)=>void;onQuote:(body:Row)=>Promise<Row>;onPropose:(body:Row)=>void;onDecide:(id:string,action:string)=>void;onReview?:(id:string)=>void}){
 const bath=isBath(b.property_type),hall=isBanquet(b.property_type),inside=!!b.terms?.actual_checkin;
 const mode:StayMode=bath?'hourly':hall?'daily':b.terms?.billing_mode==='legacy'?'daily':(b.terms?.billing_mode||'daily');
 // The booking's own hours stand for the owner's check-in and check-out: a night keeps them.
 const policy={checkin_minutes:minutesOf(b.start),checkout_minutes:minutesOf(b.end),min_hours:1};
 const clock=useActivityClock(),now=clock||Math.floor(Date.now()/1000);
 const first=()=>stayFromInterval(mode,b.start,b.end,policy);
 const [choice,setChoice]=useState<StayChoice>(first),[guests,setGuests]=useState(Number(b.guests)||1),[discount,setDiscount]=useState(Number(b.terms?.discount_percent)||0);
 const [slot,setSlot]=useState<'lunch'|'evening'>(((b.start+18000)%86400)===18*3600?'evening':'lunch');
 const [q,setQuote]=useState<Row|null>(null),[error,setError]=useState(''),[checking,setChecking]=useState(false),[key,setKey]=useState(uid),[touched,setTouched]=useState(false),round=useRef(0);
 useEffect(()=>{if(editing){setChoice(first());setTouched(false);setGuests(Number(b.guests)||1);setQuote(null);setError('');setKey(uid());}},[editing]);
 const change=(next:Partial<StayChoice>)=>{
  setTouched(true);
  if(inside){const limits=stayLimits(mode,policy);setChoice({...choice,count:Math.min(limits.max,Math.max(limits.min,next.count??choice.count))});return;}
  setChoice(settleStay({...choice,...next,mode},policy,now));
 };
 // Until the guest moves something, the booking keeps its own minutes (the strip of times goes by half-hours).
 const span=()=>{
  if(!touched)return {start:b.start,end:b.end};
  if(hall){const [hour,length]=SLOTS[slot],start=choice.day+hour*3600;return {start,end:start+length*3600};}
  if(inside){const unit=mode==='hourly'?3600:86400;return mode==='nightly'?{start:b.start,end:stayDay(b.start)+choice.count*86400+policy.checkout_minutes*60}:{start:b.start,end:b.start+choice.count*unit};}
  return stayInterval(choice,policy);
 };
 const {start,end}=span(),same=start===b.start&&end===b.end&&guests===(Number(b.guests)||1)&&discount===(Number(b.terms?.discount_percent)||0);
 const reason=(role==='owner'?t('Владелец предлагает'):t('Гость предлагает'))+': '+recordSpan(start,end)+(guests!==(Number(b.guests)||1)?', '+t('гостей: {n}',{n:guests}):'')+'.';
 const body=()=>({start:stayStamp(start),end:stayStamp(end),billingMode:mode,guests,discountPercent:discount,reason});
 // The new price comes by itself, as in the request: a moment after the last change.
 useEffect(()=>{
  if(!editing||same){setQuote(null);setError('');return;}
  const id=++round.current;setChecking(true);
  const timer=setTimeout(()=>{onQuote(body()).then(v=>{if(id===round.current){setQuote(v);setError('');}}).catch((e:any)=>{if(id===round.current){setQuote(null);setError(e?.message||t('Не удалось рассчитать это время.'));}}).finally(()=>{if(id===round.current)setChecking(false);});},350);
  return()=>clearTimeout(timer);
 },[editing,start,end,guests,discount]);
 const button=(title:string,fn:()=>void,disabled=busy)=><Pressable accessibilityRole="button" disabled={disabled} onPress={fn} style={[s.button,s.secondary,disabled&&s.disabled]}><Text style={[s.buttonText,s.secondaryText]}>{title}</Text></Pressable>;
 const other=role==='owner'?t('гостю'):t('владельцу');
 const pending=(b.changes||[]).filter((c:Row)=>c.status==='pending');
 return <>
  {pending.length>0&&<View style={{gap:12}}>{pending.map((c:Row)=><View key={c.id} style={s.card}><Text style={s.eventTitle}>{c.proposer_role==='owner'?t('Владелец предлагает изменение'):t('Гость предлагает изменение')}</Text><Text style={s.meta}>{date(c.start)} → {date(c.end)} · {money(c.amount)}{c.guests!=null&&Number(c.guests)!==Number(b.guests)?' · '+t('гостей: {from} → {to}',{from:b.guests,to:c.guests}):''}{c.discount_percent?' · '+t('скидка {percent}%',{percent:c.discount_percent}):''}{'\n'}{t('Ответ до {time}. Новое время пока не зарезервировано.',{time:date(c.expires_at)})}</Text>{c.proposer_role!==role&&onReview?button(t('Рассмотреть в чате'),()=>onReview(c.id)):c.proposer_role!==role?<>{button(t('Принимаю даты и стоимость'),()=>onDecide(c.id,'accept'))}{button(t('Отклонить'),()=>onDecide(c.id,'reject'))}</>:<Text style={s.meta}>{t('Ожидаем вторую сторону.')}</Text>}</View>)}</View>}
  <PopSheet visible={editing} title={t('Изменить бронь')} onClose={()=>onEditing(false)} footer={<>
   <SwipeConfirm key={key} label={t('Проведите: предложить {who}',{who:other})} disabled={busy||checking||!q||same} onConfirm={()=>{if(q)onPropose({...body(),requestKey:key,expectedAmount:q.amount,baseVersion:q.baseVersion,policyVersion:q.policyVersion,acceptTerms:true});}}/>
   <Text style={c.note}>{q?.automatic?t('Продление примут сразу, по разрешению владельца.'):t('Вторая сторона ответит в течение 15 минут. Деньги не списываются.')}</Text>
  </>}>
   <Text style={c.now}>{t('Сейчас: {v}',{v:recordSpan(b.start,b.end)})}</Text>
   {hall?<><Days label={t('День мероприятия')} value={choice.day} now={now} disabled={busy} onChange={day=>{setTouched(true);setChoice({...choice,day});}}/><Segments label={t('Время')} value={slot} disabled={busy} onChange={v=>{setTouched(true);setSlot(v);}} options={[{id:'lunch',title:t('Обед'),note:'12:00–17:00'},{id:'evening',title:t('Вечер'),note:'18:00–00:00'}]}/></>
    :<StayWhen title={inside?t('Выезд'):t('Когда')} choice={choice} modes={[mode]} policy={policy} now={now} disabled={busy} fixedStart={inside} shown={{start,end}} onChange={change}/>}
   <GuestsRow value={guests} max={Math.max(guests,capacity||20)} disabled={busy} onChange={setGuests}/>
   {role==='owner'&&<Stepper label={t('Скидка')} value={discount} min={0} max={90} step={5} disabled={busy} format={n=>n+'%'} onChange={setDiscount}/>}
   {same?<Text style={c.note}>{t('Выберите новое время или число гостей.')}</Text>
    :checking&&!q?<View style={c.wait}><Thinking size="sm"/><Text style={c.note}>{t('Считаю новую цену…')}</Text></View>
    :error?<Text accessibilityRole="alert" style={c.error}>{error}</Text>
    :q?<View style={[c.price,checking&&{opacity:.5}]}><Text style={c.sum}>{money(q.amount)}</Text><Text style={c.note}>{q.amountDue>0?t('Останется оплатить {due}',{due:money(q.amountDue)}):t('Доплаты нет')}{q.extraHours>0?' · '+t('сверх ночи {hours} ч × {rate}',{hours:q.extraHours,rate:money(q.extraRate)}):''}</Text>{q.cleanerReconfirmation&&<Text style={c.note}>{t('Исполнителю уборки нужно заново согласовать время.')}</Text>}</View>:null}
  </PopSheet>
 </>;
}
const c=StyleSheet.create({
 now:{...type.label,color:C.muted},note:{...type.caption,color:C.muted},error:{...type.label,color:C.danger},
 wait:{flexDirection:'row',alignItems:'center',gap:8},
 price:{gap:4,paddingVertical:12,borderTopWidth:1,borderTopColor:C.line},sum:{...type.title,color:C.ink,fontWeight:'700'},
});
