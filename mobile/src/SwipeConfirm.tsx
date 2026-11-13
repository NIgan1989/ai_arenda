import React,{useEffect,useRef,useState} from 'react';
import {AccessibilityInfo,Animated,PanResponder,StyleSheet,Text,View} from 'react-native';
import {C,type} from './styles';
import {T} from './tokens';

// One gesture for one answer: the knob is pulled to the end of the track and lets go there.
// The track says exactly what the gesture confirms. A screen reader gets an ordinary button with the same words,
// and «reduce motion» changes nothing about the gesture itself, only the spring back.
const KNOB=48,PAD=4,DONE=.85;
export function SwipeConfirm({label,onConfirm,disabled=false}:{label:string;onConfirm:()=>void;disabled?:boolean}){
 const [width,setWidth]=useState(0),x=useRef(new Animated.Value(0)).current;
 const live=useRef({width,disabled,onConfirm});live.current={width,disabled,onConfirm};
 const [calm,setCalm]=useState(false);
 useEffect(()=>{let on=true;AccessibilityInfo.isReduceMotionEnabled().then(v=>{if(on)setCalm(v);}).catch(()=>{});return()=>{on=false;};},[]);
 const span=()=>Math.max(0,live.current.width-KNOB-2*PAD);
 const back=()=>calm?x.setValue(0):Animated.spring(x,{toValue:0,friction:6,tension:120,useNativeDriver:true}).start();
 const pan=useRef(PanResponder.create({
  onStartShouldSetPanResponder:()=>!live.current.disabled,
  onMoveShouldSetPanResponder:(_e,g)=>!live.current.disabled&&Math.abs(g.dx)>4&&Math.abs(g.dx)>Math.abs(g.dy),
  onPanResponderTerminationRequest:()=>false,
  onPanResponderMove:(_e,g)=>x.setValue(Math.max(0,Math.min(span(),g.dx))),
  onPanResponderRelease:(_e,g)=>{if(span()&&g.dx>=span()*DONE){Animated.timing(x,{toValue:span(),duration:T.motion.fast,useNativeDriver:true}).start(()=>{live.current.onConfirm();x.setValue(0);});}else back();},
  onPanResponderTerminate:back
 })).current;
 useEffect(()=>{if(disabled)x.setValue(0);},[disabled]);
 const fill=width?x.interpolate({inputRange:[0,Math.max(1,width-KNOB-2*PAD)],outputRange:[0,1],extrapolate:'clamp'}):0;
 return <View accessible accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled}} accessibilityActions={[{name:'activate'}]} onAccessibilityAction={e=>{if(e.nativeEvent.actionName==='activate'&&!disabled)onConfirm();}}
  onLayout={e=>setWidth(Math.round(e.nativeEvent.layout.width))} style={[sw.track,disabled&&sw.off]}>
  <Animated.View pointerEvents="none" style={[sw.fill,{opacity:fill,transform:[{translateX:x}]}]}/>
  <Text numberOfLines={2} style={sw.text}>{label}</Text>
  <Animated.View {...pan.panHandlers} style={[sw.knob,{transform:[{translateX:x}]}]}><Text style={sw.arrow}>→</Text></Animated.View>
 </View>;
}
const sw=StyleSheet.create({
 track:{height:KNOB+2*PAD,borderRadius:T.radius.full,backgroundColor:C.accentSoft,borderWidth:1,borderColor:C.accentLine,justifyContent:'center',overflow:'hidden'},
 off:{opacity:.5},
 fill:{position:'absolute',left:-400,top:0,bottom:0,width:400+KNOB+PAD,backgroundColor:C.accent,borderRadius:T.radius.full},
 text:{...type.label,color:C.accent,fontWeight:'600',textAlign:'center',paddingLeft:KNOB+2*PAD+8,paddingRight:16},
 knob:{position:'absolute',left:PAD,top:PAD,width:KNOB,height:KNOB,borderRadius:T.radius.full,backgroundColor:C.accent,alignItems:'center',justifyContent:'center',shadowColor:C.ink,shadowOffset:{width:0,height:2},shadowOpacity:.18,shadowRadius:5,elevation:3},
 arrow:{...type.subtitle,color:C.onAccent,fontWeight:'700'}
});
