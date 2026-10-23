import React,{useState} from 'react';
import {View,Text,TextInput,Pressable} from 'react-native';
import type {Approval} from '../../lib/approvals';
import {duration} from '../../lib/activity';
import {useActivityClock} from './ActivityTimer';
import {s} from './styles';
type Row=Record<string,any>;
export function ApprovalCard({card,busy,onDecide}:{card:Approval;busy:boolean;onDecide:(body:Row)=>void}){
 const [reason,setReason]=useState(''),[rejecting,setRejecting]=useState(false),[fee,setFee]=useState(String(card.cleaningFee||0)),t=useActivityClock(),expired=!!card.expiresAt&&t>=card.expiresAt;
 const decide=(action:string)=>onDecide({id:card.id,revision:card.revision,action,reason,cleaningFee:Number(fee)});
 const button=(title:string,fn:()=>void,disabled=false,secondary=false)=><Pressable accessibilityRole="button" disabled={busy||disabled} accessibilityState={{disabled:busy||disabled}} onPress={fn} style={[s.button,secondary&&s.secondary,(busy||disabled)&&s.disabled]}><Text style={[s.buttonText,secondary&&s.secondaryText]}>{title}</Text></Pressable>;
 return <View style={s.card}><Text style={s.badge}>{card.canDecide?'Нужно ваше решение':'Ожидает ответа'}</Text><Text accessibilityRole="header" style={s.cardTitle}>{card.title}</Text><Text style={s.text}>{card.subject}</Text><Text style={s.meta}>{card.from} → {card.to}{card.expiresAt?' · '+(expired?'Срок истёк':t?duration(card.expiresAt-t):'Уточняю время'):''}</Text>{card.facts.map(([label,value])=><View key={label} style={s.keyval}><Text style={s.key}>{label}</Text><Text style={s.value}>{value}</Text></View>)}{!!card.detail&&<Text style={s.meta}>{card.detail}</Text>}
 {card.canDecide&&!expired&&<>{card.kind==='booking'&&!rejecting&&<><Text style={s.fieldLabel}>Оплата уборки после выезда, ₸</Text><TextInput accessibilityLabel="Оплата уборки после выезда" style={s.field} keyboardType="numeric" value={fee} onChangeText={setFee} editable={!busy}/><Text style={s.meta}>Ноль — без автоматической публикации уборки. Это расход владельца.</Text></>}{rejecting&&<><Text style={s.fieldLabel}>Причина</Text><TextInput accessibilityLabel="Причина решения" value={reason} onChangeText={setReason} style={s.field} maxLength={1000} multiline editable={!busy}/>{button(card.rejectLabel,()=>decide('reject'),!reason.trim())}{button('Назад',()=>setRejecting(false),false,true)}</>}{!rejecting&&<>{button(card.acceptLabel,()=>decide('accept'),card.kind==='booking'&&(!Number.isInteger(Number(fee))||Number(fee)<0))}{button(card.rejectLabel,()=>card.requiresReason?setRejecting(true):decide('reject'),false,true)}</>}<Text style={s.meta}>Решение проверяется сервером. Банковская операция не выполняется.</Text></>}
 </View>;
}
export function ApprovalInbox({cards,busy,onDecide}:{cards:Approval[];busy:boolean;onDecide:(body:Row)=>void}){
 return <View><Text accessibilityRole="header" style={s.cardTitle}>Согласования · {cards.filter(c=>c.canDecide).length} ждут решения</Text>{!cards.length&&<Text style={s.meta}>Нет запросов, требующих решения.</Text>}{cards.map(card=><ApprovalCard key={card.id+card.revision} card={card} busy={busy} onDecide={onDecide}/>)}</View>;
}
