import {t} from '../../lib/i18n';
import React,{useEffect,useState} from 'react';
import {Animated,Easing,Modal,Platform,Pressable,ScrollView,StyleSheet,Switch,Text,View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Photo} from './ListingMedia';
import {C,type} from './styles';
import {T} from './tokens';

// The top plate of the owner and the cleaner (concept 2026-11-26, «Статус и объекты»; Grab Driver, Jobber, ClickUp):
// as the guest's «где · когда · сколько», it says what the map shows and changes it in one tap. The photo opens the
// menu, which has «Сменить роль»; the words open the choice (the owner's places) or the day (the cleaner's);
// the cleaner's switch takes new offers or stops them.
const native=Platform.OS!=='web';
export type PlateToggle={on:boolean;label:string;busy:boolean;onChange:(on:boolean)=>void};
export function RolePlate({avatarId,avatarName,busy,open,onProfile,title,line,dot,caret=false,expanded,onPress,toggle,width}:{avatarId?:string|null;avatarName?:string;busy:boolean;open:boolean;onProfile:()=>void;title:string;line:string;dot?:string;caret?:boolean;expanded?:boolean;onPress:()=>void;toggle?:PlateToggle;width:number}){
 return <View style={[p.plate,{width}]}>
  <Pressable accessibilityRole="button" accessibilityLabel={t('Меню и профиль')} accessibilityState={{expanded:open,disabled:busy}} disabled={busy} onPress={onProfile} hitSlop={{top:6,bottom:6,left:8,right:4}} style={p.photo}><Photo id={avatarId} size={36} avatar name={avatarName} alt={t('Профиль')}/></Pressable>
  <Pressable accessibilityRole="button" accessibilityLabel={title+'. '+line} accessibilityState={caret?{expanded:!!expanded}:undefined} onPress={onPress} hitSlop={{top:4,bottom:4}} style={({pressed})=>[p.words,pressed&&p.dim]}>
   <Text numberOfLines={1} maxFontSizeMultiplier={1.25} style={p.title}>{!!dot&&<Text style={{color:dot}}>● </Text>}{title}{caret&&<Text style={p.caret}>{expanded?'  ⌃':'  ⌄'}</Text>}</Text>
   <Text numberOfLines={1} maxFontSizeMultiplier={1.25} style={p.line}>{line}</Text>
  </Pressable>
  {!!toggle&&<Switch accessibilityLabel={toggle.label} value={toggle.on} disabled={toggle.busy} onValueChange={toggle.onChange} trackColor={{false:C.lineStrong,true:C.ink}} thumbColor={C.surface} {...({activeThumbColor:C.surface} as object)} style={p.switch}/>}
 </View>;
}

// «Что показать на карте»: all the owner's places, or one of them, as the workspace switcher of ClickUp.
export type PickPlace={id:string;title:string;photo?:string|null;dot:string;state:string;price?:string};
export function PlacePicker({visible,places,all,selected,onPick,onClose}:{visible:boolean;places:PickPlace[];all:string;selected:string;onPick:(id:string)=>void;onClose:()=>void}){
 const insets=useSafeAreaInsets(),[shown,setShown]=useState(visible),[a]=useState(()=>new Animated.Value(0));
 useEffect(()=>{
  if(visible){setShown(true);Animated.timing(a,{toValue:1,duration:260,easing:Easing.out(Easing.cubic),useNativeDriver:native}).start();}
  else Animated.timing(a,{toValue:0,duration:180,easing:Easing.in(Easing.quad),useNativeDriver:native}).start(({finished})=>{if(finished)setShown(false);});
 },[visible,a]);
 if(!shown)return null;
 const row=(id:string,title:string,state:string,photo:React.ReactNode,dot?:string,price?:string)=>{const on=selected===id;return <Pressable key={id||'all'} accessibilityRole="button" accessibilityState={{selected:on}} accessibilityLabel={title+'. '+state} onPress={()=>onPick(id)} style={({pressed})=>[p.row,pressed&&p.dim]}>
  {photo}
  <View style={p.rowText}><Text numberOfLines={1} style={p.rowTitle}>{title}</Text><Text numberOfLines={1} style={p.rowLine}>{!!dot&&<Text style={{color:dot}}>● </Text>}{state}</Text></View>
  {!!price&&<Text numberOfLines={1} style={p.price}>{price}</Text>}
  <Text style={[p.mark,!on&&p.markOff]}>{on?'✓':''}</Text>
 </Pressable>;};
 return <Modal visible transparent statusBarTranslucent animationType="none" onRequestClose={onClose}>
  <Animated.View style={[StyleSheet.absoluteFill,{backgroundColor:C.scrim,opacity:a}]}><Pressable accessibilityRole="button" accessibilityLabel={t('Закрыть')} onPress={onClose} style={StyleSheet.absoluteFill}/></Animated.View>
  <Animated.View accessibilityViewIsModal style={[p.sheet,{paddingBottom:16+insets.bottom,transform:[{translateY:a.interpolate({inputRange:[0,1],outputRange:[480,0]})}]}]}>
   <View style={p.grip}/>
   <Text accessibilityRole="header" style={p.sheetTitle}>{t('Что показать на карте')}</Text>
   <ScrollView style={{maxHeight:420}} contentContainerStyle={{paddingBottom:4}}>
    {row('',t('Все объекты'),all,<View style={[p.thumb,p.all]}><Text style={p.allText}>⌂</Text></View>)}
    {places.map(x=>row(x.id,x.title,x.state,<View style={p.thumb}><Photo id={x.photo} fill alt={t('Фото: {title}',{title:x.title})}/></View>,x.dot,x.price))}
   </ScrollView>
  </Animated.View>
 </Modal>;
}

const R=T.radius;
const p=StyleSheet.create({
 plate:{flexDirection:'row',alignItems:'center',height:48,borderRadius:R.full,paddingLeft:8,paddingRight:8,gap:8},
 photo:{width:36,height:36,borderRadius:R.full,alignItems:'center',justifyContent:'center'},
 words:{flex:1,minWidth:0,justifyContent:'center',minHeight:44},
 title:{...type.label,fontWeight:'600',color:C.ink},caret:{color:C.muted,fontWeight:'600'},
 line:{...type.caption,color:C.muted},
 switch:{marginLeft:4},
 dim:{opacity:0.6},
 sheet:{position:'absolute',left:0,right:0,bottom:0,backgroundColor:C.surface,borderTopLeftRadius:24,borderTopRightRadius:24,paddingTop:8,paddingHorizontal:16},
 grip:{alignSelf:'center',width:40,height:5,borderRadius:4,backgroundColor:C.lineStrong,marginBottom:12},
 sheetTitle:{...type.subtitle,fontWeight:'600',color:C.ink,textAlign:'center',marginBottom:8},
 row:{flexDirection:'row',alignItems:'center',gap:12,minHeight:68,paddingVertical:8,borderBottomWidth:1,borderBottomColor:C.line},
 thumb:{width:48,height:48,borderRadius:12,overflow:'hidden',backgroundColor:C.surfaceAlt},
 all:{alignItems:'center',justifyContent:'center'},allText:{fontSize:22,lineHeight:28,color:C.inkSoft},
 rowText:{flex:1,minWidth:0,gap:2},rowTitle:{...type.body,fontWeight:'600',color:C.ink},rowLine:{...type.caption,color:C.muted},
 price:{...type.label,fontWeight:'600',color:C.ink},
 mark:{fontSize:18,fontWeight:'600',color:C.ink,minWidth:20,textAlign:'center'},markOff:{color:C.lineStrong},
});
