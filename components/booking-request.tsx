'use client';
import './flow-release.css';
import {windowBadge} from '../lib/window-badge';
import './booking-request.css';
import {Button} from '@/components/ui/button';
import {useEffect,useMemo,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,CalendarDays,LoaderCircle,ShieldCheck} from 'lucide-react';
import {DayStrip,TimeSelect,Stepper,Segments} from './stay-picker';
import {useActivityClock} from './activity-clock';
import {defaultStay,settleStay,stayFromInterval,stayInterval,stayLimits,stayModes,stayRate,stayStamp,stayUnit,stayClock,type StayChoice,type StayMode} from '../lib/stay-choice';
import {recordSpan} from '../lib/record-span';

type Row=Record<string,any>;
const money=(n:number)=>new Intl.NumberFormat('ru-RU').format(n)+' ₸';
const guestsWord=(n:number)=>{const tens=n%100,units=n%10;return n+' '+(tens>10&&tens<20?'гостей':units===1?'гость':units>1&&units<5?'гостя':'гостей');};
const modeTitle:Record<StayMode,string>={daily:'Сутки',hourly:'Часы',nightly:'Ночь'};
const moment=(value:unknown)=>{const t=Date.parse(String(value||'')+':00+05:00');return Number.isFinite(t)?Math.floor(t/1000):0;};

