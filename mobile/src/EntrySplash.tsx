import React,{useEffect,useState,useSyncExternalStore} from 'react';
import {AccessibilityInfo,Animated,Easing,Image,Platform,StatusBar,StyleSheet,useWindowDimensions,View} from 'react-native';
import {BRAND_LINE,BRAND_NAME,DOME_RAYS,DOME_RAY_FROM,DOME_RAY_STROKE,DOME_RAY_TO,DOME_RING,DOME_STROKE} from '../../lib/brand';
import {entryUncovered,isEntryCovered,isEntryReady,subscribeLoading} from './loading';
import {C} from './styles';

// The layers of the sign, drawn by scripts/build-brand-assets.mjs from the same drawing as the site's (lib/brand.ts).
const ringImage=require('../assets/brand/dome-ring.png'),barsUpright=require('../assets/brand/dome-bars-v.png'),barsLevel=require('../assets/brand/dome-bars-h.png');
const glowImage=require('../assets/brand/glow.png'),nameImage=require('../assets/brand/wordmark-night.png');
// The story is meant to be watched, not glimpsed: about three and a half seconds before the screen opens.
const SIZE=160,HALF=SIZE/2,U=SIZE/100,MIN_STORY=3400,MAX_WAIT=7500;
// The window is the inside of the ring: its edge runs along the middle of the ring's line.
const WINDOW=DOME_RING*U,RIM=(DOME_RING+DOME_STROKE/2)*U,GLOW=560,GLINT=36;
const RAY_LONG=(DOME_RAY_TO-DOME_RAY_FROM)*U,RAY_WIDE=DOME_RAY_STROKE*U,RAY_STEP=26,RAY_FADE=400,RAYS_TIME=(DOME_RAYS-1)*RAY_STEP+RAY_FADE;
const RAYS=Array.from({length:DOME_RAYS},(_,i)=>i);
// A bar is drawn from where it starts to where it ends, with a little room for its round ends.
const BAR_FROM=14*U,BAR_TO=86*U,BAR_STARTS=[750,870,1050,1170];
const PEN=Easing.bezier(.65,0,.35,1),SOFT=Easing.bezier(.2,.7,.2,1),OPENING=Easing.bezier(.62,0,.3,1);
const native=Platform.OS!=='web';

const values=()=>({
  glow:new Animated.Value(0),drift:new Animated.Value(0),ring:new Animated.Value(0),bars:BAR_STARTS.map(()=>new Animated.Value(0)),
  rays:new Animated.Value(0),spread:new Animated.Value(0),glint:new Animated.Value(0),name:new Animated.Value(0),line:new Animated.Value(0),
  // What the opening takes away: the lid of the window, the words, the glow, the bars, the sign itself; and the plain fade for calm motion.
  lid:new Animated.Value(1),words:new Animated.Value(1),halo:new Animated.Value(1),lattice:new Animated.Value(1),sign:new Animated.Value(1),open:new Animated.Value(0),fade:new Animated.Value(1),
});

// The status bar belongs to whatever is on the screen: light signs over the night plate, dark ones over the app.
export function EntryStatusBar(){
  const covered=useSyncExternalStore(subscribeLoading,isEntryCovered,isEntryCovered);
  return <StatusBar barStyle={covered?'light-content':'dark-content'} backgroundColor={covered?C.night:C.bg}/>;
}

