import React from 'react';
import {Pressable,StyleSheet,Text,View} from 'react-native';
import {C,type} from './styles';
import {T} from './tokens';
import {defaultOwnStaff,propertyTypes} from '../../lib/listings';
const R=T.radius;
const ICONS:Record<string,string>={apartment:'🏢',studio:'🛋',room:'🚪',house:'🏠',guesthouse:'🌲',hostel:'🛏',hotel:'🏨',aparthotel:'🏬'};

// The kind of housing as icon tiles, four in a row, and who cleans between guests. Same rules as the site
// (components/kind-picker.tsx): a hotel, a hostel or an apart-hotel turns «Свой персонал» on, the owner can change it.
export function KindPicker({kind,ownStaff,onChange}:{kind:string;ownStaff:boolean;onChange:(v:{type?:string;ownStaff?:boolean})=>void}){
 const staff=(on:boolean,title:string,hint:string)=><Pressable accessibilityRole="radio" accessibilityState={{checked:ownStaff===on}} onPress={()=>onChange({ownStaff:on})} style={[k.staff,ownStaff===on&&k.staffOn]}><Text style={k.staffTitle}>{title}</Text><Text style={k.hint}>{hint}</Text></Pressable>;
 return <View style={k.box}>
  <View style={k.grid} accessibilityRole="radiogroup" accessibilityLabel="Тип жилья">
   {Object.entries(propertyTypes).map(([id,label])=>{const on=kind===id;return <Pressable key={id} accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{checked:on}} onPress={()=>onChange({type:id,ownStaff:defaultOwnStaff(id)})} style={[k.kind,on&&k.kindOn]}>
    <View style={[k.ico,on&&k.icoOn]}><Text style={k.icoText}>{ICONS[id]}</Text></View><Text numberOfLines={2} style={[k.label,on&&k.labelOn]}>{label}</Text>
   </Pressable>;})}
  </View>
  <Text style={k.h}>КТО УБИРАЕТ ПОСЛЕ ГОСТЕЙ</Text>
  <View style={k.row} accessibilityRole="radiogroup">
   {staff(false,'✦ Исполнители сервиса','ИИ находит исполнителя после каждого выезда')}
   {staff(true,'Свой персонал','Убирают ваши сотрудники, ИИ исполнителей не ищет')}
  </View>
 </View>;
}

const k=StyleSheet.create({
 box:{gap:12},
 grid:{flexDirection:'row',flexWrap:'wrap',gap:8},
 kind:{width:'23%',flexGrow:1,minHeight:76,alignItems:'center',justifyContent:'center',gap:4,paddingVertical:8,paddingHorizontal:4,borderRadius:R.md,borderWidth:1,borderColor:C.line,backgroundColor:C.surface},
 kindOn:{borderColor:C.accent,backgroundColor:C.accentSoft},
 ico:{width:36,height:36,borderRadius:R.full,alignItems:'center',justifyContent:'center',backgroundColor:C.surfaceAlt},
 icoOn:{backgroundColor:C.accent},
 icoText:{fontSize:18,lineHeight:24},
 label:{...type.caption,color:C.inkSoft,fontWeight:'600',textAlign:'center'},
 labelOn:{color:C.ink},
 h:{...type.caption,color:C.muted,fontWeight:'700',letterSpacing:.6,marginTop:4},
 row:{flexDirection:'row',gap:8},
 staff:{flex:1,minHeight:44,padding:12,borderRadius:R.lg,borderWidth:2,borderColor:C.line,backgroundColor:C.surface,gap:4},
 staffOn:{borderColor:C.aiFrom,backgroundColor:C.accentSoft},
 staffTitle:{...type.body,color:C.ink,fontWeight:'700'},
 hint:{...type.caption,color:C.muted},
});
