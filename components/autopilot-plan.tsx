'use client';
import {useEffect,useState} from 'react';
import {Sparkles,Check,ChevronRight,ChevronLeft,CalendarClock,House,Brush,CircleAlert} from 'lucide-react';
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
const plural=(n:number,one:string,few:string,many:string)=>n%10===1&&n%100!==11?one:[2,3,4].includes(n%10)&&![12,13,14].includes(n%100)?few:many;
export const planFeatures:Record<'owner'|'cleaner',string[]>={
 owner:['Принимает брони и отвечает гостям за вас, днём и ночью','Заказывает уборку, назначает исполнителя и находит замену','Принимает уборку по фотоотчёту и отмечает выезд гостя','Жильё выше в подборе для гостей','Комиссия с брони обычная, без надбавки за ИИ','Итоги недели по понедельникам'],
 cleaner:['Берёт уборки сам по вашим правилам: районы, дни, часы, оплата','Подходящие уборки приходят вам раньше остальных','План дня в 8:00: адреса по порядку и время','«Не могу сегодня»: ИИ вернёт уборки и найдёт замену','Итоги недели в профиле']
};
export const planSteps:Record<'owner'|'cleaner',string[]>={owner:['Объекты','Уборка','Итог'],cleaner:['Где и когда','Оплата','Итог']};

// The steps of connecting the plan: done ones can be reopened, the next ones open in order.
function Steps({steps,current,onPick}:{steps:string[];current:number;onPick:(i:number)=>void}){
 return <ol className="plan-steps" aria-label="Шаги подключения">{steps.map((label,i)=><li key={label} className={i<current?'is-done':i===current?'is-current':undefined} aria-current={i===current?'step':undefined}>
  <button type="button" disabled={i>current} onClick={()=>onPick(i)}><span className="plan-step-dot">{i<current?<Check size={14}/>:i+1}</span><span className="plan-step-label">{label}</span></button>
 </li>)}</ol>;
}