// One screen: the guest picks the tariff, the day, the time and how long — the price and the free interval are
// checked as they choose — then agrees and sends. An offer that already has its dates (onChangeDates) shows them fixed.
export function BookingRequest({property,requestKey,disabled,onQuote,onConfirm,initial,initialQuote,onChangeDates,testMode=false}:{
  property:Row;requestKey:string;disabled:boolean;onQuote:(body:Row)=>Promise<Row>;onConfirm:(body:Row)=>Promise<unknown>|void;initial?:Row;initialQuote?:Row;onChangeDates?:()=>void;testMode?:boolean;
}){
  const policy=property.policy||{},modes=useMemo(()=>stayModes(property),[property.price,policy.hourly_price,policy.nightly_price]),fixed=!!(initialQuote&&onChangeDates);
  const clock=useActivityClock(),[opened]=useState(()=>Math.floor(Date.now()/1000)),now=clock||opened;
  const [choice,setChoice]=useState<StayChoice>(()=>{const mode:StayMode=modes.includes(initial?.mode)?initial!.mode:'daily',start=moment(initial?.start),end=moment(initial?.end);return settleStay(start&&end>start?stayFromInterval(mode,start,end,policy):defaultStay(mode,policy,opened),policy,opened);});
  // Two moments that came from a search stay exactly as given until the guest changes something.
  const [given,setGiven]=useState<{start:number;end:number}|null>(()=>{const start=moment(initial?.start),end=moment(initial?.end);return start>opened&&end>start?{start,end}:null;});
  const [guests,setGuests]=useState(()=>Math.min(property.capacity||1,Math.max(1,Number(initial?.guests)||1)));
  const [quote,setQuote]=useState<Row|null>(initialQuote||null),[checking,setChecking]=useState(false),[error,setError]=useState(''),[accepted,setAccepted]=useState(false),[submitting,setSubmitting]=useState(false);
  const confirming=useRef(false),round=useRef(0),limits=stayLimits(choice.mode,policy),span=given||stayInterval(choice,policy),locked=disabled||submitting;
  const fixedBody=fixed?{start:String(initial?.start||'')+'+05:00',end:String(initial?.end||'')+'+05:00',guests:Number(initial?.guests)||initialQuote!.guests,billingMode:initial?.mode==='hourly'?'hourly':'daily'}:null;
  const body=()=>({propertyId:property.id,requestKey,...(fixedBody||{start:stayStamp(span.start),end:stayStamp(span.end),guests,billingMode:choice.mode})});
  const change=(next:Partial<StayChoice>)=>{const mode=next.mode||choice.mode;setGiven(null);setChoice(settleStay(next.mode&&next.mode!==choice.mode?{...defaultStay(mode,policy,now),day:choice.day,...(mode==='hourly'&&choice.day!==defaultStay(mode,policy,now).day?{time:policy.checkin_minutes??840}:{})}:{...choice,...next},policy,now));};
  // The price follows the choice: a short pause after the last change, and only the latest answer is shown.
  useEffect(()=>{
    if(fixed)return;const id=++round.current;setChecking(true);setAccepted(false);
    const timer=setTimeout(async()=>{try{const result=await onQuote(body());if(id===round.current){setQuote(result);setError('');}}catch(e:any){if(id===round.current){setQuote(null);setError(e?.message||'Не удалось проверить это время.');}}finally{if(id===round.current)setChecking(false);}},350);
    return()=>clearTimeout(timer);
  },[choice.mode,choice.day,choice.time,choice.count,guests,fixed]);
  async function confirm(){if(locked||confirming.current||!accepted||!quote||checking)return;confirming.current=true;setSubmitting(true);setError('');try{await onConfirm({...body(),expectedAmount:quote.amount,expectedPolicyVersion:quote.policy.version,acceptTerms:accepted});}catch(e){setAccepted(false);setError((e instanceof Error?e.message:'Не удалось отправить заявку.')+' Выбранное время сохранено на экране.');}finally{confirming.current=false;setSubmitting(false);}}
  return <section className="booking-request stay-request" aria-label="Оформление заявки" aria-busy={checking||disabled}>
    <header className="stay-head"><span><CalendarDays size={16}/>Заявка на проживание</span><h2>{property.title}</h2>{(property.city||property.district)&&<p>{[property.city,property.district].filter(Boolean).join(', ')} · до {guestsWord(property.capacity||1)}</p>}</header>
    {testMode&&<p className="booking-test-note">Учебная заявка. Банковский перевод не выполняется; расчёты подтверждаются отдельно.</p>}
    {!fixed&&<div className="stay-choice">
      {modes.length>1&&<Segments label="Тариф" value={choice.mode} disabled={locked} onChange={mode=>change({mode})} options={modes.map(mode=>({id:mode,title:modeTitle[mode],note:money(stayRate(property,mode))}))}/>}
      <DayStrip label="Заезд" value={choice.day} now={now} disabled={locked} onChange={day=>change({day})}/>
      <div className="pick-row">
        {choice.mode==='nightly'?<div className="pick-field"><span className="pick-label">Время</span><p className="stay-fixed-time">Заезд в {stayClock(policy.checkin_minutes??840)}, выезд в {stayClock(policy.checkout_minutes??720)}</p></div>:<TimeSelect label="Время заезда" value={choice.time} day={choice.day} now={now} disabled={locked} onChange={time=>change({time})}/>}
        <Stepper label={choice.mode==='hourly'?'Сколько часов':choice.mode==='nightly'?'Сколько ночей':'Сколько суток'} value={choice.count} min={limits.min} max={limits.max} disabled={locked} format={n=>n+' '+stayUnit(choice.mode,n)} onChange={count=>change({count})}/>
      </div>
      {(property.capacity||1)>1&&<Stepper label="Гости" value={guests} min={1} max={property.capacity} disabled={locked} format={guestsWord} onChange={setGuests}/>}
    </div>}
    <div className={'stay-total'+(error&&!quote?' is-error':'')} aria-live="polite">
      <p className="stay-span">{fixed&&quote?recordSpan(quote.start,quote.end):recordSpan(span.start,span.end)}</p>
      {quote?<><div className="stay-sum"><strong className={checking?'is-stale':undefined}>{money(quote.amount)}</strong><span>{quote.periods} × {money(quote.price)} · {quote.unitLabel}</span></div>
        {quote.window&&<p className="stay-window">✦ {windowBadge(quote.window)} · обычно {money(quote.window.regular)}/час</p>}
        <dl className="stay-facts"><div><dt>Депозит</dt><dd>{quote.policy.deposit?money(quote.policy.deposit)+', отдельно от проживания':'не нужен'}</dd></div><div><dt>Подтверждение</dt><dd>{quote.policy.auto_confirm?'сразу, по правилам владельца':'владелец отвечает в течение 30 минут'}</dd></div>{fixed&&<div><dt>Гости</dt><dd>{guestsWord(quote.guests)}</dd></div>}</dl></>
        :error?<p className="stay-error" role="alert">{error}</p>:<p className="stay-wait"><LoaderCircle size={16}/>Проверяю свободное время и цену…</p>}
      {error&&quote&&<p className="stay-error" role="alert">{error}</p>}
    </div>
    {quote?.policy.house_rules&&<details className="stay-rules"><summary>Правила проживания</summary><p>{quote.policy.house_rules}</p></details>}
    <label className="stay-consent"><input type="checkbox" checked={accepted} disabled={locked||!quote||checking} onChange={e=>setAccepted(e.target.checked)}/><span>Согласен с временем, ценой, депозитом и правилами проживания</span></label>
    <div className="stay-actions">{onChangeDates&&<Button type="button" variant="outline" className="stay-back" disabled={locked} onClick={onChangeDates}><ArrowLeft size={16}/>Изменить запрос</Button>}<Button type="button" className="stay-send" disabled={locked||!accepted||!quote||checking} onClick={()=>void confirm()}>{disabled||submitting?<><LoaderCircle size={17}/>Отправляем…</>:<>Отправить заявку<ArrowRight size={17}/></>}</Button></div>
    <p className="stay-note"><ShieldCheck size={14}/>Отправка заявки не списывает деньги. Время Казахстана.</p>
  </section>;
}
