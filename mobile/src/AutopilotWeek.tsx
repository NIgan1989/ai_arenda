import {dateText,forms,lang,t as tr} from '../../lib/i18n';
import React,{useEffect,useState} from 'react';
import {View,Text,Pressable,StyleSheet} from 'react-native';
import {type AutopilotWeek as Week} from '../../lib/autopilot-week';
import {request} from './api';
import {ThinkingLine} from './Thinking';
import {C,type} from './styles';
import {T} from './tokens';

// «Неделя автопилота» on top of the owner's «Автопилот» (2026-11-19): what the plan did in the last seven days, so the
// owner sees what they pay for. As the concept of the menu (Plum's savings): the steps in one big number, then three
// numbers in a row: cleanings the AI assigned by itself, arrivals ready in time, the times the owner had to decide. Under it two cards that open: each object,
// and the late arrivals by name. The numbers come from lib/autopilot-week.ts; every Monday the same week comes as a notice.
const time=(t:number)=>dateText(t*1000,{timeZone:'Asia/Qyzylorda',hour:'2-digit',minute:'2-digit'});
const day=(t:number)=>dateText(t*1000,{timeZone:'Asia/Qyzylorda',day:'numeric',month:'long'});
// A line that opens in place, as the rows of the menu.
function Card({title,value,open,onPress,children}:{title:string;value?:string;open:boolean;onPress:()=>void;children:React.ReactNode}){
 return <View style={w.card}><Pressable accessibilityRole="button" accessibilityState={{expanded:open}} onPress={onPress} style={({pressed})=>[w.cardHead,pressed&&{opacity:.7}]}><Text style={w.cardTitle}>{title}</Text>{!!value&&<Text style={w.cardValue}>{value}</Text>}<Text style={[w.chev,open&&{transform:[{rotate:'90deg'}]}]}>›</Text></Pressable>{open&&<View style={w.cardBody}>{children}</View>}</View>;
}

// «13–19 ноября» comes from the server in Russian; in another language the app writes the same from the week's ends.
const weekName=(w:{from:number;to:number;label:string})=>{if(lang()==='ru')return w.label;const of=(at:number,o:Intl.DateTimeFormatOptions)=>dateText(at*1000,{timeZone:'Asia/Qyzylorda',...o}),a=w.from,b=w.to-1,one=of(a,{month:'numeric'})===of(b,{month:'numeric'});return one?of(a,{day:'numeric'})+'–'+of(b,{day:'numeric',month:'long'}):of(a,{day:'numeric',month:'long'})+' – '+of(b,{day:'numeric',month:'long'});};
// The bars of the week (timespent's week): the AI's steps of each of the seven days, from the dates of its journal;
// today is black, the other days grey. Only the height says the count: the number of the week is above.
const DAY=86400;
export function Bars({from,journal,now}:{from:number;journal:{at:number}[];now?:number}){
 const today=now===undefined?6:Math.floor((now-from)/DAY);
 const counts=Array.from({length:7},(_,i)=>journal.filter(e=>e.at>=from+i*DAY&&e.at<from+(i+1)*DAY).length),top=Math.max(1,...counts);
 return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={w.bars}>{counts.map((n,i)=>{const at=from+i*DAY,last=i===today;
  return <View key={i} style={w.barCol}><View style={w.barTrack}><View style={[w.bar,{height:Math.max(4,Math.round(48*n/top))},last&&w.barToday]}/></View><Text style={[w.barDay,last&&w.barDayToday]}>{dateText(at*1000+DAY*500,{timeZone:'Asia/Qyzylorda',weekday:'short'}).replace('.','')}</Text></View>;})}</View>;
}
export function AutopilotWeek({journal=[]}:{journal?:{at:number}[]}){
 const [data,setData]=useState<Week|null>(null),[error,setError]=useState(''),[open,setOpen]=useState('');
 useEffect(()=>{let live=true;request('/api/owner/autopilot-week',undefined,undefined,undefined,'owner').then(r=>{if(live)setData(r);}).catch(e=>{if(live)setError(e.message||tr('Не удалось загрузить отчёт.'));});return()=>{live=false;};},[]);
 if(!data)return error?<Text accessibilityRole="alert" style={w.error}>{error}</Text>:<ThinkingLine style={w.note} text={tr('Считаем неделю…')}/>;
 const toggle=(id:string)=>setOpen(v=>v===id?'':id);
 // One line each, the number first: the week's main figure is the steps above, these only add to it.
 const stat=(value:string,label:string,tone?:string,last=false)=><View style={[w.stat,last&&w.statLast]}><Text style={[w.statValue,!!tone&&{color:tone}]}>{value}</Text><Text style={w.statLabel}>{label}</Text></View>;
 return <View>
  <View accessible accessibilityLabel={tr('Неделя автопилота, {label}. {summary}',{label:weekName(data),summary:data.summary})} style={w.hero}>
   <View><Text style={w.heroLabel}>{weekName(data)}</Text>
   <Text style={w.heroValue}>{tr(forms(data.steps,'{n} шаг','{n} шага','{n} шагов'),{n:data.steps})}<Text style={w.heroSub}>{'  '+tr('ИИ сделал без вас')}</Text></Text></View>
   <Bars from={data.from} journal={journal}/>
   <View style={w.stats}>
    {stat(String(data.assigned),forms(data.assigned,'уборку назначил','уборки назначил','уборок назначил'))}
    {stat(data.arrivals?tr('{onTime} из {arrivals}',{onTime:data.onTime,arrivals:data.arrivals}):'—',tr('готово к заезду вовремя'),data.arrivals&&data.onTime<data.arrivals?C.danger:undefined)}
    {stat(String(data.decisions),tr('решали вы'),undefined,true)}
   </View>
   {data.confirmed>0&&<Text style={w.heroMeta}>{tr(forms(data.confirmed,'Ещё ИИ подтвердил {n} бронь без вас.','Ещё ИИ подтвердил {n} брони без вас.','Ещё ИИ подтвердил {n} броней без вас.'),{n:data.confirmed})}</Text>}
  </View>
  {data.late.length>0&&<Card title={tr('Не успели к заезду')} value={String(data.late.length)} open={open==='late'} onPress={()=>toggle('late')}>
   {data.late.map(l=><View key={l.propertyId+l.start} style={{gap:2}}><Text numberOfLines={1} style={w.placeTitle}>{l.title}</Text><Text style={w.note}>{tr('{day}, заезд в {time}',{day:day(l.start),time:time(l.start)})} · {!l.readyAt?tr('отчёта об уборке нет'):l.minutes?tr('уборка готова в {time}, на {minutes} мин позже',{time:time(l.readyAt),minutes:l.minutes}):tr('уборка готова в {time}',{time:time(l.readyAt)})}</Text></View>)}
   <Text style={w.note}>{tr('ИИ двигает заезд под уборку, когда может. Если опоздания повторяются, увеличьте время на уборку в настройках объекта.')}</Text>
  </Card>}
  {data.places.length>0&&<Card title={tr('По объектам')} value={String(data.places.length)} open={open==='places'} onPress={()=>toggle('places')}>
   {data.places.map(p=><View key={p.id} style={{gap:2}}><Text numberOfLines={1} style={w.placeTitle}>{p.title}</Text><Text style={w.note}>{[p.arrivals?tr('вовремя {onTime} из {arrivals}',{onTime:p.onTime,arrivals:p.arrivals}):'',p.assigned?tr('уборок ИИ {assigned}',{assigned:p.assigned}):'',p.confirmed?tr('броней ИИ {confirmed}',{confirmed:p.confirmed}):'',p.decisions?tr('ваших решений {decisions}',{decisions:p.decisions}):''].filter(Boolean).join(' · ')}</Text></View>)}
  </Card>}
 </View>;
}

