'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowUpRight, CalendarDays, Check, Clock3, LoaderCircle } from 'lucide-react';

type Row=Record<string,any>;
const money=(n:number)=>new Intl.NumberFormat('ru-RU').format(n)+' ₸';
const local=(hours:number)=>new Date(Date.now()+(hours+5)*3600000).toISOString().slice(0,16);
const date=(n:number)=>new Date(n*1000).toLocaleString('ru-RU',{timeZone:'Asia/Almaty',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'});

export function BookingRequest({property,requestKey,disabled,onQuote,onConfirm}:{
  property:Row;requestKey:string;disabled:boolean;onQuote:(body:Row)=>Promise<Row>;onConfirm:(body:Row)=>void;
}){
  const [start,setStart]=useState(()=>local(24)),[end,setEnd]=useState(()=>local(48)),[guests,setGuests]=useState(1);
  const [quote,setQuote]=useState<Row|null>(null),[checking,setChecking]=useState(false),[error,setError]=useState('');
  const [mode,setMode]=useState('daily'),[accepted,setAccepted]=useState(false);
  const card=useRef<HTMLElement>(null),errorMessage=useRef<HTMLParagraphElement>(null);
  useEffect(()=>{if(quote)card.current?.scrollIntoView({block:'start',behavior:'instant'});else if(error)errorMessage.current?.scrollIntoView({block:'nearest',behavior:'instant'});},[quote,error]);
  const body=()=>({propertyId:property.id,requestKey,start:start+'+05:00',end:end+'+05:00',guests,billingMode:mode});
  async function calculate(e:FormEvent){
    e.preventDefault();const values=new FormData(e.currentTarget as HTMLFormElement);
    const chosenStart=String(values.get('start')),chosenEnd=String(values.get('end')),chosenGuests=Number(values.get('guests'));
    setStart(chosenStart);setEnd(chosenEnd);setGuests(chosenGuests);setChecking(true);setError('');setAccepted(false);
    try{setQuote(await onQuote({...body(),start:chosenStart+'+05:00',end:chosenEnd+'+05:00',guests:chosenGuests}));}catch(e:any){setError(e.message);}finally{setChecking(false);}
  }
  return <section ref={card} className="inline-card booking-request" aria-label="Оформление заявки">
    <div className="card-eyebrow"><CalendarDays size={16}/>Заявка на проживание</div>
    <h3>{property.title}</h3>
    <ol className="booking-steps" aria-label="Этапы заявки"><li className="complete"><Check size={13}/>Квартира</li><li className="current" aria-current="step">{quote?'2. Проверка':'2. Даты'}</li><li>3. Заявка</li></ol>
    {quote?<div className="quote-review">
      <dl><div><dt>Заезд</dt><dd>{date(quote.start)}</dd></div><div><dt>Выезд</dt><dd>{date(quote.end)}</dd></div><div><dt>Гостей</dt><dd>{quote.guests}</dd></div><div><dt>Проживание</dt><dd>{quote.periods} × {money(quote.price)} · {quote.unitLabel}</dd></div><div><dt>Депозит</dt><dd>{quote.policy.deposit?money(quote.policy.deposit):'Не предусмотрен'}</dd></div></dl>
      <div className="quote-total"><span>Стоимость проживания</span><strong>{money(quote.amount)}</strong></div>
      <p className="quote-note"><Clock3 size={16}/>После выезда предусмотрено {quote.cleaningMinutes} мин. на подготовку квартиры.</p>
      <p className="quote-note">Депозит учитывается отдельно от проживания. Отправка заявки не списывает деньги.</p>
      {quote.policy.house_rules&&<p className="quote-note" style={{whiteSpace:'pre-wrap'}}>{quote.policy.house_rules}</p>}
      <p className="quote-note">Интервал ещё не зарезервирован. {quote.policy.auto_confirm?'Бронь подтверждается автоматически по правилам владельца.':'После отправки заявки он удерживается до решения владельца на 30 минут.'}</p>
      <label className="check-label"><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/>Согласен с указанными датами, тарифом, депозитом и правилами проживания</label>
      <div className="inline-actions"><button className="inline-button" disabled={disabled||!accepted} onClick={()=>onConfirm({...body(),expectedAmount:quote.amount,expectedPolicyVersion:quote.policy.version,acceptTerms:accepted})}>Отправить заявку<ArrowUpRight size={16}/></button><button className="inline-button secondary" disabled={disabled} onClick={()=>setQuote(null)}><ArrowLeft size={15}/>Изменить даты</button></div>
    </div>:<form className="inline-form" onSubmit={calculate}>
      <label>Тариф<select value={mode} onChange={e=>setMode(e.target.value)} disabled={disabled||checking}><option value="daily">Начатые сутки, 24 часа</option>{property.policy?.hourly_price>0&&<option value="hourly">Почасово · минимум {property.policy.min_hours} ч.</option>}{property.policy?.nightly_price>0&&<option value="nightly">По ночам, с расчётным часом</option>}</select></label>
      <div className="input-row"><label>Заезд<input name="start" required type="datetime-local" defaultValue={start} disabled={disabled||checking}/></label><label>Выезд<input name="end" required type="datetime-local" defaultValue={end} disabled={disabled||checking}/></label></div>
      <label>Количество гостей<input name="guests" type="number" min={1} max={property.capacity} defaultValue={guests} required disabled={disabled||checking}/></label>
      <small>Время Казахстана, UTC+5. {mode==='nightly'?`Заезд в ${String(Math.floor(property.policy.checkin_minutes/60)).padStart(2,'0')}:${String(property.policy.checkin_minutes%60).padStart(2,'0')}, выезд в ${String(Math.floor(property.policy.checkout_minutes/60)).padStart(2,'0')}:${String(property.policy.checkout_minutes%60).padStart(2,'0')}.`:mode==='hourly'?money(property.policy.hourly_price)+' за каждый начатый час.':money(property.price)+' за каждые начатые 24 часа.'} Проверю свободный интервал перед отправкой.</small>
      {error&&<p ref={errorMessage} className="form-error" role="alert">{error}</p>}
      <button className="inline-button" disabled={disabled||checking}>{checking?<><LoaderCircle size={16}/>Проверяю интервал…</>:<>Проверить даты и стоимость<ArrowUpRight size={16}/></>}</button>
    </form>}
  </section>;
}
