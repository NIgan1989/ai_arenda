// «Смена»: the screen of the person the owner named for an object (lib/staff.ts). Today's guests in order, one
// button for the next mark of each, and «Занято» for guests who came without the service. No money, no settings.
import React,{useEffect,useState,useCallback} from 'react';
import {View,Text,Pressable,StyleSheet} from 'react-native';
import {ThinkingLine} from './Thinking';
import {C,type} from './styles';
import {T} from './tokens';
import {request} from './api';
import type {Row} from './model';
import {BusyMark,busyNow,hhmm} from './BusyMark';

const MARK:Record<string,string>={heated:'Затоплено',arrived:'Гости пришли',left:'Гости ушли',ready:'Готово'};
const STAGE:Record<string,string>={wait:'Ждём гостей',here:'Гости на месте',left:'Гости ушли, наведите порядок'};
const day=(at:number,now:number)=>{const d=(v:number)=>new Date(v*1000).toLocaleDateString('ru-RU',{timeZone:'Asia/Almaty'});return d(at)===d(now)?'':d(at)===d(now+86400)?'завтра ':d(at)===d(now-86400)?'вчера ':new Date(at*1000).toLocaleDateString('ru-RU',{timeZone:'Asia/Almaty',day:'numeric',month:'short'})+' ';};
const people=(n:number)=>n+' '+(n%10===1&&n%100!==11?'гость':n%10>=2&&n%10<=4&&(n%100<10||n%100>=20)?'гостя':'гостей');

export function Shift(){
 const [state,setState]=useState<Row|null>(null),[error,setError]=useState(''),[note,setNote]=useState(''),[wait,setWait]=useState('');
 const load=useCallback(async()=>{try{setState(await request('/api/operations/staff/today',{}));}catch(x:any){setError(x?.message||'Не удалось загрузить.');}},[]);
 useEffect(()=>{load();const t=setInterval(load,60000);return()=>clearInterval(t);},[load]);
 async function mark(bookingId:string,name:string){if(wait)return;setWait(bookingId);setError('');setNote('');try{const r=await request('/api/operations/staff/mark',{bookingId,mark:name});setState(r);setNote(r?.message||'');}catch(x:any){setError(x?.message||'Не получилось.');}finally{setWait('');}}
 if(!state)return <View style={h.list}>{error?<Text accessibilityRole="alert" style={h.error}>{error}</Text>:<ThinkingLine style={h.meta} text="Загружаю смену…"/>}</View>;
 const now=Number(state.serverTime)||Date.now()/1000,places:Row[]=state.places||[];
 return <View style={h.list}>
  {!places.length&&<Text style={h.empty}>Вас пока не назначили ни на один объект. Назначает владелец в настройках объекта, по вашему номеру телефона.</Text>}
  {!!note&&<Text accessibilityLiveRegion="polite" style={h.note}>{note}</Text>}
  {!!error&&<Text accessibilityRole="alert" style={h.error}>{error}</Text>}
  {places.map(p=>{const held=busyNow(p.busy,now),inside=(p.stays||[]).some((b:Row)=>b.stage==='here');
   return <View key={p.id} style={h.card}>
    <View style={h.head}><View style={{flex:1,minWidth:0}}><Text numberOfLines={1} style={h.title}>{p.title}</Text><Text numberOfLines={1} style={h.meta}>{p.venue&&p.venue!==p.title?p.venue:p.place}</Text></View>
     <Text style={[h.tag,inside||held||p.readiness!=='ready'?h.tagBusy:h.tagFree]}>{inside?'Гости на месте':held?'Занято до '+hhmm(Number(held.end)):p.readiness==='ready'?'Свободно':'Наводим порядок'}</Text></View>
    {!(p.stays||[]).length&&<Text style={h.none}>Броней через приложение на сегодня нет.</Text>}
    {(p.stays||[]).map((b:Row)=><View key={b.id} style={[h.stay,b.stage==='here'&&h.stayOn]}>
     <View style={h.stayRow}><Text style={h.time}>{day(Number(b.start),now)}{hhmm(Number(b.start))}–{hhmm(Number(b.end))}</Text><Text numberOfLines={1} style={h.who}>{b.guestName} · {people(Number(b.guests)||1)}</Text></View>
     <Text style={h.stage}>{STAGE[b.stage]||''}</Text>
     {!!b.next&&<Pressable accessibilityRole="button" accessibilityLabel={MARK[b.next]+': '+b.guestName+', '+hhmm(Number(b.start))} disabled={!!wait} onPress={()=>mark(b.id,b.next)} style={({pressed})=>[h.go,(pressed||(!!wait&&wait!==b.id))&&h.dim]}><Text style={h.goText}>{wait===b.id?'Отмечаю…':'✓  '+MARK[b.next]}</Text></Pressable>}
    </View>)}
    {!inside&&<BusyMark propertyId={p.id} busy={p.busy} onChange={(busy,message)=>{setState(v=>v&&({...v,places:v.places.map((x:Row)=>x.id===p.id?{...x,busy}:x)}));setNote(message);setError('');}}/>}
   </View>;})}
 </View>;
}
const R=T.radius,H=T.control;
const h=StyleSheet.create({
 list:{gap:12,marginTop:4},
 card:{gap:12,padding:12,borderRadius:R.xl,borderWidth:1,borderColor:C.line,backgroundColor:C.surface},
 head:{flexDirection:'row',alignItems:'center',gap:8},title:{...type.body,color:C.ink,fontWeight:'700'},meta:{...type.caption,color:C.muted},
 tag:{...type.caption,fontWeight:'600',paddingHorizontal:8,paddingVertical:2,borderRadius:R.sm,overflow:'hidden'},tagFree:{backgroundColor:C.successSoft,color:C.success},tagBusy:{backgroundColor:C.warningSoft,color:C.warning},
 none:{...type.label,color:C.muted},
 stay:{gap:8,padding:12,borderRadius:R.md,backgroundColor:C.surfaceAlt},stayOn:{backgroundColor:C.accentSoft},
 stayRow:{flexDirection:'row',alignItems:'baseline',gap:8},time:{...type.body,color:C.ink,fontWeight:'700'},who:{...type.label,color:C.inkSoft,flex:1,textAlign:'right'},
 stage:{...type.caption,color:C.muted},
 go:{minHeight:H.primary,borderRadius:R.full,backgroundColor:C.accent,alignItems:'center',justifyContent:'center',paddingHorizontal:24},goText:{color:C.onAccent,...type.body,fontWeight:'700'},dim:{opacity:.45},
 empty:{...type.label,color:C.muted,textAlign:'center',paddingVertical:16},
 note:{padding:12,borderRadius:R.md,backgroundColor:C.accentSoft,color:C.ink,...type.label},
 error:{padding:12,borderRadius:R.md,backgroundColor:C.dangerSoft,color:C.danger,...type.label}
});
