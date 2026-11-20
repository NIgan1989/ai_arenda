import {L,plural,t} from '../../lib/i18n';
import {AiJournal,type JournalEntry} from './AiJournal';
import type {JournalOpen} from '../../lib/ai-move-marks';
import {journalToday} from '../../lib/ai-move-marks';
import {ThinkingLine} from './Thinking';
import {NativeAccountSafety,safetyTitles,type SafetyPage} from './AccountSafety';
import React,{useEffect,useState} from 'react';
import {View,Text,TextInput,Pressable,Linking} from 'react-native';
import {ProfileEditor} from './ProfileEditor';
import {LangSwitch} from './LangSwitch';
import {Photo} from './ListingMedia';
import {Choice,Group,Row,RowIcon,SwitchRow,a,menuInk,type MenuIcon} from './AccountRows';
import {ProfileRing} from './ProfileRing';
import {experienceFor,joinTitle} from '../../lib/role-experience';
import {ReliabilityBadge,reliabilityHints} from './Reliability';
import {ReliabilityObjection} from './ReliabilityObjection';
import {NativeTelegram} from './NativeTelegram';
import {NativeAutopilotPlan} from './AutopilotPlan';
import {NativeDecisionRules} from './DecisionRules';
import {NoticeList} from './Notices';
import {eventsToday,roleEvents} from '../../lib/notice-feed';
import {request,API_URL} from './api';
import {roleNames,rolePages} from './RoleEntry';
import {Shift} from './Shift';
import {OwnerAnalytics,loadAnalytics,shortTenge} from './OwnerAnalytics';
import {PayoutForm,phoneText,type Payout,type PendingPayout} from './PayoutDetails';
import {AdminFactor} from './AdminFactor';
import {ServiceBilling} from './ServiceBilling';
import {AutopilotWeek} from './AutopilotWeek';
import {s,C} from './styles';
import type {Row as Data,Role} from './model';
type Row_=Data;
const banks:[string,string][]=L([['undecided','Не выбран'],['kaspi','Kaspi'],['halyk','Halyk Bank']]);
// Short role names for the switch at the top of the menu, as on the site.
const shortRole:Record<Role,string>=L({guest:'Гость',owner:'Владелец',cleaner:'Исполнитель'});
// The menu is short: who I am, three rows about what goes on (notices, the autopilot, my profile), the sections of
// my role, and settings, help and the way out. Each row shows its current value and opens its own screen.
// notices: only what needs the person or concerns their money (lib/notice-feed.ts).
// autopilot: everything the AI did alone (its journal) and what it may decide (the rules; the performer's plan);
// for the owner, on top, the week of the plan in numbers (AutopilotWeek.tsx).
// profile: what others read about me and how reliable I look to them.
// money: the owner's business numbers, «Доходы» (OwnerAnalytics.tsx); the row shows the month's net profit.
// settings: channels, the bank, privacy, and inside it the data and safety pages and joining another role.
type MenuView=''|'money'|'notices'|'autopilot'|'profile'|'settings'|'safety'|`safety:${Exclude<SafetyPage,''>}`|'shift'|'payout'|'billing';
export function AccountControl({role:active,staffPlaces=0,notices,onOpenNotice,start,onChanged,onSignedOut,onSwitchRole,onPickRole,onJoinRole,onAskAdministrator,onLogout,onOpenPage,onOpenEntry}:{staffPlaces?:number;notices?:Data[];onOpenNotice?:(notice:Data)=>(()=>void)|undefined;start?:'notices';onPickRole?:(role:Role)=>void;onJoinRole?:(role:Role)=>void;onAskAdministrator?:()=>void;onOpenPage?:(id:string)=>void;onOpenEntry?:(open:JournalOpen)=>(()=>void)|undefined;role:Role;onEdit:()=>void;onChanged?:()=>Promise<unknown>;onSignedOut:(result?:Row_)=>void|Promise<void>;onSwitchRole?:()=>void;onLogout?:()=>void}){
 const [view,setView]=useState<MenuView>(start||''),[editing,setEditing]=useState(false),[readUpTo,setReadUpTo]=useState(0);
 // Every opening of «Уведомления» marks what is there as read: the counter in the menu then shows only what came after.
 // A failed mark is not repeated on its own; the next opening sends it again.
 useEffect(()=>{if(view!=='notices')return;setReadUpTo(Math.max(0,...(notices||[]).map(n=>Number(n.created_at)||0)));request('/api/notifications',{}).catch(()=>{});},[view]); // eslint-disable-line react-hooks/exhaustive-deps
 const [account,setAccount]=useState<Row_|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[users,setUsers]=useState<Row_|null>(null),[role,setRole]=useState(''),[search,setSearch]=useState(''),[finding,setFinding]=useState(false);
 // «Реквизиты для оплаты» (PayoutDetails.tsx): where guests and customers transfer money directly.
 const [payout,setPayout]=useState<Payout|null>(null),[payoutPending,setPayoutPending]=useState<PendingPayout|null>(null);
 // The owner's row «Доходы» shows the last 30 days' net profit; a failure leaves the row without a value.
 const [netMonth,setNetMonth]=useState<number|null>(null);
 useEffect(()=>{if(active!=='owner')return;let live=true;loadAnalytics('month').then(r=>{if(live)setNetMonth(r.money.net);}).catch(()=>{});return()=>{live=false;};},[active]);
 useEffect(()=>{let live=true;request('/api/account').then(v=>{if(live){setAccount(v);setPayout(v.payout||null);setPayoutPending(v.payoutPending||null);}}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[]);
 const button=(title:string,fn:()=>void,disabled=busy)=><Pressable accessibilityRole="button" disabled={disabled} onPress={fn} style={[s.button,s.secondary,disabled&&s.disabled]}><Text style={[s.buttonText,s.secondaryText]}>{title}</Text></Pressable>;
 // Instant save: show the new value at once, roll back if the server refuses.
 async function instant(change:(v:Row_)=>Row_,send:()=>Promise<unknown>){if(busy||!account)return;const before=account;setBusy(true);setError('');setMessage('');setAccount(change(account));try{await send();setAccount(await request('/api/account'));setMessage(t('Сохранено.'));}catch(e:any){setAccount(before);setError(e.message);}finally{setBusy(false);}}
 const settings=(patch:Row_)=>instant(v=>({...v,settings:{...v.settings,...patch}}),()=>request('/api/account',{paymentProvider:patch.payment_provider??account!.settings.payment_provider,paymentNotifications:!!(patch.payment_notifications??account!.settings.payment_notifications),expectedVersion:account!.settings.version}));
 async function list(page=0){setBusy(true);setError('');try{setUsers(await request('/api/admin/users?role='+encodeURIComponent(role)+'&search='+encodeURIComponent(search)+'&page='+page));}catch(e:any){setError(e.message);}finally{setBusy(false);}}
 if(!account)return <View>{!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}<ThinkingLine style={s.meta} text={t('Загружаю профиль…')}/></View>;
 const p=account.profile||{},worker=active==='cleaner',owner=active==='owner';let roles:Role[]=[];try{roles=JSON.parse(p.roles||'[]');}catch{}
 const filled=[p.name,p.city,p.avatar_id,p.bio,p.languages,...(worker?[p.districts,p.experience,p.availability]:[])],completion=Math.round(filled.filter(Boolean).length/filled.length*100);
 const steps=[!p.avatar_id&&t('Добавьте фото профиля'),!p.bio&&(worker?t('Опишите свою работу и услуги'):owner?t('Расскажите, как вы принимаете гостей'):t('Добавьте пару слов о себе для владельцев')),!p.languages&&t('Укажите языки общения')].filter(Boolean) as string[];
 const ink=menuInk(active),experience=experienceFor(active);
 const edit=()=>setEditing(true),item=(icon:MenuIcon,title:string,value:any)=><Row icon={icon} tint={ink} title={title} value={value||t('Добавить')} empty={!value} onPress={edit}/>;
 const privacy=(patch:Data,body:Data)=>instant(o=>({...o,profile:{...o.profile,...patch}}),()=>request('/api/profile/edit',{name:p.name,contact:p.contact,city:p.city,districts:p.districts,experience:p.experience,availability:p.availability,avatarId:p.avatar_id||null,workStatus:p.work_status||'available',expectedVersion:p.profile_version||0,...body}));
 const work=(v:boolean)=>instant(o=>({...o,profile:{...o.profile,work_status:v?'available':'away'}}),async()=>{await request('/api/profile/edit',{name:p.name,contact:p.contact,city:p.city,districts:p.districts,experience:p.experience,availability:p.availability,avatarId:p.avatar_id||null,workStatus:v?'available':'away',expectedVersion:p.profile_version||0});await onChanged?.();});
 if(editing)return <ProfileEditor profile={p} onClose={()=>setEditing(false)} onSaved={async()=>{setAccount(await request('/api/account'));setMessage(t('Профиль сохранён.'));await onChanged?.();}}/>;
 const journal:JournalEntry[]=account.aiJournal||[],today=journalToday(journal,account.serverTime||0);
 const go=(to:MenuView)=>{setMessage('');setError('');setView(to);};
 // Joining another role is offered in the settings, as a thing done once.
 const join=onJoinRole?(['guest','owner','cleaner'] as Role[]).filter(v=>v!==active&&!roles.includes(v)):[];
 const titles={payout:t('Реквизиты для оплаты'),billing:t('Оплата услуг'),money:t('Доходы'),shift:t('Смена'),notices:t('Уведомления'),autopilot:t('Автопилот'),profile:t(experience.profileTitle),settings:t('Настройки'),safety:t('Данные и безопасность')};
 const clock=account.serverTime||Date.now()/1000,events=roleEvents(notices,active),eventsNow=eventsToday(events.filter(n=>!Number(n.read)&&Number(n.created_at)>readUpTo),clock),trust=String(account.reliability?.label||'').replace(/^Надёжность\s+/,'');
 const hint=steps.length>0&&<Pressable accessibilityRole="button" onPress={edit} style={a.next}><RowIcon icon="sparkles" tint={C.aiTo}/><View style={{flex:1}}><Text style={a.title}>{steps[0]}</Text>{steps.length>1&&<Text style={a.note}>{t('и ещё {n} {word} до полного профиля',{n:steps.length-1,word:plural(steps.length-1,['шаг','шага','шагов'],['step','steps'],'қадам')})}</Text>}</View><Text style={[a.chevron,{color:C.ink}]}>›</Text></Pressable>;
 return <View>
  {!!view&&(()=>{const sub=view.startsWith('safety:'),title=sub?safetyTitles[view.slice(7) as Exclude<SafetyPage,''>]:titles[view as keyof typeof titles];return <View style={{flexDirection:'row',alignItems:'center',gap:4,minHeight:44,marginBottom:4}}><Pressable accessibilityRole="button" accessibilityLabel={sub?t('Назад: Данные и безопасность'):view==='safety'||view==='payout'||view==='billing'?t('Назад: Настройки'):t('Назад в меню')} hitSlop={8} onPress={()=>go(sub?'safety':view==='safety'||view==='payout'||view==='billing'?'settings':'')} style={{width:44,height:44,marginLeft:-12,alignItems:'center',justifyContent:'center'}}><Text style={{fontSize:28,lineHeight:32,color:C.ink}}>‹</Text></Pressable><Text accessibilityRole="header" style={[a.name,{fontSize:22,lineHeight:28,flex:1}]}>{title}</Text></View>;})()}
  {!view&&<><View style={a.head}><ProfileRing photoId={p.avatar_id} name={p.name} progress={completion/100} ink={ink} onPress={edit}/><View style={{flex:1,minWidth:0}}><Text style={a.name}>{p.name||t('Мой профиль')}</Text><Text style={s.meta}>{p.city||t('Город не указан')} · {completion<100?t('профиль на {completion}%',{completion}):t('профиль заполнен')}</Text></View><Pressable accessibilityRole="button" onPress={edit} style={a.edit}><Text style={a.editText}>{t('Изменить')}</Text></Pressable></View>
  {roles.length>1&&!!onPickRole&&<View accessibilityRole="tablist" accessibilityLabel={t('Роль')} style={[a.seg,{marginTop:16,padding:4,borderRadius:12}]}>{(['guest','owner','cleaner'] as Role[]).filter(r=>roles.includes(r)).map(r=><Pressable key={r} accessibilityRole="tab" accessibilityState={{selected:r===active}} onPress={()=>{if(r!==active)onPickRole(r);}} style={[a.segItem,{flex:1,minHeight:40,alignItems:'center'},r===active&&a.segOn]}><Text style={[a.segText,{fontWeight:'600'},r===active&&a.segTextOn]}>{shortRole[r]}</Text></Pressable>)}</View>}</>}
  {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}{!!message&&<Text accessibilityLiveRegion="polite" style={a.saved}>{message}</Text>}
  {!view&&<Group space>{worker&&<SwitchRow icon="briefcase" tint={ink} title={t('Принимаю предложения')} note={/^(Принимает|Не принимает)/.test(account.workerStatus?.label||'')?undefined:account.workerStatus?.label} checked={(p.work_status||'available')==='available'} disabled={busy} onChange={work}/>}{staffPlaces>0&&<Row icon="key" tint={ink} title={t('Смена')} value={staffPlaces===1?t('гости сегодня'):t('объектов: {staffPlaces}',{staffPlaces})} onPress={()=>go('shift')}/>}{owner&&<Row icon="chart" tint={ink} title={t('Доходы')} value={netMonth===null?undefined:t('{v} за месяц',{v:((netMonth>0?'+':'')+shortTenge(netMonth))})} onPress={()=>go('money')}/>}<Row icon="bell" tint={ink} title={t('Уведомления')} value={eventsNow?t('{eventsNow} новых',{eventsNow}):undefined} onPress={()=>go('notices')}/><Row icon="sparkles" tint={ink} title={t('Автопилот')} value={today?t('ИИ: {today} сегодня',{today}):undefined} onPress={()=>go('autopilot')}/><Row icon="user" tint={ink} title={t(experience.profileTitle)} value={completion<100?completion+'%':trust||t('заполнен')} onPress={()=>go('profile')}/></Group>}
  {view==='shift'&&<Shift/>}
  {view==='payout'&&active!=='guest'&&<PayoutForm initial={payout} pending={payoutPending} role={active} onSaved={(v,next)=>{if(v)setPayout(v);setPayoutPending(next);void onChanged?.();}}/>}
  {view==='billing'&&active!=='guest'&&<ServiceBilling key={'billing:'+active} role={active}/>}
  {view==='money'&&<OwnerAnalytics tint={ink}/>}
  {view==='notices'&&<Group><NativeTelegram tint={ink} invite/><NoticeList list={events} now={clock} onOpen={onOpenNotice}/></Group>}
  {view==='autopilot'&&<>{owner&&<View style={{marginBottom:16}}><AutopilotWeek/></View>}<Group title={t('Что сделал ИИ')}><AiJournal entries={journal} now={clock} onOpen={onOpenEntry}/></Group>{worker?<NativeAutopilotPlan key={'plan:'+active} role="cleaner"/>:<NativeDecisionRules key={'rules:'+active} tint={ink}/>}</>}
  {view==='profile'&&<>{hint}<Group space={!!hint}>{item('user',t('О себе'),p.bio)}{item('languages',t('Языки общения'),p.languages)}{item('pin',t(experience.cityLabel),p.city)}{worker&&<>{item('map',t('Районы работы'),p.districts)}{item('clock',t('График'),p.availability)}{item('badge',t('Опыт и услуги'),p.experience)}</>}{item('phone',t('Телефон'),p.contact)}</Group>{!!account.reliability&&<><View style={{height:16}}/><ReliabilityBadge value={account.reliability} title={owner?t('Как вас видят гости'):t('Как вас видят владельцы')}/><Group title={t('Как повысить надёжность')}>{(reliabilityHints[active]||[]).map(h=><View key={h} style={a.row}><RowIcon icon="check" tint={ink}/><Text style={[a.title,a.wide]}>{h}</Text></View>)}</Group><ReliabilityObjection role={active}/></>}</>}
  {view==='settings'&&<>
   <Group title={t('Куда сообщать')}><NativeTelegram tint={ink}/><SwitchRow icon="wallet" tint={ink} title={t('О расчётах и выплатах')} checked={!!account.settings.payment_notifications} disabled={busy} onChange={v=>settings({payment_notifications:v?1:0})}/></Group>
   <Text style={a.footnote}>{t('Сообщаем только то, что ждёт вас или касается денег. Что ИИ сделал сам, записано в «Автопилот».')}</Text>
   {active==='guest'?<Text style={a.footnote}>{t('Вы платите владельцу напрямую по реквизитам из брони. Сервис деньги за жильё не принимает.')}</Text>:<><Group title={t('Расчёты')}><Row icon="bank" tint={ink} title={t('Реквизиты для оплаты')} value={payout?phoneText(payout.phone):t('не указаны')} onPress={()=>go('payout')}/><Row icon="wallet" tint={ink} title={t('Оплата услуг')} value={t('карта и списания')} onPress={()=>go('billing')}/></Group>
   <Text style={a.footnote}>{owner?t('Гости переводят оплату прямо вам на Kaspi. Сервис деньги гостей не принимает.'):t('Заказчики переводят оплату за уборку прямо вам на Kaspi.')}</Text></>}
   <Group title={t('Приватность')}><Choice icon="eye" tint={ink} title={t('Моё фото')} value={p.avatar_visibility||'participants'} options={[['participants',t('Участникам')],['self',t('Только мне')]]} disabled={busy} onChange={v=>privacy({avatar_visibility:v},{avatarVisibility:v})}/><SwitchRow icon="dot" tint={ink} title={t('Показывать, что я в сети')} checked={p.show_presence!==0} disabled={busy} onChange={v=>privacy({show_presence:v?1:0},{showPresence:v})}/><SwitchRow icon="read" tint={ink} title={t('Отметки прочтения')} checked={p.show_receipts!==0} disabled={busy} onChange={v=>privacy({show_receipts:v?1:0},{showReceipts:v})}/></Group>
   <Text style={a.footnote}>{t('Если скрыть своё, вы тоже не увидите «в сети» и прочтение у собеседника.')}</Text>
   <Group title={t('Аккаунт')}><Row icon="lock" tint={ink} title={t('Данные и безопасность')} onPress={()=>go('safety')}/>{join.map(v=><Row key={v} icon="plus" tint={ink} title={t(joinTitle(v))} onPress={()=>onJoinRole?.(v)}/>)}</Group></>}
  {(view==='safety'||view.startsWith('safety:'))&&<NativeAccountSafety tint={ink} role={active} admin={!!account.adminVerified} page={view.startsWith('safety:')?view.slice(7) as SafetyPage:''} go={p=>go(p?`safety:${p}` as MenuView:'safety')} onSignedOut={onSignedOut}/>}
  {!view&&<>{(()=>{/* The guest's search, its results and the bookings live in the sheet of the map; so do the owner's objects and the cleaner's search for jobs. */const more=onOpenPage?rolePages[active].filter(v=>!['map','account','chats','overview',...(active==='guest'?['catalog','bookings','calendar']:active==='owner'?['properties']:['jobs'])].includes(v.id)):[];return more.length>0&&<Group title={t('Разделы')}>{more.map(v=><Row key={v.id} icon={v.id as MenuIcon} tint={ink} title={v.title} onPress={()=>onOpenPage?.(v.id)}/>)}</Group>;})()}
  <Group title={t('Язык')}><View style={[a.row,{paddingHorizontal:8}]}><View style={{flex:1}}><LangSwitch label={t('Язык')}/></View></View></Group>
  <Group space><Row icon="sliders" tint={ink} title={t('Настройки')} onPress={()=>go('settings')}/>{!!onAskAdministrator&&<Row icon="messages" tint={ink} title={t('Помощь')} value={t('ИИ-администратор')} onPress={onAskAdministrator}/>}{account.platformAdmin&&<Row icon="shield" tint={ink} title={t('Управление сервисом')} note={t('Пользователи, проверки, обращения')} onPress={()=>void Linking.openURL(API_URL+'/admin').catch(()=>undefined)}/>}{!onPickRole&&!!onSwitchRole&&roles.length>1&&<Row icon="users" tint={ink} title={t('Сменить роль')} value={shortRole[active]} onPress={onSwitchRole}/>}{!!onLogout&&<Row icon="logout" title={t('Выйти из аккаунта')} danger onPress={onLogout}/>}</Group>
  {account.platformAdmin&&!account.adminVerified&&<Group space><AdminFactor tint={ink} onVerified={()=>void request('/api/account').then(setAccount).catch(()=>undefined)}/></Group>}
  {account.platformAdmin&&account.adminVerified&&<Group space><Row icon="users" tint={ink} title={t('Поиск пользователей')} open={finding} onPress={()=>setFinding(v=>!v)}/>{finding&&<View style={a.body}><Text style={s.meta}>{t('Поиск пользователей доступен только администратору. Просмотр записывается в журнал.')}</Text><Choice title={t('Роль')} value={role} options={[['',t('Все')],['guest',t('Гости')],['owner',t('Владельцы')],['cleaner',t('Исполнители')]]} onChange={setRole}/><Text style={s.fieldLabel}>{t('Имя или контакт')}</Text><TextInput accessibilityLabel={t('Имя или контакт')} value={search} onChangeText={setSearch} maxLength={100} style={s.field}/>{button(t('Показать пользователей'),()=>list())}{users&&<><Text style={s.meta}>{t('Найдено: {n}',{n:users.total})}</Text>{users.users.map((u:Row_)=><View style={s.card} key={u.id}><Text style={s.eventTitle}>{u.name}</Text><Text style={s.meta}>{u.roles.map((r:Role)=>roleNames[r]).join(', ')}{'\n'}{u.city} · {u.contact}{'\n'}{t('Объекты: {properties} · брони: {bookings} · уборки: {jobs}',{properties:u.property_count,bookings:u.booking_count,jobs:u.assignment_count})}</Text></View>)}<View style={{flexDirection:'row',gap:8}}><View style={{flex:1}}>{button(t('Назад'),()=>list(users.page-1),busy||users.page===0)}</View><View style={{flex:1}}>{button(t('Далее'),()=>list(users.page+1),busy||(users.page+1)*users.limit>=users.total)}</View></View></>}</View>}</Group>}
  {roles.length>1&&<Text style={a.footnote}>{t('Имя и фото общие для всех ваших ролей.')}</Text>}</>}
 </View>;
}
