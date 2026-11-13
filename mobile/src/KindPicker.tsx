import React from 'react';
import {Pressable,StyleSheet,Switch,Text,View} from 'react-native';
import {C,type} from './styles';
import {T} from './tokens';
import {defaultOwnStaff,propertyTypes} from '../../lib/listings';
const R=T.radius;
const ICONS:Record<string,string>={apartment:'🏢',studio:'🛋',room:'🚪',house:'🏠',guesthouse:'🌲',hostel:'🛏',hotel:'🏨',aparthotel:'🏬'};

// The kind of housing as compact chips with an icon, and one switch for the owner's own staff. Same rules as the site
// (components/kind-picker.tsx): a hotel, a hostel or an apart-hotel turns «Свой персонал» on, the owner can change it.
export function KindPicker({kind,ownStaff,onChange}:{kind:string;ownStaff:boolean;onChange:(v:{type?:string;ownStaff?:boolean})=>void}){
 return <View style={k.box}>
  <View style={k.grid} accessibilityRole="radiogroup" accessibilityLabel="Тип жилья">
   {Object.entries(propertyTypes).map(([id,label])=>{const on=kind===id;return <Pressable key={id} accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{checked:on}} onPress={()=>onChange({type:id,ownStaff:defaultOwnStaff(id)})} style={[k.kind,on&&k.kindOn]}>
    <View style={[k.ico,on&&k.icoOn]}><Text style={k.icoText}>{ICONS[id]}</Text></View><Text numberOfLines={1} style={[k.label,on&&k.labelOn]}>{label}</Text>
   </Pressable>;})}
  </View>
  <View style={k.staff}>
   <View style={k.ico}><Text style={k.icoText}>👥</Text></View>
   <View style={{flex:1}}><Text style={k.staffTitle}>Свой персонал</Text><Text style={k.hint}>{ownStaff?'Убирают ваши сотрудники, ИИ исполнителей не ищет':'Выключено: после выезда ИИ найдёт исполнителя'}</Text></View>
   <Switch accessibilityLabel="Свой персонал" value={ownStaff} onValueChange={v=>onChange({ownStaff:v})} trackColor={{true:C.success,false:C.lineStrong}} thumbColor="#FFFFFF"/>
  </View>
 </View>;
}

const k=StyleSheet.create({
 box:{gap:12},
 grid:{flexDirection:'row',flexWrap:'wrap',gap:8},
 kind:{flexDirection:'row',alignItems:'center',gap:8,minHeight:40,paddingLeft:8,paddingRight:12,borderRadius:R.full,borderWidth:1,borderColor:C.lineStrong,backgroundColor:C.surface},
 kindOn:{borderColor:C.accent,backgroundColor:C.accent},
 ico:{width:24,height:24,borderRadius:R.full,alignItems:'center',justifyContent:'center',backgroundColor:C.surfaceAlt},
 icoOn:{backgroundColor:'rgba(255,255,255,0.2)'},
 icoText:{fontSize:14,lineHeight:20},
 label:{...type.label,color:C.inkSoft,fontWeight:'600'},
 labelOn:{color:C.onAccent},
 staff:{flexDirection:'row',alignItems:'center',gap:12,minHeight:56,paddingVertical:8,paddingHorizontal:12,borderRadius:R.md,borderWidth:1,borderColor:C.line,backgroundColor:C.surface},
 staffTitle:{...type.label,color:C.ink,fontWeight:'700'},
 hint:{...type.caption,color:C.muted},
});
