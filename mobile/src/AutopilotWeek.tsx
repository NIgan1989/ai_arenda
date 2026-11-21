import {dateText,forms,lang,t as tr} from '../../lib/i18n';
import React,{useEffect,useState} from 'react';
import {View,Text,Pressable,StyleSheet} from 'react-native';
import {type AutopilotWeek as Week} from '../../lib/autopilot-week';
import {request} from './api';
import {ThinkingLine} from './Thinking';
import {C,type,brandFont} from './styles';
import {T} from './tokens';
import {tenge} from './OwnerAnalytics';

// «Неделя автопилота» on top of the owner's «Автопилот» (2026-11-19): what the plan did in the last seven days, so the
// owner sees what they pay for. Three numbers on the night card, the colours of the sign: cleanings the AI assigned
// by itself, arrivals ready in time, the times the owner had to decide. Under it two cards that open: each object,
// and the late arrivals by name. The numbers come from lib/autopilot-week.ts; every Monday the same week comes as a notice.
const time=(t:number)=>dateText(t*1000,{timeZone:'Asia/Qyzylorda',hour:'2-digit',minute:'2-digit'});
const day=(t:number)=>dateText(t*1000,{timeZone:'Asia/Qyzylorda',day:'numeric',month:'long'});
function Card({title,value,open,onPress,children}:{title:string;value?:string;open:boolean;onPress:()=>void;children:React.ReactNode}){
 return <View style={w.card}><Pressable accessibilityRole="button" accessibilityState={{expanded:open}} onPress={onPress} style={({pressed})=>[w.cardHead,pressed&&{opacity:.7}]}><Text style={w.cardTitle}>{title}</Text>{!!value&&<Text style={w.cardValue}>{value}</Text>}<Text style={[w.chev,open&&{transform:[{rotate:'90deg'}]}]}>›</Text></Pressable>{open&&<View style={w.cardBody}>{children}</View>}</View>;
}
function planLine(p:Week['plan']){
 if(!p||p.status==='paused')return tr('Автопилот выключен. Включите режим «ИИ» у объекта, и эти шаги ИИ будет делать сам.');
 if(p.rate!==undefined)return tr('Автопилот входит в тариф: {rate} с каждой брони, без доплат.',{rate:String(p.rate/100).replace('.',',')+'%'});
 if(p.tier==='all')return p.status==='grace'?tr('«Всё включено» не оплачено, работает до {v}.',{v:day(p.until)}):p.units?tr('Тариф «Всё включено»: {price} в месяц за объект · объектов под ИИ: {units}.',{price:tenge(p.price),units:p.units}):tr('Тариф «Всё включено»: {price} в месяц за объект.',{price:tenge(p.price)});
 return p.cap?tr('Оплата за результат: {price} за бронь, которую провёл ИИ, не больше {cap} в месяц за объект.',{price:tenge(p.price),cap:tenge(p.cap)}):tr('Оплата за результат: {price} за бронь, которую провёл ИИ.',{price:tenge(p.price)});
}

// «13–19 ноября» comes from the server in Russian; in another language the app writes the same from the week's ends.
const weekName=(w:{from:number;to:number;label:string})=>{if(lang()==='ru')return w.label;const of=(at:number,o:Intl.DateTimeFormatOptions)=>dateText(at*1000,{timeZone:'Asia/Qyzylorda',...o}),a=w.from,b=w.to-1,one=of(a,{month:'numeric'})===of(b,{month:'numeric'});return one?of(a,{day:'numeric'})+'–'+of(b,{day:'numeric',month:'long'}):of(a,{day:'numeric',month:'long'})+' – '+of(b,{day:'numeric',month:'long'});};
export function AutopilotWeek(){
 const [data,setData]=useState<Week|null>(null),[error,setError]=useState(''),[open,setOpen]=useState('');
 useEffect(()=>{let live=true;request('/api/owner/autopilot-week',undefined,undefined,undefined,'owner').then(r=>{if(live)setData(r);}).catch(e=>{if(live)setError(e.message||tr('Не удалось загрузить отчёт.'));});return()=>{live=false;};},[]);
 if(!data)return error?<Text accessibilityRole="alert" style={w.error}>{error}</Text>:<ThinkingLine style={w.note} text={tr('Считаю неделю…')}/>;
 const share=data.arrivals?data.onTime/data.arrivals:0,toggle=(id:string)=>setOpen(v=>v===id?'':id);
 const stat=(value:string,label:string,tone?:string)=><View style={w.stat}><Text style={[w.statValue,!!tone&&{color:tone}]} adjustsFontSizeToFit numberOfLines={1}>{value}</Text><Text style={w.statLabel}>{label}</Text></View>;
 return <View>
  <View accessible accessibilityLabel={tr('Неделя автопилота, {label}. {summary}',{label:weekName(data),summary:data.summary})} style={w.hero}>
   <Text style={w.heroLabel}>{tr('Неделя автопилота · {label}',{label:weekName(data)})}</Text>
   <Text style={w.heroValue}>{tr(forms(data.steps,'{n} шаг ИИ сделал сам','{n} шага ИИ сделал сам','{n} шагов ИИ сделал сам'),{n:data.steps})}</Text>
   <View style={w.stats}>
    {stat(String(data.assigned),forms(data.assigned,'уборку назначил','уборки назначил','уборок назначил'))}
    {stat(data.arrivals?tr('{onTime} из {arrivals}',{onTime:data.onTime,arrivals:data.arrivals}):'—',tr('готово к заезду вовремя'),data.arrivals&&data.onTime<data.arrivals?C.dangerSoft:undefined)}
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
  <Text style={w.foot}>{planLine(data.plan)}{' '}{tr('Итог недели приходит каждый понедельник в уведомления и Telegram.')}</Text>
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
