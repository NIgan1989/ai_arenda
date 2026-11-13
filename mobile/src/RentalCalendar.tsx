import React,{useMemo,useState} from 'react';
import {View,Text,Pressable,StyleSheet} from 'react-native';
import {C,type} from './styles';
import {T} from './tokens';
import {useActivityClock} from './ActivityTimer';
import type {Row} from './model';
import {calendarEntries,entriesOn,monthGrid,shiftMonth,sameMonth,dayStart,dayNumber,dayLine,type CalendarEntry,type CalendarTone} from '../../lib/calendar-days';
// The same calendar as on the site: a month with marks on the days that have something, and the chosen day as a list.
const words=(day:number,options:Intl.DateTimeFormatOptions)=>new Date((day+18000)*1000).toLocaleDateString('ru-RU',{timeZone:'UTC',...options});
const capital=(text:string)=>text.charAt(0).toUpperCase()+text.slice(1);
const weekdays=['пн','вт','ср','чт','пт','сб','вс'];
const dot:Record<CalendarTone,string>={stay:C.accent,request:C.warning,cleaning:C.aiTo,done:C.lineStrong,late:C.danger};
const names:[CalendarTone,string][]=[['stay','Проживание'],['request','Заявка'],['cleaning','Уборка'],['late','Нужна проверка'],['done','Завершено']];
export function RentalCalendar({data,role,busy,onOpen,propertyId=''}:{data:Row;role:string;busy:boolean;onOpen:(kind:string,id:string)=>void;propertyId?:string}){
 const now=useActivityClock()||data.serverTime||Math.floor(Date.now()/1000),today=dayStart(now),minute=Math.floor(now/60);
 const [chosen,setChosen]=useState<number|null>(null),[month,setMonth]=useState<number|null>(null),day=chosen??today,shown=month??day;
 const entries=useMemo(()=>calendarEntries(data,role,propertyId,now),[data.bookings,data.jobs,data.user?.id,role,minute,propertyId]);
 const grid=useMemo(()=>monthGrid(shown),[shown]),list=entriesOn(entries,day),next=list.length?[]:entries.filter(e=>e.start>=day+86400).slice(0,3);
 const present=new Set(grid.flatMap(d=>entriesOn(entries,d).map(e=>e.tone))),legend=names.filter(([tone])=>present.has(tone));
 const move=(by:number)=>{const target=shiftMonth(shown,by);setMonth(target);setChosen(sameMonth(target,today)?today:target);};
 const atToday=day===today&&sameMonth(shown,today);
 const row=(e:CalendarEntry,on:number,withDate=false)=><Pressable key={e.key} accessibilityRole="button" accessibilityLabel={(e.kind==='job'?'Уборка, ':'Бронь, ')+e.title+', '+dayLine(e,on)+', '+e.status} disabled={busy} onPress={()=>onOpen(e.kind,e.id)} style={({pressed})=>[c.entry,pressed&&c.pressed]}><View style={[c.bar,{backgroundColor:dot[e.tone]}]}/><View style={c.copy}><Text style={c.time}>{withDate?words(dayStart(e.start),{day:'numeric',month:'long'})+' · ':''}{dayLine(e,on)}</Text><Text style={c.name}>{e.kind==='job'?'Уборка · ':''}{e.title}</Text><Text style={[c.status,e.tone==='late'&&{color:C.danger}]}>{e.status}</Text></View><Text style={c.chevron}>›</Text></Pressable>;
 return <View style={c.wrap}>
  <View style={c.card}>
   <View style={c.head}><Text accessibilityRole="header" style={c.month}>{capital(words(shown,{month:'long',year:'numeric'}).replace(' г.',''))}</Text><View style={c.nav}><Pressable accessibilityRole="button" accessibilityLabel="Предыдущий месяц" onPress={()=>move(-1)} style={c.navButton}><Text style={c.navText}>‹</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Сегодня" accessibilityState={{disabled:atToday}} disabled={atToday} onPress={()=>{setMonth(null);setChosen(null);}} style={[c.navButton,c.todayButton]}><Text style={[c.todayText,atToday&&{color:C.muted}]}>Сегодня</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Следующий месяц" onPress={()=>move(1)} style={c.navButton}><Text style={c.navText}>›</Text></Pressable></View></View>
   <View style={c.week}>{weekdays.map(w=><Text key={w} style={c.weekday}>{w}</Text>)}</View>
   {Array.from({length:6},(_,w)=><View style={c.week} key={w}>{grid.slice(w*7,w*7+7).map(d=>{const marks=entriesOn(entries,d),tones=[...new Set(marks.map(e=>e.tone))].slice(0,3),on=d===day;return <Pressable key={d} accessibilityRole="button" accessibilityLabel={words(d,{day:'numeric',month:'long'})+(marks.length?', записей: '+marks.length:'')} accessibilityState={{selected:on}} onPress={()=>{setChosen(d);if(!sameMonth(d,shown))setMonth(d);}} style={[c.day,on&&c.dayOn]}><Text style={[c.dayText,!sameMonth(d,shown)&&c.dayOut,d===today&&c.dayToday,on&&c.dayTextOn]}>{dayNumber(d)}</Text><View style={c.dots}>{tones.map(t=><View key={t} style={[c.dot,{backgroundColor:on?C.onAccent:dot[t]}]}/>)}</View></Pressable>;})}</View>)}
   {legend.length>0&&<View style={c.legend}>{legend.map(([tone,label])=><View key={tone} style={c.legendItem}><View style={[c.legendDot,{backgroundColor:dot[tone]}]}/><Text style={c.legendText}>{label}</Text></View>)}</View>}
  </View>
  <View style={c.card}>
   <View style={c.dayHead}><Text accessibilityRole="header" style={c.dayTitle}>{capital(words(day,{weekday:'long',day:'numeric',month:'long'}))}</Text>{day===today&&<Text style={c.todayMark}>Сегодня</Text>}</View>
   {list.length>0?list.map(e=>row(e,day)):<><Text style={c.free}>{role==='cleaner'?'На этот день уборок нет.':'На этот день ничего не запланировано.'}</Text>{next.length>0&&<><Text style={c.nextTitle}>БЛИЖАЙШЕЕ</Text>{next.map(e=>row(e,dayStart(e.start),true))}</>}</>}
   <Text style={c.note}>Время Казахстана. Дата в календаре не подтверждает фактический выезд или приёмку уборки.</Text>
  </View>
 </View>;
}
const R=T.radius,H=T.control;
const c=StyleSheet.create({
 wrap:{gap:16,marginTop:12},card:{gap:8,padding:16,borderRadius:R.xl,borderWidth:1,borderColor:C.line,backgroundColor:C.surface},
 head:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12,marginBottom:4},month:{...type.subtitle,color:C.ink,fontWeight:'700',letterSpacing:-.3,flexShrink:1},
 nav:{flexDirection:'row',alignItems:'center',gap:4},navButton:{minWidth:H.touch,height:H.touch,borderRadius:R.full,backgroundColor:C.surfaceAlt,alignItems:'center',justifyContent:'center'},navText:{...type.title,color:C.ink},todayButton:{paddingHorizontal:12},todayText:{...type.label,color:C.ink,fontWeight:'600'},
 week:{flexDirection:'row'},weekday:{...type.caption,flex:1,textAlign:'center',color:C.muted,paddingVertical:4},
 day:{flex:1,minHeight:H.touch,borderRadius:R.md,alignItems:'center',justifyContent:'center',gap:2},dayOn:{backgroundColor:C.accent},dayText:{...type.body,color:C.ink,fontWeight:'500'},dayOut:{color:C.muted,opacity:.55},dayToday:{color:C.accent,fontWeight:'700'},dayTextOn:{color:C.onAccent,opacity:1},
 dots:{flexDirection:'row',gap:2,height:4},dot:{width:4,height:4,borderRadius:2},
 legend:{flexDirection:'row',flexWrap:'wrap',columnGap:16,rowGap:4,marginTop:4},legendItem:{flexDirection:'row',alignItems:'center',gap:8},legendDot:{width:8,height:8,borderRadius:4},legendText:{...type.caption,color:C.muted},
 dayHead:{flexDirection:'row',flexWrap:'wrap',alignItems:'baseline',columnGap:12,marginBottom:4},dayTitle:{...type.subtitle,color:C.ink,fontWeight:'700'},todayMark:{...type.caption,color:C.accent,fontWeight:'600'},
 entry:{flexDirection:'row',alignItems:'center',gap:12,minHeight:H.primary,padding:12,borderRadius:R.lg,borderWidth:1,borderColor:C.line,backgroundColor:C.surface},pressed:{opacity:.6},bar:{width:4,alignSelf:'stretch',borderRadius:R.xs},
 copy:{flex:1,gap:2},time:{...type.caption,color:C.muted,fontWeight:'600'},name:{...type.body,color:C.ink,fontWeight:'600'},status:{...type.caption,color:C.muted},chevron:{...type.title,color:C.muted},
 free:{...type.label,color:C.muted,padding:16,borderRadius:R.lg,backgroundColor:C.surfaceAlt,overflow:'hidden'},nextTitle:{...type.caption,color:C.muted,fontWeight:'600',letterSpacing:.8,marginTop:8},note:{...type.caption,color:C.muted,marginTop:8},
});
