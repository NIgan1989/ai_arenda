import React,{useEffect,useRef,useState} from 'react';
import {Animated,Easing,Pressable,StyleSheet,Text,View} from 'react-native';
import {C} from './styles';
import {T} from './tokens';
import {ANSWER_WINDOW,answerLeft,beamBox,pinEvent,type BeamTone,type PinEvent,type PinState,type PinTone} from './map-motion';
import type {MapPin} from './TileMap';
import {TILE,pinWidth} from './map-math';
import {AI_SAYS,AI_WINDOW} from '../../lib/ai-move-marks';

// The pins, their events and the radar, shared by both maps of the app: the MapLibre map on a phone (LiveMap.native.tsx)
// and the tile map of the web preview (TileMap.tsx). The map decides where a pin stands; the pin decides how it moves.
// Three round controls on the right edge, centred on the visible part of the map.
export const controlsHeight=3*T.control.touch+2*8;
// When pin boxes meet, one stays visible: the selected one, then an answering or waiting flat, then the AI's best choice, then the cheapest.
export const toneOrder:Record<PinTone,number>={offer:0,booked:0,pending:1,active:1,booking:2,job:3,home:3};
const tones:Record<PinTone,{bg:string;fg:string;line:string}>={home:{bg:C.surface,fg:C.ink,line:C.line},pending:{bg:C.warningSoft,fg:C.warning,line:C.warningLine},offer:{bg:C.accent,fg:C.surface,line:C.accent},job:{bg:C.infoSoft,fg:C.info,line:C.infoLine},booking:{bg:C.accentSoft,fg:C.ink,line:C.accentLine},booked:{bg:C.success,fg:C.surface,line:C.success},active:{bg:C.info,fg:C.surface,line:C.info}};
// The colour of the flash and of the waves an event sends out.
const glow:Record<PinTone,string>={home:C.accentLine,pending:C.warningLine,offer:C.accent,job:C.info,booking:C.accentLine,booked:C.success,active:C.info};
// ECHO_DELAY: a pin that changed while the person was away waits for the page to turn into the map before it plays.
export const FRESH=900,LEAVE=260,ECHO_DELAY=450;
// The AI's own work plays once per move: a pin remembers which move it has shown, even when the map is built again.
const aiShown=new Map<string,number>();
export const AI_PLAY=2600;

