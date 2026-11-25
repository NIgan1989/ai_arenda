import {t} from '../../lib/i18n';
import React,{useEffect,useRef,useState} from 'react';
import {Animated,Easing,Image,Pressable,StyleSheet,Text,View} from 'react-native';
import {C} from './styles';
import {T} from './tokens';
import {ANSWER_WINDOW,answerLeft,beamBox,pinEvent,type BeamTone,type PinEvent,type PinState,type PinTone} from './map-motion';
import type {MapPin} from './TileMap';
import {TILE,pinBoxWidth} from './map-math';
import {AI_SAYS,AI_WINDOW,aiSays} from '../../lib/ai-move-marks';

// The pins, their events and the radar, shared by both maps of the app: the MapLibre map on a phone (LiveMap.native.tsx)
// and the tile map of the web preview (TileMap.tsx). The map decides where a pin stands; the pin decides how it moves.
// Three round controls on the right edge: closer, farther and «Где я», which finds the person, centred on the visible part of the map.
export const controlsHeight=3*T.control.touch+2*8;
// When pin boxes meet, one stays visible: the selected one, then an answering or waiting flat, then the AI's best choice, then the cheapest.
export const toneOrder:Record<PinTone,number>={alert:0,offer:0,booked:0,pending:1,active:1,booking:2,job:3,home:3};
const tones:Record<PinTone,{bg:string;fg:string;line:string}>={home:{bg:C.surface,fg:C.ink,line:C.line},pending:{bg:C.warningSoft,fg:C.warning,line:C.warningLine},offer:{bg:C.accent,fg:C.surface,line:C.accent},job:{bg:C.infoSoft,fg:C.info,line:C.infoLine},booking:{bg:C.accentSoft,fg:C.ink,line:C.accentLine},booked:{bg:C.success,fg:C.surface,line:C.success},active:{bg:C.info,fg:C.surface,line:C.info},alert:{bg:C.danger,fg:C.surface,line:C.danger}};
// The colour of the flash and of the waves an event sends out.
const glow:Record<PinTone,string>={home:C.accentLine,pending:C.warningLine,offer:C.accent,job:C.info,booking:C.accentLine,booked:C.success,active:C.info,alert:C.danger};
// ECHO_DELAY: a pin that changed while the person was away waits for the page to turn into the map before it plays.
export const FRESH=900,LEAVE=260,ECHO_DELAY=450;
// The AI's own work plays once per move: a pin remembers which move it has shown, even when the map is built again.
const aiShown=new Map<string,number>();
export const AI_PLAY=2600;
// The small sign of the service, the crown of the yurt (lib/brand.ts), stands before the label of a pin; the number of
// a stop on a route and the ✦ of the AI's best choice stand there instead of it. A booking made sends the gold rays
// of the sign out round the pin.
const sign=require('../assets/brand/dome-glyph.png');
const RAYS=Array.from({length:16},(_,i)=>i);

