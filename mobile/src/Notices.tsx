import {t} from '../../lib/i18n';
import React,{useEffect,useRef,useState} from 'react';
import {AccessibilityInfo,Animated,Easing,Pressable,StyleSheet,Text,View} from 'react-native';
import {journalClock,journalDay} from '../../lib/ai-move-marks';
import {noticeText} from '../../lib/notice-feed';
import {RowIcon} from './AccountRows';
import {C,type} from './styles';
import {BrandEmpty} from './BrandMoments';
import {T} from './tokens';
import type {Row} from './model';

// Notices in the app are only what needs the person or concerns their money (lib/notice-feed.ts): a guest asked,
// a payment came, a cleaning is late. What the AI administrator did alone is written in its journal and shown on
// the map, and is never said aloud.

// The list in the menu, as in the concept: on top what waits for the person's decision (`waiting`, framed in gold with
// one button), then the events under the heads of their days, the newest first, each its own card. A notice reads
// «What to do. Place · why»: the first part is the title, the rest a grey line with the time; a dot marks what is new.
// A row opens the card of its booking or cleaning when the person still has it; a row with no card opens its own
// words in full. Eight rows, the rest open in place.
export type NoticeWaiting={key:string;title:string;line:string;action:string;onPress:()=>void};
export function noticeParts(text:string):[string,string]{const i=text.indexOf('. ');return i>0&&i<72?[text.slice(0,i),text.slice(i+2)]:[text,''];}
export function NoticeList({list,now,onOpen,waiting=[],fresh}:{list:Row[];now:number;onOpen?:(notice:Row)=>(()=>void)|undefined;waiting?:NoticeWaiting[];fresh?:(notice:Row)=>boolean}){
 const [all,setAll]=useState(false),[full,setFull]=useState(''),[allAsks,setAllAsks]=useState(false),shown=all?list:list.slice(0,8);
 // Three decisions at most on top, so the day's events stay in view; the rest open in place.
 const asks=waiting.length>0&&<View style={n.block}><Text accessibilityRole="header" style={n.day}>{t('Нужно ваше решение')}</Text>{(allAsks?waiting:waiting.slice(0,3)).map(w=><View key={w.key} style={n.ask}>
   <RowIcon icon="clock" tint={C.goldInk}/>
   <View style={n.text}><Text numberOfLines={2} style={n.title}>{w.title}</Text>{!!w.line&&<Text numberOfLines={2} style={n.when}>{w.line}</Text>}</View>
   <Pressable accessibilityRole="button" accessibilityLabel={w.action+': '+w.title} onPress={w.onPress} style={({pressed})=>[n.answer,pressed&&n.pressedSoft]}><Text style={n.answerText}>{w.action}</Text></Pressable>
  </View>)}{waiting.length>3&&<Pressable accessibilityRole="button" accessibilityState={{expanded:allAsks}} onPress={()=>setAllAsks(v=>!v)} style={n.more}><Text style={n.moreText}>{allAsks?t('Свернуть'):t('Ещё {n}',{n:waiting.length-3})}</Text></Pressable>}</View>;
 if(!list.length)return <>{asks}<BrandEmpty title={t('Пока тихо')} text={t('Сюда приходит только то, что ждёт вас или касается денег: заявка, оплата, заезд, отчёт об уборке. Остальное ИИ записывает в «Автопилот».')}/></>;
 let day='';
 return <View>
  {asks}
  {shown.map(v=>{
   const at=Number(v.created_at)||0,head=journalDay(at,now),first=head!==day,go=onOpen?.(v),isNew=!!fresh?.(v);day=head;
   const open=full===v.id,[title,rest]=noticeParts(noticeText(v.body));
   return <View key={v.id}>
    {first&&<Text accessibilityRole="header" style={n.day}>{head}</Text>}
    <Pressable accessibilityRole="button" accessibilityLabel={(isNew?t('Новое')+'. ':'')+noticeText(v.body)+'. '+journalClock(at)} accessibilityHint={go?t('Открыть'):undefined} accessibilityState={go?undefined:{expanded:open}} onPress={go||(()=>setFull(open?'':v.id))} style={({pressed})=>[n.line,pressed&&n.pressed]}>
     <View style={[n.dot,isNew&&n.dotOn]}/>
     <View style={n.text}><Text numberOfLines={open?undefined:1} style={[n.title,!isNew&&n.titleRead]}>{title}</Text><Text numberOfLines={open?undefined:2} style={n.when}>{[rest,journalClock(at)].filter(Boolean).join(' · ')}</Text></View>
     {!!go&&<Text style={n.go}>›</Text>}
    </Pressable>
   </View>;
  })}
  {list.length>8&&<Pressable accessibilityRole="button" accessibilityState={{expanded:all}} onPress={()=>setAll(v=>!v)} style={n.more}><Text style={n.moreText}>{all?t('Свернуть'):t('Показать все · {length}',{length:list.length})}</Text></Pressable>}
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
  <Pressable accessibilityRole="button" accessibilityLabel={t('Новое событие: {v}',{v:noticeText(notice.body)})} accessibilityHint={t('Открыть')} onPress={onPress} style={({pressed})=>[n.toastMain,pressed&&n.pressedSoft]}>
   <RowIcon icon="bell" tint={C.ink}/>
   <View style={n.toastText}><Text numberOfLines={2} style={n.toastBody}>{noticeText(notice.body)}</Text>{more>0&&<Text style={n.when}>{t('и ещё {more}',{more})}</Text>}</View>
   <Text style={n.go}>›</Text>
  </Pressable>
  <Pressable accessibilityRole="button" accessibilityLabel={t('Скрыть')} hitSlop={8} onPress={onDone} style={n.toastClose}><Text style={n.closeText}>✕</Text></Pressable>
 </Animated.View>;
}

