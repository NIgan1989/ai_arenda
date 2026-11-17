import React from 'react';
import {Image,Pressable,StyleSheet,Switch,Text,View} from 'react-native';
import {C,type} from './styles';
import {KindIcon} from './KindIcon';
import {T} from './tokens';
import {defaultOwnStaff,propertyTypes} from '../../lib/listings';
const R=T.radius;

// The kind of housing as one row of icon buttons, the chosen kind named below, and one switch for the owner's own staff. Same rules as the site
// (components/kind-picker.tsx): a hotel, a hostel or an apart-hotel turns «Свой персонал» on, the owner can change it.
export function KindPicker({kind,ownStaff,onChange}:{kind:string;ownStaff:boolean;onChange:(v:{type?:string;ownStaff?:boolean})=>void}){
 return <View style={k.box}>
  <View style={k.grid} accessibilityRole="radiogroup" accessibilityLabel="Тип объекта">
   {Object.entries(propertyTypes).map(([id,label])=>{const on=kind===id;return <Pressable key={id} accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{checked:on}} onPress={()=>onChange({type:id,ownStaff:defaultOwnStaff(id)})} style={[k.kind,on&&k.kindOn]}><KindIcon id={id} size={22} color={on?C.onAccent:C.inkSoft}/></Pressable>;})}
  </View>
  <Text style={k.name}>{propertyTypes[kind as keyof typeof propertyTypes]||'Выберите тип'}</Text>
  <View style={k.staff}>
   <Image source={require('../assets/menu/users.png')} style={k.staffIco} accessibilityIgnoresInvertColors/>
   <View style={k.staffText}><Text style={k.staffTitle}>Свой персонал</Text><Text style={k.hint}>{ownStaff?'ИИ не ищет исполнителей':'ИИ найдёт исполнителя'}</Text></View>
   <Switch style={k.switch} accessibilityLabel="Свой персонал" value={ownStaff} onValueChange={v=>onChange({ownStaff:v})} trackColor={{true:C.success,false:C.lineStrong}} thumbColor="#FFFFFF"/>
  </View>
 </View>;
}

const k=StyleSheet.create({
 box:{gap:8},
 grid:{flexDirection:'row',flexWrap:'wrap',gap:4},
 kind:{flexGrow:1,flexBasis:'18%',alignItems:'center',justifyContent:'center',height:44,borderRadius:R.md,borderWidth:1,borderColor:C.line,backgroundColor:C.surface},
 kindOn:{borderColor:C.accent,backgroundColor:C.accent},
 staffIco:{width:20,height:20,tintColor:C.inkSoft},
 name:{...type.caption,color:C.inkSoft,fontWeight:'600'},
 staff:{flexDirection:'row',alignItems:'center',gap:8,minHeight:44,paddingHorizontal:4},
 staffText:{flex:1,flexDirection:'row',flexWrap:'wrap',alignItems:'baseline',columnGap:8},
 staffTitle:{...type.label,color:C.ink,fontWeight:'700'},
 hint:{...type.caption,color:C.muted},
 switch:{transform:[{scale:0.8}]},
});
