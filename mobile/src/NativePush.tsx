import {t as tr} from '../../lib/i18n';
import React,{useEffect,useRef,useState} from 'react';
import {Linking,Platform,Pressable,StyleSheet,Text,View} from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import {C,type} from './styles';
import {T} from './tokens';
import {request} from './api';
import {RowIcon,SwitchRow,a} from './AccountRows';
import {pushLink,type PushLink} from './push-link';
import type {Role} from './model';

// Push in the phone app (audit «Доставка срочных уведомлений», point 4). The phone gives its Expo token, the server
// keeps it for this sign-in and role (lib/native-push.ts) and sends through Expo to Firebase and Apple.
// What is left to switch it on: link the app to its EAS project (extra.eas.projectId) and put the Firebase and Apple
// keys into EAS. Until then the token is not given and the row says so.
type PushState='on'|'off'|'denied'|'unavailable';
const native=Platform.OS==='ios'||Platform.OS==='android';
const askedKey='ai-arenda-push-asked-v1';
const projectId=():string=>{const c=Constants as any;return c?.expoConfig?.extra?.eas?.projectId||c?.easConfig?.projectId||'';};
let ready=false;
// Once per launch: an open app shows its own line over the map (App.tsx), so the system banner stays silent then.
// Android needs its channels before the first message: «urgent» rings even in the quiet mode of the phone.
export function setupNotifications(){
 if(!native||ready)return;ready=true;
 Notifications.setNotificationHandler({handleNotification:async()=>({shouldShowBanner:false,shouldShowList:true,shouldPlaySound:false,shouldSetBadge:false})});
 if(Platform.OS==='android'){
  void Notifications.setNotificationChannelAsync('default',{name:tr('События'),importance:Notifications.AndroidImportance.HIGH,sound:'default'}).catch(()=>undefined);
  void Notifications.setNotificationChannelAsync('urgent',{name:tr('Срочное'),importance:Notifications.AndroidImportance.MAX,sound:'default',bypassDnd:false,vibrationPattern:[0,400,200,400]}).catch(()=>undefined);
 }
}
// Gives this phone's token to the server for the role. `ask`: «once» shows the system question once per phone
// (after a role opens), «now» whenever the phone still allows it (the switch in the settings).
export async function registerPush(role:Role,ask:'no'|'once'|'now'='no'):Promise<PushState>{
 if(!native||!projectId())return 'unavailable';
 let permission=await Notifications.getPermissionsAsync();
 if(!permission.granted&&permission.canAskAgain&&ask!=='no'){
  const asked=await SecureStore.getItemAsync(askedKey).catch(()=>null);
  if(asked!=='1'||ask==='now'){await SecureStore.setItemAsync(askedKey,'1').catch(()=>undefined);permission=await Notifications.requestPermissionsAsync();}
 }
 if(!permission.granted)return 'denied';
 // Without the Firebase key in the build (Android) or the push right of the iPhone build no token is given.
 let token='';try{token=(await Notifications.getExpoPushTokenAsync({projectId:projectId()})).data;}catch{return 'unavailable';}
 await request('/api/push/native',{action:'register',token,platform:Platform.OS},undefined,undefined,role);
 return 'on';
}
// A tap on a push, also the one that started the app.
export function usePushTaps(onTap:(link:PushLink)=>void){
 const latest=useRef(onTap);latest.current=onTap;
 useEffect(()=>{
  if(!native)return;
  const open=(response:Notifications.NotificationResponse|null)=>{const link=response?pushLink(response.notification.request.content.data):null;if(link)latest.current(link);};
  void Notifications.getLastNotificationResponseAsync().then(r=>{open(r);if(r)void Notifications.clearLastNotificationResponseAsync().catch(()=>undefined);}).catch(()=>undefined);
  const sub=Notifications.addNotificationResponseReceivedListener(open);
  return()=>sub.remove();
 },[]);
}
// The row in «Куда сообщать»: a switch, a check, and what to do when the phone said no.
export function NativePush({role,tint,invite}:{role:Role;tint?:string;invite?:boolean}){
 const [state,setState]=useState<PushState|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 async function load(){
  if(!native||!projectId()){setState('unavailable');return;}
  try{const [server,permission]=await Promise.all([request('/api/push/native',undefined,undefined,undefined,role),Notifications.getPermissionsAsync()]);setState(!server.configured?'unavailable':!permission.granted&&!permission.canAskAgain?'denied':server.enabled&&permission.granted?'on':'off');}
  catch(x:any){setError(x?.message||tr('Не удалось проверить уведомления.'));}
 }
 useEffect(()=>{void load();},[role]);
 async function toggle(on:boolean){
  setBusy(true);setError('');setMessage('');
  try{
   if(on){const r=await registerPush(role,'now');if(r==='denied')setError(tr('Телефон не разрешает уведомления. Включите их в настройках телефона.'));else if(r==='on')setMessage(tr('Уведомления для этой роли включены на телефоне.'));else setError(tr('Эта сборка приложения ещё не подключена к уведомлениям.'));}
   else{const r=await request('/api/push/native',{action:'remove'},undefined,undefined,role);setMessage(r.message);}
   await load();
  }catch(x:any){setError(x?.message||tr('Не получилось.'));}finally{setBusy(false);}
 }
 async function check(){setBusy(true);setError('');setMessage('');try{const r=await request('/api/push/native',{action:'test'},undefined,undefined,role);setMessage(r.message);}catch(x:any){setError(x?.message||tr('Не получилось.'));}finally{setBusy(false);}}
 if(!state||state==='unavailable')return null;
 if(invite&&state==='on')return null;
 return <>
  {state==='denied'?<View style={a.row}><RowIcon icon="bell" tint={tint}/><View style={a.wide}><Text style={a.title}>{tr('Уведомления на телефоне')}</Text><Text style={a.note}>{tr('Запрещены в настройках телефона')}</Text></View><Pressable accessibilityRole="button" onPress={()=>void Linking.openSettings().catch(()=>undefined)} style={[p.button,p.secondary]}><Text style={p.secondaryText}>{tr('Открыть настройки')}</Text></Pressable></View>
   :<SwitchRow icon="bell" tint={tint} title={tr('Уведомления на телефоне')} note={invite?tr('Включите, чтобы узнавать о бронях и уборках, когда приложение закрыто'):tr('Срочное приходит сразу, даже в тихие часы, если вы разрешили')} checked={state==='on'} disabled={busy} onChange={v=>void toggle(v)}/>}
  {state==='on'&&!invite&&<Pressable accessibilityRole="button" disabled={busy} onPress={()=>void check()} style={[p.button,p.secondary,p.check,busy&&p.dim]}><Text style={p.secondaryText}>{tr('Проверить уведомление')}</Text></Pressable>}
  {!!message&&<Text accessibilityLiveRegion="polite" style={[a.note,a.notice]}>{message}</Text>}
  {!!error&&<Text accessibilityRole="alert" style={[p.error,a.notice]}>{error}</Text>}
 </>;
}
const p=StyleSheet.create({
 button:{minHeight:T.control.touch,paddingHorizontal:16,borderRadius:T.radius.full,alignItems:'center',justifyContent:'center'},
 secondary:{borderWidth:1,borderColor:C.line,backgroundColor:C.surface},check:{alignSelf:'flex-start',marginHorizontal:16,marginBottom:12},dim:{opacity:.6},
 secondaryText:{...type.label,color:C.ink,fontWeight:'600'},
 error:{...type.label,color:C.danger}
});
