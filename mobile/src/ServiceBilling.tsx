import {dateText,t as tr} from '../../lib/i18n';
import React,{useCallback,useEffect,useState} from 'react';
import {View,Text,Pressable,StyleSheet} from 'react-native';
import {request} from './api';
import {ThinkingLine} from './Thinking';
import {s,C,type} from './styles';
import {Btn,Group,Row,RowIcon,a} from './AccountRows';
import {T} from './tokens';

// «Оплата услуг» in the settings of the owner and the performer (lib/service-dues.ts). No balance and no top-ups:
// the screen shows what the service accrued, the linked card and when it is charged; the list below is the account.
type Item={kind:'commission'|'cleaning'|'autopilot'|'ai_booking'|'cleaner_job'|'payment';at:number;amount:number;title:string};
type Rates={owner:number;ownerMax:number;cleaner:number;home:number;homeMin:number;hallFrom:number;hallTo:number};
type State={due:number;rates?:Rates;stopped?:boolean;checking?:number;confirm?:number;card:{mask:string;test:boolean}|null;nextChargeAt:number;payBy:number|null;paused:boolean;test:boolean;payDays:number;items:Item[]};
const money=(n:number)=>new Intl.NumberFormat('ru-RU').format(n||0).replace(/\s/g,' ')+' ₸';
const percent=(bp:number)=>String(bp/100).replace('.',',')+'%';
// What the service takes, with the rates in force (lib/service-dues.ts reads them from the tariff the administrator sets).
const feeText=(role:'owner'|'cleaner',r?:Rates)=>!r?'':role==='owner'?tr(r.ownerMax>0?'Сервис берёт плату только за результат: {rate} с заселения гостя, но не больше {max}. За банкетный зал или кафе вместо процента плата в месяц по вместимости, от {hallFrom} до {hallTo}. За уборку «Мой дом» {home} от цены, не меньше {homeMin}. «Автопилот», ИИ и подбор исполнителя уже входят. Оплату от гостей получаете вы сами.':'Сервис берёт плату только за результат: {rate} с заселения гостя. За банкетный зал или кафе вместо процента плата в месяц по вместимости, от {hallFrom} до {hallTo}. За уборку «Мой дом» {home} от цены, не меньше {homeMin}. «Автопилот», ИИ и подбор исполнителя уже входят. Оплату от гостей получаете вы сами.',{rate:percent(r.owner),max:money(r.ownerMax),hallFrom:money(r.hallFrom),hallTo:money(r.hallTo),home:percent(r.home),homeMin:money(r.homeMin)}):tr('Сервис берёт {rate} с каждой уборки, полученной через приложение. «Автопилот» уже входит. Оплату за уборки вы получаете напрямую от заказчиков.',{rate:percent(r.cleaner)});
const day=(t:number)=>dateText(t*1000,{timeZone:'Asia/Qyzylorda',day:'numeric',month:'long'});