// One pin and what happens to it. A pin knows its last tone and label, so it plays its event once when they change.
// born: when the key first came in the pins (0: it was there before, then it plays nothing on mount).
// x,y: where the pin stands on the screen; without them (inside a map marker) it stands where its parent puts it.
export function Pin({pin,x,y,more,active,still,picking,born,delay,loop,onPress}:{pin:MapPin;x?:number;y?:number;more:number;active:boolean;still:boolean;picking:boolean;born:number;delay:number;loop:Animated.Value;onPress?:()=>void}){
 const tone=pin.tone||'home',colors=tones[tone],best=!!pin.best;
 const entering=useRef(!still&&!!born&&Date.now()-born<=FRESH),enter=useRef(new Animated.Value(entering.current?0:1)).current;
 const pop=useRef(new Animated.Value(0)).current,flash=useRef(new Animated.Value(0)).current,flash2=useRef(new Animated.Value(0)).current,shake=useRef(new Animated.Value(0)).current,ping=useRef(new Animated.Value(0)).current,lift=useRef(new Animated.Value(active?1:0)).current;
 const [flashTone,setFlashTone]=useState<PinTone>(tone);
 // While the map has just come back (map-memory.ts ECHO_WINDOW), a change against how the pin looked when the person left
 // carries pin.was too: a stale first answer that is then refreshed still echoes.
 // A pin that comes back changed (pin.was, map-memory.ts) starts from how it looked then and plays the change once the
 // page has turned into the map, with a flash, so the person sees where the thing they did elsewhere happened.
 const last=useRef<PinState>(pin.was||{tone,label:pin.label}),echo=useRef(!!pin.was);
 useEffect(()=>{if(entering.current)Animated.spring(enter,{toValue:1,delay,friction:6,tension:90,useNativeDriver:true}).start();},[]);
 useEffect(()=>{
  const event:PinEvent=pinEvent(last.current,{tone,label:pin.label}),echoed=echo.current||!!pin.was;last.current={tone,label:pin.label};echo.current=false;
  if(still||event==='none'||event==='appear')return;
  setFlashTone(tone);
  const bounce=(to:number)=>Animated.sequence([Animated.timing(pop,{toValue:to,duration:140,easing:Easing.out(Easing.quad),useNativeDriver:true}),Animated.spring(pop,{toValue:0,friction:4,tension:120,useNativeDriver:true})]);
  const burst=()=>{flash.setValue(0);return Animated.timing(flash,{toValue:1,duration:700,easing:Easing.out(Easing.cubic),useNativeDriver:true});};
  const wiggle=()=>{shake.setValue(0);return Animated.timing(shake,{toValue:1,duration:420,easing:Easing.linear,useNativeDriver:true});};
  const play={ask:()=>Animated.parallel([wiggle(),bounce(.12)]),answer:()=>Animated.parallel([burst(),bounce(.28)]),celebrate:()=>{flash2.setValue(0);return Animated.parallel([burst(),bounce(.4),Animated.timing(flash2,{toValue:1,delay:240,duration:900,easing:Easing.out(Easing.cubic),useNativeDriver:true})]);},start:()=>Animated.parallel([burst(),bounce(.16)]),settle:()=>bounce(-.12),update:()=>bounce(.16)}[event];
  if(!echoed){play().start();return;}
  // The echo: two wide waves of the accent colour go out from the pin while it plays its change.
  const wave=()=>Animated.sequence([Animated.timing(ping,{toValue:0,duration:0,useNativeDriver:true}),Animated.timing(ping,{toValue:1,duration:900,easing:Easing.out(Easing.quad),useNativeDriver:true})]);
  Animated.sequence([Animated.delay(ECHO_DELAY),Animated.parallel([play(),Animated.sequence([wave(),wave()])])]).start();
 },[tone,pin.label,still]);
 // The sign of the AI: a ring in its colour goes round the pin and a short line lifts above it, then both fade.
 // It plays once for each move the AI made (pin.ai), right after the pin's own event.
 const ai=useRef(new Animated.Value(0)).current,[aiText,setAiText]=useState('');
 useEffect(()=>{
  const move=pin.ai;if(!move||still||aiShown.get(pin.key)===move.at)return;
  aiShown.set(pin.key,move.at);if(Date.now()/1000-move.at>AI_WINDOW)return;
  setAiText(AI_SAYS[move.move]);ai.setValue(0);
  const run=Animated.timing(ai,{toValue:1,duration:AI_PLAY,delay:(pin.was?ECHO_DELAY:0)+260,easing:Easing.linear,useNativeDriver:true});
  run.start(({finished})=>{if(finished)setAiText('');});return()=>run.stop();
 },[pin.ai?.at,pin.ai?.move,still]);
 useEffect(()=>{if(still){lift.setValue(active?1:0);return;}Animated.spring(lift,{toValue:active?1:0,friction:6,tension:140,useNativeDriver:true}).start();},[active,still]);
 const scale=Animated.add(Animated.add(enter.interpolate({inputRange:[0,1],outputRange:[.4,1]}),pop),lift.interpolate({inputRange:[0,1],outputRange:[0,.08]}));
 const translateY=Animated.add(enter.interpolate({inputRange:[0,1],outputRange:[-18,0]}),lift.interpolate({inputRange:[0,1],outputRange:[0,-4]}));
 const rotate=shake.interpolate({inputRange:[0,.2,.4,.6,.8,1],outputRange:['0deg','-9deg','8deg','-5deg','3deg','0deg']});
 const breathing=tone==='pending'||tone==='active';
 // The time left to answer runs down as a strip under the label, at its real pace; it starts again from the right place after each refresh.
 const left=useRef(new Animated.Value(1)).current,timed=tone==='pending'&&!!pin.until;
 useEffect(()=>{if(!timed)return;const now=Date.now()/1000,share=answerLeft(pin.until!,now);left.setValue(share);if(still||!share)return;const a=Animated.timing(left,{toValue:0,duration:Math.round(share*ANSWER_WINDOW*1000),easing:Easing.linear,useNativeDriver:true});a.start();return()=>a.stop();},[timed,Math.round(pin.until||0),still]);
 // A cleaning under way fills its strip towards the deadline; each refresh moves it on smoothly.
 const done=useRef(new Animated.Value(pin.progress??0)).current,filling=pin.progress!=null;
 useEffect(()=>{if(!filling)return;if(still){done.setValue(pin.progress!);return;}Animated.timing(done,{toValue:pin.progress!,duration:600,easing:Easing.out(Easing.quad),useNativeDriver:true}).start();},[filling,pin.progress,still]);
 return <View pointerEvents="box-none" style={[m.pinWrap,x==null||y==null?m.pinInMarker:{left:x-90,top:y-20},{zIndex:active?3:tone==='offer'||tone==='booked'?2:1}]}>
  {breathing&&!still&&<Animated.View pointerEvents="none" style={[m.ring,{backgroundColor:glow[tone],opacity:loop.interpolate({inputRange:[0,1],outputRange:[tone==='active'?.35:.55,0]}),transform:[{scale:loop.interpolate({inputRange:[0,1],outputRange:[.6,tone==='active'?1.5:1.9]})}]}]}/>}
  {!still&&<Animated.View pointerEvents="none" style={[m.ring,m.echo,{opacity:ping.interpolate({inputRange:[0,.08,.7,1],outputRange:[0,1,.5,0]}),transform:[{scale:ping.interpolate({inputRange:[0,1],outputRange:[.8,2.8]})}]}]}/>}
  {!still&&<Animated.View pointerEvents="none" style={[m.ring,{backgroundColor:glow[flashTone],opacity:flash.interpolate({inputRange:[0,.05,1],outputRange:[0,.6,0]}),transform:[{scale:flash.interpolate({inputRange:[0,1],outputRange:[.5,2.6]})}]}]}/>}
  {!still&&tone==='booked'&&<Animated.View pointerEvents="none" style={[m.ring,m.wave2,{opacity:flash2.interpolate({inputRange:[0,.05,1],outputRange:[0,.8,0]}),transform:[{scale:flash2.interpolate({inputRange:[0,1],outputRange:[.6,3.4]})}]}]}/>}
  {!!aiText&&<Animated.View pointerEvents="none" style={[m.aiRing,{width:pinWidth(pin.label)+(pin.order?22:0)+12,opacity:ai.interpolate({inputRange:[0,.08,.7,1],outputRange:[0,1,.9,0]}),transform:[{scale:ai.interpolate({inputRange:[0,.25,1],outputRange:[.92,1.06,1.14]})}]}]}/>}
  {!!aiText&&<Animated.View pointerEvents="none" accessibilityLiveRegion="polite" style={[m.aiSays,{opacity:ai.interpolate({inputRange:[0,.1,.75,1],outputRange:[0,1,1,0]}),transform:[{translateY:ai.interpolate({inputRange:[0,.1,1],outputRange:[6,0,-8]})}]}]}><Text style={m.aiSaysText} numberOfLines={1}>✦ {aiText}</Text></Animated.View>}
  <Animated.View style={{opacity:enter.interpolate({inputRange:[0,.3,1],outputRange:[0,1,1]}),transform:[{translateY},{scale},{rotate}]}}>
   <View style={best?m.bestRing:null}><Pressable accessibilityRole="button" accessibilityLabel={(pin.order?'Остановка '+pin.order+'. ':'')+(pin.title||'Метка')+', '+pin.label+(filling?', прошло '+Math.round(pin.progress!*100)+'% времени':'')+(best?', лучший выбор для вас':'')+(more?'. Рядом ещё '+more+'. Приблизить':'')} accessibilityState={{selected:active}} disabled={picking||!onPress} onPress={onPress} hitSlop={6} style={[m.pin,{backgroundColor:active?C.ink:colors.bg,borderColor:active?C.ink:best?C.aiFrom:colors.line},best&&m.bestPin,!!pin.order&&m.pinOrdered]}>{!!pin.order&&<View style={[m.order,{backgroundColor:active?C.surface:colors.fg}]}><Text style={[m.orderText,{color:active?C.ink:colors.bg}]}>{pin.order}</Text></View>}<Text numberOfLines={1} style={[m.pinText,{color:active?C.surface:colors.fg}]}>{best?<Text style={{color:active?C.aiTo:C.aiFrom}}>✦ </Text>:null}{pin.label}{more?<Text style={m.pinMore}>{' +'+more}</Text>:null}</Text>{timed&&<View pointerEvents="none" style={m.timeTrack}><Animated.View style={[m.timeFill,{transform:[{scaleX:left}]}]}/></View>}{filling&&<View pointerEvents="none" style={[m.timeTrack,m.workTrack]}><Animated.View style={[m.timeFill,m.workFill,{transform:[{scaleX:done}]}]}/></View>}</Pressable></View>
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
// A beam of the web preview map: a line from the guest's search point to an asked flat, drawn out from the point.
// On a phone the beams are a line layer of MapLibre (LiveMap.native.tsx); both use the same colours.
export const BEAM={ask:C.warning,answer:C.accent,route:C.info,nav:C.accent,casing:C.surface};
export function Beam({a,b,tone,still}:{a:{x:number;y:number};b:{x:number;y:number};tone:BeamTone;still:boolean}){
 const grow=useRef(new Animated.Value(still?1:0)).current,box=beamBox(a,b);
 useEffect(()=>{if(!still)Animated.timing(grow,{toValue:1,duration:700,easing:Easing.out(Easing.cubic),useNativeDriver:true}).start();},[]);
 return <View pointerEvents="none" style={[m.beam,{left:box.cx-box.length/2,top:box.cy-1,width:box.length,transform:[{rotate:box.angle+'deg'}]}]}>
  <Animated.View style={[tone==='ask'?m.beamAsk:tone==='route'?m.beamRoute:tone==='nav'?m.beamNav:m.beamAnswer,{transformOrigin:'left',transform:[{scaleX:grow}]}]}/>
 </View>;
}
// The guest's search point, where the beams start.
export function Origin({x,y}:{x?:number;y?:number}){
 return <View pointerEvents="none" style={[m.origin,x==null||y==null?m.pinInMarker:{left:x-11,top:y-11}]}><View style={m.radarDot}/></View>;
}
// Demand on the web preview map: a soft spot, larger and stronger where guests ask and book more.
// On a phone it is a heatmap layer of MapLibre (LiveMap.native.tsx) in the same colours.
export const HEAT=['rgba(99,102,241,0)','rgba(99,102,241,0.30)','rgba(6,182,212,0.45)','rgba(245,158,11,0.55)'] as const;
export function HeatBlob({x,y,weight}:{x:number;y:number;weight:number}){
 const w=Math.max(0,Math.min(1,weight)),r=Math.round(48+72*w);
 return <View pointerEvents="none" style={[m.heat,{left:x-r,top:y-r,width:2*r,height:2*r,borderRadius:r,backgroundColor:w>.66?HEAT[3]:w>.33?HEAT[2]:HEAT[1],opacity:.35+.5*w},{filter:'blur('+Math.round(r/3)+'px)'} as object]}/>;
}
// A guest asking right now: a small spark that flares and fades, again and again, while they are asking.
export function Spark({x,y,delay=0}:{x?:number;y?:number;delay?:number}){
 const v=useRef(new Animated.Value(0)).current;
 useEffect(()=>{const l=Animated.loop(Animated.sequence([Animated.delay(delay),Animated.timing(v,{toValue:1,duration:1400,easing:Easing.out(Easing.quad),useNativeDriver:true}),Animated.timing(v,{toValue:0,duration:0,useNativeDriver:true}),Animated.delay(600)]));l.start();return()=>l.stop();},[]);
 return <View pointerEvents="none" style={[m.spark,x==null||y==null?m.pinInMarker:{left:x-16,top:y-16}]}>
  <Animated.View style={[m.sparkRing,{opacity:v.interpolate({inputRange:[0,.1,1],outputRange:[0,.9,0]}),transform:[{scale:v.interpolate({inputRange:[0,1],outputRange:[.3,1.6]})}]}]}/>
  <View style={m.sparkDot}/>
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
 pin:{minHeight:32,minWidth:44,paddingHorizontal:12,borderRadius:16,borderWidth:1,flexDirection:'row',gap:4,alignItems:'center',justifyContent:'center',shadowColor:C.ink,shadowOffset:{width:0,height:2},shadowOpacity:.18,shadowRadius:5,elevation:3},
 pinText:{fontSize:14,fontWeight:'600'},aiRing:{position:'absolute',height:44,borderRadius:24,borderWidth:3,borderColor:C.aiFrom,shadowColor:C.aiTo,shadowOpacity:.6,shadowRadius:8,shadowOffset:{width:0,height:0}},aiSays:{position:'absolute',top:-26,paddingHorizontal:8,height:22,borderRadius:12,backgroundColor:C.aiFrom,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:C.aiTo},aiSaysText:{color:C.surface,fontSize:12,fontWeight:'700'},bestRing:{padding:2,borderRadius:16,backgroundColor:C.aiTo,shadowColor:C.ink,shadowOffset:{width:0,height:2},shadowOpacity:.18,shadowRadius:5,elevation:3},bestPin:{borderWidth:2,minHeight:30,shadowOpacity:0,elevation:0},wave2:{borderWidth:3,borderColor:C.success,backgroundColor:'transparent'},timeTrack:{position:'absolute',left:8,right:8,bottom:3,height:3,borderRadius:2,backgroundColor:C.warningLine,overflow:'hidden'},timeFill:{flex:1,backgroundColor:C.warning,transformOrigin:'left'},pinMore:{fontWeight:'500',opacity:.7},pinOrdered:{paddingLeft:4},order:{width:24,height:24,borderRadius:12,alignItems:'center',justifyContent:'center'},orderText:{fontSize:12,fontWeight:'700'},workTrack:{backgroundColor:'rgba(255,255,255,0.35)'},workFill:{backgroundColor:C.surface},ring:{position:'absolute',width:56,height:56,borderRadius:999},echo:{borderWidth:3,borderColor:C.accent,backgroundColor:C.accentSoft},
 beam:{position:'absolute',height:2,justifyContent:'center'},beamAsk:{height:0,borderTopWidth:2,borderStyle:'dashed',borderColor:C.warning},beamAnswer:{height:2,borderRadius:1,backgroundColor:C.accent},beamRoute:{height:4,borderRadius:2,backgroundColor:C.info,opacity:.7},beamNav:{height:6,borderRadius:4,backgroundColor:C.accent,borderWidth:1,borderColor:C.surface},
 heat:{position:'absolute'},spark:{position:'absolute',width:32,height:32,alignItems:'center',justifyContent:'center'},sparkRing:{position:'absolute',width:32,height:32,borderRadius:16,borderWidth:2,borderColor:C.aiTo},sparkDot:{width:8,height:8,borderRadius:4,backgroundColor:C.aiTo},
 origin:{position:'absolute',width:22,height:22,borderRadius:12,backgroundColor:C.accentSoft,alignItems:'center',justifyContent:'center'},
 radar:{position:'absolute',width:240,height:240,alignItems:'center',justifyContent:'center'},wave:{position:'absolute',width:240,height:240,borderRadius:999,borderWidth:2,borderColor:C.accent,backgroundColor:C.accentSoft},radarDot:{width:12,height:12,borderRadius:8,backgroundColor:C.accent,borderWidth:2,borderColor:C.surface},
 cross:{position:'absolute',width:56,height:56,alignItems:'center',justifyContent:'flex-end'},landing:{position:'absolute',bottom:-12,width:56,height:24,borderRadius:999,borderWidth:2,borderColor:C.accent},crossShadow:{position:'absolute',bottom:-3,width:14,height:6,borderRadius:999,backgroundColor:C.ink},
 crossHead:{width:24,height:24,borderRadius:12,backgroundColor:C.accent,borderWidth:4,borderColor:C.surface},crossStem:{width:3,height:10,backgroundColor:C.accent},
 controls:{position:'absolute',right:12,gap:8},control:{width:44,height:44,borderRadius:T.radius.full,backgroundColor:C.surface,borderWidth:1,borderColor:C.line,alignItems:'center',justifyContent:'center',shadowColor:C.ink,shadowOffset:{width:0,height:2},shadowOpacity:.12,shadowRadius:8,elevation:3},controlIcon:{width:20,height:20,tintColor:C.ink},
 credit:{position:'absolute',left:8,fontSize:12,color:C.inkSoft,backgroundColor:C.glass,paddingHorizontal:4,borderRadius:4}
});
