import React,{useState,type ReactNode} from 'react';
import {Pressable,StyleSheet,Text,View} from 'react-native';
import type {Approval} from '../../lib/approvals';
import {calendarEntries,dayLine,dayStart,type CalendarEntry} from '../../lib/calendar-days';
import {HUB_TABS,hubLine,hubToday,type HubTab} from '../../lib/property-hub';
import {request} from './api';
import {money,uid,type Row} from './model';
import {PriceTipBody} from './PriceTip';
import {RentalCalendar} from './RentalCalendar';
import {Action,h} from './SheetParts';
import {C,type} from './styles';
import {T} from './tokens';

const words=(t:number)=>new Date(t*1000).toLocaleDateString('ru-RU',{timeZone:'Asia/Almaty',day:'numeric',month:'long'});

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
export function FlatHubHead({flat,data,now,tab,open,onTab,onBack}:Pick<Props,'flat'|'data'|'now'|'tab'|'onTab'|'onBack'>&{open:boolean}){
 const entries=calendarEntries(data,'owner',flat.id,now),waiting=hubToday(entries,now).waiting.length;
 return <View style={f.head}>
  <Pressable accessibilityRole="button" accessibilityLabel="Назад к карте" onPress={onBack} style={f.back}><Text style={f.backText}>‹ Назад</Text></Pressable>
  <Text accessibilityRole="header" numberOfLines={2} style={h.cardTitle}>{flat.title}</Text>
  <Text numberOfLines={1} style={h.note}>{hubLine(entries,now)}</Text>
  <View accessibilityRole="tablist" style={f.tabs}>{HUB_TABS.map(([id,label])=><Pressable key={id} accessibilityRole="tab" accessibilityState={{selected:open&&tab===id}} accessibilityLabel={label+(id==='today'&&waiting?', ждут ответа: '+waiting:'')} onPress={()=>onTab(id)} style={[f.tab,open&&tab===id&&f.tabOn]}>
   <Text numberOfLines={1} style={[f.tabText,open&&tab===id&&f.tabTextOn]}>{label}</Text>{id==='today'&&waiting>0&&<View style={f.count}><Text style={f.countText}>{waiting}</Text></View>}
  </Pressable>)}</View>
 </View>;
}

// What is under the tabs: everything about one flat that used to live on «Мои объекты», «Календарь» and «Управление».
export function FlatHub({flat,data,now,tab,onOpen,onEdit,onChanged}:Omit<Props,'onTab'|'onBack'>){
 const today=dayStart(now),view=hubToday(calendarEntries(data,'owner',flat.id,now),now),policy=flat.policy||{};
 const [busy,setBusy]=useState(false),[said,setSaid]=useState<{text:string;error:boolean}|null>(null);
 const card=((data.approvals||[]) as Approval[]).find(c=>c.canDecide&&(c.kind==='price'&&c.price?.propertyId===flat.id||c.kind==='window'&&c.window?.propertyId===flat.id));
 async function decide(action:string){
  if(!card||busy)return;setBusy(true);setSaid(null);
  try{const v=await request('/api/approvals',{id:card.id,revision:card.revision,action},undefined,uid()+':'+card.kind+':'+action,'owner');setSaid({text:v.message||'Готово.',error:false});await onChanged();}
  catch(error){setSaid({text:error instanceof Error?error.message:'Не получилось. Обновите экран.',error:true});}
  finally{setBusy(false);}
 }
 const entry=(e:CalendarEntry,line:string)=><Pressable key={e.key} accessibilityRole="button" onPress={()=>onOpen(e.kind,e.id)} style={f.row}>
  <View style={h.grow}><Text numberOfLines={1} style={h.eventTitle}>{line}</Text><Text numberOfLines={2} style={h.note}>{e.kind==='job'?'Уборка · ':''}{e.status}</Text></View><Text style={f.arrow}>›</Text>
 </Pressable>;
 const row=(title:string,note:string,onPress:()=>void):ReactNode=><Pressable key={title} accessibilityRole="button" onPress={onPress} style={f.row}>
  <View style={h.grow}><Text numberOfLines={1} style={h.eventTitle}>{title}</Text><Text numberOfLines={2} style={h.note}>{note}</Text></View><Text style={f.arrow}>›</Text>
 </Pressable>;
 if(tab==='today')return <View style={f.panel}>
  {view.waiting.length>0&&<><Text accessibilityRole="header" style={f.heading}>Ждут ответа</Text>{view.waiting.map(e=>entry(e,'Заезд '+words(e.start)))}</>}
  <Text accessibilityRole="header" style={f.heading}>Сегодня</Text>
  {view.today.length>0?view.today.map(e=>entry(e,dayLine(e,today))):<Text style={h.note}>Сегодня ничего не запланировано.</Text>}
  {view.next.length>0&&<><Text accessibilityRole="header" style={f.heading}>Дальше</Text>{view.next.map(e=>entry(e,words(e.start)+' · '+dayLine(e,dayStart(e.start))))}</>}
  {!Number(flat.own_staff)&&<Action secondary title="Создать уборку" onPress={()=>onEdit('job')}/>}
 </View>;
 if(tab==='calendar')return <View style={f.panel}>
  <RentalCalendar data={data} role="owner" busy={false} onOpen={(kind,id)=>onOpen(kind as 'booking'|'job',id)} propertyId={flat.id}/>
  {row('Календари площадок','Airbnb, Booking, Суточно: без двойных броней',()=>onEdit('calendars'))}
 </View>;
 if(tab==='price'){
  const facts:[string,string][]=[['За сутки',money(Number(flat.price)||0)],...(Number(policy.nightly_price)?[['За ночь',money(Number(policy.nightly_price))] as [string,string]]:[]),['За час',Number(policy.hourly_price)?money(Number(policy.hourly_price))+' · от '+(Number(policy.min_hours)||2)+' ч':'не сдаётся по часам'],['Депозит',Number(policy.deposit)?money(Number(policy.deposit)):'не требуется']];
  return <View style={f.panel}>
   <View style={f.facts}>{facts.map(([label,value],i)=><View key={label} style={[f.fact,i>0&&f.factLine]}><Text style={h.note}>{label}</Text><Text style={f.factValue}>{value}</Text></View>)}</View>
   {!!said&&<Text accessibilityLiveRegion="polite" style={said.error?h.error:h.note}>{said.text}</Text>}
   {!!card&&<View style={f.advice}><Text accessibilityRole="header" style={f.adviceTitle}>{card.kind==='window'?'Окно в календаре':'Совет AI администратора'}</Text><PriceTipBody card={card} busy={busy} onDecide={decide}/></View>}
   <Action secondary title="Изменить цены" onPress={()=>onEdit('prices')}/>
  </View>;
 }
 return <View style={f.panel}>
  {row('Объявление','Фото, описание, удобства, заезд',()=>onEdit(null))}
  {row('Правила и готовность','Автоподтверждение, депозит, готовность к заселению',()=>onEdit('settings'))}
  {!Number(flat.own_staff)&&row('Постоянный исполнитель',flat.regular_cleaner_name||'Закрепите своего: уборки приходят сначала к нему',()=>onEdit('cleaner'))}
 </View>;
}

const R=T.radius,H=T.control;
const f=StyleSheet.create({
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
