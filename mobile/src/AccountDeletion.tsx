import {t} from '../../lib/i18n';
import React,{useEffect,useRef,useState} from 'react';
import {View,Text,TextInput,Pressable} from 'react-native';
import {request,StaleSessionError} from './api';
import {C,s} from './styles';
// The server checks the Russian phrase; the person types it in their own language and the app sends the Russian one.
const phrase='УДАЛИТЬ АККАУНТ';
// Shown only once the server allows erasing now: password, the phrase and one confirmation.
export function NativeAccountDeletion({details,onChanged,onSignedOut}:{details?:any;onChanged:()=>Promise<unknown>;onSignedOut:(result?:any)=>Promise<void>|void}){
 const [password,setPassword]=useState(''),[confirmation,setConfirmation]=useState(''),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[result,setResult]=useState<any>(null),lock=useRef(false);
 const pending=details?.request?.status==='requested'&&typeof details.request.id==='string',canErase=pending&&details?.canEraseActiveDatabase===true;
 useEffect(()=>{setPassword('');setConfirmation('');setConfirmed(false);setNotice('');},[details?.request?.id,canErase]);
 async function erase(){
  if(lock.current||!canErase||!confirmed||confirmation.trim()!==t(phrase)||password.length<10)return;
  lock.current=true;setBusy(true);setNotice('');
  try{
   const value=await request('/api/operations/safety/account-deletion',{action:'erase',requestId:details.request.id,confirmed:true,confirmation:phrase,password});
   setResult(value);setNotice(value.message||t('Готово.'));setConfirmed(false);setConfirmation('');
   if(value.signOut===true)await onSignedOut(value);else await onChanged();
  }catch(e:any){if(!(e instanceof StaleSessionError)){setNotice(e.message);try{await onChanged();}catch{}}}finally{setPassword('');lock.current=false;setBusy(false);}
 }
 if(result?.signOut)return <View style={[s.card,{gap:12,marginTop:16}]}><Text style={s.cardTitle}>{t('Аккаунт удалён')}</Text><Text accessibilityRole="alert" style={s.text}>{result.message}</Text>{result.receipt&&<Text selectable style={s.meta}>{t('Номер квитанции: {id}',{id:result.receipt.id})}</Text>}<Pressable accessibilityRole="button" onPress={()=>void onSignedOut(result)} style={s.button}><Text style={s.buttonText}>{t('На экран входа')}</Text></Pressable></View>;
 if(!canErase)return null;
 const ready=!busy&&confirmed&&confirmation.trim()===t(phrase)&&password.length>=10;
 return <View style={[s.card,{gap:12,marginTop:16}]}><Text style={s.text}>{t('Проверка пройдена, аккаунт можно удалить сейчас. Отменить это будет нельзя.')}</Text><Text style={s.fieldLabel}>{t('Пароль')}</Text><TextInput accessibilityLabel={t('Пароль для удаления аккаунта')} style={s.field} value={password} onChangeText={setPassword} editable={!busy} maxLength={128} secureTextEntry autoComplete="current-password" autoCapitalize="none" autoCorrect={false}/><Text style={s.fieldLabel}>{t('Напишите «{phrase}»',{phrase:t(phrase)})}</Text><TextInput accessibilityLabel={t('Фраза подтверждения удаления')} style={s.field} value={confirmation} onChangeText={setConfirmation} editable={!busy} maxLength={40} autoComplete="off" autoCapitalize="characters" autoCorrect={false}/><Pressable accessibilityRole="checkbox" accessibilityState={{checked:confirmed,disabled:busy}} disabled={busy} onPress={()=>setConfirmed(v=>!v)} style={[s.button,s.secondary]}><Text style={[s.buttonText,s.secondaryText]}>{confirmed?'✓ ':''}{t('Понимаю, что это навсегда')}</Text></Pressable><Pressable accessibilityRole="button" disabled={!ready} style={[s.button,{backgroundColor:C.danger},!ready&&s.disabled]} onPress={()=>void erase()}><Text style={s.buttonText}>{t('Удалить навсегда')}</Text></Pressable>{!!notice&&<Text accessibilityRole="alert" style={s.meta}>{notice}</Text>}</View>;
}
