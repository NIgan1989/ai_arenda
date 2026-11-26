import {dateText,t} from '../../lib/i18n';
import React,{useCallback,useEffect,useState} from 'react';
import {View,Text,TextInput,Pressable,Linking,Image,StyleSheet} from 'react-native';
import {pickImages,jpegData} from './ListingMedia';
import {request} from './api';
import {s,C,type,brandFont} from './styles';
import {T} from './tokens';

// Direct settlements (2026-11-19): the guest pays the owner and the owner pays the performer outside the service.
// The service shows where to transfer (PayTo) and keeps the marks of both sides; it never holds this money.
// The details themselves are typed once in «Настройки» (PayoutForm) and saved by POST /api/operations/payout.
export type Payout={phone:string;recipient:string;link:string;changed_at?:number|null};
export type PendingPayout={phone:string;recipient:string;link:string;until:number};
// The payer is warned for a week after the details changed (lib/payout.ts PAYOUT_FRESH).
const FRESH=7*86400;
const when=(at:number)=>dateText(at*1000,{day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'});
const R=T.radius;
export const phoneText=(phone:string)=>/^\+7\d{10}$/.test(phone)?`+7 ${phone.slice(2,5)} ${phone.slice(5,8)} ${phone.slice(8,10)} ${phone.slice(10)}`:phone;
const money=(n:number)=>new Intl.NumberFormat('ru-RU').format(n).replace(/\s/g,' ')+' ₸';

/** Where to transfer and how much. `parts` explains a sum made of several things (the stay and the deposit). */
export function PayTo({title,to,amount,parts,waiting,missing,note,children}:{title:string;to:Payout|null|undefined;amount:number;parts?:string;waiting?:string;missing:string;note?:string;children?:React.ReactNode}){
 // Read once per card: a warning that appears or disappears while the card is open would only distract.
 const [now]=useState(()=>Date.now()/1000);
 return <View accessible={false} style={p.card}>
  <View style={p.head}><Text style={p.title}>{title}</Text><Text style={p.sum}>{money(amount)}</Text></View>
  {!!parts&&<Text style={p.meta}>{parts}</Text>}
  {/* A transfer already reported is on the owner's check: the details are not shown again, so nobody pays twice. */}
  {waiting?null:to?<><View style={p.to}><View style={p.kaspi}><Text style={p.kaspiText}>K</Text></View><View style={{flex:1,minWidth:0}}>{to.phone?<Text selectable accessibilityLabel={t('Номер Kaspi {v}',{v:phoneText(to.phone)})} style={p.phone}>{phoneText(to.phone)}</Text>:<Text style={p.phone}>{t('Оплата по ссылке Kaspi')}</Text>}<Text style={p.meta}>Kaspi · {to.recipient}</Text></View></View>
   {!!to.link&&<Pressable accessibilityRole="link" onPress={()=>void Linking.openURL(to.link).catch(()=>undefined)} style={({pressed})=>[p.link,pressed&&{opacity:.7}]}><Text style={p.linkText}>{t('Открыть оплату в Kaspi')}</Text></Pressable>}</>
   :<Text style={p.warn}>{missing}</Text>}
  {!waiting&&!!to?.changed_at&&now-to.changed_at<FRESH&&<Text accessibilityRole="alert" style={p.warn}>{t('Реквизиты изменены {when}. Перед переводом сверьте имя получателя в Kaspi. Если сомневаетесь, уточните в чате брони.',{when:when(to.changed_at)})}</Text>}
  {!!waiting&&<View style={p.wait}><Text style={p.waitText}>{waiting}</Text></View>}
  {children}
  {!!note&&<Text style={p.meta}>{note}</Text>}
 </View>;
}

const RECEIPT_LIMIT=3;
/** The bank receipt next to «Я оплатил» (lib/payment-receipts.ts). The payer attaches a screenshot from Kaspi with `canAdd`;
 *  the receiver only looks. A tap opens the receipt large enough to read. Nothing is drawn for a receiver with no receipts. */
export function Receipts({kind,id,role,count=0,canAdd=false,title,from}:{kind:'booking'|'job';id:string;role:'guest'|'owner'|'cleaner';count?:number;canAdd?:boolean;title?:string;from?:'payment'|'refund'}){
 const [list,setList]=useState<{id:string;uri:string}[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[open,setOpen]=useState('');
 const load=useCallback(async()=>{
  // A booking keeps two kinds apart: the guest's payment receipts and the owner's refund receipts (lib/payment-receipts.ts).
  const found=((await request('/api/operations/receipts/'+kind+'/'+id,undefined,undefined,undefined,role))?.receipts||[]).filter((r:{kind?:string})=>!from||(r.kind||'payment')===from);
  return Promise.all(found.map(async(r:{id:string})=>({id:r.id,uri:(await request('/api/operations/receipts/photo/'+r.id,undefined,undefined,undefined,role).catch(()=>null))?.data||''})));
 },[kind,id,role,from]);
 // `count` comes from the state the app refreshes in the background: a receipt added by the other side, or a first
 // load that failed, is picked up on the next refresh.
 useEffect(()=>{let live=true;load().then(found=>{if(live)setList(found);}).catch(()=>{});return()=>{live=false;};},[load,count]);
 async function add(){setBusy(true);setError('');try{
  const images=await pickImages(false,1);
  for(const image of images)await request('/api/operations/receipt',{[kind==='job'?'jobId':'bookingId']:id,data:await jpegData(image)},undefined,undefined,role);
  if(images.length)setList(await load());
 }catch(e){setError(e instanceof Error&&e.message?e.message:t('Не удалось приложить чек.'));}finally{setBusy(false);}}
 if(!canAdd&&!list.length)return null;
 const big=list.find(r=>r.id===open);
 return <View style={{gap:8}}>
  {!!title&&!!list.length&&<Text style={p.title}>{title}</Text>}
  {!!list.length&&<View style={p.receipts}>{list.map(r=><Pressable key={r.id} accessibilityRole="imagebutton" accessibilityLabel={open===r.id?t('Свернуть чек'):t('Открыть чек')} onPress={()=>setOpen(open===r.id?'':r.id)}>{r.uri?<Image source={{uri:r.uri}} style={p.receipt} alt={t('Чек об оплате')}/>:<View style={[p.receipt,{backgroundColor:C.surfaceAlt}]}/>}</Pressable>)}</View>}
  {!!big?.uri&&<Pressable accessibilityRole="imagebutton" accessibilityLabel={t('Свернуть чек')} onPress={()=>setOpen('')}><Image source={{uri:big.uri}} style={p.receiptBig} resizeMode="contain" alt={t('Чек об оплате')}/></Pressable>}
  {canAdd&&list.length<RECEIPT_LIMIT&&<Pressable accessibilityRole="button" disabled={busy} onPress={()=>void add()} style={({pressed})=>[p.link,(pressed||busy)&&{opacity:.7}]}><Text style={p.linkText}>{busy?t('Прикладываю…'):list.length?t('Приложить ещё чек'):t('Приложить чек из Kaspi')}</Text></Pressable>}
  {canAdd&&!list.length&&<Text style={p.meta}>{t('Снимок чека видит только получатель. С чеком он подтвердит оплату быстрее.')}</Text>}
  {!!error&&<Text accessibilityRole="alert" style={p.warn}>{error}</Text>}
 </View>;
}

/** «Реквизиты для оплаты» in the settings of the owner and the performer. The first details go into use at once; a
 *  change of details in use asks for the account password and waits 24 hours, with a notice and «Отменить замену»
 *  (lib/payout.ts), so whoever took over the account cannot redirect the next transfer at once. */
export function PayoutForm({initial,pending:initialPending,role,onSaved}:{initial:Payout|null;pending?:PendingPayout|null;role:'owner'|'cleaner';onSaved?:(value:Payout|null,pending:PendingPayout|null)=>void}){
 const [current,setCurrent]=useState<Payout|null>(initial),[editing,setEditing]=useState(!initial);
 const [phone,setPhone]=useState(initial?phoneText(initial.phone):'+7 '),[recipient,setRecipient]=useState(initial?.recipient||''),[link,setLink]=useState(initial?.link||''),[password,setPassword]=useState(''),[pending,setPending]=useState<PendingPayout|null>(initialPending||null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState('');
 const digits=(v:string)=>v.replace(/\D/g,'').slice(-10),changed=!!current&&(digits(phone)!==digits(current.phone)||recipient.trim().replace(/\s+/g,' ')!==current.recipient||link.trim()!==(current.link||''));
 const reset=(v:Payout|null)=>{setPhone(v?phoneText(v.phone):'+7 ');setRecipient(v?.recipient||'');setLink(v?.link||'');setPassword('');setError('');};
 async function send(body:Record<string,unknown>,ok:string){
  if(busy)return;setBusy(true);setError('');setDone('');
  try{const r=await request('/api/operations/payout',body,undefined,undefined,role);setDone(r?.message||ok);setPassword('');setPending(r?.pending||null);if(r?.payout){setCurrent(r.payout);reset(r.payout);setEditing(false);}else if(r?.pending)setEditing(false);onSaved?.(r?.payout||null,r?.pending||null);}
  catch(x){setError(x instanceof Error&&x.message?x.message:t('Не удалось сохранить.'));}finally{setBusy(false);}
 }
 // As the concept of the menu (Revolut's payout account): saved details are one card; the fields open with «Изменить».
 return <View style={{gap:12}}>
  <Text style={s.meta}>{role==='owner'?t('Сюда гости переводят оплату за жильё. Сервис эти деньги не принимает.'):t('Сюда заказчики переводят оплату за уборку. Сервис эти деньги не принимает.')}</Text>
  {!!pending&&<View style={pf.wait}><Text style={p.waitText}>{t('Замена ждёт: Kaspi {phone} ({name}) вступит в силу {when}. До этого вам платят по прежним реквизитам.',{phone:phoneText(pending.phone),name:pending.recipient,when:when(pending.until)})}</Text>
   <Pressable accessibilityRole="button" disabled={busy} onPress={()=>void send({action:'cancel'},t('Замена отменена.'))} style={({pressed})=>[pf.text,(pressed||busy)&&{opacity:.7}]}><Text style={pf.textLink}>{t('Отменить замену')}</Text></Pressable></View>}
  {!editing&&current?<>
   <View accessible accessibilityLabel={t('Номер Kaspi')+' '+phoneText(current.phone)+', '+current.recipient} style={pf.card}>
    <View style={pf.head}><View style={pf.logo}><Text style={pf.logoText}>Kaspi</Text></View><View style={{flex:1,minWidth:0}}><Text style={pf.phone}>{phoneText(current.phone)}</Text><Text numberOfLines={1} style={s.meta}>{t('Получатель: {name}',{name:current.recipient})}</Text></View></View>
    <View style={pf.line}><Text style={pf.lineTitle}>{t('Ссылка Kaspi Pay')}</Text><Text numberOfLines={1} style={[s.meta,{flexShrink:1}]}>{current.link||t('не указана')}</Text></View>
   </View>
   <Pressable accessibilityRole="button" onPress={()=>{reset(current);setDone('');setEditing(true);}} style={({pressed})=>[pf.btn,pf.btnLine,pressed&&{opacity:.6}]}><Text style={[pf.btnText,{color:C.ink}]}>{t('Изменить реквизиты')}</Text></Pressable>
  </>:<>
   <View><Text style={s.fieldLabel}>{t('Номер Kaspi')}</Text><TextInput accessibilityLabel={t('Номер Kaspi')} value={phone} onChangeText={v=>{setPhone(v);setDone('');}} keyboardType="phone-pad" maxLength={20} placeholder="+7 7XX XXX XX XX" placeholderTextColor={C.muted} style={s.field}/></View>
   <View><Text style={s.fieldLabel}>{t('Имя получателя, как в Kaspi')}</Text><TextInput accessibilityLabel={t('Имя получателя')} value={recipient} onChangeText={v=>{setRecipient(v);setDone('');}} maxLength={60} placeholder={t('Айгерим К.')} placeholderTextColor={C.muted} style={s.field}/></View>
   <View><Text style={s.fieldLabel}>{t('Ссылка Kaspi Pay, если есть')}</Text><TextInput accessibilityLabel={t('Ссылка Kaspi Pay')} value={link} onChangeText={v=>{setLink(v);setDone('');}} autoCapitalize="none" autoCorrect={false} keyboardType="url" maxLength={300} placeholder="https://pay.kaspi.kz/…" placeholderTextColor={C.muted} style={s.field}/></View>
   {changed&&<View><Text style={s.fieldLabel}>{t('Пароль от аккаунта')}</Text><TextInput accessibilityLabel={t('Пароль от аккаунта')} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} maxLength={128} style={s.field}/>
    <Text style={[s.meta,{marginTop:8}]}>{t('Новые реквизиты вступят в силу через 24 часа. Мы пришлём оповещение, чтобы замену можно было отменить, если это не вы.')}</Text></View>}
   <Pressable accessibilityRole="button" disabled={busy||(changed&&!password)} onPress={()=>void send({phone,recipient,link,...(changed?{password}:{})},t('Сохранено'))} style={[pf.btn,(busy||(changed&&!password))&&s.disabled]}><Text style={pf.btnText}>{busy?t('Сохраняю…'):changed?t('Заменить реквизиты'):t('Сохранить реквизиты')}</Text></Pressable>
   {!!current&&<Pressable accessibilityRole="button" disabled={busy} onPress={()=>{reset(current);setEditing(false);}} style={({pressed})=>[pf.text,pressed&&{opacity:.6}]}><Text style={pf.textLink}>{t('Отмена')}</Text></Pressable>}
  </>}
  {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
  {!!done&&<Text accessibilityRole="text" style={s.meta}>{done}</Text>}
  <Text style={s.meta}>{role==='owner'?t('Номер видит только гость с подтверждённой бронью.'):t('Номер видит только заказчик после принятой уборки.')}</Text>
 </View>;
}
const pf=StyleSheet.create({
 card:{borderRadius:R.lg,borderWidth:1,borderColor:C.line,backgroundColor:C.surface,padding:16,gap:12},
 head:{flexDirection:'row',alignItems:'center',gap:12},
 logo:{width:44,height:44,borderRadius:R.md,backgroundColor:C.surfaceAlt,alignItems:'center',justifyContent:'center'},logoText:{...type.caption,color:C.ink,fontWeight:'800'},
 phone:{...type.subtitle,color:C.ink,fontWeight:'700'},
 line:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12,paddingTop:12,borderTopWidth:1,borderTopColor:C.line},lineTitle:{...type.label,color:C.ink,fontWeight:'500'},
 btn:{minHeight:T.control.primary,borderRadius:R.full,backgroundColor:C.ink,alignItems:'center',justifyContent:'center',paddingHorizontal:24},btnLine:{backgroundColor:C.surface,borderWidth:1,borderColor:C.lineStrong},btnText:{...type.body,color:C.onAccent,fontWeight:'700'},
 text:{minHeight:T.control.touch,alignSelf:'flex-start',justifyContent:'center'},textLink:{...type.label,color:C.ink,fontWeight:'600',textDecorationLine:'underline'},
 wait:{borderRadius:R.md,borderWidth:1,borderColor:C.warningLine,backgroundColor:C.warningSoft,padding:12},
});

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
