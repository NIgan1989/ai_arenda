import {dateText,L,t as tr,tServer} from '../../lib/i18n';
import React,{useEffect,useMemo,useState} from 'react';
import {Image,View,Text,Pressable,StyleSheet} from 'react-native';
import {menuIcons} from './AccountRows';
import {C,type} from './styles';
import {AiMark} from './AiMark';
import {T} from './tokens';
import {useActivityClock} from './ActivityTimer';
import {uid,type Row} from './model';
import {request} from './api';
import {TimeRow} from './MainParts';
import {calendarEntries,entriesOn,monthGrid,shiftMonth,sameMonth,dayStart,dayNumber,dayLine,type CalendarEntry,type CalendarTone} from '../../lib/calendar-days';
// The same calendar as on the site: a month with marks on the days that have something, and the chosen day as a list.
const words=(day:number,options:Intl.DateTimeFormatOptions)=>dateText((day+18000)*1000,{timeZone:'UTC',...options});
const capital=(text:string)=>text.charAt(0).toUpperCase()+text.slice(1);
const weekdays=L(['пн','вт','ср','чт','пт','сб','вс']);
const dot:Record<CalendarTone,string>={stay:C.ink,request:C.gold,cleaning:C.inkSoft,done:C.lineStrong,late:C.danger};
const names:[CalendarTone,string][]=L([['stay','Проживание'],['request','Заявка'],['cleaning','Уборка'],['late','Нужна проверка'],['done','Завершено']]);
export function RentalCalendar({data,role,busy,onOpen,propertyId='',onChanged}:{data:Row;role:string;busy:boolean;onOpen:(kind:string,id:string)=>void;propertyId?:string;onChanged?:()=>Promise<unknown>}){
 const now=useActivityClock()||data.serverTime||Math.floor(Date.now()/1000),today=dayStart(now),minute=Math.floor(now/60);
 const [chosen,setChosen]=useState<number|null>(null),[month,setMonth]=useState<number|null>(null),day=chosen??today,shown=month??day;
 const entries=useMemo(()=>calendarEntries(data,role,propertyId,now),[data.bookings,data.jobs,data.user?.id,role,minute,propertyId]);
 const grid=useMemo(()=>monthGrid(shown),[shown]),list=entriesOn(entries,day),next=list.length?[]:entries.filter(e=>e.start>=day+86400).slice(0,3);
 const present=new Set(grid.flatMap(d=>entriesOn(entries,d).map(e=>e.tone))),legend=names.filter(([tone])=>present.has(tone));
 const move=(by:number)=>{const target=shiftMonth(shown,by);setMonth(target);setChosen(sameMonth(target,today)?today:target);};
 const atToday=day===today&&sameMonth(shown,today);
 // Concept of 2026-11-25 (Airbnb's host calendar): every day is a tile with what it holds, the guest's name on a booked day,
 // the price on a free one, and the share of busy days of the month on top.
 const owner=role==='owner',flats:Row[]=data.ownProperties||[],flat=propertyId?flats.find(p=>p.id===propertyId):flats.length===1?flats[0]:undefined;
 const short=(v:number)=>v>=1000?tr('{n} тыс',{n:String(Math.round(v/100)/10).replace('.',',')}):String(v);
 const who=(e:CalendarEntry)=>{if(e.kind!=='booking')return tr('Уборка');const b=(data.bookings||[]).find((x:Row)=>x.id===e.id);const name=String(b?.guest_name||'').trim().split(/\s+/)[0];return e.tone==='request'?tr('Заявка'):name||tr('Бронь');};
 // Days the owner closed for guests (lib/closed-days.ts), of this one home.
 const [closedNow,setClosedNow]=useState<Row[]|null>(null),closedList:Row[]=closedNow||data.closedDays||[];
 const closed=new Set(flat?closedList.filter((c:Row)=>c.property_id===flat.id).map((c:Row)=>Number(c.day)):[]);
 const [acting,setActing]=useState(false),[said,setSaid]=useState<{text:string;error:boolean}|null>(null);
 useEffect(()=>{setClosedNow(null);},[data.closedDays]);
 useEffect(()=>{setSaid(null);},[chosen,month]);
 async function dayAction(path:string,body:Row,key:string){if(acting)return;setActing(true);setSaid(null);try{const v=await request('/api/'+path,body,undefined,uid()+':'+key,'owner');if(Array.isArray(v?.closedDays))setClosedNow(v.closedDays);setSaid({text:tServer(v?.message||tr('Готово.')),error:false});await onChanged?.();}catch(e){setSaid({text:e instanceof Error?e.message:tr('Не получилось. Обновите экран.'),error:true});}finally{setActing(false);}}
 const inMonth=grid.filter(d=>sameMonth(d,shown)),places=propertyId?1:Math.max(1,flats.length),placeOf=(e:CalendarEntry)=>(data.bookings||[]).find((b:Row)=>b.id===e.id)?.property_id||e.id;
 // Busy property-days against all property-days of the month: one of two homes booked all month is 50%, not 100%.
 const busyDays=inMonth.reduce((n,d)=>n+new Set(entriesOn(entries,d).filter(e=>e.kind==='booking'&&e.tone!=='request').map(placeOf)).size,0),busyShare=inMonth.length?Math.min(100,Math.round(busyDays/(inMonth.length*places)*100)):0;
 const row=(e:CalendarEntry,on:number,withDate=false)=><Pressable key={e.key} accessibilityRole="button" accessibilityLabel={[e.kind==='job'?tr('Уборка'):tr('Бронь'),e.title,dayLine(e,on),e.status].join(', ')} disabled={busy} onPress={()=>onOpen(e.kind,e.id)} style={({pressed})=>[c.entry,pressed&&c.pressed]}><View style={[c.bar,{backgroundColor:dot[e.tone]}]}/><View style={c.copy}><Text style={c.time}>{withDate?words(dayStart(e.start),{day:'numeric',month:'long'})+' · ':''}{dayLine(e,on)}</Text><Text style={c.name}>{e.kind==='job'?tr('Уборка · {what}',{what:e.title}):e.title}</Text><Text style={[c.status,e.tone==='late'&&{color:C.danger}]}>{e.status}</Text></View><Text style={c.chevron}>›</Text></Pressable>;
 // The chosen day of one home, for its owner (concept of 2026-11-25, Klook and Airbnb): free or closed, the price of
 // the day, the AI administrator's price advice (it changes the price of every day, so it says so), and «Закрыть день».
 // A day a guest arrives on or stays through is not closed; a guest leaving that morning does not stand in the way.
 const money=(v:number)=>new Intl.NumberFormat('ru-RU').format(v)+' ₸';
 const dayShut=closed.has(day),dayTaken=list.some(e=>e.kind==='booking'&&(e.start>=day||e.end>=day+86400));
 const advice=owner&&flat?(data.approvals||[]).find((a:Row)=>a.kind==='price'&&a.canDecide&&a.price?.propertyId===flat.id):undefined;
 const dayPanel=owner&&flat&&day>=today&&!dayTaken?<View style={c.ownerDay}>
  <Text style={c.dayState}>{dayShut?tr('Закрыт для гостей'):tr('Свободно')}</Text>
  {!dayShut&&typeof flat.price==='number'&&<Text style={c.dayPrice}>{money(flat.price)}<Text style={c.dayUnit}>{'  '+tr('за сутки')}</Text></Text>}
  {dayShut&&<Text style={c.dayNote}>{tr('Гости из приложения не смогут забронировать этот день.')}</Text>}
  {!!advice&&!dayShut&&<View style={c.advice}><AiMark/><View style={c.copy}><Text style={c.adviceTitle}>{tr('ИИ советует {v}',{v:money(Number(advice.price.to))})}</Text><Text style={c.dayNote}>{[advice.price.reasons?.[0]?tServer(String(advice.price.reasons[0])):'',tr('Цена сменится для всех дней.')].filter(Boolean).join('. ')}</Text></View></View>}
  <View style={c.dayButtons}>
   {!!advice&&!dayShut&&<Pressable accessibilityRole="button" accessibilityLabel={tr('Поставить {v}',{v:money(Number(advice.price.to))})} disabled={acting||busy} onPress={()=>void dayAction('approvals',{id:advice.id,revision:advice.revision,action:'accept'},'price')} style={({pressed})=>[c.dark,(pressed||acting)&&c.pressed]}><Text numberOfLines={1} style={c.darkText}>{tr('Поставить {v}',{v:money(Number(advice.price.to))})}</Text></Pressable>}
   <Pressable accessibilityRole="button" accessibilityLabel={dayShut?tr('Открыть день'):tr('Закрыть день')} disabled={acting||busy} onPress={()=>void dayAction(dayShut?'operations/calendar/open-day':'operations/calendar/close-day',{propertyId:flat.id,day},dayShut?'open-day':'close-day')} style={({pressed})=>[c.outline,(pressed||acting)&&c.pressed]}><Text numberOfLines={1} style={c.outlineText}>{dayShut?tr('Открыть день'):tr('Закрыть день')}</Text></Pressable>
  </View>
  {!!said&&<Text accessibilityRole={said.error?'alert':undefined} accessibilityLiveRegion="polite" style={[c.dayNote,said.error&&{color:C.danger}]}>{said.text}</Text>}
 </View>:null;
 // The performer's schedule (concept «Мой график»): the week as one strip, the chosen day under it as stops by time.
 if(role==='cleaner'){
  const dow=(v:number)=>(new Date((v+18000)*1000).getUTCDay()+6)%7,first=day-dow(day)*86400,days=Array.from({length:7},(_,i)=>first+i*86400);
  const at=(v:number)=>dateText((v+18000)*1000,{timeZone:'UTC',hour:'2-digit',minute:'2-digit'});
  const go=(by:number)=>{setMonth(null);setChosen(day+by*86400);};
  return <View style={c.wrap}>
   <View style={c.card}>
    <View style={c.head}><View style={c.monthBox}><Text accessibilityRole="header" style={c.month}>{capital(words(day,{month:'long',year:'numeric'}).replace(' г.',''))}</Text></View><View style={c.nav}><Pressable accessibilityRole="button" accessibilityLabel={tr('Предыдущая неделя')} onPress={()=>go(-7)} style={c.navButton}><Text style={c.navText}>‹</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={tr('Сегодня')} accessibilityState={{disabled:day===today}} disabled={day===today} onPress={()=>{setMonth(null);setChosen(null);}} style={[c.navButton,c.todayButton]}><Text style={[c.todayText,day===today&&{color:C.muted}]}>{tr('Сегодня')}</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={tr('Следующая неделя')} onPress={()=>go(7)} style={c.navButton}><Text style={c.navText}>›</Text></Pressable></View></View>
    <View style={c.strip}>{days.map(d=>{const n=entriesOn(entries,d).length,on=d===day;return <Pressable key={d} accessibilityRole="button" accessibilityState={{selected:on}} accessibilityLabel={tr('{day}, записей: {n}',{day:words(d,{day:'numeric',month:'long'}),n})} onPress={()=>setChosen(d)} style={({pressed})=>[c.stripDay,on&&c.stripOn,pressed&&c.pressed]}><Text style={[c.stripWeek,on&&c.stripTextOn]}>{weekdays[dow(d)]}</Text><Text style={[c.stripNum,d===today&&c.dayToday,on&&c.stripTextOn]}>{dayNumber(d)}</Text><View style={c.dots}>{Array.from({length:Math.min(3,n)},(_,i)=><View key={i} style={[c.stripDot,on&&{backgroundColor:C.onAccent}]}/>)}</View></Pressable>;})}</View>
   </View>
   <View style={c.card}>
    <View style={c.dayHead}><Text accessibilityRole="header" style={c.dayTitle}>{capital(words(day,{weekday:'long',day:'numeric',month:'long'}))}</Text>{day===today&&<Text style={c.todayMark}>{tr('Сегодня')}</Text>}</View>
    {list.length>0?list.map((e,i)=><TimeRow key={e.key} time={at(Math.max(e.start,day))} title={e.title} line={[dayLine(e,day),e.status].filter(Boolean).join(' · ')} now={e.start<=now&&now<e.end} last={i===list.length-1} onPress={()=>onOpen(e.kind,e.id)} label={[tr('Уборка'),e.title,dayLine(e,day),e.status].join(', ')}/>)
     :<><Text style={c.free}>{tr('На этот день уборок нет.')}</Text>{next.length>0&&<><Text style={c.nextTitle}>{tr('БЛИЖАЙШЕЕ')}</Text>{next.map(e=>row(e,dayStart(e.start),true))}</>}</>}
    <Text style={c.note}>{tr('Время Казахстана. Дата в календаре не подтверждает фактический выезд или приёмку уборки.')}</Text>
   </View>
  </View>;
 }
 return <View style={c.wrap}>
  <View style={c.card}>
   <View style={c.head}><View style={c.monthBox}><Text accessibilityRole="header" style={c.month}>{capital(words(shown,{month:'long',year:'numeric'}).replace(' г.',''))}</Text>{owner&&<Text style={c.busy}>{tr('занято {n}%',{n:busyShare})}</Text>}</View><View style={c.nav}><Pressable accessibilityRole="button" accessibilityLabel={tr('Предыдущий месяц')} onPress={()=>move(-1)} style={c.navButton}><Text style={c.navText}>‹</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={tr('Сегодня')} accessibilityState={{disabled:atToday}} disabled={atToday} onPress={()=>{setMonth(null);setChosen(null);}} style={[c.navButton,c.todayButton]}><Text style={[c.todayText,atToday&&{color:C.muted}]}>{tr('Сегодня')}</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={tr('Следующий месяц')} onPress={()=>move(1)} style={c.navButton}><Text style={c.navText}>›</Text></Pressable></View></View>
   <View style={c.week}>{weekdays.map(w=><Text key={w} style={c.weekday}>{w}</Text>)}</View>
   {Array.from({length:6},(_,w)=><View style={c.week} key={w}>{grid.slice(w*7,w*7+7).map(d=>{const marks=entriesOn(entries,d),tones=[...new Set(marks.map(e=>e.tone))].slice(0,3),on=d===day;if(owner){const out=!sameMonth(d,shown);if(out)return <View key={d} style={c.tileGap}/>;const stay=marks.find(e=>e.kind==='booking'),past=d<today,shut=!stay&&!past&&closed.has(d),price=!stay&&!past&&typeof flat?.price==='number'?short(flat.price):'';const job=marks.some(e=>e.kind==='job'),line=stay?who(stay):job?tr('Уборка'):shut?tr('закрыт'):price;return <Pressable key={d} accessibilityRole="button" accessibilityLabel={[words(d,{day:'numeric',month:'long'}),line,marks.length?tr('записей: {n}',{n:marks.length}):''].filter(Boolean).join(', ')} accessibilityState={{selected:on}} onPress={()=>setChosen(d)} style={[c.tile,stay&&(stay.tone==='request'?c.tileAsk:c.tileStay),past&&!stay&&c.tilePast,shut&&c.tileShut,on&&c.tileOn]}><Text style={[c.tileNum,stay&&stay.tone!=='request'&&c.tileNumStay,d===today&&c.dayToday]}>{dayNumber(d)}</Text>{/* As in Airbnb's host calendar: a booking is a dark band through its days, a request a light one, a cleaning a dot;
   only a free day says a word, its price. */}{stay?<View style={[c.band,stay.tone==='request'&&c.bandAsk]}/>:job?<View style={c.jobDot}/>:shut&&line===tr('закрыт')?<Image source={menuIcons.lock} style={c.tileLock} accessibilityElementsHidden importantForAccessibility="no"/>:<Text numberOfLines={1} style={c.tileLine}>{line}</Text>}</Pressable>;}
return <Pressable key={d} accessibilityRole="button" accessibilityLabel={marks.length?tr('{day}, записей: {n}',{day:words(d,{day:'numeric',month:'long'}),n:marks.length}):words(d,{day:'numeric',month:'long'})} accessibilityState={{selected:on}} onPress={()=>{setChosen(d);if(!sameMonth(d,shown))setMonth(d);}} style={[c.day,on&&c.dayOn]}><Text style={[c.dayText,!sameMonth(d,shown)&&c.dayOut,d===today&&c.dayToday,on&&c.dayTextOn]}>{dayNumber(d)}</Text><View style={c.dots}>{tones.map(t=><View key={t} style={[c.dot,{backgroundColor:on?C.onAccent:dot[t]}]}/>)}</View></Pressable>;})}</View>)}
   {legend.length>0&&!owner&&<View style={c.legend}>{legend.map(([tone,label])=><View key={tone} style={c.legendItem}><View style={[c.legendDot,{backgroundColor:dot[tone]}]}/><Text style={c.legendText}>{label}</Text></View>)}</View>}
  </View>
  <View style={c.card}>
   <View style={c.dayHead}><Text accessibilityRole="header" style={c.dayTitle}>{capital(words(day,{weekday:'long',day:'numeric',month:'long'}))}</Text>{day===today&&<Text style={c.todayMark}>{tr('Сегодня')}</Text>}</View>
   {dayPanel}
   {list.length>0?list.map(e=>row(e,day)):!dayPanel&&<><Text style={c.free}>{role==='cleaner'?tr('На этот день уборок нет.'):tr('На этот день ничего не запланировано.')}</Text>{next.length>0&&<><Text style={c.nextTitle}>{tr('БЛИЖАЙШЕЕ')}</Text>{next.map(e=>row(e,dayStart(e.start),true))}</>}</>}
   <Text style={c.note}>{tr('Время Казахстана. Дата в календаре не подтверждает фактический выезд или приёмку уборки.')}</Text>
  </View>
 </View>;
}
const R=T.radius,H=T.control;
const c=StyleSheet.create({
 wrap:{gap:16,marginTop:12},card:{gap:8,padding:16,borderRadius:R.xl,borderWidth:1,borderColor:C.line,backgroundColor:C.surface},
 head:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12,marginBottom:4},month:{...type.subtitle,color:C.ink,fontWeight:'600',letterSpacing:-.3,flexShrink:1},
 nav:{flexDirection:'row',alignItems:'center',gap:4},navButton:{minWidth:H.touch,height:H.touch,borderRadius:R.full,backgroundColor:C.surfaceAlt,alignItems:'center',justifyContent:'center'},navText:{...type.title,color:C.ink},todayButton:{paddingHorizontal:12},todayText:{...type.label,color:C.ink,fontWeight:'600'},
 week:{flexDirection:'row'},strip:{flexDirection:'row',gap:8,marginTop:4},stripDay:{flex:1,minHeight:64,borderRadius:R.md,backgroundColor:C.surfaceAlt,alignItems:'center',justifyContent:'center',gap:2},stripOn:{backgroundColor:C.ink},stripWeek:{...type.caption,color:C.muted,fontWeight:'600'},stripNum:{...type.body,color:C.ink,fontWeight:'600'},stripTextOn:{color:C.onAccent},stripDot:{width:5,height:5,borderRadius:4,backgroundColor:C.ink},weekday:{...type.caption,flex:1,textAlign:'center',color:C.muted,paddingVertical:4},
 day:{flex:1,minHeight:H.touch,borderRadius:R.md,alignItems:'center',justifyContent:'center',gap:2},dayOn:{backgroundColor:C.accent},dayText:{...type.body,color:C.ink,fontWeight:'500'},dayOut:{color:C.muted,opacity:.55},dayToday:{color:C.accent,fontWeight:'600'},dayTextOn:{color:C.onAccent,opacity:1},
 monthBox:{flexShrink:1,gap:2},busy:{...type.caption,color:C.muted},
 tile:{flex:1,minHeight:56,margin:2,padding:4,borderRadius:R.sm,backgroundColor:C.surfaceAlt,justifyContent:'space-between'},tileGap:{flex:1,margin:2},band:{height:6,marginHorizontal:-4,marginBottom:2,backgroundColor:C.ink},bandAsk:{backgroundColor:C.lineStrong},jobDot:{width:6,height:6,borderRadius:4,marginBottom:4,backgroundColor:C.ink},tileStay:{},tileAsk:{},tilePast:{opacity:.5},tileOn:{borderWidth:2,borderColor:C.ink},tileShut:{backgroundColor:C.surface,borderWidth:1,borderStyle:'dashed',borderColor:C.lineStrong},
 tileNum:{...type.label,color:C.ink,fontWeight:'600'},tileNumStay:{color:C.accent},tileLine:{fontSize:12,lineHeight:12,color:C.muted},tileLineStay:{color:C.accent,fontWeight:'600'},tileLineAsk:{color:C.warning,fontWeight:'600'},tileLock:{width:14,height:14,tintColor:C.inkSoft},
 dots:{flexDirection:'row',gap:2,height:4},dot:{width:4,height:4,borderRadius:2},
 legend:{flexDirection:'row',flexWrap:'wrap',columnGap:16,rowGap:4,marginTop:4},legendItem:{flexDirection:'row',alignItems:'center',gap:8},legendDot:{width:8,height:8,borderRadius:4},legendText:{...type.caption,color:C.muted},
 dayHead:{flexDirection:'row',flexWrap:'wrap',alignItems:'baseline',columnGap:12,marginBottom:4},dayTitle:{...type.subtitle,color:C.ink,fontWeight:'600'},todayMark:{...type.caption,color:C.accent,fontWeight:'600'},
 entry:{flexDirection:'row',alignItems:'center',gap:12,minHeight:H.primary,padding:12,borderRadius:R.lg,borderWidth:1,borderColor:C.line,backgroundColor:C.surface},pressed:{opacity:.6},bar:{width:4,alignSelf:'stretch',borderRadius:R.xs},
 copy:{flex:1,gap:2},time:{...type.caption,color:C.muted,fontWeight:'600'},name:{...type.body,color:C.ink,fontWeight:'600'},status:{...type.caption,color:C.muted},chevron:{...type.title,color:C.muted},
 ownerDay:{gap:8,paddingBottom:12,marginBottom:4,borderBottomWidth:1,borderBottomColor:C.line},dayState:{...type.label,color:C.muted},dayPrice:{...type.heading,color:C.ink,fontWeight:'600',fontVariant:['tabular-nums']},dayUnit:{...type.body,color:C.muted,fontWeight:'500'},dayNote:{...type.label,color:C.muted},
 advice:{flexDirection:'row',alignItems:'flex-start',gap:12,paddingVertical:12},adviceTitle:{...type.body,color:C.ink,fontWeight:'600'},
 dayButtons:{flexDirection:'row',flexWrap:'wrap',gap:8,marginTop:4},dark:{flexGrow:1,flexShrink:0,minHeight:H.primary,paddingHorizontal:12,borderRadius:R.full,backgroundColor:C.accent,alignItems:'center',justifyContent:'center'},darkText:{...type.body,color:C.surface,fontWeight:'600'},outline:{flexGrow:1,flexShrink:0,minHeight:H.primary,paddingHorizontal:12,borderRadius:R.full,borderWidth:1,borderColor:C.lineStrong,backgroundColor:C.surface,alignItems:'center',justifyContent:'center'},outlineText:{...type.body,color:C.ink,fontWeight:'600'},
 free:{...type.label,color:C.muted,padding:16,borderRadius:R.lg,backgroundColor:C.surfaceAlt,overflow:'hidden'},nextTitle:{...type.caption,color:C.muted,fontWeight:'600',marginTop:8},note:{...type.caption,color:C.muted,marginTop:8},
});
