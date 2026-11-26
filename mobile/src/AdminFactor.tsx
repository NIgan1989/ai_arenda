import {t} from '../../lib/i18n';
import React,{useState} from 'react';
import {View,Text,TextInput,Pressable} from 'react-native';
import {request} from './api';
import {Row,a} from './AccountRows';
import {s,C} from './styles';

// The platform administrator's tools in the app open after a code from Telegram, as on the site
// (lib/admin-factor.ts). Each sign-in session confirms itself; the confirmation lasts 8 hours.
export function AdminFactor({tint,onVerified}:{tint?:string;onVerified:()=>void}){
 const [open,setOpen]=useState(false),[sent,setSent]=useState(false),[code,setCode]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[info,setInfo]=useState('');
 async function call(body:Record<string,unknown>){return request('/api/admin-factor',body);}
 async function send(){if(busy)return;setBusy(true);setError('');try{const d=await call({action:'send'});setSent(true);setInfo(d?.testCode?t('{message} Код: {testCode}',{message:d.message,testCode:d.testCode}):d?.message||t('Код отправлен.'));}catch(e){setError(e instanceof Error&&e.message?e.message:t('Не получилось.'));}finally{setBusy(false);}}
 async function verify(){if(busy)return;setBusy(true);setError('');try{await call({action:'verify',code});onVerified();}catch(e){setError(e instanceof Error&&e.message?e.message:t('Не получилось.'));}finally{setBusy(false);}}
 return <>
  <Row icon="shield" tint={tint} title={t('Подтвердить вход администратора')} note={t('Код придёт в Telegram')} open={open} onPress={()=>setOpen(v=>!v)}/>
  {open&&<View style={a.body}>
   <Text style={s.meta}>{t('Инструменты администратора открываются после кода из Telegram. Вход действует 8 часов.')}</Text>
   {!sent?<Pressable accessibilityRole="button" disabled={busy} onPress={()=>void send()} style={[s.button,busy&&s.disabled]}><Text style={s.buttonText}>{busy?t('Отправляем…'):t('Прислать код в Telegram')}</Text></Pressable>
    :<><Text style={s.fieldLabel}>{t('Код из Telegram')}</Text><TextInput accessibilityLabel={t('Код из Telegram')} value={code} onChangeText={v=>setCode(v.replace(/\D/g,''))} keyboardType="number-pad" textContentType="oneTimeCode" maxLength={6} placeholder={t('6 цифр')} placeholderTextColor={C.muted} style={s.field}/>
     <Pressable accessibilityRole="button" disabled={busy||code.length!==6} onPress={()=>void verify()} style={[s.button,(busy||code.length!==6)&&s.disabled]}><Text style={s.buttonText}>{busy?t('Проверяем…'):t('Войти')}</Text></Pressable></>}
   {!!info&&<Text style={s.meta}>{info}</Text>}
   {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
  </View>}
 </>;
}
