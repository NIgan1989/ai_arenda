import {dateText,t as tr} from '../../lib/i18n';
import React,{useState,type ReactNode} from 'react';
import {Pressable,StyleSheet,Text,View} from 'react-native';
import type {Approval} from '../../lib/approvals';
import {calendarEntries,dayLine,dayStart,type CalendarEntry} from '../../lib/calendar-days';
import {HUB_TABS,hubLate,hubLine,hubToday,type HubTab} from '../../lib/property-hub';
import {isHome} from '../../lib/home-cleaning';
import {request} from './api';
import {money,uid,type Row} from './model';
import {PriceTipBody} from './PriceTip';
import {RentalCalendar} from './RentalCalendar';
import {FlatAutopilotRow} from './FlatAutopilot';
import {Action,Chips,h} from './SheetParts';
import {REPEAT_DAYS,REPEAT_AHEAD,nextRepeat,repeatLabel} from '../../lib/home-repeat-text';
import {C,type} from './styles';
import {DealLine} from './DealLine';
import {ownerDeal,ownerPinAct} from './pin-deal';
import {ownerThreads} from '../../lib/process-threads';
import {T} from './tokens';
import {RightDocs} from './RightDocs';

const words=(t:number)=>dateText(t*1000,{timeZone:'Asia/Almaty',day:'numeric',month:'long'});

type Props={
 flat:Row;data:Row;now:number;tab:HubTab;onTab:(tab:HubTab)=>void;
 /** A booking or a cleaning of this flat, opened in its card. */
 onOpen:(kind:'booking'|'job',id:string)=>void;
 /** The editor of the flat on one of its steps; 'settings' is rules and readiness, 'job' a new cleaning. */
 onEdit:(step:string|null)=>void;
 onBack:()=>void;onChanged:()=>Promise<unknown>;
};

// The head of the owner's flat in the sheet of the map: its name, the most pressing thing about it and the four tabs.
// It stays visible while the sheet is folded; a tap on a tab unfolds the sheet on that tab.
export function FlatHubHead({flat,data,now,tab,open,onTab,onBack,onOpen}:Pick<Props,'flat'|'data'|'now'|'tab'|'onTab'|'onBack'|'onOpen'>&{open:boolean}){
 const entries=calendarEntries(data,'owner',flat.id,now),waiting=hubToday(entries,now).waiting.length,late=hubLate(entries,now);
 // The step that waits for the owner at this place is the button of the head, the same words as the tag on its pin.
 const act=ownerPinAct(ownerThreads(data,now),data,flat.id,now),deal=ownerDeal(data,flat.id,now);
 return <View style={f.head}>
  <Pressable accessibilityRole="button" accessibilityLabel={tr('Назад к карте')} onPress={onBack} style={f.back}><Text style={f.backText}>{tr('‹ Назад')}</Text></Pressable>
  <Text accessibilityRole="header" numberOfLines={2} style={h.cardTitle}>{flat.title}</Text>
  {late?<Pressable accessibilityRole="button" accessibilityLabel={tr('{status}, открыть',{status:late.status})} onPress={()=>onOpen(late.kind,late.id)} hitSlop={8}><Text numberOfLines={1} style={[h.note,f.late]}>{late.status} ›</Text></Pressable>:<Text numberOfLines={1} style={h.note}>{hubLine(entries,now)}</Text>}
  {!!act?.why&&<Text numberOfLines={2} style={[h.note,act.urgent&&f.late]}>{act.why}</Text>}
  {!!act&&<Action title={act.label} onPress={()=>onOpen(act.kind,act.id)}/>}
  {!!deal&&<DealLine deal={deal} now={now} onOpen={onOpen} history={open}/>}
  {/* A private home that is only cleaned has nothing to rent: no calendar, price or listing, so no tabs. */}
  {!isHome(flat.details?.type)&&<View accessibilityRole="tablist" style={f.tabs}>{HUB_TABS.map(([id,label])=><Pressable key={id} accessibilityRole="tab" accessibilityState={{selected:open&&tab===id}} accessibilityLabel={id==='today'&&waiting?tr('{label}, ждут ответа: {n}',{label,n:waiting}):label} onPress={()=>onTab(id)} style={[f.tab,open&&tab===id&&f.tabOn]}>
   <Text numberOfLines={1} style={[f.tabText,open&&tab===id&&f.tabTextOn]}>{label}</Text>{id==='today'&&waiting>0&&<View style={f.count}><Text style={f.countText}>{waiting}</Text></View>}
  </Pressable>)}</View>}
 </View>;
}

