import React,{useEffect,useState} from 'react';
import {Animated,Pressable,StyleSheet,Text,View} from 'react-native';
import type {Approval} from '../../lib/approvals';
import {request} from './api';
import {uid} from './model';
import {C} from './styles';
import {T} from './tokens';

// The AI administrator's price advice on top of the owner's map, like an incoming notification.
// The owner raises (or lowers) the price with one button or leaves it; «×» only hides it until the next visit.
const money=(n:number)=>new Intl.NumberFormat('ru-RU').format(n)+' ₸';
// A calendar window: free hours between two stays, offered to guests by the hour at a discount.
function WindowTipBody({card,busy,onDecide,compact}:{card:Approval;busy:boolean;onDecide:(action:'accept'|'reject')=>void;compact:boolean}){
 const w=card.window!;
 return <View>
  <View style={t.when}><Text style={t.whenIcon}>◷</Text><Text numberOfLines={1} style={t.whenText}>{w.when}</Text><View style={t.hours}><Text style={t.hoursText}>{w.hours+' ч'}</Text></View></View>
  <View style={t.priceRow} accessible accessibilityLabel={'Час сейчас '+money(w.from)+', в окне '+money(w.to)}>
   <Text style={t.from}>{money(w.from)}</Text><Text style={t.arrow}>→</Text><Text style={t.to}>{money(w.to)}<Text style={t.unit}> / час</Text></Text>
   <View style={[t.delta,t.deltaWindow]}><Text style={[t.deltaText,{color:C.accent}]}>{'−'+w.percent+'%'}</Text></View>
  </View>
  <Text numberOfLines={2} style={t.rows}>Пустует между бронями. Скидку гости увидят только в эти часы.</Text>
  <View style={t.actions}>
   <Pressable accessibilityRole="button" accessibilityLabel={card.acceptLabel} disabled={busy} onPress={()=>onDecide('accept')} style={({pressed})=>[t.accept,(busy||pressed)&&t.dim]}><Text numberOfLines={1} style={t.acceptText}>{card.acceptLabel}</Text></Pressable>
   <Pressable accessibilityRole="button" accessibilityLabel={card.rejectLabel} disabled={busy} onPress={()=>onDecide('reject')} style={({pressed})=>[t.reject,(busy||pressed)&&t.dim]}><Text style={t.rejectText}>{card.rejectLabel}</Text></Pressable>
  </View>
  {!compact&&<Text style={t.note}>Без вашего согласия гостям ничего не покажем.</Text>}
 </View>;
}

export function PriceTipBody({card,busy,onDecide,compact=false}:{card:Approval;busy:boolean;onDecide:(action:'accept'|'reject')=>void;compact?:boolean}){
 if(card.window)return <WindowTipBody card={card} busy={busy} onDecide={onDecide} compact={compact}/>;
 const p=card.price!,up=p.direction==='up';
 return <View>
  <View style={t.priceRow} accessible accessibilityLabel={'Сейчас '+money(p.from)+', предлагаю '+money(p.to)}>
   <Text style={t.from}>{money(p.from)}</Text><Text style={t.arrow}>→</Text><Text style={t.to}>{money(p.to)}</Text>
   <View style={[t.delta,up?t.deltaUp:t.deltaDown]}><Text style={[t.deltaText,{color:up?C.success:C.warning}]}>{(up?'▲ +':'▼ −')+p.percent}%</Text></View>
  </View>
  {compact?<Text numberOfLines={2} style={t.rows}>{p.reasons.slice(0,2).join(' · ')}</Text>:<>
   {p.rows.length>1&&<Text style={t.rows}>{p.rows.slice(1).map(([label,from,to])=>label+': '+money(from)+' → '+money(to)).join('   ')}</Text>}
   {p.reasons.length>0&&<View style={t.reasons}>{p.reasons.map(reason=><View key={reason} style={t.reason}><Text style={t.reasonText}>{reason}</Text></View>)}</View>}
  </>}
  <View style={t.actions}>
   <Pressable accessibilityRole="button" accessibilityLabel={card.acceptLabel} disabled={busy} onPress={()=>onDecide('accept')} style={({pressed})=>[t.accept,(busy||pressed)&&t.dim]}><Text numberOfLines={1} style={t.acceptText}>{card.acceptLabel}</Text></Pressable>
   <Pressable accessibilityRole="button" accessibilityLabel="Оставить цену" disabled={busy} onPress={()=>onDecide('reject')} style={({pressed})=>[t.reject,(busy||pressed)&&t.dim]}><Text style={t.rejectText}>Оставить</Text></Pressable>
  </View>
  {!compact&&<Text style={t.note}>Без вашего согласия цена не изменится.</Text>}
 </View>;
}

