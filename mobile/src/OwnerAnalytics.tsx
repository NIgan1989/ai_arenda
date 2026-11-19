import React,{useEffect,useState} from 'react';
import {View,Text,Pressable,Animated,Easing,StyleSheet,type StyleProp,type ViewStyle} from 'react-native';
import type {OwnerAnalytics as Report,AnalyticsPeriod} from '../../lib/owner-analytics';
import {request} from './api';
import {RowIcon} from './AccountRows';
import {ThinkingLine} from './Thinking';
import {C,type,brandFont} from './styles';
import {T} from './tokens';

// «Доходы» in the owner's menu (2026-11-19): how the business goes, on one screen and in short cards.
// On top the one number that matters, net profit, with the six months under it; then four tiles; then the AI's
// advice; then cards that open: expenses, each object, guests, money ahead. The numbers come from lib/owner-analytics.ts.
const PERIODS:[AnalyticsPeriod,string,string][]=[['week','Неделя','к прошлой неделе'],['month','Месяц','к прошлым 30 дням'],['year','Год','к прошлому году']];
export const tenge=(v:number)=>new Intl.NumberFormat('ru-RU').format(Math.round(v)).replace(/\s/g,' ')+' ₸';
/** Short money for a menu row and tiles: 1,2 млн ₸, 350 тыс ₸. */
export const shortTenge=(v:number)=>{const a=Math.abs(v),sign=v<0?'−':'';return a>=1e6?sign+(Math.round(a/1e5)/10).toString().replace('.',',')+' млн ₸':a>=1e4?sign+Math.round(a/1e3)+' тыс ₸':sign+tenge(a);};
const count=(v:number)=>new Intl.NumberFormat('ru-RU').format(Math.round(v)).replace(/\s/g,' ');
const change=(v:number|null|undefined)=>v===null||v===undefined?null:(v>0?'+':v<0?'−':'')+Math.abs(v)+'%';
export function loadAnalytics(period:AnalyticsPeriod):Promise<Report>{return request('/api/owner/analytics?period='+period,undefined,undefined,undefined,'owner');}

// A bar that grows from nothing when the numbers arrive: the screen feels alive without a library.
function Grow({value,style,vertical=false,delay=0}:{value:number;style:StyleProp<ViewStyle>;vertical?:boolean;delay?:number}){
 const [v]=useState(()=>new Animated.Value(0));
 useEffect(()=>{v.setValue(0);Animated.timing(v,{toValue:Math.max(0,Math.min(1,value)),duration:T.motion.slow*2,delay,easing:Easing.out(Easing.cubic),useNativeDriver:false}).start();},[value]); // eslint-disable-line react-hooks/exhaustive-deps
 const size=v.interpolate({inputRange:[0,1],outputRange:['0%','100%']});
 return <Animated.View style={[style,vertical?{height:size}:{width:size}]}/>;
}
function Card({title,value,open,onPress,children}:{title:string;value?:string;open:boolean;onPress:()=>void;children:React.ReactNode}){
 return <View style={st.card}><Pressable accessibilityRole="button" accessibilityState={{expanded:open}} onPress={onPress} style={({pressed})=>[st.cardHead,pressed&&{opacity:.7}]}><Text style={st.cardTitle}>{title}</Text>{!!value&&<Text style={st.cardValue}>{value}</Text>}<Text style={[st.chev,open&&{transform:[{rotate:'90deg'}]}]}>›</Text></Pressable>{open&&<View style={st.cardBody}>{children}</View>}</View>;
}
const Line=({label,value,share,tint=C.accent}:{label:string;value:string;share?:number;tint?:string})=><View style={{gap:8}}><View style={st.line}><Text style={st.lineLabel}>{label}</Text><Text style={st.lineValue}>{value}</Text></View>{share!==undefined&&<View style={st.track}><Grow value={share} style={[st.fill,{backgroundColor:tint}]}/></View>}</View>;