// What is under the tabs: everything about one flat that used to live on «Мои объекты», «Календарь» and «Управление».
// «Повторять уборку» of a private home (lib/home-repeat.ts): one choice, and the next order comes by itself three days
// ahead with the terms, the price and the hour of the last one.
function HomeRepeat({flat,data,now,onChanged}:Pick<Props,'flat'|'data'|'now'|'onChanged'>){
 const [busy,setBusy]=useState(false),[said,setSaid]=useState<{text:string;error:boolean}|null>(null);
 const every=Number(flat.details?.repeat?.every)||0,jobs=((data.jobs||[]) as Row[]).filter(j=>j.property_id===flat.id&&j.booking_id===null).sort((a,b)=>b.start-a.start),last=jobs[0];
 const ahead=last&&last.start>now&&last.status!=='cancelled',next=every&&last?(ahead?last.start:nextRepeat(last.start,every,now)):0;
 const at=(t:number)=>dateText(t*1000,{timeZone:'Asia/Almaty',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'});
 async function save(value:number){
  if(busy||value===every)return;setBusy(true);setSaid(null);
  try{const v=await request('/api/operations/home-repeat',{propertyId:flat.id,every:value},undefined,undefined,'owner');setSaid({text:v.message||tr('Сохранено.'),error:false});await onChanged();}
  catch(error){setSaid({text:error instanceof Error?error.message:tr('Не получилось. Обновите экран.'),error:true});}
  finally{setBusy(false);}
 }
 return <View style={f.repeat}>
  <Chips<number> label={tr('Повторять уборку')} value={every} disabled={busy} onChange={save} options={[[0,tr('Не повторять')],...REPEAT_DAYS.map(d=>[d,repeatLabel(d)] as [number,string])]}/>
  {said?<Text accessibilityRole={said.error?'alert':undefined} style={[h.note,said.error&&{color:T.color.danger}]}>{said.text}</Text>
   :<Text style={h.note}>{!every?(last?tr('ИИ-администратор сам закажет следующую уборку: те же условия, цена и время.'):tr('Сначала закажите первую уборку: повтор возьмёт её условия.')):ahead?tr('Следующая уборка {v} уже заказана.',{v:at(next)}):tr(next-now>REPEAT_AHEAD?'Следующая уборка {when}. Заказ появится сам за три дня.':'Следующая уборка {when}. Заказ появится в течение часа.',{when:at(next)})}</Text>}
 </View>;
}
export function FlatHub({flat,data,now,tab,onOpen,onEdit,onChanged}:Omit<Props,'onTab'|'onBack'>){
 const today=dayStart(now),view=hubToday(calendarEntries(data,'owner',flat.id,now),now),policy=flat.policy||{};
 const [busy,setBusy]=useState(false),[said,setSaid]=useState<{text:string;error:boolean}|null>(null);
 const card=((data.approvals||[]) as Approval[]).find(c=>c.canDecide&&(c.kind==='price'&&c.price?.propertyId===flat.id||c.kind==='window'&&c.window?.propertyId===flat.id));
 async function decide(action:string){
  if(!card||busy)return;setBusy(true);setSaid(null);
  try{const v=await request('/api/approvals',{id:card.id,revision:card.revision,action},undefined,uid()+':'+card.kind+':'+action,'owner');setSaid({text:v.message||tr('Готово.'),error:false});await onChanged();}
  catch(error){setSaid({text:error instanceof Error?error.message:tr('Не получилось. Обновите экран.'),error:true});}
  finally{setBusy(false);}
 }
 const entry=(e:CalendarEntry,line:string)=><Pressable key={e.key} accessibilityRole="button" onPress={()=>onOpen(e.kind,e.id)} style={f.row}>
  <View style={h.grow}><Text numberOfLines={1} style={h.eventTitle}>{line}</Text><Text numberOfLines={2} style={h.note}>{e.kind==='job'?tr('Уборка · {what}',{what:e.status}):e.status}</Text></View><Text style={f.arrow}>›</Text>
 </Pressable>;
 const row=(title:string,note:string,onPress:()=>void):ReactNode=><Pressable key={title} accessibilityRole="button" onPress={onPress} style={f.row}>
  <View style={h.grow}><Text numberOfLines={1} style={h.eventTitle}>{title}</Text><Text numberOfLines={2} style={h.note}>{note}</Text></View><Text style={f.arrow}>›</Text>
 </Pressable>;
 const home=isHome(flat.details?.type);
 if(home||tab==='today')return <View style={f.panel}>
  {view.waiting.length>0&&<><Text accessibilityRole="header" style={f.heading}>{tr('Ждут ответа')}</Text>{view.waiting.map(e=>entry(e,e.kind==='job'?tr('Уборка {when}',{when:words(e.start)}):tr('Заезд {when}',{when:words(e.start)})))}</>}
  <Text accessibilityRole="header" style={f.heading}>{tr('Сегодня')}</Text>
  {view.today.length>0?view.today.map(e=>entry(e,dayLine(e,today))):<Text style={h.note}>{home?tr('Сегодня уборок нет.'):tr('Сегодня ничего не запланировано.')}</Text>}
  {view.next.length>0&&<><Text accessibilityRole="header" style={f.heading}>{tr('Дальше')}</Text>{view.next.map(e=>entry(e,words(e.start)+' · '+dayLine(e,dayStart(e.start))))}</>}
  {home?<><Action title={tr('Заказать уборку')} onPress={()=>onEdit('job')}/><Text style={h.note}>{[flat.address,tr('адрес видит только назначенный исполнитель')].filter(Boolean).join(' · ')}</Text><HomeRepeat flat={flat} data={data} now={now} onChanged={onChanged}/>{row(tr('Постоянный исполнитель'),flat.regular_cleaner_name||tr('Закрепите своего: заказы приходят сначала к нему'),()=>onEdit('cleaner'))}</>
  :!Number(flat.own_staff)&&<Action secondary title={tr('Создать уборку')} onPress={()=>onEdit('job')}/>}
 </View>;
 if(tab==='calendar')return <View style={f.panel}>
  <RentalCalendar data={data} role="owner" busy={false} onOpen={(kind,id)=>onOpen(kind as 'booking'|'job',id)} propertyId={flat.id} onChanged={onChanged}/>
  {row(tr('Календари площадок'),tr('Airbnb, Booking, Суточно: без двойных броней'),()=>onEdit('calendars'))}
 </View>;
 if(tab==='price'){
  const facts:[string,string][]=[[tr('За сутки'),money(Number(flat.price)||0)],...(Number(policy.nightly_price)?[[tr('За ночь'),money(Number(policy.nightly_price))] as [string,string]]:[]),[tr('За час'),Number(policy.hourly_price)?tr('{v} · от {v2} ч',{v:money(Number(policy.hourly_price)),v2:(Number(policy.min_hours)||2)}):tr('не сдаётся по часам')],[tr('Депозит'),Number(policy.deposit)?money(Number(policy.deposit)):tr('не требуется')]];
  return <View style={f.panel}>
   <View style={f.facts}>{facts.map(([label,value],i)=><View key={label} style={[f.fact,i>0&&f.factLine]}><Text style={h.note}>{label}</Text><Text style={f.factValue}>{value}</Text></View>)}</View>
   {!!said&&<Text accessibilityLiveRegion="polite" style={said.error?h.error:h.note}>{said.text}</Text>}
   {!!card&&<View style={f.advice}><Text accessibilityRole="header" style={f.adviceTitle}>{card.kind==='window'?tr('Окно в календаре'):tr('Совет ИИ-администратора')}</Text><PriceTipBody card={card} busy={busy} onDecide={decide}/></View>}
   <Action secondary title={tr('Изменить цены')} onPress={()=>onEdit('prices')}/>
  </View>;
 }
 return <View style={f.panel}>
  <FlatAutopilotRow propertyId={flat.id} onChanged={onChanged}/>
  {row(tr('Объявление'),tr('Фото, описание, удобства, заезд'),()=>onEdit(null))}
  {row(tr('Правила и готовность'),tr('Автоподтверждение, депозит, готовность к заселению'),()=>onEdit('settings'))}
  {!flat.demo_owner&&<RightDocs propertyId={flat.id} approved={!!flat.approved}/>}
  {!Number(flat.own_staff)&&row(tr('Постоянный исполнитель'),flat.regular_cleaner_name||tr('Закрепите своего: уборки приходят сначала к нему'),()=>onEdit('cleaner'))}
 </View>;
}

const R=T.radius,H=T.control;
const f=StyleSheet.create({
 repeat:{gap:8,marginTop:8},
 late:{color:T.color.danger,fontWeight:'600'},
 head:{gap:4},back:{minHeight:H.touch,justifyContent:'center',alignSelf:'flex-start',paddingRight:16},backText:{...type.label,color:C.inkSoft,fontWeight:'500'},
 tabs:{flexDirection:'row',gap:4,padding:4,marginTop:8,borderRadius:R.lg,backgroundColor:C.surfaceAlt},
 // The tabs share the row by the length of their words, so «Сегодня» keeps its counter without being cut.
 tab:{flexGrow:1,flexShrink:1,minHeight:H.touch,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:4,borderRadius:R.md,paddingHorizontal:8},tabOn:{backgroundColor:C.surface},
 tabText:{...type.label,color:C.inkSoft,fontWeight:'500'},tabTextOn:{color:C.accent,fontWeight:'600'},
 count:{minWidth:16,height:16,borderRadius:R.full,paddingHorizontal:4,backgroundColor:C.danger,alignItems:'center',justifyContent:'center'},countText:{...type.caption,color:C.onAccent,fontWeight:'700'},
 panel:{gap:8},heading:{...type.label,color:C.muted,fontWeight:'600',marginTop:4},
 row:{flexDirection:'row',alignItems:'center',gap:12,minHeight:H.field,paddingVertical:8,paddingHorizontal:12,borderRadius:R.lg,backgroundColor:C.surfaceAlt},arrow:{...type.title,color:C.muted},
 facts:{borderWidth:1,borderColor:C.line,borderRadius:R.lg,backgroundColor:C.surface},fact:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12,paddingVertical:12,paddingHorizontal:16},factLine:{borderTopWidth:1,borderTopColor:C.line},factValue:{...type.label,color:C.ink,fontWeight:'600',textAlign:'right',flexShrink:1},
 advice:{gap:8,padding:16,borderWidth:1,borderColor:C.accentLine,borderRadius:R.lg,backgroundColor:C.accentSoft},adviceTitle:{...type.label,color:C.accent,fontWeight:'600'},
});
