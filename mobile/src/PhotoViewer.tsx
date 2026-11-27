import {t} from '../../lib/i18n';
import React,{useEffect,useRef,useState} from 'react';
import {AccessibilityInfo,Animated,Image,Modal,PanResponder,Platform,Pressable,StatusBar,StyleSheet,Text,View,useWindowDimensions} from 'react-native';
import {C} from './styles';
import {Thinking} from './Thinking';
import {SafeAreaProvider,useSafeAreaInsets} from 'react-native-safe-area-context';

// A photo opened from a chat: over the whole screen on black, at its own proportions, with a close button that is always
// visible, a swipe up or down that closes it, «Назад» on Android, a two finger pinch and a double tap that zoom.
// Built on PanResponder only, so the app needs no new native module.

export type Size={width:number;height:number};
const MAX=4,DOUBLE=2.5;
const clamp=(v:number,a:number,b:number)=>Math.min(b,Math.max(a,v));
// The largest box of the photo's proportions that fits into the given one.
export function fit(photo:Size|null|undefined,box:Size):Size{
 const w=photo?.width||4,h=photo?.height||3,k=Math.min(box.width/w,box.height/h);
 return {width:Math.round(w*k),height:Math.round(h*k)};
}
// The size of a photo in a chat bubble: full width of the bubble, its own proportions, but never a thin strip nor a tower.
export function bubbleSize(photo:Size|null|undefined,maxWidth:number):Size{
 const ratio=clamp((photo?.width||4)/(photo?.height||3),.62,1.9),width=Math.round(maxWidth);
 return {width,height:Math.round(clamp(width/ratio,120,Math.round(maxWidth*1.35)))};
}
// Sizes of photos already measured, so a bubble keeps its shape when the list redraws it.
const sizes=new Map<string,Size>();
export function usePhotoSize(uri:string,known?:Size|null){
 const [size,setSize]=useState<Size|null>(known||sizes.get(uri)||null);
 useEffect(()=>{
  if(known?.width){setSize(known);return;}
  if(!uri)return;const cached=sizes.get(uri);if(cached){setSize(cached);return;}
  let live=true;Image.getSize(uri,(width,height)=>{if(!width||!height)return;const value={width,height};if(sizes.size>200)sizes.clear();sizes.set(uri,value);if(live)setSize(value);},()=>{});
  return()=>{live=false;};
 },[uri,known?.width,known?.height]);
 return size;
}