export function ServiceBilling({role}:{role:'owner'|'cleaner'}){
 const [state,setState]=useState<State|null>(null),[open,setOpen]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const load=useCallback(()=>request('/api/operations/service-billing/state',undefined,undefined,undefined,role).then(setState).catch((e:any)=>setError(e?.message||tr('Не удалось загрузить.'))),[role]);
 useEffect(()=>{void load();},[load]);
 async function act(action:'link'|'pay'|'unlink'){
  if(busy)return;setBusy(true);setError('');setMessage('');
  try{const r=await request('/api/operations/service-billing',{action},undefined,undefined,role);setMessage(r?.message||'');if(r?.state)setState(r.state);}
  catch(e:any){setError(e?.message||tr('Не получилось.'));}finally{setBusy(false);}
 }
 if(!state)return error?<Text accessibilityRole="alert" style={s.error}>{error}</Text>:<ThinkingLine style={s.meta} text={tr('Загружаю…')}/>;
 // A charge is never repeated while the bank's answer is checked; a large week waits for the person's own «Оплатить сейчас».
 const hold=state.stopped?tr('Списания временно остановлены сервисом. Ничего не спишется, пока их не включат.'):state.checking?tr('Уточняем в банке прошлое списание {sum}. Повторно не спишем, итог пришлём.',{sum:money(state.checking)}):state.confirm?(state.payBy?tr('Сумма крупная, поэтому сама не спишется. Подтвердите её кнопкой ниже до {v}.',{v:day(state.payBy)}):tr('Сумма крупная, поэтому сама не спишется. Подтвердите её кнопкой ниже.')):'';
 const when=hold||(state.paused?tr('Пауза: новые брони и «Автопилот» остановлены до оплаты.'):state.payBy?(state.card?tr('Оплатите до {v}, иначе новые брони и «Автопилот» встанут на паузу.',{v:day(state.payBy)}):tr('Привяжите карту до {v}, иначе новые брони и «Автопилот» встанут на паузу.',{v:day(state.payBy)})):state.due>0?(state.card?tr('Спишется с карты {v}.',{v:day(state.nextChargeAt)}):tr('Привяжите карту: списание раз в неделю, по понедельникам.')):tr('Сейчас платить нечего.'));
 const warn=state.paused||!!state.payBy||!!hold;
 // As the concept of the menu (Lyft's payment): the sum in big, the card as a row, the rates and the account as rows
 // that open in place.
 return <View>
  <View accessible accessibilityLabel={tr('К оплате {v}. {when}',{v:money(state.due),when})} style={b.top}>
   <Text style={b.label}>{tr('К оплате сервису')}</Text>
   <Text style={b.sum}>{money(state.due)}</Text>
   <Text style={[b.meta,warn&&{color:C.warning}]}>{when}</Text>
  </View>
  <Group title={tr('Карта')}>
   <View style={a.row}><RowIcon icon="wallet"/><View style={a.wide}><Text style={a.title}>{state.card?state.card.mask:tr('Карта не привязана')}</Text><Text style={a.note}>{state.card?(state.card.test?tr('Тестовая: деньги не списываются'):tr('Списания раз в неделю')):tr('Привяжите один раз, дальше сервис списывает сам')}</Text></View></View>
  </Group>
  {!!error&&<Text accessibilityRole="alert" style={[s.error,{marginTop:12}]}>{error}</Text>}{!!message&&<Text accessibilityLiveRegion="polite" style={b.done}>{message}</Text>}
  {!state.card&&<Text style={a.footnote}>{tr('Привязывая карту, вы соглашаетесь, что сервис раз в неделю, по понедельникам, списывает с неё начисленную плату за свои услуги. Сумму и список начислений видно здесь заранее. Отвязать карту можно в любой момент, когда долга нет.')}</Text>}
  {!state.card&&<Btn title={state.test?tr('Привязать тестовую карту'):tr('Привязать карту')} disabled={busy} onPress={()=>void act('link')}/>}
  {!!state.card&&state.due>0&&!state.stopped&&!state.checking&&<Btn title={tr('Оплатить сейчас {v}',{v:money(state.due)})} disabled={busy} onPress={()=>void act('pay')}/>}
  <Group space>
   <Row icon="chart" title={tr('Как считаем')} value={state.rates?(role==='owner'?tr('{rate} с заселения',{rate:percent(state.rates.owner)}):tr('{rate} с уборки',{rate:percent(state.rates.cleaner)})):undefined} open={open==='how'} onPress={()=>setOpen(v=>v==='how'?'':'how')}/>
   {open==='how'&&<View style={a.body}><Text style={a.note}>{feeText(role,state.rates)}{state.test?' '+tr('Пока банк не подключён, карта и списания тестовые.'):''}</Text></View>}
   {state.items.length?<Row icon="clock" title={tr('Начисления')} value={String(state.items.length)} open={open==='items'} onPress={()=>setOpen(v=>v==='items'?'':'items')}/>
    :<View style={a.row}><RowIcon icon="clock"/><Text style={[a.title,a.wide]}>{tr('Начисления')}</Text><Text style={[a.value,{flex:0}]}>{tr('пока нет')}</Text></View>}
   {open==='items'&&state.items.map((i,n)=><View key={n} style={a.row}><View style={a.wide}><Text numberOfLines={2} style={a.title}>{i.title}</Text><Text style={a.note}>{day(i.at)}</Text></View><Text style={[b.itemSum,i.kind==='payment'&&{color:C.success}]}>{i.kind==='payment'?tr('оплачено {v}',{v:money(i.amount)}):money(i.amount)}</Text></View>)}
  </Group>
  {!!state.card&&state.due<=0&&<Pressable accessibilityRole="button" disabled={busy} onPress={()=>void act('unlink')} style={({pressed})=>[b.unlink,(pressed||busy)&&{opacity:.6}]}><Text style={b.unlinkText}>{tr('Отвязать карту')}</Text></Pressable>}
 </View>;
}

const b=StyleSheet.create({
 top:{gap:2},
 label:{...type.label,color:C.muted},
 sum:{fontSize:36,lineHeight:40,fontWeight:'800',letterSpacing:-.6,color:C.ink,fontVariant:['tabular-nums']},
 meta:{...type.label,color:C.inkSoft},
 done:{...type.label,color:C.success,marginTop:12},
 itemSum:{...type.label,color:C.ink,fontWeight:'600'},
 unlink:{minHeight:T.control.touch,alignSelf:'flex-start',justifyContent:'center',marginTop:12},unlinkText:{...type.label,color:C.danger,fontWeight:'600',textDecorationLine:'underline'},
});
