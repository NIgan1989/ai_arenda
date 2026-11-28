import {t} from '../../lib/i18n';
import React from 'react';
import {Keyboard,KeyboardAvoidingView,Modal,Platform,Pressable,StyleSheet,Text,View} from 'react-native';
import {C,type} from './styles';
import {T} from './tokens';

// A short choice in a sheet from below (board «Экраны старой версии», 2026-11-26; Airbnb's and Uber's pickers):
// a title, one line of explanation, the options as rows with a mark on the chosen one, then one button at the bottom.
// A row with the value stays on the screen; this sheet replaces chips and forms under the row.
export function SheetModal({visible,title,note,onClose,children}:{visible:boolean;title:string;note?:string;onClose:()=>void;children:React.ReactNode}){
 // A fee typed into the sheet raises the number pad: the sheet rides up over it (iOS), a tap on the sheet or on the
 // shade first puts the keyboard away (the number pad has no «Готово»), and only a second tap on the shade closes.
 return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
  <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
   <Pressable accessibilityLabel={t('Закрыть')} onPress={()=>{if(Keyboard.isVisible())Keyboard.dismiss();else onClose();}} style={c.shade}/>
   <Pressable accessible={false} onPress={Keyboard.dismiss} style={c.sheet} accessibilityViewIsModal>
    <View style={c.grab}/>
    <Text accessibilityRole="header" numberOfLines={2} style={c.title}>{title}</Text>
    {!!note&&<Text style={c.note}>{note}</Text>}
    {children}
   </Pressable>
  </KeyboardAvoidingView>
 </Modal>;
}
export function ChoiceRows<V extends string>({value,options,onChange,disabled=false,label}:{value:V;options:{id:V;title:string;note?:string}[];onChange:(v:V)=>void;disabled?:boolean;label?:string}){
 return <View accessibilityRole="radiogroup" accessibilityLabel={label}>{options.map(o=>{const on=o.id===value;return <Pressable key={o.id} accessibilityRole="radio" accessibilityLabel={o.title+(o.note?'. '+o.note:'')} accessibilityState={{checked:on,disabled}} disabled={disabled} onPress={()=>onChange(o.id)} style={({pressed})=>[c.row,pressed&&c.dim]}>
  <View style={{flex:1,minWidth:0}}><Text style={[c.rowTitle,on&&{fontWeight:'600'}]}>{o.title}</Text>{!!o.note&&<Text style={c.rowNote}>{o.note}</Text>}</View>
  <View style={[c.radio,on&&c.radioOn]}>{on&&<View style={c.radioDot}/>}</View>
 </Pressable>;})}</View>;
}
export function SheetButton({title,onPress,disabled=false}:{title:string;onPress:()=>void;disabled?:boolean}){
 return <Pressable accessibilityRole="button" accessibilityState={{disabled}} disabled={disabled} onPress={onPress} style={({pressed})=>[c.button,(disabled||pressed)&&c.dim]}><Text style={c.buttonText}>{title}</Text></Pressable>;
}
// The row that opens such a sheet: what it is on the left, its value and «›» on the right.
export function ValueRow({title,value,onPress,disabled=false,label}:{title:string;value:string;onPress:()=>void;disabled?:boolean;label?:string}){
 return <Pressable accessibilityRole="button" accessibilityLabel={label||title+': '+value} disabled={disabled} onPress={onPress} style={({pressed})=>[c.value,(pressed||disabled)&&c.dim]}>
  <Text numberOfLines={2} style={c.valueTitle}>{title}</Text><Text numberOfLines={1} style={c.valueText}>{value}</Text><Text style={c.chevron}>›</Text>
 </Pressable>;
}
const c=StyleSheet.create({
 shade:{flex:1,backgroundColor:C.scrim},
 sheet:{paddingHorizontal:20,paddingTop:8,paddingBottom:32,gap:8,borderTopLeftRadius:T.radius.xl,borderTopRightRadius:T.radius.xl,backgroundColor:C.surface},
 grab:{alignSelf:'center',width:40,height:4,borderRadius:T.radius.full,backgroundColor:C.lineStrong,marginBottom:8},
 title:{...type.subtitle,color:C.ink,fontWeight:'600'},note:{...type.label,color:C.muted},
 row:{flexDirection:'row',alignItems:'center',gap:12,minHeight:T.control.touch+12,paddingVertical:8,borderTopWidth:1,borderTopColor:C.line},
 rowTitle:{...type.body,color:C.ink},rowNote:{...type.caption,color:C.muted},
 radio:{width:22,height:22,borderRadius:T.radius.full,borderWidth:2,borderColor:C.lineStrong,alignItems:'center',justifyContent:'center'},radioOn:{borderColor:C.ink},radioDot:{width:10,height:10,borderRadius:T.radius.full,backgroundColor:C.ink},
 button:{minHeight:T.control.primary,borderRadius:T.radius.full,backgroundColor:C.accent,alignItems:'center',justifyContent:'center',marginTop:8},buttonText:{...type.body,color:C.onAccent,fontWeight:'600'},
 value:{flexDirection:'row',alignItems:'center',gap:12,minHeight:T.control.primary,paddingVertical:8,borderBottomWidth:1,borderBottomColor:C.line},
 valueTitle:{...type.body,color:C.ink,flex:1,minWidth:0},valueText:{...type.label,color:C.muted,maxWidth:'45%'},chevron:{...type.subtitle,color:C.lineStrong},
 dim:{opacity:.5},
});
