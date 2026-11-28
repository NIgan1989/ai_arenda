import {forms,t as tr} from '../../lib/i18n';
// «Посты» of a car place (lib/bays.ts): one line a box and one button, the cars waiting with − and +, «Не приехал» on a
// booking that did not come. The admin at the desk taps it, not the washers; the owner sees the same screen.
import React,{useCallback,useEffect,useState} from 'react';
import {View,Text,Pressable,StyleSheet} from 'react-native';
import {ThinkingLine} from './Thinking';
import {C,type} from './styles';
import {T} from './tokens';
import {request} from './api';
import type {Row} from './model';
import {bayLines} from '../../lib/bay-plan';
import {hhmm} from './BusyMark';

const since=(at:number,now:number)=>{const m=Math.max(0,Math.round((now-at)/60));return m<1?tr('только что'):m<60?tr('{m} мин',{m}):tr('{h} ч {m} мин',{h:Math.floor(m/60),m:m%60});};

export function Posts({place,onChange}:{place:Row;onChange:(place:Row,message:string)=>void}){
 const [wait,setWait]=useState(''),[error,setError]=useState(''),[times,setTimes]=useState<{id:string;starts:number[]}|null>(null);
 async function run(key:string,path:string,body:Row){if(wait)return;setWait(key);setError('');
  try{const r=await request('/api/operations/staff/'+path,body);setTimes(null);onChange(r.place,r.message||'');}catch(x:any){setError(x?.message||tr('Не получилось.'));}finally{setWait('');}}
 const requests:Row[]=place.requests||[];
 async function other(id:string){if(wait)return;if(times?.id===id){setTimes(null);return;}setWait('t'+id);setError('');
  try{const r=await request('/api/operations/staff/request-times',{bookingId:id});const at=Number(requests.find(q=>q.id===id)?.start)||0;
   // The times nearest to the one the guest asked for, in order.
   setTimes({id,starts:(r.starts||[]).map(Number).filter((v:number)=>v!==at).sort((a:number,b:number)=>Math.abs(a-at)-Math.abs(b-at)).slice(0,12).sort((a:number,b:number)=>a-b)});}catch(x:any){setError(x?.message||tr('Не получилось.'));}finally{setWait('');}}
 const now=Date.now()/1000,bays:Row[]=place.bays||[],waiting=Number(place.waiting)||0,queue=bays.some(b=>b.mode==='queue'),lines=bayLines(place.load);
 return <View style={h.list}>
  {!!lines.length&&<Text style={h.meta}>{tr('Гости видят')}: {lines.join(' · ')}</Text>}
  {!!requests.length&&<View style={h.bay}>
   {/* «Заявкой» (lib/bays.ts answerRequest): the admin confirms the guest's time or names another one. */}
   <Text style={h.title}>{tr('Заявки')} · {requests.length}</Text>
   {requests.map(r=><View key={r.id} style={{gap:8}}>
    <Text style={h.meta}>{hhmm(Number(r.start))}–{hhmm(Number(r.end))} · {[r.service,r.guestName].filter(Boolean).join(' · ')}</Text>
    <View style={h.row}>
     <Pressable accessibilityRole="button" accessibilityLabel={tr('Подтвердить')+': '+hhmm(Number(r.start))} disabled={!!wait} onPress={()=>run('c'+r.id,'request',{bookingId:r.id,action:'confirm'})} style={({pressed})=>[h.go,{flex:1},(pressed||!!wait)&&h.dim]}><Text style={h.goText}>{wait==='c'+r.id?tr('Отмечаем…'):tr('Подтвердить')}</Text></Pressable>
     <Pressable accessibilityRole="button" accessibilityLabel={tr('Другое время')+': '+hhmm(Number(r.start))} disabled={!!wait} onPress={()=>other(r.id)} style={({pressed})=>[h.line,{flex:1},(pressed||!!wait)&&h.dim]}><Text style={h.lineText}>{wait==='t'+r.id?tr('Ищем время…'):tr('Другое время')}</Text></Pressable>
    </View>
    {times&&times.id===r.id&&(times.starts.length?<View style={h.chips}>{times.starts.map(v=><Pressable key={v} accessibilityRole="button" accessibilityLabel={tr('Назначить {v}',{v:hhmm(v)})} disabled={!!wait} onPress={()=>run('m'+r.id,'request',{bookingId:r.id,action:'move',start:v})} style={({pressed})=>[h.chip,(pressed||!!wait)&&h.dim]}><Text style={h.chipText}>{hhmm(v)}</Text></Pressable>)}</View>
     :<Text style={h.meta}>{tr('Сегодня свободного времени нет.')}</Text>)}
   </View>)}
  </View>}
  {queue&&<View style={h.queue}>
   <View style={{flex:1}}><Text style={h.title}>{tr('Ждут в очереди')}</Text><Text style={h.meta}>{tr(forms(waiting,'{n} машина','{n} машины','{n} машин'),{n:waiting})}</Text></View>
   <Pressable accessibilityRole="button" accessibilityLabel={tr('Ждут на одну меньше')} disabled={!!wait||!waiting} onPress={()=>run('w-','waiting',{propertyId:place.id,delta:-1})} style={({pressed})=>[h.step,(pressed||!waiting||!!wait)&&h.dim]}><Text style={h.stepText}>−</Text></Pressable>
   <Text style={h.count}>{waiting}</Text>
   <Pressable accessibilityRole="button" accessibilityLabel={tr('Ждут на одну больше')} disabled={!!wait} onPress={()=>run('w+','waiting',{propertyId:place.id,delta:1})} style={({pressed})=>[h.step,(pressed||!!wait)&&h.dim]}><Text style={h.stepText}>+</Text></Pressable>
  </View>}
  {bays.map(b=>{const busy=!!b.busySince,k=b.booking;
   return <View key={b.id} style={[h.bay,busy&&h.bayOn]}>
    <View style={h.row}><Text style={h.title}>{tr('Бокс {n}',{n:b.n})}</Text><Text style={h.mode}>{b.mode==='booking'?tr('по записи'):tr('очередь')}</Text>
     <Text style={[h.tag,b.closed?h.tagOff:busy?h.tagBusy:h.tagFree]}>{b.closed?tr('Закрыт'):busy?tr('Занят · {v}',{v:since(Number(b.busySince),now)}):tr('Свободен')}</Text></View>
    {!!k&&<Text style={h.meta}>{hhmm(Number(k.start))}–{hhmm(Number(k.end))} · {[k.service,k.guestName].filter(Boolean).join(' · ')}{k.arrived?' · '+tr('на месте'):''}</Text>}
    {!b.closed&&<Pressable accessibilityRole="button" accessibilityLabel={(busy?tr('Бокс свободен'):tr('Машина заехала'))+': '+tr('Бокс {n}',{n:b.n})} disabled={!!wait} onPress={()=>run(b.id,'bay',{propertyId:b.id,action:busy?'out':'in'})} style={({pressed})=>[busy?h.line:h.go,(pressed||(!!wait&&wait!==b.id))&&h.dim]}>
     <Text style={busy?h.lineText:h.goText}>{wait===b.id?tr('Отмечаем…'):busy?tr('Бокс свободен'):tr('Машина заехала')}</Text></Pressable>}
    {!!k?.late&&!busy&&<Pressable accessibilityRole="button" disabled={!!wait} onPress={()=>run('n'+k.id,'no-show',{bookingId:k.id})} style={({pressed})=>[h.line,(pressed||!!wait)&&h.dim]}>
     <Text style={h.lineText}>{wait==='n'+k.id?tr('Отмечаем…'):tr('Не приехал')}</Text></Pressable>}
   </View>;})}
  {!!error&&<Text accessibilityRole="alert" style={h.error}>{error}</Text>}
 </View>;
}
/** The owner's «Посты» of one card, loaded by itself and refreshed every minute. */
export function PostsOf({propertyId,onNote}:{propertyId:string;onNote?:(text:string)=>void}){
 const [place,setPlace]=useState<Row|null>(null),[error,setError]=useState('');
 const load=useCallback(async()=>{try{setPlace((await request('/api/operations/staff/posts',{propertyId})).place);}catch(x:any){setError(x?.message||tr('Не удалось загрузить.'));}},[propertyId]);
 useEffect(()=>{load();const t=setInterval(load,60000);return()=>clearInterval(t);},[load]);
 if(!place)return error?<Text accessibilityRole="alert" style={h.error}>{error}</Text>:<ThinkingLine style={h.meta} text={tr('Загружаем посты…')}/>;
 return <Posts place={place} onChange={(next,message)=>{setPlace(next);onNote?.(message);}}/>;
}
const R=T.radius,H=T.control;
const h=StyleSheet.create({
 list:{gap:12},
 queue:{flexDirection:'row',alignItems:'center',gap:12,padding:12,borderRadius:R.md,backgroundColor:C.surfaceAlt},
 step:{width:44,height:44,borderRadius:R.full,borderWidth:1,borderColor:C.line,backgroundColor:C.surface,alignItems:'center',justifyContent:'center'},stepText:{...type.title,color:C.ink},
 count:{...type.title,color:C.ink,minWidth:28,textAlign:'center'},
 bay:{gap:8,padding:12,borderRadius:R.md,backgroundColor:C.surfaceAlt},bayOn:{backgroundColor:C.surface,borderWidth:1,borderColor:C.ink},
 row:{flexDirection:'row',alignItems:'center',gap:8},title:{...type.body,color:C.ink,fontWeight:'600'},mode:{...type.caption,color:C.muted,flex:1},meta:{...type.caption,color:C.muted},
 tag:{...type.caption,fontWeight:'600',paddingHorizontal:8,paddingVertical:2,borderRadius:R.sm,overflow:'hidden'},tagFree:{backgroundColor:C.successSoft,color:C.success},tagBusy:{backgroundColor:C.warningSoft,color:C.warning},tagOff:{backgroundColor:C.surface,color:C.muted},
 go:{minHeight:H.primary,borderRadius:R.full,backgroundColor:C.ink,alignItems:'center',justifyContent:'center',paddingHorizontal:24},goText:{color:C.onAccent,...type.body,fontWeight:'600'},
 line:{minHeight:H.primary,borderRadius:R.full,borderWidth:1,borderColor:C.ink,alignItems:'center',justifyContent:'center',paddingHorizontal:24},lineText:{color:C.ink,...type.body,fontWeight:'600'},
 chips:{flexDirection:'row',flexWrap:'wrap',gap:8},chip:{minHeight:44,minWidth:64,paddingHorizontal:12,borderRadius:R.full,borderWidth:1,borderColor:C.line,backgroundColor:C.surface,alignItems:'center',justifyContent:'center'},chipText:{...type.body,color:C.ink},
 dim:{opacity:.45},
 error:{padding:12,borderRadius:R.md,backgroundColor:C.dangerSoft,color:C.danger,...type.label}
});
