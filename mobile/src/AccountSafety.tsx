import {NativeAccountDeletion} from './AccountDeletion';
import {ThinkingLine} from './Thinking';
import React,{useEffect,useRef,useState} from 'react';
import {View,Text,Pressable,Linking} from 'react-native';
import {ApiError,StaleSessionError,request,API_URL} from './api';
import {s,C} from './styles';
import {Group,Row,SwitchRow,a} from './AccountRows';
// «Данные и безопасность»: a short list, each row opens its own screen, the same as on the site.
// Plain words for the participant; only an administrator sees the deletion requests.
export type SafetyPage=''|'devices'|'ai'|'delete'|'reports'|'requests';
export const safetyTitles:Record<Exclude<SafetyPage,''>,string>={devices:'Вход и устройства',ai:'ИИ-помощник',delete:'Удаление аккаунта',reports:'Мои жалобы',requests:'Запросы на удаление'};
const day=(t:number)=>new Date(t*1000).toLocaleDateString('ru-RU',{day:'numeric',month:'long'});
const devices=(n:number)=>n+' '+(n%10===1&&n%100!==11?'устройство':n%10>=2&&n%10<=4&&(n%100<12||n%100>14)?'устройства':'устройств');
export function NativeAccountSafety({role,page,go,admin=false,onSignedOut}:{role:string;page:SafetyPage;go:(page:SafetyPage)=>void;admin?:boolean;onSignedOut:(result?:Record<string,any>)=>void|Promise<void>}){
 const [state,setState]=useState<any>(null),[sessions,setSessions]=useState<any[]|null>(null),[permission,setPermission]=useState<any>(null),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState('');
 const alive=useRef(false),sequence=useRef(0);
 const current=(id:number)=>alive.current&&sequence.current===id;
 async function load(){const id=++sequence.current;setLoading(true);setLoadError('');try{const [value,list,ai]=await Promise.all([request('/api/operations/safety'),request('/api/sessions').catch(()=>null),request('/api/operations/ai-data-permission').catch(()=>null)]);if(current(id)){setState(value);setSessions(Array.isArray(list?.sessions)?list.sessions:null);setPermission(ai?.permission||null);}}catch(e:any){if(current(id)){setState(null);if(!(e instanceof StaleSessionError))setLoadError(e instanceof ApiError?e.message:'Нет связи. Проверьте интернет и попробуйте ещё раз.');}}finally{if(current(id))setLoading(false);}}
 useEffect(()=>{alive.current=true;void load();return()=>{alive.current=false;sequence.current++;};},[role]);
 useEffect(()=>{setNotice('');setConfirmed(false);},[page]);
 async function act(path:string,body:Record<string,any>){setBusy(true);setNotice('');try{const r=await request(path,{...body,confirmed:true});if(!alive.current)return;setNotice(r.message||'Готово.');await load();return r;}catch(e:any){if(alive.current&&!(e instanceof StaleSessionError)){setNotice(e instanceof ApiError?e.message:'Нет связи. Попробуйте ещё раз.');await load();}}finally{if(alive.current)setBusy(false);}}
 const choose=(allowed:boolean)=>permission&&act('/api/operations/ai-data-permission',{allowed,policyVersion:permission.policyVersion,expectedVersion:permission.version});
 const wide=(title:string,fn:()=>void,disabled=busy,danger=false)=><Pressable accessibilityRole="button" disabled={disabled} onPress={fn} style={[s.button,danger?{backgroundColor:C.danger}:s.secondary,{marginTop:12},disabled&&s.disabled]}><Text style={[s.buttonText,!danger&&s.secondaryText]}>{title}</Text></Pressable>;
 const lead=(text:string)=><Text style={[a.note,{marginTop:12,marginHorizontal:4,fontSize:14,lineHeight:20}]}>{text}</Text>;
 const link=(title:string,path:string)=><Row title={title} onPress={()=>void Linking.openURL(API_URL+path).catch(()=>undefined)}/>;
 const missing=(what:string)=><View>{lead('Не удалось загрузить '+what+'. Проверьте интернет.')}{wide('Повторить',()=>void load(),loading)}</View>;
 const shown=!!notice&&<Text accessibilityRole="alert" style={[a.note,{marginTop:12,marginHorizontal:4}]}>{notice}</Text>;
 if(!state)return loading?<ThinkingLine style={s.meta} text="Загружаем…"/>:<View><Text accessibilityRole="alert" style={s.error}>{loadError}</Text>{wide('Повторить',()=>void load(),false)}</View>;
 const requested=state.deletion?.status==='requested',details=state.deletionDetails||{},reports:any[]=state.reports||[],deletions:any[]=state.deletions||[];
 const aiValue=!permission?'':permission.allowed?'Включён':permission.decided?'Выключен':'Не выбрано';
 if(page==='devices'&&!sessions)return missing('список входов');
 if(page==='ai'&&!permission)return missing('настройку ИИ');
 if(page==='devices'){const others=(sessions||[]).some(v=>!v.current);return <View>
  {lead('Вы входите по номеру телефона и паролю. Забыли пароль — нажмите «Забыли пароль?» на экране входа и введите резервный код.')}
  <Group>{(sessions||[]).map(v=><View key={v.kind+v.id} style={a.row}><View style={a.wide}><Text style={a.title}>{v.kind==='mobile'?'Приложение':'Браузер'}</Text><Text style={a.note}>{v.current?'Это устройство':'Вход действует до '+day(v.expires_at)}</Text></View>{!v.current&&<Pressable accessibilityRole="button" accessibilityLabel={'Выйти: '+(v.kind==='mobile'?'приложение':'браузер')} disabled={busy} onPress={()=>void act('/api/sessions',{action:'one',kind:v.kind,id:v.id})} style={[a.edit,busy&&s.disabled]}><Text style={a.editText}>Выйти</Text></Pressable>}</View>)}{sessions&&!sessions.length&&<View style={a.row}><Text style={a.note}>Других входов нет.</Text></View>}</Group>
  {others&&wide('Выйти на всех других устройствах',()=>void act('/api/sessions',{action:'others'}))}{shown}</View>;}
 if(page==='ai')return <View>
  <Group><SwitchRow title="Разрешить ИИ видеть мои данные" note={aiValue==='Не выбрано'?'Вы ещё не выбрали':aiValue==='Включён'?'ИИ отвечает с учётом ваших броней и жилья':'ИИ отвечает только по правилам сервиса'} checked={!!permission?.allowed} disabled={busy||!permission} onChange={v=>void choose(v)}/></Group>
  {lead('Так ИИ-администратор отвечает точнее: он видит ваш вопрос, несколько последних сообщений и данные вашей роли. Фото, личные чаты и коды от замков он не видит.')}
  {lead('Ответы готовит внешний сервис OpenAI, данные могут обрабатываться за рубежом. Выключить можно в любой момент. Без разрешения ИИ всё равно ищет жильё и подсказывает по правилам.')}
  {permission&&!permission.decided&&wide('Оставить выключенным',()=>void choose(false))}
  <Group space>{link('Как мы обращаемся с данными','/privacy')}</Group>{shown}</View>;
 if(page==='reports')return <View><Group>{reports.map(r=><View key={r.id} style={a.row}><View style={a.wide}><Text style={a.title}>{r.target_kind==='ai'?'Ответ ИИ':'Сообщение'}</Text>{!!(r.resolution||r.created_at)&&<Text style={a.note}>{r.resolution||'Отправлена '+day(r.created_at)}</Text>}</View><Text style={a.note}>{r.status==='resolved'?'Рассмотрена':r.status==='reviewing'?'Рассматриваем':'Отправлена'}</Text></View>)}{!reports.length&&<View style={a.row}><Text style={a.note}>Жалоб нет.</Text></View>}</Group>{lead('Пожаловаться можно прямо в чате, на конкретное сообщение.')}</View>;
 if(page==='requests'&&admin)return <View>{lead('Видите только вы как администратор. Ответить на запрос и посмотреть жалобы можно в «Управление сервисом» на сайте.')}<Group>{deletions.map(r=><View key={r.id} style={a.row}><Text style={a.title}>Запрос №{r.id} от {day(r.requested_at)}</Text></View>)}{!deletions.length&&<View style={a.row}><Text style={a.note}>Новых запросов нет.</Text></View>}</Group>{wide('Открыть управление сервисом',()=>void Linking.openURL(API_URL+'/admin?section=moderation').catch(()=>undefined),false)}</View>;
 if(page==='delete')return <View>{requested?<>
  <Group><View style={a.row}><View style={a.wide}><Text style={a.title}>Запрос отправлен {state.deletion.requested_at?day(state.deletion.requested_at):''}</Text><Text style={a.note}>{details.review?.note||'Проверяем, что нет незавершённых броней, уборок и расчётов. Данные пока на месте.'}</Text></View></View></Group>
  <NativeAccountDeletion details={details} onChanged={load} onSignedOut={onSignedOut}/>
  {wide('Отозвать запрос',()=>void act('/api/operations/safety/deletion',{action:'cancel'}),busy||loading)}</>:<>
  {lead('Удалим аккаунт целиком, со всеми ролями: гостя, владельца и исполнителя. Сначала проверим, что нет незавершённых броней, уборок и расчётов, и напишем вам результат.')}
  <Group space><SwitchRow title="Понимаю, что удалятся все мои роли" checked={confirmed} disabled={busy||loading} onChange={setConfirmed}/></Group>
  {wide('Запросить удаление',()=>void act('/api/operations/safety/deletion',{action:'request'}),busy||loading||!confirmed,true)}</>}
  <Group space>{link('Что удаляется и что остаётся','/data-deletion')}</Group>{shown}</View>;
 return <View>
  <Group><Row title="Вход и устройства" value={sessions?devices(sessions.length):undefined} onPress={()=>go('devices')}/><Row title="ИИ-помощник" value={aiValue} onPress={()=>go('ai')}/>{reports.length>0&&<Row title="Мои жалобы" value={reports.length} onPress={()=>go('reports')}/>}</Group>
  <Group space>{link('Политика конфиденциальности','/privacy')}{link('Условия сервиса','/terms')}</Group>
  {admin&&<Group space><Row title="Запросы на удаление" value={deletions.length||'нет'} onPress={()=>go('requests')}/></Group>}
  <Group space><Row title="Удалить аккаунт" value={requested?'запрос отправлен':undefined} danger onPress={()=>go('delete')}/></Group>
 </View>;
}
