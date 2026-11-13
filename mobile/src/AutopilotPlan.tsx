import React,{useEffect,useState} from 'react';
import {View,Text,TextInput,Pressable,Switch,StyleSheet} from 'react-native';
import {Group,Row,a} from './AccountRows';
import {ThinkingLine} from './Thinking';
import {request} from './api';
import {s,C,type} from './styles';
import {T} from './tokens';
import type {Row as Data} from './model';

const money=(n:number)=>new Intl.NumberFormat('ru-RU').format(n||0)+' ₸';
const date=(t:number)=>new Date(t*1000).toLocaleDateString('ru-RU',{timeZone:'Asia/Qyzylorda',day:'numeric',month:'long'});
const DAYS=['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
const hhmm=(m:number)=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
const toMinutes=(v:string)=>{const [h,m]=v.split(':').map(Number);return Math.max(0,Math.min(1440,(h||0)*60+(m||0)));};
const plural=(n:number,one:string,few:string,many:string)=>n%10===1&&n%100!==11?one:[2,3,4].includes(n%10)&&![12,13,14].includes(n%100)?few:many;
const FEATURES={
 owner:['Принимает брони и отвечает гостям за вас, днём и ночью','Заказывает уборку, назначает исполнителя и находит замену','Принимает уборку по фотоотчёту и отмечает выезд гостя','Квартира выше в подборе для гостей','Комиссия с брони обычная, без надбавки за ИИ','Итоги недели по понедельникам'],
 cleaner:['Берёт уборки сам по вашим правилам: районы, дни, часы, оплата','Подходящие уборки приходят вам раньше остальных','План дня в 8:00: адреса по порядку и время','«Не могу сегодня»: ИИ вернёт уборки и найдёт замену','Итоги недели в профиле']
};
const STEPS={owner:['Квартиры','Уборка','Итог'],cleaner:['Где и когда','Оплата','Итог']};

// The steps of connecting the plan: done ones can be reopened, the next ones open in order.
function Steps({steps,current,onPick}:{steps:string[];current:number;onPick:(i:number)=>void}){
 return <View style={p.steps}>{steps.map((label,i)=>{const done=i<current,now=i===current;return <React.Fragment key={label}>
  {i>0&&<View style={[p.stepLine,(done||now)&&p.stepLineOn]}/>}
  <Pressable accessibilityRole="button" accessibilityLabel={`Шаг ${i+1}: ${label}`} accessibilityState={{selected:now,disabled:i>current}} disabled={i>current} onPress={()=>onPick(i)} style={p.step}>
   <View style={[p.dot,done&&p.dotDone,now&&p.dotNow]}><Text style={[p.dotText,done&&p.dotDoneText,now&&p.dotNowText]}>{done?'✓':i+1}</Text></View>
   <Text numberOfLines={1} style={[p.stepLabel,(done||now)&&p.stepLabelOn]}>{label}</Text>
  </Pressable>
 </React.Fragment>;})}</View>;
}

// The «Автопилот» plan on the account screen: what it gives, how to turn it on, how it runs.
export function NativeAutopilotPlan({role}:{role:'owner'|'cleaner'}){
 const owner=role==='owner';
 const [state,setState]=useState<Data|null>(null),[open,setOpen]=useState(false),[step,setStep]=useState(0),[confirmOff,setConfirmOff]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const [picked,setPicked]=useState<string[]>([]),[fees,setFees]=useState<Data>({}),[rules,setRules]=useState<Data>({districts:[],days:63,fromMinute:600,toMinute:1140,minFee:0,maxPerDay:4,askNewOwner:true});
 const [from,setFrom]=useState('10:00'),[to,setTo]=useState('19:00');
 useEffect(()=>{let live=true;request('/api/operations/autopilot/state').then(v=>{if(!live)return;setState(v);if(v.rules){setRules(v.rules);setFrom(hhmm(v.rules.fromMinute));setTo(hhmm(Math.min(v.rules.toMinute,1439)));}setPicked((v.flats||[]).filter((f:Data)=>f.managed||f.ready).map((f:Data)=>f.id));}).catch(e=>live&&setError(e.message));return()=>{live=false;};},[role]);
 async function run(path:string,body:Data={}){setBusy(true);setError('');setMessage('');try{const r=await request('/api/'+path,body);setMessage(r.message||'Сохранено.');const next=r.state||await request('/api/operations/autopilot/state');setState(next);if(next.live){setOpen(false);setStep(0);}setConfirmOff(false);}catch(e:any){setError(e.message);}finally{setBusy(false);}}
 if(!state)return <Group title="Тариф">{error?<Text accessibilityRole="alert" style={[s.error,{padding:16}]}>{error}</Text>:<View style={{padding:16}}><ThinkingLine style={s.meta} text="Загружаю тариф…"/></View>}</Group>;
 const st=state.settings||{},plan=state.plan,live=!!state.live,flats:Data[]=state.flats||[];
 const statusLine=!plan?'':plan.status==='trial'?`Пробный период до ${date(plan.periodEnd)}`+(st.charge?`, потом ${owner?money(state.nextAmount)+' в месяц с баланса':money(st.price)+' в месяц из выплат'}`:', плата пока не взимается'):plan.status==='grace'?`Не хватило денег. Работает до ${date(plan.graceUntil)}`:plan.status==='active'?(plan.autoRenew?`Оплачено до ${date(plan.periodEnd)}`:`Работает до ${date(plan.periodEnd)} и не продлится`):'';
 const offNote=plan?.status==='active'&&st.charge?'Доработает оплаченный месяц и не продлится.':owner?'Квартиры перейдут в режим «Я сам». Принятые брони и уборки останутся в силе.':'Предложения уборок снова будут приходить вам на решение. Принятые уборки останутся.';
 const steps=STEPS[role],last=steps.length-1,num=(v:string)=>v.replace(/\D/g,'').slice(0,7);
 const begin=()=>{setOpen(true);setStep(0);setMessage('');};
 const fresh=flats.filter(f=>picked.includes(f.id)&&f.ready&&!f.managed),feeMissing=fresh.some(f=>!f.cleaningFee&&Number(fees[f.id]||0)<100);
 const fromM=toMinutes(from),toM=toMinutes(to);
 const canNext=owner?(step===0?fresh.length>0:step===1?!feeMissing:true):(step===0?!!rules.days&&toM-fromM>=60:true);
 const chip=(label:string,on:boolean,press:()=>void,wide=false)=><Pressable key={label} accessibilityRole="button" accessibilityState={{selected:on}} onPress={press} style={[p.chip,wide&&p.day,on&&(wide?p.dayOn:p.chipOn)]}><Text style={[p.chipText,on&&(wide?p.dayOnText:p.chipOnText)]}>{label}</Text></Pressable>;
 const btn=(title:string,fn:()=>void,kind:'main'|'line'|'danger'='main',disabled=false)=><Pressable accessibilityRole="button" disabled={busy||disabled} onPress={fn} style={[p.btn,kind==='line'&&p.btnLine,kind==='danger'&&p.btnDanger,(busy||disabled)&&s.disabled]}><Text style={[p.btnText,kind==='line'&&p.btnLineText]}>{title}</Text></Pressable>;
 const sum=<View style={p.sum}>{plan?<><Text style={p.sumLabel}>Оплата</Text><Text style={p.sumValue}>{money(st.price*Math.max(1,owner?fresh.length+state.units:1))} в месяц</Text></>:<><Text style={p.sumLabel}>Первые {st.trialDays} дней</Text><Text style={p.sumValue}>бесплатно</Text><Text style={p.sumLabel}>Потом{owner?`, ${Math.max(1,fresh.length)} кв.`:''}</Text><Text style={p.sumValue}>{money(st.price*Math.max(1,owner?fresh.length:1))} в месяц{owner?'':' из выплат'}</Text></>}</View>;
 const finish=owner
  ?()=>run('operations/autopilot/start',{propertyIds:fresh.map(f=>f.id),cleaningFees:Object.fromEntries(Object.entries(fees).filter(([,v])=>v).map(([k,v])=>[k,Number(v)]))})
  :()=>run(live?'operations/autopilot/rules':'operations/autopilot/start',{...rules,fromMinute:fromM,toMinute:toM});
 const ownerStep=[
  <View key="flats" style={p.connect}>
   <Text style={p.lead}>Отметьте квартиры, которые поведёт ИИ.</Text>
   {flats.length===0&&<Text style={a.note}>Сначала добавьте квартиру.</Text>}
   <View style={p.list}>{flats.map((f,i)=>{const on=picked.includes(f.id)||f.managed,locked=!f.ready||f.managed;return <Pressable key={f.id} accessibilityRole="checkbox" accessibilityState={{checked:on,disabled:locked}} disabled={busy||locked} onPress={()=>setPicked(picked.includes(f.id)?picked.filter(x=>x!==f.id):[...picked,f.id])} style={[p.flatRow,i>0&&p.flatLine]}><View style={[p.box,on&&p.boxOn]}>{on&&<Text style={p.tick}>✓</Text>}</View><View style={{flex:1}}><Text style={a.title}>{f.title}</Text><Text style={a.note}>{f.managed?'Уже на автопилоте':!f.ready?'Сначала заполните тарифы квартиры':money(st.price)+' в месяц'}</Text></View></Pressable>;})}</View>
  </View>,
  <View key="fees" style={p.connect}>
   <Text style={p.lead}>После каждого выезда ИИ закажет уборку по этой цене и найдёт исполнителя.</Text>
   <View style={p.list}>{fresh.map((f,i)=><View key={f.id} style={[p.flat,i>0&&p.flatLine]}><Text style={a.title}>{f.title}</Text>{f.cleaningFee?<Text style={a.note}>Уборка {money(f.cleaningFee)}, уже указана</Text>:<><Text style={a.note}>Цена уборки, ₸</Text><TextInput style={s.field} keyboardType="number-pad" value={fees[f.id]||''} placeholder="5000" onChangeText={v=>setFees({...fees,[f.id]:num(v)})}/></>}</View>)}</View>
  </View>,
  <View key="sum" style={p.connect}>
   {fresh.map(f=><View key={f.id} style={p.feature}><Text style={p.check}>✓</Text><Text style={p.featureText}>{f.title}</Text></View>)}
   {sum}
   <Text style={a.note}>ИИ всё равно спросит вас о брони с высоким риском и о новом исполнителе. Принятые брони и уборки при отключении остаются в силе.</Text>
  </View>
 ];
 const cleanerStep=[
  <View key="where" style={p.connect}>
   <Text style={p.h4}>Районы</Text>
   <View style={p.chips}>{(state.cityDistricts||[]).map((d:string)=>chip(d,rules.districts.includes(d),()=>setRules({...rules,districts:rules.districts.includes(d)?rules.districts.filter((x:string)=>x!==d):[...rules.districts,d]})))}</View>
   <Text style={a.note}>{(state.cityDistricts||[]).length===0?'Районы появятся, когда в вашем городе будут квартиры. Пока ИИ берёт уборки по всему городу.':rules.districts.length?'Только выбранные районы.':'Не выбрано: весь город.'}</Text>
   <Text style={p.h4}>Когда работаю</Text>
   <View style={p.days}>{DAYS.map((d,i)=>chip(d,!!(rules.days>>i&1),()=>setRules({...rules,days:rules.days^(1<<i)}),true))}</View>
   <View style={p.two}><View style={p.half}><Text style={a.note}>С</Text><TextInput style={s.field} value={from} onChangeText={setFrom} placeholder="10:00"/></View><View style={p.half}><Text style={a.note}>До</Text><TextInput style={s.field} value={to} onChangeText={setTo} placeholder="19:00"/></View></View>
  </View>,
  <View key="pay" style={p.connect}>
   <View style={p.two}><View style={p.half}><Text style={a.note}>Не меньше, ₸</Text><TextInput style={s.field} keyboardType="number-pad" value={String(rules.minFee||'')} placeholder="0" onChangeText={v=>setRules({...rules,minFee:Number(num(v)||0)})}/></View><View style={p.half}><Text style={a.note}>Уборок в день</Text><TextInput style={s.field} keyboardType="number-pad" value={String(rules.maxPerDay)} onChangeText={v=>setRules({...rules,maxPerDay:Math.max(1,Math.min(20,Number(num(v)||1)))})}/></View></View>
   <View style={p.switchRow}><View style={{flex:1,gap:4}}><Text style={a.title}>Спрашивать про нового владельца</Text><Text style={a.note}>Первую уборку у незнакомого владельца ИИ не возьмёт без вас</Text></View><Switch accessibilityLabel="Спрашивать про нового владельца" value={!!rules.askNewOwner} onValueChange={v=>setRules({...rules,askNewOwner:v})} trackColor={{false:C.lineStrong,true:C.accent}} thumbColor={C.surface}/></View>
  </View>,
  <View key="sum" style={p.connect}>
   <View style={p.list}>{[['Районы',rules.districts.length?rules.districts.join(', '):'весь город'],['Дни и часы',DAYS.filter((_,i)=>rules.days>>i&1).join(', ')+' · '+from+'–'+to],['Оплата',(rules.minFee?'от '+money(rules.minFee):'любая')+' · до '+rules.maxPerDay+' в день'],['Новый владелец',rules.askNewOwner?'спросить меня':'брать сразу']].map(([k,v],i)=><View key={k} style={[p.review,i>0&&p.flatLine]}><Text style={a.note}>{k}</Text><Text style={p.reviewValue}>{v}</Text></View>)}</View>
   {!plan&&sum}
  </View>
 ];
 const wizard=<View style={p.connect}>
  <Steps steps={steps} current={step} onPick={setStep}/>
  {(owner?ownerStep:cleanerStep)[step]}
  <View style={p.nav}>
   {step>0?btn('‹ Назад',()=>setStep(step-1),'line'):btn('Отмена',()=>{setOpen(false);setStep(0);},'line')}
   {step<last?btn('Далее ›',()=>setStep(step+1),'main',!canNext):btn(live?(owner?'Добавить квартиры':'Сохранить правила'):st.trialDays>0&&!plan?'Включить бесплатно':'Включить за '+money(st.price*Math.max(1,owner?fresh.length:1)),finish,'main',owner&&!fresh.length)}
  </View>
 </View>;
 const notice=<>{!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}{!!message&&<Text accessibilityLiveRegion="polite" style={a.saved}>{message}</Text>}</>;
 if(!live)return <>
  <Group title="Тариф"><View style={a.row}><View style={a.wide}><Text style={a.title}>{owner?'Сам':'Обычный'}</Text><Text style={a.note}>{owner?'Брони и уборки подтверждаете вы. ИИ подсказывает.':'На каждое предложение уборки отвечаете вы.'}</Text></View><Text style={p.free}>Бесплатно</Text></View></Group>
  {notice}
  <View style={p.card}>
   <Text style={p.badge}>✦ AI администратор</Text>
   <View style={p.head}><View style={{flex:1,gap:4}}><Text style={p.h3}>{owner?'Автопилот':'Автопилот исполнителя'}</Text><Text style={p.price}><Text style={p.priceBig}>{money(st.price)}</Text> {owner?'в месяц за квартиру':'в месяц'}{st.trialDays>0&&!plan?`, первые ${st.trialDays} дней бесплатно`:''}</Text></View><Switch accessibilityLabel="Автопилот" value={open} disabled={busy} onValueChange={v=>v?begin():(setOpen(false),setStep(0))} trackColor={{false:C.lineStrong,true:C.accent}} thumbColor={C.surface}/></View>
   {plan?.status==='paused'&&<Text style={p.paused}>Автопилот на паузе. Принятые брони и уборки в силе.</Text>}
   {open?wizard:<>
    <View style={{gap:12}}>{FEATURES[role].map(f=><View key={f} style={p.feature}><Text style={p.check}>✓</Text><Text style={p.featureText}>{f}</Text></View>)}</View>
    {owner&&<Text style={p.keep}>Вам остаются деньги и решения: правка объявления, рискованные брони, споры. ИИ спросит вас кнопкой.</Text>}
    {btn(st.trialDays>0&&!plan?`Попробовать ${st.trialDays} дней бесплатно`:'Подключить',begin)}
   </>}
   <Text style={p.fine}>{st.charge?(owner?'Оплата с баланса в приложении раз в месяц.':'Оплата удерживается из выплат за уборки.')+' Отключить можно в любой день.':'Пока плата не взимается. Отключить можно в любой день.'}</Text>
  </View>
 </>;
 const n=state.today?.length||0;
 return <>
  <Text accessibilityRole="header" style={a.label}>Тариф</Text>
  <View style={p.on}>
   <View style={p.head}><Text style={[p.onLabel,{flex:1}]}>● {plan?.status==='trial'?'Автопилот включён · пробный период':plan?.status==='grace'?'Автопилот · нужна оплата':'Автопилот включён'}</Text><Switch accessibilityLabel="Автопилот включён" value={!confirmOff} disabled={busy} onValueChange={v=>setConfirmOff(!v)} trackColor={{false:C.accentPressed,true:C.onAccent}} thumbColor={confirmOff?C.surface:C.accent}/></View>
   <Text style={p.onTitle}>{owner?`ИИ ведёт ${state.units} ${plural(state.units,'квартиру','квартиры','квартир')}`:n?`На сегодня ${n} ${plural(n,'уборка','уборки','уборок')}`:'ИИ берёт уборки по вашим правилам'}</Text><Text style={p.onNote}>{statusLine}</Text>
  </View>
  {confirmOff&&<View accessibilityRole="alert" style={p.off}><Text style={a.title}>Отключить автопилот?</Text><Text style={a.note}>{offNote}</Text><View style={p.nav}>{btn('Оставить',()=>setConfirmOff(false),'line')}{btn('Отключить',()=>void run('operations/autopilot/stop'),'danger')}</View></View>}
  {notice}
  <Text accessibilityRole="header" style={a.label}>За эту неделю</Text>
  <View style={p.stats}>{(owner?[[state.week.answered,'ответов гостям'],[state.week.bookings,'броней'],[state.week.cleanings,'уборок принято']]:[[state.week.taken,'уборок взял ИИ'],[money(state.week.earned),'заработано']]).map(([v,l])=><View key={String(l)} style={p.stat}><Text style={p.statValue}>{v}</Text><Text style={a.note}>{l}</Text></View>)}</View>
  {!owner&&<Group title="План на сегодня">{n?state.today.map((j:Data)=><View key={j.id} style={a.row}><View style={a.wide}><Text style={a.title}>{j.from}–{j.to} · {j.title}</Text><Text style={a.note}>{[j.district,j.address].filter(Boolean).join(', ')} · {money(j.fee)}</Text></View></View>):<View style={a.row}><Text style={a.title}>На сегодня уборок нет</Text></View>}
   {n>0&&<Row title="Не могу сегодня, найти замену" note="ИИ вернёт уборки владельцам и найдёт замену" disabled={busy} onPress={()=>void run('operations/autopilot/away')}/>}</Group>}
  <Group title="Настройки автопилота">
   <Row title={owner?'Квартиры':'Правила'} value={owner?state.units+' на автопилоте':(rules.districts.length?rules.districts.length+' р-на':'весь город')} open={open} onPress={()=>{setOpen(v=>!v);setStep(0);}}/>
   {open&&<View style={a.body}>{wizard}</View>}
  </Group>
 </>;
}

const p=StyleSheet.create({
 free:{...type.caption,fontWeight:'600',color:C.inkSoft,backgroundColor:C.surfaceAlt,borderRadius:T.radius.full,paddingHorizontal:12,paddingVertical:4,overflow:'hidden'},
 card:{marginTop:12,borderRadius:T.radius.xl,padding:20,backgroundColor:C.surface,borderWidth:1,borderColor:C.accentLine,gap:16},
 badge:{alignSelf:'flex-start',...type.caption,fontWeight:'600',color:C.accent,backgroundColor:C.accentSoft,borderWidth:1,borderColor:C.accentLine,borderRadius:T.radius.full,paddingHorizontal:12,paddingVertical:4,overflow:'hidden'},
 head:{flexDirection:'row',alignItems:'center',gap:12},
 h3:{...type.title,fontWeight:'700',color:C.ink},
 price:{...type.label,color:C.muted},priceBig:{...type.subtitle,fontWeight:'700',color:C.ink},
 feature:{flexDirection:'row',gap:12},check:{...type.body,color:C.success,fontWeight:'700'},featureText:{...type.body,color:C.inkSoft,flex:1},
 keep:{...type.label,color:C.inkSoft,backgroundColor:C.bg,borderRadius:T.radius.md,padding:12},
 paused:{...type.label,color:C.warning,backgroundColor:C.warningSoft,borderRadius:T.radius.md,padding:8,overflow:'hidden'},
 btn:{flex:1,minHeight:T.control.primary,borderRadius:T.radius.lg,backgroundColor:C.accent,alignItems:'center',justifyContent:'center',paddingHorizontal:12},btnText:{...type.body,color:C.onAccent,fontWeight:'600',textAlign:'center'},
 btnLine:{backgroundColor:C.surface,borderWidth:1,borderColor:C.lineStrong},btnLineText:{color:C.ink},btnDanger:{backgroundColor:C.danger},
 nav:{flexDirection:'row',gap:8},
 fine:{...type.caption,color:C.muted,textAlign:'center'},
 connect:{gap:12},lead:{...type.label,color:C.inkSoft},h4:{...type.caption,color:C.muted,fontWeight:'600',letterSpacing:.4,textTransform:'uppercase',marginTop:4},
 steps:{flexDirection:'row',alignItems:'flex-start'},step:{alignItems:'center',gap:4,minWidth:T.control.touch,minHeight:T.control.touch},
 stepLine:{flex:1,height:2,marginTop:16,marginHorizontal:4,borderRadius:T.radius.full,backgroundColor:C.lineStrong},stepLineOn:{backgroundColor:C.accent},
 dot:{width:32,height:32,borderRadius:T.radius.full,borderWidth:2,borderColor:C.lineStrong,backgroundColor:C.surface,alignItems:'center',justifyContent:'center'},
 dotDone:{backgroundColor:C.accent,borderColor:C.accent},dotNow:{borderColor:C.accent,backgroundColor:C.accentSoft},
 dotText:{...type.label,fontWeight:'600',color:C.muted},dotDoneText:{color:C.onAccent},dotNowText:{color:C.accent},
 stepLabel:{...type.caption,color:C.muted},stepLabelOn:{color:C.ink,fontWeight:'600'},
 list:{borderWidth:1,borderColor:C.line,borderRadius:T.radius.lg,overflow:'hidden'},flat:{paddingHorizontal:16,paddingVertical:12,gap:8},flatLine:{borderTopWidth:1,borderTopColor:C.line},
 flatRow:{minHeight:T.control.touch,flexDirection:'row',alignItems:'center',gap:12,paddingHorizontal:16,paddingVertical:8},
 box:{width:24,height:24,borderRadius:T.radius.sm,borderWidth:1,borderColor:C.lineStrong,alignItems:'center',justifyContent:'center'},boxOn:{backgroundColor:C.accent,borderColor:C.accent},tick:{...type.label,color:C.onAccent,fontWeight:'700'},
 review:{flexDirection:'row',justifyContent:'space-between',gap:12,paddingHorizontal:16,paddingVertical:12},reviewValue:{...type.label,color:C.ink,fontWeight:'600',flexShrink:1,textAlign:'right'},
 switchRow:{flexDirection:'row',alignItems:'center',gap:12,minHeight:T.control.touch},
 sum:{flexDirection:'row',flexWrap:'wrap',rowGap:8,backgroundColor:C.accentSoft,borderWidth:1,borderColor:C.accentLine,borderRadius:T.radius.lg,padding:16},
 sumLabel:{...type.label,color:C.inkSoft,width:'50%'},sumValue:{...type.label,color:C.ink,fontWeight:'600',width:'50%',textAlign:'right'},
 chips:{flexDirection:'row',flexWrap:'wrap',gap:8},
 chip:{minHeight:T.control.compact,paddingHorizontal:12,borderRadius:T.radius.full,borderWidth:1,borderColor:C.lineStrong,backgroundColor:C.surface,justifyContent:'center'},
 chipOn:{backgroundColor:C.accentSoft,borderColor:C.accent},chipText:{...type.label,color:C.inkSoft},chipOnText:{color:C.accentPressed,fontWeight:'600'},
 days:{flexDirection:'row',gap:4},day:{flex:1,minHeight:T.control.touch,paddingHorizontal:0,borderRadius:T.radius.md,alignItems:'center'},dayOn:{backgroundColor:C.accent,borderColor:C.accent},dayOnText:{color:C.onAccent,fontWeight:'600'},
 two:{flexDirection:'row',gap:8},half:{flex:1,gap:4},
 on:{borderRadius:T.radius.xl,padding:20,backgroundColor:C.accent,gap:8},onLabel:{...type.caption,color:C.accentSoft,fontWeight:'600'},onTitle:{...type.title,color:C.onAccent,fontWeight:'700'},onNote:{...type.label,color:C.accentSoft},
 off:{marginTop:12,gap:8,padding:16,borderRadius:T.radius.lg,backgroundColor:C.dangerSoft},
 stats:{flexDirection:'row',flexWrap:'wrap',gap:12},stat:{flexGrow:1,flexBasis:96,backgroundColor:C.surface,borderWidth:1,borderColor:C.line,borderRadius:T.radius.lg,paddingHorizontal:16,paddingVertical:12},statValue:{...type.title,fontWeight:'700',color:C.ink}
});
