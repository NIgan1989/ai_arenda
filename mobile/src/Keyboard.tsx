import {t} from '../../lib/i18n';
import React,{createContext,useCallback,useContext,useEffect,useRef,useState,type MutableRefObject,type RefObject} from 'react';
import {Keyboard,Platform,Pressable,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import {C,type} from './styles';
import {T} from './tokens';

// One way to live with the keyboard on every screen of the app:
// - the screen is shortened by the keyboard (KeyboardAvoidingView at the root of each screen),
// - the field being typed in, and the list of suggestions under it, are scrolled into view once and smoothly,
// - the keyboard hides by a tap on an empty place, by dragging the page, or by «Готово» on the strip above it
//   (number pads and multi-line fields of iPhone have no key for that).

type Reveal=(node:any,room?:number)=>void;
const RevealContext=createContext<Reveal|null>(null);
export const RevealProvider=RevealContext.Provider;
// The nearest scrolling page: a field asks it to show itself (and what opens under it) above the keyboard.
export const useReveal=()=>useContext(RevealContext);

const isNative=Platform.OS==='ios'||Platform.OS==='android';
type Frame={x:number;y:number;w:number;h:number};
const frameOf=(node:any)=>new Promise<Frame|null>(done=>{
 if(!node?.measureInWindow){done(null);return;}
 try{node.measureInWindow((x:number,y:number,w:number,h:number)=>done(Number.isFinite(y)?{x,y,w,h}:null));}catch{done(null);}
});

// The page scrolls only as much as needed: the bottom of the field (plus `room`) comes above the keyboard, and the
// top of the field never leaves the page. Nothing moves when the field is already in view, so the page does not jump.
// auto: also reveal whatever field the keyboard opened for (the main pages); a sheet only reveals its own fields.
export function useKeyboardReveal(scroll:RefObject<ScrollView|null>,scrollY:MutableRefObject<number>,auto=true):Reveal{
 const top=useRef(Infinity);
 const reveal=useCallback<Reveal>((node,room=16)=>{
  void (async()=>{
   const [field,page]=await Promise.all([frameOf(node),frameOf(scroll.current)]);
   if(!field||!page||page.h<=0)return;
   // A field that is not on this page (above it, or beside it) is not this page's business.
   if(field.y<page.y-4||field.x+field.w<page.x||field.x>page.x+page.w)return;
   const bottom=Math.min(page.y+page.h,top.current)-room,margin=12;
   let move=field.y+field.h-bottom;
   if(move<=0)return;
   move=Math.min(move,field.y-(page.y+margin));
   if(move<4)return;
   scroll.current?.scrollTo({y:Math.max(0,scrollY.current+move),animated:true});
  })();
 },[scroll,scrollY]);
 useEffect(()=>{
  if(!isNative)return;
  const show=Keyboard.addListener('keyboardDidShow',e=>{
   top.current=e.endCoordinates?.screenY??Infinity;
   if(!auto)return;
   const input=TextInput.State.currentlyFocusedInput?.();
   if(input)setTimeout(()=>reveal(input),Platform.OS==='android'?80:0);
  });
  const hide=Keyboard.addListener('keyboardDidHide',()=>{top.current=Infinity;});
  return()=>{show.remove();hide.remove();};
 },[reveal,auto]);
 return reveal;
}

export function useKeyboardOpen(){
 const [open,setOpen]=useState(false);
 useEffect(()=>{
  if(!isNative)return;
  // iPhone tells before the keyboard moves, so the strip rises together with it.
  const show=Keyboard.addListener(Platform.OS==='ios'?'keyboardWillShow':'keyboardDidShow',()=>setOpen(true));
  const hide=Keyboard.addListener(Platform.OS==='ios'?'keyboardWillHide':'keyboardDidHide',()=>setOpen(false));
  return()=>{show.remove();hide.remove();};
 },[]);
 return open;
}

// The strip right above the keyboard with «Готово». It is the last child of the screen's KeyboardAvoidingView, so it
// stands on the keyboard and takes the place of nothing on the page.
export function KeyboardBar({hidden=false}:{hidden?:boolean}){
 const open=useKeyboardOpen();
 if(!open||hidden)return null;
 return <View style={k.bar}>
  <Pressable accessibilityRole="button" accessibilityLabel={t('Скрыть клавиатуру')} hitSlop={8} onPress={()=>Keyboard.dismiss()} style={({pressed})=>[k.done,pressed&&k.pressed]}>
   <Text style={k.doneText}>{t('Готово')}</Text>
  </Pressable>
 </View>;
}

const k=StyleSheet.create({
 bar:{flexDirection:'row',justifyContent:'flex-end',alignItems:'center',minHeight:40,paddingHorizontal:8,borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:C.line,backgroundColor:C.surfaceAlt},
 done:{minHeight:36,paddingHorizontal:12,borderRadius:T.radius.md,alignItems:'center',justifyContent:'center'},pressed:{backgroundColor:C.accentSoft},
 doneText:{...type.body,color:C.accent,fontWeight:'600'},
});
