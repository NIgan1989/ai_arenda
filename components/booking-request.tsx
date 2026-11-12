'use client';
import {FlowSteps} from './flow-steps';
import './flow-release.css';
import {Button} from '@/components/ui/button';
import {NativeSelect} from '@/components/ui/native-select';
import {Input} from '@/components/ui/input';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowUpRight, CalendarDays, Check, Clock3, LoaderCircle } from 'lucide-react';

type Row=Record<string,any>;
const money=(n:number)=>new Intl.NumberFormat('ru-RU').format(n)+' ₸';
const local=(hours:number)=>new Date(Date.now()+(hours+5)*3600000).toISOString().slice(0,16);
const date=(n:number)=>new Date(n*1000).toLocaleString('ru-RU',{timeZone:'Asia/Almaty',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'});

export function BookingRequest({property,requestKey,disabled,onQuote,onConfirm,initial,initialQuote,onChangeDates,testMode=false}:{
  property:Row;requestKey:string;disabled:boolean;onQuote:(body:Row)=>Promise<Row>;onConfirm:(body:Row)=>Promise<unknown>|void;initial?:Row;initialQuote?:Row;onChangeDates?:()=>void;testMode?:boolean;
}){
  const [start,setStart]=useState(()=>initial?.start||local(24)),[end,setEnd]=useState(()=>initial?.end||local(initial?.mode==='hourly'?24+Math.max(2,property.policy?.min_hours||2):48)),[guests,setGuests]=useState(()=>Number(initial?.guests)||1);
  const [quote,setQuote]=useState<Row|null>(initialQuote||null),[checking,setChecking]=useState(false),[error,setError]=useState('');
  const [submitting,setSubmitting]=useState(false);
  const [mode,setMode]=useState(initial?.mode==='hourly'?'hourly':'daily'),[accepted,setAccepted]=useState(false);
  const confirming=useRef(false),calculating=useRef(false),card=useRef<HTMLElement>(null),errorMessage=useRef<HTMLParagraphElement>(null);
  useEffect(()=>{if(quote)card.current?.scrollIntoView({block:'start',behavior:'instant'});else if(error)errorMessage.current?.scrollIntoView({block:'nearest',behavior:'instant'});},[quote,error]);
  const body=()=>({propertyId:property.id,requestKey,start:start+'+05:00',end:end+'+05:00',guests,billingMode:mode});
  async function calculate(e:FormEvent){
    e.preventDefault();if(disabled||calculating.current)return;calculating.current=true;const values=new FormData(e.currentTarget as HTMLFormElement);
    const chosenStart=String(values.get('start')),chosenEnd=String(values.get('end')),chosenGuests=Number(values.get('guests'));
    setStart(chosenStart);setEnd(chosenEnd);setGuests(chosenGuests);setChecking(true);setError('');setAccepted(false);
    try{setQuote(await onQuote({...body(),start:chosenStart+'+05:00',end:chosenEnd+'+05:00',guests:chosenGuests}));}catch(e:any){setError(e.message);}finally{calculating.current=false;setChecking(false);}
  }
  async function confirm(){if(disabled||confirming.current||!accepted||!quote)return;confirming.current=true;setSubmitting(true);setError('');try{await onConfirm({...body(),expectedAmount:quote.amount,expectedPolicyVersion:quote.policy.version,acceptTerms:accepted});}catch(e){setAccepted(false);setError((e instanceof Error?e.message:'Не удалось отправить заявку.')+' Даты и условия сохранены на экране.');}finally{confirming.current=false;setSubmitting(false);}}
  return <section ref={card} className="inline-card booking-request" aria-label="Оформление заявки" aria-busy={checking||disabled}>
    {testMode&&<p className="booking-test-note">Учебная заявка. Банковский перевод не выполняется; расчёты подтверждаются отдельно.</p>}
    <header className="flow-heading"><div><span className="flow-eyebrow"><CalendarDays size={16}/>ЗАЯВКА НА ПРОЖИВАНИЕ</span><h2>{quote?'Проверьте условия':'Выберите даты'}</h2><p>{property.title}</p></div></header>
    <FlowSteps labels={['Даты','Условия','Заявка']} current={quote?1:0}/>
    {error&&quote&&<p className="flow-error" role="alert">{error}</p>}
    {quote?<div className="quote-review">
      <div className="quote-layout"><section className="flow-panel" aria-label="Условия проживания"><h3>Детали поездки</h3><dl className="quote-facts"><div><dt>Заезд</dt><dd>{date(quote.start)}</dd></div><div><dt>Выезд</dt><dd>{date(quote.end)}</dd></div><div><dt>Гостей</dt><dd>{quote.guests}</dd></div><div><dt>Тариф</dt><dd>{quote.periods} × {money(quote.price)}<br/><small>{quote.unitLabel}</small></dd></div><div><dt>Депозит</dt><dd>{quote.policy.deposit?money(quote.policy.deposit)+' · отдельно':'Не предусмотрен'}</dd></div></dl><div className="flow-notice"><Clock3 size={17}/><span>После выезда — {quote.cleaningMinutes} мин. на подготовку квартиры.</span></div></section>
      <aside className="quote-price-card" aria-label="Стоимость заявки"><span>Стоимость проживания</span><strong>{money(quote.amount)}</strong><p>Депозит учитывается отдельно от проживания. Отправка заявки не списывает деньги.</p><div className="flow-notice important">Интервал ещё не зарезервирован. {quote.policy.auto_confirm?'Бронь подтверждается автоматически по правилам владельца.':'После отправки заявки он удерживается до решения владельца на 30 минут.'}</div></aside></div>
      {quote.policy.house_rules&&<details className="booking-rules" open><summary>Правила проживания</summary><p>{quote.policy.house_rules}</p></details>}
      <label className="booking-consent"><input type="checkbox" checked={accepted} disabled={disabled||submitting} onChange={e=>setAccepted(e.target.checked)}/><span>Согласен с указанными датами, тарифом, депозитом и правилами проживания</span></label>
      <div className="flow-actions"><Button type="button" variant="outline" disabled={disabled||submitting} onClick={()=>{if(onChangeDates){onChangeDates();return;}setError('');setAccepted(false);setQuote(null);}}><ArrowLeft size={16}/>Изменить даты</Button><Button type="button" className="flow-primary" disabled={disabled||submitting||!accepted} onClick={()=>void confirm()}>{disabled||submitting?<><LoaderCircle size={17}/>Отправляем…</>:<>Отправить заявку<ArrowUpRight size={17}/></>}</Button></div>
    </div>:<div className="booking-layout"><form className="inline-form flow-panel booking-form-grid grid-cols-1" onSubmit={calculate}>
      <label>Тариф<NativeSelect value={mode} onChange={e=>setMode(e.target.value)} disabled={disabled||checking}><option value="daily">На сутки · 24 часа</option>{property.policy?.hourly_price>0&&<option value="hourly">На часы · минимум {property.policy.min_hours} ч.</option>}{property.policy?.nightly_price>0&&<option value="nightly">По ночам · расчётный час</option>}</NativeSelect></label>
      <div className="input-row"><label>Заезд<Input name="start" required type="datetime-local" defaultValue={start} disabled={disabled||checking}/></label><label>Выезд<Input name="end" required type="datetime-local" defaultValue={end} disabled={disabled||checking}/></label></div>
      <label>Количество гостей<Input name="guests" type="number" min={1} max={property.capacity} defaultValue={guests} required disabled={disabled||checking}/></label>
      <span className="booking-timezone"><Clock3 size={16}/>Время Казахстана</span>
      {error&&<p ref={errorMessage} className="flow-error" role="alert">{error}</p>}
      <Button className="flow-primary" disabled={disabled||checking}>{checking?<><LoaderCircle size={17}/>Проверяю интервал…</>:<>Проверить даты и цену<ArrowUpRight size={17}/></>}</Button>
    </form><aside className="booking-context"><span className="flow-eyebrow">ВАША ПОЕЗДКА</span><h3>{property.title}</h3>{(property.city||property.district)&&<p>{[property.city,property.district].filter(Boolean).join(' · ')}</p>}<dl><div><dt>Вместимость</dt><dd>До {property.capacity} гостей</dd></div><div><dt>Тариф</dt><dd>{mode==='hourly'?money(property.policy.hourly_price)+' / час':mode==='nightly'?money(property.policy.nightly_price)+' / ночь':money(property.price)+' / сутки'}</dd></div></dl><p>Расчёт учитывает начатые часы, сутки или ночи выбранного интервала.</p><p>Проверим свободное время и покажем точную стоимость до отправки заявки.</p></aside></div>}
  </section>;
}
