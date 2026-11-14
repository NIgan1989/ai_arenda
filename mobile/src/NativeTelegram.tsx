import React,{useEffect,useState} from 'react';
import {Linking,Pressable,StyleSheet,Text,View} from 'react-native';
import {C,type} from './styles';
import {T} from './tokens';
import {request} from './api';
import {RowIcon,SwitchRow,a} from './AccountRows';
type State={configured:boolean;linked:boolean;enabled:boolean;linkedAt:number};

// Notifications of this role in a personal Telegram chat (same as components/telegram-settings.tsx).
export function NativeTelegram({tint}:{tint?:string}={}){
 const [state,setState]=useState<State|null>(null),[busy,setBusy]=useState(false),[waiting,setWaiting]=useState<number|null>(null),[message,setMessage]=useState(''),[error,setError]=useState('');
 async function load(){try{const s=await request('/api/operations/delivery/status',{});setState(s);return s as State;}catch(x:any){setError(x?.message||'Не удалось проверить Telegram.');return null;}}
 useEffect(()=>{load();},[]);
 useEffect(()=>{if(waiting===null)return;let n=0;const t=setInterval(async()=>{n++;const s=await load();if(s&&s.linkedAt>waiting){setWaiting(null);setMessage('Telegram подключён. Бот прислал подтверждение.');clearInterval(t);}if(n>=40){setWaiting(null);clearInterval(t);}},3000);return()=>clearInterval(t);},[waiting]);
 async function connect(){setBusy(true);setError('');setMessage('');try{const r=await request('/api/operations/delivery/telegram',{});setWaiting(state?.linkedAt||0);await Linking.openURL(r.url);}catch(x:any){setError(x?.message||'Не получилось открыть Telegram.');}finally{setBusy(false);}}
 async function toggle(on:boolean){setBusy(true);setError('');setMessage('');try{const r=await request('/api/operations/delivery/channel',{channel:'telegram',enabled:on});setMessage(r.message);await load();}catch(x:any){setError(x?.message||'Не получилось.');}finally{setBusy(false);}}
 const button=(label:string,press:()=>void,primary=true)=><Pressable accessibilityRole="button" disabled={busy} onPress={press} style={[t.button,primary?t.primary:t.secondary,busy&&t.dim]}><Text style={primary?t.primaryText:t.secondaryText}>{label}</Text></Pressable>;
 // One row: nothing until the bot works, a «Подключить» button, then a switch.
 if(!state||!state.configured)return null;
 return <>
  {state.linked&&waiting===null?<SwitchRow icon="send" tint={tint} title="Telegram" note="Личный чат с ботом «Ай Аренда»" checked={state.enabled} disabled={busy} onChange={v=>void toggle(v)}/>
   :<View style={a.row}><RowIcon icon="send" tint={tint}/><View style={a.wide}><Text style={a.title}>Telegram</Text><Text style={a.note}>{waiting!==null?'Нажмите «Start» в чате с ботом':'Уведомления в личный чат'}</Text></View>{button(waiting!==null?'Ещё раз':'Подключить',connect)}</View>}
  {!!message&&<Text accessibilityLiveRegion="polite" style={[a.note,a.notice]}>{message}</Text>}
  {!!error&&<Text accessibilityRole="alert" style={[t.error,a.notice]}>{error}</Text>}
 </>;
}
const t=StyleSheet.create({
 row:{flexDirection:'row',gap:8},
 button:{minHeight:T.control.touch,paddingHorizontal:16,borderRadius:T.radius.full,alignItems:'center',justifyContent:'center'},
 primary:{backgroundColor:C.accent},secondary:{borderWidth:1,borderColor:C.line,backgroundColor:C.surface},dim:{opacity:.6},
 primaryText:{...type.label,color:C.onAccent,fontWeight:'700'},secondaryText:{...type.label,color:C.ink,fontWeight:'600'},
 error:{...type.label,color:C.danger}
});
