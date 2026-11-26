import React,{useState} from 'react';
import {StyleSheet,Text,TextInput,View} from 'react-native';
import {t} from '../../lib/i18n';
import {request} from './api';
import {h} from './SheetParts';
import {Btn} from './AccountRows';
import {C,s,type} from './styles';
import {T} from './tokens';

// «Подтвердить номер» (fraud check, step 2, 2026-11-26; lib/participant-security.ts phoneCheck). A code by SMS proves
// that the number the person signs in with is theirs. Until an SMS provider is connected the card only says so.
export type PhoneState={verified:boolean;phone:string;sms:boolean;required:boolean;waiting:boolean};

export function PhoneCheck({state,role,onDone}:{state:PhoneState;role:'guest'|'owner'|'cleaner';onDone:()=>void}){
 const [sent,setSent]=useState(state.waiting),[code,setCode]=useState(''),[busy,setBusy]=useState(false),[said,setSaid]=useState<{text:string;error:boolean}|null>(null);
 async function call(path:string,body:object){setBusy(true);setSaid(null);try{
  const v=await request('/api/operations/'+path,body,undefined,undefined,role);setSaid({text:v.message,error:false});return true;
 }catch(e){setSaid({text:e instanceof Error&&e.message?e.message:t('Не получилось. Попробуйте ещё раз.'),error:true});return false;}finally{setBusy(false);}}
 const why=role==='guest'?t('Подтверждённый номер показывает владельцам, что вы настоящий человек. Отзывы таких гостей весомее.'):role==='owner'?t('Подтверждённый номер повышает доверие гостей. Так мошеннику не завести аккаунт на чужой номер.'):t('Подтверждённый номер повышает доверие владельцев. Так мошеннику не завести аккаунт на чужой номер.');
 return <View style={u.card}>
  <Text accessibilityRole="header" style={u.title}>{t('Номер телефона')}</Text>
  <Text style={h.note}>{state.phone?t('Номер входа: {phone}',{phone:state.phone}):t('Номер входа не найден.')}</Text>
  <Text style={h.note}>{why}</Text>
  {!state.sms?<View style={u.soon}><Text style={u.soonText}>{t('Подтверждение по SMS заработает, когда подключим SMS-провайдера. Пока ничего делать не нужно.')}</Text></View>:<>
   {!sent&&<Btn title={busy?t('Отправляю…'):t('Получить код по SMS')} disabled={busy||!state.phone} onPress={()=>void call('phone/request',{}).then(ok=>{if(ok)setSent(true);})}/>}
   {sent&&<>
    <Text style={s.fieldLabel}>{t('Код из SMS')}</Text>
    <TextInput accessibilityLabel={t('Код из SMS')} value={code} onChangeText={v=>setCode(v.replace(/\D/g,'').slice(0,6))} keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="sms-otp" maxLength={6} style={s.field}/>
    <Btn title={busy?t('Проверяю…'):t('Подтвердить номер')} disabled={busy||code.length!==6} onPress={()=>void call('phone/verify',{code}).then(ok=>{if(ok)onDone();})}/>
    <Btn kind="line" title={t('Прислать код ещё раз')} disabled={busy} onPress={()=>void call('phone/request',{})}/>
   </>}
  </>}
  {!!said&&<Text accessibilityLiveRegion="polite" style={said.error?h.error:h.note}>{said.text}</Text>}
  <Text style={u.privacy}>{t('🔒 Сервис никогда не спрашивает этот код. Не сообщайте его никому.')}</Text>
 </View>;
}

const R=T.radius;
const u=StyleSheet.create({
 card:{gap:8,padding:16,marginTop:8,borderRadius:R.lg,borderWidth:1,borderColor:C.line,backgroundColor:C.surface},
 title:{...type.label,color:C.ink,fontWeight:'600'},
 soon:{borderRadius:R.md,backgroundColor:C.surfaceAlt,padding:12},
 soonText:{...type.label,color:C.inkSoft},
 privacy:{...type.caption,color:C.muted},
});
