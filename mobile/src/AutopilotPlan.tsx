import {L,dateText,forms,t as tr,tServer} from '../../lib/i18n';
import React,{useContext,useEffect,useState} from 'react';
import {View,Text,TextInput,Pressable,Switch,StyleSheet} from 'react-native';
import {FlatMenu,Group,Row,a} from './AccountRows';
import {ThinkingLine} from './Thinking';
import {request} from './api';
import {s,C,type,brandFont} from './styles';
import {T} from './tokens';
import type {Row as Data} from './model';
// The server writes the terms of each way to pay in Russian; they are shown in the language of the app.
const termsIn=(terms:{pay?:unknown;all?:unknown}|undefined)=>({pay:terms?.pay?tServer(String(terms.pay)):'',all:terms?.all?tServer(String(terms.all)):''});

const money=(n:number)=>new Intl.NumberFormat('ru-RU').format(n||0)+'\u00a0₸';
const date=(t:number)=>dateText(t*1000,{timeZone:'Asia/Qyzylorda',day:'numeric',month:'long'});
const DAYS=L(['Пн','Вт','Ср','Чт','Пт','Сб','Вс']);
const hhmm=(m:number)=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
const toMinutes=(v:string)=>{const [h,m]=v.split(':').map(Number);return Math.max(0,Math.min(1440,(h||0)*60+(m||0)));};
const FEATURES=L({
 owner:['Принимает брони и отвечает гостям за вас, днём и ночью','Заказывает уборку, назначает исполнителя и находит замену','Принимает уборку по фотоотчёту и отмечает выезд гостя','Жильё выше в подборе для гостей','Входит в тариф: без доплат за ИИ','Итоги недели по понедельникам'],
 cleaner:['Берёт уборки сам по вашим правилам: районы, дни, часы, оплата','Подходящие уборки приходят вам раньше остальных','План дня в 8:00: адреса по порядку и время','«Не могу сегодня»: ИИ вернёт уборки и найдёт замену','Итоги недели в профиле']
});
const STEPS=L({owner:['Объекты','Уборка','Итог'],cleaner:['Где и когда','Оплата','Итог']});

// The steps of connecting the plan: done ones can be reopened, the next ones open in order.
function Steps({steps,current,onPick}:{steps:string[];current:number;onPick:(i:number)=>void}){
 return <View style={p.steps}>{steps.map((label,i)=>{const done=i<current,now=i===current;return <React.Fragment key={label}>
  {i>0&&<View style={[p.stepLine,(done||now)&&p.stepLineOn]}/>}
  <Pressable accessibilityRole="button" accessibilityLabel={tr('Шаг {v}: {label}',{v:i+1,label})} accessibilityState={{selected:now,disabled:i>current}} disabled={i>current} onPress={()=>onPick(i)} style={p.step}>
   <View style={[p.dot,done&&p.dotDone,now&&p.dotNow]}><Text style={[p.dotText,done&&p.dotDoneText,now&&p.dotNowText]}>{done?'✓':i+1}</Text></View>
   <Text numberOfLines={1} style={[p.stepLabel,(done||now)&&p.stepLabelOn]}>{label}</Text>
  </Pressable>
 </React.Fragment>;})}</View>;
}

