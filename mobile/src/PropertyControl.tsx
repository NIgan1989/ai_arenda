// «Правила» of one object: its state in one tap, prices in six tiles and what the AI administrator may decide.
// Each group is a single line until the owner opens it; one «Сохранить» appears only after a change.
// Check-in times and house rules live in the step editor («Изменить»), so they are not repeated here.
import React,{useState} from 'react';
import {View,Text,TextInput,Pressable,Switch,StyleSheet} from 'react-native';
import {C,type} from './styles';
import {T} from './tokens';
import {money,type Row} from './model';
import {Stepper} from './SheetParts';
const R=T.radius,H=T.control;
const clock=(v:number)=>String(Math.floor(v/60)).padStart(2,'0')+':'+String(v%60).padStart(2,'0');
export const readinessLabels:Row={ready:'Готово к заселению',inspection:'Ожидает проверки',occupied:'Гость проживает',awaiting_cleaning:'Ожидает уборки',cleaning:'Идёт уборка',maintenance:'На ремонте',blocked:'Заезды закрыты'};
const CLOSE:[string,string,string][]=[['maintenance','На ремонте','Владелец закрыл жильё на ремонт.'],['blocked','Закрыть заезды','Владелец временно закрыл заезды.']];
type Values={dailyPrice:number;hourlyPrice:number;minHours:number;nightlyPrice:number;deposit:number;cleaningFee:number;maxDiscountPercent:number;minimumRate:number;maxExtensionHours:number;autoConfirm:boolean;autoExtension:boolean};
export function controlValues(property:Row):Values{const p=property.policy||{};return {dailyPrice:Number(property.price)||0,hourlyPrice:p.hourly_price||0,minHours:p.min_hours||2,nightlyPrice:p.nightly_price||0,deposit:p.deposit||0,cleaningFee:p.cleaning_fee||0,maxDiscountPercent:p.max_discount_percent||0,minimumRate:p.minimum_rate||0,maxExtensionHours:p.max_extension_hours||0,autoConfirm:!!p.auto_confirm,autoExtension:!!p.auto_extension};}
// What goes to the server: the visible values plus everything this screen does not show, unchanged.
export function controlRequest(property:Row,v:Values):Row{const p=property.policy||{};
 return {dailyPrice:v.dailyPrice,hourlyPrice:v.hourlyPrice,minHours:v.minHours,nightlyPrice:v.nightlyPrice,deposit:v.deposit,cleaningFee:v.cleaningFee,cleaningBudget:Math.max(p.cleaning_budget||0,v.cleaningFee),
  checkinTime:clock(p.checkin_minutes??840),checkoutTime:clock(p.checkout_minutes??720),houseRules:p.house_rules||property.description||'Правила уточняются.',
  maxDiscountPercent:v.maxDiscountPercent,minimumRate:v.minimumRate,autoConfirm:v.autoConfirm,autoExtension:v.autoExtension,maxExtensionHours:v.autoExtension?Math.max(1,v.maxExtensionHours):v.maxExtensionHours,expectedVersion:p.version||0};}
export const pricesLine=(v:Values)=>[money(v.dailyPrice)+' / сутки',v.hourlyPrice>0&&money(v.hourlyPrice)+' / час',v.nightlyPrice>0&&money(v.nightlyPrice)+' / ночь',v.deposit>0&&'депозит '+money(v.deposit)].filter(Boolean).join(' · ');
export const aiLine=(v:Values)=>[v.autoConfirm?'подтверждает брони':'брони подтверждаете вы',v.autoExtension&&'продлевает до '+Math.max(1,v.maxExtensionHours)+' ч',v.maxDiscountPercent>0&&'скидка до '+v.maxDiscountPercent+'%'].filter(Boolean).join(' · ');

