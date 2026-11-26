import React,{createContext,useContext,type ReactNode} from 'react';
import {View,Text,Pressable,Switch,StyleSheet,Image} from 'react-native';
import {C,type} from './styles';
import {T} from './tokens';
// The menu icons of the site (lucide), rasterized by scripts/export-navigation-icons.mjs.
export const menuIcons={face:require('../assets/menu/face.png'),fingerprint:require('../assets/menu/fingerprint.png'),user:require('../assets/menu/user.png'),star:require('../assets/menu/star.png'),shanyrak:require('../assets/menu/shanyrak.png'),brush:require('../assets/menu/brush.png'),briefcase:require('../assets/menu/briefcase.png'),bell:require('../assets/menu/bell.png'),lock:require('../assets/menu/lock.png'),plus:require('../assets/menu/plus.png'),sliders:require('../assets/menu/sliders.png'),messages:require('../assets/menu/messages.png'),shield:require('../assets/menu/shield.png'),logout:require('../assets/menu/logout.png'),users:require('../assets/menu/users.png'),camera:require('../assets/menu/camera.png'),key:require('../assets/menu/key.png'),flag:require('../assets/menu/flag.png'),file:require('../assets/menu/file.png'),alert:require('../assets/menu/alert.png'),trash:require('../assets/menu/trash.png'),wallet:require('../assets/menu/wallet.png'),bank:require('../assets/menu/bank.png'),eye:require('../assets/menu/eye.png'),dot:require('../assets/menu/dot.png'),read:require('../assets/menu/read.png'),send:require('../assets/menu/send.png'),languages:require('../assets/menu/languages.png'),pin:require('../assets/menu/pin.png'),map:require('../assets/menu/map.png'),clock:require('../assets/menu/clock.png'),badge:require('../assets/menu/badge.png'),phone:require('../assets/menu/phone.png'),check:require('../assets/menu/check.png'),zap:require('../assets/menu/zap.png'),chevron:require('../assets/menu/chevron.png'),building:require('../assets/menu/building.png'),chart:require('../assets/menu/chart.png'),
 bookings:require('../assets/navigation/bookings.png'),cleaning:require('../assets/navigation/cleaning.png'),calendar:require('../assets/navigation/calendar.png'),jobs:require('../assets/navigation/jobs.png'),assignments:require('../assets/navigation/assignments.png'),properties:require('../assets/navigation/properties.png'),catalog:require('../assets/navigation/catalog.png'),overview:require('../assets/navigation/overview.png')};
