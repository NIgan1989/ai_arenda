import {dateText,L,plural,t,tServer} from '../../lib/i18n';
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
export const safetyTitles:Record<Exclude<SafetyPage,''>,string>=L({devices:'Вход и устройства',ai:'ИИ-помощник',delete:'Удаление аккаунта',reports:'Мои жалобы',requests:'Запросы на удаление'});
const day=(t:number)=>dateText(new Date(t*1000),{day:'numeric',month:'long'});
// What happens to each kind of data after the deletion (lib/account-deletion.ts keptGroups).
const groupNames:Record<string,string>=L({profile:'Профиль и контакты',id_files:'Фото удостоверения',deals:'Брони и уборки',money:'Суммы и оплаты',chats:'Переписка по сделкам',documents:'Согласия и проверки'});
const groupActions:Record<string,string>=L({deleted:'Удалим',pending:'Удалим из хранилища в течение часа',anonymized:'Останутся без имени',kept:'Сохраним'});
const fullDay=(t:number)=>dateText(new Date(t*1000),{day:'numeric',month:'long',year:'numeric'});
const devices=(n:number)=>n+' '+plural(n,['устройство','устройства','устройств'],['device','devices'],'құрылғы');
export function NativeAccountSafety({role,page,go,admin=false,onSignedOut,tint}:{tint?:string;role:string;page:SafetyPage;go:(page:SafetyPage)=>void;admin?:boolean;onSignedOut:(result?:Record<string,any>)=>void|Promise<void>}){
 const [state,setState]=useState<any>(null),[sessions,setSessions]=useState<any[]|null>(null),[permission,setPermission]=useState<any>(null),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState('');
 const alive=useRef(false),sequence=useRef(0);
 const current=(id:number)=>alive.current&&sequence.current===id;
 async function load(){const id=++sequence.current;setLoading(true);setLoadError('');try{const [value,list,ai]=await Promise.all([request('/api/operations/safety'),request('/api/sessions').catch(()=>null),request('/api/operations/ai-data-permission').catch(()=>null)]);if(current(id)){setState(value);setSessions(Array.isArray(list?.sessions)?list.sessions:null);setPermission(ai?.permission||null);}}catch(e:any){if(current(id)){setState(null);if(!(e instanceof StaleSessionError))setLoadError(e instanceof ApiError?e.message:t('Нет связи. Проверьте интернет и попробуйте ещё раз.'));}}finally{if(current(id))setLoading(false);}}
 useEffect(()=>{alive.current=true;void load();return()=>{alive.current=false;sequence.current++;};},[role]);
 useEffect(()=>{setNotice('');setConfirmed(false);},[page]);
 async function act(path:string,body:Record<string,any>){setBusy(true);setNotice('');try{const r=await request(path,{...body,confirmed:true});if(!alive.current)return;setNotice(r.message||t('Готово.'));await load();return r;}catch(e:any){if(alive.current&&!(e instanceof StaleSessionError)){setNotice(e instanceof ApiError?e.message:t('Нет связи. Попробуйте ещё раз.'));await load();}}finally{if(alive.current)setBusy(false);}}
 const choose=(allowed:boolean)=>permission&&act('/api/operations/ai-data-permission',{allowed,policyVersion:permission.policyVersion,expectedVersion:permission.version});
 const wide=(title:string,fn:()=>void,disabled=busy,danger=false)=><Pressable accessibilityRole="button" disabled={disabled} onPress={fn} style={[s.button,danger?{backgroundColor:C.danger}:s.secondary,{marginTop:12},disabled&&s.disabled]}><Text style={[s.buttonText,!danger&&s.secondaryText]}>{title}</Text></Pressable>;
 const lead=(text:string)=><Text style={[a.note,{marginTop:12,marginHorizontal:4,fontSize:14,lineHeight:20}]}>{text}</Text>;
 const link=(title:string,path:string)=><Row icon="file" tint={tint} title={title} onPress={()=>void Linking.openURL(API_URL+path+'?from=app').catch(()=>undefined)}/>;
 const missing=(what:string)=><View>{lead(t('Не удалось загрузить {what}. Проверьте интернет.',{what}))}{wide(t('Повторить'),()=>void load(),loading)}</View>;
 const shown=!!notice&&<Text accessibilityRole="alert" style={[a.note,{marginTop:12,marginHorizontal:4}]}>{notice}</Text>;
 if(!state)return loading?<ThinkingLine style={s.meta} text={t('Загружаем…')}/>:<View><Text accessibilityRole="alert" style={s.error}>{loadError}</Text>{wide(t('Повторить'),()=>void load(),false)}</View>;
 const requested=state.deletion?.status==='requested',details=state.deletionDetails||{},reports:any[]=state.reports||[],deletions:any[]=state.deletions||[];
 const aiValue=!permission?'':permission.allowed?t('Включён'):permission.decided?t('Выключен'):t('Не выбрано');
 if(page==='devices'&&!sessions)return missing(t('список входов'));
 if(page==='ai'&&!permission)return missing(t('настройку ИИ'));
 if(page==='devices'){const others=(sessions||[]).some(v=>!v.current);return <View>
  {lead(t('Вы входите по номеру телефона и паролю. Забыли пароль — нажмите «Забыли пароль?» на экране входа и введите резервный код.'))}
  <Group>{(sessions||[]).map(v=><View key={v.kind+v.id} style={a.row}><View style={a.wide}><Text style={a.title}>{v.kind==='mobile'?t('Приложение'):t('Браузер')}</Text><Text style={a.note}>{v.current?t('Это устройство'):t('Вход действует до {v}',{v:day(v.expires_at)})}</Text></View>{!v.current&&<Pressable accessibilityRole="button" accessibilityLabel={t('Выйти: {v}',{v:(v.kind==='mobile'?t('приложение'):t('браузер'))})} disabled={busy} onPress={()=>void act('/api/sessions',{action:'one',kind:v.kind,id:v.id})} style={[a.edit,busy&&s.disabled]}><Text style={a.editText}>{t('Выйти')}</Text></Pressable>}</View>)}{sessions&&!sessions.length&&<View style={a.row}><Text style={a.note}>{t('Других входов нет.')}</Text></View>}</Group>
  {others&&wide(t('Выйти на всех других устройствах'),()=>void act('/api/sessions',{action:'others'}))}{shown}</View>;}
 if(page==='ai')return <View>
  <Group><SwitchRow icon="sparkles" tint={tint} title={t('Разрешить ИИ видеть мои данные')} note={!permission?.decided&&!permission?.allowed?t('Вы ещё не выбрали'):permission?.allowed?t('ИИ отвечает с учётом ваших броней и жилья'):t('ИИ отвечает только по правилам сервиса')} checked={!!permission?.allowed} disabled={busy||!permission} onChange={v=>void choose(v)}/></Group>
  {lead(t('Так ИИ-администратор отвечает точнее: он видит ваш вопрос, несколько последних сообщений и данные вашей роли. Фото, личные чаты и коды от замков он не видит.'))}
  {lead(t('Ответы готовит внешний сервис OpenAI, данные могут обрабатываться за рубежом. Выключить можно в любой момент. Без разрешения ИИ всё равно ищет жильё и подсказывает по правилам.'))}
  {permission&&!permission.decided&&wide(t('Оставить выключенным'),()=>void choose(false))}
  <Group space>{link(t('Как мы обращаемся с данными'),'/privacy')}</Group>{shown}</View>;
 if(page==='reports')return <View><Group>{reports.map(r=><View key={r.id} style={a.row}><View style={a.wide}><Text style={a.title}>{r.target_kind==='ai'?t('Ответ ИИ'):t('Сообщение')}</Text>{!!(r.resolution||r.created_at)&&<Text style={a.note}>{r.resolution||t('Отправлена {v}',{v:day(r.created_at)})}</Text>}</View><Text style={a.note}>{r.status==='resolved'?t('Рассмотрена'):r.status==='reviewing'?t('Рассматриваем'):t('Отправлена')}</Text></View>)}{!reports.length&&<View style={a.row}><Text style={a.note}>{t('Жалоб нет.')}</Text></View>}</Group>{lead(t('Пожаловаться можно прямо в чате, на конкретное сообщение.'))}</View>;
 if(page==='requests'&&admin)return <View>{lead(t('Видите только вы как администратор. Ответить на запрос и посмотреть жалобы можно в «Управление сервисом» на сайте.'))}<Group>{deletions.map(r=><View key={r.id} style={a.row}><Text style={a.title}>{t('Запрос №{id} от {day}',{id:r.id,day:day(r.requested_at)})+(r.stage==='needs_action'?' · '+t('ждём участника'):r.stage==='reviewing'?' · '+t('в работе'):'')}</Text></View>)}{!deletions.length&&<View style={a.row}><Text style={a.note}>{t('Новых запросов нет.')}</Text></View>}</Group>{wide(t('Открыть управление сервисом'),()=>void Linking.openURL(API_URL+'/admin?section=moderation').catch(()=>undefined),false)}</View>;
 if(page==='delete')return <View>{requested?<>
  <Group><View style={a.row}><View style={a.wide}><Text style={a.title}>{state.deletion.requested_at?t('Запрос отправлен {day}',{day:day(state.deletion.requested_at)}):t('Запрос отправлен')}</Text><Text style={a.note}>{details.review?.note?t('Ответ оператора {day}: {note}',{day:day(details.review.created_at),note:details.review.note}):t('Проверяем, что нет незавершённых броней, уборок и расчётов. Данные пока на месте.')}</Text></View></View></Group>
  {(details.blockers||[]).length>0&&<>{lead(t('Что мешает удалить сейчас'))}<Group>{details.blockers.map((b:any)=><View key={b.code} style={a.row}><Text style={[a.note,a.wide]}>{tServer(b.label)}</Text></View>)}</Group></>}
  {(details.groups||[]).length>0&&<>{lead(t('Что будет с данными'))}<Group>{details.groups.map((g:any)=><View key={g.category} style={a.row}><View style={a.wide}><Text style={a.title}>{groupNames[g.category]||g.category}</Text><Text style={a.note}>{(groupActions[g.action]||g.action)+(g.keep_until?' '+t('до {v}',{v:fullDay(g.keep_until)}):'')}</Text>{!!g.basis&&<Text style={a.note}>{tServer(g.basis)}</Text>}{g.draft&&<Text style={a.note}>{t('Срок пока предварительный, уточним с бухгалтером и юристом.')}</Text>}</View></View>)}</Group></>}
  <NativeAccountDeletion details={details} onChanged={load} onSignedOut={onSignedOut}/>
  {wide(t('Отозвать запрос'),()=>void act('/api/operations/safety/deletion',{action:'cancel'}),busy||loading)}</>:<>
  {lead(t('Удалим аккаунт целиком, со всеми ролями: гостя, владельца и исполнителя. Сначала проверим, что нет незавершённых броней, уборок и расчётов, и напишем вам результат.'))}
  <Group space><SwitchRow title={t('Понимаю, что удалятся все мои роли')} checked={confirmed} disabled={busy||loading} onChange={setConfirmed}/></Group>
  {wide(t('Запросить удаление'),()=>void act('/api/operations/safety/deletion',{action:'request'}),busy||loading||!confirmed,true)}</>}
  <Group space>{link(t('Что удаляется и что остаётся'),'/data-deletion')}</Group>{shown}</View>;
 return <View>
  <Group><Row icon="key" tint={tint} title={t('Вход и устройства')} value={sessions?devices(sessions.length):undefined} onPress={()=>go('devices')}/><Row icon="sparkles" tint={tint} title={t('ИИ-помощник')} value={aiValue} onPress={()=>go('ai')}/>{reports.length>0&&<Row icon="flag" tint={tint} title={t('Мои жалобы')} value={reports.length} onPress={()=>go('reports')}/>}</Group>
  <Group space>{link(t('Политика конфиденциальности'),'/privacy')}{link(t('Условия сервиса'),'/terms')}</Group>
  {admin&&<Group space><Row icon="alert" tint={tint} title={t('Запросы на удаление')} value={state.deletionTotal||deletions.length||t('нет')} onPress={()=>go('requests')}/></Group>}
  <Group space><Row icon="trash" title={t('Удалить аккаунт')} value={requested?t('запрос отправлен'):undefined} danger onPress={()=>go('delete')}/></Group>
 </View>;
}
