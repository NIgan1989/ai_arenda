import {t as tr} from '../../lib/i18n';
import React,{useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {AccessibilityInfo,Animated,Easing,Image,Modal,Platform,Pressable,StyleSheet,Text,View} from 'react-native';
import * as Haptics from 'expo-haptics';
import {DOME_RAYS,DOME_RAY_FROM,DOME_RAY_STROKE,DOME_RAY_TO} from '../../lib/brand';
import {C,brandFont,type} from './styles';
import {T} from './tokens';

// The шаңырақ outside the splash: the quiet sign of an empty list and the bright one of a moment worth marking
// (a payment that went through). The same pictures and numbers as the splash (EntrySplash.tsx, lib/brand.ts);
// there is no vector drawing in the app, so the rays are thin views turned around the centre.
const ringImage=require('../assets/brand/dome-ring.png'),barsUpright=require('../assets/brand/dome-bars-v.png'),barsLevel=require('../assets/brand/dome-bars-h.png');
const RAYS=Array.from({length:DOME_RAYS},(_,i)=>i),native=Platform.OS!=='web';

/** The sign at any size. `ink` paints the crown, `gold` the rays; `burst` (0→1) lets the rays fly out and back once. */
export function Dome({size,ink,gold=C.gold,burst}:{size:number;ink?:string;gold?:string;burst?:Animated.Value}){
 const u=size/100,box={position:'absolute' as const,left:0,top:0,width:size,height:size},wide=Math.max(1.5,DOME_RAY_STROKE*u);
 const ray={position:'absolute' as const,left:size/2-wide/2,top:size/2-DOME_RAY_TO*u,width:wide,height:(DOME_RAY_TO-DOME_RAY_FROM)*u,borderRadius:wide/2,backgroundColor:gold};
 const fly=burst?{transform:[{translateY:burst.interpolate({inputRange:[0,.5,1],outputRange:[0,-10*u,0]})},{scaleY:burst.interpolate({inputRange:[0,.5,1],outputRange:[1,2.2,1]})}]}:null;
 const tint=ink?{tintColor:ink}:null;
 return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{width:size,height:size}}>
  {RAYS.map(i=><View key={i} style={[box,{transform:[{rotate:`${i*360/DOME_RAYS}deg`}]}]}><Animated.View style={[ray,fly]}/></View>)}
  <Image source={ringImage} style={[box,tint]}/><Image source={barsUpright} style={[box,tint]}/><Image source={barsLevel} style={[box,tint]}/>
 </View>;
}

/** An empty list: the sign in grey with pale rays, a short title in the typeface of the name, a line of what to do, and one way on. */
export function BrandEmpty({title=tr('Пока пусто'),text,action,onPress}:{title?:string;text?:string;action?:string;onPress?:()=>void}){
 return <View style={e.wrap}>
  <Dome size={96} ink={C.lineStrong} gold={C.goldLine}/>
  <Text accessibilityRole="header" style={e.title}>{title}</Text>
  {!!text&&<Text style={e.text}>{text}</Text>}
  {!!action&&!!onPress&&<Pressable accessibilityRole="button" onPress={onPress} style={({pressed})=>[e.action,pressed&&{opacity:.7}]}><Text style={e.actionText}>{action}</Text></Pressable>}
 </View>;
}

// ── A moment worth marking ───────────────────────────────────────────────────────────────────────────────────
export type Moment={title:string;sum?:string;lines?:string[];action?:string};
let current:Moment|null=null;const watchers=new Set<()=>void>();
const tell=()=>watchers.forEach(run=>run());
/** Show the night plate with the crown and its rays over everything: «Оплачено». One at a time; a tap closes it. */
export function celebrate(moment:Moment){current=moment;tell();}
const subscribe=(run:()=>void)=>{watchers.add(run);return()=>{watchers.delete(run);};},read=()=>current;

