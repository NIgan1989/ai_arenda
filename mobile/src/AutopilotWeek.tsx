import React,{useEffect,useState} from 'react';
import {View,Text,Pressable,StyleSheet} from 'react-native';
import {plural,type AutopilotWeek as Week} from '../../lib/autopilot-week';
import {request} from './api';
import {ThinkingLine} from './Thinking';
import {C,type,brandFont} from './styles';
import {T} from './tokens';
import {tenge} from './OwnerAnalytics';

// «Неделя автопилота» on top of the owner's «Автопилот» (2026-11-19): what the plan did in the last seven days, so the
// owner sees what they pay for. Three numbers on the night card, the colours of the sign: cleanings the AI assigned
// by itself, arrivals ready in time, the times the owner had to decide. Under it two cards that open: each object,
// and the late arrivals by name. The numbers come from lib/autopilot-week.ts; every Monday the same week comes as a notice.
const time=(t:number)=>new Date(t*1000).toLocaleTimeString('ru-RU',{timeZone:'Asia/Qyzylorda',hour:'2-digit',minute:'2-digit'});
const day=(t:number)=>new Date(t*1000).toLocaleDateString('ru-RU',{timeZone:'Asia/Qyzylorda',day:'numeric',month:'long'});
function Card({title,value,open,onPress,children}:{title:string;value?:string;open:boolean;onPress:()=>void;children:React.ReactNode}){
 return <View style={w.card}><Pressable accessibilityRole="button" accessibilityState={{expanded:open}} onPress={onPress} style={({pressed})=>[w.cardHead,pressed&&{opacity:.7}]}><Text style={w.cardTitle}>{title}</Text>{!!value&&<Text style={w.cardValue}>{value}</Text>}<Text style={[w.chev,open&&{transform:[{rotate:'90deg'}]}]}>›</Text></Pressable>{open&&<View style={w.cardBody}>{children}</View>}</View>;
}
function planLine(p:Week['plan']){
 if(!p||p.status==='paused')return 'Автопилот выключен. Включите режим «ИИ» у объекта, и эти шаги ИИ будет делать сам.';
 const price=tenge(p.price)+' в месяц за объект';
 return p.status==='trial'?'Пробный период до '+day(p.until)+'. Дальше '+price+'.':p.status==='grace'?'Автопилот не оплачен, работает до '+day(p.until)+'. '+price+'.':'Тариф «Автопилот»: '+price+(p.units?' · объектов: '+p.units:'')+'.';
}

