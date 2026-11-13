import React,{useEffect,useRef,useState} from 'react';
import {Animated,Easing,Pressable,StyleSheet,Text,View} from 'react-native';
import {C} from './styles';
import {T} from './tokens';
import {ANSWER_WINDOW,answerLeft,pinEvent,type PinEvent,type PinState,type PinTone} from './map-motion';
import type {MapPin} from './TileMap';
import {TILE} from './map-math';

// The pins, their events and the radar, shared by both maps of the app: the MapLibre map on a phone (LiveMap.native.tsx)
// and the tile map of the web preview (TileMap.tsx). The map decides where a pin stands; the pin decides how it moves.
// Three round controls on the right edge, centred on the visible part of the map.
export const controlsHeight=3*T.control.touch+2*8;
// When pin boxes meet, one stays visible: the selected one, then an answering or waiting flat, then the cheapest.
export const toneOrder:Record<PinTone,number>={offer:0,booked:0,pending:1,active:1,booking:2,job:3,home:3};
const tones:Record<PinTone,{bg:string;fg:string;line:string}>={home:{bg:C.surface,fg:C.ink,line:C.line},pending:{bg:C.warningSoft,fg:C.warning,line:C.warningLine},offer:{bg:C.accent,fg:C.surface,line:C.accent},job:{bg:C.infoSoft,fg:C.info,line:C.infoLine},booking:{bg:C.accentSoft,fg:C.ink,line:C.accentLine},booked:{bg:C.success,fg:C.surface,line:C.success},active:{bg:C.info,fg:C.surface,line:C.info}};
// The colour of the flash and of the waves an event sends out.
const glow:Record<PinTone,string>={home:C.accentLine,pending:C.warningLine,offer:C.accent,job:C.info,booking:C.accentLine,booked:C.success,active:C.info};
export const FRESH=900,LEAVE=260;

