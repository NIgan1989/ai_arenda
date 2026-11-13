'use client';
import {useEffect,useState} from 'react';
import {Sparkles,Check,ChevronRight,CalendarClock,House,Brush,CircleAlert} from 'lucide-react';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {Thinking} from './thinking';
import './autopilot-plan.css';

type Row=Record<string,any>;
const money=(n:number)=>new Intl.NumberFormat('ru-RU').format(n||0)+' ₸';
const date=(t:number)=>new Date(t*1000).toLocaleDateString('ru-RU',{timeZone:'Asia/Qyzylorda',day:'numeric',month:'long'});
const DAYS=['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
const hhmm=(m:number)=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
const toMinutes=(v:string)=>{const [h,m]=v.split(':').map(Number);return Math.max(0,Math.min(1440,(h||0)*60+(m||0)));};
export const planFeatures:Record<'owner'|'cleaner',string[]>={
 owner:['Принимает брони и отвечает гостям за вас, днём и ночью','Заказывает уборку, назначает исполнителя и находит замену','Принимает уборку по фотоотчёту и отмечает выезд гостя','Квартира выше в подборе для гостей','Комиссия с брони обычная, без надбавки за ИИ','Итоги недели по понедельникам'],
 cleaner:['Берёт уборки сам по вашим правилам: районы, дни, часы, оплата','Подходящие уборки приходят вам раньше остальных','План дня в 8:00: адреса по порядку и время','«Не могу сегодня»: ИИ вернёт уборки и найдёт замену','Итоги недели в профиле']
};

// The «Автопилот» plan on the account page: what it gives, how to turn it on, and how it runs.
export function AutopilotPlan({role,api}:{role:'owner'|'cleaner';api:(path:string,body?:Row)=>Promise<Row>}){
 const owner=role==='owner';
 const [state,setState]=useState<Row|null>(null),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const [picked,setPicked]=useState<string[]>([]),[fees,setFees]=useState<Row>({}),[rules,setRules]=useState<Row>({districts:[],days:63,fromMinute:600,toMinute:1140,minFee:0,maxPerDay:4,askNewOwner:true});
 useEffect(()=>{let live=true;api('operations/autopilot/state').then(v=>{if(!live)return;setState(v);if(v.rules)setRules(v.rules);setPicked((v.flats||[]).filter((f:Row)=>f.managed||f.ready).map((f:Row)=>f.id));}).catch(e=>live&&setError(e.message));return()=>{live=false;};},[role]);
 async function run(path:string,body:Row={}){setBusy(true);setError('');setMessage('');try{const r=await api(path,body);setMessage(r.message||'Сохранено.');const next=r.state||await api('operations/autopilot/state');setState(next);if(next.live)setOpen(false);return r;}catch(e:any){setError(e.message);}finally{setBusy(false);}}
 if(!state)return <section className="acct-group plan-loading">{error?<p className="form-error" role="alert">{error}</p>:<p role="status"><Thinking size="sm" lead/>Загружаю тариф…</p>}</section>;
 const s=state.settings||{},plan=state.plan,live=!!state.live;
 const priceLine=owner?money(s.price)+' в месяц за квартиру':money(s.price)+' в месяц';
 const statusLine=!plan?'':plan.status==='trial'?`Пробный период до ${date(plan.periodEnd)}`+(s.charge?`, потом ${owner?money(state.nextAmount)+' в месяц с баланса':money(s.price)+' в месяц из выплат'}`:', плата пока не взимается'):plan.status==='grace'?`Не хватило денег. Автопилот работает до ${date(plan.graceUntil)}, пополните баланс`:plan.status==='active'?(plan.autoRenew?`Оплачено до ${date(plan.periodEnd)}`:`Работает до ${date(plan.periodEnd)} и не продлится`):'';
 const live_=<div className="plan-live-copy"><span className="plan-dot"/>{plan?.status==='trial'?'Автопилот включён · пробный период':plan?.status==='grace'?'Автопилот · нужна оплата':'Автопилот включён'}</div>;
 const toggleDay=(i:number)=>setRules({...rules,days:rules.days^(1<<i)});
 const toggleDistrict=(d:string)=>setRules({...rules,districts:rules.districts.includes(d)?rules.districts.filter((x:string)=>x!==d):[...rules.districts,d]});
 const connect=owner?<div className="plan-connect">
   <h4>Квартиры на автопилоте</h4>
   {(state.flats||[]).length===0&&<p className="plan-note">Сначала добавьте квартиру.</p>}
   <ul className="plan-flats">{(state.flats||[]).map((f:Row)=><li key={f.id}><label><input type="checkbox" checked={picked.includes(f.id)} disabled={busy||!f.ready||f.managed} onChange={e=>setPicked(e.target.checked?[...picked,f.id]:picked.filter(x=>x!==f.id))}/><span><strong>{f.title}</strong><small>{f.managed?'Уже на автопилоте':!f.ready?'Сначала заполните тарифы квартиры':money(s.price)+' в месяц'}</small></span></label>
    {f.ready&&!f.managed&&picked.includes(f.id)&&!f.cleaningFee&&<label className="plan-fee">Цена уборки после выезда<Input inputMode="numeric" value={fees[f.id]||''} onChange={e=>setFees({...fees,[f.id]:e.target.value.replace(/\D/g,'').slice(0,7)})} placeholder="5000"/></label>}</li>)}</ul>
   <div className="plan-sum"><span>{plan?'Оплата':'Первые '+s.trialDays+' дней'}</span><strong>{plan?money(s.price*Math.max(1,picked.filter(id=>!(state.flats||[]).find((f:Row)=>f.id===id)?.managed).length+(state.units||0)))+' в месяц':'бесплатно'}</strong>{!plan&&<><span>Потом, {Math.max(1,picked.length)} кв.</span><strong>{money(s.price*Math.max(1,picked.length))} в месяц</strong></>}</div>
   <p className="plan-note">ИИ всё равно спросит вас о брони с высоким риском и о новом исполнителе. Принятые брони и уборки при отключении остаются в силе.</p>
   <Button className="plan-cta" disabled={busy||!picked.filter(id=>!(state.flats||[]).find((f:Row)=>f.id===id)?.managed).length} onClick={()=>run('operations/autopilot/start',{propertyIds:picked.filter(id=>!(state.flats||[]).find((f:Row)=>f.id===id)?.managed),cleaningFees:Object.fromEntries(Object.entries(fees).filter(([,v])=>v).map(([k,v])=>[k,Number(v)]))})}>{live?'Добавить квартиры':'Включить автопилот'}</Button>
  </div>:<div className="plan-connect">
   <h4>Районы</h4>
   <div className="plan-chips">{(state.cityDistricts||[]).length===0&&<p className="plan-note">Районы появятся, когда в вашем городе будут квартиры. Пока ИИ берёт уборки по всему городу.</p>}{(state.cityDistricts||[]).map((d:string)=><button key={d} type="button" aria-pressed={rules.districts.includes(d)} onClick={()=>toggleDistrict(d)}>{d}</button>)}</div>
   <p className="plan-note">{rules.districts.length?'Только выбранные районы.':'Не выбрано: весь город.'}</p>
   <h4>Когда работаю</h4>
   <div className="plan-days">{DAYS.map((d,i)=><button key={d} type="button" aria-pressed={!!(rules.days>>i&1)} onClick={()=>toggleDay(i)}>{d}</button>)}</div>
   <div className="plan-two"><label>С<Input type="time" step={1800} value={hhmm(rules.fromMinute)} onChange={e=>setRules({...rules,fromMinute:toMinutes(e.target.value)})}/></label><label>До<Input type="time" step={1800} value={hhmm(Math.min(rules.toMinute,1439))} onChange={e=>setRules({...rules,toMinute:toMinutes(e.target.value)})}/></label></div>
   <h4>Оплата и нагрузка</h4>
   <div className="plan-two"><label>Не меньше, ₸<Input inputMode="numeric" value={String(rules.minFee||'')} placeholder="0" onChange={e=>setRules({...rules,minFee:Number(e.target.value.replace(/\D/g,'').slice(0,7)||0)})}/></label><label>Уборок в день<Input inputMode="numeric" value={String(rules.maxPerDay)} onChange={e=>setRules({...rules,maxPerDay:Math.max(1,Math.min(20,Number(e.target.value.replace(/\D/g,'')||1)))})}/></label></div>
   <label className="plan-check"><input type="checkbox" checked={!!rules.askNewOwner} onChange={e=>setRules({...rules,askNewOwner:e.target.checked})}/>Спрашивать меня про нового владельца</label>
   {!plan&&<div className="plan-sum"><span>Первые {s.trialDays} дней</span><strong>бесплатно</strong><span>Потом</span><strong>{money(s.price)} в месяц из выплат</strong></div>}
   <Button className="plan-cta" disabled={busy||!rules.days} onClick={()=>run(live?'operations/autopilot/rules':'operations/autopilot/start',rules)}>{live?'Сохранить правила':'Включить автопилот'}</Button>
  </div>;
 return <>
  <div className="acct-live" aria-live="polite">{error&&<p className="form-error" role="alert">{error}</p>}{message&&<p role="status" className="acct-saved">{message}</p>}</div>
  {!live?<>
   <section className="acct-group plan-current"><div className="acct-row"><Sparkles size={20}/><span>{owner?'Сам':'Обычный'}<small>{owner?'Брони и уборки подтверждаете вы. ИИ подсказывает.':'На каждое предложение уборки отвечаете вы.'}</small></span><em className="plan-free">Бесплатно</em></div></section>
   <section className="plan-card">
    <span className="plan-badge"><Sparkles size={14}/>AI администратор</span>
    <h3>{owner?'Автопилот':'Автопилот исполнителя'}</h3>
    <p className="plan-price"><strong>{money(s.price)}</strong>{owner?'в месяц за квартиру':'в месяц'}</p>
    {plan?.status==='paused'&&<p className="plan-paused"><CircleAlert size={16}/>Автопилот на паузе. Принятые брони и уборки в силе.</p>}
    <ul className="plan-features">{planFeatures[role].map(f=><li key={f}><Check size={18}/>{f}</li>)}</ul>
    {owner&&<p className="plan-keep">Вам остаются деньги и решения: правка объявления, рискованные брони, споры. ИИ спросит вас кнопкой.</p>}
    {open?connect:<Button className="plan-cta" disabled={busy} onClick={()=>setOpen(true)}>{s.trialDays>0&&!plan?`Попробовать ${s.trialDays} дней бесплатно`:'Подключить за '+priceLine}</Button>}
    <p className="plan-fine">{s.charge?(owner?'Оплата с баланса в приложении раз в месяц.':'Оплата удерживается из выплат за уборки.')+' Отключить можно в любой день.':'Пока плата не взимается. Отключить можно в любой день.'}</p>
   </section>
  </>:<>
   <section className="plan-on">{live_}<h3>{owner?`ИИ ведёт ${state.units} ${state.units===1?'квартиру':state.units>1&&state.units<5?'квартиры':'квартир'}`:state.today?.length?`ИИ взял ${state.today.length} ${state.today.length===1?'уборку':state.today.length<5?'уборки':'уборок'} на сегодня`:'ИИ берёт уборки по вашим правилам'}</h3><p>{statusLine}</p></section>
   <h3 className="acct-label">За эту неделю</h3>
   <dl className="plan-stats">{owner?<><div><dt>ответов гостям</dt><dd>{state.week.answered}</dd></div><div><dt>броней на автопилоте</dt><dd>{state.week.bookings}</dd></div><div><dt>уборок принято</dt><dd>{state.week.cleanings}</dd></div></>:<><div><dt>уборок взял ИИ</dt><dd>{state.week.taken}</dd></div><div><dt>заработано</dt><dd>{money(state.week.earned)}</dd></div></>}</dl>
   {!owner&&<><h3 className="acct-label">План на сегодня</h3><section className="acct-group plan-today">{state.today?.length?state.today.map((j:Row)=><div key={j.id} className="acct-row"><CalendarClock size={20}/><span>{j.from}–{j.to} · {j.title}<small>{[j.district,j.address].filter(Boolean).join(', ')} · {money(j.fee)}</small></span></div>):<div className="acct-row"><Brush size={20}/><span>На сегодня уборок нет</span></div>}
    {state.today?.length>0&&<button type="button" className="acct-row plan-away" disabled={busy} onClick={()=>run('operations/autopilot/away')}><CircleAlert size={20}/><span>Не могу сегодня, найти замену<small>ИИ вернёт уборки владельцам и найдёт замену</small></span><ChevronRight size={16}/></button>}</section></>}
   <h3 className="acct-label">Настройки автопилота</h3>
   <section className="acct-group">
    <details className="acct-details" open={open} onToggle={e=>setOpen((e.target as HTMLDetailsElement).open)}><summary>{owner?<House size={20}/>:<Brush size={20}/>}<span>{owner?'Квартиры':'Правила'}</span><em>{owner?state.units+' на автопилоте':(rules.districts.length?rules.districts.length+' р-на · ':'весь город · ')+hhmm(rules.fromMinute)+'–'+hhmm(Math.min(rules.toMinute,1439))}</em><ChevronRight size={16}/></summary><div className="acct-body">{owner&&<ul className="plan-flats is-list">{(state.flats||[]).filter((f:Row)=>f.managed).map((f:Row)=><li key={f.id}><Check size={16}/>{f.title}</li>)}</ul>}{connect}</div></details>
    <button type="button" className="acct-row acct-danger" disabled={busy} onClick={()=>run('operations/autopilot/stop')}><span>Отключить автопилот<small>{plan?.status==='active'&&s.charge?'Доработает оплаченный месяц':owner?'Квартиры перейдут в режим «Я сам»':'Предложения снова будут приходить вам'}</small></span></button>
   </section>
  </>}
 </>;
}
