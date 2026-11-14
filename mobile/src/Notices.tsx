import React,{useEffect,useRef,useState} from 'react';
import {AccessibilityInfo,Animated,Easing,Pressable,StyleSheet,Text,View} from 'react-native';
import {journalClock,journalDay} from '../../lib/ai-move-marks';
import {noticeText} from '../../lib/notice-feed';
import {RowIcon} from './AccountRows';
import {C,type} from './styles';
import {T} from './tokens';
import type {Row} from './model';

// Notices in the app are only what needs the person or concerns their money (lib/notice-feed.ts): a guest asked,
// a payment came, a cleaning is late. What the AI administrator did alone is written in its journal and shown on
// the map, and is never said aloud.

// The list in the menu: events under the heads of their days, the newest first. A row opens the card of its booking
// or cleaning when the person still has it; a row with no card opens its own words in full. Two lines each, eight
// rows, the rest open in place.
export function NoticeList({list,now,onOpen}:{list:Row[];now:number;onOpen?:(notice:Row)=>(()=>void)|undefined}){
 const [all,setAll]=useState(false),[full,setFull]=useState(''),shown=all?list:list.slice(0,8);
 if(!list.length)return <Text style={n.empty}>Пока тихо. Сюда приходит только то, что ждёт вас или касается денег: заявка, оплата, заезд, отчёт об уборке. Остальное ИИ записывает в «Автопилот».</Text>;
 let day='';
 return <View>
  {shown.map(v=>{
   const at=Number(v.created_at)||0,head=journalDay(at,now),first=head!==day,go=onOpen?.(v);day=head;
   const open=full===v.id,body=<><View style={n.text}><Text numberOfLines={open?undefined:2} style={n.body}>{noticeText(v.body)}</Text><Text style={n.when}>{journalClock(at)}</Text></View>{!!go&&<Text style={n.go}>›</Text>}</>;
   return <View key={v.id}>
    {first&&<Text accessibilityRole="header" style={n.day}>{head.toUpperCase()}</Text>}
    <Pressable accessibilityRole="button" accessibilityHint={go?'Открыть':undefined} accessibilityState={go?undefined:{expanded:open}} onPress={go||(()=>setFull(open?'':v.id))} style={({pressed})=>[n.line,pressed&&n.pressed]}>{body}</Pressable>
   </View>;
  })}
  {list.length>8&&<Pressable accessibilityRole="button" accessibilityState={{expanded:all}} onPress={()=>setAll(v=>!v)} style={n.more}><Text style={n.moreText}>{all?'Свернуть':'Показать все · '+list.length}</Text></Pressable>}
 </View>;
}

// A new event over the map: one line under the round buttons, for eight seconds. A tap opens what it is about.
// `more` is how many other events came with it.
export function NoticeToast({notice,more=0,onPress,onDone}:{notice:Row;more?:number;onPress:()=>void;onDone:()=>void}){
 const shown=useRef(new Animated.Value(0)).current,done=useRef(onDone);done.current=onDone;
 useEffect(()=>{
  let alive=true;shown.setValue(0);
  AccessibilityInfo.isReduceMotionEnabled().catch(()=>false).then(calm=>{if(!alive)return;if(calm)shown.setValue(1);else Animated.timing(shown,{toValue:1,duration:320,easing:Easing.out(Easing.cubic),useNativeDriver:true}).start();});
  const timer=setTimeout(()=>done.current(),8000);
  return()=>{alive=false;clearTimeout(timer);};
 },[notice.id]);
 return <Animated.View style={[n.toast,{opacity:shown,transform:[{translateY:shown.interpolate({inputRange:[0,1],outputRange:[-12,0]})}]}]}>
  <Pressable accessibilityRole="button" accessibilityLabel={'Новое событие: '+noticeText(notice.body)} accessibilityHint="Открыть" onPress={onPress} style={({pressed})=>[n.toastMain,pressed&&n.pressedSoft]}>
   <RowIcon icon="bell" tint={C.accent}/>
   <View style={n.toastText}><Text numberOfLines={2} style={n.toastBody}>{noticeText(notice.body)}</Text>{more>0&&<Text style={n.when}>и ещё {more}</Text>}</View>
   <Text style={n.go}>›</Text>
  </Pressable>
  <Pressable accessibilityRole="button" accessibilityLabel="Скрыть" hitSlop={8} onPress={onDone} style={n.toastClose}><Text style={n.closeText}>✕</Text></Pressable>
 </Animated.View>;
}

const n=StyleSheet.create({
 day:{paddingHorizontal:16,paddingTop:12,paddingBottom:4,...type.caption,fontWeight:'600',letterSpacing:.5,color:C.muted},
 line:{flexDirection:'row',alignItems:'center',gap:12,minHeight:T.control.primary,paddingHorizontal:16,borderTopWidth:1,borderTopColor:C.line},pressed:{backgroundColor:C.accentSoft},pressedSoft:{opacity:.6},
 text:{flex:1,minWidth:0,gap:2,paddingVertical:8},body:{...type.label,color:C.ink},when:{...type.caption,color:C.muted,fontVariant:['tabular-nums']},
 go:{...type.body,color:C.muted},
 more:{minHeight:T.control.touch,alignItems:'center',justifyContent:'center',borderTopWidth:1,borderTopColor:C.line},moreText:{...type.label,fontWeight:'600',color:C.accent},
 empty:{padding:16,...type.label,color:C.muted},
 toast:{position:'absolute',top:68,left:12,right:12,zIndex:120,flexDirection:'row',alignItems:'center',borderRadius:T.radius.lg,borderWidth:1,borderColor:C.accentLine,backgroundColor:C.surface,shadowColor:C.ink,shadowOffset:{width:0,height:8},shadowOpacity:.16,shadowRadius:24,elevation:8},
 toastMain:{flex:1,minWidth:0,flexDirection:'row',alignItems:'center',gap:12,minHeight:T.control.primary,paddingLeft:16,paddingVertical:8},toastText:{flex:1,minWidth:0,gap:2},toastBody:{...type.label,color:C.ink,fontWeight:'600'},
 toastClose:{width:T.control.touch,height:T.control.touch,alignItems:'center',justifyContent:'center'},closeText:{...type.label,color:C.muted},
});