export function PriceTip({cards,onChanged}:{cards:Approval[];onChanged?:()=>unknown}){
 const [later,setLater]=useState<string[]>([]),[busy,setBusy]=useState(false),[result,setResult]=useState<{text:string;error:boolean}|null>(null);
 const [slide]=useState(()=>new Animated.Value(0));
 const card=cards.find(c=>(c.kind==='price'&&c.price||c.kind==='window'&&c.window)&&c.canDecide&&!later.includes(c.id));
 const visible=!!card||!!result;
 useEffect(()=>{Animated.spring(slide,{toValue:visible?1:0,useNativeDriver:true,friction:8,tension:60}).start();},[visible,card?.id]);
 useEffect(()=>{if(!result)return;const timer=setTimeout(()=>setResult(null),result.error?8000:5000);return()=>clearTimeout(timer);},[result]);
 if(!visible)return null;
 const style={opacity:slide,transform:[{translateY:slide.interpolate({inputRange:[0,1],outputRange:[-40,0]})}]};
 if(result||!card)return <Animated.View style={[t.box,t.resultBox,style]} accessibilityLiveRegion="polite"><View style={[t.icon,result?.error&&{backgroundColor:C.danger}]}><Text style={t.iconText}>{result?.error?'!':'✓'}</Text></View><Text style={t.resultText}>{result?.text}</Text></Animated.View>;
 async function decide(action:'accept'|'reject'){
  if(!card)return;setBusy(true);
  try{const v=await request('/api/approvals',{id:card.id,revision:card.revision,action},undefined,uid()+':'+card.kind+':'+action,'owner');setResult({text:v.message||'Готово.',error:false});await onChanged?.();}
  catch(error){setResult({text:error instanceof Error?error.message:'Не получилось. Обновите экран.',error:true});}
  finally{setBusy(false);}
 }
 return <Animated.View style={[t.box,style]} accessibilityLabel={card.window?'Окно в календаре от AI администратора':'Совет AI администратора по цене'}>
  <View style={t.head}>
   <View style={t.icon}><Text style={t.iconText}>✦</Text></View>
   <View style={t.titleBox}><Text style={t.small}>{'AI администратор · '+(card.window?'окно в календаре':card.price?.direction==='up'?'спрос вырос':'спрос снизился')}</Text><Text numberOfLines={1} style={t.title}>{card.subject}</Text></View>
   <Pressable accessibilityRole="button" accessibilityLabel="Позже" onPress={()=>setLater(v=>[...v,card.id])} style={t.close}><Text style={t.closeText}>×</Text></Pressable>
  </View>
  <PriceTipBody card={card} busy={busy} onDecide={decide} compact/>
 </Animated.View>;
}

