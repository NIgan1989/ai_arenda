import React,{useEffect,useRef,useState} from 'react';
import {AccessibilityInfo,Animated,Easing,Platform,StyleSheet,View} from 'react-native';
import {isEntryReady,subscribeLoading} from './loading';
import {C} from './styles';

const mark=require('../assets/brand/brand-mark.png');
// The story is meant to be watched, not glimpsed: about three and a half seconds before the screen opens.
const SIZE=128,MIN_STORY=3600,MAX_WAIT=7500;
const native=Platform.OS!=='web';

// The entry story on every cold start, unhurried:
//   1. a soft glow in the AI colours comes up and keeps drifting the whole time;
//   2. the house of the logo rises from the ground up;
//   3. two rings spread from it, one after the other;
//   4. the name comes up under it, then the line «Жильё на часы и сутки»;
//   5. the mark breathes for a moment, and the screen opens onto the map.
// It waits for the first data (so the map is ready under it), but never longer than a few seconds.
export function EntrySplash(){
  const [gone,setGone]=useState(false);
  const glow=useRef(new Animated.Value(0)).current,drift=useRef(new Animated.Value(0)).current,build=useRef(new Animated.Value(0)).current;
  const ringA=useRef(new Animated.Value(0)).current,ringB=useRef(new Animated.Value(0)).current;
  const name=useRef(new Animated.Value(0)).current,line=useRef(new Animated.Value(0)).current,breathe=useRef(new Animated.Value(0)).current,leave=useRef(new Animated.Value(0)).current;
  useEffect(()=>{
    let alive=true,calm=false,storyDone=false,left=false;
    const started=Date.now(),timers:ReturnType<typeof setTimeout>[]=[];
    const t=(value:Animated.Value,duration:number,easing=Easing.out(Easing.cubic),delay=0)=>Animated.timing(value,{toValue:1,duration,delay,easing,useNativeDriver:native});
    const exit=()=>{
      if(left||!alive)return;left=true;
      Animated.timing(leave,{toValue:1,duration:calm?160:620,easing:Easing.inOut(Easing.cubic),useNativeDriver:native}).start(()=>{if(alive)setGone(true);});
    };
    const maybeExit=()=>{if(storyDone&&isEntryReady())exit();};
    const unsubscribe=subscribeLoading(maybeExit);
    timers.push(setTimeout(exit,MAX_WAIT));
    AccessibilityInfo.isReduceMotionEnabled().catch(()=>false).then(reduced=>{
      if(!alive)return;calm=!!reduced;
      if(calm){glow.setValue(1);build.setValue(1);name.setValue(1);line.setValue(1);timers.push(setTimeout(()=>{storyDone=true;maybeExit();},450));return;}
      t(glow,700,Easing.out(Easing.quad)).start();
      t(drift,MIN_STORY+600,Easing.inOut(Easing.quad)).start();
      Animated.sequence([
        t(build,1500,Easing.inOut(Easing.cubic),250),
        Animated.parallel([
          t(ringA,1400),
          t(ringB,1400,Easing.out(Easing.cubic),320),
          t(name,700,Easing.out(Easing.cubic),80),
          t(line,700,Easing.out(Easing.cubic),420),
          // One slow breath of the finished mark while the name settles.
          Animated.sequence([t(breathe,700,Easing.inOut(Easing.quad),300),Animated.timing(breathe,{toValue:0,duration:800,easing:Easing.inOut(Easing.quad),useNativeDriver:native})]),
        ]),
      ]).start();
      timers.push(setTimeout(()=>{storyDone=true;maybeExit();},Math.max(0,MIN_STORY-(Date.now()-started))));
    });
    return()=>{alive=false;unsubscribe();timers.forEach(clearTimeout);};
  },[glow,drift,build,ringA,ringB,name,line,breathe,leave]);
  if(gone)return null;
  // The house is built from the ground up: a clipping window slides up over the mark while the mark itself stays still
  // (the mark moves against the window by the same amount).
  const rise=build.interpolate({inputRange:[0,1],outputRange:[SIZE,0]}),counter=build.interpolate({inputRange:[0,1],outputRange:[-SIZE,0]});
  const ring=(value:Animated.Value)=>({opacity:value.interpolate({inputRange:[0,.12,1],outputRange:[0,.85,0]}),transform:[{scale:value.interpolate({inputRange:[0,1],outputRange:[.9,2.3]})}]});
  const up=(value:Animated.Value,from:number)=>({opacity:value,transform:[{translateY:value.interpolate({inputRange:[0,1],outputRange:[from,0]})}]});
  return <Animated.View pointerEvents="auto" accessibilityLabel="AI Аренда" accessibilityRole="image" style={[st.screen,{opacity:leave.interpolate({inputRange:[0,1],outputRange:[1,0]}),transform:[{scale:leave.interpolate({inputRange:[0,1],outputRange:[1,1.08]})}]}]}>
    <Animated.View style={[st.glowA,{opacity:glow,transform:[{scale:drift.interpolate({inputRange:[0,1],outputRange:[.86,1.1]})}]}]}><Glow color={C.aiFrom} size={520}/></Animated.View>
    <Animated.View style={[st.glowB,{opacity:glow,transform:[{translateX:drift.interpolate({inputRange:[0,1],outputRange:[24,-16]})},{scale:drift.interpolate({inputRange:[0,1],outputRange:[.9,1.08]})}]}]}><Glow color={C.aiTo} size={400}/></Animated.View>
    <View style={st.stage}>
      <View style={st.markBox}>
        <Animated.View style={[st.ring,{borderColor:C.aiFrom},ring(ringA)]}/>
        <Animated.View style={[st.ring,{borderColor:C.aiTo},ring(ringB)]}/>
        <Animated.View style={{transform:[{scale:breathe.interpolate({inputRange:[0,1],outputRange:[1,1.06]})}]}}>
          <View style={st.clip}>
            <Animated.View style={[st.clip,{transform:[{translateY:rise}]}]}>
              <Animated.Image source={mark} style={[st.mark,{transform:[{translateY:counter}]}]}/>
            </Animated.View>
          </View>
        </Animated.View>
      </View>
      <Animated.Text style={[st.name,up(name,14)]}>AI Аренда</Animated.Text>
      <Animated.Text style={[st.line,up(line,10)]}>Жильё на часы и сутки</Animated.Text>
    </View>
  </Animated.View>;
}

