import React,{useEffect,useRef,useState} from 'react';
import {AccessibilityInfo,Animated,Easing,Platform,StyleSheet,Text,View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {loadingBusy,localThinking,subscribeLoading} from './loading';
import {C} from './styles';
import {Thinking} from './Thinking';

const SHOW_AFTER=250,PILL_AFTER=1500;
const native=Platform.OS!=='web';

// A thin AI-gradient line along the top edge while a long action runs; after a second and a half also a glass pill with the «thinking» dots, low like a toast.
// The pill stays away while the screen shows dots of its own.
export function LoadingBar(){
  const insets=useSafeAreaInsets();
  const [busy,setBusy]=useState(loadingBusy()),[shown,setShown]=useState(false),[pill,setPill]=useState(false),[width,setWidth]=useState(0),[calm,setCalm]=useState(false);
  const progress=useRef(new Animated.Value(0)).current,opacity=useRef(new Animated.Value(0)).current,shine=useRef(new Animated.Value(0)).current,pillIn=useRef(new Animated.Value(0)).current;
  const [local,setLocal]=useState(localThinking());
  useEffect(()=>subscribeLoading(()=>{setBusy(loadingBusy());setLocal(localThinking());}),[]);
  useEffect(()=>{AccessibilityInfo.isReduceMotionEnabled().then(setCalm).catch(()=>{});const sub=AccessibilityInfo.addEventListener('reduceMotionChanged',setCalm);return()=>sub.remove();},[]);
  useEffect(()=>{
    if(busy){
      const show=setTimeout(()=>{
        setShown(true);progress.setValue(0.08);
        Animated.timing(opacity,{toValue:1,duration:120,useNativeDriver:native}).start();
        // Creeps forward ever slower; only the end of the action finishes the line.
        Animated.timing(progress,{toValue:0.9,duration:9000,easing:Easing.out(Easing.cubic),useNativeDriver:native}).start();
      },SHOW_AFTER);
      const showPill=setTimeout(()=>{setPill(true);Animated.spring(pillIn,{toValue:1,useNativeDriver:native,friction:7}).start();},PILL_AFTER);
      return()=>{clearTimeout(show);clearTimeout(showPill);};
    }
    if(!shown)return;
    Animated.timing(pillIn,{toValue:0,duration:160,useNativeDriver:native}).start(()=>setPill(false));
    Animated.sequence([
      Animated.timing(progress,{toValue:1,duration:220,easing:Easing.out(Easing.quad),useNativeDriver:native}),
      Animated.timing(opacity,{toValue:0,duration:260,useNativeDriver:native}),
    ]).start(({finished})=>{if(finished){setShown(false);progress.setValue(0);}});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[busy]);
  useEffect(()=>{
    if(!shown||calm)return;
    const loop=Animated.loop(Animated.timing(shine,{toValue:1,duration:1100,easing:Easing.linear,useNativeDriver:native}));
    loop.start();return()=>{loop.stop();shine.setValue(0);};
  },[shown,calm,shine]);
  if(!shown&&!pill)return null;
  // scaleX grows from the centre, so the bar is shifted left by the part not yet filled.
  const scale=progress,shift=progress.interpolate({inputRange:[0,1],outputRange:[-width/2,0]});
  return <View pointerEvents="none" style={[st.layer,{paddingBottom:insets.bottom+24}]} onLayout={e=>setWidth(e.nativeEvent.layout.width)}>
    {shown&&<Animated.View accessibilityRole="progressbar" accessibilityLabel="Загрузка" style={[st.track,{top:insets.top,opacity}]}>
      <Animated.View style={[st.bar,{transform:[{translateX:shift},{scaleX:scale}]}]}>
        <View style={st.from}/><View style={st.mid}/><View style={st.to}/>
        {!calm&&<Animated.View style={[st.shine,{transform:[{translateX:shine.interpolate({inputRange:[0,1],outputRange:[-120,Math.max(width,240)]})}]}]}/>}
      </Animated.View>
    </Animated.View>}
    {pill&&!local&&<Animated.View accessibilityRole="text" accessibilityLiveRegion="polite" style={[st.pill,{opacity:pillIn,transform:[{translateY:pillIn.interpolate({inputRange:[0,1],outputRange:[12,0]})}]}]}>
      <Thinking size="sm" pill/>
      <Text style={st.pillText}>Секунду…</Text>
    </Animated.View>}
  </View>;
}

const st=StyleSheet.create({
  layer:{position:'absolute',top:0,bottom:0,left:0,right:0,alignItems:'center',justifyContent:'flex-end',zIndex:1000,elevation:1000},
  track:{position:'absolute',left:0,right:0,height:3},
  bar:{flex:1,flexDirection:'row',overflow:'hidden',borderTopRightRadius:4,borderBottomRightRadius:4,shadowColor:C.aiFrom,shadowOpacity:.6,shadowRadius:6,shadowOffset:{width:0,height:0}},
  from:{flex:1,backgroundColor:C.accent},mid:{flex:1,backgroundColor:C.aiFrom},to:{flex:1,backgroundColor:C.aiTo},
  shine:{position:'absolute',top:0,bottom:0,width:80,backgroundColor:'rgba(255,255,255,0.55)'},
  pill:{flexDirection:'row',alignItems:'center',gap:8,minHeight:36,paddingVertical:8,paddingHorizontal:16,borderRadius:999,backgroundColor:C.glassStrong,borderWidth:1,borderColor:C.glassLine,shadowColor:C.ink,shadowOpacity:.12,shadowRadius:12,shadowOffset:{width:0,height:6},elevation:6},
  pillText:{fontSize:14,lineHeight:20,fontWeight:'600',color:C.ink},
});
