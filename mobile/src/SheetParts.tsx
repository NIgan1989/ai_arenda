import React from 'react';
import {Pressable,ScrollView,StyleSheet,Text,View} from 'react-native';
import {C,type} from './styles';
import {T} from './tokens';

// Small controls and the styles shared by everything inside the map's bottom sheet
// (MapHome.tsx, GuestForm.tsx, GuestResults.tsx). They lived in MapHome.tsx before the guest form got its own file.
export function Action({title,onPress,secondary=false,disabled=false,danger=false}:{title:string;onPress:()=>void;secondary?:boolean;disabled?:boolean;danger?:boolean}){
 return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{disabled}} disabled={disabled} onPress={onPress} style={({pressed})=>[h.action,secondary&&h.actionSecondary,(disabled||pressed)&&h.dim]}><Text style={[h.actionText,secondary&&h.actionSecondaryText,danger&&h.dangerText]}>{title}</Text></Pressable>;
}
export function Chips<T extends string|number>({label,name,value,options,onChange,disabled}:{label?:string;name?:string;value:T;options:[T,string][];onChange:(value:T)=>void;disabled?:boolean}){
 return <View style={h.field}>{!!label&&<Text style={h.label}>{label}</Text>}<ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={h.chipsScroll} contentContainerStyle={h.chips} accessibilityRole="radiogroup" accessibilityLabel={label||name}>{options.map(([id,title])=><Pressable key={String(id)} accessibilityRole="radio" accessibilityState={{checked:id===value,disabled}} disabled={disabled} onPress={()=>onChange(id)} style={[h.chip,id===value&&h.chipOn]}><Text style={[h.chipText,id===value&&h.chipTextOn]}>{title}</Text></Pressable>)}</ScrollView></View>;
}
export function Stepper({label,value,text,min,max,step=1,onChange,disabled}:{label:string;value:number;text:string;min:number;max:number;step?:number;onChange:(value:number)=>void;disabled?:boolean}){
 return <View style={h.stepper}><Text style={h.label}>{label}</Text><View style={h.stepperRow}>
  <Pressable accessibilityRole="button" accessibilityLabel={label+': меньше'} disabled={disabled||value<=min} onPress={()=>onChange(Math.max(min,value-step))} style={[h.step,(disabled||value<=min)&&h.dim]}><Text style={h.stepText}>−</Text></Pressable>
  <Text accessibilityLiveRegion="polite" style={h.stepValue}>{text}</Text>
  <Pressable accessibilityRole="button" accessibilityLabel={label+': больше'} disabled={disabled||value>=max} onPress={()=>onChange(Math.min(max,value+step))} style={[h.step,(disabled||value>=max)&&h.dim]}><Text style={h.stepText}>+</Text></Pressable>
 </View></View>;
}
export function Stage({steps,current}:{steps:string[];current:number}){
 return <View style={h.stages} accessibilityLabel={'Этап '+(current+1)+' из '+steps.length+': '+steps[current]}>{steps.map((step,i)=><View key={step} style={h.stage}><View style={[h.stageBar,i<=current&&h.stageBarOn]}/><Text numberOfLines={1} style={[h.stageText,i===current&&h.stageTextOn]}>{step}</Text></View>)}</View>;
}

