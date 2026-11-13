import React,{useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {AccessibilityInfo,Animated,Easing,Image,PanResponder,Pressable,StyleSheet,Text,View,type LayoutChangeEvent} from 'react-native';
import {C} from './styles';
import {T} from './tokens';
import {API_URL} from './api';
import {MAX_ZOOM,MIN_ZOOM,TILE,fitView,groupPins,pinWidth,project,unproject,validPoint,visibleTiles,type MapPoint} from './map-math';
import {ANSWER_WINDOW,answerLeft,appearDelay,flight,flightSteps,pinEvent,type Flight,type PinEvent,type PinState,type PinTone} from './map-motion';

// rank: among pins of one tone, the lower one stays visible when their boxes meet (the price, for flats).
// until: for a waiting pin, when the owner's time to answer ends, in seconds by this phone's clock; a strip under the label runs down to it.
export type MapPin={key:string;point:MapPoint;label:string;tone?:PinTone;title?:string;rank?:number;until?:number};
// scanning: a search is running; the map sends radar waves from the middle of what is visible.
type Props={center:MapPoint;pins:MapPin[];selected?:string;onSelect?:(key:string)=>void;bottomInset?:number;topInset?:number;focusKey?:string;picking?:boolean;scanning?:boolean;onCenter?:(center:MapPoint)=>void};
type View2={center:MapPoint;zoom:number};
// The tile service asks clients to identify themselves; no account or device data is sent.
const tileHeaders={'User-Agent':'AIArenda-mobile/0.1 (+'+API_URL+')'};
const plusIcon=require('../assets/ui/plus.png'),minusIcon=require('../assets/ui/minus.png'),fitIcon=require('../assets/ui/fit.png');
// Three round controls on the right edge, centred on the visible part of the map.
const controlsHeight=3*T.control.touch+2*8;
// When pin boxes meet, one stays visible: the selected one, then an answering or waiting flat, then the cheapest.
const toneOrder:Record<PinTone,number>={offer:0,booked:0,pending:1,active:1,booking:2,job:3,home:3};
const tones:Record<PinTone,{bg:string;fg:string;line:string}>={home:{bg:C.surface,fg:C.ink,line:C.line},pending:{bg:C.warningSoft,fg:C.warning,line:C.warningLine},offer:{bg:C.accent,fg:C.surface,line:C.accent},job:{bg:C.infoSoft,fg:C.info,line:C.infoLine},booking:{bg:C.accentSoft,fg:C.ink,line:C.accentLine},booked:{bg:C.success,fg:C.surface,line:C.success},active:{bg:C.info,fg:C.surface,line:C.info}};
// The colour of the flash and of the waves an event sends out.
const glow:Record<PinTone,string>={home:C.accentLine,pending:C.warningLine,offer:C.accent,job:C.info,booking:C.accentLine,booked:C.success,active:C.info};
const FRESH=900,LEAVE=260;

// One pin and what happens to it. A pin knows its last tone and label, so it plays its event once when they change.
// born: when the key first came in the pins (0: it was there before, then it plays nothing on mount).
function Pin({pin,x,y,more,active,still,picking,born,delay,loop,onPress}:{pin:MapPin;x:number;y:number;more:number;active:boolean;still:boolean;picking:boolean;born:number;delay:number;loop:Animated.Value;onPress?:()=>void}){
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
 return <View pointerEvents="box-none" style={[m.pinWrap,{left:x-90,top:y-20,zIndex:active?3:tone==='offer'||tone==='booked'?2:1}]}>
  {breathing&&!still&&<Animated.View pointerEvents="none" style={[m.ring,{backgroundColor:glow[tone],opacity:loop.interpolate({inputRange:[0,1],outputRange:[tone==='active'?.35:.55,0]}),transform:[{scale:loop.interpolate({inputRange:[0,1],outputRange:[.6,tone==='active'?1.5:1.9]})}]}]}/>}
  {!still&&<Animated.View pointerEvents="none" style={[m.ring,{backgroundColor:glow[flashTone],opacity:flash.interpolate({inputRange:[0,.05,1],outputRange:[0,.6,0]}),transform:[{scale:flash.interpolate({inputRange:[0,1],outputRange:[.5,2.6]})}]}]}/>}
  <Animated.View style={{opacity:enter.interpolate({inputRange:[0,.3,1],outputRange:[0,1,1]}),transform:[{translateY},{scale},{rotate}]}}>
   <Pressable accessibilityRole="button" accessibilityLabel={(pin.title||'Метка')+', '+pin.label+(more?'. Рядом ещё '+more+'. Приблизить':'')} accessibilityState={{selected:active}} disabled={picking||!onPress} onPress={onPress} hitSlop={6} style={[m.pin,{backgroundColor:active?C.ink:colors.bg,borderColor:active?C.ink:colors.line}]}><Text numberOfLines={1} style={[m.pinText,{color:active?C.surface:colors.fg}]}>{pin.label}{more?<Text style={m.pinMore}>{' +'+more}</Text>:null}</Text>{timed&&<View pointerEvents="none" style={m.timeTrack}><Animated.View style={[m.timeFill,{transform:[{scaleX:left}]}]}/></View>}</Pressable>
  </Animated.View>
 </View>;
}
// A pin that has left the map: it melts and sinks, then it is gone.
function Leaving({pin,x,y}:{pin:MapPin;x:number;y:number}){
 const out=useRef(new Animated.Value(0)).current,colors=tones[pin.tone||'home'];
 useEffect(()=>{Animated.timing(out,{toValue:1,duration:LEAVE,easing:Easing.in(Easing.quad),useNativeDriver:true}).start();},[]);
 return <View pointerEvents="none" style={[m.pinWrap,{left:x-90,top:y-20}]}>
  <Animated.View style={[m.pin,{backgroundColor:colors.bg,borderColor:colors.line,opacity:out.interpolate({inputRange:[0,1],outputRange:[1,0]}),transform:[{translateY:out.interpolate({inputRange:[0,1],outputRange:[0,8]})},{scale:out.interpolate({inputRange:[0,1],outputRange:[1,.6]})}]}]}><Text numberOfLines={1} style={[m.pinText,{color:colors.fg}]}>{pin.label}</Text></Animated.View>
 </View>;
}
// Radar waves while a search runs: three rings, one after another, from the middle of the visible map.
function Radar({x,y}:{x:number;y:number}){
 const waves=useRef([0,1,2].map(()=>new Animated.Value(0))).current;
 useEffect(()=>{const loops=waves.map((v,i)=>Animated.loop(Animated.sequence([Animated.delay(i*600),Animated.timing(v,{toValue:1,duration:1800,easing:Easing.out(Easing.quad),useNativeDriver:true}),Animated.timing(v,{toValue:0,duration:0,useNativeDriver:true})])));loops.forEach(l=>l.start());return()=>loops.forEach(l=>l.stop());},[]);
 return <View pointerEvents="none" style={[m.radar,{left:x-120,top:y-120}]}>
  {waves.map((v,i)=><Animated.View key={i} style={[m.wave,{opacity:v.interpolate({inputRange:[0,.15,1],outputRange:[0,.5,0]}),transform:[{scale:v.interpolate({inputRange:[0,1],outputRange:[.1,1]})}]}]}/>)}
  <View style={m.radarDot}/>
 </View>;
}

export function TileMap({center,pins,selected,onSelect,bottomInset=0,topInset=0,focusKey='',picking=false,scanning=false,onCenter}:Props){
 const [size,setSize]=useState({w:0,h:0}),[view,setViewNow]=useState<View2>({center,zoom:12}),[drag,setDrag]=useState({x:0,y:0}),[still,setStill]=useState(false);
 const state=useRef({view,size,bottomInset,topInset,picking});state.current={view,size,bottomInset,topInset,picking};
 const loop=useRef(new Animated.Value(0)).current,report=useRef(onCenter);report.current=onCenter;
 const usableHeight=Math.max(120,size.h-bottomInset-topInset),originY=topInset+usableHeight/2;
 useEffect(()=>{let live=true;AccessibilityInfo.isReduceMotionEnabled().then(v=>{if(live)setStill(v);}).catch(()=>{});const sub=AccessibilityInfo.addEventListener?.('reduceMotionChanged',v=>setStill(v));return()=>{live=false;sub?.remove();};},[]);
 const breathing=pins.some(p=>p.tone==='pending'||p.tone==='active');
 useEffect(()=>{if(still||!breathing){loop.setValue(0);return;}const l=Animated.loop(Animated.timing(loop,{toValue:1,duration:1600,useNativeDriver:true}));l.start();return()=>l.stop();},[still,breathing,loop]);

 // ---------- The camera: every change of view flies, except the one made by the finger ----------
 const cam=useRef(new Animated.Value(0)).current,[trip,setTrip]=useState<{f:Flight;id:number}|null>(null),tripId=useRef(0);
 const setView=(next:View2|((v:View2)=>View2),fly=true)=>{
  const from=state.current.view,to=typeof next==='function'?next(from):next;
  const f=fly&&!still&&state.current.size.w?flight({...project(from.center,from.zoom),zoom:from.zoom},{...project(to.center,to.zoom),zoom:to.zoom},TILE,TILE):null;
  setTrip(f?{f,id:++tripId.current}:null);setViewNow(to);
 };
 // Before the new view is painted, the layer is put where the old one was; then it flies home.
 useLayoutEffect(()=>{if(!trip)return;cam.setValue(1);// A short move eases out; a longer one rises and lands, so it reads as one flight over the city.
 const a=Animated.timing(cam,{toValue:0,duration:trip.f.ms,easing:trip.f.arc?Easing.inOut(Easing.cubic):Easing.out(Easing.cubic),useNativeDriver:true});a.start(({finished})=>{if(finished)setTrip(t=>t&&t.id===trip.id?null:t);});return()=>a.stop();},[trip?.id]);
 const camera=useMemo(()=>{
  if(!trip||!size.w)return null;const s=flightSteps(trip.f,size.w/2,size.h/2,size.w/2,originY);
  return [{translateX:cam.interpolate({inputRange:s.input,outputRange:s.x})},{translateY:cam.interpolate({inputRange:s.input,outputRange:s.y})},{scale:cam.interpolate({inputRange:s.input,outputRange:s.scale})}];
 },[trip?.id,size.w,size.h,originY]);

 // ---------- Arrivals and departures of pins ----------
 const born=useRef(new Map<string,number>()),known=useRef(new Map<string,MapPin>()),[leaving,setLeaving]=useState<(MapPin&{gone:number})[]>([]);
 const arrived=useMemo(()=>{
  const now=Date.now(),next=new Map(pins.map(p=>[p.key,p])),gone:MapPin[]=[];
  for(const p of pins)if(!known.current.has(p.key))born.current.set(p.key,now);
  for(const [key,p] of known.current)if(!next.has(key)){gone.push(p);born.current.delete(key);}
  known.current=next;return gone;
 },[pins]);
 // Each departure is cleared by its own timer, which a later change of the pins never cancels; a pin that comes back stops leaving.
 const timers=useRef(new Set<ReturnType<typeof setTimeout>>());
 useEffect(()=>()=>{timers.current.forEach(clearTimeout);timers.current.clear();},[]);
 useEffect(()=>{
  setLeaving(l=>l.filter(p=>!pins.some(n=>n.key===p.key)));
  if(still||!arrived.length)return;const gone=Date.now(),batch=arrived.map(p=>({...p,gone}));
  setLeaving(l=>[...l.filter(p=>!arrived.some(a=>a.key===p.key)),...batch]);
  const timer=setTimeout(()=>{timers.current.delete(timer);setLeaving(l=>l.filter(p=>!batch.includes(p)));},LEAVE+40);timers.current.add(timer);
 },[arrived]);

 // Reframe only when the caller announces a new set of results, never on background refreshes.
 const fitted=useRef(''),fittedHeight=useRef(0),moved=useRef(false),first=useRef(true);
 const fit=()=>{
  const points=pins.map(p=>p.point).filter(p=>validPoint(p)),next=points.length?fitView(points,size.w-96,usableHeight-96,15):null;
  moved.current=false;fittedHeight.current=usableHeight;
  // The first view of the screen is simply shown; later ones fly.
  setView(next||{center:validPoint(center)||[76.95,52.287],zoom:12},!first.current);first.current=false;
 };
 useEffect(()=>{
  if(!size.w||fitted.current===focusKey+':'+size.w)return;fitted.current=focusKey+':'+size.w;
  fit();
 },[focusKey,size.w]);
 // The sheet grew or shrank: frame the same pins in the part of the map that is still visible, unless the person has moved the map themselves.
 useEffect(()=>{if(!size.w||!fitted.current||moved.current||picking)return;if(Math.abs(usableHeight-fittedHeight.current)>=48)fit();},[usableHeight]);
 useEffect(()=>{report.current?.(view.center);},[view.center[0],view.center[1]]);

 // ---------- Picking a point: the marker lifts while the map moves under it and lands with a ring ----------
 const lift=useRef(new Animated.Value(0)).current,land=useRef(new Animated.Value(1)).current;
 const raise=(up:boolean)=>{if(!state.current.picking||still)return;Animated.spring(lift,{toValue:up?1:0,friction:5,tension:120,useNativeDriver:true}).start();if(!up){land.setValue(0);Animated.timing(land,{toValue:1,duration:600,easing:Easing.out(Easing.cubic),useNativeDriver:true}).start();}};
 const pan=useMemo(()=>PanResponder.create({
  onMoveShouldSetPanResponder:(_e,g)=>Math.abs(g.dx)+Math.abs(g.dy)>6,
  onPanResponderGrant:()=>raise(true),
  onPanResponderMove:(_e,g)=>setDrag({x:g.dx,y:g.dy}),
  onPanResponderRelease:(_e,g)=>{const {view:v}=state.current,c=project(v.center,v.zoom);moved.current=true;setDrag({x:0,y:0});setView({zoom:v.zoom,center:unproject(c.x-g.dx,c.y-g.dy,v.zoom)},false);raise(false);},
  onPanResponderTerminate:()=>{setDrag({x:0,y:0});raise(false);}
 }),[still]);
 const zoomBy=(delta:number)=>{moved.current=true;setView(v=>({...v,zoom:Math.max(MIN_ZOOM,Math.min(MAX_ZOOM,v.zoom+delta))}));};
 const layout=(e:LayoutChangeEvent)=>{const {width,height}=e.nativeEvent.layout;if(Math.round(width)!==size.w||Math.round(height)!==size.h)setSize({w:Math.round(width),h:Math.round(height)});};
 // While the map flies in from a wider view it starts drawn at half size: tiles cover twice the screen for that moment.
 const spare=trip&&trip.f.k<1?Math.max(size.w,size.h)/2:0;
 const tiles=size.w?visibleTiles(view.center,view.zoom,size.w+2*TILE+2*spare,size.h+2*TILE+2*spare,originY+TILE+spare).map(t=>({...t,left:t.left-TILE-spare,top:t.top-TILE-spare})):[],c=project(view.center,view.zoom);
 const at=(point:MapPoint)=>{const p=project(point,view.zoom);return {x:p.x-c.x+size.w/2,y:p.y-c.y+originY};};
 const placed=size.w?pins.flatMap(pin=>{if(!validPoint(pin.point))return [];return [{pin,...at(pin.point)}];}).filter(p=>p.x>-80&&p.x<size.w+80&&p.y>-40&&p.y<size.h+40):[];
 // Boxes that would cover each other are drawn as one pin with "+N"; a tap on it zooms in until they part.
 const byKey=new Map(placed.map(p=>[p.pin.key,p]));
 const shown=groupPins(placed.map(({pin,x,y})=>({key:pin.key,x,y,width:pinWidth(pin.label),height:32,rank:pin.key===selected?-1:toneOrder[pin.tone||'home']*1e9+Math.max(0,Math.min(pin.rank??0,1e9-1))}))).map(g=>({...byKey.get(g.key)!,members:g.members}));
 const openGroup=(keys:string[])=>{
  const {view:v}=state.current;
  // At the closest zoom the flats share one spot: each tap shows the next one.
  if(v.zoom>=MAX_ZOOM){onSelect?.(keys[(keys.indexOf(selected||'')+1)%keys.length]);return;}
  const next=fitView(keys.map(key=>byKey.get(key)!.pin.point),size.w-96,usableHeight-96,MAX_ZOOM);
  moved.current=true;setView({center:next?.center||v.center,zoom:Math.min(MAX_ZOOM,Math.max(v.zoom+1,Math.min(next?.zoom??v.zoom+1,v.zoom+2)))});
 };
 const now=Date.now();
 return <View style={m.host} onLayout={layout} accessibilityLabel={'Карта. Меток на экране: '+placed.length}>
  <View style={[StyleSheet.absoluteFill,{transform:[{translateX:drag.x},{translateY:drag.y}]}]} {...pan.panHandlers}>
   <Animated.View style={[StyleSheet.absoluteFill,camera?{transform:camera}:null]}>
    {tiles.map(t=><Image key={t.key} fadeDuration={0} accessibilityIgnoresInvertColors source={{uri:'https://tile.openstreetmap.org/'+view.zoom+'/'+t.x+'/'+t.y+'.png',headers:tileHeaders}} style={[m.tile,{left:t.left,top:t.top}]}/>)}
    {scanning&&!still&&<Radar x={size.w/2} y={originY}/>}
    {!still&&leaving.filter(p=>validPoint(p.point)).map(p=><Leaving key={'gone:'+p.key+':'+p.gone} pin={p} {...at(p.point)}/>)}
    {shown.map(({pin,x,y,members})=>{const more=members.length-1,b=born.current.get(pin.key)||0;
     return <Pin key={pin.key} pin={pin} x={x} y={y} more={more} active={pin.key===selected} still={still} picking={picking} loop={loop}
      born={now-b<FRESH?b:0} delay={appearDelay(x,y,size.w/2,originY)} onPress={onSelect?()=>more?openGroup(members):onSelect(pin.key):undefined}/>;})}
   </Animated.View>
  </View>
  {picking&&<View pointerEvents="none" style={[m.cross,{left:size.w/2-28,top:originY-28}]}>
   <Animated.View style={[m.landing,{opacity:land.interpolate({inputRange:[0,1],outputRange:[.6,0]}),transform:[{scale:land.interpolate({inputRange:[0,1],outputRange:[.2,1.4]})}]}]}/>
   <Animated.View style={[m.crossShadow,{opacity:lift.interpolate({inputRange:[0,1],outputRange:[.25,.12]}),transform:[{scale:lift.interpolate({inputRange:[0,1],outputRange:[1,.6]})}]}]}/>
   <Animated.View style={{alignItems:'center',position:'absolute',bottom:28,transform:[{translateY:lift.interpolate({inputRange:[0,1],outputRange:[0,-14]})}]}}><View style={m.crossHead}/><View style={m.crossStem}/></Animated.View>
  </View>}
  <View style={[m.controls,{top:Math.max(topInset+12,Math.round(originY-controlsHeight/2))}]}>
   <Pressable accessibilityRole="button" accessibilityLabel="Приблизить" disabled={view.zoom>=MAX_ZOOM} onPress={()=>zoomBy(1)} style={m.control}><Image source={plusIcon} style={m.controlIcon} accessibilityIgnoresInvertColors/></Pressable>
   <Pressable accessibilityRole="button" accessibilityLabel="Отдалить" disabled={view.zoom<=MIN_ZOOM} onPress={()=>zoomBy(-1)} style={m.control}><Image source={minusIcon} style={m.controlIcon} accessibilityIgnoresInvertColors/></Pressable>
   <Pressable accessibilityRole="button" accessibilityLabel="Показать всё на карте" onPress={fit} style={m.control}><Image source={fitIcon} style={m.controlIcon} accessibilityIgnoresInvertColors/></Pressable>
  </View>
  <Text style={[m.credit,{bottom:bottomInset+6}]}>© OpenStreetMap</Text>
 </View>;
}
const m=StyleSheet.create({
 host:{flex:1,backgroundColor:C.line,overflow:'hidden'},tile:{position:'absolute',width:TILE,height:TILE},
 pinWrap:{position:'absolute',width:180,height:40,alignItems:'center',justifyContent:'center'},
 pin:{minHeight:32,minWidth:44,paddingHorizontal:12,borderRadius:16,borderWidth:1,alignItems:'center',justifyContent:'center',shadowColor:C.ink,shadowOffset:{width:0,height:2},shadowOpacity:.18,shadowRadius:5,elevation:3},
 pinText:{fontSize:14,fontWeight:'600'},timeTrack:{position:'absolute',left:8,right:8,bottom:3,height:3,borderRadius:2,backgroundColor:C.warningLine,overflow:'hidden'},timeFill:{flex:1,backgroundColor:C.warning,transformOrigin:'left'},pinMore:{fontWeight:'500',opacity:.7},ring:{position:'absolute',width:56,height:56,borderRadius:999},
 radar:{position:'absolute',width:240,height:240,alignItems:'center',justifyContent:'center'},wave:{position:'absolute',width:240,height:240,borderRadius:999,borderWidth:2,borderColor:C.accent,backgroundColor:C.accentSoft},radarDot:{width:12,height:12,borderRadius:8,backgroundColor:C.accent,borderWidth:2,borderColor:C.surface},
 cross:{position:'absolute',width:56,height:56,alignItems:'center',justifyContent:'flex-end'},landing:{position:'absolute',bottom:-12,width:56,height:24,borderRadius:999,borderWidth:2,borderColor:C.accent},crossShadow:{position:'absolute',bottom:-3,width:14,height:6,borderRadius:999,backgroundColor:C.ink},
 crossHead:{width:24,height:24,borderRadius:12,backgroundColor:C.accent,borderWidth:4,borderColor:C.surface},crossStem:{width:3,height:10,backgroundColor:C.accent},
 controls:{position:'absolute',right:12,gap:8},control:{width:44,height:44,borderRadius:T.radius.full,backgroundColor:C.surface,borderWidth:1,borderColor:C.line,alignItems:'center',justifyContent:'center',shadowColor:C.ink,shadowOffset:{width:0,height:2},shadowOpacity:.12,shadowRadius:8,elevation:3},controlIcon:{width:20,height:20,tintColor:C.ink},
 credit:{position:'absolute',left:8,fontSize:12,color:C.inkSoft,backgroundColor:C.glass,paddingHorizontal:4,borderRadius:4}
});
