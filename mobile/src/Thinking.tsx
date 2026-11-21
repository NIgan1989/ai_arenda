import React,{useEffect,useRef,useState} from 'react';
import {AccessibilityInfo,Animated,Easing,Platform,StyleSheet,Text,View,type StyleProp,type TextStyle,type ViewStyle} from 'react-native';
import {GLYPH_RING,GLYPH_STROKE} from '../../lib/brand';
import {thinkingShown} from './loading';
import {C} from './styles';

// The one «the service is thinking» sign of the app, the same as on the site (components/thinking.tsx): the crown of the
// yurt from the logo, drawn faintly, and a light in the AI colours that runs round its ring. The large size has the
// gold rays turning around it. It stands wherever something waits for an answer — a pressed button, a line of status
// text, the AI's reply, the long-action pill — instead of the system spinner, which looks different on every phone.
// `color` paints the whole sign one colour (white on a filled button).
const crown=require('../assets/brand/dome-glyph.png');
const SIZES={sm:16,md:20,lg:40} as const;
const RAYS=Array.from({length:12},(_,i)=>i);
const native=Platform.OS!=='web';

export function Thinking({size='md',color,label,style,pill=false}:{size?:keyof typeof SIZES;color?:string;label?:string;style?:StyleProp<ViewStyle>;pill?:boolean}){
  const turn=useRef(new Animated.Value(0)).current,slow=useRef(new Animated.Value(0)).current,[calm,setCalm]=useState(false);
  useEffect(()=>{let alive=true;AccessibilityInfo.isReduceMotionEnabled().then(v=>{if(alive)setCalm(v);}).catch(()=>{});const sub=AccessibilityInfo.addEventListener('reduceMotionChanged',setCalm);return()=>{alive=false;sub.remove();};},[]);
  // Tells the long-action pill that this screen already shows its own waiting sign.
  useEffect(()=>pill?undefined:thinkingShown(),[pill]);
  const rays=size==='lg';
  useEffect(()=>{
    const loops=[Animated.loop(Animated.timing(turn,{toValue:1,duration:calm?1600:1100,easing:Easing.linear,useNativeDriver:native}))];
    if(rays&&!calm)loops.push(Animated.loop(Animated.timing(slow,{toValue:1,duration:8000,easing:Easing.linear,useNativeDriver:native})));
    loops.forEach(loop=>loop.start());return()=>loops.forEach(loop=>loop.stop());
  },[turn,slow,rays,calm]);
  // The crown fills the sign; in the large one it stands inside its rays. The light is a ring of the crown's own
  // size and line with two of its quarters painted: the tail and, ahead of it, the bright head.
  const box=SIZES[size],d=rays?box*.6:box,rim=d*(GLYPH_RING+GLYPH_STROKE/2)/50,ink=color||C.accent;
  const full=(value:Animated.Value)=>value.interpolate({inputRange:[0,1],outputRange:['0deg','360deg']});
  return <View accessible={!!label} accessibilityRole={label?'progressbar':undefined} accessibilityLabel={label} importantForAccessibility={label?'yes':'no-hide-descendants'} style={[st.sign,{width:box,height:box},style]}>{rays&&<Animated.View style={[st.fill,{transform:[{rotate:full(slow)}]}]}>{RAYS.map(i=><View key={i} style={[st.fill,{transform:[{rotate:i*30+'deg'}]}]}><View style={{top:box*.015,width:box*.05,height:box*.105,borderRadius:box*.025,backgroundColor:color||C.gold}}/></View>)}</Animated.View>}{/* With «reduce motion» nothing turns: the crown itself slowly brightens and dims. */}<Animated.Image source={crown} style={{width:d,height:d,tintColor:ink,opacity:calm?turn.interpolate({inputRange:[0,.5,1],outputRange:[.45,1,.45]}):.3}}/>{!calm&&<Animated.View style={[st.light,{width:rim,height:rim,borderRadius:rim/2,borderWidth:d*GLYPH_STROKE/100,borderTopColor:ink,borderRightColor:color||C.aiTo,transform:[{rotate:full(turn)}]}]}/>}</View>;
}

// A line of waiting text with the sign before it: «Загружаю профиль…».
export function ThinkingLine({text,style}:{text:string;style?:StyleProp<TextStyle>}){
  return <View accessible accessibilityLiveRegion="polite" accessibilityLabel={text} style={st.line}><Thinking size="sm"/><Text style={[style,st.lineText]}>{text}</Text></View>;
}

const st=StyleSheet.create({
  sign:{alignItems:'center',justifyContent:'center'},
  fill:{position:'absolute',top:0,right:0,bottom:0,left:0,alignItems:'center'},
  light:{position:'absolute',borderColor:'transparent'},
  line:{flexDirection:'row',alignItems:'center',gap:8},lineText:{flexShrink:1},
});
