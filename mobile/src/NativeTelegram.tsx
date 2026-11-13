import React,{useEffect,useState} from 'react';
import {Linking,Pressable,StyleSheet,Text,View} from 'react-native';
import {C,type} from './styles';
import {T} from './tokens';
import {request} from './api';
import {Row,a} from './AccountRows';
type State={configured:boolean;linked:boolean;enabled:boolean;linkedAt:number};

// Notifications of this role in a personal Telegram chat (same as components/telegram-settings.tsx).
export function NativeTelegram(){
 const [state,setState]=useState<State|null>(null),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[waiting,setWaiting]=useState<number|null>(null),[message,setMessage]=useState(''),[error,setError]=useState('');
 async function load(){try{const s=await request('/api/operations/delivery/status',{});setState(s);return s as State;}catch(x:any){setError(x?.message||'Не удалось проверить Telegram.');return null;}}
 useEffect(()=>{load();},[]);
 useEffect(()=>{if(waiting===null)return;let n=0;const t=setInterval(async()=>{n++;const s=await load();if(s&&s.linkedAt>waiting){setWaiting(null);setMessage('Telegram подключён. Бот прислал подтверждение.');clearInterval(t);}if(n>=40){setWaiting(null);clearInterval(t);}},3000);return()=>clearInterval(t);},[waiting]);
 async function connect(){setBusy(true);setError('');setMessage('');try{const r=await request('/api/operations/delivery/telegram',{});setWaiting(state?.linkedAt||0);await Linking.openURL(r.url);}catch(x:any){setError(x?.message||'Не получилось открыть Telegram.');}finally{setBusy(false);}}
 async function toggle(on:boolean){setBusy(true);setError('');setMessage('');try{const r=await request('/api/operations/delivery/channel',{channel:'telegram',enabled:on});setMessage(r.message);await load();}catch(x:any){setError(x?.message||'Не получилось.');}finally{setBusy(false);}}
 const value=!state?'Проверяю…':!state.configured?'Скоро':state.enabled?'Включён':state.linked?'Выключен':'Не подключён';
 const button=(label:string,press:()=>void,primary=true)=><Pressable accessibilityRole="button" disabled={busy} onPress={press} style={[t.button,primary?t.primary:t.secondary,busy&&t.dim]}><Text style={primary?t.primaryText:t.secondaryText}>{label}</Text></Pressable>;
 return <>
  <Row title="Telegram" value={value} open={open} onPress={()=>setOpen(v=>!v)}/>
  {open&&<View style={a.body}>
   <Text style={a.note}>Заявки, брони и уборки будут приходить в личный чат с ботом «Ай Аренда». Одно подключение работает для всех ваших ролей.</Text>
   {!state?null:!state.configured?<Text style={a.note}>Бот уведомлений скоро заработает. Пока события приходят в приложение.</Text>
    :!state.linked||waiting!==null?<><Text style={a.note}>{waiting!==null?'Нажмите «Start» в чате с ботом и вернитесь сюда. Я жду подтверждения…':'Откроется чат с ботом: нажмите «Start», и всё.'}</Text>{button(waiting?'Открыть ещё раз':'Подключить Telegram',connect)}</>
    :<View style={t.row}>{button(state.enabled?'Выключить':'Включить снова',()=>toggle(!state.enabled),!state.enabled)}{button('Другой чат',connect,false)}</View>}
   {!!message&&<Text accessibilityLiveRegion="polite" style={a.saved}>{message}</Text>}
   {!!error&&<Text accessibilityRole="alert" style={t.error}>{error}</Text>}
  </View>}
 </>;
}
const t=StyleSheet.create({
 row:{flexDirection:'row',gap:8},
 button:{minHeight:T.control.touch,paddingHorizontal:16,borderRadius:T.radius.full,alignItems:'center',justifyContent:'center'},
 primary:{backgroundColor:C.accent},secondary:{borderWidth:1,borderColor:C.line,backgroundColor:C.surface},dim:{opacity:.6},
 primaryText:{...type.label,color:C.onAccent,fontWeight:'700'},secondaryText:{...type.label,color:C.ink,fontWeight:'600'},
 error:{...type.label,color:C.danger}
});
