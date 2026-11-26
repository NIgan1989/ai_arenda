import React,{useEffect,useState} from 'react';
import {Image,Modal,Platform,Pressable,StyleSheet,Text,View} from 'react-native';
import {t} from '../../lib/i18n';
import {ApiError,isOffline,request} from './api';
import {menuIcons} from './AccountRows';
import {passkeyAvailable,passkeyCreate,passkeyFailure,passkeyGet,readPasskeyNote,writePasskeyNote} from './passkey';
import {C,type} from './styles';
import {T} from './tokens';

// Sign-in with Face ID or a fingerprint instead of the password (passkeys; the server is lib/passkeys.ts). The phone
// keeps the key in iCloud Keychain or Google Password Manager, so there is nothing to remember and a new phone with the
// same Apple or Google account has it too. Words follow the phone: Face ID on iPhone, the fingerprint on Android.
// In the browser of the test stand the words follow the phone the page says it runs on.
function system(){
 if(Platform.OS!=='web')return Platform.OS;
 const agent=typeof navigator==='undefined'?'':navigator.userAgent||'';
 return /iPhone|iPad/.test(agent)?'ios':/Android/.test(agent)?'android':'web';
}
export function passkeyWords(){
 const os=system();
 if(os==='ios')return {sign:t('Войти по Face ID'),name:'Face ID',title:t('Входите по Face ID'),text:t('Без пароля и кодов. Ключ входа хранится в Связке ключей iCloud.'),turnOn:t('Включить Face ID'),icon:menuIcons.face};
 if(os==='android')return {sign:t('Войти по отпечатку'),name:t('Вход по отпечатку'),title:t('Входите по отпечатку пальца'),text:t('Без пароля и кодов. Ключ входа хранится в Менеджере паролей Google.'),turnOn:t('Включить вход по отпечатку'),icon:menuIcons.fingerprint};
 return {sign:t('Войти без пароля'),name:t('Вход без пароля'),title:t('Входите без пароля'),text:t('Без пароля и кодов. Ключ входа хранится в менеджере паролей.'),turnOn:t('Включить вход без пароля'),icon:menuIcons.face};
}

// The server's question, the phone's sheet, then the server keeps the public key. A session older than a quarter of
// an hour adds a key only with the password (the server answers 403 without it).
export async function turnOnPasskey(userId:string,password?:string){
 const asked=await request('/auth/passkey-register-options',password?{password}:{});
 let response;
 // The phone already holds a key of this account (made here or synced from another phone): it is on here already.
 try{response=await passkeyCreate(asked.options);}catch(error){if(passkeyFailure(error)!=='exists')throw error;await writePasskeyNote('on',userId||'1');return {message:t('На этом телефоне уже включено.')};}
 const saved=await request('/auth/passkey-register',{challengeId:asked.challengeId,response,device:system()==='ios'?'iPhone':system()==='android'?'Android':t('Браузер')});
 await writePasskeyNote('on',userId||'1');
 return saved;
}
// No number is typed: the phone offers the key it holds. A key the server no longer knows is forgotten here.
export async function signInWithPasskey(){
 const asked=await request('/auth/passkey-login-options',{});
 const response=await passkeyGet(asked.options);
 try{const result=await request('/auth/passkey-login',{challengeId:asked.challengeId,response});await writePasskeyNote('on',String(result?.user?.id||''));return result;}
 catch(error){if(error instanceof ApiError&&error.status===404)await writePasskeyNote('on',null);throw error;}
}
// What to say when it did not work; null when the person closed the sheet themselves.
export function passkeyError(error:unknown){
 if(error instanceof ApiError)return error.message;
 if(isOffline(error))return t('Нет связи. Проверьте интернет и повторите.');
 const kind=passkeyFailure(error);
 return kind==='cancelled'?null:kind==='none'?t('На этом телефоне нет ключа входа. Войдите по паролю.'):t('Телефон не подтвердил вход. Попробуйте ещё раз.');
}

let show:((userId:string)=>void)|null=null;
// Right after a sign-in by password: once for each account on this phone, and not when the key is already on here.
export async function offerPasskey(userId:string){
 if(!userId||!show||!passkeyAvailable())return;
 if(await readPasskeyNote('on')===userId||await readPasskeyNote('asked.'+userId))return;
 await writePasskeyNote('asked.'+userId,'1');
 show?.(userId);
}

// As the sheet of ChatGPT and Ro after sign-in: one line glyph, a title, a grey line, a dark button and «Не сейчас».
export function PasskeyOfferHost(){
 const [user,setUser]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{show=id=>{setError('');setUser(id);};return()=>{show=null;};},[]);
 const words=passkeyWords(),close=()=>{if(!busy)setUser('');};
 const turnOn=async()=>{setBusy(true);setError('');try{await turnOnPasskey(user);setUser('');}catch(e){const text=passkeyError(e);if(text)setError(text);}finally{setBusy(false);}};
 return <Modal visible={!!user} transparent animationType="slide" onRequestClose={close}>
  <Pressable accessibilityLabel={t('Закрыть')} onPress={close} style={p.shade}/>
  <View style={p.sheet} accessibilityViewIsModal>
   <View style={p.ring}><Image source={words.icon} style={p.icon}/></View>
   <Text accessibilityRole="header" style={p.title}>{words.title}</Text>
   <Text style={p.text}>{words.text}</Text>
   {!!error&&<Text accessibilityRole="alert" style={p.error}>{error}</Text>}
   <Pressable accessibilityRole="button" disabled={busy} onPress={()=>void turnOn()} style={({pressed})=>[p.main,(pressed||busy)&&p.dim]}><Text style={p.mainText}>{words.turnOn}</Text></Pressable>
   <Pressable accessibilityRole="button" disabled={busy} onPress={close} style={p.skip}><Text style={p.skipText}>{t('Не сейчас')}</Text></Pressable>
  </View>
 </Modal>;
}

const p=StyleSheet.create({
 shade:{flex:1,backgroundColor:'rgba(15,23,42,0.32)'},
 sheet:{paddingHorizontal:24,paddingTop:32,paddingBottom:40,gap:12,alignItems:'center',borderTopLeftRadius:T.radius.xl,borderTopRightRadius:T.radius.xl,backgroundColor:C.surface},
 ring:{width:64,height:64,borderRadius:T.radius.full,borderWidth:1,borderColor:C.line,alignItems:'center',justifyContent:'center',marginBottom:4},
 icon:{width:32,height:32,tintColor:C.ink},
 title:{...type.subtitle,color:C.ink,fontWeight:'600',textAlign:'center'},
 text:{...type.label,color:C.muted,textAlign:'center',maxWidth:320},
 error:{...type.caption,color:C.danger,textAlign:'center'},
 main:{alignSelf:'stretch',minHeight:56,marginTop:12,borderRadius:T.radius.full,alignItems:'center',justifyContent:'center',backgroundColor:C.ink},
 mainText:{...type.body,color:C.surface,fontWeight:'600'},
 skip:{alignSelf:'stretch',minHeight:T.control.touch,alignItems:'center',justifyContent:'center'},
 skipText:{...type.label,color:C.ink,fontWeight:'600'},
 dim:{opacity:.6},
});