// A soft glow without gradients: thin discs laid one over another, densest in the middle.
function Glow({color,size}:{color:string;size:number}){
  const steps=28;
  return <View style={{width:size,height:size,alignItems:'center',justifyContent:'center'}}>{Array.from({length:steps},(_,i)=>{const d=size*(1-i/steps);return <View key={i} style={[st.glowDisc,{width:d,height:d,backgroundColor:color}]}/>;})}</View>;
}

const st=StyleSheet.create({
  screen:{position:'absolute',top:0,left:0,right:0,bottom:0,zIndex:2000,elevation:2000,backgroundColor:C.bg,alignItems:'center',justifyContent:'center',overflow:'hidden'},
  glowA:{position:'absolute',top:'12%',alignSelf:'center'},
  glowB:{position:'absolute',top:'34%',left:'30%'},
  glowDisc:{position:'absolute',borderRadius:999,opacity:.009},
  stage:{alignItems:'center',gap:12,padding:24},
  markBox:{width:SIZE,height:SIZE,alignItems:'center',justifyContent:'center',marginBottom:12},
  ring:{position:'absolute',width:SIZE,height:SIZE,borderRadius:999,borderWidth:2},
  clip:{width:SIZE,height:SIZE,overflow:'hidden'},
  mark:{width:SIZE,height:SIZE},
  name:{fontSize:28,lineHeight:36,fontWeight:'800',letterSpacing:-0.5,color:C.ink},
  line:{fontSize:14,lineHeight:20,color:C.muted},
});