// The tariff on the «Автопилот» screen (one tariff in percent since 2026-11-22): what the participant pays and what is
// included, and what the last 30 days cost. Nothing to choose.
const pct=(bp:unknown)=>String(Number(bp??0)/100).replace('.',',')+'%';
function PayWay({state,owner}:{state:Data;owner:boolean}){
 const b=state.billing||{},st=state.settings||{},flat=useContext(FlatMenu),[open,setOpen]=useState(false);
 const rate=pct(owner?st.ownerRate:st.cleanerRate);
 // As the concept of the menu: the tariff is one row with its rate; what it includes and what it cost open under it.
 return <View style={[p.payWay,flat&&{marginHorizontal:-16}]}>
  <Row icon="wallet" title={tr('Тариф')} value={owner?tr('{rate} с заселения',{rate}):tr('{rate} с уборки',{rate})} open={open} onPress={()=>setOpen(v=>!v)}/>
  {open&&<View style={a.body}>
   <Text style={a.note}>{owner?tr('Автопилот, ИИ-администратор, подбор исполнителя, защита и аналитика входят. Доплат нет. Платите, только когда гость заселился.'):tr('Автопилот и заказы рядом бесплатно. Платите только с уборок, которые выполнили.')}</Text>
   {owner&&state.hallScale&&<Text style={a.note}>{tr('Залы и кафе платят за месяц: до {a} гостей {small}, до {b} гостей {mid}, больше {large}. Брони без ограничений. Месяц без броней через приложение бесплатный.',{a:state.hallScale.smallUpto,b:state.hallScale.midUpto,small:money(state.hallScale.small),mid:money(state.hallScale.mid),large:money(state.hallScale.large)})}</Text>}
   {/* «14 дней бесплатно»: from the first listing for an owner, from the first cleaning for a performer. */}
   {(b.freeDays>0||!!b.inviteUntil)&&(!b.freeUntil||b.freeUntil>Date.now()/1000)&&<Text style={a.note}>{b.freeUntil&&b.inviteUntil&&b.inviteUntil>=b.freeUntil?tr('Без комиссии до {date}: по приглашению.',{date:dateText(b.freeUntil*1000,{day:'numeric',month:'long',timeZone:'Asia/Almaty'})}):b.freeUntil?tr('Бесплатно до {date}: первые {days} дней.',{date:dateText(b.freeUntil*1000,{day:'numeric',month:'long',timeZone:'Asia/Almaty'}),days:b.freeDays}):owner?tr('Первые {days} дней с первого объявления бесплатно.',{days:b.freeDays}):tr('Первые {days} дней с первой уборки бесплатно.',{days:b.freeDays})}</Text>}
   {b.spent30>0&&<Text style={a.note}>{tr('За 30 дней: {spent}.',{spent:money(b.spent30)})}</Text>}
   <Text style={a.note}>{st.charge?tr('Всё копится и списывается одной суммой по понедельникам с привязанной карты.'):tr('Пока плата не взимается: сервис только считает.')}</Text>
  </View>}
 </View>;
}

// The owner's «Как платить» on the «Автопилот» screen: the owner turns the AI on per object (FlatAutopilot.tsx),
// so here is only the way to pay and the hint.
export function NativePayWay({role}:{role:'owner'|'cleaner'}){
 const [state,setState]=useState<Data|null>(null),[error,setError]=useState('');
 useEffect(()=>{let live=true;request('/api/operations/autopilot/state').then(v=>{if(live)setState(v);}).catch(e=>live&&setError(e.message));return()=>{live=false;};},[role]);
 if(!state)return error?<Text accessibilityRole="alert" style={s.error}>{error}</Text>:null;
 return <View style={{marginBottom:16}}><PayWay state={state} owner={role==='owner'}/></View>;
}

