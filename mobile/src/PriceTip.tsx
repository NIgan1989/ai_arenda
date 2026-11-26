import {t as tr,tServer} from '../../lib/i18n';
import React,{useEffect,useState} from 'react';
import {Animated,Pressable,StyleSheet,Text,View} from 'react-native';
import type {Approval} from '../../lib/approvals';
import {request} from './api';
import {uid} from './model';
import {C} from './styles';
import {AiMark} from './AiMark';
import {T} from './tokens';
import {ReliabilityBadge} from './Reliability';

// The AI administrator's price advice on top of the owner's map, like an incoming notification.
// The owner raises (or lowers) the price with one button or leaves it; «×» only hides it until the next visit.
const money=(n:number)=>new Intl.NumberFormat('ru-RU').format(n)+' ₸';
// A calendar window: free hours between two stays, offered to guests by the hour at a discount.
function WindowTipBody({card,busy,onDecide,compact}:{card:Approval;busy:boolean;onDecide:(action:'accept'|'reject')=>void;compact:boolean}){
 const w=card.window!;
 return <View>
  <View style={t.when}><Text style={t.whenIcon}>◷</Text><Text numberOfLines={1} style={t.whenText}>{w.when}</Text><View style={t.hours}><Text style={t.hoursText}>{tr('{hours} ч',{hours:w.hours})}</Text></View></View>
  <View style={t.priceRow} accessible accessibilityLabel={tr('Час сейчас {v}, в окне {v2}',{v:money(w.from),v2:money(w.to)})}>
   <Text style={t.from}>{money(w.from)}</Text><Text style={t.arrow}>→</Text><Text style={t.to}>{money(w.to)}<Text style={t.unit}>{' '}{tr('/ час')}</Text></Text>
   <View style={[t.delta,t.deltaWindow]}><Text style={[t.deltaText,{color:C.ink}]}>{'−'+w.percent+'%'}</Text></View>
  </View>
  <Text numberOfLines={2} style={t.rows}>{tr('Пустует между бронями. Скидку гости увидят только в эти часы.')}</Text>
  <View style={t.actions}>
   <Pressable accessibilityRole="button" accessibilityLabel={card.acceptLabel} disabled={busy} onPress={()=>onDecide('accept')} style={({pressed})=>[t.accept,(busy||pressed)&&t.dim]}><Text numberOfLines={1} style={t.acceptText}>{card.acceptLabel}</Text></Pressable>
   <Pressable accessibilityRole="button" accessibilityLabel={card.rejectLabel} disabled={busy} onPress={()=>onDecide('reject')} style={({pressed})=>[t.reject,(busy||pressed)&&t.dim]}><Text style={t.rejectText}>{card.rejectLabel}</Text></Pressable>
  </View>
  {!compact&&<Text style={t.note}>{tr('Без вашего согласия гостям ничего не покажем.')}</Text>}
 </View>;
}

