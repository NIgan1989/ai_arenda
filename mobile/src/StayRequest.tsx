import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Thinking} from './Thinking';
import {windowBadge} from '../../lib/window-badge';
import {Pressable,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import {C,type} from './styles';
import {T} from './tokens';
import {money,type Row} from './model';
import {useActivityClock} from './ActivityTimer';
import {defaultStay,settleStay,stayClock,stayDay,stayDays,stayInterval,stayLimits,stayModes,stayRate,stayStamp,stayTimes,stayUnit,type StayChoice,type StayMode} from '../../lib/stay-choice';
import {recordSpan} from '../../lib/record-span';
// A stay request and a new cleaning on one screen each, built from the same parts as on the site:
// a tariff switch, a strip of days, a row of times and "how many" steppers. Nothing is typed as a date.
const words=(day:number,options:Intl.DateTimeFormatOptions)=>new Date((day+18000)*1000).toLocaleDateString('ru-RU',{timeZone:'UTC',...options});
const guestsWord=(n:number)=>{const tens=n%100,units=n%10;return n+' '+(tens>10&&tens<20?'гостей':units===1?'гость':units>1&&units<5?'гостя':'гостей');};
const modeTitle:Record<StayMode,string>={daily:'Сутки',hourly:'Часы',nightly:'Ночь'};
const long=(minutes:number)=>minutes<60?minutes+' мин':String(minutes/60).replace('.',',')+' ч';
export const cleaningTasks=['Сменить бельё и полотенца','Убрать санузел и кухню','Помыть полы','Вынести мусор','Пополнить расходники'];
function Days({label,value,now,disabled,onChange}:{label:string;value:number;now:number;disabled:boolean;onChange:(day:number)=>void}){
 const today=stayDay(now),days=stayDays(now,21),all=days.includes(value)?days:[value,...days];
 return <View style={p.field}><Text style={p.label}>{label}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={p.strip}>{all.map(day=>{const on=day===value;return <Pressable key={day} accessibilityRole="radio" accessibilityState={{selected:on,disabled}} accessibilityLabel={words(day,{weekday:'long',day:'numeric',month:'long'})} disabled={disabled} onPress={()=>onChange(day)} style={[p.day,on&&p.on]}><Text style={[p.daySmall,on&&p.onText]}>{day===today?'сегодня':day===today+86400?'завтра':words(day,{weekday:'short'})}</Text><Text style={[p.dayNumber,on&&p.onText]}>{words(day,{day:'numeric'})}</Text><Text style={[p.daySmall,on&&p.onText]}>{words(day,{month:'short'}).replace('.','')}</Text></Pressable>;})}</ScrollView></View>;
}
function Times({label,value,day,now,disabled,onChange}:{label:string;value:number;day:number;now:number;disabled:boolean;onChange:(minutes:number)=>void}){
 const times=stayTimes(day,now),all=times.includes(value)?times:[value,...times],scroll=useRef<ScrollView>(null),index=Math.max(0,all.indexOf(value));
 // The chosen time is brought into view once, when the row opens or the day changes.
 useEffect(()=>{const timer=setTimeout(()=>scroll.current?.scrollTo({x:Math.max(0,index-1)*80,animated:false}),0);return()=>clearTimeout(timer);},[day]);
 return <View style={p.field}><Text style={p.label}>{label}</Text><ScrollView ref={scroll} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={p.strip}>{all.map(m=>{const on=m===value;return <Pressable key={m} accessibilityRole="radio" accessibilityState={{selected:on,disabled}} accessibilityLabel={stayClock(m)} disabled={disabled} onPress={()=>onChange(m)} style={[p.time,on&&p.on]}><Text style={[p.timeText,on&&p.onText]}>{stayClock(m)}</Text></Pressable>;})}</ScrollView></View>;
}
function Stepper({label,value,min,max,step=1,disabled,format,onChange}:{label:string;value:number;min:number;max:number;step?:number;disabled:boolean;format:(n:number)=>string;onChange:(n:number)=>void}){
 const less=disabled||value-step<min,more=disabled||value+step>max;
 return <View style={p.field}><Text style={p.label}>{label}</Text><View style={p.stepper}><Pressable accessibilityRole="button" accessibilityLabel={label+': меньше'} accessibilityState={{disabled:less}} disabled={less} onPress={()=>onChange(value-step)} style={[p.stepButton,less&&p.dim]}><Text style={p.stepSign}>−</Text></Pressable><Text accessibilityLiveRegion="polite" style={p.stepValue}>{format(value)}</Text><Pressable accessibilityRole="button" accessibilityLabel={label+': больше'} accessibilityState={{disabled:more}} disabled={more} onPress={()=>onChange(value+step)} style={[p.stepButton,more&&p.dim]}><Text style={p.stepSign}>+</Text></Pressable></View></View>;
}
function Segments<V extends string>({label,value,options,disabled,onChange}:{label:string;value:V;options:{id:V;title:string;note?:string}[];disabled:boolean;onChange:(value:V)=>void}){
 return <View accessibilityRole="radiogroup" accessibilityLabel={label} style={p.segments}>{options.map(o=>{const on=o.id===value;return <Pressable key={o.id} accessibilityRole="radio" accessibilityState={{selected:on,disabled}} disabled={disabled} onPress={()=>onChange(o.id)} style={[p.segment,on&&p.segmentOn]}><Text numberOfLines={1} style={[p.segmentTitle,on&&{color:C.accent}]}>{o.title}</Text>{!!o.note&&<Text numberOfLines={1} style={p.segmentNote}>{o.note}</Text>}</Pressable>;})}</View>;
}
function Send({title,disabled,busy,onPress}:{title:string;disabled:boolean;busy:boolean;onPress:()=>void}){
 return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{disabled}} disabled={disabled} onPress={onPress} style={({pressed})=>[p.send,disabled&&p.sendOff,pressed&&p.dim]}>{busy?<Thinking color={C.onAccent}/>:<Text style={[p.sendText,disabled&&{color:C.muted}]}>{title}</Text>}</Pressable>;
}
const Closed=({text,note}:{text:string;note:string})=><View style={p.card}><Text style={p.closed}>{text}</Text><Text style={p.note}>{note}</Text></View>;
export function StayRequest({property,busy,done,result,onQuote,onConfirm}:{property:Row;busy:boolean;done?:boolean;result?:string;onQuote:(body:Row)=>Promise<Row>;onConfirm:(body:Row)=>void}){
 const policy=property.policy||{},modes=useMemo(()=>stayModes(property),[property.price,policy.hourly_price,policy.nightly_price]);
 const clock=useActivityClock(),[opened]=useState(()=>Math.floor(Date.now()/1000)),now=clock||opened;
 const [choice,setChoice]=useState<StayChoice>(()=>settleStay(defaultStay('daily',policy,opened),policy,opened)),[guests,setGuests]=useState(1);
 const [quote,setQuote]=useState<Row|null>(null),[checking,setChecking]=useState(false),[error,setError]=useState(''),[accepted,setAccepted]=useState(false);
 const round=useRef(0),limits=stayLimits(choice.mode,policy),span=stayInterval(choice,policy),body=()=>({propertyId:property.id,start:stayStamp(span.start),end:stayStamp(span.end),guests,billingMode:choice.mode});
 const change=(next:Partial<StayChoice>)=>{const mode=next.mode||choice.mode,first=defaultStay(mode,policy,now);setChoice(settleStay(next.mode&&next.mode!==choice.mode?{...first,day:choice.day,...(mode==='hourly'&&choice.day!==first.day?{time:policy.checkin_minutes??840}:{})}:{...choice,...next},policy,now));};
 useEffect(()=>{
  if(done)return;const id=++round.current;setChecking(true);setAccepted(false);
  const timer=setTimeout(()=>{onQuote(body()).then(value=>{if(id===round.current){setQuote(value);setError('');}}).catch(e=>{if(id===round.current){setQuote(null);setError(e?.message||'Не удалось проверить это время.');}}).finally(()=>{if(id===round.current)setChecking(false);});},350);
  return()=>clearTimeout(timer);
 },[choice.mode,choice.day,choice.time,choice.count,guests,done]);
 if(done)return <Closed text={result||'Заявка отправлена'} note="Заявка и её статус доступны в «Мои брони»."/>;
 const ready=!!quote&&!checking&&accepted&&!busy;
 return <View style={p.card}>
  <View style={p.head}><Text style={p.eyebrow}>ЗАЯВКА НА ПРОЖИВАНИЕ</Text><Text accessibilityRole="header" style={p.title}>{property.title}</Text><Text style={p.note}>{[property.city,property.district].filter(Boolean).join(', ')}{property.capacity?' · до '+guestsWord(property.capacity):''}</Text></View>
  {modes.length>1&&<Segments label="Тариф" value={choice.mode} disabled={busy} onChange={mode=>change({mode})} options={modes.map(mode=>({id:mode,title:modeTitle[mode],note:money(stayRate(property,mode))}))}/>}
  <Days label="Заезд" value={choice.day} now={now} disabled={busy} onChange={day=>change({day})}/>
  {choice.mode==='nightly'?<Text style={p.fixed}>Заезд в {stayClock(policy.checkin_minutes??840)}, выезд в {stayClock(policy.checkout_minutes??720)}</Text>:<Times label="Время заезда" value={choice.time} day={choice.day} now={now} disabled={busy} onChange={time=>change({time})}/>}
  <View style={p.row}><View style={p.half}><Stepper label={choice.mode==='hourly'?'Сколько часов':choice.mode==='nightly'?'Сколько ночей':'Сколько суток'} value={choice.count} min={limits.min} max={limits.max} disabled={busy} format={n=>n+' '+stayUnit(choice.mode,n)} onChange={count=>change({count})}/></View>{(property.capacity||1)>1&&<View style={p.half}><Stepper label="Гости" value={guests} min={1} max={property.capacity} disabled={busy} format={guestsWord} onChange={setGuests}/></View>}</View>
  <View style={[p.total,!!error&&!quote&&{backgroundColor:C.dangerSoft}]} accessibilityLiveRegion="polite">
   <Text style={p.span}>{recordSpan(span.start,span.end)}</Text>
   {quote?<><View style={p.sum}><Text style={[p.amount,checking&&p.dim]}>{money(quote.amount)}</Text><Text style={p.sumNote}>{quote.periods} × {money(quote.price)} · {quote.unitLabel}</Text></View>{!!quote.window&&<Text style={p.window}>✦ {windowBadge(quote.window)} · обычно {money(quote.window.regular)}/час</Text>}<Text style={p.fact}>Депозит: {quote.policy.deposit?money(quote.policy.deposit)+', отдельно от проживания':'не нужен'}</Text><Text style={p.fact}>{quote.policy.auto_confirm?'Подтверждается сразу, по правилам владельца.':'Владелец отвечает в течение 15 минут.'}</Text></>
    :error?<Text accessibilityRole="alert" style={p.error}>{error}</Text>:<View style={p.wait}><Thinking size="sm"/><Text style={p.fact}>Проверяю свободное время и цену…</Text></View>}
  </View>
  {!!quote?.policy.house_rules&&<Text style={p.note}>Правила проживания: {quote.policy.house_rules}</Text>}
  <Pressable accessibilityRole="checkbox" accessibilityState={{checked:accepted,disabled:busy||!quote}} disabled={busy||!quote||checking} onPress={()=>setAccepted(v=>!v)} style={p.consent}><View style={[p.box,accepted&&p.boxOn]}>{accepted&&<Text style={p.tick}>✓</Text>}</View><Text style={p.consentText}>Согласен с временем, ценой, депозитом и правилами проживания</Text></Pressable>
  <Send title="Отправить заявку" disabled={!ready} busy={busy} onPress={()=>{if(quote)onConfirm({...body(),expectedAmount:quote.amount,expectedPolicyVersion:quote.policy.version,acceptTerms:true});}}/>
  <Text style={p.note}>Отправка заявки не списывает деньги. Время Казахстана.</Text>
 </View>;
}
export function CleaningRequest({property,busy,done,result,onSubmit}:{property:Row;busy:boolean;done?:boolean;result?:string;onSubmit:(body:Row)=>void}){
 const clock=useActivityClock(),[opened]=useState(()=>Math.floor(Date.now()/1000)),now=clock||opened;
 const [when,setWhen]=useState<StayChoice>(()=>settleStay(defaultStay('hourly',{},opened),{},opened)),[minutes,setMinutes]=useState(()=>Math.min(480,Math.max(30,Math.round((property.cleaning_minutes||120)/30)*30)));
 const [fee,setFee]=useState(()=>property.policy?.cleaning_fee||4000),[tasks,setTasks]=useState<string[]>(()=>cleaningTasks.slice(0,4)),[extra,setExtra]=useState('');
 if(done)return <Closed text={result||'Задание опубликовано'} note="Задание и отклики доступны в «Уборки»."/>;
 const start=when.day+when.time*60,end=start+minutes*60,description=[...tasks,extra.trim()].filter(Boolean).join('. '),change=(next:Partial<StayChoice>)=>setWhen(settleStay({...when,...next},{},now));
 return <View style={p.card}>
  <View style={p.head}><Text style={p.eyebrow}>НОВАЯ УБОРКА</Text><Text accessibilityRole="header" style={p.title}>{property.title}</Text><Text style={p.note}>{[property.city,property.district].filter(Boolean).join(', ')}</Text></View>
  <Days label="День" value={when.day} now={now} disabled={busy} onChange={day=>change({day})}/>
  <Times label="Начало" value={when.time} day={when.day} now={now} disabled={busy} onChange={time=>change({time})}/>
  <View style={p.row}><View style={p.half}><Stepper label="Сколько времени" value={minutes} min={30} max={480} step={30} disabled={busy} format={long} onChange={setMinutes}/></View><View style={p.half}><Stepper label="Оплата" value={fee} min={500} max={100000} step={500} disabled={busy} format={money} onChange={setFee}/></View></View>
  <View style={p.field}><Text style={p.label}>Что сделать</Text><View style={p.tasks}>{cleaningTasks.map(task=>{const on=tasks.includes(task);return <Pressable key={task} accessibilityRole="checkbox" accessibilityState={{checked:on,disabled:busy}} disabled={busy} onPress={()=>setTasks(on?tasks.filter(t=>t!==task):cleaningTasks.filter(t=>t===task||tasks.includes(t)))} style={[p.task,on&&p.taskOn]}><Text style={[p.taskText,on&&{color:C.accentPressed,fontWeight:'600'}]}>{task}</Text></Pressable>;})}</View>
   <TextInput accessibilityLabel="Что ещё важно" style={p.input} value={extra} onChangeText={setExtra} editable={!busy} multiline maxLength={1500} placeholder="Что ещё важно: где ключи, средства, особые просьбы" placeholderTextColor={C.muted}/></View>
  <View style={p.total}><Text style={p.span}>{recordSpan(start,end)}</Text><View style={p.sum}><Text style={p.amount}>{money(fee)}</Text><Text style={p.sumNote}>за выполнение</Text></View></View>
  <Send title="Опубликовать задание" disabled={busy||!description} busy={busy} onPress={()=>onSubmit({propertyId:property.id,start:stayStamp(start),end:stayStamp(end),fee,description})}/>
  <Text style={p.note}>Исполнители увидят район и условия, точный адрес — после назначения. Время Казахстана.</Text>
 </View>;
}
const R=T.radius,H=T.control;
const p=StyleSheet.create({
 window:{...type.label,marginTop:8,paddingHorizontal:12,paddingVertical:4,alignSelf:'flex-start',borderRadius:T.radius.full,overflow:'hidden',backgroundColor:C.surface,borderWidth:1,borderColor:C.accentLine,color:C.accent,fontWeight:'600'},
 card:{gap:16,marginTop:12,padding:16,borderRadius:R.xl,borderWidth:1,borderColor:C.line,backgroundColor:C.surface},
 head:{gap:4},eyebrow:{...type.caption,color:C.accent,fontWeight:'600',letterSpacing:.8},title:{...type.title,color:C.ink,fontWeight:'700',letterSpacing:-.3},note:{...type.caption,color:C.muted},closed:{...type.body,color:C.ink,fontWeight:'600'},
 field:{gap:8},label:{...type.label,color:C.inkSoft,fontWeight:'600'},strip:{gap:8,paddingRight:8},
 day:{width:64,paddingVertical:8,alignItems:'center',borderWidth:1,borderColor:C.line,borderRadius:R.lg,backgroundColor:C.surface},daySmall:{...type.caption,color:C.muted},dayNumber:{...type.title,color:C.ink,fontWeight:'700'},
 on:{backgroundColor:C.accent,borderColor:C.accent},onText:{color:C.onAccent},
 time:{minWidth:72,minHeight:H.touch,paddingHorizontal:12,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:C.line,borderRadius:R.md,backgroundColor:C.surface},timeText:{...type.body,color:C.ink,fontWeight:'600'},
 row:{flexDirection:'row',gap:12},half:{flex:1},
 stepper:{flexDirection:'row',alignItems:'center',gap:4,height:H.field,paddingHorizontal:4,borderWidth:1,borderColor:C.line,borderRadius:R.md,backgroundColor:C.surface},stepButton:{width:40,height:40,borderRadius:R.sm,backgroundColor:C.surfaceAlt,alignItems:'center',justifyContent:'center'},stepSign:{...type.title,color:C.ink},stepValue:{...type.label,flex:1,textAlign:'center',color:C.ink,fontWeight:'600'},
 segments:{flexDirection:'row',gap:4,padding:4,borderRadius:R.lg,backgroundColor:C.surfaceAlt},segment:{flex:1,minHeight:H.primary,paddingHorizontal:4,borderRadius:R.md,alignItems:'center',justifyContent:'center'},segmentOn:{backgroundColor:C.surface},segmentTitle:{...type.label,color:C.inkSoft,fontWeight:'600'},segmentNote:{...type.caption,color:C.muted},
 fixed:{...type.label,color:C.inkSoft},
 total:{gap:8,padding:16,borderRadius:R.lg,backgroundColor:C.accentSoft},span:{...type.label,color:C.ink,fontWeight:'600'},sum:{flexDirection:'row',flexWrap:'wrap',alignItems:'baseline',columnGap:12,rowGap:4},amount:{...type.heading,color:C.ink,fontWeight:'700',letterSpacing:-.5},sumNote:{...type.caption,color:C.inkSoft},fact:{...type.label,color:C.inkSoft},error:{...type.label,color:C.danger},wait:{flexDirection:'row',alignItems:'center',gap:8},
 consent:{flexDirection:'row',alignItems:'flex-start',gap:12,minHeight:H.touch},box:{width:24,height:24,borderRadius:R.xs,borderWidth:2,borderColor:C.lineStrong,alignItems:'center',justifyContent:'center'},boxOn:{backgroundColor:C.accent,borderColor:C.accent},tick:{...type.label,color:C.onAccent,fontWeight:'700'},consentText:{...type.label,color:C.ink,flex:1},
 send:{minHeight:H.primary,borderRadius:R.md,backgroundColor:C.accent,alignItems:'center',justifyContent:'center',paddingHorizontal:16},sendOff:{backgroundColor:C.surfaceAlt},sendText:{...type.body,color:C.onAccent,fontWeight:'600'},
 tasks:{flexDirection:'row',flexWrap:'wrap',gap:8},task:{minHeight:H.compact,paddingVertical:8,paddingHorizontal:12,borderWidth:1,borderColor:C.line,borderRadius:R.full,backgroundColor:C.surface,justifyContent:'center'},taskOn:{borderColor:C.accentLine,backgroundColor:C.accentSoft},taskText:{...type.label,color:C.inkSoft},
 input:{...type.body,minHeight:88,padding:12,borderWidth:1,borderColor:C.line,borderRadius:R.md,backgroundColor:C.surface,color:C.ink,textAlignVertical:'top'},dim:{opacity:.4},
});
