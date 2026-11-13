import React,{useEffect,useRef,useState} from 'react';
import {AccessibilityInfo,Animated,Easing,Platform,StyleSheet,Text,View,type StyleProp,type TextStyle,type ViewStyle} from 'react-native';
import {thinkingShown} from './loading';
import {C} from './styles';

// The one «the service is thinking» sign of the app: three dots in the AI colours that rise in a wave.
// It stands wherever something waits for an answer — a pressed button, a line of status text, the AI's reply,
// the long-action pill — instead of the system spinner, which looks different on every phone.
// `color` paints all three dots one colour (white on a filled button).
const SIZES={sm:6,md:8,lg:10} as const;
const native=Platform.OS!=='web';

export function Thinking({size='md',color,label,style,pill=false}:{size?:keyof typeof SIZES;color?:string;label?:string;style?:StyleProp<ViewStyle>;pill?:boolean}){
  const wave=useRef(new Animated.Value(0)).current,[calm,setCalm]=useState(false);
  useEffect(()=>{let alive=true;AccessibilityInfo.isReduceMotionEnabled().then(v=>{if(alive)setCalm(v);}).catch(()=>{});const sub=AccessibilityInfo.addEventListener('reduceMotionChanged',setCalm);return()=>{alive=false;sub.remove();};},[]);
  // Tells the long-action pill that this screen already shows its own dots.
  useEffect(()=>pill?undefined:thinkingShown(),[pill]);
  useEffect(()=>{
    const loop=Animated.loop(Animated.timing(wave,{toValue:1,duration:calm?1600:1250,easing:Easing.linear,useNativeDriver:native}));
    loop.start();return()=>loop.stop();
  },[wave,calm]);
  const d=SIZES[size],colors=color?[color,color,color]:[C.accent,C.aiMid,C.aiTo];
  // Each dot rides the same wave a little later than the one before it; the range wraps so the loop has no seam.
  const dot=(i:number)=>{
    const at=i*0.13,peak=at+0.14,down=at+0.36;
    const rise=wave.interpolate({inputRange:[0,at,peak,down,1],outputRange:[0,0,1,0,0]});
    return calm
      ? {opacity:wave.interpolate({inputRange:[0,.5,1],outputRange:[.45,1,.45]})}
      : {opacity:rise.interpolate({inputRange:[0,1],outputRange:[.42,1]}),transform:[{translateY:rise.interpolate({inputRange:[0,1],outputRange:[0,-d*0.6]})},{scale:rise.interpolate({inputRange:[0,1],outputRange:[.82,1.12]})}]};
  };
  return <View accessible={!!label} accessibilityRole={label?'progressbar':undefined} accessibilityLabel={label} importantForAccessibility={label?'yes':'no-hide-descendants'} style={[st.row,{gap:d/2,height:d*2},style]}>
    {colors.map((background,i)=><Animated.View key={i} style={[{width:d,height:d,borderRadius:d,backgroundColor:background},dot(i)]}/>)}
  </View>;
}

// A line of waiting text with the dots before it: «Загружаю профиль…».
export function ThinkingLine({text,style}:{text:string;style?:StyleProp<TextStyle>}){
  return <View accessible accessibilityLiveRegion="polite" accessibilityLabel={text} style={st.line}><Thinking size="sm"/><Text style={[style,st.lineText]}>{text}</Text></View>;
}

const st=StyleSheet.create({row:{flexDirection:'row',alignItems:'center',justifyContent:'center'},line:{flexDirection:'row',alignItems:'center',gap:8},lineText:{flexShrink:1}});
