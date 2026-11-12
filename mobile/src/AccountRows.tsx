import React,{type ReactNode} from 'react';
import {View,Text,Pressable,Switch,StyleSheet} from 'react-native';
import {C,type} from './styles';
import {T} from './tokens';
// The account screen is one grouped list: a row names a setting and shows its current value.
export function Group({title,children}:{title?:string;children:ReactNode}){return <>{!!title&&<Text accessibilityRole="header" style={a.label}>{title}</Text>}<View style={a.group}>{children}</View></>;}
export function Row({title,value,note,onPress,open,danger=false,disabled=false,empty=false}:{title:string;value?:string|number|null;note?:string;onPress:()=>void;open?:boolean;danger?:boolean;disabled?:boolean;empty?:boolean}){
 const shown=value!==undefined&&value!==null&&value!=='';
 return <Pressable accessibilityRole="button" accessibilityState={open===undefined?{disabled}:{expanded:open,disabled}} disabled={disabled} onPress={onPress} style={({pressed})=>[a.row,pressed&&a.pressed]}><View style={shown?a.grow:a.wide}><Text style={[a.title,danger&&a.danger]}>{title}</Text>{!!note&&<Text style={a.note}>{note}</Text>}</View>{shown&&<Text numberOfLines={1} style={[a.value,empty&&a.empty]}>{value}</Text>}{!danger&&<Text style={a.chevron}>{open?'⌄':'›'}</Text>}</Pressable>;
}
export function SwitchRow({title,note,checked,onChange,disabled=false}:{title:string;note?:string;checked:boolean;onChange:(value:boolean)=>void;disabled?:boolean}){
 return <View style={a.row}><View style={a.wide}><Text style={a.title}>{title}</Text>{!!note&&<Text style={a.note}>{note}</Text>}</View><Switch accessibilityLabel={title} value={checked} disabled={disabled} onValueChange={onChange} trackColor={{false:C.lineStrong,true:C.accent}} thumbColor={C.surface} {...({activeThumbColor:C.surface} as object)}/></View>;
}
export const a=StyleSheet.create({
 label:{...type.caption,color:C.muted,fontWeight:'600',letterSpacing:.4,textTransform:'uppercase',marginTop:20,marginBottom:8,marginHorizontal:4},
 group:{borderWidth:1,borderColor:C.line,backgroundColor:C.surface,borderTopWidth:0,borderRadius:T.radius.lg,overflow:'hidden'},
 row:{minHeight:T.control.field,flexDirection:'row',alignItems:'center',gap:12,paddingHorizontal:16,paddingVertical:8,borderTopWidth:1,borderTopColor:C.line},
 pressed:{backgroundColor:C.surfaceAlt},grow:{flexGrow:0,flexShrink:0,maxWidth:'62%'},wide:{flex:1,minWidth:0},
 title:{...type.label,color:C.ink,fontWeight:'500'},note:{...type.caption,color:C.muted},
 value:{...type.label,color:C.muted,flex:1,minWidth:0,textAlign:'right'},empty:{color:C.accent},danger:{color:C.danger},
 chevron:{...type.subtitle,color:C.lineStrong,width:12,textAlign:'center'},
 body:{paddingHorizontal:16,paddingBottom:16,gap:12},notice:{paddingHorizontal:16,paddingBottom:12},
 head:{flexDirection:'row',alignItems:'center',gap:12},name:{...type.title,color:C.ink,fontWeight:'700',letterSpacing:-.3},
 edit:{minHeight:T.control.touch,paddingHorizontal:16,borderRadius:T.radius.full,borderWidth:1,borderColor:C.line,backgroundColor:C.surface,justifyContent:'center'},editText:{...type.label,color:C.ink,fontWeight:'600'},
 track:{height:4,borderRadius:T.radius.full,backgroundColor:C.line,marginTop:12,overflow:'hidden'},fill:{height:4,borderRadius:T.radius.full,backgroundColor:C.accent},
 next:{minHeight:T.control.primary,flexDirection:'row',alignItems:'center',gap:12,paddingHorizontal:16,paddingVertical:8,marginTop:16,borderRadius:T.radius.lg,borderWidth:1,borderColor:C.aiTo,backgroundColor:C.surface},spark:{...type.subtitle,color:C.aiTo},
 saved:{...type.label,color:C.success,marginTop:12},footnote:{...type.caption,color:C.muted,marginTop:12,marginHorizontal:4}});
