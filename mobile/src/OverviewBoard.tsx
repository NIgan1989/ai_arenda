import {L,t as tr} from '../../lib/i18n';
import React,{useState,type ReactNode} from 'react';
import {View,Text,Pressable,StyleSheet,LayoutAnimation} from 'react-native';
import {C,type} from './styles';
import {T} from './tokens';
import {ListTabs} from './ListTabs';
import {BrandEmpty} from './BrandMoments';
import {ApprovalCard} from './ApprovalCard';
import {boardTabs,overviewBoard,type BoardItem,type BoardTab} from '../../lib/overview-board';
import {historyRows,HISTORY_DAYS,type HistoryMessage} from '../../lib/conversation-history';
import type {Approval} from '../../lib/approvals';
type Row=Record<string,any>;
const R=T.radius;
const smooth=()=>LayoutAnimation.configureNext(LayoutAnimation.create(200,LayoutAnimation.Types.easeInEaseOut,LayoutAnimation.Properties.opacity));

const EMPTY:Record<BoardTab,string>=L({
 decide:'Сейчас ничего не ждёт вашего решения. ИИ-администратор скажет, когда понадобитесь.',
 now:'Сейчас ничего не идёт.',
 soon:'Впереди пока ничего не запланировано.'
});

// «Сводка» (lib/overview-board.ts): tabs with their counts, one line per thing. A line of an event opens its deal;
// a line of an approval opens the approval card in place, where it is answered.
export function OverviewBoard({workspace,approvals,data,now,busy,onDecide,onOpen}:{workspace:Row|null|undefined;approvals:Row[];data:Row;now:number;busy:boolean;onDecide:(body:Row)=>void;onOpen:(kind:'booking'|'job',id:string)=>void}){
 const board=overviewBoard(workspace,approvals,data,now);
 const counts={decide:board.decide.length,now:board.now.length,soon:board.soon.length};
 const [picked,setPicked]=useState<BoardTab|null>(null),[open,setOpen]=useState('');
 const tab:BoardTab=picked||(boardTabs.find(t=>counts[t.id]>0)?.id??'decide');
 return <View style={b.wrap}>
  <ListTabs tabs={boardTabs} value={tab} counts={counts} label={tr('Сводка')} onChange={t=>{smooth();setPicked(t);setOpen('');}}/>
  {!board[tab].length&&<BrandEmpty title={tab==='decide'?tr('Всё решено'):tr('Пока пусто')} text={EMPTY[tab]}/>}
  {board[tab].map(item=>{
   const unfolded=open===item.key&&!!item.approval;
   return <View key={item.key}>
    <Line item={item} expanded={item.approval?unfolded:undefined} onPress={()=>{if(item.approval){smooth();setOpen(unfolded?'':item.key);}else if(item.entityKind&&item.entityId)onOpen(item.entityKind,item.entityId);}}/>
    {unfolded&&<ApprovalCard card={item.approval as Approval} busy={busy} onDecide={onDecide}/>}
   </View>;
  })}
 </View>;
}

function Line({item,expanded,onPress}:{item:BoardItem;expanded?:boolean;onPress:()=>void}){
 const folding=expanded!==undefined;
 return <Pressable accessibilityRole="button" accessibilityLabel={[item.title,item.detail,item.when].filter(Boolean).join(', ')} accessibilityHint={folding?(expanded?tr('Свернуть'):tr('Открыть и ответить')):tr('Открыть')} accessibilityState={folding?{expanded}:undefined} onPress={onPress} style={({pressed})=>[b.line,pressed&&b.pressed]}>
  <View style={[b.dot,{backgroundColor:item.urgent?C.warning:C.lineStrong}]}/>
  <View style={b.body}>
   <Text numberOfLines={1} style={b.title}>{item.title}</Text>
   <Text numberOfLines={1} style={b.detail}>{[item.when&&item.when.charAt(0).toUpperCase()+item.when.slice(1),item.detail].filter(Boolean).join(' · ')}</Text>
  </View>
  <Text style={[b.chevron,expanded&&b.chevronUp]}>{folding?'⌄':'›'}</Text>
 </Pressable>;
}