// One pin and what happens to it. A pin knows its last tone and label, so it plays its event once when they change.
// born: when the key first came in the pins (0: it was there before, then it plays nothing on mount).
// x,y: where the pin stands on the screen; without them (inside a map marker) it stands where its parent puts it.
export function Pin({pin,x,y,more,active,still,picking,born,delay,loop,onPress}:{pin:MapPin;x?:number;y?:number;more:number;active:boolean;still:boolean;picking:boolean;born:number;delay:number;loop:Animated.Value;onPress?:()=>void}){
 const tone=pin.tone||'home',colors=tones[tone];
 const entering=useRef(!still&&!!born&&Date.now()-born<=FRESH),enter=useRef(new Animated.Value(entering.current?0:1)).current;
 const pop=useRef(new Animated.Value(0)).current,flash=useRef(new Animated.Value(0)).current,shake=useRef(new Animated.Value(0)).current,lift=useRef(new Animated.Value(active?1:0)).current;
 const [flashTone,setFlashTone]=useState<PinTone>(tone);
 const last=useRef<PinState>({tone,label:pin.label});
 useEffect(()=>{if(entering.current)Animated.spring(enter,{toValue:1,delay,friction:6,tension:90,useNativeDriver:true}).start();},[]);
 useEffect(()=>{
  const event:PinEvent=pinEvent(last.current,{tone,label:pin.label});last.current={tone,label:pin.label};
  if(still||event==='none'||event==='appear')return;
  setFlashTone(tone);
  const bounce=(to:number)=>Animated.sequence([Animated.timing(pop,{toValue:to,duration:140,easing:Easing.out(Easing.quad),useNativeDriver:true}),Animated.spring(pop,{toValue:0,friction:4,tension:120,useNativeDriver:true})]);
  const burst=()=>{flash.setValue(0);return Animated.timing(flash,{toValue:1,duration:700,easing:Easing.out(Easing.cubic),useNativeDriver:true});};
  const wiggle=()=>{shake.setValue(0);return Animated.timing(shake,{toValue:1,duration:420,easing:Easing.linear,useNativeDriver:true});};
  const play={ask:()=>Animated.parallel([wiggle(),bounce(.12)]),answer:()=>Animated.parallel([burst(),bounce(.28)]),celebrate:()=>Animated.parallel([burst(),bounce(.4)]),start:()=>Animated.parallel([burst(),bounce(.16)]),settle:()=>bounce(-.12),update:()=>bounce(.16)}[event];
  play().start();
 },[tone,pin.label,still]);
 useEffect(()=>{if(still){lift.setValue(active?1:0);return;}Animated.spring(lift,{toValue:active?1:0,friction:6,tension:140,useNativeDriver:true}).start();},[active,still]);
 const scale=Animated.add(Animated.add(enter.interpolate({inputRange:[0,1],outputRange:[.4,1]}),pop),lift.interpolate({inputRange:[0,1],outputRange:[0,.08]}));
 const translateY=Animated.add(enter.interpolate({inputRange:[0,1],outputRange:[-18,0]}),lift.interpolate({inputRange:[0,1],outputRange:[0,-4]}));
 const rotate=shake.interpolate({inputRange:[0,.2,.4,.6,.8,1],outputRange:['0deg','-9deg','8deg','-5deg','3deg','0deg']});
 const breathing=tone==='pending'||tone==='active';
 // The time left to answer runs down as a strip under the label, at its real pace; it starts again from the right place after each refresh.
 const left=useRef(new Animated.Value(1)).current,timed=tone==='pending'&&!!pin.until;
 useEffect(()=>{if(!timed)return;const now=Date.now()/1000,share=answerLeft(pin.until!,now);left.setValue(share);if(still||!share)return;const a=Animated.timing(left,{toValue:0,duration:Math.round(share*ANSWER_WINDOW*1000),easing:Easing.linear,useNativeDriver:true});a.start();return()=>a.stop();},[timed,Math.round(pin.until||0),still]);
 return <View pointerEvents="box-none" style={[m.pinWrap,x==null||y==null?m.pinInMarker:{left:x-90,top:y-20},{zIndex:active?3:tone==='offer'||tone==='booked'?2:1}]}>
  {breathing&&!still&&<Animated.View pointerEvents="none" style={[m.ring,{backgroundColor:glow[tone],opacity:loop.interpolate({inputRange:[0,1],outputRange:[tone==='active'?.35:.55,0]}),transform:[{scale:loop.interpolate({inputRange:[0,1],outputRange:[.6,tone==='active'?1.5:1.9]})}]}]}/>}
  {!still&&<Animated.View pointerEvents="none" style={[m.ring,{backgroundColor:glow[flashTone],opacity:flash.interpolate({inputRange:[0,.05,1],outputRange:[0,.6,0]}),transform:[{scale:flash.interpolate({inputRange:[0,1],outputRange:[.5,2.6]})}]}]}/>}
  <Animated.View style={{opacity:enter.interpolate({inputRange:[0,.3,1],outputRange:[0,1,1]}),transform:[{translateY},{scale},{rotate}]}}>
   <Pressable accessibilityRole="button" accessibilityLabel={(pin.title||'Метка')+', '+pin.label+(more?'. Рядом ещё '+more+'. Приблизить':'')} accessibilityState={{selected:active}} disabled={picking||!onPress} onPress={onPress} hitSlop={6} style={[m.pin,{backgroundColor:active?C.ink:colors.bg,borderColor:active?C.ink:colors.line}]}><Text numberOfLines={1} style={[m.pinText,{color:active?C.surface:colors.fg}]}>{pin.label}{more?<Text style={m.pinMore}>{' +'+more}</Text>:null}</Text>{timed&&<View pointerEvents="none" style={m.timeTrack}><Animated.View style={[m.timeFill,{transform:[{scaleX:left}]}]}/></View>}</Pressable>
  </Animated.View>
 </View>;
}
// A pin that has left the map: it melts and sinks, then it is gone.
export function Leaving({pin,x,y}:{pin:MapPin;x?:number;y?:number}){
 const out=useRef(new Animated.Value(0)).current,colors=tones[pin.tone||'home'];
 useEffect(()=>{Animated.timing(out,{toValue:1,duration:LEAVE,easing:Easing.in(Easing.quad),useNativeDriver:true}).start();},[]);
 return <View pointerEvents="none" style={[m.pinWrap,x==null||y==null?m.pinInMarker:{left:x-90,top:y-20}]}>
  <Animated.View style={[m.pin,{backgroundColor:colors.bg,borderColor:colors.line,opacity:out.interpolate({inputRange:[0,1],outputRange:[1,0]}),transform:[{translateY:out.interpolate({inputRange:[0,1],outputRange:[0,8]})},{scale:out.interpolate({inputRange:[0,1],outputRange:[1,.6]})}]}]}><Text numberOfLines={1} style={[m.pinText,{color:colors.fg}]}>{pin.label}</Text></Animated.View>
 </View>;
}
// Radar waves while a search runs: three rings, one after another, from the middle of the visible map.
export function Radar({x,y}:{x:number;y:number}){
 const waves=useRef([0,1,2].map(()=>new Animated.Value(0))).current;
 useEffect(()=>{const loops=waves.map((v,i)=>Animated.loop(Animated.sequence([Animated.delay(i*600),Animated.timing(v,{toValue:1,duration:1800,easing:Easing.out(Easing.quad),useNativeDriver:true}),Animated.timing(v,{toValue:0,duration:0,useNativeDriver:true})])));loops.forEach(l=>l.start());return()=>loops.forEach(l=>l.stop());},[]);
 return <View pointerEvents="none" style={[m.radar,{left:x-120,top:y-120}]}>
  {waves.map((v,i)=><Animated.View key={i} style={[m.wave,{opacity:v.interpolate({inputRange:[0,.15,1],outputRange:[0,.5,0]}),transform:[{scale:v.interpolate({inputRange:[0,1],outputRange:[.1,1]})}]}]}/>)}
  <View style={m.radarDot}/>
 </View>;
}

