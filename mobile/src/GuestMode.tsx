import React,{useState} from 'react';
import {Pressable,Text,TextInput,View} from 'react-native';
import {C} from './styles';
import {Action,h} from './SheetParts';
import type {Row} from './model';

// Who answers guests for one flat: nobody (no quick requests), the owner, or the AI on autopilot.
// The same three choices as the site's request panel (components/matching-inbox.tsx).
const modes:[string,string][]=[['off','Выкл'],['manual','Я сам'],['auto','ИИ']];
export function GuestMode({flat,busy,onChange}:{flat:Row;busy:boolean;onChange:(body:Row)=>void}){
 const [asking,setAsking]=useState(false),[fee,setFee]=useState(''),current=flat.mode||(flat.enabled?'manual':'off');
 const choose=(mode:string)=>{if(mode===current){setAsking(false);return;}if(mode==='auto'&&!Number(flat.own_staff)&&!(Number(flat.cleaning_fee)>=100)){setAsking(true);return;}setAsking(false);onChange({propertyId:flat.id,mode});};
 const amount=Number(fee);
 return <View style={{gap:8,paddingVertical:4}}>
  <View style={h.listRow}>
   <Text numberOfLines={2} style={[h.eventTitle,h.grow]}>{flat.title}</Text>
   <View accessibilityRole="radiogroup" accessibilityLabel={'Кто отвечает гостям: '+flat.title} style={{flexDirection:'row',gap:4}}>
    {modes.map(([mode,title])=>{const on=current===mode;return <Pressable key={mode} accessibilityRole="radio" accessibilityState={{checked:on,disabled:busy}} disabled={busy} onPress={()=>choose(mode)} style={[h.chip,{paddingHorizontal:12},on&&h.chipOn,busy&&h.dim]}><Text style={[h.chipText,on&&h.chipTextOn]}>{title}</Text></Pressable>;})}
   </View>
  </View>
  {asking&&<View style={{gap:8}}>
   <Text style={h.note}>По этой цене ИИ будет заказывать уборку после каждого выезда.</Text>
   <TextInput accessibilityLabel="Стоимость уборки, ₸" placeholder="Стоимость уборки, ₸" placeholderTextColor={C.muted} keyboardType="number-pad" value={fee} onChangeText={v=>setFee(v.replace(/\D/g,''))} style={h.input} editable={!busy} maxLength={7} autoFocus/>
   <Action title="Включить автопилот" disabled={busy||!(amount>=100)} onPress={()=>{setAsking(false);onChange({propertyId:flat.id,mode:'auto',cleaningFee:amount});}}/>
  </View>}
 </View>;
}
