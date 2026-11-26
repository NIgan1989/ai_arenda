import {t} from '../../lib/i18n';
import React,{useEffect,useRef,useState} from 'react';
import {Image,Modal,Platform,Pressable,StyleSheet,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {AudioQuality,IOSOutputFormat,createAudioPlayer,requestRecordingPermissionsAsync,setAudioModeAsync,useAudioRecorder,useAudioRecorderState,type AudioPlayer,type RecordingOptions} from 'expo-audio';
import {File,Paths} from 'expo-file-system';
import {LiveMap} from './LiveMap';
import {locate} from './here';
import {request} from './api';
import {C} from './styles';
import {T} from './tokens';
import {TILE,visibleTiles} from './map-math';
import {MicIcon as FieldMicIcon,PinIcon} from './ChatIcons';
import {uid,type Role} from './model';

// The chat like a messenger: a voice message (up to a minute) and a point on our own map.
// Both go through the service's chat (lib/process-discussions.ts), so nobody needs WhatsApp to say «I am at the door».
export const VOICE_MAX_MS=60000;
// A short voice: mono AAC at 32 kbit/s is about 240 KB a minute, small enough for a chat message.
const VOICE:RecordingOptions={extension:'.m4a',sampleRate:22050,numberOfChannels:1,bitRate:32000,
 android:{extension:'.m4a',outputFormat:'mpeg4',audioEncoder:'aac'},
 ios:{audioQuality:AudioQuality.LOW,outputFormat:IOSOutputFormat.MPEG4AAC},
 web:{mimeType:'audio/webm',bitsPerSecond:32000}};
const seconds=(ms:number)=>{const s=Math.max(0,Math.round(ms/1000));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');};

async function dataUri(uri:string){
 if(Platform.OS==='web'){const blob=await (await fetch(uri)).blob();return await new Promise<string>((done,fail)=>{const r=new FileReader();r.onload=()=>done(String(r.result).replace(/^data:audio\/webm;codecs=opus;/,'data:audio/webm;'));r.onerror=()=>fail(r.error);r.readAsDataURL(blob);});}
 return 'data:audio/mp4;base64,'+await new File(uri).base64();
}

// A recorded voice stays here until the chat confirms it: a send that fails (the network dropped) keeps it with
// «Повторить» and «Удалить», and a repeat goes with the same key, so the chat never gets it twice (audit 2026-11-22).
type Voice={data:string;ms:number;key:string};
const unsent=new Map<string,Voice>();
// Kept per account, role and chat; another account on the same phone never gets them (cleared when the account changes).
export function clearUnsentVoices(){unsent.clear();}
// The microphone button: a tap starts the recording, a second tap sends it, «✕» throws it away.
export function VoiceButton({draftKey,disabled,onSend,onError}:{draftKey:string;disabled:boolean;onSend:(voice:Voice)=>Promise<boolean>;onError:(message:string)=>void}){
 const recorder=useAudioRecorder(VOICE),state=useAudioRecorderState(recorder,250),[busy,setBusy]=useState(false),[failed,setFailed]=useState<Voice|null>(()=>unsent.get(draftKey)||null);
 const recording=state.isRecording,ms=state.durationMillis||0;
 useEffect(()=>{if(recording&&ms>=VOICE_MAX_MS)void finish(true);},[recording,ms]);// eslint-disable-line react-hooks/exhaustive-deps
 // The chat keys this button by its room: leaving the room throws the recording away, so it never goes to another chat.
 useEffect(()=>()=>{try{if(recorder.isRecording)void recorder.stop().catch(()=>{});}catch{}},[recorder]);
 async function start(){
  if(busy||disabled)return;setBusy(true);
  try{
   const permission=await requestRecordingPermissionsAsync();if(!permission.granted)throw Error(t('Доступ к микрофону не разрешён. Разрешите его в настройках телефона.'));
   await setAudioModeAsync({allowsRecording:true,playsInSilentMode:true});await recorder.prepareToRecordAsync();recorder.record();
  }catch(e){onError(e instanceof Error&&e.message?e.message:t('Не удалось начать запись.'));}finally{setBusy(false);}
 }
 async function finish(send:boolean){
  if(busy)return;setBusy(true);const length=ms;
  try{
   await recorder.stop();await setAudioModeAsync({allowsRecording:false,playsInSilentMode:true});
   if(!send||!recorder.uri)return;if(length<700)throw Error(t('Слишком коротко. Удерживайте запись хотя бы секунду.'));
   const voice={data:await dataUri(recorder.uri),ms:Math.min(length,VOICE_MAX_MS),key:uid()};unsent.set(draftKey,voice);
   await deliver(voice);
  }catch(e){onError(e instanceof Error&&e.message?e.message:t('Голосовое сообщение не отправлено.'));}finally{setBusy(false);}
 }
 async function deliver(voice:Voice){
  let sent=false;try{sent=await onSend(voice);}finally{if(sent){unsent.delete(draftKey);setFailed(null);}else setFailed(voice);}
 }
 async function retry(){if(busy||!failed)return;setBusy(true);try{await deliver(failed);}finally{setBusy(false);}}
 function drop(){unsent.delete(draftKey);setFailed(null);}
 if(recording)return <View style={v.recording}>
  <Pressable accessibilityRole="button" accessibilityLabel={t('Удалить запись')} onPress={()=>void finish(false)} style={({pressed})=>[v.round,v.cancel,pressed&&v.pressed]}><Text style={v.cancelText}>✕</Text></Pressable>
  <View style={v.live} accessibilityLabel={t('Запись {time} из 1:00',{time:seconds(ms)})}><View style={v.dot}/><Text style={v.liveText}>{seconds(ms)}</Text><View style={v.limit}><View style={[v.limitFill,{width:`${Math.min(1,ms/VOICE_MAX_MS)*100}%`}]}/></View></View>
  <Pressable accessibilityRole="button" accessibilityLabel={t('Отправить голосовое')} onPress={()=>void finish(true)} style={({pressed})=>[v.round,v.send,pressed&&v.pressed]}><Text style={v.sendText}>↑</Text></Pressable>
 </View>;
 if(failed)return <View style={v.recording}>
  <Pressable accessibilityRole="button" accessibilityLabel={t('Удалить голосовое')} disabled={busy} onPress={drop} style={({pressed})=>[v.round,v.cancel,pressed&&v.pressed]}><Text style={v.cancelText}>✕</Text></Pressable>
  <View style={v.live}><Text style={[v.liveText,{color:C.danger}]} numberOfLines={2}>{t('Голосовое {time} не отправлено',{time:seconds(failed.ms)})}</Text></View>
  <Pressable accessibilityRole="button" accessibilityLabel={t('Повторить отправку голосового')} disabled={busy||disabled} onPress={()=>void retry()} style={({pressed})=>[v.retry,(busy||disabled)&&v.disabled,pressed&&v.pressed]}><Text style={v.retryText}>{busy?'…':t('Повторить')}</Text></Pressable>
 </View>;
 return <Pressable accessibilityRole="button" accessibilityLabel={t('Записать голосовое')} hitSlop={4} disabled={disabled||busy} onPress={()=>void start()} style={({pressed})=>[v.icon,(disabled||busy)&&v.disabled,pressed&&v.pressed]}><FieldMicIcon color={C.muted}/></Pressable>;
}

// A voice message in the chat: play and pause, with its length. The recording is fetched only when played.
export function VoiceBubble({roomId,seq,ms,role}:{roomId:string;seq:number;ms:number;role:Role;mine:boolean}){
 const player=useRef<AudioPlayer|null>(null),[playing,setPlaying]=useState(false),[at,setAt]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>()=>{player.current?.remove();player.current=null;},[]);
 async function toggle(){
  if(busy)return;setError('');
  if(player.current){if(player.current.playing){player.current.pause();setPlaying(false);}else{if(player.current.currentTime*1000>=ms-300)await player.current.seekTo(0);player.current.play();setPlaying(true);}return;}
  setBusy(true);
  try{
   const r=await request('/api/operations/discussion/audio',{roomId,seq},undefined,undefined,role);
   let uri=String(r.data);
   if(Platform.OS!=='web'){const file=new File(Paths.cache,'voice-'+roomId.replace(/\W/g,'')+'-'+seq+'.m4a');if(!file.exists){file.create();file.write(uri.slice(uri.indexOf(',')+1),{encoding:'base64'});}uri=file.uri;}
   await setAudioModeAsync({playsInSilentMode:true,allowsRecording:false});
   const p=createAudioPlayer({uri},{updateInterval:250});player.current=p;
   p.addListener('playbackStatusUpdate',s=>{setAt(Math.round((s.currentTime||0)*1000));if(s.didJustFinish){setPlaying(false);setAt(0);}else setPlaying(!!s.playing);});
   p.play();setPlaying(true);
  }catch(e){setError(e instanceof Error&&e.message?e.message:t('Не удалось включить запись.'));}finally{setBusy(false);}
 }
 const share=ms?Math.min(1,at/ms):0;
 return <View style={v.bubble}>
  {/* ▶, the wave and the time in one row, as in a messenger (board «Экраны старой версии», 2026-11-26). */}
  <View style={v.voiceRow}><Pressable accessibilityRole="button" accessibilityLabel={playing?t('Пауза'):t('Слушать голосовое, {time}',{time:seconds(ms)})} onPress={()=>void toggle()} style={({pressed})=>[v.play,pressed&&v.pressed]}><Text style={v.playText}>{busy?'…':playing?'❚❚':'▶'}</Text></Pressable>
   <View style={v.wave}>{waveOf(seq,ms).map((height,i,all)=><View key={i} style={[v.waveBar,{height},i/all.length<share&&v.waveBarOn]}/>)}</View><Text style={v.time}>{seconds(playing||at?at:ms)}</Text></View>
  {!!error&&<Text style={v.error}>{error}</Text>}
 </View>;
}

// «Где я»: the phone's point, sent as a pin; the other side opens it on the app's own map.
export async function myPlace(){
 const here=await locate({ask:'always',precise:true});
 const point=here.fix?.point;
 if(!point)throw Error(here.status==='denied'||here.status==='blocked'?t('Доступ к геопозиции не разрешён. Разрешите его в настройках телефона.'):here.status==='off'?t('Включите геолокацию на телефоне.'):t('Не удалось определить, где вы. Попробуйте ещё раз на улице.'));
 return {lat:point[1],lon:point[0]};
}
export function PlaceButton({disabled,note,onPress}:{disabled:boolean;note?:string;onPress:()=>void}){
 return <Pressable accessibilityRole="button" accessibilityLabel={note?t('Отправить точку. {v}',{v:note}):t('Отправить мою точку на карте')} hitSlop={4} disabled={disabled} onPress={onPress} style={({pressed})=>[v.icon,disabled&&v.disabled,pressed&&v.pressed]}><PinIcon color={C.muted}/></Pressable>;
}
// The point is shown before it goes: where it is, and to whom (audit 2026-11-22: one tap sent it at once).
export function PlacePreview({place,to,busy,error,onSend,onCancel}:{place:{lat:number;lon:number}|null;to:string;busy:boolean;error?:string;onSend:()=>void;onCancel:()=>void}){
 const point:[number,number]|null=place?[place.lon,place.lat]:null;
 return <Modal visible={!!place} animationType="slide" onRequestClose={onCancel}>
  <SafeAreaView style={v.mapScreen} edges={['top','bottom']}>
   <View style={v.mapHead}><View style={v.round}/><Text accessibilityRole="header" style={v.mapTitle}>{t('Ваша точка')}</Text><Pressable accessibilityRole="button" accessibilityLabel={t('Не отправлять точку')} onPress={onCancel} style={({pressed})=>[v.round,v.close,pressed&&v.pressed]}><Text style={v.cancelText}>✕</Text></Pressable></View>
   <View style={{flex:1}}>{point&&<LiveMap center={point} pins={[{key:'place',point,label:t('Я здесь'),tone:'active'}]} focus="place" focusKey="place"/>}</View>
   <View style={v.previewFoot}>
    <Text style={v.placeNote}>{t('Увидит только {name}',{name:to})}</Text>
    {!!error&&<Text accessibilityRole="alert" style={[v.placeNote,{color:C.danger}]}>{error}</Text>}
    <Pressable accessibilityRole="button" accessibilityLabel={t('Отправить точку: {name}',{name:to})} disabled={busy} onPress={onSend} style={({pressed})=>[v.sendWide,busy&&v.disabled,pressed&&v.pressed]}><Text style={v.retryText}>{busy?'…':t('Отправить точку')}</Text></Pressable>
   </View>
  </SafeAreaView>
 </Modal>;
}
export function PlaceBubble({place}:{place:{lat:number;lon:number};mine:boolean}){
 const [open,setOpen]=useState(false),point:[number,number]=[place.lon,place.lat];
 return <>
  {/* A piece of the map with the pin right in the bubble, as Telegram's location (board «Экраны старой версии»). */}
  <Pressable accessibilityRole="button" accessibilityLabel={t('Точка на карте. Открыть')} onPress={()=>setOpen(true)} style={({pressed})=>[v.placeMap,pressed&&v.pressed]}>
   <MiniMap point={point}/>
  </Pressable>
  <Modal visible={open} animationType="slide" onRequestClose={()=>setOpen(false)}>
   <SafeAreaView style={v.mapScreen} edges={['top','bottom']}>
    <View style={v.mapHead}><View style={v.round}/><Text accessibilityRole="header" style={v.mapTitle}>{t('Точка на карте')}</Text><Pressable accessibilityRole="button" accessibilityLabel={t('Закрыть карту')} onPress={()=>setOpen(false)} style={({pressed})=>[v.round,v.close,pressed&&v.pressed]}><Text style={v.cancelText}>✕</Text></Pressable></View>
    <View style={{flex:1}}>{open&&<LiveMap center={point} pins={[{key:'place',point,label:t('Здесь'),tone:'active'}]} focus="place" focusKey="place"/>}</View>
   </SafeAreaView>
  </Modal>
 </>;
}

// The wave of a voice message: the same bars every time for the same message (it is not the sound itself, the
// recording is fetched only when played), about one bar per second and a half, between 16 and 32 bars.
function waveOf(seq:number,ms:number){const n=Math.max(16,Math.min(32,Math.round(ms/1500)));let x=(seq*2654435761)>>>0;return Array.from({length:n},()=>{x=(x*1103515245+12345)>>>0;return 6+((x>>>16)%20);});}
// A still piece of the map around the point, from the same tiles as the app's map (TileMap.tsx), with the pin in the middle.
const MINI={width:232,height:140,zoom:15},tileHeaders={'User-Agent':'AIArenda-mobile/0.1'};
function MiniMap({point}:{point:[number,number]}){
 const tiles=visibleTiles(point,MINI.zoom,MINI.width,MINI.height);
 return <View style={{width:MINI.width,height:MINI.height}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{tiles.map(x=><Image key={x.key} source={{uri:'https://tile.openstreetmap.org/'+MINI.zoom+'/'+x.x+'/'+x.y+'.png',headers:tileHeaders}} style={[v.tile,{left:x.left,top:x.top}]}/>)}<View style={[v.pinDot,{left:MINI.width/2,top:MINI.height/2}]}/></View>;
}

// The call screen's microphone; the message field draws its own in ChatIcons.
export function MicIcon({color=C.muted}:{color?:string}){return <View style={{alignItems:'center'}}><View style={{width:10,height:15,borderRadius:4,borderWidth:2,borderColor:color}}/><View style={{width:14,height:6,borderBottomLeftRadius:8,borderBottomRightRadius:8,borderWidth:2,borderTopWidth:0,borderColor:color,marginTop:-4}}/><View style={{width:2,height:3,backgroundColor:color}}/></View>;}

const v=StyleSheet.create({
 icon:{width:40,height:48,alignItems:'center',justifyContent:'center'},disabled:{opacity:.4},pressed:{opacity:.7},
 // Over the whole message field while recording, as in a messenger.
 recording:{position:'absolute',left:0,right:0,top:0,bottom:0,zIndex:2,flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:8,borderRadius:24,backgroundColor:C.surface},
 round:{width:44,height:44,borderRadius:24,alignItems:'center',justifyContent:'center'},
 cancel:{backgroundColor:C.surfaceAlt},cancelText:{fontSize:18,color:C.ink,fontWeight:'600'},
 send:{backgroundColor:C.accent},sendText:{fontSize:22,color:C.onAccent,fontWeight:'700'},
 live:{flex:1,flexDirection:'row',alignItems:'center',gap:8},dot:{width:8,height:8,borderRadius:4,backgroundColor:C.danger},liveText:{fontSize:16,color:C.ink,fontWeight:'600',fontVariant:['tabular-nums'],minWidth:40},
 limit:{flex:1,height:2,borderRadius:1,backgroundColor:C.line,overflow:'hidden'},limitFill:{height:2,backgroundColor:C.ink},
 retry:{minHeight:44,paddingHorizontal:16,borderRadius:24,backgroundColor:C.accent,alignItems:'center',justifyContent:'center'},retryText:{fontSize:16,color:C.onAccent,fontWeight:'700'},
 bubble:{minWidth:220,gap:4},
 voiceRow:{flexDirection:'row',alignItems:'center',gap:8},
 play:{width:36,height:36,borderRadius:16,backgroundColor:C.ink,alignItems:'center',justifyContent:'center'},playText:{color:C.onAccent,fontSize:14,fontWeight:'700'},
 wave:{flex:1,height:28,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},waveBar:{width:3,borderRadius:1.5,backgroundColor:C.lineStrong},waveBarOn:{backgroundColor:C.ink},
 time:{fontSize:12,color:C.muted,fontVariant:['tabular-nums']},error:{fontSize:12,color:C.danger},
 placeMap:{width:232,height:140,borderRadius:12,overflow:'hidden',backgroundColor:C.surfaceAlt},
 tile:{position:'absolute',width:TILE,height:TILE},pinDot:{position:'absolute',width:16,height:16,borderRadius:8,marginLeft:-8,marginTop:-8,backgroundColor:C.ink,borderWidth:3,borderColor:C.surface},
 placeTitle:{fontSize:16,fontWeight:'600',color:C.ink},placeNote:{fontSize:12,color:C.muted},
 previewFoot:{padding:16,gap:12},sendWide:{minHeight:56,borderRadius:T.radius.full,backgroundColor:C.ink,alignItems:'center',justifyContent:'center'},
 mapScreen:{flex:1,backgroundColor:C.bg},mapHead:{flexDirection:'row',alignItems:'center',gap:12,padding:12},close:{backgroundColor:C.surfaceAlt},mapTitle:{flex:1,textAlign:'center',fontSize:16,fontWeight:'700',color:C.ink},
});