export function PropertyControl({property,busy,onSave,onReadiness}:{property:Row;busy:boolean;onSave:(data:Row)=>void;onReadiness:(data:Row)=>void}){
 const op=property.operation||{},start=controlValues(property),staff=!!Number(property.own_staff);
 const [v,setV]=useState<Values>(start),[open,setOpen]=useState<'prices'|'ai'|null>(null);
 const set=(x:Partial<Values>)=>setV(o=>({...o,...x})),dirty=JSON.stringify(v)!==JSON.stringify(start);
 const living=op.readiness==='occupied'||!!op.active_booking_id,cleaning=op.readiness==='cleaning',ready=op.readiness==='ready';
 const num=(label:string,key:keyof Values,max=10000000,hint='')=><View style={c.tile} key={key}><Text style={c.label}>{label}</Text><TextInput accessibilityLabel={label} style={c.value} keyboardType="number-pad" editable={!busy} value={v[key]?String(v[key]):''} placeholder="0" placeholderTextColor={C.muted} onChangeText={t=>set({[key]:Math.min(max,Number(t.replace(/[^\d]/g,''))||0)} as Partial<Values>)}/>{!!hint&&<Text style={c.hint}>{hint}</Text>}</View>;
 const head=(key:'prices'|'ai',icon:string,title:string,line:string)=><Pressable accessibilityRole="button" accessibilityState={{expanded:open===key}} accessibilityLabel={title+'. '+line} onPress={()=>setOpen(o=>o===key?null:key)} style={({pressed})=>[c.head,pressed&&c.pressed]}>
  <View style={c.icoBox}><Text style={c.ico}>{icon}</Text></View>
  <View style={c.grow}><Text style={c.title}>{title}</Text><Text numberOfLines={open===key?3:1} style={c.line}>{line}</Text></View>
  <Text style={[c.chevron,open===key&&c.chevronOpen]}>›</Text>
 </Pressable>;
 return <View style={c.sheet}>
  <View style={c.top}><View style={c.grow}><Text accessibilityRole="header" numberOfLines={1} style={c.name}>{property.title}</Text><Text style={[c.state,ready&&c.stateOn]}>{readinessLabels[op.readiness]||'Ожидает проверки'}</Text></View></View>
  {living?<Text style={c.hint}>Пока гость проживает, состояние меняется само после выезда.</Text>
   :cleaning?<Text style={c.hint}>Идёт уборка. После приёмки жильё станет готовым само.</Text>
   :<View style={c.actions}>
    {!ready&&<Pressable accessibilityRole="button" disabled={busy} onPress={()=>onReadiness({readiness:'ready',inspected:true,expectedVersion:op.version})} style={[c.go,busy&&c.off]}><Text style={c.goText}>✓  Жильё готово</Text></Pressable>}
    {CLOSE.filter(([code])=>code!==op.readiness).map(([code,title,note])=><Pressable key={code} accessibilityRole="button" disabled={busy} onPress={()=>onReadiness({readiness:code,note,expectedVersion:op.version})} style={[c.side,busy&&c.dim]}><Text style={c.sideText}>{title}</Text></Pressable>)}
   </View>}
  {head('prices','₸','Цены и депозит',pricesLine(v))}
  {open==='prices'&&<>
   <View style={c.row}>{num('Сутки, ₸','dailyPrice')}{num('Час, ₸','hourlyPrice',10000000,'0, если не сдаёте по часам')}</View>
   <View style={c.row}>{num('Ночь, ₸','nightlyPrice',10000000,'0, если нет ночного тарифа')}{num('Депозит, ₸','deposit')}</View>
   <View style={c.row}>{v.hourlyPrice>0&&<View style={c.grow}><Stepper label="Минимум часов" text={String(v.minHours)} value={v.minHours} min={1} max={24} onChange={n=>set({minHours:n})}/></View>}{!staff&&num('Уборка, ₸','cleaningFee',1000000,'Столько получит исполнитель')}</View>
   <Text style={c.hint}>Новые цены действуют для новых заявок.</Text>
  </>}
  {head('ai','✦','Что ИИ решает сам',aiLine(v))}
  {open==='ai'&&<>
   <View style={c.switchRow}><View style={c.grow}><Text style={c.title}>Подтверждать брони</Text><Text style={c.line}>{staff?'ИИ подтверждает заявки гостей без вас':'ИИ подтверждает заявки и заказывает уборку'}</Text></View><Switch accessibilityLabel="Подтверждать брони" value={v.autoConfirm} disabled={busy} onValueChange={x=>set({autoConfirm:x})} trackColor={{true:C.success,false:C.lineStrong}} thumbColor={C.surface}/></View>
   <View style={c.switchRow}><View style={c.grow}><Text style={c.title}>Продлевать проживание</Text><Text style={c.line}>По просьбе гостя, если жильё свободно</Text></View><Switch accessibilityLabel="Продлевать проживание" value={v.autoExtension} disabled={busy} onValueChange={x=>set({autoExtension:x,maxExtensionHours:x?Math.max(1,v.maxExtensionHours||3):v.maxExtensionHours})} trackColor={{true:C.success,false:C.lineStrong}} thumbColor={C.surface}/></View>
   {v.autoExtension&&<View><Stepper label="Продлевать не больше чем на, часов" text={String(Math.max(1,v.maxExtensionHours))} value={Math.max(1,v.maxExtensionHours)} min={1} max={168} onChange={n=>set({maxExtensionHours:n})}/></View>}
   <View style={c.row}>{num('Скидка не больше, %','maxDiscountPercent',50)}{num('Цена не ниже, ₸','minimumRate',10000000,'За сутки, час или ночь')}</View>
   <Text style={c.hint}>Всё, что выходит за эти пределы, ИИ спросит у вас.</Text>
  </>}
  {dirty&&<Pressable accessibilityRole="button" disabled={busy} onPress={()=>onSave(controlRequest(property,v))} style={[c.primary,busy&&c.off]}><Text style={c.primaryText}>{busy?'Сохраняю…':'✓  Сохранить'}</Text></Pressable>}
 </View>;
}
const c=StyleSheet.create({
 sheet:{backgroundColor:C.surface,borderRadius:R.xl,padding:16,gap:12,borderWidth:1,borderColor:C.line},
 top:{flexDirection:'row',alignItems:'center',gap:12},grow:{flex:1,minWidth:0},
 name:{color:C.ink,...type.subtitle,fontWeight:'700'},state:{color:C.warning,...type.caption,fontWeight:'600'},stateOn:{color:C.success},
 actions:{flexDirection:'row',flexWrap:'wrap',gap:8},
 go:{minHeight:H.compact,borderRadius:R.full,backgroundColor:C.accent,justifyContent:'center',paddingHorizontal:16},goText:{color:C.onAccent,...type.label,fontWeight:'700'},
 side:{minHeight:H.compact,borderRadius:R.full,borderWidth:1,borderColor:C.lineStrong,justifyContent:'center',paddingHorizontal:16},sideText:{color:C.inkSoft,...type.label},
 head:{flexDirection:'row',alignItems:'center',gap:12,minHeight:56,paddingHorizontal:12,paddingVertical:8,borderRadius:R.md,borderWidth:1,borderColor:C.line},pressed:{backgroundColor:C.surfaceAlt},
 icoBox:{width:32,height:32,borderRadius:R.full,backgroundColor:C.accentSoft,alignItems:'center',justifyContent:'center'},ico:{color:C.accent,...type.label},
 title:{color:C.ink,...type.label,fontWeight:'600'},line:{color:C.muted,...type.caption},
 chevron:{color:C.muted,...type.subtitle},chevronOpen:{transform:[{rotate:'90deg'}]},
 row:{flexDirection:'row',gap:8},
 tile:{flex:1,minHeight:76,padding:12,borderRadius:R.md,borderWidth:1,borderColor:C.line,backgroundColor:C.surface,gap:4},
 label:{color:C.muted,...type.caption,fontWeight:'600'},value:{color:C.ink,...type.subtitle,fontWeight:'700',padding:0},hint:{color:C.muted,...type.caption},
 switchRow:{flexDirection:'row',alignItems:'center',gap:12,minHeight:56,paddingHorizontal:12,paddingVertical:8,borderRadius:R.md,borderWidth:1,borderColor:C.line},
 primary:{minHeight:H.primary,borderRadius:R.full,backgroundColor:C.aiFrom,alignItems:'center',justifyContent:'center',paddingHorizontal:24,marginTop:4},primaryText:{color:C.onAccent,...type.label,fontWeight:'700'},
 off:{backgroundColor:C.lineStrong},dim:{opacity:.5},
});
