import {dateText,t} from '../../lib/i18n';
import React,{useCallback,useEffect,useRef,useState} from 'react';
import {View,Text,Pressable,StyleSheet} from 'react-native';
import {request} from './api';
import {Photo} from './ListingMedia';
import {RowIcon,Btn,type MenuIcon} from './AccountRows';
import {money,type Row} from './model';
import {C,type} from './styles';
import {T} from './tokens';
import {GUARANTEE_REASONS,GUARANTEE_WAIT,guaranteeReason,type GuaranteeReason} from '../../lib/guarantee-text';

// «Гарантия заселения» on the guest's booking card (concept 2026-11-27, lib/checkin-guarantee.ts). Before the arrival:
// one row that says it exists and, from 15 minutes before the arrival, the quiet button «Не получается заселиться».
// After it: the owner is called and has ten minutes; then up to three free places nearby, no dearer, that confirm
// at once. On the booking that replaced the first one: the first is cancelled and its owner returns the money.
export type GuaranteeOption={propertyId:string;title:string;district:string;type:string;photo:string|null;amount:number;deposit?:number;distance:number;checkin:string;start:number;end:number};
type State={reported:boolean;reason?:string;reportedAt?:number;waitUntil?:number;now?:number;ownerAnsweredAt?:number|null;step?:'waiting'|'options'|'inside'|'closed'|'moved';amount?:number;options?:GuaranteeOption[]};
const ICONS:Record<GuaranteeReason,MenuIcon>={no_answer:'bell',key:'key',not_as_photo:'camera',other:'dot'};
export const guaranteeChoices=()=>(Object.keys(GUARANTEE_REASONS) as GuaranteeReason[]).map(value=>({value,label:t(GUARANTEE_REASONS[value]),icon:ICONS[value],...(value==='not_as_photo'?{note:t('Снимок можно приложить в чате брони')}:{})}));
const clock=(at:number)=>dateText(at*1000,{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Almaty'});
const far=(m:number)=>m<1000?t('{v} м от вас',{v:m}):t('{v} км',{v:String(Math.round(m/100)/10).replace('.',',')});

export function CheckinGuarantee({booking,stay,canReport,busy,replacement,onReport,onPick}:{booking:Row;stay:boolean;canReport:boolean;busy:boolean;replacement?:Row|null;onReport:()=>void;onPick:(o:GuaranteeOption)=>void}){
 const g=booking.guarantee as Row|null,open=booking.status==='confirmed'&&!booking.terms?.actual_checkin;
 const reported=!!g&&open&&!booking.terms?.checkin_reported_at;
 const [state,setState]=useState<State|null>(null),[error,setError]=useState(''),live=useRef(true);
 const load=useCallback(()=>request('/api/operations/guarantee/'+booking.id,undefined,undefined,undefined,'guest').then((v:State)=>{if(live.current){setState(v);setError('');}}).catch((e:unknown)=>{if(live.current)setError(e instanceof Error&&e.message?e.message:t('Не удалось загрузить.'));}),[booking.id]);
 useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
 // While the guest waits at the door: every half a minute, and right when the ten minutes are over.
 useEffect(()=>{if(!reported)return;void load();const every=setInterval(()=>void load(),30000);return()=>clearInterval(every);},[reported,load,booking.terms?.version]);
 const due=state?.waitUntil&&state.now?Math.max(0,state.waitUntil-state.now):0;
 useEffect(()=>{if(!reported||!due)return;const at=setTimeout(()=>void load(),(due+2)*1000);return()=>clearTimeout(at);},[reported,due,load]);

 // The booking that took the guest instead of the first one.
 if(booking.replaces)return <View style={v.box}><Line icon="shield" title={t('Замена по гарантии заселения')} note={Number(booking.replaces.refund)>0?t('Первая бронь «{title}» отменена. Владелец вернёт вам {sum}: следим за возвратом и напомним ему.',{title:booking.replaces.title,sum:money(Number(booking.replaces.refund))}):t('Первая бронь «{title}» отменена. Оплаты не было, возвращать нечего.',{title:booking.replaces.title})}/></View>;
 // The first booking, cancelled when the guest moved.
 if(g?.replacedBy&&booking.status==='cancelled')return <View style={v.box}><Line icon="shield" title={t('Вы выбрали замену')} note={replacement?t('«{title}» · бронь подтверждена',{title:replacement.title}):t('Новая бронь в ваших бронях')}/></View>;
 // A bath, a hall or a café has no replacement, but the guest still reports not being let in from here.
 if(!open||!stay&&!g&&!canReport)return null;
 if(!reported)return <View style={v.gap}>
  {stay&&<Line icon="shield" title={t('Гарантия заселения')} note={t('Не заселили: за 10 минут найдём жильё рядом')}/>}
  {canReport&&<Btn kind="line" title={t('Не получается заселиться')} disabled={busy} onPress={onReport}/>}
 </View>;
 if(!state)return error?<Text accessibilityRole="alert" style={v.error}>{error}</Text>:null;
 if(state.step!=='waiting'&&state.step!=='options')return null;
 const said=t(GUARANTEE_REASONS[guaranteeReason(state.reason)]),answered=state.ownerAnsweredAt?clock(state.ownerAnsweredAt):'';
 const options=state.options||[],waiting=state.step==='waiting';
 return <View style={v.box}>
  <Text accessibilityRole="header" style={v.big}>{waiting?t('Зовём владельца'):stay?t('Ищем вам замену'):t('Владелец не ответил')}</Text>
  <Text style={v.line}>{waiting?(stay?t('Написали владельцу и администратору сервиса. Если за 10 минут вас не заселят, покажем жильё рядом.'):t('Написали владельцу и администратору сервиса.')):!stay?t('Администратор сервиса разбирается. Вы можете отменить бронь без удержаний.'):options.length?(answered?t('Если вас так и не пустили, эти варианты свободны прямо сейчас, цена не выше вашей.'):t('Владелец не ответил. Эти варианты свободны прямо сейчас, цена не выше вашей.')):t('Свободного жилья рядом не дороже сейчас нет. Администратор сервиса знает и поможет. Отменить бронь можно без удержаний.')}</Text>
  {!waiting&&options.map(o=><Pressable key={o.propertyId} accessibilityRole="button" accessibilityLabel={[o.title,far(o.distance),o.checkin,money(o.amount),o.deposit?t('депозит {sum}',{sum:money(o.deposit)}):''].filter(Boolean).join(', ')} disabled={busy} onPress={()=>onPick(o)} style={({pressed})=>[v.option,pressed&&v.pressed]}>
   <View style={v.thumb}><Photo id={o.photo} alt={t('{title}, фото',{title:o.title})} fill/></View>
   <View style={v.grow}><Text numberOfLines={1} style={v.title}>{o.title}</Text><Text numberOfLines={1} style={v.note}>{[far(o.distance),o.checkin?t(o.checkin):''].filter(Boolean).join(' · ')}</Text>{!!o.deposit&&<Text numberOfLines={1} style={v.note}>{t('Депозит {sum}',{sum:money(o.deposit)})}</Text>}</View>
   <Text style={v.sum}>{money(o.amount)}</Text>
  </Pressable>)}
  <View style={v.steps}>
   <Step done at={clock(state.reportedAt!)} title={t('Вы сообщили: {what}',{what:said.charAt(0).toLowerCase()+said.slice(1)})} note={t('Владелец получил срочное сообщение')}/>
   {!!answered&&<Step done at={answered} title={t('Владелец ответил в чате')} note={t('Откройте чат брони')}/>}
   {waiting?<Step at={clock(state.waitUntil!)} title={stay?t('Покажем жильё рядом, если не заселят'):t('Администратор поможет, если не заселят')}/>
    :<>{!answered&&<Step done at={clock(state.waitUntil!)} title={t('Владелец не ответил')} note={booking.terms?.paid_amount>0?t('Попросим его вернуть {sum}',{sum:money(Number(booking.terms.paid_amount))}):undefined}/>}
     {stay&&options.length>0&&<Step title={t('Выберите жильё, бронь сразу подтвердится')}/>}</>}
  </View>
 </View>;
}

// The owner's card while the guest says they cannot get in: what the guest chose and how long is left to answer.
export function OwnerGuarantee({booking,stay}:{booking:Row;stay:boolean}){
 const g=booking.guarantee as Row|null;
 if(!g||g.replacedBy||booking.status!=='confirmed'||booking.terms?.actual_checkin||booking.terms?.checkin_reported_at)return null;
 const said=t(GUARANTEE_REASONS[guaranteeReason(g.reason)]).toLocaleLowerCase('ru');
 return <View style={v.box}><Line icon="alert" title={t('Гость не может заселиться')} note={stay?t('Гость сообщил: {what}. Ответьте в чате брони или позвоните. С {time} гостю покажем другое жильё рядом, и вам нужно будет вернуть ему оплату.',{what:said,time:clock(Number(g.reportedAt)+GUARANTEE_WAIT)}):t('Гость сообщил: {what}. Ответьте в чате брони или позвоните.',{what:said})}/></View>;
}

function Line({icon,title,note}:{icon:MenuIcon;title:string;note:string}){
 return <View style={v.row}><RowIcon icon={icon}/><View style={v.grow}><Text style={v.title}>{title}</Text><Text style={v.note}>{note}</Text></View></View>;
}
function Step({done=false,at,title,note}:{done?:boolean;at?:string;title:string;note?:string}){
 return <View style={v.step}><View style={[v.mark,done&&v.markDone]}/><View style={v.grow}><Text style={v.stepTitle}>{at?at+' ':''}{title}</Text>{!!note&&<Text style={v.note}>{note}</Text>}</View></View>;
}

const v=StyleSheet.create({
 gap:{gap:8},
 box:{gap:8,paddingTop:4},
 row:{flexDirection:'row',alignItems:'center',gap:12,paddingVertical:8},
 grow:{flex:1,minWidth:0},
 big:{...type.title,color:C.ink,fontWeight:'600'},
 line:{...type.label,color:C.muted},
 title:{...type.body,color:C.ink,fontWeight:'500'},
 note:{...type.caption,color:C.muted,marginTop:2},
 error:{...type.caption,color:C.danger},
 option:{flexDirection:'row',alignItems:'center',gap:12,paddingVertical:8,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:C.line},
 pressed:{opacity:.6},
 thumb:{width:56,height:56,borderRadius:T.radius.md,overflow:'hidden',backgroundColor:C.surfaceAlt},
 sum:{...type.body,color:C.ink,fontWeight:'600'},
 steps:{gap:8,marginTop:8},
 step:{flexDirection:'row',alignItems:'flex-start',gap:8},
 mark:{width:10,height:10,borderRadius:4,borderWidth:1.5,borderColor:C.muted,marginTop:4},
 markDone:{backgroundColor:C.ink,borderColor:C.ink},
 stepTitle:{...type.label,color:C.ink},
});
