import {L,dateText,t as tr} from '../../lib/i18n';
// «Правила» of one object as one sheet of rows (board «Экраны старой версии», 2026-11-26; Turo «Pricing»): the state
// in one row with a dot, the prices as «Сутки · 9 000 ₸ ›», what the autopilot decides as switches and limits.
// A tap on a value opens its one field in place; «Сохранить» appears in the foot only after a change.
// Closing the object and opening it again live under «⋯», and closing is a swipe, never a stray tap.
// Check-in times and house rules live in the step editor («Изменить»), so they are not repeated here.
import React,{useState,type ReactNode} from 'react';
import {View,Text,TextInput,StyleSheet} from 'react-native';
import {C,type} from './styles';
import {T} from './tokens';
import {money,type Row} from './model';
import {EditSheet,EditButton,EditRow,EditSwitch,EditCount,EditChips,EditHeading,EditNote,editDot,editStyles as e,type EditMenuItem} from './EditSheet';
import {type MenuIcon} from './AccountRows';
import {SwipeConfirm} from './SwipeConfirm';
const R=T.radius;
const clock=(v:number)=>String(Math.floor(v/60)).padStart(2,'0')+':'+String(v%60).padStart(2,'0');
export const readinessLabels:Row=L({ready:'Готово к заселению',inspection:'Ожидает проверки',occupied:'Гость проживает',awaiting_cleaning:'Ожидает уборки',cleaning:'Идёт уборка',maintenance:'На ремонте',blocked:'Заезды закрыты'});
// The note goes to the server as it is; the title is shown in the language of the app.
const CLOSE:[string,string,string][]=[['maintenance','На ремонте','Владелец закрыл жильё на ремонт.'],['blocked','Закрыть заезды','Владелец временно закрыл заезды.']];
type Values={dailyPrice:number;hourlyPrice:number;minHours:number;nightlyPrice:number;deposit:number;cleaningFee:number;maxDiscountPercent:number;minimumRate:number;maxExtensionHours:number;autoConfirm:boolean;autoExtension:boolean};
export function controlValues(property:Row):Values{const p=property.policy||{};return {dailyPrice:Number(property.price)||0,hourlyPrice:p.hourly_price||0,minHours:p.min_hours||2,nightlyPrice:p.nightly_price||0,deposit:p.deposit||0,cleaningFee:p.cleaning_fee||0,maxDiscountPercent:p.max_discount_percent||0,minimumRate:p.minimum_rate||0,maxExtensionHours:p.max_extension_hours||0,autoConfirm:!!p.auto_confirm,autoExtension:!!p.auto_extension};}
// What goes to the server: the visible values plus everything this screen does not show, unchanged.
export function controlRequest(property:Row,v:Values):Row{const p=property.policy||{};
 return {dailyPrice:v.dailyPrice,hourlyPrice:v.hourlyPrice,minHours:v.minHours,nightlyPrice:v.nightlyPrice,deposit:v.deposit,cleaningFee:v.cleaningFee,cleaningBudget:Math.max(p.cleaning_budget||0,v.cleaningFee),
  checkinTime:clock(p.checkin_minutes??840),checkoutTime:clock(p.checkout_minutes??720),houseRules:p.house_rules||property.description||tr('Правила уточняются.'),
  maxDiscountPercent:v.maxDiscountPercent,minimumRate:v.minimumRate,autoConfirm:v.autoConfirm,autoExtension:v.autoExtension,maxExtensionHours:v.autoExtension?Math.max(1,v.maxExtensionHours):v.maxExtensionHours,expectedVersion:p.version||0};}
export const pricesLine=(v:Values)=>[tr('{v} / сутки',{v:money(v.dailyPrice)}),v.hourlyPrice>0&&tr('{v} / час',{v:money(v.hourlyPrice)}),v.nightlyPrice>0&&tr('{v} / ночь',{v:money(v.nightlyPrice)}),v.deposit>0&&tr('депозит {v}',{v:money(v.deposit)})].filter(Boolean).join(' · ');
export const aiLine=(v:Values)=>[v.autoConfirm?tr('подтверждает брони'):tr('брони подтверждаете вы'),v.autoExtension&&tr('продлевает до {v} ч',{v:Math.max(1,v.maxExtensionHours)}),v.maxDiscountPercent>0&&tr('скидка до {maxDiscountPercent}%',{maxDiscountPercent:v.maxDiscountPercent})].filter(Boolean).join(' · ');

