import {t} from '../../lib/i18n';
import React,{useState} from 'react';
import {View,Text,Pressable,StyleSheet} from 'react-native';
import {request} from './api';
import {Row,a} from './AccountRows';
import {s,C,type} from './styles';
import {T} from './tokens';
import {STAY_CLASSES,stayClasses,type StayClass} from '../../lib/stay-class';

type Item={id:string;title:string;city:string;district:string;price:number;stayClass:StayClass|null;by:'ai'|'owner'|'admin'|'estimate'};
const BY:Record<Item['by'],string>={ai:'ИИ',owner:'владелец',admin:'администратор',estimate:'оценка ИИ'};

// The platform administrator: «Классы жилья» (lib/stay-class.ts). Every published place with its class and who set it;
// a tap on another class corrects it, and the owner then cannot change it back without asking.
export function AdminClasses({tint}:{tint?:string}){
 const [open,setOpen]=useState(false),[items,setItems]=useState<Item[]|null>(null),[busy,setBusy]=useState(''),[error,setError]=useState('');
 async function load(){setBusy('list');setError('');try{setItems((await request('/api/admin/classes')).items||[]);}catch(e){setError(e instanceof Error&&e.message?e.message:t('Не получилось.'));}finally{setBusy('');}}
 function toggle(){setOpen(v=>!v);if(!open&&!items)void load();}
 async function set(p:Item,stayClass:StayClass){
  if(busy||p.stayClass===stayClass&&p.by==='admin')return;setBusy(p.id);setError('');
  try{await request('/api/admin/classes/set',{propertyId:p.id,stayClass});setItems(list=>list?.map(x=>x.id===p.id?{...x,stayClass,by:'admin'}:x)||null);}
  catch(e){setError(e instanceof Error&&e.message?e.message:t('Не получилось.'));}finally{setBusy('');}
 }
 return <>
  <Row icon="star" tint={tint} title={t('Классы жилья')} note={t('Проверить класс, который поставили ИИ и владельцы')} open={open} onPress={toggle}/>
  {open&&<View style={a.body}>
   {busy==='list'&&!items&&<Text style={s.meta}>{t('Загружаем…')}</Text>}
   {items&&!items.length&&<Text style={s.meta}>{t('Опубликованного жилья пока нет.')}</Text>}
   {items?.map(p=><View style={s.card} key={p.id}>
    <Text style={s.eventTitle}>{p.title}</Text>
    <Text style={s.meta}>{[p.district,p.city].filter(Boolean).join(', ')} · {new Intl.NumberFormat('ru-RU').format(p.price)} ₸ · {t('поставил: {who}',{who:t(BY[p.by])})}</Text>
    <View style={c.seg} accessibilityRole="radiogroup" accessibilityLabel={t('Класс жилья')}>{STAY_CLASSES.map(id=>{const on=p.stayClass===id;return <Pressable key={id} accessibilityRole="radio" accessibilityLabel={stayClasses[id]} accessibilityState={{checked:on,disabled:!!busy}} disabled={!!busy} onPress={()=>void set(p,id)} style={({pressed})=>[c.part,on&&c.on,(pressed||busy===p.id)&&{opacity:.6}]}><Text numberOfLines={1} style={[c.text,on&&c.textOn]}>{stayClasses[id]}</Text></Pressable>;})}</View>
   </View>)}
   {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
  </View>}
 </>;
}

const c=StyleSheet.create({
 seg:{flexDirection:'row',gap:4,padding:4,borderRadius:T.radius.full,backgroundColor:C.bg,marginTop:8},
 part:{flex:1,minHeight:36,borderRadius:T.radius.full,alignItems:'center',justifyContent:'center',paddingHorizontal:4},on:{backgroundColor:C.ink},
 text:{...type.caption,color:C.inkSoft,fontWeight:'600'},textOn:{color:C.onAccent},
});
