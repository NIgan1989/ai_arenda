import {t} from '../../lib/i18n';
import React,{useEffect,useState} from 'react';
import {Text,TextInput} from 'react-native';
import {flatAutopilotNote,type FlatAutopilot} from '../../lib/flat-autopilot';
import {request} from './api';
import {h} from './SheetParts';
import {s} from './styles';
import {SheetButton,SheetModal,ValueRow} from './ChoiceSheet';
import {SwipeConfirm} from './SwipeConfirm';

// The «Автопилот» plan of one flat, in its settings: a switch, the price in one line and, when the AI
// still needs it, the cleaning price. The same as on the site.
export function FlatAutopilotRow({propertyId,onChanged}:{propertyId:string;onChanged?:()=>Promise<unknown>|void}){
 const [state,setState]=useState<FlatAutopilot|null>(null),[busy,setBusy]=useState(false),[fee,setFee]=useState(''),[notice,setNotice]=useState('');
 async function load(){try{const v=await request('/api/operations/autopilot/state',undefined,undefined,undefined,'owner'),flat=(v.flats||[]).find((f:any)=>f.id===propertyId);setState(flat?{...flat,price:0,rate:Number(v.settings?.ownerRate??400),trialDays:0,charge:!!v.settings?.charge}:null);}catch(e:any){setNotice(e.message);}}
 useEffect(()=>{void load();},[propertyId]);
 async function run(body:()=>Promise<any>){setBusy(true);setNotice('');try{const r=await body();setNotice(r?.failed?.length?r.failed[0].error:'');await load();await onChanged?.();}catch(e:any){setNotice(e.message);await load();}finally{setBusy(false);}}
 const on=(cleaningFee?:number)=>run(()=>request('/api/operations/autopilot/start',{propertyIds:[propertyId],...(cleaningFee?{cleaningFees:{[propertyId]:cleaningFee}}:{})},undefined,undefined,'owner'));
 const off=()=>run(()=>request('/api/operations/matching/preference',{propertyId,mode:'manual'},undefined,undefined,'owner'));
 const [open,setOpen]=useState(false),needFee=!!state&&!state.managed&&!state.ownStaff&&!(state.cleaningFee>=100);
 // Board «Экраны старой версии», 2026-11-26: one row with its value; the sheet says the price in one line and
 // switches on with a swipe (it starts a paid plan), off with a quiet button.
 return <>
  <ValueRow title={t('Автопилот')} value={state?(state.managed?t('Включён'):t('Выключен')):notice||t('Загружаем…')} disabled={!state} onPress={()=>{setFee('');setOpen(true);}}/>
  {!!notice&&!!state&&!open&&<Text accessibilityLiveRegion="polite" style={h.note}>{notice}</Text>}
  <SheetModal visible={open} title={t('Автопилот')} note={state?flatAutopilotNote(state):''} onClose={()=>setOpen(false)}>
   {!!notice&&<Text accessibilityLiveRegion="polite" style={h.note}>{notice}</Text>}
   {state?.managed?<SheetButton title={busy?t('Выключаем…'):t('Выключить автопилот')} disabled={busy} onPress={()=>void off().then(()=>setOpen(false))}/>
    :<>{needFee&&<><Text style={s.fieldLabel}>{t('Сколько платить за уборку, ₸')}</Text><TextInput accessibilityLabel={t('Стоимость уборки')} style={s.field} keyboardType="number-pad" value={fee} onChangeText={v=>setFee(v.replace(/\D/g,''))} maxLength={7}/></>}
     <SwipeConfirm label={busy?t('Включаем…'):t('Проведите: включить автопилот')} disabled={busy||!state?.ready||(needFee&&Number(fee)<100)} onConfirm={()=>void on(needFee?Number(fee):undefined).then(()=>setOpen(false))}/></>}
  </SheetModal>
 </>;
}