// Stays that are booked and not yet lived in: closing the home asks what to do with them.
export function upcomingStays(bookings:Row[],propertyId:string,at:number){const list=(bookings||[]).filter(b=>b.property_id===propertyId&&b.status==='confirmed'&&b.end>at&&!b.terms?.actual_checkin).sort((a,b)=>a.start-b.start);return {count:list.length,next:list[0]?.start||0};}
export const closeQuestion=(u:{count:number;next:number})=>tr('Есть брони: {count}. Ближайший заезд {v}. Что с ними сделать?',{count:u.count,v:dateText(u.next*1000,{day:'numeric',month:'long',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Almaty'})});
// The dot of the state: in order, on its way to ready, closed.
const stateDot=(r:string)=>r==='ready'||r==='occupied'?editDot.ok:r==='maintenance'||r==='blocked'?editDot.off:editDot.wait;
type NumKey='dailyPrice'|'hourlyPrice'|'nightlyPrice'|'deposit'|'cleaningFee'|'maxDiscountPercent'|'minimumRate';
// A value in a row; a tap opens its one field in place, leaving the field shows the value again.
// While a request runs the field folds back into its row, so nothing is typed into a value being sent.
function Field({icon,title,shown,value,unit,max=10000000,hint,open,busy,onOpen,onDone,onChange,last=false}:{icon?:MenuIcon;title:string;shown:string;value:number;unit:string;max?:number;hint?:string;open:boolean;busy:boolean;onOpen:()=>void;onDone:()=>void;onChange:(v:number)=>void;last?:boolean}){
 if(!open||busy)return <EditRow icon={icon} title={title} line={shown} label={title+'. '+shown} disabled={busy} onPress={onOpen} last={last}/>;
 return <EditRow icon={icon} title={title} line={hint} last={last} right={<View style={e.numberBox}><TextInput autoFocus selectTextOnFocus accessibilityLabel={title} style={e.number} keyboardType="number-pad" value={value?String(value):''} placeholder="0" placeholderTextColor={C.muted} onBlur={onDone} onChangeText={x=>onChange(Math.min(max,Number(x.replace(/[^\d]/g,''))||0))}/><Text style={e.unit}>{unit}</Text></View>}/>;
}
export function PropertyControl({property,busy,onSave,onReadiness,upcoming,note,onBack,onClose}:{property:Row;busy:boolean;onSave:(data:Row)=>void;onReadiness:(data:Row)=>void;upcoming?:{count:number;next:number};note?:string;onBack?:()=>void;onClose?:()=>void}){
 const op=property.operation||{},start=controlValues(property),staff=!!Number(property.own_staff);
 const [v,setV]=useState<Values>(start),[edit,setEdit]=useState<NumKey|null>(null),[closing,setClosing]=useState<[string,string]|null>(null),[keep,setKeep]=useState<'keep'|'cancel'|null>(null);
 const set=(x:Partial<Values>)=>setV(o=>({...o,...x})),dirty=JSON.stringify(v)!==JSON.stringify(start);
 const priced=(['dailyPrice','hourlyPrice','minHours','nightlyPrice','deposit','cleaningFee'] as const).some(k=>v[k]!==start[k]);
 const living=op.readiness==='occupied'||!!op.active_booking_id,cleaning=op.readiness==='cleaning',ready=op.readiness==='ready',closed=op.readiness==='maintenance'||op.readiness==='blocked',free=!living&&!cleaning;
 const markReady=()=>{setEdit(null);onReadiness({readiness:'ready',inspected:true,expectedVersion:op.version});};
 const cost=(n:number)=>n>0?money(n):tr('нет'),state=readinessLabels[op.readiness]||tr('Ожидает проверки');
 const field=(key:NumKey,title:string,shown:string,o:{icon?:MenuIcon;unit?:string;max?:number;hint?:string;last?:boolean}={})=><Field key={key} icon={o.icon} title={title} shown={shown} value={v[key]} unit={o.unit||'₸'} max={o.max} hint={o.hint} last={o.last} open={edit===key} busy={busy} onOpen={()=>setEdit(key)} onDone={()=>setEdit(k=>k===key?null:k)} onChange={n=>set({[key]:n} as Partial<Values>)}/>;
 const status=<EditRow icon="building" title={property.title} line={state} dot={stateDot(op.readiness)} label={property.title+'. '+state}/>;
 // The sheet when the caller gives one; an older caller gets the same rows in a card, the menu as rows under them.
 const shell=(title:string,body:ReactNode,foot:ReactNode,menu:EditMenuItem[],back?:()=>void)=>onClose
  ?<EditSheet title={title} onBack={back} onClose={onClose} menu={menu} foot={foot} busy={busy}>{body}</EditSheet>
  :<View style={c.plain}>{body}{menu.length>0&&<View>{menu.map((x,i)=><EditRow key={x.title} icon={x.icon} title={x.title} disabled={busy} onPress={x.onPress} last={i===menu.length-1}/>)}</View>}{foot}</View>;
 // Closing is its own short step: what happens to the booked stays, then one swipe; «‹» or «Не закрывать» goes back.
 if(closing){
  const [code,why]=closing,ask=!!upcoming?.count,back=()=>{setClosing(null);setKeep(null);};
  const body=<>{status}{ask?<><Text accessibilityRole="alert" style={c.ask}>{closeQuestion(upcoming!)}</Text><EditChips<string> value={keep||''} options={[['keep',tr('Оставить брони в силе')],['cancel',tr('Отменить с полным возвратом')]]} onChange={x=>setKeep(x==='cancel'?'cancel':'keep')} disabled={busy}/></>
   :<EditNote text={tr('Гости не смогут забронировать, пока вы не откроете заезды.')}/>}</>;
  const foot=<><SwipeConfirm label={keep==='cancel'?tr('Проведите: отменить брони и закрыть'):code==='maintenance'?tr('Проведите: закрыть на ремонт'):tr('Проведите: закрыть заезды')} disabled={busy||(ask&&!keep)} onConfirm={()=>{onReadiness(ask?{readiness:code,note:why,bookings:keep,expectedVersion:op.version}:{readiness:code,note:why,expectedVersion:op.version});back();}}/>
   <EditButton line title={tr('Не закрывать')} disabled={busy} onPress={back}/></>;
  return shell(code==='maintenance'?tr('На ремонте'):tr('Закрыть заезды'),body,foot,[],back);
 }
 // Rare steps under «⋯»: open a closed object again, close it for repair or for check-ins. A guest living there or
 // a cleaning under way changes the state by itself, so then there is nothing to pick.
 const menu:EditMenuItem[]=free?[...(closed?[{title:tr('Открыть заезды'),icon:'key' as MenuIcon,onPress:markReady}]:[]),
  ...CLOSE.filter(([code])=>code!==op.readiness).map(([code,,why]):EditMenuItem=>({title:code==='maintenance'?tr('На ремонте'):tr('Закрыть заезды'),icon:code==='maintenance'?'alert':'lock',onPress:()=>{setEdit(null);setKeep(null);setClosing([code,why]);}}))]:[];
 // One dark button: «Сохранить» after a change; «Жильё готово» while the object waits for its check (outlined
 // under «Сохранить» when both are there).
 const check=free&&!ready&&!closed;
 const foot=dirty||check?<>
  {dirty&&<EditButton title={tr('Сохранить')} busy={busy&&tr('Сохраняем…')} onPress={()=>{setEdit(null);onSave(controlRequest(property,v));}}/>}
  {check&&<EditButton line={dirty} title={tr('Жильё готово')} disabled={busy} onPress={markReady}/>}
 </>:null;
 const body=<>
  {status}
  {!!note&&<EditNote text={note}/>}
  <EditHeading title={tr('Цены')}/>
  <View>
   {field('dailyPrice',tr('Сутки'),money(v.dailyPrice))}
   {field('hourlyPrice',tr('Час'),cost(v.hourlyPrice),{hint:tr('0, если не сдаёте по часам')})}
   {v.hourlyPrice>0&&<EditCount title={tr('Минимум часов')} value={v.minHours} min={1} max={24} disabled={busy} onChange={n=>set({minHours:n})}/>}
   {field('nightlyPrice',tr('Ночь'),cost(v.nightlyPrice),{hint:tr('0, если нет ночного тарифа')})}
   {field('deposit',tr('Депозит'),cost(v.deposit),{last:staff})}
   {!staff&&field('cleaningFee',tr('Уборка'),cost(v.cleaningFee),{max:1000000,hint:tr('Столько получит исполнитель'),last:true})}
  </View>
  {priced&&<EditNote text={tr('Новые цены действуют для новых заявок.')}/>}
  <EditHeading title={tr('Решает автопилот')}/>
  <View>
   <EditSwitch icon="bookings" title={tr('Подтверждать брони')} line={staff?tr('Принимает заявки гостей без вас'):tr('Принимает заявки и заказывает уборку')} value={v.autoConfirm} disabled={busy} onChange={x=>set({autoConfirm:x})}/>
   <EditSwitch icon="clock" title={tr('Продлевать проживание')} line={tr('По просьбе гостя, если жильё свободно')} value={v.autoExtension} disabled={busy} onChange={x=>set({autoExtension:x,maxExtensionHours:x?Math.max(1,v.maxExtensionHours||3):v.maxExtensionHours})}/>
   {v.autoExtension&&<View style={c.sub}><EditCount title={tr('Не больше, часов')} text={String(Math.max(1,v.maxExtensionHours))} value={Math.max(1,v.maxExtensionHours)} min={1} max={168} disabled={busy} onChange={n=>set({maxExtensionHours:n})}/></View>}
   {field('maxDiscountPercent',tr('Скидка до'),v.maxDiscountPercent>0?v.maxDiscountPercent+'%':tr('нет'),{icon:'badge',unit:'%',max:50})}
   {field('minimumRate',tr('Минимальная цена'),v.minimumRate>0?money(v.minimumRate):tr('не задана'),{icon:'shield',hint:tr('За сутки, час или ночь'),last:true})}
  </View>
 </>;
 return shell(tr('Правила'),body,foot,menu,onBack);
}
const c=StyleSheet.create({
 plain:{backgroundColor:C.surface,borderRadius:R.xl,padding:16,gap:12,borderWidth:1,borderColor:C.line},
 // A setting that belongs to the switch above it starts under that switch's words.
 sub:{paddingLeft:36},
 ask:{...type.body,color:C.ink},
});