// The week ahead: seven evenings of the city, the busy ones tall and bright, the quiet ones low.
function ForecastTipBody({card,busy,onDecide,compact}:{card:Approval;busy:boolean;onDecide:(action:'accept'|'reject')=>void;compact:boolean}){
 const f=card.forecast!,priced=f.advice==='raise'||f.advice==='lower';
 return <View>
  <View style={t.days} accessible accessibilityLabel={tr('Загрузка города по вечерам: {v}',{v:f.days.map(d=>d.label+' '+d.load+'%').join(', ')})}>
   {f.days.map(d=><View key={d.label+d.date} style={t.day}>
    <View style={t.bar}><View style={[t.fill,{height:`${Math.max(8,d.load)}%`},d.level==='busy'?t.fillBusy:d.level==='quiet'?t.fillQuiet:null]}/></View>
    <Text style={[t.dayLabel,d.level==='quiet'&&{color:C.muted}]}>{d.label}</Text><Text style={[t.dayLoad,d.level==='busy'&&t.dayLoadBusy]}>{d.load+'%'}</Text>
   </View>)}
  </View>
  <Text numberOfLines={2} style={t.summary}>{f.summary+'.'}</Text>
  {priced&&<View style={t.priceRow} accessible accessibilityLabel={tr('Сейчас {v}, предлагаю {v2}',{v:money(f.from),v2:money(f.to)})}>
   <Text style={t.from}>{money(f.from)}</Text><Text style={t.arrow}>→</Text><Text style={t.to}>{money(f.to)}</Text>
   <View style={[t.delta,f.advice==='raise'?t.deltaUp:t.deltaDown]}><Text style={[t.deltaText,{color:f.advice==='raise'?C.success:C.warning}]}>{(f.advice==='raise'?'+':'−')+f.percent+'%'}</Text></View>
  </View>}
  {f.advice==='min_hours'&&<View style={t.priceRow} accessible accessibilityLabel={tr('Минимум {from} ч, предлагаю {to} ч',{from:f.from,to:f.to})}>
   <Text style={t.from}>{tr('от {from} ч',{from:f.from})}</Text><Text style={t.arrow}>→</Text><Text style={t.to}>{tr('от {to} ч',{to:f.to})}</Text>
  </View>}
  {f.advice!=='none'&&<Text numberOfLines={compact?2:4} style={t.rows}>{tr('«{title}» свободна в эти дни',{title:f.title})+(compact?'':'. '+f.reasons.map(tServer).join(' · '))}</Text>}
  <View style={t.actions}>
   <Pressable accessibilityRole="button" accessibilityLabel={card.acceptLabel} disabled={busy} onPress={()=>onDecide('accept')} style={({pressed})=>[t.accept,(busy||pressed)&&t.dim]}><Text numberOfLines={1} style={t.acceptText}>{card.acceptLabel}</Text></Pressable>
   <Pressable accessibilityRole="button" accessibilityLabel={card.rejectLabel} disabled={busy} onPress={()=>onDecide('reject')} style={({pressed})=>[t.reject,(busy||pressed)&&t.dim]}><Text style={t.rejectText}>{card.rejectLabel}</Text></Pressable>
  </View>
  {!compact&&f.advice!=='none'&&<Text style={t.note}>{tr('Без вашего согласия ничего не изменится.')}</Text>}
 </View>;
}

// Listing quality: the flat next to similar flats that are booked more often, and one button.
function ListingTipBody({card,busy,onDecide,compact}:{card:Approval;busy:boolean;onDecide:(action:'accept'|'reject')=>void;compact:boolean}){
 const l=card.listing!,icon=l.kind==='photos'?'▣':l.kind==='checkin'?'⚿':l.kind==='text'?'≡':'✓';
 const compare=l.kind==='photos'?[[String(l.mine),tr('фото у вас')],[String(l.theirs),tr('у тех, кого бронируют чаще')]]:l.kind==='text'?[[String(l.mine),tr('знаков у вас')],[String(l.theirs),tr('у тех, кого бронируют чаще')]]
  :l.kind==='amenity'?[[tr('Нет'),tr('у вас: {v}',{v:l.amenity.toLocaleLowerCase('ru')})],[tr('{count} из {leaders}',{count:l.count,leaders:l.leaders}),tr('отмечают у себя')]]:l.kind==='hourly'?[['—',tr('почасовой цены нет')],[money(l.value),tr('в час, как у {count} из {leaders}',{count:l.count,leaders:l.leaders})]]:[[tr('Встреча'),tr('сейчас у вас')],[tr('{count} из {leaders}',{count:l.count,leaders:l.leaders}),tr('заселяют без встречи')]];
 return <View>
  <View style={t.compare} accessible accessibilityLabel={compare[0].join(' ')+'; '+compare[1].join(' ')}>
   <View style={t.cmpMine}><Text numberOfLines={1} style={t.cmpValue}>{compare[0][0]}</Text><Text style={t.cmpLabel}>{compare[0][1]}</Text></View>
   <View style={t.cmpIcon}><Text style={t.cmpIconText}>{icon}</Text></View>
   <View style={t.cmpThem}><Text numberOfLines={1} style={t.cmpValue}>{compare[1][0]}</Text><Text style={t.cmpLabel}>{compare[1][1]}</Text></View>
  </View>
  <Text numberOfLines={compact?4:6} style={t.rows}>{l.text}</Text>
  <View style={t.actions}>
   <Pressable accessibilityRole="button" accessibilityLabel={card.acceptLabel} disabled={busy} onPress={()=>onDecide('accept')} style={({pressed})=>[t.accept,(busy||pressed)&&t.dim]}><Text numberOfLines={1} style={t.acceptText}>{card.acceptLabel}</Text></Pressable>
   <Pressable accessibilityRole="button" accessibilityLabel={card.rejectLabel} disabled={busy} onPress={()=>onDecide('reject')} style={({pressed})=>[t.reject,(busy||pressed)&&t.dim]}><Text style={t.rejectText}>{card.rejectLabel}</Text></Pressable>
  </View>
  {!compact&&<Text style={t.note}>{tr('Сравниваю с похожими объектами в вашем городе за последние 2 месяца.')}</Text>}
 </View>;
}