/** Mounted once at the root of the app (App.tsx). */
export function BrandMoment(){
 const moment=useSyncExternalStore(subscribe,read,read);
 const [a]=useState(()=>({plate:new Animated.Value(0),sign:new Animated.Value(0),burst:new Animated.Value(0),words:new Animated.Value(0)}));
 const seen=useRef<Moment|null>(null);
 useEffect(()=>{
  if(!moment||seen.current===moment)return;seen.current=moment;let alive=true;
  [a.plate,a.sign,a.burst,a.words].forEach(v=>v.setValue(0));
  const to=(v:Animated.Value,toValue:number,duration:number,delay=0,easing:(t:number)=>number=Easing.out(Easing.cubic))=>Animated.timing(v,{toValue,duration,delay,easing,useNativeDriver:native});
  AccessibilityInfo.isReduceMotionEnabled().catch(()=>false).then(calm=>{
   if(!alive)return;
   if(calm){[a.plate,a.sign,a.words].forEach(v=>v.setValue(1));return;}
   try{Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(()=>{});}catch{/* no haptics here */}
   Animated.parallel([to(a.plate,1,220),Animated.spring(a.sign,{toValue:1,friction:6,tension:70,delay:80,useNativeDriver:native}),to(a.burst,1,900,260,Easing.inOut(Easing.quad)),to(a.words,1,420,380)]).start();
  });
  return()=>{alive=false;};
 },[moment,a]);
 if(!moment)return null;
 const close=()=>{current=null;tell();};
 const up={opacity:a.words,transform:[{translateY:a.words.interpolate({inputRange:[0,1],outputRange:[12,0]})}]};
 return <Modal visible transparent statusBarTranslucent animationType="none" onRequestClose={close}>
  <Animated.View accessibilityViewIsModal style={[m.plate,{opacity:a.plate}]}>
   <View style={m.middle}>
    <Animated.View style={{opacity:a.sign,transform:[{scale:a.sign.interpolate({inputRange:[0,1],outputRange:[.6,1]})}]}}><View style={m.glow}/><Dome size={200} burst={a.burst}/></Animated.View>
    <Animated.View style={[m.words,up]}>
     <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={m.title}>{moment.title}</Text>
     {!!moment.sum&&<Text style={m.sum}>{moment.sum}</Text>}
     {!!moment.lines?.length&&<View style={m.card}>{moment.lines.map((line,i)=><Text key={i} style={m.line}>{line}</Text>)}</View>}
    </Animated.View>
   </View>
   <Animated.View style={up}><Pressable accessibilityRole="button" onPress={close} style={({pressed})=>[m.action,pressed&&{opacity:.8}]}><Text style={m.actionText}>{moment.action||tr('Хорошо')}</Text></Pressable></Animated.View>
  </Animated.View>
 </Modal>;
}

const R=T.radius,H=T.control;
const e=StyleSheet.create({
 wrap:{alignItems:'center',gap:8,paddingVertical:32,paddingHorizontal:24},
 title:{...type.subtitle,...brandFont,color:C.ink,marginTop:12,textAlign:'center'},
 text:{...type.label,color:C.muted,textAlign:'center',maxWidth:320},
 action:{minHeight:H.field,marginTop:12,paddingHorizontal:24,borderRadius:R.full,backgroundColor:C.accent,alignItems:'center',justifyContent:'center'},actionText:{...type.body,color:C.onAccent,fontWeight:'600'},
});
const m=StyleSheet.create({
 plate:{flex:1,backgroundColor:C.night,padding:24,paddingBottom:40},
 middle:{flex:1,alignItems:'center',justifyContent:'center',gap:24},
 glow:{position:'absolute',left:-40,top:-40,width:280,height:280,borderRadius:999,backgroundColor:C.nightGlow,opacity:.5},
 words:{alignItems:'center',gap:8,alignSelf:'stretch'},
 title:{...type.heading,...brandFont,color:C.onAccent,textAlign:'center'},
 sum:{...type.body,color:C.domeFrom,textAlign:'center'},
 card:{alignSelf:'stretch',marginTop:16,padding:16,gap:4,borderRadius:R.lg,borderWidth:1,borderColor:'rgba(255,255,255,.14)',backgroundColor:'rgba(255,255,255,.07)'},
 line:{...type.label,color:C.onAccent},
 action:{minHeight:H.primary,borderRadius:R.lg,backgroundColor:C.gold,alignItems:'center',justifyContent:'center'},actionText:{...type.body,color:C.night,fontWeight:'700'},
});