export function OwnerAnalytics({tint=C.accent}:{tint?:string}){
 const [period,setPeriod]=useState<AnalyticsPeriod>('month'),[data,setData]=useState<Report|null>(null),[error,setError]=useState(''),[open,setOpen]=useState('');
 useEffect(()=>{let live=true;loadAnalytics(period).then(r=>{if(live)setData(r);}).catch(e=>{if(live)setError(e.message||'Не удалось загрузить показатели.');});return()=>{live=false;};},[period]);
 const toggle=(id:string)=>setOpen(v=>v===id?'':id);
 const seg=<View accessibilityRole="tablist" accessibilityLabel="Срок" style={st.seg}>{PERIODS.map(([id,label])=><Pressable key={id} accessibilityRole="tab" accessibilityState={{selected:id===period}} onPress={()=>{if(id!==period){setPeriod(id);setOpen('');setError('');}}} style={[st.segItem,id===period&&st.segOn]}><Text style={[st.segText,id===period&&st.segTextOn]}>{label}</Text></Pressable>)}</View>;
 if(!data||data.period!==period)return <View>{seg}{error?<Text accessibilityRole="alert" style={st.error}>{error}</Text>:<ThinkingLine style={st.note} text="Считаю показатели…"/>}</View>;
 const m=data.money,s=data.stays,vs=PERIODS.find(p=>p[0]===period)![2],peak=Math.max(1,...data.trend.map(t=>t.revenue),...data.trend.map(t=>t.expenses));
 const net=change(m.change.net),rev=change(m.change.revenue),costs:[string,number,string][]=([['Уборки',m.cleaning,C.aiTo],['Комиссия сервиса',m.commission,C.accent],['Автопилот',m.autopilot,C.aiFrom],['Свои расходы',m.other,C.warning]] as [string,number,string][]).filter(c=>c[1]>0);
 const occTone=s.occupancy>=70?C.success:s.occupancy>=40?C.goldInk:C.warning;
 return <View>
  {seg}
  {/* The hero: night indigo and gold, the colours of the sign. */}
  <View accessible accessibilityLabel={'Чистая прибыль '+tenge(m.net)+(net?', '+net+' '+vs:'')} style={st.hero}>
   <Text style={st.heroLabel}>Чистая прибыль</Text>
   <Text style={[st.heroValue,m.net<0&&{color:C.dangerSoft}]} adjustsFontSizeToFit numberOfLines={1}>{tenge(m.net)}</Text>
   <View style={st.heroRow}>{!!net&&<View style={[st.badge,{backgroundColor:(m.change.net||0)>=0?'rgba(34,197,94,.18)':'rgba(239,68,68,.2)'}]}><Text style={[st.badgeText,{color:(m.change.net||0)>=0?C.successSoft:C.dangerSoft}]}>{net} {vs}</Text></View>}{m.margin!==null&&<Text style={st.heroMeta}>маржа {m.margin}%</Text>}</View>
   <View style={st.heroSplit}><View style={{flex:1}}><Text style={st.heroMeta}>Выручка</Text><Text style={st.heroSmall}>{tenge(m.revenue)}{rev?<Text style={st.heroMeta}>  {rev}</Text>:null}</Text></View><View style={{flex:1}}><Text style={st.heroMeta}>Расходы</Text><Text style={st.heroSmall}>{tenge(m.expenses)}</Text></View></View>
   <View accessibilityLabel="Выручка и чистая прибыль за шесть месяцев" style={st.chart}>{data.trend.map((t,i)=><View key={t.month} style={st.col}><View style={st.bars}><View style={st.barSlot}><Grow vertical delay={i*60} value={t.revenue/peak} style={st.barRev}/></View><View style={st.barSlot}><Grow vertical delay={i*60+30} value={Math.max(0,t.net)/peak} style={st.barNet}/></View></View><Text style={[st.colLabel,i===5&&{color:C.gold}]}>{t.label}</Text></View>)}</View>
   <View style={st.legend}><View style={[st.dot,{backgroundColor:'rgba(165,180,252,.55)'}]}/><Text style={st.heroMeta}>выручка</Text><View style={[st.dot,{backgroundColor:C.gold,marginLeft:12}]}/><Text style={st.heroMeta}>чистыми</Text></View>
  </View>
  {/* Four tiles: the numbers an owner asks first. */}
  <View style={st.tiles}>
   <View style={st.tile}><Text style={st.tileLabel}>Загрузка</Text><Text style={[st.tileValue,{color:occTone}]}>{s.occupancy}%</Text><View style={st.track}><Grow value={s.occupancy/100} style={[st.fill,{backgroundColor:occTone}]}/></View>{!!s.occupancyChange&&<Text style={st.tileNote}>{(s.occupancyChange||0)>0?'+':'−'}{Math.abs(s.occupancyChange||0)} п. {vs}</Text>}</View>
   <View style={st.tile}><Text style={st.tileLabel}>Брони</Text><Text style={st.tileValue}>{s.sold}</Text><Text style={st.tileNote}>{s.nights>=1?s.nights+' сут.':s.hours+' ч'} · заявок {s.requests}</Text></View>
   <View style={st.tile}><Text style={st.tileLabel}>Средний чек</Text><Text style={st.tileValue}>{s.average?shortTenge(s.average):'—'}</Text><Text style={st.tileNote}>{s.perNight?shortTenge(s.perNight)+' за сутки':'за бронь'}</Text></View>
   <View style={st.tile}><Text style={st.tileLabel}>Оценка гостей</Text><Text style={st.tileValue}>{s.rating?'★ '+String(s.rating).replace('.',','):'—'}</Text><Text style={st.tileNote}>{s.reviews?'отзывов '+s.reviews:'отзывов пока нет'}</Text></View>
  </View>
  {/* The AI reads the numbers and says what to do: rules, one line each. */}
  {data.advice.length>0&&<View style={st.advice}><View style={{flexDirection:'row',alignItems:'center',gap:8}}><RowIcon icon="sparkles" tint={C.aiTo}/><Text style={st.adviceTitle}>Совет ИИ</Text></View>{data.advice.map(a=><Text key={a} style={st.adviceText}>{a}</Text>)}</View>}
  {data.ahead.count>0&&<View style={st.ahead}><Text style={st.aheadText}>Впереди {data.ahead.count} {data.ahead.count===1?'бронь':data.ahead.count<5?'брони':'броней'}</Text><Text style={st.aheadValue}>{tenge(data.ahead.amount)}</Text></View>}
  <Card title="Расходы" value={tenge(m.expenses)} open={open==='costs'} onPress={()=>toggle('costs')}>
   {costs.length?costs.map(([label,v,c])=><Line key={label} label={label} value={tenge(v)} share={m.expenses?v/m.expenses:0} tint={c}/>):<Text style={st.note}>За этот срок расходов нет.</Text>}
   {m.revenue>0&&<Text style={st.note}>Из каждых 100 ₸ выручки у вас остаётся {Math.max(0,Math.round(m.net/m.revenue*100))} ₸.</Text>}
  </Card>
  <Card title="По объектам" value={data.places.length?String(data.places.length):undefined} open={open==='places'} onPress={()=>toggle('places')}>
   {data.places.length?data.places.map(p=><View key={p.id} style={{gap:8}}><View style={st.line}><Text numberOfLines={1} style={[st.lineLabel,{fontWeight:'600',color:C.ink}]}>{p.title}</Text><Text style={st.lineValue}>{tenge(p.revenue)}</Text></View><View style={st.track}><Grow value={p.occupancy/100} style={[st.fill,{backgroundColor:tint}]}/></View><Text style={st.note}>загрузка {p.occupancy}% · броней {p.bookings} · чистыми {tenge(p.net)}</Text></View>):<Text style={st.note}>Объектов пока нет.</Text>}
  </Card>
  <Card title="Гости и спрос" value={data.funnel.views?count(data.funnel.views)+' показов':undefined} open={open==='guests'} onPress={()=>toggle('guests')}>
   <Line label={'Показы в поиске'+(data.funnel.days<data.days?' (30 дней)':'')} value={count(data.funnel.views)}/>
   <Line label="Заявки" value={String(data.funnel.requests)}/>
   {data.funnel.conversion!==null&&<Line label="Из показа в заявку" value={String(data.funnel.conversion).replace('.',',')+'%'}/>}
   <Line label="Гостей" value={String(s.guests)}/>
   <Line label="Вернулись снова" value={String(s.repeat)}/>
   <Line label="Отменено заявок" value={s.cancelled+(s.requests?' из '+s.requests:'')} share={s.requests?s.cancelled/s.requests:0} tint={C.warning}/>
  </Card>
  <Text style={st.foot}>{data.note}</Text>
 </View>;
}

