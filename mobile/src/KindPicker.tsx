import {t} from '../../lib/i18n';
import React,{useState} from 'react';
import {Image,Pressable,StyleSheet,Switch,Text,View} from 'react-native';
import {C,type} from './styles';
import {KindIcon} from './KindIcon';
import {T} from './tokens';
import {defaultOwnStaff,propertyTypes} from '../../lib/listings';
const R=T.radius;

// The kind of place as a list of names: one line shows the chosen kind, a tap opens the list (word first, the icon only
// beside it), a choice closes it. Then one switch for the owner's own staff. Same rules as the site (components/kind-picker.tsx):
// a hotel, a hostel or an apart-hotel turns «Свой персонал» on, the owner can change it.
// `inline`: the list is already inside a line that names the kind (the check screen of a new place), so it shows at once.
export function KindPicker({kind,ownStaff,onChange,inline=false}:{inline?:boolean;kind:string;ownStaff:boolean;onChange:(v:{type?:string;ownStaff?:boolean})=>void}){
 const [opened,setOpen]=useState(false),open=inline||opened,name=propertyTypes[kind as keyof typeof propertyTypes];
 return <View style={k.box}>
  {!inline&&<Pressable accessibilityRole="button" accessibilityLabel={t('Тип объекта')+': '+(name||t('Выберите тип'))} accessibilityState={{expanded:open}} onPress={()=>setOpen(v=>!v)} style={({pressed})=>[k.select,open&&k.selectOpen,pressed&&{opacity:.7}]}>
   <KindIcon id={kind} size={22} color={C.accent}/><View style={{flex:1}}><Text style={k.caption}>{t('Тип объекта')}</Text><Text style={k.value}>{name||t('Выберите тип')}</Text></View><Text style={k.chevron}>{open?'⌃':'⌄'}</Text>
  </Pressable>}
  {open&&<View style={k.list} accessibilityRole="radiogroup" accessibilityLabel={t('Тип объекта')}>{Object.entries(propertyTypes).map(([id,label],i)=>{const on=kind===id;return <Pressable key={id} accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{checked:on}} onPress={()=>{onChange({type:id,ownStaff:defaultOwnStaff(id)});if(!inline)setOpen(false);}} style={({pressed})=>[k.option,i>0&&k.optionLine,on&&k.optionOn,pressed&&{opacity:.6}]}><KindIcon id={id} size={20} color={on?C.accent:C.muted}/><Text style={[k.optionText,on&&k.optionTextOn]}>{label}</Text>{on&&<Text style={k.check}>✓</Text>}</Pressable>;})}</View>}
  <View style={k.staff}><Image source={require('../assets/menu/users.png')} style={k.staffIco} accessibilityIgnoresInvertColors/><View style={k.staffText}><Text style={k.staffTitle}>{t('Свой персонал')}</Text><Text style={k.hint}>{ownStaff?t('ИИ не ищет исполнителей'):t('ИИ найдёт исполнителя')}</Text></View><Switch style={k.switch} accessibilityLabel={t('Свой персонал')} value={ownStaff} onValueChange={v=>onChange({ownStaff:v})} trackColor={{true:C.success,false:C.lineStrong}} thumbColor="#FFFFFF"/></View>
 </View>;
}

const k=StyleSheet.create({
 box:{gap:8},
 grid:{flexDirection:'row',flexWrap:'wrap',gap:4},
 select:{flexDirection:'row',alignItems:'center',gap:12,minHeight:56,paddingHorizontal:16,borderRadius:R.md,borderWidth:1,borderColor:C.line,backgroundColor:C.surface},
 selectOpen:{borderColor:C.accent},
 caption:{...type.caption,color:C.muted,fontWeight:'600'},value:{...type.body,color:C.ink,fontWeight:'700'},chevron:{...type.subtitle,color:C.muted},
 list:{borderRadius:R.md,borderWidth:1,borderColor:C.line,backgroundColor:C.surface,overflow:'hidden'},
 option:{flexDirection:'row',alignItems:'center',gap:12,minHeight:48,paddingHorizontal:16},optionLine:{borderTopWidth:1,borderTopColor:C.line},optionOn:{backgroundColor:C.accentSoft},
 optionText:{flex:1,...type.body,color:C.inkSoft},optionTextOn:{color:C.ink,fontWeight:'700'},check:{...type.body,color:C.accent,fontWeight:'700'},
 staffIco:{width:20,height:20,tintColor:C.inkSoft},
 name:{...type.caption,color:C.inkSoft,fontWeight:'600'},
 staff:{flexDirection:'row',alignItems:'center',gap:8,minHeight:44,paddingHorizontal:4},
 staffText:{flex:1,flexDirection:'row',flexWrap:'wrap',alignItems:'baseline',columnGap:8},
 staffTitle:{...type.label,color:C.ink,fontWeight:'700'},
 hint:{...type.caption,color:C.muted},
 switch:{transform:[{scale:0.8}]},
});