// The entry story on every cold start, the same as on the site (components/entry-splash.tsx), on the night-blue plate:
//   1. the шаңырақ, the crown of a yurt, is put together line by line — the ring is drawn, the four bars cross it;
//   2. the roof poles spread around it as gold rays, and a light runs once round the ring;
//   3. the name comes up under it, then the line «Жильё на часы и сутки»;
//   4. the crown opens: its ring becomes a window, and the window widens until the whole screen is in it.
// It waits for the first data (so the map is ready under it), but never longer than a few seconds.
// There is no vector drawing in the app, so the sign is made of pictures behind moving windows, and the plate with its
// window is one ring with a very wide border. Everything moves by transform and opacity only, so it stays smooth while the app is still starting.
export function EntrySplash(){
  const [gone,setGone]=useState(false),[opening,setOpening]=useState(false);
  const [a]=useState(values);
  const {width,height}=useWindowDimensions();
  useEffect(()=>{
    let alive=true,calm=false,storyDone=false,left=false;
    const started=Date.now(),timers:ReturnType<typeof setTimeout>[]=[];
    const to=(value:Animated.Value,toValue:number,duration:number,delay=0,easing:(t:number)=>number=Easing.inOut(Easing.quad))=>Animated.timing(value,{toValue,duration,delay,easing,useNativeDriver:native});
    const exit=()=>{
      if(left||!alive)return;left=true;setOpening(true);
      if(calm){entryUncovered();to(a.fade,0,160).start(()=>{if(alive)setGone(true);});return;}
      // The status bar changes when the window reaches the top of the screen.
      timers.push(setTimeout(entryUncovered,600));
      Animated.parallel([
        to(a.words,0,220),to(a.halo,0,300),to(a.lattice,0,200),to(a.lid,0,240),
        to(a.open,1,950,140,OPENING),to(a.sign,0,550,300),
      ]).start(()=>{if(alive)setGone(true);});
    };
    const maybeExit=()=>{if(storyDone&&isEntryReady())exit();};
    const unsubscribe=subscribeLoading(maybeExit);
    timers.push(setTimeout(exit,MAX_WAIT));
    AccessibilityInfo.isReduceMotionEnabled().catch(()=>false).then(reduced=>{
      if(!alive)return;calm=!!reduced;
      if(calm){[a.glow,a.drift,a.ring,...a.bars,a.rays,a.spread,a.name,a.line].forEach(value=>value.setValue(1));timers.push(setTimeout(()=>{storyDone=true;maybeExit();},450));return;}
      Animated.parallel([
        to(a.glow,1,1440,0,Easing.out(Easing.quad)),to(a.drift,1,3600,0,Easing.out(Easing.quad)),
        to(a.ring,1,900,150,PEN),...a.bars.map((bar,i)=>to(bar,1,600,BAR_STARTS[i],PEN)),
        to(a.spread,1,1500,1400,SOFT),to(a.rays,1,RAYS_TIME,1400,Easing.linear),
        to(a.glint,1,1100,2100,Easing.bezier(.4,0,.2,1)),
        to(a.name,1,700,1900,SOFT),to(a.line,1,700,2250,SOFT),
      ]).start();
      timers.push(setTimeout(()=>{storyDone=true;maybeExit();},Math.max(0,MIN_STORY-(Date.now()-started))));
    });
    return()=>{alive=false;unsubscribe();timers.forEach(clearTimeout);};
  },[a]);
  if(gone)return null;
  // The plate reaches from the sign to the farthest corner of the screen, with room to spare; opened, its window does.
  const reach=Math.ceil(Math.hypot(width/2,height/2+SIZE))+8;
  const plate={left:HALF-reach,top:HALF-reach,width:reach*2,height:reach*2,borderRadius:reach,borderWidth:reach-WINDOW};
  const grow=(from:number,till:number)=>a.open.interpolate({inputRange:[0,1],outputRange:[from,till]});
  const up=(value:Animated.Value)=>({opacity:value,transform:[{translateY:value.interpolate({inputRange:[0,1],outputRange:[12,0]})}]});
  return <Animated.View pointerEvents={opening?'none':'auto'} accessibilityLabel={BRAND_NAME} accessibilityRole="image" style={[st.screen,{opacity:a.fade}]}>
    <EntryStatusBar/>
    <View style={st.stage}>
      <View style={st.sign}>
        <Animated.View style={[st.lid,{opacity:a.lid}]}/>
        <Animated.View style={[st.plate,plate,{transform:[{scale:grow(1,reach/WINDOW*1.06)}]}]}/>
        <Animated.Image source={glowImage} style={[st.glow,{opacity:Animated.multiply(a.glow.interpolate({inputRange:[0,1],outputRange:[0,.85]}),a.halo),transform:[{scale:a.drift.interpolate({inputRange:[0,1],outputRange:[.8,1.06]})}]}]}/>
        <Animated.View style={[st.box,{opacity:a.sign,transform:[{scale:grow(1,2.4)}]}]}>
          <Animated.View style={[st.box,{transform:[{rotate:a.spread.interpolate({inputRange:[0,1],outputRange:['-14deg','0deg']})},{scale:a.spread.interpolate({inputRange:[0,1],outputRange:[.84,1]})}]}]}>
            {RAYS.map(i=><View key={i} style={[st.box,{transform:[{rotate:`${i*360/DOME_RAYS}deg`}]}]}>
              <Animated.View style={[st.ray,{opacity:a.rays.interpolate({inputRange:[i*RAY_STEP/RAYS_TIME,(i*RAY_STEP+RAY_FADE)/RAYS_TIME],outputRange:[0,1],extrapolate:'clamp'})}]}/>
            </View>)}
          </Animated.View>
          <Sweep value={a.ring}/>
          <Animated.View style={[st.box,{opacity:a.lattice}]}>
            <Stroke value={a.bars[0]} image={barsUpright}/>
            <Stroke value={a.bars[1]} image={barsUpright} second/>
            <Stroke value={a.bars[2]} image={barsLevel} level/>
            <Stroke value={a.bars[3]} image={barsLevel} level second/>
          </Animated.View>
          <Animated.View style={[st.box,{opacity:a.glint.interpolate({inputRange:[0,.15,.85,1],outputRange:[0,.9,.9,0]}),transform:[{rotate:a.glint.interpolate({inputRange:[0,1],outputRange:['0deg','360deg']})}]}]}>
            <View style={st.glintWindow}><View style={st.glintArc}/></View>
          </Animated.View>
        </Animated.View>
      </View>
      <Animated.View style={[st.words,{opacity:a.words,transform:[{translateY:a.words.interpolate({inputRange:[0,1],outputRange:[8,0]})}]}]}>
        <Animated.Image source={nameImage} style={[st.name,up(a.name)]}/>
        <Animated.Text style={[st.line,up(a.line)]}>{BRAND_LINE}</Animated.Text>
      </Animated.View>
    </View>
  </Animated.View>;
}

