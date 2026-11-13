import React,{useState} from 'react';
import {View,Text,TextInput,Pressable,StyleSheet} from 'react-native';
import type {Approval} from '../../lib/approvals';
import {duration} from '../../lib/activity';
import {useActivityClock} from './ActivityTimer';
import {s,C} from './styles';
import {T} from './tokens';
import {PriceTipBody} from './PriceTip';
type Row=Record<string,any>;
export function ApprovalCard({card,busy,onDecide}:{card:Approval;busy:boolean;onDecide:(body:Row)=>void}){
 const [reason,setReason]=useState(''),[rejecting,setRejecting]=useState(false),[fee,setFee]=useState(String(card.cleaningFee||0)),t=useActivityClock(),expired=!!card.expiresAt&&t>=card.expiresAt;
 const decide=(action:string)=>onDecide({id:card.id,revision:card.revision,action,reason,cleaningFee:Number(fee)});
 const button=(title:string,fn:()=>void,disabled=false,secondary=false)=><Pressable accessibilityRole="button" disabled={busy||disabled} accessibilityState={{disabled:busy||disabled}} onPress={fn} style={[s.button,secondary&&s.secondary,(busy||disabled)&&s.disabled]}><Text style={[s.buttonText,secondary&&s.secondaryText]}>{title}</Text></Pressable>;
 return <View style={s.card}><Text style={s.badge}>{card.canDecide?'Нужно ваше решение':'Ожидает ответа'}</Text><Text accessibilityRole="header" style={s.cardTitle}>{card.title}</Text><Text style={s.text}>{card.subject}</Text><Text style={s.meta}>{card.from} → {card.to}{card.expiresAt?' · '+(expired?'Срок истёк':t?duration(card.expiresAt-t):'Уточняю время'):''}</Text>{!!card.risk&&<BookingRiskBox risk={card.risk}/>}{((card.price||card.window||card.stay||card.forecast||card.listing||card.cleaningTip)&&card.canDecide&&!expired?[]:card.facts).map(([label,value])=><View key={label} style={s.keyval}><Text style={s.key}>{label}</Text><Text style={s.value}>{value}</Text></View>)}{!!card.detail&&!((card.price||card.window||card.stay||card.forecast||card.listing||card.cleaningTip)&&card.canDecide&&!expired)&&<Text style={s.meta}>{card.detail}</Text>}
 {(card.price||card.window||card.stay||card.forecast||card.listing||card.cleaningTip)&&card.canDecide&&!expired?<PriceTipBody card={card} busy={busy} onDecide={action=>onDecide({id:card.id,revision:card.revision,action})}/>:card.canDecide&&!expired&&<>{card.kind==='booking'&&!rejecting&&<><Text style={s.fieldLabel}>Оплата уборки после выезда, ₸</Text><TextInput accessibilityLabel="Оплата уборки после выезда" style={s.field} keyboardType="numeric" value={fee} onChangeText={setFee} editable={!busy}/><Text style={s.meta}>Ноль — без автоматической публикации уборки. Это расход владельца.</Text></>}{rejecting&&<><Text style={s.fieldLabel}>Причина</Text><TextInput accessibilityLabel="Причина решения" value={reason} onChangeText={setReason} style={s.field} maxLength={1000} multiline editable={!busy}/>{button(card.rejectLabel,()=>decide('reject'),!reason.trim())}{button('Назад',()=>setRejecting(false),false,true)}</>}{!rejecting&&<>{!!card.depositLabel&&button(card.depositLabel,()=>decide('deposit'),!Number.isInteger(Number(fee))||Number(fee)<0)}{button(card.depositLabel?'Без депозита':card.acceptLabel,()=>decide('accept'),card.kind==='booking'&&(!Number.isInteger(Number(fee))||Number(fee)<0),!!card.depositLabel)}{button(card.rejectLabel,()=>card.requiresReason?setRejecting(true):decide('reject'),false,true)}</>}<Text style={s.meta}>Решение проверяется сервером. Банковская операция не выполняется.</Text></>}
 </View>;
}
const F=T.font,R=T.radius;
const tone={low:[C.successSoft,C.success],medium:[C.warningSoft,C.warning],high:[C.dangerSoft,C.danger]} as const;
export function BookingRiskBox({risk}:{risk:NonNullable<Approval['risk']>}){
 const [bg,fg]=tone[risk.level];
 return <View accessibilityLabel={risk.label} style={[k.box,{backgroundColor:bg,borderColor:risk.level==='medium'?C.warningLine:bg}]}>
  <View style={k.head}><View style={[k.dot,{backgroundColor:fg}]}/><Text style={k.title}>{risk.label}</Text>{risk.held&&<Text style={k.held}>автоподтверждение остановлено</Text>}</View>
  <View style={k.reasons}>{risk.reasons.map(r=><Text key={r} style={k.reason}>{r}</Text>)}</View>
  <Text style={k.advice}>{risk.advice}</Text>
 </View>;
}
const k=StyleSheet.create({
 box:{marginTop:12,marginBottom:8,padding:12,borderRadius:R.md,borderWidth:1},
 head:{flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:8},
 dot:{width:8,height:8,borderRadius:R.full},
 title:{fontSize:F.body[0],lineHeight:F.body[1],fontWeight:'700',color:C.ink},
 held:{fontSize:F.caption[0],lineHeight:F.caption[1],color:C.muted},
 reasons:{flexDirection:'row',flexWrap:'wrap',gap:8,marginTop:8},
 reason:{paddingVertical:2,paddingHorizontal:8,borderRadius:R.full,backgroundColor:C.surface,overflow:'hidden',fontSize:F.label[0],lineHeight:F.label[1],color:C.inkSoft},
 advice:{marginTop:8,fontSize:F.label[0],lineHeight:F.label[1],color:C.ink}
});
export function ApprovalInbox({cards,busy,onDecide}:{cards:Approval[];busy:boolean;onDecide:(body:Row)=>void}){
 return <View><Text accessibilityRole="header" style={s.cardTitle}>Согласования · {cards.filter(c=>c.canDecide).length} ждут решения</Text>{!cards.length&&<Text style={s.meta}>Нет запросов, требующих решения.</Text>}{cards.map(card=><ApprovalCard key={card.id+card.revision} card={card} busy={busy} onDecide={onDecide}/>)}</View>;
}