// Cleaning price: the flat's price next to what similar flats pay (or what cleaners refused), and one button.
function CleaningTipBody({card,busy,onDecide,compact}:{card:Approval;busy:boolean;onDecide:(action:'accept'|'reject')=>void;compact:boolean}){
 const c=card.cleaningTip!,compare=[[money(c.from),c.refused?tr('отказов: {refused}',{refused:c.refused}):tr('сейчас у вас')],[money(c.to),c.typical?tr('платят за похожие'):tr('предлагаю')]];
 return <View>
  <View style={t.compare} accessible accessibilityLabel={compare[0].join(' ')+'; '+compare[1].join(' ')}>
   <View style={t.cmpMine}><Text numberOfLines={1} style={t.cmpValue}>{compare[0][0]}</Text><Text style={t.cmpLabel}>{compare[0][1]}</Text></View>
   <View style={t.cmpIcon}><Text style={t.cmpIconText}>→</Text></View>
   <View style={t.cmpThem}><Text numberOfLines={1} style={t.cmpValue}>{compare[1][0]}</Text><Text style={t.cmpLabel}>{compare[1][1]}</Text></View>
  </View>
  <Text numberOfLines={compact?4:6} style={t.rows}>{c.text}</Text>
  <View style={t.actions}>
   <Pressable accessibilityRole="button" accessibilityLabel={card.acceptLabel} disabled={busy} onPress={()=>onDecide('accept')} style={({pressed})=>[t.accept,(busy||pressed)&&t.dim]}><Text numberOfLines={1} style={t.acceptText}>{card.acceptLabel}</Text></Pressable>
   <Pressable accessibilityRole="button" accessibilityLabel={card.rejectLabel} disabled={busy} onPress={()=>onDecide('reject')} style={({pressed})=>[t.reject,(busy||pressed)&&t.dim]}><Text style={t.rejectText}>{card.rejectLabel}</Text></Pressable>
  </View>
  {!compact&&<Text style={t.note}>{tr('Открытые уборки уйдут исполнителям заново по новой цене. Без вашего согласия ничего не изменится.')}</Text>}
 </View>;
}

// Late checkout or early check-in for the guest who asked about it in the booking chat.
function StayTipBody({card,busy,onDecide,compact}:{card:Approval;busy:boolean;onDecide:(action:'accept'|'reject')=>void;compact:boolean}){
 const o=card.stay!;
 return <View>
  <View style={t.when}><Text style={t.whenIcon}>◷</Text><Text numberOfLines={1} style={t.whenText}>{o.kind==='late'?tr('Выезд {when}',{when:o.when}):tr('Заезд {when}',{when:o.when})}</Text><View style={t.hours}><Text style={t.hoursText}>{tr('+{hours} ч',{hours:o.hours})}</Text></View></View>
  <View style={t.priceRow} accessible accessibilityLabel={tr('Доплата {v}',{v:money(o.extra)})}>
   <Text style={t.to}>{'+'+money(o.extra)}</Text><Text style={t.unit}>{tr('итого {v}',{v:money(o.amount)})}</Text>
  </View>
  <Text numberOfLines={2} style={t.rows}>{o.automatic?tr('Календарь свободен, уборка успевает. Оформлю сразу.'):tr('Календарь свободен, уборка успевает. Время изменится после подтверждения владельца.')}</Text>
  <View style={t.actions}>
   <Pressable accessibilityRole="button" accessibilityLabel={card.acceptLabel} disabled={busy} onPress={()=>onDecide('accept')} style={({pressed})=>[t.accept,(busy||pressed)&&t.dim]}><Text numberOfLines={1} style={t.acceptText}>{card.acceptLabel}</Text></Pressable>
   <Pressable accessibilityRole="button" accessibilityLabel={card.rejectLabel} disabled={busy} onPress={()=>onDecide('reject')} style={({pressed})=>[t.reject,(busy||pressed)&&t.dim]}><Text style={t.rejectText}>{card.rejectLabel}</Text></Pressable>
  </View>
  {!compact&&<Text style={t.note}>{tr('Доплата войдёт в остаток к оплате по брони.')}</Text>}
 </View>;
}