// One pin and what happens to it. A pin knows its last tone and label, so it plays its event once when they change.
// born: when the key first came in the pins (0: it was there before, then it plays nothing on mount).
// x,y: where the pin stands on the screen; without them (inside a map marker) it stands where its parent puts it.
export function Pin({pin,x,y,more,active,still,picking,born,delay,loop,onPress,onAct}:{pin:MapPin;x?:number;y?:number;more:number;active:boolean;still:boolean;picking:boolean;born:number;delay:number;loop:Animated.Value;onPress?:()=>void;onAct?:()=>void}){
 const tone=pin.tone||'home',colors=tones[tone],best=!!pin.best;
 // The guest's plain price pin: the chosen one turns dark, as on Airbnb (concept of 2026-11-25).
 const activeHome=active&&tone==='home'&&!pin.plain;
 const selectedInk=activeHome?C.accentPressed:C.surface;
 const signInk=active?selectedInk:tone==='home'||tone==='booking'?C.accent:colors.fg;
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
  const play={ask:()=>Animated.parallel([wiggle(),bounce(.12)]),answer:()=>Animated.parallel([burst(),bounce(.28)]),celebrate:()=>{flash2.setValue(0);return Animated.parallel([burst(),bounce(.4),Animated.timing(flash2,{toValue:1,delay:240,duration:900,easing:Easing.out(Easing.cubic),useNativeDriver:true})]);},start:()=>Animated.parallel([burst(),bounce(.16)]),settle:()=>bounce(-.12),update:()=>bounce(.16),alarm:()=>Animated.parallel([wiggle(),burst(),bounce(.2)]),calm:()=>bounce(-.12)}[event];
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
  setAiText(aiSays(AI_SAYS[move.move],move.type));ai.setValue(0);
  const run=Animated.timing(ai,{toValue:1,duration:AI_PLAY,delay:(pin.was?ECHO_DELAY:0)+260,easing:Easing.linear,useNativeDriver:true});
  run.start(({finished})=>{if(finished)setAiText('');});
  // Stopped half-way (the pin changed, motion was switched off): the ring and the line leave with it.
  return()=>{run.stop();setAiText('');};
 },[pin.ai?.at,pin.ai?.move,still]);
 // A home not free at the chosen arrival (pin.dim) is quieter; it brightens smoothly when moving the arrival frees it.
 const quiet=useRef(new Animated.Value(pin.dim&&!active?.55:1)).current;
 useEffect(()=>{const to=pin.dim&&!active?.55:1;if(still){quiet.setValue(to);return;}Animated.timing(quiet,{toValue:to,duration:320,easing:Easing.out(Easing.quad),useNativeDriver:true}).start();},[pin.dim,active,still]);
 useEffect(()=>{if(still){lift.setValue(active?1:0);return;}Animated.spring(lift,{toValue:active?1:0,friction:6,tension:140,useNativeDriver:true}).start();},[active,still]);
 const scale=Animated.add(Animated.add(enter.interpolate({inputRange:[0,1],outputRange:[.4,1]}),pop),lift.interpolate({inputRange:[0,1],outputRange:[0,.08]}));
 const translateY=Animated.add(enter.interpolate({inputRange:[0,1],outputRange:[-18,0]}),lift.interpolate({inputRange:[0,1],outputRange:[0,-4]}));
 const rotate=shake.interpolate({inputRange:[0,.2,.4,.6,.8,1],outputRange:['0deg','-9deg','8deg','-5deg','3deg','0deg']});
 const breathing=tone==='pending'||tone==='active'||tone==='alert';
 // The time left to answer runs down as a strip under the label, at its real pace; it starts again from the right place after each refresh.
 const left=useRef(new Animated.Value(1)).current,timed=tone==='pending'&&!!pin.until;
 useEffect(()=>{if(!timed)return;const now=Date.now()/1000,share=answerLeft(pin.until!,now);left.setValue(share);if(still||!share)return;const a=Animated.timing(left,{toValue:0,duration:Math.round(share*ANSWER_WINDOW*1000),easing:Easing.linear,useNativeDriver:true});a.start();return()=>a.stop();},[timed,Math.round(pin.until||0),still]);
 // A cleaning under way fills its strip towards the deadline; each refresh moves it on smoothly.
 const done=useRef(new Animated.Value(pin.progress??0)).current,filling=pin.progress!=null;
 useEffect(()=>{if(!filling)return;if(still){done.setValue(pin.progress!);return;}Animated.timing(done,{toValue:pin.progress!,duration:600,easing:Easing.out(Easing.quad),useNativeDriver:true}).start();},[filling,pin.progress,still]);
 // The step that waits for the person: a tag under the pin. It drops in when the step comes and beats once when it turns
 // urgent («Уборка не успевает»); after that it stands still, so ten places with tags do not turn into noise.
 const act=pin.act,tag=useRef(new Animated.Value(act&&still?1:0)).current;
 useEffect(()=>{if(!act)return;if(still){tag.setValue(1);return;}tag.setValue(0);Animated.spring(tag,{toValue:1,delay:entering.current?delay+220:120,friction:6,tension:110,useNativeDriver:true}).start();},[act?.label,act?.why,act?.id,still]);
 const beat=useRef(new Animated.Value(0)).current,hot=useRef(false);
 useEffect(()=>{const was=hot.current;hot.current=!!act?.urgent;if(still||!act?.urgent||was)return;beat.setValue(0);Animated.timing(beat,{toValue:1,delay:420,duration:520,easing:Easing.out(Easing.quad),useNativeDriver:true}).start();},[act?.urgent,act?.id,still]);
 // The deal of the place as a line of stages along the bottom of the pin; the time left to answer takes its place while a guest waits.
 const chain=!timed&&pin.chain&&pin.chain.states.length>1?pin.chain:undefined,ink=active?C.surface:colors.fg;
 return <View pointerEvents="box-none" style={[m.pinWrap,act&&m.pinWrapAct,x==null||y==null?m.pinInMarker:act?{left:x-ACT_WIDTH/2,top:y-ACT_HEIGHT/2}:{left:x-90,top:y-20},{zIndex:active?3:act||tone==='offer'||tone==='booked'||tone==='alert'?2:1}]}>{breathing&&!still&&<Animated.View pointerEvents="none" style={[m.ring,{backgroundColor:glow[tone],opacity:loop.interpolate({inputRange:[0,1],outputRange:[tone==='active'?.35:.55,0]}),transform:[{scale:loop.interpolate({inputRange:[0,1],outputRange:[.6,tone==='active'?1.5:1.9]})}]}]}/>}{!still&&<Animated.View pointerEvents="none" style={[m.ring,m.echo,{opacity:ping.interpolate({inputRange:[0,.08,.7,1],outputRange:[0,1,.5,0]}),transform:[{scale:ping.interpolate({inputRange:[0,1],outputRange:[.8,2.8]})}]}]}/>}{!still&&<Animated.View pointerEvents="none" style={[m.ring,{backgroundColor:glow[flashTone],opacity:flash.interpolate({inputRange:[0,.05,1],outputRange:[0,.6,0]}),transform:[{scale:flash.interpolate({inputRange:[0,1],outputRange:[.5,2.6]})}]}]}/>}{!still&&tone==='booked'&&<Animated.View pointerEvents="none" style={[m.ring,m.wave2,{opacity:flash2.interpolate({inputRange:[0,.05,1],outputRange:[0,.8,0]}),transform:[{scale:flash2.interpolate({inputRange:[0,1],outputRange:[.6,3.4]})}]}]}/>}{!still&&tone==='booked'&&<Animated.View pointerEvents="none" style={[m.rays,{opacity:flash2.interpolate({inputRange:[0,.1,.55,1],outputRange:[0,1,1,0]}),transform:[{scale:flash2.interpolate({inputRange:[0,1],outputRange:[1.2,2.6]})},{rotate:flash2.interpolate({inputRange:[0,1],outputRange:['-8deg','4deg']})}]}]}>{RAYS.map(i=><View key={i} style={[m.rayTurn,{transform:[{rotate:i*22.5+'deg'}]}]}><View style={m.ray}/></View>)}</Animated.View>}{!!aiText&&<Animated.View pointerEvents="none" style={[m.aiRing,{width:pinBoxWidth(pin.label,pin.order)+12,opacity:ai.interpolate({inputRange:[0,.08,.7,1],outputRange:[0,1,.9,0]}),transform:[{scale:ai.interpolate({inputRange:[0,.25,1],outputRange:[.92,1.06,1.14]})}]}]}/>}{!!aiText&&!!pin.ai&&['assigned','replaced','took'].includes(pin.ai.move)&&<Animated.View pointerEvents="none" style={[m.comer,{opacity:ai.interpolate({inputRange:[0,.08,.5,.58],outputRange:[0,1,1,0],extrapolate:'clamp'}),transform:[{translateX:ai.interpolate({inputRange:[0,.3,.5],outputRange:[84,52,0],extrapolate:'clamp'})},{translateY:ai.interpolate({inputRange:[0,.3,.5],outputRange:[64,12,0],extrapolate:'clamp'})}]}]}/>}{!!aiText&&<Animated.View pointerEvents="none" accessibilityLiveRegion="polite" style={[m.aiSays,{opacity:ai.interpolate({inputRange:[0,.1,.75,1],outputRange:[0,1,1,0]}),transform:[{translateY:ai.interpolate({inputRange:[0,.1,1],outputRange:[6,0,-8]})}]}]}><Text style={m.aiSaysText} numberOfLines={1}>✦ {aiText}</Text></Animated.View>}<Animated.View style={{opacity:Animated.multiply(enter.interpolate({inputRange:[0,.3,1],outputRange:[0,1,1]}),quiet),transform:[{translateY},{scale},{rotate}]}}><View style={best&&!active?m.bestRing:null}><Pressable accessibilityRole="button" accessibilityLabel={(pin.order?t('Остановка {order}. ',{order:pin.order}):'')+(pin.title||t('Метка'))+', '+pin.label+(filling?t(', прошло {v}% времени',{v:Math.round(pin.progress!*100)}):'')+(best?t(', лучший выбор для вас'):'')+(more?t('. Рядом ещё {more}. Приблизить',{more}):'')} accessibilityState={{selected:active}} disabled={picking||!onPress} onPress={onPress} hitSlop={6} style={[m.pin,{backgroundColor:active&&!activeHome?C.ink:colors.bg,borderColor:activeHome?C.accent:active?C.ink:best?C.aiFrom:colors.line},(activeHome||best)&&m.bestPin,!!pin.order&&m.pinOrdered,pin.plain&&m.pinPlain]}>{pin.order?<View style={[m.order,{backgroundColor:active?C.surface:colors.fg}]}><Text style={[m.orderText,{color:active?C.ink:colors.bg}]}>{pin.order}</Text></View>:best||pin.plain?null:<Image source={sign} accessibilityIgnoresInvertColors style={[m.sign,{tintColor:signInk}]}/>}<Text numberOfLines={1} style={[m.pinText,{color:active?selectedInk:colors.fg}]}>{best&&!pin.plain?<Text style={{color:active?selectedInk:C.aiFrom}}>✦ </Text>:null}{pin.label}{more&&!pin.plain?<Text style={m.pinMore}>{' +'+more}</Text>:null}</Text>{timed&&<View pointerEvents="none" style={m.timeTrack}><Animated.View style={[m.timeFill,{transform:[{scaleX:left}]}]}/></View>}{chain&&<View pointerEvents="none" style={m.chain}>{chain.states.map((state,i)=><View key={i} style={[m.link,{backgroundColor:ink,opacity:state==='done'?1:.28}]}>{state==='now'&&(still?<View style={[m.linkNow,{backgroundColor:ink,opacity:.6}]}/>:<Animated.View style={[m.linkNow,{backgroundColor:ink,opacity:loop.interpolate({inputRange:[0,.5,1],outputRange:[.35,1,.35]})}]}/>)}</View>)}</View>}{filling&&!chain&&<View pointerEvents="none" style={[m.timeTrack,m.workTrack]}><Animated.View style={[m.timeFill,m.workFill,{transform:[{scaleX:done}]}]}/></View>}</Pressable></View></Animated.View>{!!act&&<Animated.View style={[m.actWrap,{opacity:tag.interpolate({inputRange:[0,.4,1],outputRange:[0,1,1]}),transform:[{translateY:tag.interpolate({inputRange:[0,1],outputRange:[-10,0]})},{scale:Animated.add(tag.interpolate({inputRange:[0,1],outputRange:[.7,1]}),beat.interpolate({inputRange:[0,.5,1],outputRange:[0,.08,0]}))}]}]}><View style={[m.actStem,act.urgent&&m.actStemHot]}/><Pressable accessibilityRole="button" accessibilityLabel={t('{v}: {label}{v2}. Открыть',{v:(pin.title||t('Метка')),label:act.label,v2:(act.why?'. '+act.why:'')})} disabled={picking||!onAct} onPress={onAct} hitSlop={8} style={({pressed})=>[m.act,!!act.why&&m.actTall,act.urgent&&m.actHot,pressed&&{opacity:.7}]}><View style={m.actWords}><Text numberOfLines={1} style={m.actText}>{act.label}</Text>{!!act.why&&<Text numberOfLines={1} style={m.actWhy}>{act.why}</Text>}</View><Text style={m.actGo}>›</Text></Pressable></Animated.View>}</View>;
}
// A pin with a tag is taller and wider: the tag stands inside its box, so it is drawn and pressed on a phone too.
export const ACT_WIDTH=272,ACT_HEIGHT=136;
// A pin that has left the map: it melts and sinks, then it is gone.
export function Leaving({pin,x,y}:{pin:MapPin;x?:number;y?:number}){
 const out=useRef(new Animated.Value(0)).current,tone=pin.tone||'home',colors=tones[tone];
 useEffect(()=>{Animated.timing(out,{toValue:1,duration:LEAVE,easing:Easing.in(Easing.quad),useNativeDriver:true}).start();},[]);
 return <View pointerEvents="none" style={[m.pinWrap,x==null||y==null?m.pinInMarker:{left:x-90,top:y-20}]}><Animated.View style={[m.pin,{backgroundColor:colors.bg,borderColor:colors.line,opacity:out.interpolate({inputRange:[0,1],outputRange:[1,0]}),transform:[{translateY:out.interpolate({inputRange:[0,1],outputRange:[0,8]})},{scale:out.interpolate({inputRange:[0,1],outputRange:[1,.6]})}]}]}>{!pin.order&&!pin.best&&<Image source={sign} accessibilityIgnoresInvertColors style={[m.sign,{tintColor:tone==='home'||tone==='booking'?C.accent:colors.fg}]}/>}<Text numberOfLines={1} style={[m.pinText,{color:colors.fg}]}>{pin.label}</Text></Animated.View></View>;
}
// The head of the mark that picks a point (both maps): the crown of the yurt inside a drop.
export function CrossHead(){return <View style={m.crossHead}><Image source={sign} accessibilityIgnoresInvertColors style={m.crossSign}/></View>;}
// A beam of the web preview map: a line from the guest's search point to an asked flat, drawn out from the point.
// On a phone the beams are a line layer of MapLibre (LiveMap.native.tsx); both use the same colours.
export const BEAM={ask:C.warning,answer:C.accent,route:C.info,nav:C.accent,casing:C.surface};
export function Beam({a,b,tone,still}:{a:{x:number;y:number};b:{x:number;y:number};tone:BeamTone;still:boolean}){
 const grow=useRef(new Animated.Value(still?1:0)).current,box=beamBox(a,b);
 useEffect(()=>{if(!still)Animated.timing(grow,{toValue:1,duration:700,easing:Easing.out(Easing.cubic),useNativeDriver:true}).start();},[]);
 return <View pointerEvents="none" style={[m.beam,{left:box.cx-box.length/2,top:box.cy-1,width:box.length,transform:[{rotate:box.angle+'deg'}]}]}><Animated.View style={[tone==='ask'?m.beamAsk:tone==='route'?m.beamRoute:tone==='nav'?m.beamNav:m.beamAnswer,{transformOrigin:'left',transform:[{scaleX:grow}]}]}/></View>;
}
// The guest's search point, where the beams start.
export function Origin({x,y}:{x?:number;y?:number}){
 return <View pointerEvents="none" style={[m.origin,x==null||y==null?m.pinInMarker:{left:x-11,top:y-11}]}><View style={m.radarDot}/></View>;
}
// The person on the map, as in a taxi app: a blue dot with a white rim that breathes softly, and a pale circle as wide
// as the phone's uncertainty (radius in screen points). rough: a remembered or approximate point, drawn paler.
export function MeDot({x,y,radius=0,rough=false,still}:{x?:number;y?:number;radius?:number;rough?:boolean;still:boolean}){
 const v=useRef(new Animated.Value(0)).current;
 useEffect(()=>{if(still)return;const l=Animated.loop(Animated.timing(v,{toValue:1,duration:2200,easing:Easing.out(Easing.quad),useNativeDriver:true}));l.start();return()=>l.stop();},[still]);
 const r=Math.max(14,Math.round(radius)),box=2*r;
 return <View pointerEvents="none" accessibilityLabel={t('Вы здесь')} style={[m.me,{width:box,height:box},x==null||y==null?m.pinInMarker:{left:x-r,top:y-r}]}><View style={[m.meHalo,{width:box,height:box,borderRadius:r}]}/>{!still&&<Animated.View style={[m.mePulse,{opacity:v.interpolate({inputRange:[0,.2,1],outputRange:[0,.45,0]}),transform:[{scale:v.interpolate({inputRange:[0,1],outputRange:[.6,2.2]})}]}]}/>}<View style={[m.meDot,rough&&m.meRough]}/></View>;
}
// The «Где я» button's icon, drawn: a ring with a dot, filled while the map knows where the person is.
export function LocateIcon({known,busy,still}:{known:boolean;busy:boolean;still:boolean}){
 const v=useRef(new Animated.Value(0)).current;
 useEffect(()=>{if(!busy||still){v.setValue(0);return;}const l=Animated.loop(Animated.sequence([Animated.timing(v,{toValue:1,duration:600,useNativeDriver:true}),Animated.timing(v,{toValue:0,duration:600,useNativeDriver:true})]));l.start();return()=>l.stop();},[busy,still]);
 return <Animated.View style={[m.locate,known&&m.locateKnown,{opacity:v.interpolate({inputRange:[0,1],outputRange:[1,.35]}),transform:[{scale:v.interpolate({inputRange:[0,1],outputRange:[1,.82]})}]}]}><View style={[m.locateDot,known&&m.locateDotKnown]}/></Animated.View>;
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
 return <View pointerEvents="none" style={[m.spark,x==null||y==null?m.pinInMarker:{left:x-16,top:y-16}]}><Animated.View style={[m.sparkRing,{opacity:v.interpolate({inputRange:[0,.1,1],outputRange:[0,.9,0]}),transform:[{scale:v.interpolate({inputRange:[0,1],outputRange:[.3,1.6]})}]}]}/><View style={m.sparkDot}/></View>;
}
// Radar waves while a search runs: three rings, one after another, from the middle of the visible map.
export function Radar({x,y}:{x:number;y:number}){
 const waves=useRef([0,1,2].map(()=>new Animated.Value(0))).current;
 useEffect(()=>{const loops=waves.map((v,i)=>Animated.loop(Animated.sequence([Animated.delay(i*600),Animated.timing(v,{toValue:1,duration:1800,easing:Easing.out(Easing.quad),useNativeDriver:true}),Animated.timing(v,{toValue:0,duration:0,useNativeDriver:true})])));loops.forEach(l=>l.start());return()=>loops.forEach(l=>l.stop());},[]);
 return <View pointerEvents="none" style={[m.radar,{left:x-120,top:y-120}]}>{waves.map((v,i)=><Animated.View key={i} style={[m.wave,{opacity:v.interpolate({inputRange:[0,.15,1],outputRange:[0,.5,0]}),transform:[{scale:v.interpolate({inputRange:[0,1],outputRange:[.1,1]})}]}]}/>)}<View style={m.radarDot}/></View>;
}

