import {t} from '../../lib/i18n';
import React,{useState} from 'react';
import {Text,TextInput,View} from 'react-native';
import {SwipeConfirm} from './SwipeConfirm';
import {SheetPane} from './PopSheet';
import {money} from './model';
import {s,C} from './styles';

// The forms of a booking's or a cleaning's card that were questions in the AI chat until 2026-11-28: each is a sheet
// of its own over the card (as «Создать уборку», PR #281), the words typed in one field, the send by a swipe.

// «Есть проблема»: what happened, to the other side of the booking or the cleaning; the AI administrator follows the answer.
export function IssueForm({lead,busy,onSubmit}:{lead:string;busy:boolean;onSubmit:(issue:string)=>void}){
 const [text,setText]=useState('');
 return <SheetPane style={{gap:12}} footer={<SwipeConfirm label={t('Проведите: сообщить о проблеме')} disabled={busy||text.trim().length<3} onConfirm={()=>onSubmit(text.trim())}/>}>
  <Text style={s.text}>{lead}</Text>
  <TextInput accessibilityLabel={t('Что случилось?')} placeholder={t('Что случилось?')} placeholderTextColor={C.muted} value={text} onChangeText={setText} maxLength={1500} multiline style={[s.field,{minHeight:96,textAlignVertical:'top'}]} editable={!busy} autoFocus/>
 </SheetPane>;
}

// «Удержать часть депозита»: how much and why; the guest sees both.
export function KeepDepositForm({balance,busy,onSubmit}:{balance:number;busy:boolean;onSubmit:(body:{amount:number;reason:string})=>void}){
 const [amount,setAmount]=useState(''),[reason,setReason]=useState('');
 const sum=Math.round(Number(amount.replace(/\D/g,''))||0),valid=sum>=1&&sum<=balance&&reason.trim().length>=3;
 return <SheetPane style={{gap:12}} footer={<SwipeConfirm label={sum>0?t('Проведите: удержать {v}',{v:money(sum)}):t('Проведите: удержать')} disabled={busy||!valid} onConfirm={()=>onSubmit({amount:sum,reason:reason.trim()})}/>}>
  <Text style={s.meta}>{t('Депозит: {v}',{v:money(balance)})}</Text>
  <View style={{gap:4}}><Text style={s.fieldLabel}>{t('Удержать, ₸')}</Text><TextInput accessibilityLabel={t('Удержать, ₸')} placeholder="0" placeholderTextColor={C.muted} value={amount} onChangeText={v=>setAmount(v.replace(/\D/g,'').slice(0,9))} keyboardType="number-pad" style={s.field} editable={!busy}/></View>
  {sum>balance&&<Text accessibilityRole="alert" style={s.error}>{t('Не больше {v}.',{v:money(balance)})}</Text>}
  <View style={{gap:4}}><Text style={s.fieldLabel}>{t('Причина')}</Text><TextInput accessibilityLabel={t('Причина')} placeholder={t('Что повреждено или пропало')} placeholderTextColor={C.muted} value={reason} onChangeText={setReason} maxLength={1000} multiline style={[s.field,{minHeight:80,textAlignVertical:'top'}]} editable={!busy}/></View>
  <Text style={s.meta}>{t('Гость увидит сумму и причину.')}</Text>
 </SheetPane>;
}
