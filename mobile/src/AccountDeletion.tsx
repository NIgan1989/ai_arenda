import React,{useEffect,useRef,useState} from 'react';
import {View,Text,TextInput,Pressable} from 'react-native';
import {request,StaleSessionError} from './api';
import {C,s} from './styles';
const phrase='УДАЛИТЬ АККАУНТ';
// Shown only once the server allows erasing now: password, the phrase and one confirmation.
export function NativeAccountDeletion({details,onChanged,onSignedOut}:{details?:any;onChanged:()=>Promise<unknown>;onSignedOut:(result?:any)=>Promise<void>|void}){
 const [password,setPassword]=useState(''),[confirmation,setConfirmation]=useState(''),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[result,setResult]=useState<any>(null),lock=useRef(false);
 const pending=details?.request?.status==='requested'&&typeof details.request.id==='string',canErase=pending&&details?.canEraseActiveDatabase===true;
 useEffect(()=>{setPassword('');setConfirmation('');setConfirmed(false);setNotice('');},[details?.request?.id,canErase]);
 async function erase(){
  if(lock.current||!canErase||!confirmed||confirmation!==phrase||password.length<10)return;
  lock.current=true;setBusy(true);setNotice('');
  try{
   const value=await request('/api/operations/safety/account-deletion',{action:'erase',requestId:details.request.id,confirmed:true,confirmation:phrase,password});
   setResult(value);setNotice(value.message||'Готово.');setConfirmed(false);setConfirmation('');
   if(value.signOut===true)await onSignedOut(value);else await onChanged();
  }catch(e:any){if(!(e instanceof StaleSessionError)){setNotice(e.message);try{await onChanged();}catch{}}}finally{setPassword('');lock.current=false;setBusy(false);}
 }
 if(result?.signOut)return <View style={[s.card,{gap:12,marginTop:16}]}><Text style={s.cardTitle}>Аккаунт удалён</Text><Text accessibilityRole="alert" style={s.text}>{result.message}</Text>{result.receipt&&<Text selectable style={s.meta}>Номер квитанции: {result.receipt.id}</Text>}<Pressable accessibilityRole="button" onPress={()=>void onSignedOut(result)} style={s.button}><Text style={s.buttonText}>На экран входа</Text></Pressable></View>;
 if(!canErase)return null;
 const ready=!busy&&confirmed&&confirmation===phrase&&password.length>=10;
 return <View style={[s.card,{gap:12,marginTop:16}]}><Text style={s.text}>Проверка пройдена, аккаунт можно удалить сейчас. Отменить это будет нельзя.</Text><Text style={s.fieldLabel}>Пароль</Text><TextInput accessibilityLabel="Пароль для удаления аккаунта" style={s.field} value={password} onChangeText={setPassword} editable={!busy} maxLength={128} secureTextEntry autoComplete="current-password" autoCapitalize="none" autoCorrect={false}/><Text style={s.fieldLabel}>Напишите «{phrase}»</Text><TextInput accessibilityLabel="Фраза подтверждения удаления" style={s.field} value={confirmation} onChangeText={setConfirmation} editable={!busy} maxLength={40} autoComplete="off" autoCapitalize="characters" autoCorrect={false}/><Pressable accessibilityRole="checkbox" accessibilityState={{checked:confirmed,disabled:busy}} disabled={busy} onPress={()=>setConfirmed(v=>!v)} style={[s.button,s.secondary]}><Text style={[s.buttonText,s.secondaryText]}>{confirmed?'✓ ':''}Понимаю, что это навсегда</Text></Pressable><Pressable accessibilityRole="button" disabled={!ready} style={[s.button,{backgroundColor:C.danger},!ready&&s.disabled]} onPress={()=>void erase()}><Text style={s.buttonText}>Удалить навсегда</Text></Pressable>{!!notice&&<Text accessibilityRole="alert" style={s.meta}>{notice}</Text>}</View>;
}