export const m=StyleSheet.create({
 host:{flex:1,backgroundColor:C.line,overflow:'hidden'},tile:{position:'absolute',width:TILE,height:TILE},
 pinWrap:{position:'absolute',width:180,height:40,alignItems:'center',justifyContent:'center'},pinInMarker:{position:'relative'},pinWrapAct:{width:272,height:136},
 chain:{position:'absolute',left:10,right:10,bottom:3,height:3,flexDirection:'row',gap:2},link:{flex:1,height:3,borderRadius:2,overflow:'hidden'},linkNow:{flex:1},
 actWrap:{position:'absolute',top:86,alignItems:'center'},actStem:{width:2,height:5,backgroundColor:C.accent},actStemHot:{backgroundColor:C.danger},actTall:{height:44,borderRadius:16},actWords:{flexShrink:1},actWhy:{color:C.surface,fontSize:12,fontWeight:'500',opacity:.92},act:{height:26,maxWidth:268,paddingLeft:8,paddingRight:8,borderRadius:12,flexDirection:'row',alignItems:'center',gap:4,backgroundColor:C.accent,borderWidth:1,borderColor:C.surface,shadowColor:C.ink,shadowOffset:{width:0,height:2},shadowOpacity:.22,shadowRadius:5,elevation:4},actHot:{backgroundColor:C.danger},actText:{color:C.surface,fontSize:12,fontWeight:'700',flexShrink:1},actGo:{color:C.surface,fontSize:14,fontWeight:'700',opacity:.8,marginTop:-1},
 pinPlain:{paddingLeft:12,paddingRight:12},
 pin:{minHeight:32,minWidth:44,paddingLeft:8,paddingRight:12,borderRadius:16,borderWidth:1,flexDirection:'row',gap:4,alignItems:'center',justifyContent:'center',shadowColor:C.ink,shadowOffset:{width:0,height:2},shadowOpacity:.18,shadowRadius:5,elevation:3},
 pinText:{fontSize:14,fontWeight:'600'},sign:{width:16,height:16},rays:{position:'absolute',width:56,height:56},rayTurn:{position:'absolute',top:0,right:0,bottom:0,left:0,alignItems:'center'},ray:{width:2,height:8,borderRadius:1,backgroundColor:C.gold},aiRing:{position:'absolute',height:44,borderRadius:24,borderWidth:3,borderColor:C.aiFrom,shadowColor:C.aiTo,shadowOpacity:.6,shadowRadius:8,shadowOffset:{width:0,height:0}},aiSays:{position:'absolute',top:-26,paddingHorizontal:8,height:22,borderRadius:12,backgroundColor:C.aiFrom,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:C.aiTo},aiSaysText:{color:C.surface,fontSize:12,fontWeight:'700'},comer:{position:'absolute',width:16,height:16,borderRadius:8,backgroundColor:C.accent,borderWidth:4,borderColor:C.surface,zIndex:4},bestRing:{padding:2,borderRadius:16,backgroundColor:C.accentSoft,shadowColor:C.ink,shadowOffset:{width:0,height:2},shadowOpacity:.18,shadowRadius:5,elevation:3},bestPin:{borderWidth:2,minHeight:30,shadowOpacity:0,elevation:0},wave2:{borderWidth:3,borderColor:C.success,backgroundColor:'transparent'},timeTrack:{position:'absolute',left:8,right:8,bottom:3,height:3,borderRadius:2,backgroundColor:C.warningLine,overflow:'hidden'},timeFill:{flex:1,backgroundColor:C.warning,transformOrigin:'left'},pinMore:{fontWeight:'500',opacity:.7},pinOrdered:{paddingLeft:4},order:{width:24,height:24,borderRadius:12,alignItems:'center',justifyContent:'center'},orderText:{fontSize:12,fontWeight:'700'},workTrack:{backgroundColor:'rgba(255,255,255,0.35)'},workFill:{backgroundColor:C.surface},ring:{position:'absolute',width:56,height:56,borderRadius:999},echo:{borderWidth:3,borderColor:C.accent,backgroundColor:C.accentSoft},
 beam:{position:'absolute',height:2,justifyContent:'center'},beamAsk:{height:0,borderTopWidth:2,borderStyle:'dashed',borderColor:C.warning},beamAnswer:{height:2,borderRadius:1,backgroundColor:C.accent},beamRoute:{height:4,borderRadius:2,backgroundColor:C.info,opacity:.7},beamNav:{height:6,borderRadius:4,backgroundColor:C.accent,borderWidth:1,borderColor:C.surface},
 heat:{position:'absolute'},spark:{position:'absolute',width:32,height:32,alignItems:'center',justifyContent:'center'},sparkRing:{position:'absolute',width:32,height:32,borderRadius:16,borderWidth:2,borderColor:C.aiTo},sparkDot:{width:8,height:8,borderRadius:4,backgroundColor:C.aiTo},
 origin:{position:'absolute',width:22,height:22,borderRadius:12,backgroundColor:C.accentSoft,alignItems:'center',justifyContent:'center'},
 radar:{position:'absolute',width:240,height:240,alignItems:'center',justifyContent:'center'},wave:{position:'absolute',width:240,height:240,borderRadius:999,borderWidth:2,borderColor:C.accent,backgroundColor:C.accentSoft},radarDot:{width:12,height:12,borderRadius:8,backgroundColor:C.accent,borderWidth:2,borderColor:C.surface},
 cross:{position:'absolute',width:56,height:56,alignItems:'center',justifyContent:'flex-end'},landing:{position:'absolute',bottom:-12,width:56,height:24,borderRadius:999,borderWidth:2,borderColor:C.accent},crossShadow:{position:'absolute',bottom:-3,width:14,height:6,borderRadius:999,backgroundColor:C.ink},
 crossHead:{width:32,height:32,borderRadius:16,backgroundColor:C.accent,borderWidth:2,borderColor:C.surface,alignItems:'center',justifyContent:'center'},crossSign:{width:18,height:18,tintColor:C.surface},crossStem:{width:3,height:10,backgroundColor:C.accent},
 controls:{position:'absolute',right:12,gap:8},control:{width:44,height:44,borderRadius:T.radius.full,backgroundColor:C.surface,borderWidth:1,borderColor:C.line,alignItems:'center',justifyContent:'center',shadowColor:C.ink,shadowOffset:{width:0,height:2},shadowOpacity:.12,shadowRadius:8,elevation:3},controlIcon:{width:20,height:20,tintColor:C.ink},
 me:{position:'absolute',alignItems:'center',justifyContent:'center'},meHalo:{position:'absolute',backgroundColor:'rgba(29,78,216,0.12)',borderWidth:1,borderColor:'rgba(29,78,216,0.35)'},mePulse:{position:'absolute',width:28,height:28,borderRadius:16,backgroundColor:'rgba(29,78,216,0.5)'},meDot:{width:16,height:16,borderRadius:8,backgroundColor:C.info,borderWidth:3,borderColor:C.surface,shadowColor:C.ink,shadowOffset:{width:0,height:1},shadowOpacity:.3,shadowRadius:3,elevation:4},meRough:{backgroundColor:C.infoLine},
 locate:{width:20,height:20,borderRadius:12,borderWidth:2,borderColor:C.ink,alignItems:'center',justifyContent:'center'},locateKnown:{borderColor:C.info},locateDot:{width:6,height:6,borderRadius:4,backgroundColor:C.ink},locateDotKnown:{width:8,height:8,borderRadius:4,backgroundColor:C.info},
 area:{position:'absolute',left:0,right:0,alignItems:'center'},areaButton:{minHeight:40,paddingHorizontal:16,borderRadius:T.radius.full,backgroundColor:C.surface,borderWidth:1,borderColor:C.line,justifyContent:'center',shadowColor:C.ink,shadowOffset:{width:0,height:2},shadowOpacity:.12,shadowRadius:8,elevation:3},areaText:{fontSize:16,fontWeight:'600',color:C.ink},
 credit:{position:'absolute',left:8,fontSize:12,color:C.inkSoft,backgroundColor:C.glass,paddingHorizontal:4,borderRadius:4}
});