// A new booking request pops up on the owner's map like an order: dates, money, the AI's risk read.
type Decision='accept'|'reject'|'deposit';
// The facts of a card come from the server with Russian labels: a fact is found by that label.
const fact=(card:Approval,label:string)=>card.facts.find(([l])=>l===label)?.[1]||'';
const riskTone={low:[C.successSoft,C.success],medium:[C.warningSoft,C.warning],high:[C.dangerSoft,C.danger]} as const;
function BookingTipBody({card,busy,onDecide}:{card:Approval;busy:boolean;onDecide:(action:Decision)=>void}){
 const r=card.risk!,[bg,fg]=riskTone[r.level];
 const btn=(label:string,action:Decision,primary:boolean)=><Pressable key={action} accessibilityRole="button" accessibilityLabel={label} disabled={busy} onPress={()=>onDecide(action)} style={({pressed})=>[primary?t.accept:[t.reject,{flex:1}],(busy||pressed)&&t.dim]}><Text numberOfLines={1} style={primary?t.acceptText:t.rejectText}>{label}</Text></Pressable>;
 return <View>
  <View style={t.priceRow}><Text style={t.to}>{fact(card,'Проживание')}</Text><Text numberOfLines={1} style={[t.unit,{flexShrink:1}]}>{tServer(card.from)}</Text><ReliabilityBadge value={card.reliability} compact/></View>
  <View style={[t.when,{marginTop:4}]}><Text style={t.whenIcon}>◷</Text><Text numberOfLines={1} style={t.whenText}>{fact(card,'Заезд')+' → '+fact(card,'Выезд')}</Text></View>
  <View accessibilityLabel={r.label} style={[t.risk,{backgroundColor:bg,borderColor:r.level==='medium'?C.warningLine:bg}]}>
   <View style={t.riskHead}><View style={[t.riskDot,{backgroundColor:fg}]}/><Text style={t.riskTitle}>{r.label}</Text>{r.held&&<Text style={t.small}>{tr('автоподтверждение остановлено')}</Text>}</View>
   <Text style={t.riskLine}>{r.reasons.map(tServer).join(' · ')}</Text>
  </View>
  {!!card.unready&&<Text accessibilityLabel={card.unready} style={[t.riskLine,{color:C.warning}]}>{tr('{what}. Подтверждайте, если успеете подготовить.',{what:card.unready})}</Text>}
  {card.depositLabel?<><View style={t.actions}>{btn(card.depositLabel,'deposit',true)}</View><View style={[t.actions,{marginTop:8}]}>{btn(tr('Без депозита'),'accept',false)}{btn(card.rejectLabel,'reject',false)}</View></>
   :<View style={t.actions}>{btn(card.acceptLabel,'accept',true)}<Pressable accessibilityRole="button" accessibilityLabel={card.rejectLabel} disabled={busy} onPress={()=>onDecide('reject')} style={({pressed})=>[t.reject,(busy||pressed)&&t.dim]}><Text style={t.rejectText}>{card.rejectLabel}</Text></Pressable></View>}
 </View>;
}

