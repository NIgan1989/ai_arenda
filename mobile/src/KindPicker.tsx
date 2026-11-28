import {t} from '../../lib/i18n';
import React,{useState} from 'react';
import {Image,Pressable,StyleSheet,Text,View} from 'react-native';
import {C,type} from './styles';
import {KindIcon} from './KindIcon';
import {T} from './tokens';
import {menuIcons} from './AccountRows';
import {EditSwitch} from './EditSheet';
import {defaultOwnStaff,kindCategory,propertyTypes,roomKinds} from '../../lib/listings';
const R=T.radius;

// The kind of place as a list of names: one line shows the chosen kind, a tap opens the list, a choice closes it.
// The list is grouped under small grey headings; each row is a black line icon and the name, the chosen one has only
// a black ✓. Then one switch for the owner's own staff. Same rules as the site (components/kind-picker.tsx):
// a hotel, a hostel or an apart-hotel turns «Свой персонал» on, the owner can change it.
// `inline`: the list is already inside a line or a sheet that names the kind, so it shows at once.
// `staff={false}`: the switch is shown elsewhere (the editor's own row), so it is left out here.
export function KindPicker({kind,ownStaff,onChange,inline=false,staff=true}:{inline?:boolean;kind:string;ownStaff:boolean;onChange:(v:{type?:string;ownStaff?:boolean})=>void;staff?:boolean}){
 const [opened,setOpen]=useState(false),open=inline||opened,name=propertyTypes[kind as keyof typeof propertyTypes];
 // The groups of the list (board «Тип», 2026-11-26): homes, places sold by the room, places taken for a few hours.
 const ids=Object.keys(propertyTypes),groups:[string,string[]][]=[
  [t('Жильё'),ids.filter(id=>kindCategory(id)==='stay'&&!roomKinds.includes(id))],
  [t('Гостиница и база'),ids.filter(id=>roomKinds.includes(id))],
  [t('Баня и зал'),ids.filter(id=>kindCategory(id)==='bath'||kindCategory(id)==='banquet')],
  // «Досуг», «Спорт», «Авто» (2026-11-28): places taken for a few hours, with their own people.
  [t('Досуг'),ids.filter(id=>kindCategory(id)==='leisure')],
  [t('Спорт'),ids.filter(id=>kindCategory(id)==='sport')],
  [t('Авто'),ids.filter(id=>kindCategory(id)==='auto')],
 ];
 return <View style={k.box}>
  {!inline&&<Pressable accessibilityRole="button" accessibilityLabel={t('Тип объекта')+': '+(name||t('Выберите тип'))} accessibilityState={{expanded:open}} onPress={()=>setOpen(v=>!v)} style={({pressed})=>[k.select,open&&k.selectOpen,pressed&&k.pressed]}>
   <KindIcon id={kind} size={24} color={C.ink}/><View style={k.selectText}><Text style={k.caption}>{t('Тип объекта')}</Text><Text numberOfLines={1} style={k.value}>{name||t('Выберите тип')}</Text></View><Image source={menuIcons.chevron} style={[k.chevron,open&&k.chevronOpen]} accessibilityElementsHidden importantForAccessibility="no"/>
  </Pressable>}
  {open&&<View accessibilityRole="radiogroup" accessibilityLabel={t('Тип объекта')}>{groups.map(([title,list],g)=>list.length?<View key={title}>
   <Text accessibilityRole="header" style={[k.heading,g>0&&k.headingGap]}>{title}</Text>
   {list.map((id,i)=>{const on=kind===id,label=propertyTypes[id];return <Pressable key={id} accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{checked:on}} onPress={()=>{onChange({type:id,ownStaff:defaultOwnStaff(id)});if(!inline)setOpen(false);}} style={({pressed})=>[k.option,i>0&&k.optionLine,pressed&&k.pressed]}>
    <KindIcon id={id} size={24} color={C.ink}/><Text style={k.optionText}>{label}</Text>{on&&<Image source={menuIcons.check} style={k.check} accessibilityElementsHidden importantForAccessibility="no"/>}
   </Pressable>;})}
  </View>:null)}</View>}
  {staff&&<EditSwitch icon="users" title={t('Свой персонал')} line={ownStaff?t('Уборки делают ваши люди'):t('Исполнителя подберёт сервис')} value={ownStaff} onChange={v=>onChange({ownStaff:v})} last/>}
 </View>;
}

const k=StyleSheet.create({
 box:{gap:8},
 select:{flexDirection:'row',alignItems:'center',gap:12,minHeight:56,paddingHorizontal:16,borderRadius:R.md,borderWidth:1,borderColor:C.line,backgroundColor:C.surface},
 selectOpen:{borderColor:C.ink},selectText:{flex:1,minWidth:0},
 caption:{...type.caption,color:C.muted},value:{...type.body,color:C.ink,fontWeight:'600'},
 chevron:{width:20,height:20,tintColor:C.muted},chevronOpen:{transform:[{rotate:'90deg'}]},
 heading:{...type.label,color:C.muted,fontWeight:'600',marginBottom:4},headingGap:{marginTop:16},
 option:{flexDirection:'row',alignItems:'center',gap:12,minHeight:48,paddingVertical:8},optionLine:{borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:C.lineStrong},
 optionText:{flex:1,...type.body,color:C.ink},check:{width:20,height:20,tintColor:C.ink},
 pressed:{opacity:.6},
});