const R=T.radius,H=T.control,F=T.font;
const t=StyleSheet.create({
 box:{position:'absolute',top:68,left:12,right:12,zIndex:20,paddingTop:12,paddingBottom:16,paddingHorizontal:16,borderRadius:R.xl,backgroundColor:C.glassStrong,borderWidth:1.5,borderColor:C.accentLine,shadowColor:C.ink,shadowOffset:{width:0,height:8},shadowOpacity:.18,shadowRadius:24,elevation:8},
 resultBox:{flexDirection:'row',alignItems:'center',gap:12},
 head:{flexDirection:'row',alignItems:'flex-start',gap:12},
 icon:{width:36,height:36,borderRadius:R.full,backgroundColor:C.accent,alignItems:'center',justifyContent:'center'},
 iconText:{color:C.onAccent,fontSize:F.subtitle[0],lineHeight:F.subtitle[1],fontWeight:'700'},
 titleBox:{flex:1,minWidth:0,gap:2},
 small:{fontSize:F.caption[0],lineHeight:F.caption[1],color:C.muted},
 title:{fontSize:F.body[0],lineHeight:F.body[1],fontWeight:'700',color:C.ink},
 close:{width:H.touch,height:H.touch,marginTop:-8,marginRight:-8,alignItems:'center',justifyContent:'center'},
 closeText:{fontSize:F.title[0],lineHeight:F.title[1],color:C.muted},
 priceRow:{flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:8,marginTop:8},
 from:{fontSize:F.body[0],lineHeight:F.body[1],color:C.muted,textDecorationLine:'line-through'},
 arrow:{fontSize:F.body[0],lineHeight:F.body[1],color:C.muted},
 to:{fontSize:F.heading[0],lineHeight:F.heading[1],fontWeight:'700',color:C.ink},
 delta:{paddingHorizontal:8,paddingVertical:2,borderRadius:R.full},deltaUp:{backgroundColor:C.successSoft},deltaDown:{backgroundColor:C.warningSoft},
 deltaText:{fontSize:F.label[0],lineHeight:F.label[1],fontWeight:'600'},
 deltaWindow:{backgroundColor:C.accentSoft},
 unit:{fontSize:F.label[0],lineHeight:F.label[1],fontWeight:'500',color:C.muted},
 when:{flexDirection:'row',alignItems:'center',gap:8,marginTop:8},
 whenIcon:{fontSize:F.body[0],lineHeight:F.body[1],color:C.accent},
 whenText:{flex:1,fontSize:F.label[0],lineHeight:F.label[1],color:C.inkSoft},
 hours:{paddingHorizontal:8,paddingVertical:2,borderRadius:R.full,backgroundColor:C.surfaceAlt},
 hoursText:{fontSize:F.label[0],lineHeight:F.label[1],fontWeight:'600',color:C.ink},
 rows:{marginTop:4,fontSize:F.label[0],lineHeight:F.label[1],color:C.inkSoft},
 reasons:{flexDirection:'row',flexWrap:'wrap',gap:8,marginTop:12},
 reason:{paddingHorizontal:12,paddingVertical:4,borderRadius:R.full,backgroundColor:C.accentSoft,borderWidth:1,borderColor:C.accentLine},
 reasonText:{fontSize:F.label[0],lineHeight:F.label[1],color:C.inkSoft},
 actions:{flexDirection:'row',gap:8,marginTop:12},
 accept:{flex:1,minHeight:H.field,borderRadius:R.full,backgroundColor:C.accent,alignItems:'center',justifyContent:'center',paddingHorizontal:16},
 acceptText:{fontSize:F.body[0],lineHeight:F.body[1],fontWeight:'600',color:C.onAccent},
 reject:{minHeight:H.field,borderRadius:R.full,borderWidth:1,borderColor:C.line,backgroundColor:C.surface,alignItems:'center',justifyContent:'center',paddingHorizontal:16},
 rejectText:{fontSize:F.body[0],lineHeight:F.body[1],fontWeight:'600',color:C.ink},
 note:{marginTop:8,fontSize:F.caption[0],lineHeight:F.caption[1],color:C.muted,textAlign:'center'},
 resultText:{flex:1,fontSize:F.body[0],lineHeight:F.body[1],color:C.ink},
 dim:{opacity:.6},
});
