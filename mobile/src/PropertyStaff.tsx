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
import {isBanquet,isBath} from '../../lib/listings';
type Row=Record<string,any>;
const pretty=(v:string)=>v.replace(/^\+7(\d{3})(\d{3})(\d{2})(\d{2})$/,'+7 $1 $2 $3 $4');
const since=(at:number)=>t('с {v}',{v:dateText(at*1000,{timeZone:'Asia/Almaty',day:'numeric',month:'long'})});
// Who meets the guests, by the kind of the object: a home has no bath attendant.
const whoFor=(kind:string)=>isBath(kind)?t('Администратор или банщик'):isBanquet(kind)?t('Администратор зала'):t('Тот, кто встречает гостей и отмечает «Занято»');

export function PropertyStaff({propertyId,kind,onBack,onClose,onChanged}:{propertyId:string;kind?:string;onBack:()=>void;onClose:()=>void;onChanged?:(name:string)=>void}){
 const [state,setState]=useState<Row|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[note,setNote]=useState(''),[phone,setPhone]=useState('+7'),[confirm,setConfirm]=useState(false);
 useEffect(()=>{let live=true;request('/api/operations/staff/state',{propertyId}).then(v=>{if(live)setState(v);}).catch(x=>{if(live)setError(x?.message||t('Не удалось загрузить.'));});return()=>{live=false;};},[propertyId]);
 async function run(path:string,body:Row){if(busy)return;setBusy(true);setError('');setNote('');try{const r=await request('/api/operations/staff/'+path,{propertyId,...body});setState(r);setNote(r?.message||'');setConfirm(false);onChanged?.(r?.staff?.name||'');}catch(x:any){setError(x?.message||t('Не получилось.'));}finally{setBusy(false);}}
 const s=state?.staff,ready=phone.replace(/\D/g,'').length>=11;
 // The pinned button: «Назначить» before anyone is named, «Снять» and «Отмена» while removing is being confirmed.
 const foot=state&&!s?<EditButton title={t('Назначить')} disabled={!ready} busy={busy&&t('Назначаем…')} onPress={()=>run('assign',{phone})}/>
  :s&&confirm?<><EditButton title={t('Снять')} busy={busy&&t('Снимаем…')} onPress={()=>run('remove',{})}/><EditButton line title={t('Отмена')} disabled={busy} onPress={()=>setConfirm(false)}/></>:undefined;
 return <EditSheet title={t('Сотрудник')} onBack={onBack} onClose={onClose} busy={busy} foot={foot} menu={s&&!confirm?[{title:t('Снять'),icon:'trash',danger:true,onPress:()=>setConfirm(true)}]:undefined}>
  {!state&&!error&&<ThinkingLine style={editStyles.note} text={t('Загружаем…')}/>}
  {state&&!s&&<>
   <Text style={f.lead}>{whoFor(kind||'')}</Text>
   <EditField label={t('Телефон')} value={phone} onChange={setPhone} max={20} keyboard="phone-pad" placeholder="+7 777 123 45 67"/>
  </>}
  {s&&<EditRow icon="user" title={String(s.name||'')} line={pretty(String(s.phone||''))+' · '+since(Number(s.since))} last/>}
  {s&&confirm?<><Text style={f.lead}>{t('Снять: {name}?',{name:s.name})}</Text><EditNote text={t('Объект пропадёт из его «Смены», отметки снова будут только у вас.')}/></>
   :state&&<EditNote text={t('Видит гостей на сегодня и отмечает их. Цены и деньги остаются у вас.')}/>}
  {!!note&&<EditNote tone="done" text={note}/>}
  {!!error&&<EditNote tone="error" text={error}/>}
 </EditSheet>;
}
const f=StyleSheet.create({
 lead:{...type.body,color:C.ink,fontWeight:'600'},
});
