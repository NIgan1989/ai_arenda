import {t} from '../../lib/i18n';
import {jobPayNote} from '../../lib/regular-cleaner-text';
import React,{useEffect,useState} from 'react';
import {View,Text,Pressable,StyleSheet,Platform,LayoutAnimation,UIManager} from 'react-native';
import {C,type} from './styles';
import {T} from './tokens';
import {SwipeConfirm} from './SwipeConfirm';
import {useActivityClock} from './ActivityTimer';
import {request} from './api';
import {money,type Row} from './model';
import {Photo} from './ListingMedia';
import {processJourney} from '../../lib/process-journey';
import {processStatus} from '../../lib/process-status';
import {recordSpan,hallLine} from '../../lib/record-span';
import type {ProcessThread} from '../../lib/process-threads';
const tones:Record<string,[string,string]>={success:[C.successSoft,C.success],warning:[C.warningSoft,C.warning],active:[C.goldSoft,C.goldInk],neutral:[C.surfaceAlt,C.muted],danger:[C.dangerSoft,C.danger]};
// «На карте»: a small pill next to the place of a booking, a cleaning or an object, in a chat's subject line too.
// It opens the home map on that pin (MapHome, map-memory.ts targetPin).
export function MapLink({onPress,label=t('Показать на карте')}:{onPress:()=>void;label?:string}){
 return <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={8} onPress={onPress} style={({pressed})=>[r.mapLink,pressed&&r.dim]}><View style={r.mapPin}><View style={r.mapPinDot}/></View><Text style={r.mapLinkText}>{t('На карте')}</Text></Pressable>;
}
export function RecordFacts({rows}:{rows:(readonly [string,string,boolean?]|false|null|undefined|'')[]}){
 const shown=rows.filter(Boolean) as (readonly [string,string,boolean?])[];if(!shown.length)return null;
 return <View style={r.facts}>{shown.map(([label,value,secret],index)=><View key={label} style={[r.fact,index>0&&r.factLine,secret&&r.factPrivate]}><Text style={r.factLabel}>{label}</Text><Text style={r.factValue}>{value}</Text></View>)}</View>;
}
// `swipe`: the action confirms a fact or a promise, so as the main action of a card it is a track to swipe; the words on the
// track say what is confirmed, and `onSwipe` (when given) sends it at once, without the «Подтвердите действие» card.
// Under «Ещё» the same action stays an ordinary button with its confirmation card.
export type RecordAction={title:string;onPress:()=>void;kind:'main'|'side'|'danger';disabled?:boolean;note?:string;swipe?:string;onSwipe?:()=>void};
export function RecordActions({actions,busy,soft=false}:{actions:(RecordAction|false|null|undefined|''|0)[];busy:boolean;soft?:boolean}){
 const [focused,setFocused]=useState(''),all=actions.filter(Boolean) as RecordAction[],mains=all.filter(a=>a.kind==='main'),side=all.filter(a=>a.kind==='side'),danger=all.filter(a=>a.kind==='danger');
 if(!all.length)return null;
 const button=(a:RecordAction,box:any,text:any)=><Pressable key={a.title} accessibilityRole="button" accessibilityLabel={a.title} accessibilityState={{disabled:busy||!!a.disabled}} disabled={busy||!!a.disabled} onPress={a.onPress} onFocus={(e:any)=>{if(Platform.OS!=='web'||e?.target?.matches?.(':focus-visible'))setFocused(a.title);}} onBlur={()=>setFocused('')} style={({pressed})=>[r.action,box,focused===a.title&&r.focus,(pressed||busy||a.disabled)&&r.dim]}><Text style={[r.actionText,text]}>{a.title}</Text></Pressable>;
 // Under «Ещё» every action is a row of a list, as the rows of a booking in Airbnb («Написать», «Как добраться», «Правила»).
 if(soft)return <View style={r.list}>{[...mains,...side,...danger].map(a=><Pressable key={a.title} accessibilityRole="button" accessibilityLabel={a.title} accessibilityState={{disabled:busy||!!a.disabled}} disabled={busy||!!a.disabled} onPress={a.onPress} style={({pressed})=>[r.listRow,(pressed||busy||a.disabled)&&r.dim]}><Text style={[r.listText,a.kind==='danger'&&r.dangerText]}>{a.title}</Text>{a.kind!=='danger'&&<Text style={r.listGo}>›</Text>}</Pressable>)}</View>;
 return <View style={r.actions}>{mains.map((a,i)=><React.Fragment key={a.title}>{a.swipe&&!i&&!soft?<SwipeConfirm key={a.swipe} label={a.swipe} disabled={busy||!!a.disabled} onConfirm={a.onSwipe||a.onPress}/>:button(a,i||soft?r.next:r.main,i||soft?r.nextText:r.mainText)}{!!a.note&&<Text style={r.actionNote}>{a.note}</Text>}</React.Fragment>)}{side.length>0&&<View style={r.sideRow}>{side.map(a=>button(a,r.side,r.sideText))}</View>}{danger.map(a=>button(a,r.danger,r.dangerText))}</View>;
}
// A booking, a cleaning or a task in short: what, when, how much, the step it is at and one line on what happens now.
// One big button, and only for the step a person has to take; a tap on the card opens the facts, every other action is
// under «Ещё», three dots in the corner. No step numbers: the line says what is now and what comes next.
// `thread` is the same thread as on the home sheet (owner and assigned performer), so the step and the line match it.
type Maybe<V>=V|false|null|undefined|''|0;
// `compact` (the «Мои брони» list): the card is one short row (what, how much, when, the status) and opens in place
// into the whole card by a tap; the title row of an open card folds it back. `startOpen` opens it at once (a stay going on now).
// A guest's request waits for the owner's answer: the time left, large, with a line that runs out, as a taxi app says
// when the car comes. The interval is held for the guest and nothing is charged yet.
export function AnswerWait({item,bare=false}:{item:Row;bare?:boolean}){
 const now=useActivityClock(),until=Number(item.expires_at)||0,from=Number(item.created_at)||until-900,left=until-now;
 if(!now||!until||left<=0)return null;
 const share=Math.max(0,Math.min(1,left/Math.max(60,until-from))),mm=Math.floor(left/60),ss=String(left%60).padStart(2,'0');
 return <View accessible accessibilityLabel={t('Владелец ответит через {v}',{v:mm+':'+ss})} style={[r.wait,bare&&r.waitBare]}><Text style={r.waitLabel}>{t('Владелец ответит через')}</Text><Text style={r.waitDigits}>{mm}:{ss}</Text><View style={r.waitBar}><View style={[r.waitFill,{width:`${Math.round(share*100)}%` as const}]}/></View><Text style={r.waitNote}>{t('Время придержано для вас. Деньги не списаны.')}</Text></View>;
}
if(Platform.OS==='android')UIManager.setLayoutAnimationEnabledExperimental?.(true);
const smooth=()=>LayoutAnimation.configureNext(LayoutAnimation.create(220,LayoutAnimation.Types.easeInEaseOut,LayoutAnimation.Properties.opacity));
// The owner's fee for one booking, to show the sum as top apps do (Airtasker, alias): what the guest pays, minus the
// service's fee, what stays. The rate and its cap come from the server; during the free start the fee is zero.
export type OwnerFee={rate:number;max:number;freeUntil:number|null};
let feeCache:Promise<OwnerFee>|null=null;
export function useOwnerFee(on:boolean){
 const [fee,setFee]=useState<OwnerFee|null>(null);
 useEffect(()=>{if(!on)return;let live=true;
  feeCache=feeCache||Promise.all([request('/api/operations/service-billing/state',undefined,undefined,undefined,'owner'),request('/api/operations/autopilot/state').catch(()=>null)]).then(([b,a]:any[])=>({rate:Number(b?.rates?.owner??400),max:Number(b?.rates?.ownerMax??0),freeUntil:a?.billing?.freeUntil??null}));
  feeCache.then(v=>{if(live)setFee(v);}).catch(()=>{feeCache=null;});
  return()=>{live=false;};},[on]);
 return fee;
}
export function feeOf(amount:number,fee:OwnerFee,at:number){
 if(fee.freeUntil&&fee.freeUntil>at)return 0;
 let v=Math.floor((amount*fee.rate+5000)/10000);if(fee.max>0)v=Math.min(v,fee.max);return Math.max(0,Math.min(v,amount));
}
// The owner's quick answer to a request: the approval card of the booking and how to send the decision.
// payout: the owner's Kaspi details (where the guest transfers); onMethod opens «Реквизиты для оплаты».
export type OwnerAsk={card:Row;onDecide:(body:Row)=>void;onReview:()=>void;payout?:Row|null;onMethod?:(page:'payout')=>void};
// «•• 45 67»: only the last digits of a Kaspi number, as a bank card shows «•• 0222».
const tail=(phone:string)=>{const d=String(phone||'').replace(/\D/g,'');return d.length>=4?'•• '+d.slice(-4,-2)+' '+d.slice(-2):'';};
export function DealCard({kind,item,role,userId,application,thread,line:own,actions,busy,always,details,extra,onMap,compact=false,startOpen=false,request}:{request?:OwnerAsk;kind:'booking'|'job';item:Row;role:string;userId:string;application?:Row;thread?:ProcessThread|null;line?:string|null;actions:Maybe<RecordAction>[];busy:boolean;always?:React.ReactNode;details?:React.ReactNode;extra?:React.ReactNode;onMap?:()=>void;compact?:boolean;startOpen?:boolean}){
 const [open,setOpen]=useState(false),[more,setMore]=useState(false),[unfolded,setUnfolded]=useState(startOpen),clock=useActivityClock();
 const ownerFee=useOwnerFee(kind==='booking'&&!!request);
 let pics:string[]=[];try{pics=Array.isArray(item.property_photos)?item.property_photos:JSON.parse(item.property_photos||'[]');}catch{pics=[];}
 const status=processStatus(kind,item,role,userId,application),[,ink]=tones[status.tone]||tones.neutral,flow=processJourney(kind,item);
 const total=thread?thread.steps.length:flow.labels.length,done=thread?thread.finished:flow.done,step=Math.min(thread?thread.current:flow.current,total-1),line=flow.stopped?flow.hint:thread?thread.line:own||flow.hint;
 const all=actions.filter(Boolean) as RecordAction[],main=all.find(a=>a.kind==='main'),rest:Maybe<RecordAction>[]=[...all.filter(a=>a!==main),!!onMap&&{title:t('Показать на карте'),kind:'side' as const,onPress:onMap}];
 const hasMore=rest.some(Boolean)||!!extra;
 const dots=(on:boolean,show:boolean)=>show?<Pressable accessibilityRole="button" accessibilityLabel={on?t('Скрыть'):t('Ещё')} accessibilityState={{expanded:on}} hitSlop={8} onPress={()=>{smooth();setMore(v=>!v);}} style={({pressed})=>[r.dots,pressed&&r.dim]}><Text style={r.dotsText}>•••</Text></Pressable>:null;
 const flip=()=>{smooth();setOpen(v=>!v);};
 if(compact&&!unfolded){
  const sum=money(kind==='job'?item.fee:item.amount),said=!!main&&status.label.toLowerCase().includes(main.title.toLowerCase().slice(0,8)),next=main?main.title.replace(/^Оплатил /,'Оплатить ').replace(/^Вернул /,'Вернуть '):'',label=item.title+', '+sum+', '+recordSpan(item.start,item.end)+', '+status.label+(item.demo_owner?t(', учебная'):'')+(main&&!said?t(', дальше: {next}',{next}):'');
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint={t('Открыть подробности')} accessibilityState={{expanded:false}} onPress={()=>{smooth();setUnfolded(true);}} style={({pressed})=>[r.card,r.row,pressed&&r.pressed]}>
   <View style={r.rowHead}><Text numberOfLines={2} style={[r.dealTitle,r.grow]}>{item.title}</Text><Text style={r.rowSum}>{sum}</Text></View>
   <Text numberOfLines={1} style={r.rowWhen}>{recordSpan(item.start,item.end)}{kind==='booking'&&!!hallLine(item)&&<Text>{' · '+hallLine(item)}</Text>}{!!item.demo_owner&&<Text style={r.rowDemo}>{' · '+(kind==='job'?t('Учебное'):t('Учебная'))}</Text>}</Text>
   <View style={r.rowTop}><View style={[r.dot,{backgroundColor:ink}]}/><Text numberOfLines={1} style={[r.rowStatus,r.grow]}>{status.label}{!!main&&!said&&<Text style={r.rowDo}>{' · '+next}</Text>}</Text><Text style={r.chevron}>⌄</Text></View>
  </Pressable>;
 }
 // The owner answers a guest's request, as a driver takes an order (concept 2026-11-25): who asks, a round timer of the
 // 15 minutes, when, which home, what the owner gets; accept with a swipe, decline with one word. The rest under «Ещё».
 if(kind==='booking'&&item.status==='requested'&&!!request&&clock>0&&Number(item.expires_at)>clock&&(!compact||unfolded)){
  const card=request.card,left=Number(item.expires_at)-clock,from=Number(item.created_at)||Number(item.expires_at)-900,share=Math.max(0,Math.min(1,left/Math.max(60,Number(item.expires_at)-from)));
  const mm=Math.floor(left/60),ss=String(Math.floor(left%60)).padStart(2,'0'),guests=Number(item.guests)||1;
  const low=(v:string)=>v.charAt(0).toLowerCase()+v.slice(1),action=card.depositLabel?'deposit':'accept',fee=Number(card.cleaningFee)||0;
  const decide=(what:string)=>request.onDecide({id:card.id,revision:card.revision,action:what,reason:'',cleaningFee:fee});
  const risk=card.risk,calm=!risk||risk.level==='low';
  const others=rest.filter(Boolean);
  const method=(title:string,note:string,missing:boolean)=><Pressable accessibilityRole="button" accessibilityLabel={title+'. '+note+'. '+(missing?t('Добавить'):t('Изменить'))} disabled={!request.onMethod} onPress={()=>request.onMethod?.('payout')} style={({pressed})=>[r.payRow,pressed&&r.dim]}>
   <View style={[r.payMark,r.payKaspi]}><Text style={r.payMarkText}>K</Text></View>
   <View style={r.grow}><Text numberOfLines={1} style={r.payTitle}>{title}</Text><Text numberOfLines={1} style={[r.payNote,missing&&r.payWarn]}>{note}</Text></View>
   <Text style={r.payEdit}>{missing?t('Добавить'):t('Изменить')}</Text>
  </Pressable>;
  return <View style={r.card}>
   <Pressable accessibilityRole="button" accessibilityState={{expanded:open}} accessibilityHint={t('Открыть подробности')} onPress={flip} style={({pressed})=>[r.askHead,pressed&&r.pressed]}>
    <View style={r.grow}><Text style={r.askCaption}>{t('Новая заявка')}</Text><Text accessibilityRole="header" numberOfLines={2} style={r.askWho}>{(item.guest_name||t('Гость'))+', '+guests+' '+(guests===1?t('гость'):guests<5?t('гостя'):t('гостей'))}</Text>{!!card.reliability?.label&&<Text style={r.rowWhen}>{card.reliability.label}</Text>}</View>
    <View accessible accessibilityLabel={t('Осталось {v}',{v:mm+':'+ss})} style={r.ring}><View style={[r.ringArc,{borderTopColor:share>0?C.accent:'transparent',borderRightColor:share>0.25?C.accent:'transparent',borderBottomColor:share>0.5?C.accent:'transparent',borderLeftColor:share>0.75?C.accent:'transparent'}]}/><Text style={r.ringText}>{mm}:{ss}</Text></View>
    {dots(more,true)}
   </Pressable>
   <View style={r.askRow}><Text style={r.askKey}>{t('Когда')}</Text><Text style={r.askValue}>{recordSpan(item.start,item.end)}</Text></View>
   <View style={r.askRow}><Text style={r.askKey}>{t('Жильё')}</Text><Text numberOfLines={2} style={r.askValue}>{item.title}</Text></View>
   <View style={r.askMoney}>
    <View style={r.askLine}><Text style={r.askKey}>{t('Гость платит')}</Text><Text style={r.askValue}>{money(item.amount)}</Text></View>
    {!!ownerFee&&<View style={r.askLine}><Text style={r.askKey}>{feeOf(Number(item.amount)||0,ownerFee,clock)?t('Комиссия сервиса {n}%',{n:String(ownerFee.rate/100).replace('.',',')}):t('Комиссия сервиса · бесплатный старт')}</Text><Text style={r.askValue}>{'−'+money(feeOf(Number(item.amount)||0,ownerFee,clock))}</Text></View>}
    <View style={[r.askLine,r.askTotal]}><Text style={r.askTotalKey}>{t('Вы получите')}</Text><Text style={r.askSum}>{money((Number(item.amount)||0)-(ownerFee?feeOf(Number(item.amount)||0,ownerFee,clock):0))}</Text></View>
   </View>
   {/* Where the guest pays, as «Payment method» in Airbnb or Fresha: the bank, the last digits, «Изменить». */}
   <View style={r.payBox}>
    {method(request.payout?.phone?t('Kaspi {v}',{v:tail(request.payout.phone)}):t('Kaspi не указан'),request.payout?.phone?t('сюда переведёт гость'):t('гость не увидит, куда платить'),!request.payout?.phone)}
   </View>
   <View style={r.state}><View style={[r.dot,{backgroundColor:calm?C.success:C.warning}]}/><Text style={r.stateText}>{calm?t('Надёжный гость'):(risk.label||t('Проверьте гостя'))}</Text></View>
   {always}
   <SwipeConfirm label={card.depositLabel?t('Проведите: {v}',{v:low(t('Подтвердить {v}',{v:low(card.depositLabel)}))}):t('Проведите, чтобы принять')} disabled={busy} onConfirm={()=>decide(action)}/>
   <Pressable accessibilityRole="button" accessibilityLabel={t('Отклонить заявку')} disabled={busy} onPress={()=>card.requiresReason?request.onReview():decide('reject')} style={({pressed})=>[r.askReject,(pressed||busy)&&r.dim]}><Text style={r.askRejectText}>{t('Отклонить')}</Text></Pressable>
   {open&&details}
   {more&&<><RecordActions soft busy={busy} actions={[{title:t('Рассмотреть подробно'),kind:'side',onPress:request.onReview},...others]}/>{extra}</>}
  </View>;
 }
 // The guest waits for the owner's answer, as a rider waits for a taxi (concept, Mobbin: Uber, Bolt): the big timer on top,
 // the place in one row marked «Ждём», then two buttons, «Написать» and «Отменить». The rest is under «Ещё».
 if(kind==='booking'&&item.status==='requested'&&item.guest_id===userId&&clock>0&&Number(item.expires_at)>clock&&(!compact||unfolded)){
  const chat=all.find(a=>a.title===t('Открыть чат')),cancel=all.find(a=>a.kind==='danger'),others=rest.filter(a=>a&&a!==chat&&a!==cancel);
  const photos=pics;
  const button=(a:RecordAction|undefined,title:string,style:object,text:object)=>a?<Pressable accessibilityRole="button" accessibilityLabel={a.title} disabled={busy} onPress={a.onPress} style={({pressed})=>[r.waitButton,style,(pressed||busy)&&r.dim]}><Text style={[r.actionText,text]}>{title}</Text></Pressable>:null;
  return <View style={r.card}>
   <View style={r.dealTop}><View style={r.grow}><AnswerWait item={item} bare/></View>{dots(more,others.length>0||!!extra)}</View>
   <Pressable accessibilityRole="button" accessibilityState={{expanded:open}} accessibilityHint={t('Открыть подробности')} onPress={flip} style={({pressed})=>[r.waitPlace,pressed&&r.pressed]}>{!!photos[0]&&<View style={r.waitThumb}><Photo id={photos[0]} alt={t('{title}, фото',{title:item.title})} fill/></View>}<View style={r.grow}><Text numberOfLines={1} style={r.dealTitle}>{item.title}</Text><Text numberOfLines={2} style={r.rowWhen}>{recordSpan(item.start,item.end)} · {money(item.amount)}</Text></View><View style={r.state}><View style={[r.dot,{backgroundColor:C.gold}]}/><Text style={r.stateText}>{t('Ждём')}</Text></View></Pressable>
   {always}
   <View style={r.waitButtons}>{button(chat,t('Написать'),r.waitChat,r.waitChatText)}{button(cancel,t('Отменить'),r.waitCancel,r.waitCancelText)}</View>
   {open&&details}
   {more&&<><RecordActions soft busy={busy} actions={others}/>{extra}</>}
  </View>;
 }
 const fold=compact?()=>{smooth();setUnfolded(false);setOpen(false);setMore(false);}:undefined;
 // An unfolded row of «Мои брони» shows its facts at once; its head folds it back. A card on its own opens them by a tap.
 const shown=open||!!fold,halves=kind==='booking'&&!hallLine(item)&&!!item.end;
 return <View style={r.card}>
  <View style={r.dealTop}><View style={[r.tags,r.grow]}><View style={r.state}><View style={[r.dot,{backgroundColor:ink}]}/><Text style={r.stateText}>{status.label}</Text></View>{!!item.demo_owner&&<Text style={r.tag}>{kind==='job'?t('Учебное'):t('Учебная')}</Text>}{kind==='job'&&!!item.regular&&<Text style={r.tag}>{t('Постоянный исполнитель')}</Text>}</View>{dots(more,hasMore)}</View>
  <Pressable accessibilityRole="button" accessibilityLabel={fold?t('Свернуть: {title}',{title:item.title}):item.title} accessibilityHint={fold?undefined:t('Открыть подробности')} accessibilityState={{expanded:shown}} onPress={fold||flip} style={({pressed})=>[r.dealHead,pressed&&r.pressed]}>
   {kind==='booking'&&!!pics[0]&&<View style={r.waitThumb}><Photo id={pics[0]} alt={t('{title}, фото',{title:item.title})} fill/></View>}
   <View style={r.grow}><Text accessibilityRole="header" numberOfLines={2} style={r.dealTitle}>{item.title}</Text>
   <Text style={r.when}>{halves?money(item.amount):recordSpan(item.start,item.end)+' · '+money(kind==='job'?item.fee:item.amount)}</Text></View>
   <Text style={[r.chevron,shown&&r.chevronUp]}>⌄</Text>
  </Pressable>
  {halves&&<View style={r.halves}><View style={r.half}><Text style={r.halfKey}>{t('Заезд')}</Text><Text style={r.halfValue}>{recordSpan(item.start)}</Text></View><View style={[r.half,r.halfLine]}><Text style={r.halfKey}>{t('Выезд')}</Text><Text style={r.halfValue}>{recordSpan(item.end)}</Text></View></View>}
  {!(flow.stopped&&kind==='booking')&&!done&&<Text style={r.dealLine}>{line}</Text>}
  {kind==='booking'&&item.status==='requested'&&item.guest_id===userId&&<AnswerWait item={item}/>}
  {always}
  {!!main&&<RecordActions busy={busy} actions={[main]}/>}
  {shown&&kind==='job'&&<Text style={[r.sumNote,!!item.payment_received_at&&{color:C.success}]}>{money(item.fee)} {jobPayNote(item)}</Text>}
  {shown&&details}
  {more&&<><RecordActions soft busy={busy} actions={rest}/>{extra}</>}
 </View>;
}
const R=T.radius,H=T.control;
const r=StyleSheet.create({
 card:{gap:12,marginTop:12,padding:16,borderRadius:R.xl,borderWidth:1,borderColor:C.glassLine,backgroundColor:C.glassStrong},
 head:{gap:8},tags:{flexDirection:'row',flexWrap:'wrap',gap:8},status:{...type.caption,fontWeight:'500',paddingHorizontal:8,paddingVertical:4,borderRadius:R.sm,overflow:'hidden'},
 title:{...type.title,color:C.ink,fontWeight:'700',letterSpacing:-.3},when:{...type.label,color:C.inkSoft},where:{...type.label,color:C.muted},
 sum:{flexDirection:'row',flexWrap:'wrap',alignItems:'baseline',columnGap:12,rowGap:4,marginTop:4},amount:{...type.heading,color:C.ink,fontWeight:'700',letterSpacing:-.5},sumNote:{...type.caption,color:C.muted},
 journey:{gap:8,paddingVertical:12,paddingHorizontal:16,borderWidth:1,borderColor:C.line,borderRadius:R.lg,backgroundColor:C.surface},journeyStopped:{backgroundColor:C.surfaceAlt,borderWidth:0},
 journeyNow:{flexDirection:'row',flexWrap:'wrap',alignItems:'baseline',justifyContent:'space-between',columnGap:12},journeyStep:{...type.body,color:C.ink,fontWeight:'600'},journeyCount:{...type.caption,color:C.muted},
 bar:{flexDirection:'row',gap:4},segment:{flex:1,height:4,borderRadius:R.xs,backgroundColor:C.line},hint:{...type.caption,color:C.muted},actionNote:{...type.caption,color:C.muted,textAlign:'center'},
 facts:{borderWidth:1,borderColor:C.line,borderRadius:R.lg,backgroundColor:C.surface,overflow:'hidden'},fact:{flexDirection:'row',gap:12,paddingVertical:12,paddingHorizontal:16},factLine:{borderTopWidth:1,borderTopColor:C.line},factPrivate:{backgroundColor:C.surfaceAlt},
 factLabel:{...type.label,color:C.muted,width:96},factValue:{...type.label,color:C.ink,flex:1},
 actions:{gap:8},sideRow:{flexDirection:'row',flexWrap:'wrap',gap:8},action:{minHeight:H.touch,borderRadius:R.md,paddingVertical:8,paddingHorizontal:16,alignItems:'center',justifyContent:'center'},actionText:{...type.label,fontWeight:'600',textAlign:'center'},
 main:{minHeight:H.primary,backgroundColor:C.accent},mainText:{...type.body,fontWeight:'600',color:C.onAccent},next:{backgroundColor:C.accentSoft},nextText:{color:C.accentPressed},
 // Up to three in a row; more wrap to the next row instead of squeezing their words.
 side:{flexGrow:1,flexBasis:'30%',paddingHorizontal:8,backgroundColor:C.surface,borderWidth:1,borderColor:C.line},sideText:{color:C.ink},danger:{backgroundColor:'transparent'},dangerText:{color:C.danger,fontWeight:'500'},
 focus:{borderWidth:2,borderColor:C.focus},dim:{opacity:.55},grow:{flex:1,minWidth:0},
 dealTop:{flexDirection:'row',alignItems:'center',gap:8},dealHead:{flexDirection:'row',alignItems:'center',gap:12},
 halves:{flexDirection:'row',borderWidth:1,borderColor:C.line,borderRadius:R.lg,backgroundColor:C.surface},half:{flex:1,minWidth:0,gap:2,paddingVertical:8,paddingHorizontal:12},halfLine:{borderLeftWidth:1,borderLeftColor:C.line},halfKey:{...type.caption,color:C.muted},halfValue:{...type.label,color:C.ink,fontWeight:'600'},
 list:{borderTopWidth:1,borderTopColor:C.line},listRow:{flexDirection:'row',alignItems:'center',gap:8,minHeight:H.touch+4,borderBottomWidth:1,borderBottomColor:C.line},listText:{...type.body,flex:1,color:C.ink},listGo:{...type.body,color:C.muted},
 state:{flexDirection:'row',alignItems:'center',gap:8},stateText:{...type.caption,fontWeight:'600',color:C.inkSoft},tag:{...type.caption,fontWeight:'500',color:C.muted,backgroundColor:C.surfaceAlt,paddingHorizontal:8,paddingVertical:2,borderRadius:R.sm,overflow:'hidden'},
 dots:{minWidth:H.touch,minHeight:32,marginRight:-8,alignItems:'center',justifyContent:'center'},dotsText:{...type.label,color:C.ink,fontWeight:'800',letterSpacing:1},
 row:{gap:4,marginTop:8,paddingVertical:12},rowTop:{flexDirection:'row',alignItems:'center',gap:8},rowHead:{flexDirection:'row',alignItems:'flex-start',gap:8},rowSum:{...type.label,color:C.ink,fontWeight:'700'},rowWhen:{...type.label,color:C.inkSoft},
 rowStatus:{...type.caption,fontWeight:'600',color:C.inkSoft},rowDo:{color:C.accentPressed},rowDemo:{color:C.muted,fontWeight:'600'},dot:{width:8,height:8,borderRadius:R.full},
 chevron:{...type.label,color:C.muted,lineHeight:16},chevronUp:{transform:[{rotate:'180deg'}]},pressed:{opacity:.7},dealTitle:{...type.body,color:C.ink,fontWeight:'700'},dealLine:{...type.label,color:C.inkSoft},
 whereRow:{flexDirection:'row',alignItems:'center',gap:8},whereText:{flex:1,minWidth:0},
 wait:{gap:4,padding:16,borderRadius:R.lg,backgroundColor:C.surface,borderWidth:1,borderColor:C.line},waitLabel:{...type.label,color:C.muted},waitDigits:{...type.display,color:C.ink,fontWeight:'800',letterSpacing:-1,fontVariant:['tabular-nums']},
 waitBar:{height:6,borderRadius:R.full,backgroundColor:C.surfaceAlt,overflow:'hidden',marginTop:4},waitFill:{height:'100%',borderRadius:R.full,backgroundColor:C.accent},waitNote:{...type.caption,color:C.muted,marginTop:4},
 waitLinks:{flexDirection:'row',justifyContent:'center',gap:24},waitLink:{minHeight:H.touch,justifyContent:'center',paddingHorizontal:8},waitLinkText:{...type.label,color:C.accentPressed,fontWeight:'600'},
 waitBare:{padding:0,borderWidth:0,backgroundColor:'transparent'},
 waitPlace:{flexDirection:'row',alignItems:'center',gap:12,padding:12,borderRadius:R.lg,backgroundColor:C.surfaceAlt},waitThumb:{width:56,height:56,borderRadius:R.md,overflow:'hidden',backgroundColor:C.surface},
 askHead:{flexDirection:'row',alignItems:'center',gap:12},askCaption:{...type.caption,color:C.muted},askWho:{...type.title,color:C.ink,fontWeight:'800'},
 ring:{width:88,height:88,alignItems:'center',justifyContent:'center'},ringArc:{position:'absolute',top:0,left:0,width:88,height:88,borderRadius:999,borderWidth:6,transform:[{rotate:'45deg'}]},ringText:{...type.body,fontWeight:'800',color:C.ink,fontVariant:['tabular-nums']},
 askRow:{gap:2,paddingVertical:8,borderBottomWidth:1,borderBottomColor:C.line},askLast:{flexDirection:'row',alignItems:'center',borderBottomWidth:0},askKey:{...type.caption,color:C.muted},askValue:{...type.body,color:C.ink,fontWeight:'600'},askSum:{...type.title,color:C.ink,fontWeight:'800'},
 askMoney:{gap:8,paddingVertical:12},askLine:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},askTotal:{paddingTop:8,borderTopWidth:1,borderTopColor:C.line},askTotalKey:{...type.body,color:C.ink,fontWeight:'700'},askTagAlone:{alignSelf:'flex-start'},payBox:{borderWidth:1,borderColor:C.line,borderRadius:T.radius.lg,paddingHorizontal:12},payRow:{flexDirection:'row',alignItems:'center',gap:12,minHeight:56,paddingVertical:8},payMark:{width:40,height:28,borderRadius:T.radius.sm,alignItems:'center',justifyContent:'center'},payKaspi:{backgroundColor:C.danger},payMarkText:{...type.label,color:C.onAccent,fontWeight:'800'},payTitle:{...type.body,color:C.ink,fontWeight:'600'},payNote:{...type.caption,color:C.muted},payWarn:{color:C.warning},payEdit:{...type.label,color:C.accent,fontWeight:'600'},
 askTag:{...type.caption,fontWeight:'700',color:C.success,backgroundColor:C.successSoft,paddingHorizontal:8,paddingVertical:4,borderRadius:R.sm,overflow:'hidden'},askTagRisk:{color:C.warning,backgroundColor:C.warningSoft},
 askReject:{minHeight:H.touch,alignItems:'center',justifyContent:'center'},askRejectText:{...type.label,color:C.inkSoft,fontWeight:'600'},
 waitTag:{...type.caption,fontWeight:'700',color:C.warning,backgroundColor:C.warningSoft,paddingHorizontal:8,paddingVertical:4,borderRadius:R.sm,overflow:'hidden'},
 waitButtons:{flexDirection:'row',gap:8},waitButton:{flex:1,minHeight:H.primary,borderRadius:R.md,alignItems:'center',justifyContent:'center'},
 waitChat:{backgroundColor:C.accentSoft},waitChatText:{...type.body,color:C.accentPressed},waitCancel:{backgroundColor:C.surfaceAlt},waitCancelText:{...type.body,color:C.inkSoft},
 mapLink:{flexDirection:'row',alignItems:'center',gap:4,minHeight:32,paddingHorizontal:12,borderRadius:R.full,backgroundColor:C.accentSoft},mapLinkText:{...type.caption,fontWeight:'600',color:C.accentPressed},
 mapPin:{width:12,height:12,borderRadius:R.full,borderBottomRightRadius:0,backgroundColor:C.accentPressed,transform:[{rotate:'45deg'}],alignItems:'center',justifyContent:'center'},mapPinDot:{width:4,height:4,borderRadius:R.full,backgroundColor:C.accentSoft},
});
export const recordStyles=r;