export type MenuIcon=keyof typeof menuIcons;
// The colour of the menu's icons and progress: black line icons for every role, as the concept of the menu
// (mobbin/koncept-menu, 2026-11-26): no indigo and no green in the menu.
export const menuInk=(_role?:string)=>C.ink;
export function RowIcon({icon,tint}:{icon?:MenuIcon;tint?:string}){return icon?<Image source={menuIcons[icon]} style={[a.icon,{tintColor:tint||C.ink}]} accessibilityElementsHidden importantForAccessibility="no"/>:null;}
// The menu draws its groups flat, as Airbnb's settings: rows on the white sheet with a line between them, a bold
// heading over a group, a grey band between groups without one. Elsewhere a group stays a card.
export const FlatMenu=createContext(false);
// The account screen is one grouped list: a row names a setting and shows its current value.
export function Group({title,children,space=false}:{title?:string;children:ReactNode;space?:boolean}){
 const flat=useContext(FlatMenu);
 // Flat: the group spans the sheet's padding, so the rows' own padding lines them up with the title; the line above
 // the first row is hidden under the edge.
 if(flat)return <>{!!title&&<Text accessibilityRole="header" style={a.heading}>{title}</Text>}<View style={[a.flat,space&&!title&&a.band]}><View style={{marginTop:-1}}>{children}</View></View></>;
 return <>{!!title&&<Text accessibilityRole="header" style={a.label}>{title}</Text>}<View style={[a.group,space&&!title&&{marginTop:16}]}>{children}</View></>;
}
// The buttons of the menu's pages: dark for the main step, a line for the second one, red to delete.
export function Btn({title,onPress,kind='dark',disabled=false,label}:{title:string;onPress:()=>void;kind?:'dark'|'line'|'danger';disabled?:boolean;label?:string}){
 return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled}} disabled={disabled} onPress={onPress} style={({pressed})=>[a.btn,kind==='line'&&a.btnLine,kind==='danger'&&a.btnDanger,(disabled||pressed)&&{opacity:.5}]}><Text style={[a.btnText,kind==='line'&&{color:C.ink}]}>{title}</Text></Pressable>;
}
export function Row({title,value,note,onPress,open,danger=false,disabled=false,empty=false,icon,tint}:{icon?:MenuIcon;tint?:string;title:string;value?:string|number|null;note?:string;onPress:()=>void;open?:boolean;danger?:boolean;disabled?:boolean;empty?:boolean}){
 const shown=value!==undefined&&value!==null&&value!=='';
 return <Pressable accessibilityRole="button" accessibilityState={open===undefined?{disabled}:{expanded:open,disabled}} disabled={disabled} onPress={onPress} style={({pressed})=>[a.row,pressed&&a.pressed]}><RowIcon icon={icon} tint={danger?C.danger:tint}/><View style={shown?a.grow:a.wide}><Text style={[a.title,danger&&a.danger]}>{title}</Text>{!!note&&<Text style={a.note}>{note}</Text>}</View>{shown&&<Text numberOfLines={1} style={[a.value,empty&&a.empty]}>{value}</Text>}{!danger&&<Text style={a.chevron}>{open?'⌄':'›'}</Text>}</Pressable>;
}
export function SwitchRow({title,note,checked,onChange,disabled=false,icon,tint}:{icon?:MenuIcon;tint?:string;title:string;note?:string;checked:boolean;onChange:(value:boolean)=>void;disabled?:boolean}){
 return <View style={a.row}><RowIcon icon={icon} tint={tint}/><View style={a.wide}><Text style={a.title}>{title}</Text>{!!note&&<Text style={a.note}>{note}</Text>}</View><Switch accessibilityLabel={title} value={checked} disabled={disabled} onValueChange={onChange} trackColor={{false:C.lineStrong,true:C.ink}} thumbColor={C.surface} {...({activeThumbColor:C.surface} as object)}/></View>;
}
// A choice of two or three short options inside a row.
export function Choice({title,value,options,onChange,disabled=false,icon,tint}:{icon?:MenuIcon;tint?:string;title:string;value:string;options:[string,string][];onChange:(value:string)=>void;disabled?:boolean}){
 return <View style={a.row}><RowIcon icon={icon} tint={tint}/><Text style={[a.title,a.wide]}>{title}</Text><View accessibilityRole="radiogroup" style={a.seg}>{options.map(([v,label])=><Pressable key={v} accessibilityRole="radio" accessibilityState={{checked:value===v,disabled}} disabled={disabled} onPress={()=>onChange(v)} style={[a.segItem,value===v&&a.segOn]}><Text style={[a.segText,value===v&&a.segTextOn]}>{label}</Text></Pressable>)}</View></View>;
}
export const a=StyleSheet.create({
 label:{...type.caption,color:C.muted,fontWeight:'600',marginTop:20,marginBottom:8,marginHorizontal:4},
 heading:{...type.label,color:C.ink,fontWeight:'600',marginTop:24,marginBottom:4},
 flat:{marginHorizontal:-16,overflow:'hidden'},band:{marginTop:16,borderTopWidth:8,borderTopColor:C.bg},
 btn:{minHeight:T.control.primary,borderRadius:T.radius.full,backgroundColor:C.ink,alignItems:'center',justifyContent:'center',paddingHorizontal:24,marginTop:16},btnLine:{backgroundColor:C.surface,borderWidth:1,borderColor:C.lineStrong},btnDanger:{backgroundColor:C.danger},btnText:{...type.body,color:C.onAccent,fontWeight:'600',textAlign:'center'},
 group:{borderWidth:1,borderColor:C.line,backgroundColor:C.surface,borderTopWidth:0,borderRadius:T.radius.lg,overflow:'hidden'},
 row:{minHeight:T.control.field,flexDirection:'row',alignItems:'center',gap:12,paddingHorizontal:16,paddingVertical:8,borderTopWidth:1,borderTopColor:C.line},
 pressed:{backgroundColor:C.surfaceAlt},grow:{flexGrow:0,flexShrink:0,maxWidth:'62%'},wide:{flex:1,minWidth:0},
 icon:{width:20,height:20,flexShrink:0},
 title:{...type.label,color:C.ink,fontWeight:'600'},note:{...type.caption,color:C.muted},
 value:{...type.label,color:C.muted,flex:1,minWidth:0,textAlign:'right'},empty:{color:C.ink,fontWeight:'600'},danger:{color:C.danger},
 chevron:{...type.subtitle,color:C.lineStrong,width:12,textAlign:'center'},
 body:{paddingHorizontal:16,paddingBottom:16,gap:12},notice:{paddingHorizontal:16,paddingBottom:12},
 head:{flexDirection:'row',alignItems:'center',gap:12},name:{...type.title,color:C.ink,fontWeight:'600',letterSpacing:-.3},
 edit:{minHeight:T.control.touch,paddingHorizontal:16,borderRadius:T.radius.full,borderWidth:1,borderColor:C.line,backgroundColor:C.surface,justifyContent:'center'},editText:{...type.label,color:C.ink,fontWeight:'600'},
 track:{height:4,borderRadius:T.radius.full,backgroundColor:C.line,marginTop:12,overflow:'hidden'},fill:{height:4,borderRadius:T.radius.full,backgroundColor:C.ink},
 next:{minHeight:T.control.primary,flexDirection:'row',alignItems:'center',gap:12,paddingHorizontal:16,paddingVertical:8,marginTop:16,borderRadius:T.radius.lg,borderWidth:1,borderColor:C.line,backgroundColor:C.surface},spark:{...type.subtitle,color:C.ink},
 saved:{...type.label,color:C.success,marginTop:12},
 seg:{flexDirection:'row',padding:2,borderRadius:T.radius.md,backgroundColor:C.surfaceAlt},segItem:{minHeight:32,paddingHorizontal:12,borderRadius:T.radius.sm,justifyContent:'center'},segOn:{backgroundColor:C.surface},segText:{...type.label,color:C.muted,fontWeight:'500'},segTextOn:{color:C.ink,fontWeight:'600'},footnote:{...type.caption,color:C.muted,marginTop:12,marginHorizontal:4}});
