import React,{type ReactNode} from 'react';
import {View,Text,Pressable,Switch,StyleSheet,Image} from 'react-native';
import {C,type} from './styles';
import {T} from './tokens';
// The menu icons of the site (lucide), rasterized by scripts/export-navigation-icons.mjs.
export const menuIcons={user:require('../assets/menu/user.png'),star:require('../assets/menu/star.png'),sparkles:require('../assets/menu/sparkles.png'),briefcase:require('../assets/menu/briefcase.png'),bell:require('../assets/menu/bell.png'),lock:require('../assets/menu/lock.png'),plus:require('../assets/menu/plus.png'),sliders:require('../assets/menu/sliders.png'),messages:require('../assets/menu/messages.png'),shield:require('../assets/menu/shield.png'),logout:require('../assets/menu/logout.png'),users:require('../assets/menu/users.png'),camera:require('../assets/menu/camera.png'),key:require('../assets/menu/key.png'),flag:require('../assets/menu/flag.png'),file:require('../assets/menu/file.png'),alert:require('../assets/menu/alert.png'),trash:require('../assets/menu/trash.png'),wallet:require('../assets/menu/wallet.png'),bank:require('../assets/menu/bank.png'),eye:require('../assets/menu/eye.png'),dot:require('../assets/menu/dot.png'),read:require('../assets/menu/read.png'),send:require('../assets/menu/send.png'),languages:require('../assets/menu/languages.png'),pin:require('../assets/menu/pin.png'),map:require('../assets/menu/map.png'),clock:require('../assets/menu/clock.png'),badge:require('../assets/menu/badge.png'),phone:require('../assets/menu/phone.png'),check:require('../assets/menu/check.png'),zap:require('../assets/menu/zap.png'),chevron:require('../assets/menu/chevron.png'),building:require('../assets/menu/building.png'),
 bookings:require('../assets/navigation/bookings.png'),cleaning:require('../assets/navigation/cleaning.png'),calendar:require('../assets/navigation/calendar.png'),jobs:require('../assets/navigation/jobs.png'),assignments:require('../assets/navigation/assignments.png'),properties:require('../assets/navigation/properties.png'),catalog:require('../assets/navigation/catalog.png'),overview:require('../assets/navigation/overview.png')};
