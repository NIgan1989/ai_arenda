import React,{useEffect,useRef,useState} from 'react';
import {AccessibilityInfo,Animated,Easing,PanResponder,Platform,StyleSheet,Text,View} from 'react-native';
import * as Haptics from 'expo-haptics';
import {C,type} from './styles';
import {T} from './tokens';

// One gesture for one answer: the knob is pulled to the end of the track and lets go there.
// The track says exactly what the gesture confirms, so no second «Подтвердите» card follows it.
// How it moves: a light runs along the words and the knob nudges once to show the way; the colour follows the knob,
// the words fade under it, the phone ticks where letting go already counts, and at the end the arrow becomes a check
// that stays while the answer is on its way. A screen reader gets an ordinary button with the same words;
// «reduce motion» removes the light, the nudge and the spring, the gesture itself stays.
const KNOB=48,PAD=4,DONE=.85,HOLD=1600;
const tick=(run:()=>Promise<void>)=>{try{run().catch(()=>{});}catch{/* no haptics on this device or in the browser preview */}};
export function SwipeConfirm({label,onConfirm,disabled=false}:{label:string;onConfirm:()=>void;disabled?:boolean}){
 const [width,setWidth]=useState(0),[done,setDone]=useState(false),[calm,setCalm]=useState(false);
 const x=useRef(new Animated.Value(0)).current,glow=useRef(new Animated.Value(0)).current;
 const live=useRef({width,disabled,onConfirm,calm,done,past:false,wasBusy:false});Object.assign(live.current,{width,disabled,onConfirm,calm,done});
 useEffect(()=>{let on=true;AccessibilityInfo.isReduceMotionEnabled().then(v=>{if(on)setCalm(v);}).catch(()=>{});return()=>{on=false;};},[]);
 const span=()=>Math.max(0,live.current.width-KNOB-2*PAD);
 const back=()=>{live.current.past=false;if(live.current.calm)x.setValue(0);else Animated.spring(x,{toValue:0,friction:6,tension:120,useNativeDriver:true}).start();};
 const pan=useRef(PanResponder.create({
  onStartShouldSetPanResponder:()=>!live.current.disabled&&!live.current.done,
  onMoveShouldSetPanResponder:(_e,g)=>!live.current.disabled&&!live.current.done&&Math.abs(g.dx)>4&&Math.abs(g.dx)>Math.abs(g.dy),
  onPanResponderTerminationRequest:()=>false,
  onPanResponderGrant:()=>{x.stopAnimation();},
  onPanResponderMove:(_e,g)=>{const s=span(),past=!!s&&g.dx>=s*DONE;if(past!==live.current.past){live.current.past=past;tick(()=>Haptics.selectionAsync());}x.setValue(Math.max(0,Math.min(s,g.dx)));},
  onPanResponderRelease:(_e,g)=>{const s=span();if(s&&g.dx>=s*DONE){setDone(true);live.current.done=true;live.current.wasBusy=false;tick(()=>Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
    Animated.timing(x,{toValue:s,duration:T.motion.fast,easing:Easing.out(Easing.cubic),useNativeDriver:true}).start(()=>live.current.onConfirm());}else back();},
  onPanResponderTerminate:back
 })).current;
 // The check stays while the answer is being sent, then the knob goes home: the caller turns `disabled` on and off
 // around its request; a caller that opens something else instead gets the knob back after a short while.
 useEffect(()=>{if(!done)return;if(disabled){live.current.wasBusy=true;return;}
  const home=()=>{setDone(false);live.current.past=false;x.setValue(0);};
  if(live.current.wasBusy){home();return;}
  const t=setTimeout(home,HOLD);return()=>clearTimeout(t);},[done,disabled]);
 useEffect(()=>{if(disabled&&!done)x.setValue(0);},[disabled,done]);
 // The hint: the knob nudges once when the track appears, a light keeps running along the words while it waits.
 const idle=!!width&&!disabled&&!done&&!calm;
 useEffect(()=>{if(!idle)return;glow.setValue(0);
  const nudge=Animated.sequence([Animated.delay(500),Animated.timing(x,{toValue:14,duration:220,easing:Easing.out(Easing.quad),useNativeDriver:true}),Animated.spring(x,{toValue:0,friction:5,tension:140,useNativeDriver:true})]);
  const loop=Animated.loop(Animated.sequence([Animated.timing(glow,{toValue:1,duration:1500,easing:Easing.inOut(Easing.quad),useNativeDriver:true}),Animated.delay(1300)]));
  nudge.start();loop.start();return()=>{nudge.stop();loop.stop();};},[idle]);
 const s=Math.max(1,width-KNOB-2*PAD),at=(out:number[])=>x.interpolate({inputRange:[0,s],outputRange:out,extrapolate:'clamp'});
 // In the browser preview a keyboard has no finger: Enter or Space on the focused track confirms, as a button would.
 const keys=Platform.OS==='web'?{tabIndex:disabled?-1:0,onKeyDown:(e:any)=>{if((e.key==='Enter'||e.key===' ')&&!live.current.disabled&&!live.current.done){e.preventDefault?.();live.current.onConfirm();}}} as object:null;
 return <View {...keys} accessible accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled,busy:done}} accessibilityActions={[{name:'activate'}]} onAccessibilityAction={e=>{if(e.nativeEvent.actionName==='activate'&&!disabled&&!done)onConfirm();}}
  onLayout={e=>setWidth(Math.round(e.nativeEvent.layout.width))} style={[sw.track,disabled&&!done&&sw.off]}>
  <Animated.View pointerEvents="none" style={[sw.fill,{opacity:width?at([0,1]):0,transform:[{translateX:x}]}]}/>
  <Animated.Text numberOfLines={2} style={[sw.text,{opacity:width?at([1,0]):1}]}>{label}</Animated.Text>
  {idle&&<Animated.View pointerEvents="none" style={[sw.glow,{transform:[{translateX:glow.interpolate({inputRange:[0,1],outputRange:[-80,width+80]})},{skewX:'-20deg'}]}]}/>}
  <Animated.View {...pan.panHandlers} style={[sw.knob,done&&sw.knobDone,{transform:[{translateX:x},{scale:width?x.interpolate({inputRange:[0,s*DONE,s],outputRange:[1,1,1.06],extrapolate:'clamp'}):1}]}]}><Text style={[sw.arrow,done&&sw.arrowDone]}>{done?'✓':'→'}</Text></Animated.View>
 </View>;
}
const sw=StyleSheet.create({
 track:{height:KNOB+2*PAD,borderRadius:T.radius.full,backgroundColor:C.ink,borderWidth:1,borderColor:C.ink,justifyContent:'center',overflow:'hidden'},
 off:{opacity:.5},
 fill:{position:'absolute',left:-400,top:0,bottom:0,width:400+KNOB+PAD,backgroundColor:C.inkSoft,borderRadius:T.radius.full},
 glow:{position:'absolute',left:0,top:0,bottom:0,width:56,backgroundColor:C.onAccent,opacity:.14},
 text:{...type.label,color:C.onAccent,fontWeight:'600',textAlign:'center',paddingLeft:KNOB+2*PAD+8,paddingRight:16},
 knob:{position:'absolute',left:PAD,top:PAD,width:KNOB,height:KNOB,borderRadius:T.radius.full,backgroundColor:C.gold,alignItems:'center',justifyContent:'center',shadowColor:C.ink,shadowOffset:{width:0,height:2},shadowOpacity:.18,shadowRadius:5,elevation:3},
 knobDone:{backgroundColor:C.surface},
 arrow:{...type.subtitle,color:C.ink,fontWeight:'700'},arrowDone:{color:C.ink}
});