// What the AI administrator said before this sheet opened: folded into one line «История · N»; open, a line per message
// by day, newest first, and a line opens what was shown then. Older than a week is dropped on load (lib/conversation-history.ts).
export function HistoryFold({messages,render,onClear}:{messages:HistoryMessage[];render:(m:HistoryMessage)=>ReactNode;onClear:()=>void}){
 const [open,setOpen]=useState(false),[shown,setShown]=useState(''),[asked,setAsked]=useState(false);
 if(!messages.length)return null;
 const rows=historyRows(messages);
 return <View style={b.history}>
  <Pressable accessibilityRole="button" accessibilityLabel={tr('История, {length}',{length:messages.length})} accessibilityState={{expanded:open}} onPress={()=>{smooth();setOpen(!open);setShown('');setAsked(false);}} style={({pressed})=>[b.historyHead,pressed&&b.pressed]}>
   <View style={b.body}><Text style={b.title}>{tr('История · {n}',{n:messages.length})}</Text><Text numberOfLines={1} style={b.detail}>{tr('Что говорил ИИ-администратор. Старше {n} дней удаляется само.',{n:HISTORY_DAYS})}</Text></View>
   <Text style={[b.chevron,open&&b.chevronUp]}>⌄</Text>
  </Pressable>
  {open&&<View style={b.historyList}>
   {rows.map(({message,line,time,day})=>{const on=shown===message.id,content=on&&message.sender==='assistant'?render(message):null;return <View key={message.id}>
    {!!day&&<Text style={b.day}>{day}</Text>}
    <Pressable accessibilityRole="button" accessibilityLabel={line+(time?', '+time:'')} accessibilityState={{expanded:on}} onPress={()=>{smooth();setShown(on?'':message.id);}} style={({pressed})=>[b.historyRow,pressed&&b.pressed]}>
     <Text numberOfLines={on?undefined:1} style={[b.historyText,message.sender==='user'&&b.historyMine]}>{line}</Text>
     {!!time&&<Text style={b.time}>{time}</Text>}
    </Pressable>
    {!!content&&<View style={b.historyOpen}>{content}</View>}
   </View>;})}
   {asked?<View style={b.clearRow}>
     <Pressable accessibilityRole="button" onPress={()=>{setAsked(false);setOpen(false);onClear();}} style={({pressed})=>[b.clear,b.clearYes,pressed&&b.pressed]}><Text style={[b.clearText,b.clearYesText]}>{tr('Да, очистить')}</Text></Pressable>
     <Pressable accessibilityRole="button" onPress={()=>setAsked(false)} style={({pressed})=>[b.clear,pressed&&b.pressed]}><Text style={b.clearText}>{tr('Не нужно')}</Text></Pressable>
    </View>
    :<Pressable accessibilityRole="button" onPress={()=>setAsked(true)} style={({pressed})=>[b.clear,pressed&&b.pressed]}><Text style={b.clearText}>{tr('Очистить историю')}</Text></Pressable>}
  </View>}
 </View>;
}

const b=StyleSheet.create({
 wrap:{gap:0},
 empty:{...type.label,color:C.muted,textAlign:'center',marginTop:16,marginBottom:8,paddingHorizontal:16},
 // Board «Экраны старой версии», 2026-11-26: plain rows divided by a line, no fills; only the dot says «срочно».
 line:{flexDirection:'row',alignItems:'center',gap:12,minHeight:56,paddingVertical:12,borderBottomWidth:1,borderBottomColor:C.line},
 pressed:{opacity:.7},
 dot:{width:8,height:8,borderRadius:R.full},
 body:{flex:1,minWidth:0,gap:2},
 title:{...type.body,fontWeight:'600',color:C.ink},
 detail:{...type.caption,color:C.muted},
 chevron:{...type.subtitle,color:C.muted},chevronUp:{transform:[{rotate:'180deg'}]},
 history:{marginTop:16,borderRadius:R.lg,borderWidth:1,borderColor:C.line,backgroundColor:C.surface,overflow:'hidden'},
 historyHead:{flexDirection:'row',alignItems:'center',gap:12,minHeight:56,paddingHorizontal:16,paddingVertical:12},
 historyList:{borderTopWidth:1,borderTopColor:C.line,paddingHorizontal:16,paddingBottom:12},
 day:{...type.caption,color:C.muted,fontWeight:'600',letterSpacing:.4,textTransform:'uppercase',marginTop:12,marginBottom:4},
 historyRow:{flexDirection:'row',alignItems:'flex-start',gap:12,minHeight:44,paddingVertical:12,borderBottomWidth:1,borderBottomColor:C.line},
 historyText:{...type.label,color:C.inkSoft,flex:1,minWidth:0},historyMine:{color:C.muted},
 time:{...type.caption,color:C.muted,paddingTop:2},
 historyOpen:{paddingVertical:8},
 clearRow:{flexDirection:'row',gap:8},
 clear:{flex:1,marginTop:12,minHeight:44,alignItems:'center',justifyContent:'center',borderRadius:R.md,backgroundColor:C.surfaceAlt},
 clearYes:{backgroundColor:C.dangerSoft},
 clearText:{...type.label,fontWeight:'600',color:C.inkSoft},clearYesText:{color:C.danger},
});