export function PriceTipBody({card,busy,onDecide,compact=false}:{card:Approval;busy:boolean;onDecide:(action:Decision)=>void;compact?:boolean}){
 if(card.kind==='booking'&&card.risk)return <BookingTipBody card={card} busy={busy} onDecide={onDecide}/>;
 if(card.cleaningTip)return <CleaningTipBody card={card} busy={busy} onDecide={onDecide} compact={compact}/>;
 if(card.listing)return <ListingTipBody card={card} busy={busy} onDecide={onDecide} compact={compact}/>;
 if(card.forecast)return <ForecastTipBody card={card} busy={busy} onDecide={onDecide} compact={compact}/>;
 if(card.stay)return <StayTipBody card={card} busy={busy} onDecide={onDecide} compact={compact}/>;
 if(card.window)return <WindowTipBody card={card} busy={busy} onDecide={onDecide} compact={compact}/>;
 const p=card.price!,up=p.direction==='up';
 return <View>
  <View style={t.priceRow} accessible accessibilityLabel={tr('Сейчас {v}, предлагаю {v2}',{v:money(p.from),v2:money(p.to)})}>
   <Text style={t.from}>{money(p.from)}</Text><Text style={t.arrow}>→</Text><Text style={t.to}>{money(p.to)}</Text>
   <View style={[t.delta,up?t.deltaUp:t.deltaDown]}><Text style={[t.deltaText,{color:up?C.success:C.warning}]}>{(up?'▲ +':'▼ −')+p.percent}%</Text></View>
  </View>
  {compact?<Text numberOfLines={2} style={t.rows}>{p.reasons.slice(0,2).map(tServer).join(' · ')}</Text>:<>
   {p.rows.length>1&&<Text style={t.rows}>{p.rows.slice(1).map(([label,from,to])=>label+': '+money(from)+' → '+money(to)).join('   ')}</Text>}
   {p.reasons.length>0&&<View style={t.reasons}>{p.reasons.map(reason=><View key={reason} style={t.reason}><Text style={t.reasonText}>{tServer(reason)}</Text></View>)}</View>}
  </>}
  <View style={t.actions}>
   <Pressable accessibilityRole="button" accessibilityLabel={card.acceptLabel} disabled={busy} onPress={()=>onDecide('accept')} style={({pressed})=>[t.accept,(busy||pressed)&&t.dim]}><Text numberOfLines={1} style={t.acceptText}>{card.acceptLabel}</Text></Pressable>
   <Pressable accessibilityRole="button" accessibilityLabel={tr('Оставить цену')} disabled={busy} onPress={()=>onDecide('reject')} style={({pressed})=>[t.reject,(busy||pressed)&&t.dim]}><Text style={t.rejectText}>{tr('Оставить')}</Text></Pressable>
  </View>
  {!compact&&<Text style={t.note}>{tr('Без вашего согласия цена не изменится.')}</Text>}
 </View>;
}

// The cards the AI administrator asks about: a new booking request first, then the advice (price, free hours, time of
// stay, the week ahead, the listing, the price of a cleaning). `tipKind` tells them apart for the owner's sheet.
export const isRequestTip=(c:Approval)=>c.kind==='booking'&&!!c.risk&&!!c.canDecide;
export const isAdviceTip=(c:Approval)=>!!(c.kind==='price'&&c.price||c.kind==='window'&&c.window||c.kind==='stay'&&c.stay||c.kind==='forecast'&&c.forecast||c.kind==='listing'&&c.listing||c.kind==='cleaning-fee'&&c.cleaningTip)&&!!c.canDecide;

// inline: a block of the owner's sheet (concept «Один стандарт», 2026-11-26), not a card over the map. pick: which
// cards it shows. fallback: what stands in its place when there is nothing to ask (the «Сейчас» card goes on to the next).
export function PriceTip({cards,onChanged,onEdit,role='owner',inline=false,pick,fallback=null}:{cards:Approval[];onChanged?:()=>unknown;onEdit?:(id:string,step:string|null)=>void;role?:'owner'|'guest';inline?:boolean;pick?:(card:Approval)=>boolean;fallback?:React.ReactNode}){
 const [later,setLater]=useState<string[]>([]),[busy,setBusy]=useState(false),[result,setResult]=useState<{text:string;error:boolean}|null>(null);
 const [slide]=useState(()=>new Animated.Value(inline?1:0));
 const open=(c:Approval)=>!later.includes(c.id)&&(!pick||pick(c));
 const card=cards.find(c=>isRequestTip(c)&&open(c))||cards.find(c=>isAdviceTip(c)&&open(c));
 const visible=!!card||!!result;
 useEffect(()=>{if(inline)return;Animated.spring(slide,{toValue:visible?1:0,useNativeDriver:true,friction:8,tension:60}).start();},[visible,card?.id]);
 useEffect(()=>{if(!result)return;const timer=setTimeout(()=>setResult(null),result.error?8000:5000);return()=>clearTimeout(timer);},[result]);
 if(!visible)return <>{fallback}</>;
 const style=inline?null:{opacity:slide,transform:[{translateY:slide.interpolate({inputRange:[0,1],outputRange:[-40,0]})}]};
 const box=inline?t.inline:t.box;
 if(result||!card)return <Animated.View style={[box,t.resultBox,style]} accessibilityLiveRegion="polite"><View style={[t.icon,result?.error&&{backgroundColor:C.danger}]}><Text style={t.iconText}>{result?.error?'!':'✓'}</Text></View><Text style={t.resultText}>{result?.text}</Text></Animated.View>;
 async function decide(action:Decision){
  if(!card)return;setBusy(true);
  try{const v=await request('/api/approvals',{id:card.id,revision:card.revision,action},undefined,uid()+':'+card.kind+':'+action,role);if(v.edit&&onEdit){await onChanged?.();onEdit(v.edit.propertyId,v.edit.step);return;}setResult({text:v.message||tr('Готово.'),error:false});await onChanged?.();}
  catch(error){setResult({text:error instanceof Error?error.message:tr('Не получилось. Обновите экран.'),error:true});}
  finally{setBusy(false);}
 }
 return <Animated.View style={[box,style]} accessibilityLabel={card.risk?tr('Новая заявка на бронирование'):card.cleaningTip?tr('Совет ИИ-администратора по цене уборки'):card.listing?tr('Совет ИИ-администратора по объявлению'):card.forecast?tr('Прогноз загрузки на неделю от ИИ-администратора'):card.stay?tr('Предложение ИИ-администратора по времени проживания'):card.window?tr('Окно в календаре от ИИ-администратора'):tr('Совет ИИ-администратора по цене')}>
  <View style={t.head}>
   <AiMark size={24}/>
   <View style={t.titleBox}><Text style={t.small}>{tr('ИИ-администратор · {v}',{v:(card.risk?tr('новая заявка'):card.cleaningTip?tr('цена уборки'):card.listing?card.listing.title.toLocaleLowerCase('ru'):card.forecast?tr('прогноз на неделю'):card.stay?(card.stay.kind==='late'?tr('поздний выезд'):tr('ранний заезд')):card.window?tr('окно в календаре'):card.price?.direction==='up'?tr('спрос вырос'):tr('спрос снизился'))})}</Text><Text numberOfLines={1} style={t.title}>{card.subject}</Text></View>
   <Pressable accessibilityRole="button" accessibilityLabel={tr('Позже')} onPress={()=>setLater(v=>[...v,card.id])} style={t.close}><Text style={t.closeText}>×</Text></Pressable>
  </View>
  <PriceTipBody card={card} busy={busy} onDecide={decide} compact/>
 </Animated.View>;
}

