import React,{useState} from 'react';
import {View,Text,TextInput,Pressable,Linking,StyleSheet} from 'react-native';
import {request} from './api';
import {s,C,type,brandFont} from './styles';
import {T} from './tokens';

// Direct settlements (2026-11-19): the guest pays the owner and the owner pays the performer outside the service.
// The service shows where to transfer (PayTo) and keeps the marks of both sides; it never holds this money.
// The details themselves are typed once in «Настройки» (PayoutForm) and saved by POST /api/operations/payout.
export type Payout={phone:string;recipient:string;link:string};
const R=T.radius;
export const phoneText=(phone:string)=>/^\+7\d{10}$/.test(phone)?`+7 ${phone.slice(2,5)} ${phone.slice(5,8)} ${phone.slice(8,10)} ${phone.slice(10)}`:phone;
const money=(n:number)=>new Intl.NumberFormat('ru-RU').format(n).replace(/\s/g,' ')+' ₸';

/** Where to transfer and how much. `parts` explains a sum made of several things (the stay and the deposit). */
export function PayTo({title,to,amount,parts,waiting,missing,note}:{title:string;to:Payout|null|undefined;amount:number;parts?:string;waiting?:string;missing:string;note?:string}){
 return <View accessible={false} style={p.card}>
  <View style={p.head}><Text style={p.title}>{title}</Text><Text style={p.sum}>{money(amount)}</Text></View>
  {!!parts&&<Text style={p.meta}>{parts}</Text>}
  {to?<><View style={p.to}><View style={p.kaspi}><Text style={p.kaspiText}>K</Text></View><View style={{flex:1,minWidth:0}}><Text selectable accessibilityLabel={'Номер Kaspi '+phoneText(to.phone)} style={p.phone}>{phoneText(to.phone)}</Text><Text style={p.meta}>Kaspi · {to.recipient}</Text></View></View>
   {!!to.link&&<Pressable accessibilityRole="link" onPress={()=>void Linking.openURL(to.link).catch(()=>undefined)} style={({pressed})=>[p.link,pressed&&{opacity:.7}]}><Text style={p.linkText}>Открыть оплату в Kaspi</Text></Pressable>}</>
   :<Text style={p.warn}>{missing}</Text>}
  {!!waiting&&<View style={p.wait}><Text style={p.waitText}>{waiting}</Text></View>}
  {!!note&&<Text style={p.meta}>{note}</Text>}
 </View>;
}

/** «Реквизиты для оплаты» in the settings of the owner and the performer. */
export function PayoutForm({initial,role,onSaved}:{initial:Payout|null;role:'owner'|'cleaner';onSaved?:(value:Payout)=>void}){
 const [phone,setPhone]=useState(initial?phoneText(initial.phone):'+7 '),[recipient,setRecipient]=useState(initial?.recipient||''),[link,setLink]=useState(initial?.link||''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState('');
 async function save(){
  if(busy)return;setBusy(true);setError('');setDone('');
  try{const r=await request('/api/operations/payout',{phone,recipient,link},undefined,undefined,role);setDone('Сохранено');if(r?.payout){setPhone(phoneText(r.payout.phone));onSaved?.(r.payout);}}
  catch(x:any){setError(x?.message||'Не удалось сохранить.');}finally{setBusy(false);}
 }
 return <View style={{gap:12}}>
  <Text style={s.meta}>{role==='owner'?'Гости переводят оплату и депозит прямо вам. Сервис эти деньги не принимает и не удерживает.':'Заказчики переводят оплату за уборку прямо вам. Сервис эти деньги не принимает и не удерживает.'}</Text>
  <View><Text style={s.fieldLabel}>Номер Kaspi</Text><TextInput accessibilityLabel="Номер Kaspi" value={phone} onChangeText={v=>{setPhone(v);setDone('');}} keyboardType="phone-pad" maxLength={20} placeholder="+7 7XX XXX XX XX" placeholderTextColor={C.muted} style={s.field}/></View>
  <View><Text style={s.fieldLabel}>Имя получателя, как в Kaspi</Text><TextInput accessibilityLabel="Имя получателя" value={recipient} onChangeText={v=>{setRecipient(v);setDone('');}} maxLength={60} placeholder="Айгерим К." placeholderTextColor={C.muted} style={s.field}/></View>
  <View><Text style={s.fieldLabel}>Ссылка Kaspi Pay, если есть</Text><TextInput accessibilityLabel="Ссылка Kaspi Pay" value={link} onChangeText={v=>{setLink(v);setDone('');}} autoCapitalize="none" autoCorrect={false} keyboardType="url" maxLength={300} placeholder="https://pay.kaspi.kz/…" placeholderTextColor={C.muted} style={s.field}/></View>
  {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
  <Pressable accessibilityRole="button" disabled={busy} onPress={()=>void save()} style={[s.button,busy&&s.disabled]}><Text style={s.buttonText}>{busy?'Сохраняю…':done||'Сохранить реквизиты'}</Text></Pressable>
  <Text style={s.meta}>Реквизиты видит только тот, кто платит вам: {role==='owner'?'гость после подтверждения брони':'заказчик после принятой уборки'}.</Text>
 </View>;
}

const p=StyleSheet.create({
 card:{borderRadius:R.lg,borderWidth:1,borderColor:C.accentLine,backgroundColor:C.accentSoft,padding:16,gap:12},
 head:{flexDirection:'row',alignItems:'baseline',justifyContent:'space-between',gap:12},
 title:{...type.label,color:C.inkSoft,fontWeight:'600',flex:1},
 sum:{...type.subtitle,...brandFont,color:C.ink},
 meta:{...type.label,color:C.muted},
 to:{flexDirection:'row',alignItems:'center',gap:12,backgroundColor:C.surface,borderRadius:R.md,padding:12},
 kaspi:{width:40,height:40,borderRadius:24,backgroundColor:C.danger,alignItems:'center',justifyContent:'center'},
 kaspiText:{...type.subtitle,color:C.onAccent,fontWeight:'700'},
 phone:{...type.subtitle,color:C.ink,fontWeight:'600',letterSpacing:.2},
 link:{minHeight:44,borderRadius:R.md,borderWidth:1,borderColor:C.accentLine,backgroundColor:C.surface,alignItems:'center',justifyContent:'center',paddingHorizontal:16},
 linkText:{...type.label,color:C.accent,fontWeight:'600'},
 warn:{...type.label,color:C.warning},
 wait:{borderRadius:R.md,backgroundColor:C.surface,padding:12},
 waitText:{...type.label,color:C.inkSoft},
});
