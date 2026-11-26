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
// The tariff itself is the row «Тариф» under the week (AutopilotPlan.tsx); here only what stops the AI.
function planLine(p:Week['plan']){
 if(!p||p.status==='paused')return tr('Автопилот выключен. Включите режим «ИИ» у объекта, и эти шаги ИИ будет делать сам.');
 return '';
}

// «13–19 ноября» comes from the server in Russian; in another language the app writes the same from the week's ends.
const weekName=(w:{from:number;to:number;label:string})=>{if(lang()==='ru')return w.label;const of=(at:number,o:Intl.DateTimeFormatOptions)=>dateText(at*1000,{timeZone:'Asia/Qyzylorda',...o}),a=w.from,b=w.to-1,one=of(a,{month:'numeric'})===of(b,{month:'numeric'});return one?of(a,{day:'numeric'})+'–'+of(b,{day:'numeric',month:'long'}):of(a,{day:'numeric',month:'long'})+' – '+of(b,{day:'numeric',month:'long'});};
export function AutopilotWeek(){
 const [data,setData]=useState<Week|null>(null),[error,setError]=useState(''),[open,setOpen]=useState('');
 useEffect(()=>{let live=true;request('/api/owner/autopilot-week',undefined,undefined,undefined,'owner').then(r=>{if(live)setData(r);}).catch(e=>{if(live)setError(e.message||tr('Не удалось загрузить отчёт.'));});return()=>{live=false;};},[]);
 if(!data)return error?<Text accessibilityRole="alert" style={w.error}>{error}</Text>:<ThinkingLine style={w.note} text={tr('Считаем неделю…')}/>;
 const share=data.arrivals?data.onTime/data.arrivals:0,toggle=(id:string)=>setOpen(v=>v===id?'':id);
 // One line each, the number first: the week's main figure is the steps above, these only add to it.
 const stat=(value:string,label:string,tone?:string)=><View style={w.stat}><Text style={[w.statValue,!!tone&&{color:tone}]}>{value}</Text><Text style={w.statLabel}>{label}</Text></View>;
 return <View>
  <View accessible accessibilityLabel={tr('Неделя автопилота, {label}. {summary}',{label:weekName(data),summary:data.summary})} style={w.hero}>
   <View><Text style={w.heroLabel}>{tr('Неделя · {label}',{label:weekName(data)})}</Text>
   <Text style={w.heroValue}>{tr(forms(data.steps,'{n} шаг','{n} шага','{n} шагов'),{n:data.steps})}</Text>
   <Text style={w.heroSub}>{tr('ИИ сделал сам, без вас')}</Text></View>
   <View style={w.stats}>
    {stat(String(data.assigned),forms(data.assigned,'уборку назначил','уборки назначил','уборок назначил'))}
    {stat(data.arrivals?tr('{onTime} из {arrivals}',{onTime:data.onTime,arrivals:data.arrivals}):'—',tr('готово к заезду вовремя'),data.arrivals&&data.onTime<data.arrivals?C.danger:undefined)}
    {stat(String(data.decisions),data.decisions?forms(data.decisions,'раз решали вы','раза решали вы','раз решали вы'):tr('решений от вас'))}
   </View>
   {data.arrivals>0&&<View accessibilityLabel={tr('Готово вовремя: {v}%',{v:Math.round(share*100)})} style={w.track}><View style={[w.fill,{width:`${Math.round(share*100)}%`}]}/></View>}
   {data.confirmed>0&&<Text style={w.heroMeta}>{tr(forms(data.confirmed,'Ещё ИИ подтвердил {n} бронь без вас.','Ещё ИИ подтвердил {n} брони без вас.','Ещё ИИ подтвердил {n} броней без вас.'),{n:data.confirmed})}</Text>}
  </View>
  {data.late.length>0&&<Card title={tr('Не успели к заезду')} value={String(data.late.length)} open={open==='late'} onPress={()=>toggle('late')}>
   {data.late.map(l=><View key={l.propertyId+l.start} style={{gap:2}}><Text numberOfLines={1} style={w.placeTitle}>{l.title}</Text><Text style={w.note}>{tr('{day}, заезд в {time}',{day:day(l.start),time:time(l.start)})} · {!l.readyAt?tr('отчёта об уборке нет'):l.minutes?tr('уборка готова в {time}, на {minutes} мин позже',{time:time(l.readyAt),minutes:l.minutes}):tr('уборка готова в {time}',{time:time(l.readyAt)})}</Text></View>)}
   <Text style={w.note}>{tr('ИИ двигает заезд под уборку, когда может. Если опоздания повторяются, увеличьте время на уборку в настройках объекта.')}</Text>
  </Card>}
  {data.places.length>0&&<Card title={tr('По объектам')} value={String(data.places.length)} open={open==='places'} onPress={()=>toggle('places')}>
   {data.places.map(p=><View key={p.id} style={{gap:2}}><Text numberOfLines={1} style={w.placeTitle}>{p.title}</Text><Text style={w.note}>{[p.arrivals?tr('вовремя {onTime} из {arrivals}',{onTime:p.onTime,arrivals:p.arrivals}):'',p.assigned?tr('уборок ИИ {assigned}',{assigned:p.assigned}):'',p.confirmed?tr('броней ИИ {confirmed}',{confirmed:p.confirmed}):'',p.decisions?tr('ваших решений {decisions}',{decisions:p.decisions}):''].filter(Boolean).join(' · ')}</Text></View>)}
  </Card>}
  {!!planLine(data.plan)&&<Text style={w.foot}>{planLine(data.plan)}</Text>}
 </View>;
}

const w=StyleSheet.create({
 hero:{gap:12},
 heroLabel:{...type.label,color:C.muted},
 heroValue:{fontSize:36,lineHeight:40,fontWeight:'600',letterSpacing:-.6,color:C.ink,fontVariant:['tabular-nums']},
 heroSub:{...type.label,color:C.inkSoft},
 heroMeta:{...type.caption,color:C.muted},
 stats:{gap:4,paddingTop:12,borderTopWidth:1,borderTopColor:C.line},
 stat:{flexDirection:'row',alignItems:'baseline',gap:8},statValue:{...type.label,fontWeight:'600',color:C.ink,fontVariant:['tabular-nums'],minWidth:40},statLabel:{...type.label,color:C.inkSoft,flex:1},
 track:{height:6,borderRadius:T.radius.full,backgroundColor:C.surfaceAlt,overflow:'hidden'},fill:{height:6,borderRadius:T.radius.full,backgroundColor:C.ink},
 card:{borderTopWidth:1,borderTopColor:C.line,marginHorizontal:-16},
 cardHead:{minHeight:T.control.field+4,flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:16},
 cardTitle:{...type.label,color:C.ink,fontWeight:'600',flex:1},cardValue:{...type.label,color:C.muted},chev:{...type.subtitle,color:C.lineStrong,width:14,textAlign:'center'},
 cardBody:{paddingHorizontal:16,paddingBottom:16,gap:12},
 placeTitle:{...type.label,color:C.ink,fontWeight:'600'},
 note:{...type.caption,color:C.muted},error:{...type.label,color:C.danger},foot:{...type.caption,color:C.muted,marginTop:12},
});
