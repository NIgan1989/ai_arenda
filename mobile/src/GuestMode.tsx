import {t} from '../../lib/i18n';
import React,{useState} from 'react';
import {TextInput,Text} from 'react-native';
import {C} from './styles';
import {h} from './SheetParts';
import {ChoiceRows,SheetButton,SheetModal,ValueRow} from './ChoiceSheet';
import type {Row} from './model';

// Who answers guests for one flat: nobody (no quick requests), the owner, or the AI on autopilot.
// The same three choices as the site's request panel (components/matching-inbox.tsx). In the app (board «Экраны старой
// версии», 2026-11-26) one row per flat with its value; a tap opens the three choices in a sheet with «Готово».
type Mode='off'|'manual'|'auto';
const titles:Record<Mode,string>=/* i18n */{off:'Никто',manual:'Вы',auto:'Автопилот'};
export function GuestMode({flat,busy,onChange}:{flat:Row;busy:boolean;onChange:(body:Row)=>void}){
 const current:Mode=flat.mode||(flat.enabled?'manual':'off');
 const [open,setOpen]=useState(false),[mode,setMode]=useState<Mode>(current),[fee,setFee]=useState('');
 const needFee=mode==='auto'&&current!=='auto'&&!Number(flat.own_staff)&&!(Number(flat.cleaning_fee)>=100),amount=Number(fee);
 const done=()=>{setOpen(false);if(mode!==current)onChange({propertyId:flat.id,mode,...(needFee?{cleaningFee:amount}:{})});};
 return <>
  <ValueRow title={flat.title} value={t(titles[current])} disabled={busy} label={t('Кто отвечает гостям: {title}',{title:flat.title})+'. '+t(titles[current])} onPress={()=>{setMode(current);setFee('');setOpen(true);}}/>
  <SheetModal visible={open} title={flat.title} note={t('Кто отвечает гостям на быстрые запросы.')} onClose={()=>setOpen(false)}>
   <ChoiceRows<Mode> value={mode} disabled={busy} label={t('Кто отвечает гостям: {title}',{title:flat.title})} onChange={setMode} options={[
    {id:'off',title:t('Никто'),note:t('Быстрые запросы не приходят')},
    {id:'manual',title:t('Вы'),note:t('Отвечаете гостям сами')},
    {id:'auto',title:t('Автопилот'),note:t('ИИ отвечает, подтверждает бронь и заказывает уборку')},
   ]}/>
   {needFee&&<><Text style={h.note}>{t('По этой цене ИИ будет заказывать уборку после каждого выезда.')}</Text><TextInput accessibilityLabel={t('Стоимость уборки, ₸')} placeholder={t('Стоимость уборки, ₸')} placeholderTextColor={C.muted} keyboardType="number-pad" value={fee} onChangeText={v=>setFee(v.replace(/\D/g,''))} style={h.input} editable={!busy} maxLength={7}/></>}
   <SheetButton title={t('Готово')} disabled={busy||(needFee&&!(amount>=100))} onPress={done}/>
  </SheetModal>
 </>;
}
