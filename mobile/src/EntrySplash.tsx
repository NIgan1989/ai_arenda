import React,{useEffect,useRef,useState} from 'react';
import {AccessibilityInfo,Animated,Easing,Platform,StyleSheet,View} from 'react-native';
import {isEntryReady,subscribeLoading} from './loading';
import {C} from './styles';

const mark=require('../assets/brand/brand-mark.png');
const SIZE=112,MIN_STORY=1900,MAX_WAIT=6000;
const native=Platform.OS!=='web';

// The entry story on every cold start: the house of the logo rises from the ground up, light runs across it,
// two rings spread in the AI colours, the name comes up under it, and the screen opens onto the map.
// It waits for the first data (so the map is ready under it), but never longer than a few seconds.
export function EntrySplash(){
  const [gone,setGone]=useState(false);
  const build=useRef(new Animated.Value(0)).current,glint=useRef(new Animated.Value(0)).current,rings=useRef(new Animated.Value(0)).current;
  const name=useRef(new Animated.Value(0)).current,leave=useRef(new Animated.Value(0)).current,pop=useRef(new Animated.Value(0)).current;
  useEffect(()=>{
    let alive=true,calm=false,storyDone=false,left=false;
    const started=Date.now();
    const exit=()=>{
      if(left||!alive)return;left=true;
      Animated.timing(leave,{toValue:1,duration:calm?160:480,easing:Easing.inOut(Easing.cubic),useNativeDriver:native}).start(()=>{if(alive)setGone(true);});
    };
    const maybeExit=()=>{if(storyDone&&isEntryReady())exit();};
    const unsubscribe=subscribeLoading(maybeExit);
    const cap=setTimeout(exit,MAX_WAIT);
    AccessibilityInfo.isReduceMotionEnabled().catch(()=>false).then(reduced=>{
      if(!alive)return;calm=!!reduced;
      if(calm){build.setValue(1);name.setValue(1);setTimeout(()=>{storyDone=true;maybeExit();},450);return;}
      Animated.sequence([
        Animated.timing(build,{toValue:1,duration:950,easing:Easing.inOut(Easing.cubic),useNativeDriver:native}),
        Animated.parallel([
          Animated.sequence([Animated.timing(pop,{toValue:1,duration:180,easing:Easing.out(Easing.quad),useNativeDriver:native}),Animated.spring(pop,{toValue:0,friction:5,useNativeDriver:native})]),
          Animated.timing(glint,{toValue:1,duration:650,easing:Easing.inOut(Easing.quad),useNativeDriver:native}),
          Animated.timing(rings,{toValue:1,duration:1100,easing:Easing.out(Easing.cubic),useNativeDriver:native}),
          Animated.timing(name,{toValue:1,duration:520,delay:80,easing:Easing.out(Easing.cubic),useNativeDriver:native}),
        ]),
      ]).start();
      setTimeout(()=>{storyDone=true;maybeExit();},Math.max(0,MIN_STORY-(Date.now()-started)));
    });
    return()=>{alive=false;unsubscribe();clearTimeout(cap);};
  },[build,glint,rings,name,leave,pop]);
  if(gone)return null;
  // The house is built from the ground up: a window moves up over the mark while the mark itself stays still.
  const rise=build.interpolate({inputRange:[0,1],outputRange:[SIZE,0]}),counter=build.interpolate({inputRange:[0,1],outputRange:[-SIZE,0]});
  const ring=(delay:number)=>({opacity:rings.interpolate({inputRange:[0,delay,delay+.15,1],outputRange:[0,0,.9,0],extrapolate:'clamp'}),transform:[{scale:rings.interpolate({inputRange:[0,delay,1],outputRange:[.9,.9,2.1],extrapolate:'clamp'})}]});
  return <Animated.View pointerEvents={'auto'} accessibilityLabel="AI Аренда" accessibilityRole="image" style={[st.screen,{opacity:leave.interpolate({inputRange:[0,1],outputRange:[1,0]}),transform:[{scale:leave.interpolate({inputRange:[0,1],outputRange:[1,1.06]})}]}]}>
    <Glow color={C.aiFrom} size={520} style={st.glowA}/><Glow color={C.aiTo} size={400} style={st.glowB}/>
    <View style={st.stage}>
      <View style={st.markBox}>
        <Animated.View style={[st.ring,{borderColor:C.aiFrom},ring(0)]}/>
        <Animated.View style={[st.ring,{borderColor:C.aiTo},ring(.18)]}/>
        <Animated.View style={{transform:[{scale:pop.interpolate({inputRange:[0,1],outputRange:[1,1.07]})}]}}>
          <View style={st.clip}>
            <Animated.View style={{transform:[{translateY:rise}]}}>
              <Animated.Image source={mark} style={[st.mark,{transform:[{translateY:counter}]}]}/>
            </Animated.View>
            <Animated.View style={[st.glint,{transform:[{translateX:glint.interpolate({inputRange:[0,1],outputRange:[-SIZE,SIZE*1.4]})},{rotate:'20deg'}]}]}/>
          </View>
        </Animated.View>
      </View>
      <Animated.Text style={[st.name,{opacity:name,transform:[{translateY:name.interpolate({inputRange:[0,1],outputRange:[12,0]})}]}]}>AI Аренда</Animated.Text>
      <Animated.Text style={[st.line,{opacity:name.interpolate({inputRange:[0,.4,1],outputRange:[0,0,1]}),transform:[{translateY:name.interpolate({inputRange:[0,1],outputRange:[8,0]})}]}]}>Жильё на часы и сутки</Animated.Text>
    </View>
  </Animated.View>;
}

// A soft glow without gradients: thin discs laid one over another, densest in the middle.
function Glow({color,size,style}:{color:string;size:number;style:object}){
  const steps=28;
  return <View style={[style,{width:size,height:size,alignItems:'center',justifyContent:'center'}]}>{Array.from({length:steps},(_,i)=>{const d=size*(1-i/steps);return <View key={i} style={[st.glowDisc,{width:d,height:d,backgroundColor:color}]}/>;})}</View>;
}

const st=StyleSheet.create({
  screen:{position:'absolute',top:0,left:0,right:0,bottom:0,zIndex:2000,elevation:2000,backgroundColor:C.bg,alignItems:'center',justifyContent:'center',overflow:'hidden'},
  glowA:{position:'absolute',top:'12%',alignSelf:'center'},
  glowB:{position:'absolute',top:'34%',left:'30%'},
  glowDisc:{position:'absolute',borderRadius:999,opacity:.009},
  stage:{alignItems:'center',gap:12,padding:24},
  markBox:{width:SIZE,height:SIZE,alignItems:'center',justifyContent:'center',marginBottom:8},
  ring:{position:'absolute',width:SIZE,height:SIZE,borderRadius:999,borderWidth:2},
  clip:{width:SIZE,height:SIZE,overflow:'hidden'},
  mark:{width:SIZE,height:SIZE},
  glint:{position:'absolute',top:-SIZE/2,width:28,height:SIZE*2,backgroundColor:'rgba(255,255,255,0.55)'},
  name:{fontSize:28,lineHeight:36,fontWeight:'800',letterSpacing:-0.5,color:C.ink},
  line:{fontSize:14,lineHeight:20,color:C.muted},
});