const w=StyleSheet.create({
 hero:{gap:16,marginTop:20},
 heroLabel:{...type.label,color:C.muted},
 heroValue:{fontSize:40,lineHeight:48,fontWeight:'600',letterSpacing:-.6,color:C.ink,fontVariant:['tabular-nums']},
 heroSub:{...type.label,fontWeight:'500',letterSpacing:0,color:C.muted},
 heroMeta:{...type.caption,color:C.muted},
 stats:{flexDirection:'row',borderTopWidth:1,borderBottomWidth:1,borderColor:C.line},
 stat:{flex:1,paddingVertical:12,paddingRight:8,gap:2,borderRightWidth:1,borderRightColor:C.line,marginRight:12},statLast:{borderRightWidth:0,marginRight:0},statValue:{fontSize:22,lineHeight:28,fontWeight:'600',color:C.ink,fontVariant:['tabular-nums']},statLabel:{...type.caption,color:C.muted},
 bars:{flexDirection:'row',gap:8},barCol:{flex:1,alignItems:'center',gap:8},barTrack:{height:48,width:'100%',justifyContent:'flex-end'},bar:{width:'100%',borderRadius:4,backgroundColor:C.surfaceAlt},barToday:{backgroundColor:C.ink},barDay:{...type.caption,color:C.muted},barDayToday:{color:C.ink,fontWeight:'600'},
 card:{borderTopWidth:1,borderTopColor:C.line,marginHorizontal:-16},
 cardHead:{minHeight:T.control.field+4,flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:16},
 cardTitle:{...type.label,color:C.ink,fontWeight:'600',flex:1},cardValue:{...type.label,color:C.muted},chev:{...type.subtitle,color:C.lineStrong,width:14,textAlign:'center'},
 cardBody:{paddingHorizontal:16,paddingBottom:16,gap:12},
 placeTitle:{...type.label,color:C.ink,fontWeight:'600'},
 note:{...type.caption,color:C.muted},error:{...type.label,color:C.danger},
});
