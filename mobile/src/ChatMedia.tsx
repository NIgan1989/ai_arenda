import {t} from '../../lib/i18n';
import React,{useEffect,useRef,useState} from 'react';
import {Modal,Platform,Pressable,StyleSheet,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {AudioQuality,IOSOutputFormat,createAudioPlayer,requestRecordingPermissionsAsync,setAudioModeAsync,useAudioRecorder,useAudioRecorderState,type AudioPlayer,type RecordingOptions} from 'expo-audio';
import {File,Paths} from 'expo-file-system';
import {LiveMap} from './LiveMap';
import {locate} from './here';
import {request} from './api';
import {C} from './styles';
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
  <View style={v.live}><View style={v.dot}/><Text style={v.liveText}>{t('Запись {time} из 1:00',{time:seconds(ms)})}</Text></View>
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
export function VoiceBubble({roomId,seq,ms,role,mine}:{roomId:string;seq:number;ms:number;role:Role;mine:boolean}){
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
  <Pressable accessibilityRole="button" accessibilityLabel={playing?t('Пауза'):t('Слушать голосовое, {time}',{time:seconds(ms)})} onPress={()=>void toggle()} style={({pressed})=>[v.play,mine&&v.playMine,pressed&&v.pressed]}><Text style={[v.playText,mine&&v.playTextMine]}>{busy?'…':playing?'❚❚':'▶'}</Text></Pressable>
  <View style={v.track}><View style={[v.bar,mine&&v.barMine]}><View style={[v.fill,mine&&v.fillMine,{width:`${share*100}%`}]}/></View><Text style={v.time}>{seconds(playing||at?at:ms)}</Text></View>
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
   <View style={v.mapHead}><Pressable accessibilityRole="button" accessibilityLabel={t('Не отправлять точку')} onPress={onCancel} style={({pressed})=>[v.round,v.close,pressed&&v.pressed]}><Text style={v.cancelText}>‹</Text></Pressable><Text style={v.mapTitle}>{t('Ваша точка')}</Text></View>
   <View style={{flex:1}}>{point&&<LiveMap center={point} pins={[{key:'place',point,label:t('Я здесь'),tone:'active'}]} focus="place" focusKey="place"/>}</View>
   <View style={v.previewFoot}>
    <Text style={v.placeNote}>{t('Точку увидит только {name}. Она останется в истории чата.',{name:to})}</Text>
    {!!error&&<Text accessibilityRole="alert" style={[v.placeNote,{color:C.danger}]}>{error}</Text>}
    <Pressable accessibilityRole="button" accessibilityLabel={t('Отправить точку: {name}',{name:to})} disabled={busy} onPress={onSend} style={({pressed})=>[v.sendWide,busy&&v.disabled,pressed&&v.pressed]}><Text style={v.retryText}>{busy?'…':t('Отправить точку')}</Text></Pressable>
   </View>
  </SafeAreaView>
 </Modal>;
}
export function PlaceBubble({place,mine}:{place:{lat:number;lon:number};mine:boolean}){
 const [open,setOpen]=useState(false),point:[number,number]=[place.lon,place.lat];
 return <>
  <Pressable accessibilityRole="button" accessibilityLabel={t('Открыть точку на карте')} onPress={()=>setOpen(true)} style={({pressed})=>[v.place,mine&&v.placeMine,pressed&&v.pressed]}>
   <PinIcon color={C.accent}/><View style={{flex:1}}><Text style={v.placeTitle}>{t('Точка на карте')}</Text><Text style={v.placeNote}>{t('Нажмите, чтобы открыть на карте')}</Text></View>
  </Pressable>
  <Modal visible={open} animationType="slide" onRequestClose={()=>setOpen(false)}>
   <SafeAreaView style={v.mapScreen} edges={['top','bottom']}>
    <View style={v.mapHead}><Pressable accessibilityRole="button" accessibilityLabel={t('Закрыть карту')} onPress={()=>setOpen(false)} style={({pressed})=>[v.round,v.close,pressed&&v.pressed]}><Text style={v.cancelText}>‹</Text></Pressable><Text style={v.mapTitle}>{t('Точка на карте')}</Text></View>
    <View style={{flex:1}}>{open&&<LiveMap center={point} pins={[{key:'place',point,label:t('Здесь'),tone:'active'}]} focus="place" focusKey="place"/>}</View>
   </SafeAreaView>
  </Modal>
 </>;
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
 live:{flex:1,flexDirection:'row',alignItems:'center',gap:8},dot:{width:10,height:10,borderRadius:4,backgroundColor:C.danger},liveText:{fontSize:16,color:C.ink},
 retry:{minHeight:44,paddingHorizontal:16,borderRadius:24,backgroundColor:C.accent,alignItems:'center',justifyContent:'center'},retryText:{fontSize:16,color:C.onAccent,fontWeight:'700'},
 bubble:{minWidth:200,gap:4},
 play:{width:40,height:40,borderRadius:24,backgroundColor:C.accent,alignItems:'center',justifyContent:'center',position:'absolute',left:0,top:0},playMine:{backgroundColor:C.surface},
 playText:{color:C.onAccent,fontSize:14,fontWeight:'700'},playTextMine:{color:C.accent},
 track:{marginLeft:48,minHeight:40,justifyContent:'center',gap:4},
 bar:{height:4,borderRadius:2,backgroundColor:C.line,overflow:'hidden'},barMine:{backgroundColor:C.surfaceAlt},
 fill:{height:4,backgroundColor:C.accent},fillMine:{backgroundColor:C.accentPressed},
 time:{fontSize:12,color:C.muted},error:{fontSize:12,color:C.danger},
 place:{flexDirection:'row',alignItems:'center',gap:8,padding:8,borderRadius:16,backgroundColor:C.surfaceAlt,minWidth:220},placeMine:{backgroundColor:C.surface},
 placeTitle:{fontSize:16,fontWeight:'600',color:C.ink},placeNote:{fontSize:12,color:C.muted},
 previewFoot:{padding:16,gap:12},sendWide:{minHeight:56,borderRadius:16,backgroundColor:C.accent,alignItems:'center',justifyContent:'center'},
 mapScreen:{flex:1,backgroundColor:C.bg},mapHead:{flexDirection:'row',alignItems:'center',gap:12,padding:12},close:{backgroundColor:C.surfaceAlt},mapTitle:{fontSize:18,fontWeight:'700',color:C.ink},
});