const R=T.radius,H=T.control,F=T.font;
const t=StyleSheet.create({
 box:{position:'absolute',top:68,left:12,right:12,zIndex:100,paddingTop:12,paddingBottom:16,paddingHorizontal:16,borderRadius:R.xl,backgroundColor:C.surface,borderWidth:1,borderColor:C.line,shadowColor:C.ink,shadowOffset:{width:0,height:8},shadowOpacity:.18,shadowRadius:24,elevation:8},
 inline:{paddingTop:12,paddingBottom:16,paddingHorizontal:16,borderRadius:R.xl,backgroundColor:C.surface,borderWidth:1,borderColor:C.line},
 resultBox:{flexDirection:'row',alignItems:'center',gap:12},
 head:{flexDirection:'row',alignItems:'flex-start',gap:12},
 icon:{width:36,height:36,borderRadius:R.full,backgroundColor:C.ink,alignItems:'center',justifyContent:'center'},
 iconText:{color:C.onAccent,fontSize:F.subtitle[0],lineHeight:F.subtitle[1],fontWeight:'600'},
 titleBox:{flex:1,minWidth:0,gap:2},
 small:{fontSize:F.caption[0],lineHeight:F.caption[1],color:C.muted},
 title:{fontSize:F.body[0],lineHeight:F.body[1],fontWeight:'600',color:C.ink},
 close:{width:H.touch,height:H.touch,marginTop:-8,marginRight:-8,alignItems:'center',justifyContent:'center'},
 closeText:{fontSize:F.title[0],lineHeight:F.title[1],color:C.muted},
 priceRow:{flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:8,marginTop:8},
 from:{fontSize:F.body[0],lineHeight:F.body[1],color:C.muted,textDecorationLine:'line-through'},
 arrow:{fontSize:F.body[0],lineHeight:F.body[1],color:C.muted},
 to:{fontSize:F.heading[0],lineHeight:F.heading[1],fontWeight:'600',color:C.ink},
 delta:{paddingHorizontal:8,paddingVertical:2,borderRadius:R.full},deltaUp:{backgroundColor:C.successSoft},deltaDown:{backgroundColor:C.warningSoft},
 deltaText:{fontSize:F.label[0],lineHeight:F.label[1],fontWeight:'600'},
 deltaWindow:{backgroundColor:C.surfaceAlt},
 unit:{fontSize:F.label[0],lineHeight:F.label[1],fontWeight:'500',color:C.muted},
 when:{flexDirection:'row',alignItems:'center',gap:8,marginTop:8},
 whenIcon:{fontSize:F.body[0],lineHeight:F.body[1],color:C.ink},
 whenText:{flex:1,fontSize:F.label[0],lineHeight:F.label[1],color:C.inkSoft},
 hours:{paddingHorizontal:8,paddingVertical:2,borderRadius:R.full,backgroundColor:C.surfaceAlt},
 hoursText:{fontSize:F.label[0],lineHeight:F.label[1],fontWeight:'600',color:C.ink},
 rows:{marginTop:4,fontSize:F.label[0],lineHeight:F.label[1],color:C.inkSoft},
 reasons:{flexDirection:'row',flexWrap:'wrap',gap:8,marginTop:12},
 reason:{paddingHorizontal:12,paddingVertical:4,borderRadius:R.full,backgroundColor:C.surfaceAlt},
 reasonText:{fontSize:F.label[0],lineHeight:F.label[1],color:C.inkSoft},
 actions:{flexDirection:'row',gap:8,marginTop:12},
 accept:{flex:1,minHeight:H.field,borderRadius:R.full,backgroundColor:C.ink,alignItems:'center',justifyContent:'center',paddingHorizontal:16},
 acceptText:{fontSize:F.body[0],lineHeight:F.body[1],fontWeight:'600',color:C.onAccent},
 reject:{minHeight:H.field,borderRadius:R.full,borderWidth:1,borderColor:C.line,backgroundColor:C.surface,alignItems:'center',justifyContent:'center',paddingHorizontal:16},
 rejectText:{fontSize:F.body[0],lineHeight:F.body[1],fontWeight:'600',color:C.ink},
 note:{marginTop:8,fontSize:F.caption[0],lineHeight:F.caption[1],color:C.muted,textAlign:'center'},
 resultText:{flex:1,fontSize:F.body[0],lineHeight:F.body[1],color:C.ink},
 days:{flexDirection:'row',gap:4,marginTop:12},
 day:{flex:1,alignItems:'center',gap:2},
 bar:{width:'100%',maxWidth:32,height:56,borderRadius:R.sm,backgroundColor:C.surfaceAlt,overflow:'hidden',justifyContent:'flex-end'},
 fill:{width:'100%',borderRadius:R.sm,backgroundColor:C.lineStrong},fillBusy:{backgroundColor:C.ink},fillQuiet:{backgroundColor:C.lineStrong},
 dayLabel:{fontSize:F.caption[0],lineHeight:F.caption[1],fontWeight:'600',color:C.ink},
 dayLoad:{fontSize:F.caption[0],lineHeight:F.caption[1],color:C.muted},dayLoadBusy:{color:C.ink,fontWeight:'600'},
 summary:{marginTop:8,fontSize:F.label[0],lineHeight:F.label[1],fontWeight:'500',color:C.ink},
 compare:{flexDirection:'row',alignItems:'center',gap:8,marginTop:12},
 cmpMine:{flex:1,minWidth:0,gap:2,paddingVertical:8,paddingHorizontal:12,borderRadius:R.md,backgroundColor:C.surfaceAlt},
 cmpThem:{flex:1,minWidth:0,gap:2,paddingVertical:8,paddingHorizontal:12,borderRadius:R.md,backgroundColor:C.surface,borderWidth:1,borderColor:C.ink},
 cmpValue:{fontSize:F.title[0],lineHeight:F.title[1],fontWeight:'600',color:C.ink},
 cmpLabel:{fontSize:F.caption[0],lineHeight:F.caption[1],color:C.muted},
 cmpIcon:{width:32,height:32,borderRadius:R.full,borderWidth:1,borderColor:C.line,backgroundColor:C.surface,alignItems:'center',justifyContent:'center'},
 cmpIconText:{fontSize:F.label[0],lineHeight:F.label[1],color:C.ink},
 dim:{opacity:.6},
 risk:{marginTop:12,paddingVertical:8,paddingHorizontal:12,borderRadius:R.md,borderWidth:1},
 riskHead:{flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:8},
 riskDot:{width:8,height:8,borderRadius:R.full},
 riskTitle:{fontSize:F.body[0],lineHeight:F.body[1],fontWeight:'600',color:C.ink},
 riskLine:{marginTop:4,fontSize:F.label[0],lineHeight:F.label[1],color:C.inkSoft},
});
