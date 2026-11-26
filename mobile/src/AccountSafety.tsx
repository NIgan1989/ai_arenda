import {dateText,L,plural,t,tServer} from '../../lib/i18n';
import {NativeAccountDeletion} from './AccountDeletion';
import {ThinkingLine} from './Thinking';
import React,{useEffect,useRef,useState} from 'react';
import {View,Text,Pressable,Linking,TextInput} from 'react-native';
import {ApiError,StaleSessionError,request,API_URL} from './api';
import {s,C} from './styles';
import {Btn,Group,Row,RowIcon,SwitchRow,a,menuIcons,type MenuIcon} from './AccountRows';
import {SwipeConfirm} from './SwipeConfirm';
import {passkeyAvailable,readPasskeyNote,writePasskeyNote} from './passkey';
import {passkeyError,passkeyWords,turnOnPasskey} from './PasskeyOffer';
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
const signIns=(n:number)=>n+' '+plural(n,['вход','входа','входов'],['sign-in','sign-ins'],'кіру');
// The line icon of each kind of data on «Удалить аккаунт».
const groupIcons:Record<string,MenuIcon>={profile:'user',id_files:'camera',deals:'bookings',money:'wallet',chats:'messages',documents:'file'};
export function NativeAccountSafety({role,page,go,admin=false,onSignedOut,tint}:{tint?:string;role:string;page:SafetyPage;go:(page:SafetyPage)=>void;admin?:boolean;onSignedOut:(result?:Record<string,any>)=>void|Promise<void>}){
 const [state,setState]=useState<any>(null),[sessions,setSessions]=useState<any[]|null>(null),[kindOpen,setKindOpen]=useState(''),[permission,setPermission]=useState<any>(null),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState('');
 // Face ID or a fingerprint instead of the password (src/PasskeyOffer.tsx): on while the account has a key; a sign-in
 // older than a quarter of an hour adds one only with the password.
 const [keys,setKeys]=useState<any[]|null>(null),[here,setHere]=useState(false),[keyPassword,setKeyPassword]=useState(''),[askPassword,setAskPassword]=useState(false),words=passkeyWords();
 const alive=useRef(false),sequence=useRef(0);
 const current=(id:number)=>alive.current&&sequence.current===id;
 async function load(){const id=++sequence.current;setLoading(true);setLoadError('');try{const [value,list,ai,keyList]=await Promise.all([request('/api/operations/safety'),request('/api/sessions').catch(()=>null),request('/api/operations/ai-data-permission').catch(()=>null),passkeyAvailable()?request('/auth/passkey-list',{}).catch(()=>null):null]);if(current(id)){setState(value);setSessions(Array.isArray(list?.sessions)?list.sessions:null);setPermission(ai?.permission||null);setKeys(Array.isArray(keyList?.passkeys)?keyList.passkeys:null);setHere(!!await readPasskeyNote('on'));}}catch(e:any){if(current(id)){setState(null);if(!(e instanceof StaleSessionError))setLoadError(e instanceof ApiError?e.message:t('Нет связи. Проверьте интернет и попробуйте ещё раз.'));}}finally{if(current(id))setLoading(false);}}
 useEffect(()=>{alive.current=true;void load();return()=>{alive.current=false;sequence.current++;};},[role]);
 useEffect(()=>{setNotice('');setConfirmed(false);},[page]);
 async function act(path:string,body:Record<string,any>){setBusy(true);setNotice('');try{const r=await request(path,{...body,confirmed:true});if(!alive.current)return;setNotice(r.message||t('Готово.'));await load();return r;}catch(e:any){if(alive.current&&!(e instanceof StaleSessionError)){setNotice(e instanceof ApiError?e.message:t('Нет связи. Попробуйте ещё раз.'));await load();}}finally{if(alive.current)setBusy(false);}}
 async function keyOn(){setBusy(true);setNotice('');try{const r=await turnOnPasskey('',askPassword?keyPassword:undefined);if(!alive.current)return;setAskPassword(false);setKeyPassword('');setNotice(r?.message||t('Вход без пароля включён.'));await load();}catch(e:any){if(!alive.current)return;if(e instanceof ApiError&&e.status===403){setAskPassword(true);setNotice('');}else{const text=passkeyError(e);if(text)setNotice(text);}}finally{if(alive.current)setBusy(false);}}
 async function keyOff(){setBusy(true);setNotice('');try{for(const k of keys||[])await request('/auth/passkey-remove',{id:k.id});await writePasskeyNote('on',null);if(alive.current){setNotice(t('Вход без пароля выключен.'));await load();}}catch(e:any){if(alive.current&&!(e instanceof StaleSessionError)){setNotice(e instanceof ApiError?e.message:t('Нет связи. Попробуйте ещё раз.'));await load();}}finally{if(alive.current)setBusy(false);}}
 const choose=(allowed:boolean)=>permission&&act('/api/operations/ai-data-permission',{allowed,policyVersion:permission.policyVersion,expectedVersion:permission.version});
 const wide=(title:string,fn:()=>void,disabled=busy,danger=false)=><Btn title={title} onPress={fn} disabled={disabled} kind={danger?'danger':'line'}/>;
 const lead=(text:string)=><Text style={[a.note,{marginTop:12,marginHorizontal:4,fontSize:14,lineHeight:20}]}>{text}</Text>;
 const link=(title:string,path:string)=><Row icon="file" tint={tint} title={title} onPress={()=>void Linking.openURL(API_URL+path+'?from=app').catch(()=>undefined)}/>;
 const missing=(what:string)=><View>{lead(t('Не удалось загрузить {what}. Проверьте интернет.',{what}))}{wide(t('Повторить'),()=>void load(),loading)}</View>;
 const shown=!!notice&&<Text accessibilityRole="alert" style={[a.note,{marginTop:12,marginHorizontal:4}]}>{notice}</Text>;
 if(!state)return loading?<ThinkingLine style={s.meta} text={t('Загружаем…')}/>:<View><Text accessibilityRole="alert" style={s.error}>{loadError}</Text>{wide(t('Повторить'),()=>void load(),false)}</View>;
 const requested=state.deletion?.status==='requested',details=state.deletionDetails||{},reports:any[]=state.reports||[],deletions:any[]=state.deletions||[];
 const aiValue=!permission?'':permission.allowed?t('Включён'):permission.decided?t('Выключен'):t('Не выбрано');
 if(page==='devices'&&!sessions)return missing(t('список входов'));
 if(page==='ai'&&!permission)return missing(t('настройку ИИ'));
 // As the concept of the menu (MoonPay's devices): this device apart, the other sign-ins folded by kind (one row instead
 // of dozens of the same «Приложение»), and one red row to leave them all. A row opens its sign-ins with «Выйти».
 if(page==='devices'){const mine=(sessions||[]).filter(v=>v.current),others=(sessions||[]).filter(v=>!v.current),kindName=(k:string)=>k==='mobile'?t('Приложение'):t('Браузер');
  const kinds=['mobile','browser'].map(k=>({k,list:others.filter(v=>(v.kind==='mobile'?'mobile':'browser')===k)})).filter(g=>g.list.length);
  return <View>
  {keys&&<Group><SwitchRow icon={words.icon===menuIcons.fingerprint?'fingerprint':'face'} tint={tint} title={words.name} note={keys.length?t('Включён · {v}',{v:keys.map(k=>k.device).filter(Boolean).join(', ')||day(keys[0].createdAt)}):t('Входите без пароля')} checked={keys.length>0} disabled={busy} onChange={v=>void (v?keyOn():keyOff())}/>
   {keys.length>0&&!here&&!askPassword&&<Row icon="plus" tint={tint} title={t('Включить на этом телефоне')} onPress={()=>void keyOn()}/>}
   {askPassword&&<View style={[a.row,{gap:8}]}><TextInput accessibilityLabel={t('Пароль')} style={[s.field,{flex:1,marginTop:0}]} placeholder={t('Пароль от аккаунта')} value={keyPassword} onChangeText={setKeyPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="current-password" maxLength={128} editable={!busy} autoFocus onSubmitEditing={()=>{if(keyPassword&&!busy)void keyOn();}}/><Pressable accessibilityRole="button" disabled={busy||!keyPassword} onPress={()=>void keyOn()} style={[a.edit,(busy||!keyPassword)&&s.disabled]}><Text style={a.editText}>{t('Включить')}</Text></Pressable></View>}</Group>}
  {askPassword&&lead(t('Подтвердите паролем: вы вошли давно, а ключ будет открывать аккаунт без пароля.'))}
  {mine.length>0&&<Group title={t('Это устройство')}>{mine.map(v=><View key={v.kind+v.id} style={a.row}><RowIcon icon="key" tint={tint}/><Text style={[a.title,a.wide]}>{kindName(v.kind)}</Text><Text style={a.note}>{t('сейчас')}</Text></View>)}</Group>}
  <Group title={t('Другие входы')}>
   {kinds.map(g=><React.Fragment key={g.k}><Row icon="key" tint={tint} title={kindName(g.k)} note={t('до {v}',{v:day(Math.max(...g.list.map(v=>Number(v.expires_at)||0)))})} value={signIns(g.list.length)} open={kindOpen===g.k} onPress={()=>setKindOpen(v=>v===g.k?'':g.k)}/>
    {kindOpen===g.k&&g.list.map(v=><View key={v.kind+v.id} style={[a.row,{paddingLeft:48}]}><Text style={[a.note,a.wide]}>{t('Вход действует до {v}',{v:day(v.expires_at)})}</Text><Pressable accessibilityRole="button" accessibilityLabel={t('Выйти: {v}',{v:(v.kind==='mobile'?t('приложение'):t('браузер'))})} disabled={busy} onPress={()=>void act('/api/sessions',{action:'one',kind:v.kind,id:v.id})} style={[a.edit,busy&&s.disabled]}><Text style={a.editText}>{t('Выйти')}</Text></Pressable></View>)}
   </React.Fragment>)}
   {!kinds.length&&<View style={a.row}><Text style={a.note}>{t('Других входов нет.')}</Text></View>}
   {kinds.length>0&&<Row icon="logout" title={t('Выйти на всех других устройствах')} danger disabled={busy} onPress={()=>void act('/api/sessions',{action:'others'})}/>}
  </Group>
  <Text style={a.footnote}>{t('Забыли пароль — нажмите «Забыли пароль?» на экране входа, код придёт в Telegram.')}</Text>{shown}</View>;}
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
  {/* Board «Экраны старой версии» (2026-11-26): one line of what happens, what stands in the way as rows, what is kept
      folded into one row, and one swipe at the bottom that works only when nothing stands in the way. */}
  {lead(t('Удалим все ваши роли. Сначала проверим, что нет незавершённых дел.'))}
  {(details.blockers||[]).length>0&&<Group title={t('Сначала завершите')}>{details.blockers.map((b:any)=><View key={b.code} style={a.row}><RowIcon icon="alert" tint={tint}/><Text style={[a.title,a.wide]}>{tServer(b.label)}</Text></View>)}</Group>}
  {(details.groups||[]).length>0&&<Group space><Row icon="file" tint={tint} title={t('Что удалим и что останется')} open={kindOpen==='groups'} onPress={()=>setKindOpen(v=>v==='groups'?'':'groups')}/>{kindOpen==='groups'&&details.groups.map((g:any)=><View key={g.category} style={a.row}><RowIcon icon={groupIcons[g.category]||'file'} tint={tint}/><View style={a.wide}><Text style={a.title}>{groupNames[g.category]||g.category}</Text><Text style={a.note}>{(groupActions[g.action]||g.action)+(g.keep_until?' '+t('до {v}',{v:fullDay(g.keep_until)}):'')}</Text></View></View>)}</Group>}
  <View style={{marginTop:24}}><SwipeConfirm label={(details.blockers||[]).length?t('Удаление станет доступно после дел'):t('Проведите: запросить удаление')} disabled={busy||loading||(details.blockers||[]).length>0} onConfirm={()=>void act('/api/operations/safety/deletion',{action:'request'})}/></View></>}
  <Group space>{link(t('Что удаляется и что остаётся'),'/data-deletion')}</Group>{shown}</View>;
 return <View>
  <Group><Row icon="key" tint={tint} title={t('Вход и устройства')} value={sessions?(sessions.length>1?t('это и ещё {n}',{n:sessions.length-1}):t('только это')):undefined} onPress={()=>go('devices')}/><Row icon="sparkles" tint={tint} title={t('ИИ-помощник')} value={aiValue} onPress={()=>go('ai')}/>{reports.length>0&&<Row icon="flag" tint={tint} title={t('Мои жалобы')} value={reports.length} onPress={()=>go('reports')}/>}</Group>
  <Group space>{link(t('Политика конфиденциальности'),'/privacy')}{link(t('Условия сервиса'),'/terms')}</Group>
  {admin&&<Group space><Row icon="alert" tint={tint} title={t('Запросы на удаление')} value={state.deletionTotal||deletions.length||t('нет')} onPress={()=>go('requests')}/></Group>}
  {/* The way out is a quiet black row of its own, as Uber's: red waits for the last step. */}<Group space><Row icon="trash" tint={tint} title={t('Удалить аккаунт')} value={requested?t('запрос отправлен'):undefined} onPress={()=>go('delete')}/></Group>
 </View>;
}