export function AutopilotWeek(){
 const [data,setData]=useState<Week|null>(null),[error,setError]=useState(''),[open,setOpen]=useState('');
 useEffect(()=>{let live=true;request('/api/owner/autopilot-week',undefined,undefined,undefined,'owner').then(r=>{if(live)setData(r);}).catch(e=>{if(live)setError(e.message||'Не удалось загрузить отчёт.');});return()=>{live=false;};},[]);
 if(!data)return error?<Text accessibilityRole="alert" style={w.error}>{error}</Text>:<ThinkingLine style={w.note} text="Считаю неделю…"/>;
 const share=data.arrivals?data.onTime/data.arrivals:0,toggle=(id:string)=>setOpen(v=>v===id?'':id);
 const stat=(value:string,label:string,tone?:string)=><View style={w.stat}><Text style={[w.statValue,!!tone&&{color:tone}]} adjustsFontSizeToFit numberOfLines={1}>{value}</Text><Text style={w.statLabel}>{label}</Text></View>;
 return <View>
  <View accessible accessibilityLabel={'Неделя автопилота, '+data.label+'. '+data.summary} style={w.hero}>
   <Text style={w.heroLabel}>Неделя автопилота · {data.label}</Text>
   <Text style={w.heroValue}>{data.steps} {plural(data.steps,'шаг','шага','шагов')} ИИ сделал сам</Text>
   <View style={w.stats}>
    {stat(String(data.assigned),plural(data.assigned,'уборку назначил','уборки назначил','уборок назначил'))}
    {stat(data.arrivals?data.onTime+' из '+data.arrivals:'—','готово к заезду вовремя',data.arrivals&&data.onTime<data.arrivals?C.dangerSoft:undefined)}
    {stat(String(data.decisions),data.decisions?plural(data.decisions,'раз решали вы','раза решали вы','раз решали вы'):'решений от вас')}
   </View>
   {data.arrivals>0&&<View accessibilityLabel={'Готово вовремя: '+Math.round(share*100)+'%'} style={w.track}><View style={[w.fill,{width:`${Math.round(share*100)}%`}]}/></View>}
   {data.confirmed>0&&<Text style={w.heroMeta}>Ещё ИИ подтвердил {data.confirmed} {plural(data.confirmed,'бронь','брони','броней')} без вас.</Text>}
  </View>
  {data.late.length>0&&<Card title="Не успели к заезду" value={String(data.late.length)} open={open==='late'} onPress={()=>toggle('late')}>
   {data.late.map(l=><View key={l.propertyId+l.start} style={{gap:2}}><Text numberOfLines={1} style={w.placeTitle}>{l.title}</Text><Text style={w.note}>{day(l.start)}, заезд в {time(l.start)} · {l.readyAt?'уборка готова в '+time(l.readyAt)+(l.minutes?', на '+l.minutes+' мин позже':''):'отчёта об уборке нет'}</Text></View>)}
   <Text style={w.note}>ИИ двигает заезд под уборку, когда может. Если опоздания повторяются, увеличьте время на уборку в настройках объекта.</Text>
  </Card>}
  {data.places.length>0&&<Card title="По объектам" value={String(data.places.length)} open={open==='places'} onPress={()=>toggle('places')}>
   {data.places.map(p=><View key={p.id} style={{gap:2}}><Text numberOfLines={1} style={w.placeTitle}>{p.title}</Text><Text style={w.note}>{[p.arrivals?'вовремя '+p.onTime+' из '+p.arrivals:'',p.assigned?'уборок ИИ '+p.assigned:'',p.confirmed?'броней ИИ '+p.confirmed:'',p.decisions?'ваших решений '+p.decisions:''].filter(Boolean).join(' · ')}</Text></View>)}
  </Card>}
  <Text style={w.foot}>{planLine(data.plan)} Итог недели приходит каждый понедельник в уведомления и Telegram.</Text>
 </View>;
}

const w=StyleSheet.create({
 hero:{borderRadius:T.radius.xl,padding:20,backgroundColor:C.night,overflow:'hidden',gap:12},
 heroLabel:{...type.caption,color:'rgba(255,255,255,.7)',letterSpacing:1,textTransform:'uppercase'},
 heroValue:{...type.title,...brandFont,color:C.gold},
 heroMeta:{...type.caption,color:'rgba(255,255,255,.62)'},
 stats:{flexDirection:'row',gap:8,paddingTop:12,borderTopWidth:1,borderTopColor:'rgba(255,255,255,.12)'},
 stat:{flex:1,gap:4},statValue:{...type.title,...brandFont,fontSize:22,color:C.onAccent},statLabel:{...type.caption,color:'rgba(255,255,255,.62)'},
 track:{height:6,borderRadius:T.radius.full,backgroundColor:'rgba(255,255,255,.12)',overflow:'hidden'},fill:{height:6,borderRadius:T.radius.full,backgroundColor:C.gold},
 card:{marginTop:12,borderRadius:T.radius.lg,borderWidth:1,borderColor:C.line,backgroundColor:C.surface,overflow:'hidden'},
 cardHead:{minHeight:T.control.field+4,flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:16},
 cardTitle:{...type.label,color:C.ink,fontWeight:'600',flex:1},cardValue:{...type.label,color:C.muted},chev:{...type.subtitle,color:C.lineStrong,width:14,textAlign:'center'},
 cardBody:{paddingHorizontal:16,paddingBottom:16,gap:12},
 placeTitle:{...type.label,color:C.ink,fontWeight:'600'},
 note:{...type.caption,color:C.muted},error:{...type.label,color:C.danger},foot:{...type.caption,color:C.muted,marginTop:12,marginHorizontal:4},
});