// The ring is drawn in one turn from the top: a window turns into the right half of the sign, then another into the left,
// and the ring under each window turns back by as much, so it stays where it is.
function Sweep({value}:{value:Animated.Value}){
  const turn=(from:number,till:number,back?:boolean)=>({transform:[{rotate:value.interpolate({inputRange:[from,till],outputRange:['0deg',back?'-180deg':'180deg'],extrapolate:'clamp'})}]});
  return <>
    <View style={st.rightHalf}>
      <Animated.View style={[st.box,st.pullLeft,turn(0,.5)]}>
        <View style={st.leftHalf}><Animated.View style={[st.box,turn(0,.5,true)]}><Image source={ringImage} style={st.box}/></Animated.View></View>
      </Animated.View>
    </View>
    <View style={st.leftHalf}>
      <Animated.View style={[st.box,turn(.5,1)]}>
        <View style={st.rightHalf}><Animated.View style={[st.box,st.pullLeft,turn(.5,1,true)]}><Image source={ringImage} style={st.box}/></Animated.View></View>
      </Animated.View>
    </View>
  </>;
}

// One bar of the crown is drawn from its start: a window slides over its half of the sign while the picture under it stays still.
// An upright bar is drawn downwards, a level one to the right; `second` is the bar in the right or the lower half.
function Stroke({value,image,level,second}:{value:Animated.Value;image:number;level?:boolean;second?:boolean}){
  const slide=(from:number,till:number)=>{const shift=value.interpolate({inputRange:[0,1],outputRange:[from,till]});return{transform:[level?{translateX:shift}:{translateY:shift}]};};
  return <View style={level?(second?st.lowerHalf:st.upperHalf):(second?st.rightHalf:st.leftHalf)}>
    <Animated.View style={[level?st.upperHalf:st.leftHalf,slide(BAR_FROM-SIZE,BAR_TO-SIZE)]}>
      <Animated.View style={[st.box,second&&(level?st.pullUp:st.pullLeft),slide(SIZE-BAR_FROM,SIZE-BAR_TO)]}><Image source={image} style={st.box}/></Animated.View>
    </Animated.View>
  </View>;
}

const st=StyleSheet.create({
  screen:{position:'absolute',top:0,left:0,right:0,bottom:0,zIndex:2000,elevation:2000,alignItems:'center',justifyContent:'center',overflow:'hidden'},
  stage:{alignItems:'center',gap:4,padding:24},
  sign:{width:SIZE,height:SIZE},
  // The lid lies under the plate and is a little wider than the window, so no seam shows between them.
  lid:{position:'absolute',left:HALF-WINDOW-1,top:HALF-WINDOW-1,width:WINDOW*2+2,height:WINDOW*2+2,borderRadius:WINDOW+1,backgroundColor:C.night},
  plate:{position:'absolute',borderColor:C.night},
  glow:{position:'absolute',left:HALF-GLOW/2,top:HALF-GLOW/2,width:GLOW,height:GLOW},
  box:{position:'absolute',left:0,top:0,width:SIZE,height:SIZE},
  pullLeft:{left:-HALF},pullUp:{top:-HALF},
  leftHalf:{position:'absolute',left:0,top:0,width:HALF,height:SIZE,overflow:'hidden'},
  rightHalf:{position:'absolute',left:HALF,top:0,width:HALF,height:SIZE,overflow:'hidden'},
  upperHalf:{position:'absolute',left:0,top:0,width:SIZE,height:HALF,overflow:'hidden'},
  lowerHalf:{position:'absolute',left:0,top:HALF,width:SIZE,height:HALF,overflow:'hidden'},
  ray:{position:'absolute',left:HALF-RAY_WIDE/2,top:HALF-DOME_RAY_TO*U,width:RAY_WIDE,height:RAY_LONG,borderRadius:RAY_WIDE/2,backgroundColor:C.gold},
  // The light on the ring: a short piece of a white ring seen through a small window at the top.
  glintWindow:{position:'absolute',left:HALF-GLINT/2,top:HALF-RIM-1,width:GLINT,height:DOME_STROKE*U*2,overflow:'hidden'},
  glintArc:{position:'absolute',left:GLINT/2-RIM,top:1,width:RIM*2,height:RIM*2,borderRadius:RIM,borderWidth:DOME_STROKE*U,borderColor:C.onAccent},
  words:{alignItems:'center',gap:4},
  name:{width:240,height:64},
  line:{fontSize:14,lineHeight:20,letterSpacing:.1,color:'rgba(255,255,255,.76)'},
});