// The screen sits inside the app's safe area, so offsets start at its own top edge.
// The grip is thin, but the strip that takes a tap or a drag is a full 44px.
export const handleHeight=T.control.touch,topInset=64;
const R=T.radius,H=T.control,shadow={shadowColor:C.ink,shadowOffset:{width:0,height:2},shadowOpacity:.12,shadowRadius:8,elevation:3};
export const h=StyleSheet.create({
 host:{flex:1,backgroundColor:C.bg},
 menu:{position:'absolute',top:12,right:12,width:H.touch,height:H.touch,borderRadius:R.full,backgroundColor:C.glassStrong,borderWidth:1,borderColor:C.glassLine,alignItems:'center',justifyContent:'center',...shadow},
 sheet:{position:'absolute',left:0,right:0,bottom:0,backgroundColor:C.glassStrong,borderTopLeftRadius:R.xl,borderTopRightRadius:R.xl,borderTopWidth:1,borderColor:C.glassLine,shadowColor:C.ink,shadowOffset:{width:0,height:-4},shadowOpacity:.1,shadowRadius:12,elevation:12},
 handleArea:{height:handleHeight,alignItems:'center',justifyContent:'center'},handle:{width:40,height:4,borderRadius:R.xs,backgroundColor:C.lineStrong},sheetContent:{paddingHorizontal:16,paddingBottom:16},
 block:{gap:12},head:{},grow:{flex:1,minWidth:0},title:{...type.title,color:C.ink,fontWeight:'600',letterSpacing:-.3},note:{...type.label,color:C.muted},label:{...type.caption,color:C.muted,marginBottom:4},
 field:{gap:0},chipsScroll:{marginHorizontal:-16,flexGrow:0},chips:{gap:8,paddingHorizontal:16},chip:{minHeight:H.touch,paddingHorizontal:16,borderRadius:R.full,borderWidth:1,borderColor:C.accentLine,backgroundColor:C.glassStrong,justifyContent:'center'},chipOn:{backgroundColor:C.accent,borderColor:C.accent},chipText:{...type.label,color:C.ink},chipTextOn:{color:C.onAccent,fontWeight:'600'},
 pair:{flexDirection:'row',gap:8},stepper:{flex:1},stepperRow:{flexDirection:'row',alignItems:'center',borderWidth:1,borderColor:C.line,borderRadius:R.md,backgroundColor:C.surface,height:H.field},step:{width:H.touch,height:H.touch,alignItems:'center',justifyContent:'center'},stepText:{...type.title,color:C.ink},stepValue:{flex:1,textAlign:'center',...type.body,color:C.ink,fontWeight:'600'},
 input:{height:H.field,borderWidth:1,borderColor:C.line,borderRadius:R.md,backgroundColor:C.surface,paddingHorizontal:12,fontSize:16,color:C.ink},
 action:{minHeight:H.field,borderRadius:R.full,backgroundColor:C.accent,alignItems:'center',justifyContent:'center',paddingHorizontal:16,paddingVertical:12},actionSecondary:{backgroundColor:C.surface,borderWidth:1,borderColor:C.lineStrong},actionText:{...type.body,color:C.onAccent,fontWeight:'600',textAlign:'center'},actionSecondaryText:{...type.body,color:C.ink,fontWeight:'500',textAlign:'center'},dangerText:{color:C.danger},dim:{opacity:.45},
 row:{flexDirection:'row',alignItems:'center',gap:8},card:{borderWidth:1,borderColor:C.glassLine,borderRadius:R.lg,backgroundColor:C.glassStrong,padding:16,gap:8},urgent:{borderColor:C.warningLine,backgroundColor:C.warningSoft},cardTitle:{...type.subtitle,color:C.ink,fontWeight:'600'},price:{...type.title,color:C.ink,fontWeight:'700',letterSpacing:-.4},
 reason:{...type.label,color:C.success},timer:{...type.display,color:C.ink,fontWeight:'300',letterSpacing:-1},timerSmall:{...type.label,color:C.warning,fontWeight:'600'},
 check:{flexDirection:'row',alignItems:'center',gap:12,minHeight:H.touch},checkBox:{...type.title,color:C.accent},checkText:{flex:1,...type.label,color:C.ink},
 listRow:{flexDirection:'row',alignItems:'center',gap:12,minHeight:H.field},eventTitle:{...type.body,color:C.ink,fontWeight:'500'},rowPrice:{...type.body,color:C.ink,fontWeight:'600'},picked:{gap:8},
 error:{...type.label,color:C.danger,backgroundColor:C.dangerSoft,borderRadius:R.md,padding:12},
 stages:{flexDirection:'row',gap:4},stage:{flex:1,gap:4},stageBar:{height:4,borderRadius:R.xs,backgroundColor:C.line},stageBarOn:{backgroundColor:C.accent},stageText:{...type.caption,color:C.muted},stageTextOn:{color:C.ink,fontWeight:'600'}
});