const n=StyleSheet.create({
 block:{marginBottom:8},
 day:{paddingTop:16,paddingBottom:8,...type.caption,fontWeight:'600',color:C.muted},
 ask:{flexDirection:'row',alignItems:'center',gap:12,minHeight:T.control.primary,paddingHorizontal:12,paddingVertical:12,marginBottom:8,borderRadius:T.radius.lg,borderWidth:2,borderColor:C.gold,backgroundColor:C.surface},
 answer:{minHeight:T.control.compact,paddingHorizontal:16,borderRadius:T.radius.md,alignItems:'center',justifyContent:'center',backgroundColor:C.ink},answerText:{...type.label,color:C.onAccent,fontWeight:'600'},
 line:{flexDirection:'row',alignItems:'center',gap:12,minHeight:T.control.primary,paddingHorizontal:16,paddingVertical:12,marginBottom:8,borderRadius:T.radius.lg,backgroundColor:C.surface},pressed:{backgroundColor:C.accentSoft},pressedSoft:{opacity:.6},
 dot:{width:8,height:8,borderRadius:4,marginLeft:-4},dotOn:{backgroundColor:C.ink},
 text:{flex:1,minWidth:0,gap:2},body:{...type.label,color:C.ink},title:{...type.label,color:C.ink,fontWeight:'600'},titleRead:{fontWeight:'600'},when:{...type.caption,color:C.muted,fontVariant:['tabular-nums']},
 go:{...type.body,color:C.muted},
 more:{minHeight:T.control.touch,alignItems:'center',justifyContent:'center'},moreText:{...type.label,fontWeight:'600',color:C.ink},
 empty:{padding:16,...type.label,color:C.muted},
 toast:{position:'absolute',top:68,left:12,right:12,zIndex:120,flexDirection:'row',alignItems:'center',borderRadius:T.radius.lg,borderWidth:1,borderColor:C.accentLine,backgroundColor:C.surface,shadowColor:C.ink,shadowOffset:{width:0,height:8},shadowOpacity:.16,shadowRadius:24,elevation:8},
 toastMain:{flex:1,minWidth:0,flexDirection:'row',alignItems:'center',gap:12,minHeight:T.control.primary,paddingLeft:16,paddingVertical:8},toastText:{flex:1,minWidth:0,gap:2},toastBody:{...type.label,color:C.ink,fontWeight:'600'},
 toastClose:{width:T.control.touch,height:T.control.touch,alignItems:'center',justifyContent:'center'},closeText:{...type.label,color:C.muted},
});
