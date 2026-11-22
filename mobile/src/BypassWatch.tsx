import {t} from '../../lib/i18n';
import React,{useState} from 'react';
import {View,Text,Pressable} from 'react-native';
import {request} from './api';
import {Row,a} from './AccountRows';
import {s,C} from './styles';

type Suspect={userId:string;name:string;role:'owner'|'cleaner';score:number;signals:{cancels:number;stayed:number;contacts:number;jobs:number};warnings:number};

// The platform administrator: owners and cleaners who seem to take deals out of the service (lib/bypass-watch.ts).
// One card per person: the signs in plain words and one button for the next step of the offer —
// first warning, second warning, block.
export function BypassWatch({tint}:{tint?:string}){
 const [open,setOpen]=useState(false),[items,setItems]=useState<Suspect[]|null>(null),[busy,setBusy]=useState(''),[error,setError]=useState(''),[info,setInfo]=useState(''),[sure,setSure]=useState('');
 async function load(){setBusy('list');setError('');try{setItems((await request('/api/admin/bypass')).items||[]);}catch(e){setError(e instanceof Error&&e.message?e.message:t('Не получилось.'));}finally{setBusy('');}}
 function toggle(){setOpen(v=>!v);if(!open&&!items)void load();}
 async function act(p:Suspect){
  if(busy)return;
  if(p.warnings>=2&&sure!==p.userId){setSure(p.userId);return;}
  setBusy(p.userId);setError('');setInfo('');
  try{
   const r=p.warnings>=2?await request('/api/admin/restrictions/decide',{userId:p.userId,action:'block',reason:t('Обход сервиса после двух предупреждений (оферта, раздел «Обход Сервиса»).')})
    :await request('/api/admin/bypass/warn',{userId:p.userId,warnings:p.warnings});
   setInfo(r?.message||t('Готово.'));setSure('');await load();
  }catch(e){setError(e instanceof Error&&e.message?e.message:t('Не получилось.'));}finally{setBusy('');}
 }
 const signs=(p:Suspect)=>[
  p.signals.stayed?t('Гости сказали, что жили по отменённой брони: {n}',{n:p.signals.stayed}):'',
  p.signals.cancels?t('Отмены подтверждённых броней: {n}',{n:p.signals.cancels}):'',
  p.signals.contacts?t('Попытки дать контакты в чате до срока: {n}',{n:p.signals.contacts}):'',
  p.signals.jobs?(p.role==='owner'?t('Отмены уборок у одного исполнителя: {n}',{n:p.signals.jobs}):t('Отмены его уборок одним владельцем: {n}',{n:p.signals.jobs})):''
 ].filter(Boolean).join('\n');
 const step=(p:Suspect)=>p.warnings===0?t('Предупредить'):p.warnings===1?t('Второе предупреждение'):sure===p.userId?t('Точно заблокировать'):t('Заблокировать');
 return <>
  <Row icon="shield" tint={tint} title={t('Обход сервиса')} note={t('Кто похож на сделки мимо сервиса')} value={items?.length?String(items.length):undefined} open={open} onPress={toggle}/>
  {open&&<View style={a.body}>
   <Text style={s.meta}>{t('Признаки за 30 дней. После предупреждения счёт идёт заново. Шаги по оферте: предупреждение, второе предупреждение, блокировка.')}</Text>
   {busy==='list'&&!items&&<Text style={s.meta}>{t('Загружаю…')}</Text>}
   {items&&!items.length&&<Text style={s.meta}>{t('Сейчас никого нет.')}</Text>}
   {items?.map(p=><View style={s.card} key={p.userId+p.role}>
    <Text style={s.eventTitle}>{p.name} · {p.role==='owner'?t('владелец'):t('исполнитель')}</Text>
    <Text style={s.meta}>{signs(p)}{'\n'}{p.warnings?t('Предупреждений: {n}',{n:p.warnings}):t('Предупреждений не было')}</Text>
    <Pressable accessibilityRole="button" disabled={!!busy} onPress={()=>void act(p)} style={[s.button,p.warnings<2&&s.secondary,p.warnings>=2&&{backgroundColor:C.danger},!!busy&&s.disabled]}><Text style={[s.buttonText,p.warnings<2&&s.secondaryText]}>{busy===p.userId?t('Отправляю…'):step(p)}</Text></Pressable>
   </View>)}
   {!!info&&<Text style={s.meta}>{info}</Text>}
   {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
  </View>}
 </>;
}
