import {t} from '../../lib/i18n';
import React,{useEffect,useRef,useState} from 'react';
import {AppState,Modal,Pressable,StyleSheet,Text,Vibration,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {requestRecordingPermissionsAsync,setAudioModeAsync} from 'expo-audio';
import {request} from './api';
import {newPeer,description,microphone,playRemote,stopRemote} from './Rtc';
import {PhoneIcon} from './ChatIcons';
import {MicIcon} from './ChatMedia';
import {C} from './styles';
import type {Role} from './model';

// Calls inside the app (lib/chat-calls.ts): the two people of a chat talk without seeing each other's number.
// One CallCenter lives over the whole app. It asks the server every few seconds whether someone is calling,
// shows the incoming call, and runs the call itself: the microphone goes to Cloudflare Realtime and the other
// side's voice comes back from it. A chat starts a call with startCall().
type Call={id:string;roomId:string;status:string;side:'caller'|'callee';role:Role;name:string;answeredAt:number|null;connected?:boolean;reason?:string;ready:{me:boolean;other:boolean}};
const LIVE=['ringing','active'];
let starter:((roomId:string,role:Role,name:string)=>void)|null=null;
export function startCall(roomId:string,role:Role,name:string){if(!starter)throw Error(t('Звонок недоступен.'));starter(roomId,role,name);}

async function gathered(pc:any){
 if(pc.iceGatheringState==='complete')return;
 await new Promise<void>(done=>{const timer=setTimeout(done,2500),check=()=>{if(pc.iceGatheringState==='complete'){clearTimeout(timer);done();}};pc.addEventListener('icegatheringstatechange',check);});
}
// One side of the call: its microphone is published first, the other side's voice is received once it is there.
class Line{
 pc:any=null;stream:any=null;closed=false;subscribed=false;busy=false;linked=false;received=false;remote=false;
 constructor(private call:()=>Call,private onState:(connected:boolean)=>void){}
 api(path:string,body:Record<string,unknown>={}){const c=this.call();return request('/api/operations/call/'+path,{callId:c.id,...body},undefined,undefined,c.role);}
 async publish(){
  const permission=await requestRecordingPermissionsAsync();if(!permission.granted)throw Error(t('Доступ к микрофону не разрешён. Разрешите его в настройках телефона.'));
  await setAudioModeAsync({allowsRecording:true,playsInSilentMode:true}).catch(()=>{});
  this.stream=await microphone();if(this.closed){this.stop();return;}
  const pc=newPeer();this.pc=pc;
  pc.addEventListener('track',(e:any)=>{playRemote(e.track);this.remote=true;});
  pc.addEventListener('connectionstatechange',()=>{this.linked=pc.connectionState==='connected';this.onState(this.linked);});
  const sender=pc.addTransceiver(this.stream.getAudioTracks()[0],{direction:'sendonly'});
  await pc.setLocalDescription(await pc.createOffer());await gathered(pc);
  const r=await this.api('publish',{sdp:pc.localDescription.sdp,mid:String(sender.mid)});
  if(!this.closed)await pc.setRemoteDescription(description('answer',r.sdp));
 }
 // Called on every state poll; does its work once, when both sides have published.
 async receive(){
  if(this.subscribed||this.busy||!this.pc||this.closed)return;this.busy=true;
  try{
   const r=await this.api('subscribe');this.subscribed=true;
   if(r.sdp&&!this.closed){await this.pc.setRemoteDescription(description('offer',r.sdp));await this.pc.setLocalDescription(await this.pc.createAnswer());await gathered(this.pc);await this.api('renegotiate',{sdp:this.pc.localDescription.sdp});}
   if(!this.closed)this.received=true;
  }finally{this.busy=false;}
 }
 // This side hears the other one: its line to Realtime is up and the other side's voice is received.
 // Only after the whole receive went through (subscribe, answer, renegotiate) and the other voice's track arrived.
 get hearing(){return this.linked&&this.received&&this.remote&&!this.closed;}
 mute(on:boolean){this.stream?.getAudioTracks().forEach((track:any)=>{track.enabled=!on;});}
 stop(){this.closed=true;try{this.stream?.getTracks().forEach((track:any)=>track.stop());}catch{}try{this.pc?.close();}catch{}stopRemote();void setAudioModeAsync({allowsRecording:false,playsInSilentMode:true}).catch(()=>{});}
}

// A call that did not get through can be repeated from its own screen: no answer, or no voice.
const retryable=(c:Call)=>!!c.roomId&&(c.reason==='Связь не установлена'||(c.status==='missed'&&c.side==='caller'));
const clock=(s:number)=>Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
function endText(c:Call){
 if(c.reason)return t(c.reason);
 if(c.status==='missed')return c.side==='caller'?t('Нет ответа'):t('Пропущенный звонок');
 if(c.status==='declined')return c.side==='caller'?t('Собеседник отклонил звонок'):t('Звонок отклонён');
 if(c.status==='cancelled')return t('Звонок отменён');
 return t('Звонок завершён');
}

export function CallCenter({userId}:{userId:string}){
 const [call,setCall]=useState<Call|null>(null),[connected,setConnected]=useState(false),[muted,setMuted]=useState(false),[error,setError]=useState(''),[since,setSince]=useState(0),[now,setNow]=useState(Date.now());
 const line=useRef<Line|null>(null),current=useRef<Call|null>(null),seen=useRef(new Set<string>());
 current.current=call;
 function hangUpLocal(){line.current?.stop();line.current=null;setConnected(false);setMuted(false);setSince(0);Vibration.cancel();}
 function settle(next:Call){
  setCall(next);
  if(!LIVE.includes(next.status)){hangUpLocal();if(!retryable(next))setTimeout(()=>{if(current.current?.id===next.id)setCall(null);},2000);}
 }
 async function connect(){
  const l=new Line(()=>current.current!,ok=>{if(!ok)setConnected(false);});line.current=l;
  try{await l.publish();}catch(e){setError(e instanceof Error&&e.message?e.message:t('Звонок не соединился. Попробуйте ещё раз.'));void end();}
 }
 starter=(roomId,role,name)=>{
  if(current.current&&LIVE.includes(current.current.status))return;
  setError('');setCall({id:'',roomId,status:'ringing',side:'caller',role,name,answeredAt:null,ready:{me:false,other:false}});
  void request('/api/operations/call/start',{roomId},undefined,undefined,role).then(r=>{setCall(r.call);current.current=r.call;void connect();})
   .catch(e=>{setError(e instanceof Error&&e.message?e.message:t('Звонок не соединился. Попробуйте ещё раз.'));setCall(c=>c&&{...c,status:'ended'});setTimeout(()=>setCall(null),2500);});
 };
 useEffect(()=>()=>{starter=null;line.current?.stop();Vibration.cancel();},[]);
 // Someone calling: asked every 4 seconds while the app is open and no call is going on.
 useEffect(()=>{
  const ask=()=>{if(AppState.currentState!=='active'||current.current)return;void request('/api/operations/call/incoming',{}).then(r=>{if(r.call&&!current.current&&!seen.current.has(r.call.id)){seen.current.add(r.call.id);setError('');setCall(r.call);Vibration.vibrate([0,700,900],true);}}).catch(()=>{});};
  ask();const timer=setInterval(ask,4000);return()=>clearInterval(timer);
 },[userId]);
 // The call itself: its state every 1.5 seconds keeps both sides alive and tells when the other side is ready.
 useEffect(()=>{
  if(!call?.id||!LIVE.includes(call.status))return;
  const timer=setInterval(()=>{const c=current.current;if(!c?.id)return;void request('/api/operations/call/state',{callId:c.id,audio:!!line.current?.hearing},undefined,undefined,c.role).then(r=>{
   if(current.current?.id!==r.call.id)return;settle(r.call);
   // The call counts from the moment both sides hear each other (the server knows it), not from «Принять».
   if(r.call.status==='active'&&r.call.connected){setConnected(true);setSince(s=>s||Date.now());}
   if(r.call.status==='active'){Vibration.cancel();if(r.call.ready.me&&r.call.ready.other)void line.current?.receive().catch(()=>{});}
  }).catch(()=>{});},1500);
  return()=>clearInterval(timer);
 },[call?.id,call?.status]);// eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{if(!connected)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[connected]);
 async function answer(){
  const c=current.current;if(!c)return;Vibration.cancel();
  try{const r=await request('/api/operations/call/answer',{callId:c.id},undefined,undefined,c.role);setCall(r.call);current.current=r.call;await connect();}
  catch(e){setError(e instanceof Error&&e.message?e.message:t('Звонок уже закончился.'));setTimeout(()=>setCall(null),2000);}
 }
 async function end(){
  const c=current.current;hangUpLocal();if(!c)return;if(!c.id){setCall(null);return;}
  try{const r=await request('/api/operations/call/end',{callId:c.id},undefined,undefined,c.role);settle(r.call);}catch{setCall(null);}
 }
 if(!call)return null;
 const live=LIVE.includes(call.status),incoming=call.status==='ringing'&&call.side==='callee';
 const status=error||(!live?endText(call):incoming?t('Входящий звонок через AiQonaq'):call.status==='ringing'?t('Вызов…'):connected?clock(Math.max(0,Math.floor((now-since)/1000))):t('Соединяем…'));
 return <Modal visible animationType="fade" onRequestClose={()=>{if(live)void end();else setCall(null);}}>
  <SafeAreaView style={k.screen}>
   <View style={k.top}>
    <View style={k.avatar}><Text style={k.letter}>{(call.name||'?').trim().charAt(0).toUpperCase()}</Text></View>
    <Text accessibilityRole="header" numberOfLines={1} style={k.name}>{call.name}</Text>
    <Text accessibilityLiveRegion="polite" style={[k.status,!!error&&k.error]}>{status}</Text>
    <Text style={k.note}>{t('Номер телефона не показывается. Звонок идёт через приложение.')}</Text>
   </View>
   {live&&<View style={k.actions}>
    {incoming?<>
     <Round label={t('Отклонить')} tone="danger" onPress={()=>void end()}><View style={k.down}><PhoneIcon color={C.onAccent} size={28}/></View></Round>
     <Round label={t('Принять')} tone="success" onPress={()=>void answer()}><PhoneIcon color={C.onAccent} size={28}/></Round>
    </>:<>
     <Round label={muted?t('Включить микрофон'):t('Выключить микрофон')} tone={muted?'on':'plain'} onPress={()=>{const next=!muted;setMuted(next);line.current?.mute(next);}}><View style={k.micBox}><MicIcon color={muted?C.ink:C.onAccent}/>{muted&&<View style={k.slash}/>}</View></Round>
     <Round label={t('Завершить звонок')} tone="danger" onPress={()=>void end()}><View style={k.down}><PhoneIcon color={C.onAccent} size={28}/></View></Round>
    </>}
   </View>}
   {!live&&retryable(call)&&<View style={k.actions}>
    <Round label={t('Закрыть')} tone="plain" onPress={()=>setCall(null)}><Text style={k.close}>✕</Text></Round>
    <Round label={t('Позвонить ещё раз')} tone="success" onPress={()=>{const c=call;setCall(null);current.current=null;starter?.(c.roomId,c.role,c.name);}}><PhoneIcon color={C.onAccent} size={28}/></Round>
   </View>}
  </SafeAreaView>
 </Modal>;
}
function Round({label,tone,onPress,children}:{label:string;tone:'danger'|'success'|'plain'|'on';onPress:()=>void;children:React.ReactNode}){
 return <View style={k.roundWrap}><Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({pressed})=>[k.round,k[tone],pressed&&k.pressed]}>{children}</Pressable><Text style={k.roundLabel}>{label}</Text></View>;
}
const k=StyleSheet.create({
 screen:{flex:1,backgroundColor:C.night,justifyContent:'space-between',padding:24},
 top:{alignItems:'center',gap:12,marginTop:64},
 avatar:{width:96,height:96,borderRadius:999,backgroundColor:C.nightGlow,alignItems:'center',justifyContent:'center'},
 letter:{color:C.onAccent,fontSize:36,lineHeight:44,fontWeight:'700'},
 name:{color:C.onAccent,fontSize:28,lineHeight:36,fontWeight:'700'},
 status:{color:'rgba(255,255,255,0.8)',fontSize:18,lineHeight:24},
 error:{color:C.warning},
 note:{color:'rgba(255,255,255,0.6)',fontSize:14,lineHeight:20,textAlign:'center',marginTop:8},
 actions:{flexDirection:'row',justifyContent:'space-around',marginBottom:32},
 roundWrap:{alignItems:'center',gap:8,width:120},
 round:{width:72,height:72,borderRadius:999,alignItems:'center',justifyContent:'center'},
 danger:{backgroundColor:C.danger},success:{backgroundColor:C.success},plain:{backgroundColor:'rgba(255,255,255,0.16)'},on:{backgroundColor:C.onAccent},
 pressed:{opacity:0.8},
 down:{transform:[{rotate:'135deg'}]},
 micBox:{transform:[{scale:1.6}],alignItems:'center',justifyContent:'center'},
 slash:{position:'absolute',width:2,height:26,backgroundColor:C.danger,transform:[{rotate:'45deg'}]},
 close:{color:C.onAccent,fontSize:22,lineHeight:28,fontWeight:'700'},
 roundLabel:{color:'rgba(255,255,255,0.8)',fontSize:14,lineHeight:20,textAlign:'center'},
});
