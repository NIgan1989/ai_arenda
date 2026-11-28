import {dateText,t} from '../../lib/i18n';
// «Сотрудник» of one object: the owner names the person on shift by phone, here and nowhere else. That person sees
// today's guests of the object in «Смена» and marks them; money and settings stay with the owner (lib/staff.ts).
// One sheet (board «Экраны старой версии», 2026-11-26): one field «Телефон», «Назначить» pinned at the bottom, what the
// person may do in one grey line; once named, a card of the person and «Снять» under «⋯».
import React,{useEffect,useState} from 'react';
import {StyleSheet,Text} from 'react-native';
import {ThinkingLine} from './Thinking';
import {C,type} from './styles';
import {request} from './api';
import {EditButton,EditField,EditNote,EditRow,EditSheet,editStyles} from './EditSheet';
import {isAuto,isBanquet,isBath,isHourlyVenue} from '../../lib/listings';
type Row=Record<string,any>;
const pretty=(v:string)=>v.replace(/^\+7(\d{3})(\d{3})(\d{2})(\d{2})$/,'+7 $1 $2 $3 $4');
const since=(at:number)=>t('с {v}',{v:dateText(at*1000,{timeZone:'Asia/Almaty',day:'numeric',month:'long'})});
// Who meets the guests, by the kind of the object: a home has no bath attendant.
const whoFor=(kind:string)=>isAuto(kind)?t('Администратор мойки: отмечает боксы и очередь в «Постах»'):isBath(kind)?t('Администратор или банщик'):isBanquet(kind)?t('Администратор зала'):isHourlyVenue(kind)?t('Администратор или мастер на смене'):t('Тот, кто встречает гостей и отмечает «Занято»');

// Several people on shift (2026-11-28): the admins of a car wash work in turns. Each one is a row; «Снять» asks once.
export function PropertyStaff({propertyId,kind,onBack,onClose,onChanged}:{propertyId:string;kind?:string;onBack:()=>void;onClose:()=>void;onChanged?:(name:string)=>void}){
 const [state,setState]=useState<Row|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[note,setNote]=useState(''),[phone,setPhone]=useState('+7'),[confirm,setConfirm]=useState<Row|null>(null);
 useEffect(()=>{let live=true;request('/api/operations/staff/state',{propertyId}).then(v=>{if(live)setState(v);}).catch(x=>{if(live)setError(x?.message||t('Не удалось загрузить.'));});return()=>{live=false;};},[propertyId]);
 async function run(path:string,body:Row){if(busy)return;setBusy(true);setError('');setNote('');try{const r=await request('/api/operations/staff/'+path,{propertyId,...body});setState(r);setNote(r?.message||'');setConfirm(null);setPhone('+7');onChanged?.((r?.team||(r?.staff?[r.staff]:[])).map((x:Row)=>x.name).join(', '));}catch(x:any){setError(x?.message||t('Не получилось.'));}finally{setBusy(false);}}
 const team:Row[]=state?.team||(state?.staff?[state.staff]:[]),room=team.length<(Number(state?.max)||1),ready=phone.replace(/\D/g,'').length>=11;
 // The pinned button: «Назначить» while there is room, «Снять» and «Отмена» while removing is being confirmed.
 const foot=confirm?<><EditButton title={t('Снять')} busy={busy&&t('Снимаем…')} onPress={()=>run('remove',{phone:confirm.phone})}/><EditButton line title={t('Отмена')} disabled={busy} onPress={()=>setConfirm(null)}/></>
  :state&&room?<EditButton title={team.length?t('Назначить ещё'):t('Назначить')} disabled={!ready} busy={busy&&t('Назначаем…')} onPress={()=>run('assign',{phone})}/>:undefined;
 return <EditSheet title={t('Сотрудники')} onBack={onBack} onClose={onClose} busy={busy} foot={foot}>
  {!state&&!error&&<ThinkingLine style={editStyles.note} text={t('Загружаем…')}/>}
  {confirm?<><Text style={f.lead}>{t('Снять: {name}?',{name:confirm.name})}</Text><EditNote text={t('Объект пропадёт из его «Смены».')}/></>:<>
   {team.map((x,i)=><EditRow key={x.phone} icon="user" title={String(x.name||'')} line={pretty(String(x.phone||''))+' · '+since(Number(x.since))} onPress={()=>setConfirm(x)} last={i===team.length-1}/>)}
   {state&&room&&<>
    {!team.length&&<Text style={f.lead}>{whoFor(kind||'')}</Text>}
    <EditField label={team.length?t('Телефон ещё одного сотрудника'):t('Телефон')} value={phone} onChange={setPhone} max={20} keyboard="phone-pad" placeholder="+7 777 123 45 67"/>
   </>}
   {state&&<EditNote text={team.length?t('Нажмите на сотрудника, чтобы снять. Видят гостей на сегодня и отмечают их, цены и деньги остаются у вас.'):t('Видит гостей на сегодня и отмечает их. Цены и деньги остаются у вас.')}/>}
  </>}
  {!!note&&<EditNote tone="done" text={note}/>}
  {!!error&&<EditNote tone="error" text={error}/>}
 </EditSheet>;
}
const f=StyleSheet.create({
 lead:{...type.body,color:C.ink,fontWeight:'600'},
});