export type MenuIcon=keyof typeof menuIcons;
// The colour of the menu's icons and progress: indigo, green for the cleaner, as on the site (.acct-cleaner).
export const menuInk=(role?:string)=>role==='cleaner'?C.success:C.accent;
export function RowIcon({icon,tint}:{icon?:MenuIcon;tint?:string}){return icon?<Image source={menuIcons[icon]} style={[a.icon,{tintColor:tint||C.accent}]} accessibilityElementsHidden importantForAccessibility="no"/>:null;}
// The account screen is one grouped list: a row names a setting and shows its current value.
export function Group({title,children,space=false}:{title?:string;children:ReactNode;space?:boolean}){return <>{!!title&&<Text accessibilityRole="header" style={a.label}>{title}</Text>}<View style={[a.group,space&&!title&&{marginTop:16}]}>{children}</View></>;}
export function Row({title,value,note,onPress,open,danger=false,disabled=false,empty=false,icon,tint}:{icon?:MenuIcon;tint?:string;title:string;value?:string|number|null;note?:string;onPress:()=>void;open?:boolean;danger?:boolean;disabled?:boolean;empty?:boolean}){
 const shown=value!==undefined&&value!==null&&value!=='';
 return <Pressable accessibilityRole="button" accessibilityState={open===undefined?{disabled}:{expanded:open,disabled}} disabled={disabled} onPress={onPress} style={({pressed})=>[a.row,pressed&&a.pressed]}><RowIcon icon={icon} tint={danger?C.danger:tint}/><View style={shown?a.grow:a.wide}><Text style={[a.title,danger&&a.danger]}>{title}</Text>{!!note&&<Text style={a.note}>{note}</Text>}</View>{shown&&<Text numberOfLines={1} style={[a.value,empty&&a.empty]}>{value}</Text>}{!danger&&<Text style={a.chevron}>{open?'⌄':'›'}</Text>}</Pressable>;
}
export function SwitchRow({title,note,checked,onChange,disabled=false,icon,tint}:{icon?:MenuIcon;tint?:string;title:string;note?:string;checked:boolean;onChange:(value:boolean)=>void;disabled?:boolean}){
 return <View style={a.row}><RowIcon icon={icon} tint={tint}/><View style={a.wide}><Text style={a.title}>{title}</Text>{!!note&&<Text style={a.note}>{note}</Text>}</View><Switch accessibilityLabel={title} value={checked} disabled={disabled} onValueChange={onChange} trackColor={{false:C.lineStrong,true:C.accent}} thumbColor={C.surface} {...({activeThumbColor:C.surface} as object)}/></View>;
}
// A choice of two or three short options inside a row.
export function Choice({title,value,options,onChange,disabled=false,icon,tint}:{icon?:MenuIcon;tint?:string;title:string;value:string;options:[string,string][];onChange:(value:string)=>void;disabled?:boolean}){
 return <View style={a.row}><RowIcon icon={icon} tint={tint}/><Text style={[a.title,a.wide]}>{title}</Text><View accessibilityRole="radiogroup" style={a.seg}>{options.map(([v,label])=><Pressable key={v} accessibilityRole="radio" accessibilityState={{checked:value===v,disabled}} disabled={disabled} onPress={()=>onChange(v)} style={[a.segItem,value===v&&a.segOn]}><Text style={[a.segText,value===v&&a.segTextOn]}>{label}</Text></Pressable>)}</View></View>;
}
export const a=StyleSheet.create({
 label:{...type.caption,color:C.muted,fontWeight:'600',letterSpacing:.4,textTransform:'uppercase',marginTop:20,marginBottom:8,marginHorizontal:4},
 group:{borderWidth:1,borderColor:C.line,backgroundColor:C.surface,borderTopWidth:0,borderRadius:T.radius.lg,overflow:'hidden'},
 row:{minHeight:T.control.field,flexDirection:'row',alignItems:'center',gap:12,paddingHorizontal:16,paddingVertical:8,borderTopWidth:1,borderTopColor:C.line},
 pressed:{backgroundColor:C.surfaceAlt},grow:{flexGrow:0,flexShrink:0,maxWidth:'62%'},wide:{flex:1,minWidth:0},
 icon:{width:20,height:20,flexShrink:0},
 title:{...type.label,color:C.ink,fontWeight:'600'},note:{...type.caption,color:C.muted},
 value:{...type.label,color:C.muted,flex:1,minWidth:0,textAlign:'right'},empty:{color:C.accent},danger:{color:C.danger},
 chevron:{...type.subtitle,color:C.lineStrong,width:12,textAlign:'center'},
 body:{paddingHorizontal:16,paddingBottom:16,gap:12},notice:{paddingHorizontal:16,paddingBottom:12},
 head:{flexDirection:'row',alignItems:'center',gap:12},name:{...type.title,color:C.ink,fontWeight:'700',letterSpacing:-.3},
 edit:{minHeight:T.control.touch,paddingHorizontal:16,borderRadius:T.radius.full,borderWidth:1,borderColor:C.line,backgroundColor:C.surface,justifyContent:'center'},editText:{...type.label,color:C.ink,fontWeight:'600'},
 track:{height:4,borderRadius:T.radius.full,backgroundColor:C.line,marginTop:12,overflow:'hidden'},fill:{height:4,borderRadius:T.radius.full,backgroundColor:C.accent},
 next:{minHeight:T.control.primary,flexDirection:'row',alignItems:'center',gap:12,paddingHorizontal:16,paddingVertical:8,marginTop:16,borderRadius:T.radius.lg,borderWidth:1,borderColor:C.aiTo,backgroundColor:C.surface},spark:{...type.subtitle,color:C.aiTo},
 saved:{...type.label,color:C.success,marginTop:12},
 seg:{flexDirection:'row',padding:2,borderRadius:T.radius.md,backgroundColor:C.surfaceAlt},segItem:{minHeight:32,paddingHorizontal:12,borderRadius:T.radius.sm,justifyContent:'center'},segOn:{backgroundColor:C.surface},segText:{...type.label,color:C.muted,fontWeight:'500'},segTextOn:{color:C.ink,fontWeight:'600'},footnote:{...type.caption,color:C.muted,marginTop:12,marginHorizontal:4}});