export const m=StyleSheet.create({
 host:{flex:1,backgroundColor:C.line,overflow:'hidden'},tile:{position:'absolute',width:TILE,height:TILE},
 pinWrap:{position:'absolute',width:180,height:40,alignItems:'center',justifyContent:'center'},pinInMarker:{position:'relative'},
 pin:{minHeight:32,minWidth:44,paddingHorizontal:12,borderRadius:16,borderWidth:1,alignItems:'center',justifyContent:'center',shadowColor:C.ink,shadowOffset:{width:0,height:2},shadowOpacity:.18,shadowRadius:5,elevation:3},
 pinText:{fontSize:14,fontWeight:'600'},timeTrack:{position:'absolute',left:8,right:8,bottom:3,height:3,borderRadius:2,backgroundColor:C.warningLine,overflow:'hidden'},timeFill:{flex:1,backgroundColor:C.warning,transformOrigin:'left'},pinMore:{fontWeight:'500',opacity:.7},ring:{position:'absolute',width:56,height:56,borderRadius:999},
 radar:{position:'absolute',width:240,height:240,alignItems:'center',justifyContent:'center'},wave:{position:'absolute',width:240,height:240,borderRadius:999,borderWidth:2,borderColor:C.accent,backgroundColor:C.accentSoft},radarDot:{width:12,height:12,borderRadius:8,backgroundColor:C.accent,borderWidth:2,borderColor:C.surface},
 cross:{position:'absolute',width:56,height:56,alignItems:'center',justifyContent:'flex-end'},landing:{position:'absolute',bottom:-12,width:56,height:24,borderRadius:999,borderWidth:2,borderColor:C.accent},crossShadow:{position:'absolute',bottom:-3,width:14,height:6,borderRadius:999,backgroundColor:C.ink},
 crossHead:{width:24,height:24,borderRadius:12,backgroundColor:C.accent,borderWidth:4,borderColor:C.surface},crossStem:{width:3,height:10,backgroundColor:C.accent},
 controls:{position:'absolute',right:12,gap:8},control:{width:44,height:44,borderRadius:T.radius.full,backgroundColor:C.surface,borderWidth:1,borderColor:C.line,alignItems:'center',justifyContent:'center',shadowColor:C.ink,shadowOffset:{width:0,height:2},shadowOpacity:.12,shadowRadius:8,elevation:3},controlIcon:{width:20,height:20,tintColor:C.ink},
 credit:{position:'absolute',left:8,fontSize:12,color:C.inkSoft,backgroundColor:C.glass,paddingHorizontal:4,borderRadius:4}
});