// onPrev/onNext: a set of photos (a cleaning report, the photos of a place) is leafed by a swipe to the side or with «‹ ›».
// loading: the photo is still on its way; the viewer opens at once with a quiet spinner instead of waiting.
// id: which photo of the set this is, so a new one starts fresh even before its picture has come; alt: its spoken name.
// dots: where this photo is in its set, as thin marks at the bottom (a set of up to a dozen).
type Props={dots?:{count:number;index:number};id?:string;alt?:string;loading?:boolean;uri:string;visible:boolean;onClose:()=>void;size?:Size|null;title?:string;caption?:string;onPrev?:()=>void;onNext?:()=>void};
export function PhotoViewer(props:Props){
 return <Modal visible={props.visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent supportedOrientations={['portrait','landscape']} onRequestClose={props.onClose}>
  {props.visible&&<SafeAreaProvider><Viewer key={props.id||props.uri} {...props}/></SafeAreaProvider>}
 </Modal>;
}

function Viewer({dots,uri,alt,loading,onClose,size:known,title,caption,onPrev,onNext}:Props){
 // The viewer's own area as laid out, so the photo is centred even where the window and the modal differ.
 const screen=useWindowDimensions(),[area,setArea]=useState<Size|null>(null),window=area||screen,insets=useSafeAreaInsets(),size=usePhotoSize(uri,known),box=fit(size,window);
 const [chrome,setChrome]=useState(true),[reduce,setReduce]=useState(false),[failed,setFailed]=useState(false);
 const scale=useRef(new Animated.Value(1)).current,x=useRef(new Animated.Value(0)).current,y=useRef(new Animated.Value(0)).current,drop=useRef(new Animated.Value(0)).current,slide=useRef(new Animated.Value(0)).current;
 // The gesture's own numbers. The view is moved by translate, then scaled around its centre.
 const g=useRef({scale:1,x:0,y:0,mode:'' as ''|'drop'|'pan'|'pinch',from:{scale:1,x:0,y:0,px:0,py:0,dist:1},start:0,moved:0,multi:false,lastTap:0,tapTimer:null as any,closing:false,axis:'' as ''|'x'|'y'}).current;
 const view=useRef({window,box,reduce,onClose,onPrev,onNext}).current;view.window=window;view.box=box;view.reduce=reduce;view.onClose=onClose;view.onPrev=onPrev;view.onNext=onNext;
 useEffect(()=>{void AccessibilityInfo.isReduceMotionEnabled().then(setReduce);return()=>clearTimeout(g.tapTimer);},[]);
 // How far the photo may move at this zoom so that its edge never leaves the screen's edge.
 const bounds=(s:number)=>({x:Math.max(0,(view.box.width*s-view.window.width)/2),y:Math.max(0,(view.box.height*s-view.window.height)/2)});
 function settle(s:number,nx:number,ny:number,animated=true){
  const k=clamp(s,1,MAX),b=bounds(k),tx=clamp(nx,-b.x,b.x),ty=clamp(ny,-b.y,b.y);g.scale=k;g.x=tx;g.y=ty;
  if(!animated||view.reduce){scale.setValue(k);x.setValue(tx);y.setValue(ty);return;}
  Animated.parallel([Animated.spring(scale,{toValue:k,useNativeDriver:true,bounciness:0,speed:18}),Animated.spring(x,{toValue:tx,useNativeDriver:true,bounciness:0,speed:18}),Animated.spring(y,{toValue:ty,useNativeDriver:true,bounciness:0,speed:18})]).start();
 }
 function close(direction=0){
  if(g.closing)return;g.closing=true;
  if(!direction||view.reduce){view.onClose();return;}
  Animated.timing(drop,{toValue:direction*view.window.height,duration:180,useNativeDriver:true}).start(()=>view.onClose());
 }
 // A double tap zooms in on the tapped point, or back out.
 function zoomAt(px:number,py:number){
  if(g.scale>1.05){settle(1,0,0);return;}
  const cx=view.window.width/2,cy=view.window.height/2;settle(DOUBLE,(px-cx)*(1-DOUBLE),(py-cy)*(1-DOUBLE));
 }
 const begin=(touches:any[])=>{
  const [a,b]=touches;g.from={scale:g.scale,x:g.x,y:g.y,px:a.pageX,py:a.pageY,dist:1};
  g.axis='';
  if(b){g.mode='pinch';g.from.px=(a.pageX+b.pageX)/2;g.from.py=(a.pageY+b.pageY)/2;g.from.dist=Math.max(1,Math.hypot(a.pageX-b.pageX,a.pageY-b.pageY));}
  else g.mode=g.scale>1.01?'pan':'drop';
 };
 const responder=useRef(PanResponder.create({
  onStartShouldSetPanResponder:()=>true,onMoveShouldSetPanResponder:()=>true,onPanResponderTerminationRequest:()=>false,onShouldBlockNativeResponder:()=>true,
  onPanResponderGrant:e=>{g.start=Date.now();g.moved=0;g.multi=e.nativeEvent.touches.length>1;begin(e.nativeEvent.touches as any);},
  onPanResponderMove:(e,s)=>{
   const touches=e.nativeEvent.touches as any[];if(!touches.length)return;
   if(touches.length>1)g.multi=true;
   const want=touches.length>1?'pinch':g.scale>1.01?'pan':'drop';
   // A finger added or lifted mid gesture: carry on from where the photo is now.
   if(want!==g.mode&&!(g.mode==='drop'&&want==='pan'))begin(touches);
   g.moved=Math.max(g.moved,Math.abs(s.dx),Math.abs(s.dy));
   const [a,b]=touches;
   if(g.mode==='pinch'&&b){
    const px=(a.pageX+b.pageX)/2,py=(a.pageY+b.pageY)/2,dist=Math.max(1,Math.hypot(a.pageX-b.pageX,a.pageY-b.pageY));
    const k=clamp(g.from.scale*dist/g.from.dist,.7,MAX+1),cx=view.window.width/2,cy=view.window.height/2;
    // The point between the fingers stays under the fingers.
    const qx=(g.from.px-cx-g.from.x)/g.from.scale,qy=(g.from.py-cy-g.from.y)/g.from.scale;
    g.scale=k;g.x=px-cx-qx*k;g.y=py-cy-qy*k;scale.setValue(k);x.setValue(g.x);y.setValue(g.y);
   }else if(g.mode==='pan'){
    g.x=g.from.x+a.pageX-g.from.px;g.y=g.from.y+a.pageY-g.from.py;x.setValue(g.x);y.setValue(g.y);
   }else if(g.mode==='drop'){
    // Unzoomed, the first clear move decides: sideways leafs the set (when there is one), up or down closes.
    const dx=a.pageX-g.from.px,dy=a.pageY-g.from.py;
    if(!g.axis&&Math.max(Math.abs(dx),Math.abs(dy))>10)g.axis=Math.abs(dx)>Math.abs(dy)&&(view.onPrev||view.onNext)?'x':'y';
    // Past the first or the last photo the set gives only a little, as a page that has nothing behind it.
    if(g.axis==='x')slide.setValue((dx<0?view.onNext:view.onPrev)?dx:dx/4);else if(g.axis==='y')drop.setValue(dy);
   }
  },
  onPanResponderRelease:(_e,s)=>{
   const mode=g.mode;g.mode='';
   // A gesture with two fingers is never a tap, even a quick pinch whose centre stayed still: it always settles.
   if(!g.multi&&g.moved<10&&Date.now()-g.start<300){
    const now=Date.now();
    if(now-g.lastTap<300){clearTimeout(g.tapTimer);g.lastTap=0;zoomAt(s.x0,s.y0);}
    else{g.lastTap=now;clearTimeout(g.tapTimer);g.tapTimer=setTimeout(()=>setChrome(v=>!v),300);}
    if(mode==='drop')drop.setValue(0);return;
   }
   if(mode==='drop'&&g.axis==='x'){
    const go=s.dx<0?view.onNext:view.onPrev;
    if(go&&(Math.abs(s.dx)>view.window.width*.22||Math.abs(s.vx)>.6)){
     if(view.reduce){go();return;}
     Animated.timing(slide,{toValue:(s.dx<0?-1:1)*view.window.width,duration:160,useNativeDriver:true}).start(()=>go());
    }else if(view.reduce)slide.setValue(0);else Animated.spring(slide,{toValue:0,useNativeDriver:true,bounciness:0,speed:20}).start();
    return;
   }
   if(mode==='drop'){
    const dy=s.dy;if(Math.abs(dy)>110||Math.abs(s.vy)>1.1)close(dy<0?-1:1);
    else if(view.reduce)drop.setValue(0);else Animated.spring(drop,{toValue:0,useNativeDriver:true,bounciness:0,speed:20}).start();
    return;
   }
   settle(g.scale,g.x,g.y);
  },
  onPanResponderTerminate:()=>{g.mode='';drop.setValue(0);slide.setValue(0);settle(g.scale,g.x,g.y);},
 })).current;
 const fade=drop.interpolate({inputRange:[-400,0,400],outputRange:[.25,1,.25],extrapolate:'clamp'});
 return <View style={v.root} onLayout={e=>{const {width,height}=e.nativeEvent.layout;if(width&&height)setArea({width,height});}} accessibilityViewIsModal onAccessibilityEscape={()=>close()}>
  {Platform.OS!=='web'&&<StatusBar barStyle="light-content" animated/>}
  <Animated.View style={[StyleSheet.absoluteFill,v.backdrop,{opacity:fade}]}/>
  <View style={StyleSheet.absoluteFill} {...responder.panHandlers}>
   <Animated.View style={[v.stage,{transform:[{translateX:slide},{translateY:drop}]}]}>
    {loading?<Thinking size="lg" color={C.onAccent}/>:failed||!uri?<Text style={v.failed}>{t('Не удалось открыть фото')}</Text>:<Animated.Image source={{uri}} accessibilityLabel={alt||caption||t('Фотография сообщения')} resizeMode="contain" onError={()=>setFailed(true)} style={{width:box.width,height:box.height,transform:[{translateX:x},{translateY:y},{scale}]}}/>}
   </Animated.View>
  </View>
  {chrome&&<View pointerEvents="box-none" style={[v.top,{paddingTop:Math.max(insets.top,12)+4,paddingLeft:Math.max(insets.left,12),paddingRight:Math.max(insets.right,12)}]}>
   {/* As Telegram's viewer: who and when in the middle, «×» on the right, on black. */}
   <View style={v.side}/>
   <Text numberOfLines={1} style={v.title}>{title||''}</Text>
   <Pressable accessibilityRole="button" accessibilityLabel={t('Закрыть фото')} hitSlop={8} onPress={()=>close()} style={({pressed})=>[v.close,pressed&&v.pressed]}><View style={[v.cross,{transform:[{rotate:'45deg'}]}]}/><View style={[v.cross,{transform:[{rotate:'-45deg'}]}]}/></Pressable>
  </View>}
  {chrome&&[[onPrev,'‹',t('Предыдущее фото'),{left:Math.max(insets.left,8)}],[onNext,'›',t('Следующее фото'),{right:Math.max(insets.right,8)}]].map(([go,mark,label,side]:any)=>!!go&&<Pressable key={mark} accessibilityRole="button" accessibilityLabel={label} hitSlop={8} onPress={go} style={({pressed})=>[v.close,v.side2,side,pressed&&v.pressed]}><Text style={v.mark}>{mark}</Text></Pressable>)}
  {chrome&&!caption&&!!dots&&dots.count>1&&dots.count<=12&&<View pointerEvents="none" style={[v.dots,{bottom:Math.max(insets.bottom,12)+12}]}>{Array.from({length:dots.count},(_,k)=><View key={k} style={[v.dot,k===dots.index&&v.dotOn]}/>)}</View>}
  {chrome&&!!caption&&<View pointerEvents="none" style={[v.bottom,{paddingBottom:Math.max(insets.bottom,12)+8,paddingLeft:Math.max(insets.left,16),paddingRight:Math.max(insets.right,16)}]}><Text numberOfLines={4} style={v.caption}>{caption}</Text></View>}
 </View>;
}

const v=StyleSheet.create({
 root:{flex:1},backdrop:{backgroundColor:C.ink},side:{width:44},stage:{flex:1,alignItems:'center',justifyContent:'center'},
 top:{position:'absolute',left:0,right:0,top:0,flexDirection:'row',alignItems:'center',gap:12,paddingBottom:8},
 close:{width:44,height:44,borderRadius:24,backgroundColor:'rgba(255,255,255,0.18)',alignItems:'center',justifyContent:'center'},
 side2:{position:'absolute',top:'50%',marginTop:-20},mark:{color:C.onAccent,fontSize:28,lineHeight:32},
 cross:{position:'absolute',width:20,height:2,borderRadius:1,backgroundColor:C.onAccent},pressed:{opacity:.6},
 title:{flex:1,textAlign:'center',color:C.onAccent,fontSize:16,lineHeight:20,fontWeight:'600'},
 bottom:{position:'absolute',left:0,right:0,bottom:0,paddingTop:12,backgroundColor:'rgba(0,0,0,0.45)'},
 dots:{position:'absolute',left:0,right:0,flexDirection:'row',justifyContent:'center',gap:8},dot:{width:6,height:6,borderRadius:4,backgroundColor:'rgba(255,255,255,0.35)'},dotOn:{width:18,backgroundColor:C.onAccent},
 caption:{color:C.onAccent,fontSize:16,lineHeight:24},failed:{color:C.onAccent,fontSize:16},
});
