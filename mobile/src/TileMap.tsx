import React,{useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {AccessibilityInfo,Animated,Easing,Image,PanResponder,Pressable,StyleSheet,Text,View,type LayoutChangeEvent} from 'react-native';
import {C} from './styles';
import {T} from './tokens';
import {API_URL} from './api';
import {MAX_ZOOM,MIN_ZOOM,TILE,fitView,groupPins,pinWidth,project,unproject,validPoint,visibleTiles,type MapPoint} from './map-math';
import {appearDelay,flight,flightSteps,lineOrigin,type Flight,type MapLine,type PinTone} from './map-motion';
import {Beam,FRESH,HeatBlob,LEAVE,Leaving,Origin,Pin,Radar,Spark,controlsHeight,m,toneOrder} from './MapPins';

// rank: among pins of one tone, the lower one stays visible when their boxes meet (the price, for flats).
// until: for a waiting pin, when the owner's time to answer ends, in seconds by this phone's clock; a strip under the label runs down to it.
// best: the AI's best choice for the guest; it wears the two-colour ring of the AI and a ✦.
// order: the stop's number on the cleaner's route of the day; progress: how far a cleaning under way has gone (0..1), a strip that fills.
export type MapPin={key:string;point:MapPoint;label:string;tone?:PinTone;title?:string;rank?:number;until?:number;best?:boolean;order?:number;progress?:number};
export type {MapLine};
// scanning: a search is running; the map sends radar waves from the middle of what is visible.
// focus: the pin of the card the guest is looking at in the carousel: it lifts and the map flies to it.
// lines: beams from the guest's search point to the flats being asked.
// heat: demand around the owner's objects, weight 0..1; sparks: where guests are asking right now.
export type HeatPoint={point:MapPoint;weight:number};
export type MapProps={center:MapPoint;pins:MapPin[];selected?:string;focus?:string;lines?:MapLine[];heat?:HeatPoint[];sparks?:MapPoint[];onSelect?:(key:string)=>void;bottomInset?:number;topInset?:number;focusKey?:string;picking?:boolean;scanning?:boolean;onCenter?:(center:MapPoint)=>void};
type View2={center:MapPoint;zoom:number};
// The tile service asks clients to identify themselves; no account or device data is sent.
const tileHeaders={'User-Agent':'AIArenda-mobile/0.1 (+'+API_URL+')'};
const plusIcon=require('../assets/ui/plus.png'),minusIcon=require('../assets/ui/minus.png'),fitIcon=require('../assets/ui/fit.png');
export function TileMap({center,pins,selected,focus='',lines=[],heat=[],sparks=[],onSelect,bottomInset=0,topInset=0,focusKey='',picking=false,scanning=false,onCenter}:MapProps){
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
 // A card of the carousel came into view: the map flies to its pin, at no less than a street's zoom.
 useEffect(()=>{const pin=focus&&pins.find(p=>p.key===focus),point=pin&&validPoint(pin.point);if(!point||!size.w)return;moved.current=true;setView(v=>({center:point,zoom:Math.max(v.zoom,13)}));},[focus]);

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
 // The stops of a cleaner's route are never folded into a group: each keeps its number at its place on the line.
 const shown=[...groupPins(placed.filter(p=>!p.pin.order).map(({pin,x,y})=>({key:pin.key,x,y,width:pinWidth(pin.label),height:32,rank:pin.key===selected||pin.key===focus?-1:toneOrder[pin.tone||'home']*1e9+(pin.best?0:Math.max(0,Math.min(pin.rank??0,1e9-1)))}))).map(g=>({...byKey.get(g.key)!,members:g.members})),...placed.filter(p=>p.pin.order).map(p=>({...p,members:[p.pin.key]}))];
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
    {heat.map((c,i)=><HeatBlob key={'heat:'+i} weight={c.weight} {...at(c.point)}/>)}
    {!still&&sparks.map((p,i)=><Spark key={'spark:'+i} delay={i*500} {...at(p)}/>)}
    {lines.map(l=><Beam key={l.key} a={at(l.from)} b={at(l.to)} tone={l.tone} still={still}/>)}
    {(origin=>origin?<Origin {...at(origin)}/>:null)(lineOrigin(lines))}
    {!still&&leaving.filter(p=>validPoint(p.point)).map(p=><Leaving key={'gone:'+p.key+':'+p.gone} pin={p} {...at(p.point)}/>)}
    {shown.map(({pin,x,y,members})=>{const more=members.length-1,b=born.current.get(pin.key)||0;
     return <Pin key={pin.key} pin={pin} x={x} y={y} more={more} active={pin.key===selected||pin.key===focus} still={still} picking={picking} loop={loop}
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
