import React,{useCallback,useEffect,useState} from 'react';
import {View,Text,TextInput,Pressable,Linking,Image,StyleSheet} from 'react-native';
import {pickImages,jpegData} from './ListingMedia';
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
export function PayTo({title,to,amount,parts,waiting,missing,note,children}:{title:string;to:Payout|null|undefined;amount:number;parts?:string;waiting?:string;missing:string;note?:string;children?:React.ReactNode}){
 return <View accessible={false} style={p.card}>
  <View style={p.head}><Text style={p.title}>{title}</Text><Text style={p.sum}>{money(amount)}</Text></View>
  {!!parts&&<Text style={p.meta}>{parts}</Text>}
  {to?<><View style={p.to}><View style={p.kaspi}><Text style={p.kaspiText}>K</Text></View><View style={{flex:1,minWidth:0}}><Text selectable accessibilityLabel={'Номер Kaspi '+phoneText(to.phone)} style={p.phone}>{phoneText(to.phone)}</Text><Text style={p.meta}>Kaspi · {to.recipient}</Text></View></View>
   {!!to.link&&<Pressable accessibilityRole="link" onPress={()=>void Linking.openURL(to.link).catch(()=>undefined)} style={({pressed})=>[p.link,pressed&&{opacity:.7}]}><Text style={p.linkText}>Открыть оплату в Kaspi</Text></Pressable>}</>
   :<Text style={p.warn}>{missing}</Text>}
  {!!waiting&&<View style={p.wait}><Text style={p.waitText}>{waiting}</Text></View>}
  {children}
  {!!note&&<Text style={p.meta}>{note}</Text>}
 </View>;
}

const RECEIPT_LIMIT=3;
/** The bank receipt next to «Я оплатил» (lib/payment-receipts.ts). The payer attaches a screenshot from Kaspi with `canAdd`;
 *  the receiver only looks. A tap opens the receipt large enough to read. Nothing is drawn for a receiver with no receipts. */
export function Receipts({kind,id,role,count=0,canAdd=false,title}:{kind:'booking'|'job';id:string;role:'guest'|'owner'|'cleaner';count?:number;canAdd?:boolean;title?:string}){
 const [list,setList]=useState<{id:string;uri:string}[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[open,setOpen]=useState('');
 const load=useCallback(async()=>{
  const found=(await request('/api/operations/receipts/'+kind+'/'+id,undefined,undefined,undefined,role))?.receipts||[];
  return Promise.all(found.map(async(r:{id:string})=>({id:r.id,uri:(await request('/api/operations/receipts/photo/'+r.id,undefined,undefined,undefined,role).catch(()=>null))?.data||''})));
 },[kind,id,role]);
 // `count` comes from the state the app refreshes in the background: a receipt added by the other side, or a first
 // load that failed, is picked up on the next refresh.
 useEffect(()=>{let live=true;load().then(found=>{if(live)setList(found);}).catch(()=>{});return()=>{live=false;};},[load,count]);
 async function add(){setBusy(true);setError('');try{
  const images=await pickImages(false,1);
  for(const image of images)await request('/api/operations/receipt',{[kind==='job'?'jobId':'bookingId']:id,data:await jpegData(image)},undefined,undefined,role);
  if(images.length)setList(await load());
 }catch(e){setError(e instanceof Error&&e.message?e.message:'Не удалось приложить чек.');}finally{setBusy(false);}}
 if(!canAdd&&!list.length)return null;
 const big=list.find(r=>r.id===open);
 return <View style={{gap:8}}>
  {!!title&&!!list.length&&<Text style={p.title}>{title}</Text>}
  {!!list.length&&<View style={p.receipts}>{list.map(r=><Pressable key={r.id} accessibilityRole="imagebutton" accessibilityLabel={open===r.id?'Свернуть чек':'Открыть чек'} onPress={()=>setOpen(open===r.id?'':r.id)}>{r.uri?<Image source={{uri:r.uri}} style={p.receipt} alt="Чек об оплате"/>:<View style={[p.receipt,{backgroundColor:C.surfaceAlt}]}/>}</Pressable>)}</View>}
  {!!big?.uri&&<Pressable accessibilityRole="imagebutton" accessibilityLabel="Свернуть чек" onPress={()=>setOpen('')}><Image source={{uri:big.uri}} style={p.receiptBig} resizeMode="contain" alt="Чек об оплате"/></Pressable>}
  {canAdd&&list.length<RECEIPT_LIMIT&&<Pressable accessibilityRole="button" disabled={busy} onPress={()=>void add()} style={({pressed})=>[p.link,(pressed||busy)&&{opacity:.7}]}><Text style={p.linkText}>{busy?'Прикладываю…':list.length?'Приложить ещё чек':'Приложить чек из Kaspi'}</Text></Pressable>}
  {canAdd&&!list.length&&<Text style={p.meta}>Снимок чека видит только получатель. С чеком он подтвердит оплату быстрее.</Text>}
  {!!error&&<Text accessibilityRole="alert" style={p.warn}>{error}</Text>}
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
 receipts:{flexDirection:'row',gap:8},
 receipt:{width:72,height:96,borderRadius:R.md,backgroundColor:C.surface},
 receiptBig:{width:'100%',height:420,borderRadius:R.md,backgroundColor:C.surface},
});