// The «Автопилот» plan on the account screen: what it gives, how to turn it on, how it runs.
export function NativeAutopilotPlan({role}:{role:'owner'|'cleaner'}){
 const owner=role==='owner';
 const [state,setState]=useState<Data|null>(null),[open,setOpen]=useState(false),[step,setStep]=useState(0),[confirmOff,setConfirmOff]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const [picked,setPicked]=useState<string[]>([]),[fees,setFees]=useState<Data>({}),[rules,setRules]=useState<Data>({districts:[],days:63,fromMinute:600,toMinute:1140,minFee:0,maxPerDay:4,askNewOwner:true});
 const [from,setFrom]=useState('10:00'),[to,setTo]=useState('19:00');
 useEffect(()=>{let live=true;request('/api/operations/autopilot/state').then(v=>{if(!live)return;setState(v);if(v.rules){setRules(v.rules);setFrom(hhmm(v.rules.fromMinute));setTo(hhmm(Math.min(v.rules.toMinute,1439)));}setPicked((v.flats||[]).filter((f:Data)=>f.managed||f.ready).map((f:Data)=>f.id));}).catch(e=>live&&setError(e.message));return()=>{live=false;};},[role]);
 async function run(path:string,body:Data={}){setBusy(true);setError('');setMessage('');try{const r=await request('/api/'+path,body);setMessage(r.message||tr('Сохранено.'));const next=r.state||await request('/api/operations/autopilot/state');setState(next);if(next.live&&!path.endsWith('/tier')){setOpen(false);setStep(0);}setConfirmOff(false);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 if(!state)return <Group title={tr('Тариф')}>{error?<Text accessibilityRole="alert" style={[s.error,{padding:16}]}>{error}</Text>:<View style={{padding:16}}><ThinkingLine style={s.meta} text={tr('Загружаем тариф…')}/></View>}</Group>;
 const st=state.settings||{},plan=state.plan,live=!!state.live,flats:Data[]=state.flats||[];
 const terms=termsIn(state.terms);
 const statusLine=!plan?'':(terms.pay||'')+(st.charge?'':' '+tr('Пока бесплатно.'));
 const priceLine=owner?tr('Входит в тариф'):tr('Бесплатно');
 const priceNote=owner?tr('{rate} с каждого заселения, без доплат за ИИ',{rate:pct(st.ownerRate)}):tr('Тариф: {rate} с каждой выполненной уборки',{rate:pct(st.cleanerRate)});
 const offNote=owner?tr('Объекты перейдут в режим «Я сам». Принятые брони и уборки останутся в силе.'):tr('Предложения уборок снова будут приходить вам на решение. Принятые уборки останутся.');
 const steps=STEPS[role],last=steps.length-1,num=(v:string)=>v.replace(/\D/g,'').slice(0,7);
 const begin=()=>{setOpen(true);setStep(0);setMessage('');};
 const fresh=flats.filter(f=>picked.includes(f.id)&&f.ready&&!f.managed),feeMissing=fresh.some(f=>!f.cleaningFee&&!f.ownStaff&&Number(fees[f.id]||0)<100);
 const fromM=toMinutes(from),toM=toMinutes(to);
 const canNext=owner?(step===0?fresh.length>0:step===1?!feeMissing:true):(step===0?!!rules.days&&toM-fromM>=60:true);
 const chip=(label:string,on:boolean,press:()=>void,wide=false)=><Pressable key={label} accessibilityRole="button" accessibilityState={{selected:on}} onPress={press} style={[p.chip,wide&&p.day,on&&(wide?p.dayOn:p.chipOn)]}><Text style={[p.chipText,on&&(wide?p.dayOnText:p.chipOnText)]}>{label}</Text></Pressable>;
 const btn=(title:string,fn:()=>void,kind:'main'|'line'|'danger'='main',disabled=false)=><Pressable accessibilityRole="button" disabled={busy||disabled} onPress={fn} style={[p.btn,kind==='line'&&p.btnLine,kind==='danger'&&p.btnDanger,(busy||disabled)&&s.disabled]}><Text style={[p.btnText,kind==='line'&&p.btnLineText]}>{title}</Text></Pressable>;
 const sum=<View style={p.sum}><Text style={p.sumLabel}>{tr('Оплата')}</Text><Text style={p.sumValue}>{owner?tr('{rate} с заселения, ИИ без доплат',{rate:pct(st.ownerRate)}):tr('{rate} с уборки',{rate:pct(st.cleanerRate)})}</Text></View>;
 const finish=owner
  ?()=>run('operations/autopilot/start',{propertyIds:fresh.map(f=>f.id),cleaningFees:Object.fromEntries(Object.entries(fees).filter(([,v])=>v).map(([k,v])=>[k,Number(v)]))})
  :()=>run(live?'operations/autopilot/rules':'operations/autopilot/start',{...rules,fromMinute:fromM,toMinute:toM});
 const ownerStep=[
  <View key="flats" style={p.connect}>
   <Text style={p.lead}>{tr('Отметьте объекты, которые поведёт ИИ.')}</Text>
   {flats.length===0&&<Text style={a.note}>{tr('Сначала добавьте жильё.')}</Text>}
   <View style={p.list}>{flats.map((f,i)=>{const on=picked.includes(f.id)||f.managed,locked=!f.ready||f.managed;return <Pressable key={f.id} accessibilityRole="checkbox" accessibilityState={{checked:on,disabled:locked}} disabled={busy||locked} onPress={()=>setPicked(picked.includes(f.id)?picked.filter(x=>x!==f.id):[...picked,f.id])} style={[p.flatRow,i>0&&p.flatLine]}><View style={[p.box,on&&p.boxOn]}>{on&&<Text style={p.tick}>✓</Text>}</View><View style={{flex:1}}><Text style={a.title}>{f.title}</Text><Text style={a.note}>{f.managed?tr('Уже на автопилоте'):!f.ready?tr('Сначала заполните тарифы жилья'):tr('Входит в тариф')}</Text></View></Pressable>;})}</View>
  </View>,
  <View key="fees" style={p.connect}>
   <Text style={p.lead}>{tr('После каждого выезда ИИ закажет уборку по этой цене и найдёт исполнителя.')}</Text>
   <View style={p.list}>{fresh.map((f,i)=><View key={f.id} style={[p.flat,i>0&&p.flatLine]}><Text style={a.title}>{f.title}</Text>{f.ownStaff?<Text style={a.note}>{tr('Убирает свой персонал, ИИ исполнителей не ищет')}</Text>:f.cleaningFee?<Text style={a.note}>{tr('Уборка {sum}, уже указана',{sum:money(f.cleaningFee)})}</Text>:<><Text style={a.note}>{tr('Цена уборки, ₸')}</Text><TextInput style={s.field} keyboardType="number-pad" value={fees[f.id]||''} placeholder="5000" onChangeText={v=>setFees({...fees,[f.id]:num(v)})}/></>}</View>)}</View>
  </View>,
  <View key="sum" style={p.connect}>
   {fresh.map(f=><View key={f.id} style={p.feature}><Text style={p.check}>✓</Text><Text style={p.featureText}>{f.title}</Text></View>)}
   {sum}
   <Text style={a.note}>{tr('ИИ всё равно спросит вас о брони с высоким риском и о новом исполнителе. Принятые брони и уборки при отключении остаются в силе.')}</Text>
  </View>
 ];
 const cleanerStep=[
  <View key="where" style={p.connect}>
   <Text style={p.h4}>{tr('Районы')}</Text>
   <View style={p.chips}>{(state.cityDistricts||[]).map((d:string)=>chip(d,rules.districts.includes(d),()=>setRules({...rules,districts:rules.districts.includes(d)?rules.districts.filter((x:string)=>x!==d):[...rules.districts,d]})))}</View>
   <Text style={a.note}>{(state.cityDistricts||[]).length===0?tr('Районы появятся, когда в вашем городе будет жильё. Пока ИИ берёт уборки по всему городу.'):rules.districts.length?tr('Только выбранные районы.'):tr('Не выбрано: весь город.')}</Text>
   <Text style={p.h4}>{tr('Когда работаю')}</Text>
   <View style={p.days}>{DAYS.map((d,i)=>chip(d,!!(rules.days>>i&1),()=>setRules({...rules,days:rules.days^(1<<i)}),true))}</View>
   <View style={p.two}><View style={p.half}><Text style={a.note}>{tr('С')}</Text><TextInput style={s.field} value={from} onChangeText={setFrom} placeholder="10:00"/></View><View style={p.half}><Text style={a.note}>{tr('До')}</Text><TextInput style={s.field} value={to} onChangeText={setTo} placeholder="19:00"/></View></View>
  </View>,
  <View key="pay" style={p.connect}>
   <View style={p.two}><View style={p.half}><Text style={a.note}>{tr('Не меньше, ₸')}</Text><TextInput style={s.field} keyboardType="number-pad" value={String(rules.minFee||'')} placeholder="0" onChangeText={v=>setRules({...rules,minFee:Number(num(v)||0)})}/></View><View style={p.half}><Text style={a.note}>{tr('Уборок в день')}</Text><TextInput style={s.field} keyboardType="number-pad" value={String(rules.maxPerDay)} onChangeText={v=>setRules({...rules,maxPerDay:Math.max(1,Math.min(20,Number(num(v)||1)))})}/></View></View>
   <View style={p.switchRow}><View style={{flex:1,gap:4}}><Text style={a.title}>{tr('Спрашивать про нового владельца')}</Text><Text style={a.note}>{tr('Первую уборку у незнакомого владельца ИИ не возьмёт без вас')}</Text></View><Switch accessibilityLabel={tr('Спрашивать про нового владельца')} value={!!rules.askNewOwner} onValueChange={v=>setRules({...rules,askNewOwner:v})} trackColor={{false:C.lineStrong,true:C.ink}} thumbColor={C.surface}/></View>
  </View>,
  <View key="sum" style={p.connect}>
   <View style={p.list}>{[[tr('Районы'),rules.districts.length?rules.districts.join(', '):tr('весь город')],[tr('Дни и часы'),DAYS.filter((_,i)=>rules.days>>i&1).join(', ')+' · '+from+'–'+to],[tr('Оплата'),tr('{v} · до {maxPerDay} в день',{v:(rules.minFee?tr('от {v}',{v:money(rules.minFee)}):tr('любая')),maxPerDay:rules.maxPerDay})],[tr('Новый владелец'),rules.askNewOwner?tr('спросить меня'):tr('брать сразу')]].map(([k,v],i)=><View key={k} style={[p.review,i>0&&p.flatLine]}><Text style={a.note}>{k}</Text><Text style={p.reviewValue}>{v}</Text></View>)}</View>
   {!plan&&sum}
  </View>
 ];
 const wizard=<View style={p.connect}>
  <Steps steps={steps} current={step} onPick={setStep}/>
  {(owner?ownerStep:cleanerStep)[step]}
  <View style={p.nav}>
   {step>0?btn(tr('‹ Назад'),()=>setStep(step-1),'line'):btn(tr('Отмена'),()=>{setOpen(false);setStep(0);},'line')}
   {step<last?btn(tr('Далее ›'),()=>setStep(step+1),'main',!canNext):btn(live?(owner?tr('Добавить объекты'):tr('Сохранить правила')):tr('Включить'),finish,'main',owner&&!fresh.length)}
  </View>
 </View>;
 const notice=<>{!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}{!!message&&<Text accessibilityLiveRegion="polite" style={a.saved}>{message}</Text>}</>;
 if(!live)return <>
  {/* The mode now; its rate is the row «Тариф» under the plan (PayWay). */}
  <Group space><View style={a.row}><View style={a.wide}><Text style={a.title}>{owner?tr('Сам'):tr('Обычный')}</Text><Text style={a.note}>{owner?tr('Брони и уборки подтверждаете вы. ИИ подсказывает.'):tr('На каждое предложение уборки отвечаете вы.')}</Text></View></View></Group>
  {notice}
  <View style={p.card}>
   <View style={p.head}><View style={{flex:1,gap:4}}><Text style={p.h3}>{owner?tr('Автопилот'):tr('Автопилот исполнителя')}</Text><Text style={p.price}><Text style={p.priceBig}>{priceLine}</Text>{'\n'}{priceNote}</Text></View><Switch accessibilityLabel={tr('Автопилот')} value={open} disabled={busy} onValueChange={v=>v?begin():(setOpen(false),setStep(0))} trackColor={{false:C.lineStrong,true:C.ink}} thumbColor={C.surface}/></View>
   {plan?.status==='paused'&&<Text style={p.paused}>{tr('Автопилот на паузе. Принятые брони и уборки в силе. Когда услуги оплачены, нажмите «Подключить», чтобы включить его снова.')}</Text>}
   {open?wizard:<>
    <View style={{gap:12}}>{FEATURES[role].map(f=><View key={f} style={p.feature}><Text style={p.check}>✓</Text><Text style={p.featureText}>{f}</Text></View>)}</View>
    {owner&&<Text style={p.keep}>{tr('Вам остаются деньги и решения: правка объявления, рискованные брони, споры. ИИ спросит вас кнопкой.')}</Text>}
    {btn(tr('Подключить'),begin)}
   </>}
   <Text style={p.fine}>{st.charge?tr('Списание раз в неделю с привязанной карты: Меню, «Настройки», «Оплата услуг». Отключить можно в любой день.'):tr('Пока плата не взимается. Отключить можно в любой день.')}</Text>
  </View>
  <PayWay state={state} owner={owner}/>
 </>;
 const n=state.today?.length||0;
 return <>
  <Text accessibilityRole="header" style={a.label}>{tr('Тариф')}</Text>
  <View style={p.on}>
   <View style={p.head}><Text style={[p.onLabel,{flex:1}]}>● {plan?.status==='grace'?tr('Автопилот · нужна оплата'):tr('Автопилот включён · входит в тариф')}</Text><Switch accessibilityLabel={tr('Автопилот включён')} value={!confirmOff} disabled={busy} onValueChange={v=>setConfirmOff(!v)} trackColor={{false:C.inkSoft,true:C.onAccent}} thumbColor={confirmOff?C.surface:C.ink}/></View>
   <Text style={p.onTitle}>{owner?tr(forms(state.units,'ИИ ведёт {n} объект','ИИ ведёт {n} объекта','ИИ ведёт {n} объектов'),{n:state.units}):n?tr(forms(n,'На сегодня {n} уборка','На сегодня {n} уборки','На сегодня {n} уборок'),{n}):tr('ИИ берёт уборки по вашим правилам')}</Text><Text style={p.onNote}>{statusLine}</Text>
  </View>
  {confirmOff&&<View accessibilityRole="alert" style={p.off}><Text style={a.title}>{tr('Отключить автопилот?')}</Text><Text style={a.note}>{offNote}</Text><View style={p.nav}>{btn(tr('Оставить'),()=>setConfirmOff(false),'line')}{btn(tr('Отключить'),()=>void run('operations/autopilot/stop'),'danger')}</View></View>}
  {notice}
  <PayWay state={state} owner={owner}/>
  <Text accessibilityRole="header" style={a.label}>{tr('За эту неделю')}</Text>
  <View style={p.stats}>{(owner?[[state.week.answered,tr('ответов гостям')],[state.week.bookings,tr('броней')],[state.week.cleanings,tr('уборок принято')]]:[[state.week.taken,tr('уборок взял ИИ')],[money(state.week.earned),tr('заработано')]]).map(([v,l])=><View key={String(l)} style={p.stat}><Text style={p.statValue}>{v}</Text><Text style={a.note}>{l}</Text></View>)}</View>
  {!owner&&<Group title={tr('План на сегодня')}>{n?state.today.map((j:Data)=><View key={j.id} style={a.row}><View style={a.wide}><Text style={a.title}>{j.from}–{j.to} · {j.title}</Text><Text style={a.note}>{[j.district,j.address].filter(Boolean).join(', ')} · {money(j.fee)}</Text></View></View>):<View style={a.row}><Text style={a.title}>{tr('На сегодня уборок нет')}</Text></View>}
   {n>0&&<Row title={tr('Не могу сегодня, найти замену')} note={tr('ИИ вернёт уборки владельцам и найдёт замену')} disabled={busy} onPress={()=>void run('operations/autopilot/away')}/>}</Group>}
  <Group title={tr('Настройки автопилота')}>
   <Row title={owner?tr('Объекты'):tr('Правила')} value={owner?tr('{units} на автопилоте',{units:state.units}):(rules.districts.length?tr('{length} р-на',{length:rules.districts.length}):tr('весь город'))} open={open} onPress={()=>{setOpen(v=>!v);setStep(0);}}/>
   {open&&<View style={a.body}>{wizard}</View>}
  </Group>
 </>;
}

const p=StyleSheet.create({
 card:{marginTop:12,borderRadius:T.radius.xl,padding:20,backgroundColor:C.surface,borderWidth:1,borderColor:C.line,gap:16},
 badge:{alignSelf:'flex-start',...type.caption,fontWeight:'600',color:C.ink,backgroundColor:C.surfaceAlt,borderWidth:1,borderColor:C.line,borderRadius:T.radius.full,paddingHorizontal:12,paddingVertical:4,overflow:'hidden'},
 head:{flexDirection:'row',alignItems:'center',gap:12},
 h3:{...type.subtitle,...brandFont,color:C.ink},
 price:{...type.label,color:C.muted},priceBig:{...type.subtitle,fontWeight:'600',color:C.ink},
 feature:{flexDirection:'row',gap:12},check:{...type.body,color:C.ink,fontWeight:'600'},featureText:{...type.body,color:C.inkSoft,flex:1},
 keep:{...type.label,color:C.inkSoft,backgroundColor:C.bg,borderRadius:T.radius.md,padding:12},
 paused:{...type.label,color:C.warning,backgroundColor:C.warningSoft,borderRadius:T.radius.md,padding:8,overflow:'hidden'},
 btn:{flex:1,minHeight:T.control.primary,borderRadius:T.radius.lg,backgroundColor:C.ink,alignItems:'center',justifyContent:'center',paddingHorizontal:12},btnText:{...type.body,color:C.onAccent,fontWeight:'600',textAlign:'center'},
 btnLine:{backgroundColor:C.surface,borderWidth:1,borderColor:C.lineStrong},btnLineText:{color:C.ink},btnDanger:{backgroundColor:C.danger},
 nav:{flexDirection:'row',gap:8},
 fine:{...type.caption,color:C.muted,textAlign:'center'},
 connect:{gap:12},lead:{...type.label,color:C.inkSoft},h4:{...type.caption,color:C.muted,fontWeight:'600',marginTop:4},
 steps:{flexDirection:'row',alignItems:'flex-start'},step:{alignItems:'center',gap:4,minWidth:T.control.touch,minHeight:T.control.touch},
 stepLine:{flex:1,height:2,marginTop:16,marginHorizontal:4,borderRadius:T.radius.full,backgroundColor:C.lineStrong},stepLineOn:{backgroundColor:C.ink},
 dot:{width:32,height:32,borderRadius:T.radius.full,borderWidth:2,borderColor:C.lineStrong,backgroundColor:C.surface,alignItems:'center',justifyContent:'center'},
 dotDone:{backgroundColor:C.ink,borderColor:C.ink},dotNow:{borderColor:C.ink,backgroundColor:C.surfaceAlt},
 dotText:{...type.label,fontWeight:'600',color:C.muted},dotDoneText:{color:C.onAccent},dotNowText:{color:C.ink},
 stepLabel:{...type.caption,color:C.muted},stepLabelOn:{color:C.ink,fontWeight:'600'},
 list:{borderWidth:1,borderColor:C.line,borderRadius:T.radius.lg,overflow:'hidden'},flat:{paddingHorizontal:16,paddingVertical:12,gap:8},flatLine:{borderTopWidth:1,borderTopColor:C.line},
 flatRow:{minHeight:T.control.touch,flexDirection:'row',alignItems:'center',gap:12,paddingHorizontal:16,paddingVertical:8},
 box:{width:24,height:24,borderRadius:T.radius.sm,borderWidth:1,borderColor:C.lineStrong,alignItems:'center',justifyContent:'center'},boxOn:{backgroundColor:C.ink,borderColor:C.ink},tick:{...type.label,color:C.onAccent,fontWeight:'600'},
 review:{flexDirection:'row',justifyContent:'space-between',gap:12,paddingHorizontal:16,paddingVertical:12},reviewValue:{...type.label,color:C.ink,fontWeight:'600',flexShrink:1,textAlign:'right'},
 switchRow:{flexDirection:'row',alignItems:'center',gap:12,minHeight:T.control.touch},
 sum:{flexDirection:'row',flexWrap:'wrap',rowGap:8,backgroundColor:C.surfaceAlt,borderWidth:1,borderColor:C.line,borderRadius:T.radius.lg,padding:16},
 sumLabel:{...type.label,color:C.inkSoft,width:'50%'},sumValue:{...type.label,color:C.ink,fontWeight:'600',width:'50%',textAlign:'right'},
 chips:{flexDirection:'row',flexWrap:'wrap',gap:8},
 chip:{minHeight:T.control.compact,paddingHorizontal:12,borderRadius:T.radius.full,borderWidth:1,borderColor:C.lineStrong,backgroundColor:C.surface,justifyContent:'center'},
 chipOn:{backgroundColor:C.surfaceAlt,borderColor:C.ink},chipText:{...type.label,color:C.inkSoft},chipOnText:{color:C.ink,fontWeight:'600'},
 days:{flexDirection:'row',gap:4},day:{flex:1,minHeight:T.control.touch,paddingHorizontal:0,borderRadius:T.radius.md,alignItems:'center'},dayOn:{backgroundColor:C.ink,borderColor:C.ink},dayOnText:{color:C.onAccent,fontWeight:'600'},
 two:{flexDirection:'row',gap:8},half:{flex:1,gap:4},
 on:{borderRadius:T.radius.xl,padding:20,backgroundColor:C.ink,gap:8},onLabel:{...type.caption,color:C.surfaceAlt,fontWeight:'600'},onTitle:{...type.title,color:C.onAccent,fontWeight:'600'},onNote:{...type.label,color:C.surfaceAlt},
 off:{marginTop:12,gap:8,padding:16,borderRadius:T.radius.lg,backgroundColor:C.dangerSoft},
 stats:{flexDirection:'row',flexWrap:'wrap',gap:12},stat:{flexGrow:1,flexBasis:96,backgroundColor:C.surface,borderWidth:1,borderColor:C.line,borderRadius:T.radius.lg,paddingHorizontal:16,paddingVertical:12},statValue:{...type.title,fontWeight:'600',color:C.ink},
 payWay:{},
 way:{flexDirection:'row',alignItems:'center',gap:12,padding:12,borderRadius:T.radius.lg,borderWidth:1,borderColor:C.line,backgroundColor:C.surface},wayOn:{borderColor:C.ink,backgroundColor:C.surfaceAlt},
 radio:{width:22,height:22,borderRadius:T.radius.full,borderWidth:2,borderColor:C.lineStrong,alignItems:'center',justifyContent:'center'},radioOn:{borderColor:C.ink},radioDot:{width:10,height:10,borderRadius:T.radius.full,backgroundColor:C.ink},
 hint:{...type.label,color:C.inkSoft,backgroundColor:C.bg,borderRadius:T.radius.md,padding:12,overflow:'hidden'},hintOn:{color:C.ink,backgroundColor:C.surfaceAlt,fontWeight:'600'},
});