const st=StyleSheet.create({
 seg:{flexDirection:'row',padding:4,borderRadius:T.radius.md,backgroundColor:C.surfaceAlt,marginBottom:12},segItem:{flex:1,minHeight:36,borderRadius:T.radius.sm,alignItems:'center',justifyContent:'center'},segOn:{backgroundColor:C.surface},segText:{...type.label,color:C.muted,fontWeight:'500'},segTextOn:{color:C.ink,fontWeight:'600'},
 hero:{borderRadius:T.radius.xl,padding:20,backgroundColor:C.night,overflow:'hidden'},
 heroLabel:{...type.caption,color:'rgba(255,255,255,.7)',letterSpacing:1,textTransform:'uppercase'},
 heroValue:{...type.heading,...brandFont,color:C.gold,marginTop:8},
 heroRow:{flexDirection:'row',alignItems:'center',gap:8,marginTop:8,flexWrap:'wrap'},
 badge:{paddingHorizontal:8,paddingVertical:4,borderRadius:T.radius.full},badgeText:{...type.caption,fontWeight:'600'},
 heroMeta:{...type.caption,color:'rgba(255,255,255,.62)'},heroSmall:{...type.label,color:C.onAccent,fontWeight:'600',marginTop:2},
 heroSplit:{flexDirection:'row',gap:12,marginTop:16,paddingTop:12,borderTopWidth:1,borderTopColor:'rgba(255,255,255,.12)'},
 chart:{flexDirection:'row',alignItems:'flex-end',height:96,marginTop:16,gap:8},col:{flex:1,alignItems:'center',gap:8},
 bars:{flexDirection:'row',alignItems:'flex-end',height:72,gap:4},barSlot:{width:9,height:72,justifyContent:'flex-end'},
 barRev:{width:9,borderRadius:4,backgroundColor:'rgba(165,180,252,.55)'},barNet:{width:9,borderRadius:4,backgroundColor:C.gold},
 colLabel:{...type.caption,fontSize:12,color:'rgba(255,255,255,.6)'},
 legend:{flexDirection:'row',alignItems:'center',gap:8,marginTop:8},dot:{width:8,height:8,borderRadius:4},
 tiles:{flexDirection:'row',flexWrap:'wrap',gap:8,marginTop:12},
 tile:{flexBasis:'48%',flexGrow:1,minHeight:104,padding:12,borderRadius:T.radius.lg,borderWidth:1,borderColor:C.line,backgroundColor:C.surface,gap:4},
 tileLabel:{...type.caption,color:C.muted},tileValue:{...type.title,...brandFont,fontSize:22,color:C.ink},tileNote:{...type.caption,color:C.muted},
 track:{height:6,borderRadius:T.radius.full,backgroundColor:C.surfaceAlt,overflow:'hidden'},fill:{height:6,borderRadius:T.radius.full},
 advice:{marginTop:12,padding:16,borderRadius:T.radius.lg,borderWidth:1,borderColor:C.aiTo,backgroundColor:C.surface,gap:8},
 adviceTitle:{...type.label,color:C.ink,fontWeight:'700'},adviceText:{...type.label,color:C.inkSoft},
 ahead:{marginTop:12,flexDirection:'row',alignItems:'center',justifyContent:'space-between',padding:16,borderRadius:T.radius.lg,backgroundColor:C.goldSoft,borderWidth:1,borderColor:C.goldLine},
 aheadText:{...type.label,color:C.goldInk,fontWeight:'600'},aheadValue:{...type.subtitle,color:C.goldInk,fontWeight:'700'},
 card:{marginTop:12,borderRadius:T.radius.lg,borderWidth:1,borderColor:C.line,backgroundColor:C.surface,overflow:'hidden'},
 cardHead:{minHeight:T.control.field+4,flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:16},
 cardTitle:{...type.label,color:C.ink,fontWeight:'600',flex:1},cardValue:{...type.label,color:C.muted},chev:{...type.subtitle,color:C.lineStrong,width:14,textAlign:'center'},
 cardBody:{paddingHorizontal:16,paddingBottom:16,gap:12},
 line:{flexDirection:'row',alignItems:'baseline',gap:8},lineLabel:{...type.label,color:C.muted,flex:1},lineValue:{...type.label,color:C.ink,fontWeight:'600'},
 note:{...type.caption,color:C.muted},error:{...type.label,color:C.danger},foot:{...type.caption,color:C.muted,marginTop:12,marginHorizontal:4},
});