// The «Автопилот» plan on the account page: what it gives, how to turn it on, and how it runs.
export function AutopilotPlan({role,api}:{role:'owner'|'cleaner';api:(path:string,body?:Row)=>Promise<Row>}){
 const owner=role==='owner';
 const [state,setState]=useState<Row|null>(null),[open,setOpen]=useState(false),[step,setStep]=useState(0),[confirmOff,setConfirmOff]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const [picked,setPicked]=useState<string[]>([]),[fees,setFees]=useState<Row>({}),[rules,setRules]=useState<Row>({districts:[],days:63,fromMinute:600,toMinute:1140,minFee:0,maxPerDay:4,askNewOwner:true});
 useEffect(()=>{let live=true;api('operations/autopilot/state').then(v=>{if(!live)return;setState(v);if(v.rules)setRules(v.rules);setPicked((v.flats||[]).filter((f:Row)=>f.managed||f.ready).map((f:Row)=>f.id));}).catch(e=>live&&setError(e.message));return()=>{live=false;};},[role]);
 async function run(path:string,body:Row={}){setBusy(true);setError('');setMessage('');try{const r=await api(path,body);setMessage(r.message||'Сохранено.');const next=r.state||await api('operations/autopilot/state');setState(next);if(next.live){setOpen(false);setStep(0);}setConfirmOff(false);return r;}catch(e:any){setError(e.message);}finally{setBusy(false);}}
 if(!state)return <section className="acct-group plan-loading">{error?<p className="form-error" role="alert">{error}</p>:<p role="status"><Thinking size="sm" lead/>Загружаю тариф…</p>}</section>;
 const s=state.settings||{},plan=state.plan,live=!!state.live,flats:Row[]=state.flats||[];
 const statusLine=!plan?'':plan.status==='trial'?`Пробный период до ${date(plan.periodEnd)}`+(s.charge?`, потом ${owner?money(state.nextAmount)+' в месяц с баланса':money(s.price)+' в месяц из выплат'}`:', плата пока не взимается'):plan.status==='grace'?`Не хватило денег. Автопилот работает до ${date(plan.graceUntil)}, пополните баланс`:plan.status==='active'?(plan.autoRenew?`Оплачено до ${date(plan.periodEnd)}`:`Работает до ${date(plan.periodEnd)} и не продлится`):'';
 const offNote=plan?.status==='active'&&s.charge?'Доработает оплаченный месяц и не продлится.':owner?'Объекты перейдут в режим «Я сам». Принятые брони и уборки останутся в силе.':'Предложения уборок снова будут приходить вам на решение. Принятые уборки останутся.';
 const steps=planSteps[role],last=steps.length-1;
 const start=()=>{setOpen(true);setStep(0);setMessage('');};
 // Owner: flats not yet under the AI, and the cleaning price each still needs.
 const fresh=flats.filter(f=>picked.includes(f.id)&&f.ready&&!f.managed),needFee=fresh.filter(f=>!f.cleaningFee&&!f.ownStaff),feeMissing=needFee.some(f=>Number(fees[f.id]||0)<100);
 const units=fresh.length+(state.units||0);
 const canNext=owner?(step===0?fresh.length>0:step===1?!feeMissing:true):(step===0?!!rules.days&&rules.toMinute-rules.fromMinute>=60:true);
 const sum=<div className="plan-sum">{plan?<><span>Оплата</span><strong>{money(s.price*Math.max(1,owner?units:1))} в месяц</strong></>:<><span>Первые {s.trialDays} дней</span><strong>бесплатно</strong><span>Потом{owner?`, ${Math.max(1,fresh.length)} кв.`:''}</span><strong>{money(s.price*Math.max(1,owner?fresh.length:1))} в месяц{owner?'':' из выплат'}</strong></>}</div>;
 const finish=owner
  ?()=>run('operations/autopilot/start',{propertyIds:fresh.map(f=>f.id),cleaningFees:Object.fromEntries(Object.entries(fees).filter(([,v])=>v).map(([k,v])=>[k,Number(v)]))})
  :()=>run(live?'operations/autopilot/rules':'operations/autopilot/start',rules);
 const toggleDistrict=(d:string)=>setRules({...rules,districts:rules.districts.includes(d)?rules.districts.filter((x:string)=>x!==d):[...rules.districts,d]});
 const ownerStep=[
  <div key="flats" className="plan-connect">
   <p className="plan-step-lead">Отметьте объекты, которые поведёт ИИ.</p>
   {flats.length===0&&<p className="plan-note">Сначала добавьте жильё.</p>}
   <ul className="plan-flats">{flats.map(f=><li key={f.id}><label><input type="checkbox" checked={picked.includes(f.id)||f.managed} disabled={busy||!f.ready||f.managed} onChange={e=>setPicked(e.target.checked?[...picked,f.id]:picked.filter(x=>x!==f.id))}/><span><strong>{f.title}</strong><small>{f.managed?'Уже на автопилоте':!f.ready?'Сначала заполните тарифы жилья':money(s.price)+' в месяц'}</small></span></label></li>)}</ul>
  </div>,
  <div key="fees" className="plan-connect">
   <p className="plan-step-lead">После каждого выезда ИИ закажет уборку по этой цене и найдёт исполнителя.</p>
   <ul className="plan-flats">{fresh.map(f=><li key={f.id}>{f.ownStaff?<span className="plan-fee-row"><strong>{f.title}</strong><small>Убирает свой персонал, ИИ исполнителей не ищет</small></span>:f.cleaningFee?<span className="plan-fee-row"><strong>{f.title}</strong><small>Уборка {money(f.cleaningFee)}, уже указана</small></span>:<label className="plan-fee"><strong>{f.title}</strong>Цена уборки, ₸<Input inputMode="numeric" value={fees[f.id]||''} onChange={e=>setFees({...fees,[f.id]:e.target.value.replace(/\D/g,'').slice(0,7)})} placeholder="5000"/></label>}</li>)}</ul>
  </div>,
  <div key="sum" className="plan-connect">
   <ul className="plan-flats is-list">{fresh.map(f=><li key={f.id}><Check size={16}/>{f.title}</li>)}</ul>
   {sum}
   <p className="plan-note">ИИ всё равно спросит вас о брони с высоким риском и о новом исполнителе. Принятые брони и уборки при отключении остаются в силе.</p>
  </div>
 ];
 const cleanerStep=[
  <div key="where" className="plan-connect">
   <h4>Районы</h4>
   <div className="plan-chips">{(state.cityDistricts||[]).map((d:string)=><button key={d} type="button" aria-pressed={rules.districts.includes(d)} onClick={()=>toggleDistrict(d)}>{d}</button>)}</div>
   <p className="plan-note">{(state.cityDistricts||[]).length===0?'Районы появятся, когда в вашем городе будет жильё. Пока ИИ берёт уборки по всему городу.':rules.districts.length?'Только выбранные районы.':'Не выбрано: весь город.'}</p>
   <h4>Когда работаю</h4>
   <div className="plan-days">{DAYS.map((d,i)=><button key={d} type="button" aria-pressed={!!(rules.days>>i&1)} onClick={()=>setRules({...rules,days:rules.days^(1<<i)})}>{d}</button>)}</div>
   <div className="plan-two"><label>С<Input type="time" step={1800} value={hhmm(rules.fromMinute)} onChange={e=>setRules({...rules,fromMinute:toMinutes(e.target.value)})}/></label><label>До<Input type="time" step={1800} value={hhmm(Math.min(rules.toMinute,1439))} onChange={e=>setRules({...rules,toMinute:toMinutes(e.target.value)})}/></label></div>
   {!rules.days&&<p className="plan-note">Выберите хотя бы один день.</p>}
  </div>,
  <div key="pay" className="plan-connect">
   <div className="plan-two"><label>Не меньше, ₸<Input inputMode="numeric" value={String(rules.minFee||'')} placeholder="0" onChange={e=>setRules({...rules,minFee:Number(e.target.value.replace(/\D/g,'').slice(0,7)||0)})}/></label><label>Уборок в день<Input inputMode="numeric" value={String(rules.maxPerDay)} onChange={e=>setRules({...rules,maxPerDay:Math.max(1,Math.min(20,Number(e.target.value.replace(/\D/g,'')||1)))})}/></label></div>
   <label className="plan-switch"><span>Спрашивать про нового владельца<small>Первую уборку у незнакомого владельца ИИ не возьмёт без вас</small></span><input type="checkbox" role="switch" className="acct-switch" checked={!!rules.askNewOwner} onChange={e=>setRules({...rules,askNewOwner:e.target.checked})}/></label>
  </div>,
  <div key="sum" className="plan-connect">
   <dl className="plan-review"><div><dt>Районы</dt><dd>{rules.districts.length?rules.districts.join(', '):'весь город'}</dd></div><div><dt>Дни и часы</dt><dd>{DAYS.filter((_,i)=>rules.days>>i&1).join(', ')} · {hhmm(rules.fromMinute)}–{hhmm(Math.min(rules.toMinute,1439))}</dd></div><div><dt>Оплата</dt><dd>{rules.minFee?'от '+money(rules.minFee):'любая'} · до {rules.maxPerDay} в день</dd></div><div><dt>Новый владелец</dt><dd>{rules.askNewOwner?'спросить меня':'брать сразу'}</dd></div></dl>
   {!plan&&sum}
  </div>
 ];
 const wizard=<div className="plan-wizard">
  <Steps steps={steps} current={step} onPick={setStep}/>
  {(owner?ownerStep:cleanerStep)[step]}
  <div className="plan-wizard-nav">
   {step>0?<Button type="button" variant="outline" disabled={busy} onClick={()=>setStep(step-1)}><ChevronLeft size={16}/>Назад</Button>:<Button type="button" variant="outline" disabled={busy} onClick={()=>{setOpen(false);setStep(0);}}>Отмена</Button>}
   {step<last?<Button type="button" disabled={busy||!canNext} onClick={()=>setStep(step+1)}>Далее<ChevronRight size={16}/></Button>
    :<Button type="button" className="plan-cta" disabled={busy||(owner&&!fresh.length)} onClick={finish}>{live?(owner?'Добавить объекты':'Сохранить правила'):s.trialDays>0&&!plan?'Включить бесплатно':'Включить за '+money(s.price*Math.max(1,owner?fresh.length:1))}</Button>}
  </div>
 </div>;
 return <>
  <div className="acct-live" aria-live="polite">{error&&<p className="form-error" role="alert">{error}</p>}{message&&<p role="status" className="acct-saved">{message}</p>}</div>
  {!live?<>
   <section className="acct-group plan-current"><div className="acct-row"><Sparkles size={20}/><span>{owner?'Сам':'Обычный'}<small>{owner?'Брони и уборки подтверждаете вы. ИИ подсказывает.':'На каждое предложение уборки отвечаете вы.'}</small></span><em className="plan-free">Бесплатно</em></div></section>
   <section className="plan-card">
    <span className="plan-badge"><Sparkles size={14}/>ИИ-администратор</span>
    <label className="plan-head"><span><strong>{owner?'Автопилот':'Автопилот исполнителя'}</strong><small><b>{money(s.price)}</b> {owner?'в месяц за объект':'в месяц'}{s.trialDays>0&&!plan?`, первые ${s.trialDays} дней бесплатно`:''}</small></span><input type="checkbox" role="switch" className="acct-switch plan-toggle" aria-label="Автопилот" checked={open} disabled={busy} onChange={e=>e.target.checked?start():(setOpen(false),setStep(0))}/></label>
    {plan?.status==='paused'&&<p className="plan-paused"><CircleAlert size={16}/>Автопилот на паузе. Принятые брони и уборки в силе.</p>}
    {open?wizard:<>
     <ul className="plan-features">{planFeatures[role].map(f=><li key={f}><Check size={18}/>{f}</li>)}</ul>
     {owner&&<p className="plan-keep">Вам остаются деньги и решения: правка объявления, рискованные брони, споры. ИИ спросит вас кнопкой.</p>}
     <Button className="plan-cta" disabled={busy} onClick={start}>{s.trialDays>0&&!plan?`Попробовать ${s.trialDays} дней бесплатно`:'Подключить'}</Button>
    </>}
    <p className="plan-fine">{s.charge?(owner?'Оплата с баланса в приложении раз в месяц.':'Оплата удерживается из выплат за уборки.')+' Отключить можно в любой день.':'Пока плата не взимается. Отключить можно в любой день.'}</p>
   </section>
  </>:<>
   <section className="plan-on">
    <label className="plan-on-head"><span className="plan-live-copy"><span className="plan-dot"/>{plan?.status==='trial'?'Автопилот включён · пробный период':plan?.status==='grace'?'Автопилот · нужна оплата':'Автопилот включён'}</span><input type="checkbox" role="switch" className="acct-switch plan-toggle is-on" aria-label="Автопилот включён" checked={!confirmOff} disabled={busy} onChange={e=>setConfirmOff(!e.target.checked)}/></label>
    <h3>{owner?`ИИ ведёт ${state.units} ${plural(state.units,'объект','объекта','объектов')}`:state.today?.length?`На сегодня ${state.today.length} ${plural(state.today.length,'уборка','уборки','уборок')}`:'ИИ берёт уборки по вашим правилам'}</h3><p>{statusLine}</p>
   </section>
   {confirmOff&&<section className="plan-off" role="alertdialog" aria-label="Отключить автопилот"><strong>Отключить автопилот?</strong><p>{offNote}</p><div className="plan-wizard-nav"><Button type="button" variant="outline" disabled={busy} onClick={()=>setConfirmOff(false)}>Оставить</Button><Button type="button" className="plan-danger" disabled={busy} onClick={()=>run('operations/autopilot/stop')}>Отключить</Button></div></section>}
   <h3 className="acct-label">За эту неделю</h3>
   <dl className="plan-stats">{owner?<><div><dt>ответов гостям</dt><dd>{state.week.answered}</dd></div><div><dt>броней на автопилоте</dt><dd>{state.week.bookings}</dd></div><div><dt>уборок принято</dt><dd>{state.week.cleanings}</dd></div></>:<><div><dt>уборок взял ИИ</dt><dd>{state.week.taken}</dd></div><div><dt>заработано</dt><dd>{money(state.week.earned)}</dd></div></>}</dl>
   {!owner&&<><h3 className="acct-label">План на сегодня</h3><section className="acct-group plan-today">{state.today?.length?state.today.map((j:Row)=><div key={j.id} className="acct-row"><CalendarClock size={20}/><span>{j.from}–{j.to} · {j.title}<small>{[j.district,j.address].filter(Boolean).join(', ')} · {money(j.fee)}</small></span></div>):<div className="acct-row"><Brush size={20}/><span>На сегодня уборок нет</span></div>}
    {state.today?.length>0&&<button type="button" className="acct-row plan-away" disabled={busy} onClick={()=>run('operations/autopilot/away')}><CircleAlert size={20}/><span>Не могу сегодня, найти замену<small>ИИ вернёт уборки владельцам и найдёт замену</small></span><ChevronRight size={16}/></button>}</section></>}
   <h3 className="acct-label">Настройки автопилота</h3>
   <section className="acct-group">
    <details className="acct-details" open={open} onToggle={e=>{const o=(e.target as HTMLDetailsElement).open;setOpen(o);if(o)setStep(0);}}><summary>{owner?<House size={20}/>:<Brush size={20}/>}<span>{owner?'Объекты':'Правила'}</span><em>{owner?state.units+' на автопилоте':(rules.districts.length?rules.districts.length+' р-на · ':'весь город · ')+hhmm(rules.fromMinute)+'–'+hhmm(Math.min(rules.toMinute,1439))}</em><ChevronRight size={16}/></summary><div className="acct-body">{wizard}</div></details>
   </section>
  </>}
 </>;
}
