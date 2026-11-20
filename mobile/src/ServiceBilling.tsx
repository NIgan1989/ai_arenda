import React,{useCallback,useEffect,useState} from 'react';
import {View,Text,Pressable,StyleSheet} from 'react-native';
import {request} from './api';
import {ThinkingLine} from './Thinking';
import {s,C,type,brandFont} from './styles';
import {T} from './tokens';

// «Оплата услуг» in the settings of the owner and the performer (lib/service-dues.ts). No balance and no top-ups:
// the screen shows what the service accrued, the linked card and when it is charged; the list below is the account.
type Item={kind:'commission'|'cleaning'|'autopilot'|'payment';at:number;amount:number;title:string};
type State={due:number;stopped?:boolean;checking?:number;confirm?:number;card:{mask:string;test:boolean}|null;nextChargeAt:number;payBy:number|null;paused:boolean;test:boolean;payDays:number;items:Item[]};
const R=T.radius;
const money=(n:number)=>new Intl.NumberFormat('ru-RU').format(n||0).replace(/\s/g,' ')+' ₸';
const day=(t:number)=>new Date(t*1000).toLocaleDateString('ru-RU',{timeZone:'Asia/Qyzylorda',day:'numeric',month:'long'});

export function ServiceBilling({role}:{role:'owner'|'cleaner'}){
 const [state,setState]=useState<State|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const load=useCallback(()=>request('/api/operations/service-billing/state',undefined,undefined,undefined,role).then(setState).catch((e:any)=>setError(e?.message||'Не удалось загрузить.')),[role]);
 useEffect(()=>{void load();},[load]);
 async function act(action:'link'|'pay'|'unlink'){
  if(busy)return;setBusy(true);setError('');setMessage('');
  try{const r=await request('/api/operations/service-billing',{action},undefined,undefined,role);setMessage(r?.message||'');if(r?.state)setState(r.state);}
  catch(e:any){setError(e?.message||'Не получилось.');}finally{setBusy(false);}
 }
 if(!state)return error?<Text accessibilityRole="alert" style={s.error}>{error}</Text>:<ThinkingLine style={s.meta} text="Загружаю…"/>;
 const button=(title:string,onPress:()=>void,secondary=false)=><Pressable accessibilityRole="button" disabled={busy} onPress={onPress} style={({pressed})=>[s.button,secondary&&s.secondary,(busy||pressed)&&s.disabled]}><Text style={[s.buttonText,secondary&&s.secondaryText]}>{title}</Text></Pressable>;
 // A charge is never repeated while the bank's answer is checked; a large week waits for the person's own «Оплатить сейчас».
 const hold=state.stopped?'Списания временно остановлены сервисом. Ничего не спишется, пока их не включат.':state.checking?'Уточняем в банке прошлое списание '+money(state.checking)+'. Повторно не спишем, итог пришлём.':state.confirm?'Сумма крупная, поэтому сама не спишется. Подтвердите её кнопкой ниже'+(state.payBy?' до '+day(state.payBy):'')+'.':'';
 const when=hold||(state.paused?'Пауза: новые брони и «Автопилот» остановлены до оплаты.':state.payBy?(state.card?'Оплатите до ':'Привяжите карту до ')+day(state.payBy)+', иначе новые брони и «Автопилот» встанут на паузу.':state.due>0?(state.card?'Спишется с карты '+day(state.nextChargeAt)+'.':'Привяжите карту: списание раз в неделю, по понедельникам.'):'Сейчас платить нечего.');
 return <View style={{gap:16}}>
  <View accessible accessibilityLabel={'К оплате '+money(state.due)+'. '+when} style={[b.card,(state.paused||!!state.payBy||!!hold)&&b.cardWarn]}>
   <Text style={b.label}>К оплате за услуги сервиса</Text>
   <Text style={b.sum}>{money(state.due)}</Text>
   <Text style={[b.meta,(state.paused||!!state.payBy||!!hold)&&{color:C.warning}]}>{when}</Text>
  </View>
  <View style={b.row}>
   <View style={{flex:1,minWidth:0}}><Text style={b.title}>{state.card?'Карта '+state.card.mask:'Карта не привязана'}</Text><Text style={b.meta}>{state.card?(state.card.test?'Тестовая: деньги не списываются':'Списания раз в неделю'):'Привяжите один раз, дальше сервис списывает сам'}</Text></View>
  </View>
  {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}{!!message&&<Text accessibilityLiveRegion="polite" style={b.done}>{message}</Text>}
  {!state.card&&<Text style={s.meta}>Привязывая карту, вы соглашаетесь, что сервис раз в неделю, по понедельникам, списывает с неё начисленную плату за свои услуги. Сумму и список начислений видно здесь заранее. Отвязать карту можно в любой момент, когда долга нет.</Text>}
  {!state.card&&button(state.test?'Привязать тестовую карту':'Привязать карту',()=>void act('link'))}
  {!!state.card&&state.due>0&&!state.stopped&&!state.checking&&button('Оплатить сейчас '+money(state.due),()=>void act('pay'))}
  {!!state.card&&state.due<=0&&button('Отвязать карту',()=>void act('unlink'),true)}
  <Text style={s.meta}>{role==='owner'?'Сервис берёт плату только за свои услуги: комиссию за бронь, подбор исполнителя и «Автопилот». Оплату от гостей получаете вы сами.':'Сервис берёт плату только за «Автопилот». Оплату за уборки вы получаете напрямую от заказчиков.'}{state.test?' Пока банк не подключён, карта и списания тестовые.':''}</Text>
  <View style={{gap:8}}>
   <Text style={b.title}>Учёт</Text>
   {!state.items.length&&<Text style={s.meta}>Пока начислений нет.</Text>}
   {state.items.map((i,n)=><View key={n} style={b.item}><View style={{flex:1,minWidth:0}}><Text numberOfLines={2} style={b.itemTitle}>{i.title}</Text><Text style={b.meta}>{day(i.at)}</Text></View><Text style={[b.itemSum,i.kind==='payment'&&{color:C.success}]}>{i.kind==='payment'?'оплачено '+money(i.amount):money(i.amount)}</Text></View>)}
  </View>
 </View>;
}

const b=StyleSheet.create({
 card:{borderRadius:R.lg,borderWidth:1,borderColor:C.accentLine,backgroundColor:C.accentSoft,padding:16,gap:4},
 cardWarn:{borderColor:C.warning},
 label:{...type.label,color:C.inkSoft,fontWeight:'600'},
 sum:{...type.title,...brandFont,color:C.ink},
 meta:{...type.label,color:C.muted},
 row:{flexDirection:'row',alignItems:'center',gap:12,backgroundColor:C.surface,borderRadius:R.md,padding:16},
 title:{...type.body,color:C.ink,fontWeight:'600'},
 done:{...type.label,color:C.success},
 item:{flexDirection:'row',alignItems:'center',gap:12,backgroundColor:C.surface,borderRadius:R.md,padding:12},
 itemTitle:{...type.label,color:C.ink},
 itemSum:{...type.label,color:C.ink,fontWeight:'600'},
});
