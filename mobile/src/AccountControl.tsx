import {L,dateText,plural,t} from '../../lib/i18n';
import {AiJournal,type JournalEntry} from './AiJournal';
import {OwnerAutopilot} from './OwnerAutopilot';
import type {JournalOpen} from '../../lib/ai-move-marks';
import {journalToday} from '../../lib/ai-move-marks';
import {ThinkingLine} from './Thinking';
import {NativeAccountSafety,safetyTitles,type SafetyPage} from './AccountSafety';
import React,{useEffect,useState} from 'react';
import {View,Text,Pressable,StyleSheet,Image} from 'react-native';
import {ProfileEditor} from './ProfileEditor';
import {LangSwitch} from './LangSwitch';
import {useLang} from './lang';
import {LANGS} from '../../lib/i18n';
import {Photo} from './ListingMedia';
import {Choice,FlatMenu,Group,Row,RowIcon,SwitchRow,a,menuIcons,menuInk,type MenuIcon} from './AccountRows';
import {ProfileRing} from './ProfileRing';
import {experienceFor,joinTitle} from '../../lib/role-experience';
import {reliabilityHints} from './Reliability';
import {tLine} from '../../lib/i18n';
import {ReliabilityObjection} from './ReliabilityObjection';
import {NativeTelegram} from './NativeTelegram';
import {NativePush} from './NativePush';
import {NativeAutopilotPlan} from './AutopilotPlan';
import {NativeDecisionRules} from './DecisionRules';
import {NoticeList,type NoticeWaiting} from './Notices';
import {roleEvents} from '../../lib/notice-feed';
import {request} from './api';
import {rolePages} from './RoleEntry';
import {Shift} from './Shift';
import {OwnerAnalytics,loadAnalytics,shortTenge} from './OwnerAnalytics';
import {CleanerEarnings,cleanerWeek} from './CleanerEarnings';
import {IdentityDocs} from './IdentityDocs';
import {PhoneCheck} from './PhoneCheck';
import {PayoutForm,type Payout,type PendingPayout} from './PayoutDetails';
import {AdminHub} from './admin/AdminHub';
import {ServiceBilling} from './ServiceBilling';
import {InviteOwners} from './InviteOwners';
import {s,C,type} from './styles';
import {T} from './tokens';
import {LABELS as TRUST_LABELS} from './Reliability';
import type {Row as Data,Role} from './model';
type Row_=Data;
const money=(n:number)=>new Intl.NumberFormat('ru-RU').format(n||0).replace(/\s/g,' ')+' ₸';
const banks:[string,string][]=L([['undecided','Не выбран'],['kaspi','Kaspi'],['halyk','Halyk Bank']]);
// Short role names for the switch at the top of the menu, as on the site.
const shortRole:Record<Role,string>=L({guest:'Гость',owner:'Владелец',cleaner:'Исполнитель'});
// The menu is short: who I am, two rows about what goes on (the autopilot, my profile), the sections of my role, and
// settings, help and the way out. Each row shows its current value and opens its own screen.
// notices: only what needs the person or concerns their money (lib/notice-feed.ts). They open from the bell over the
// map (MapNoticesButton in App.tsx), not from a row of the menu: the sheet is then called «Уведомления» and its ✕
// returns to the map, so the page has no head of its own.
// autopilot: everything the AI did alone (its journal) and what it may decide (the rules; the performer's plan);
// for the owner, its own screen with the state, the week and two tabs (OwnerAutopilot.tsx).
// profile: what others read about me and how reliable I look to them.
// money: the owner's business numbers, «Доходы» (OwnerAnalytics.tsx); the row shows the month's net profit.
// invite: «Пригласить владельца» (InviteOwners.tsx), a month without the commission for both; a link opens it with the code.
// settings: channels, the bank, privacy, and inside it the data and safety pages and joining another role.
// The names of the menu's pages, as their heads show them.
const headTitles=(role:Role)=>({payout:t('Реквизиты для оплаты'),billing:t('Оплата услуг'),money:role==='cleaner'?t('Заработок'):t('Доходы'),shift:t('Смена'),notices:t('Уведомления'),autopilot:t('Автопилот'),profile:t(experienceFor(role).profileTitle),settings:t('Настройки'),safety:t('Данные и безопасность'),invite:t('Пригласить владельца')});
type MenuView=''|'money'|'notices'|'autopilot'|'profile'|'settings'|'safety'|`safety:${Exclude<SafetyPage,''>}`|'shift'|'payout'|'billing'|'admin'|'invite';
export type MenuHead={title:string;label:string;back:()=>void}|null;
export function AccountControl({onHead,waiting=[],jobs=[],userId='',role:active,staffPlaces=0,regularPlaces=0,notices,onOpenNotice,start,onChanged,onSignedOut,onSwitchRole,onPickRole,onRoles,onJoinRole,onAskAdministrator,onLogout,onOpenPage,onOpenEntry,onLeftNotices,inviteCode}:{inviteCode?:string;onHead?:(head:MenuHead)=>void;waiting?:NoticeWaiting[];jobs?:Data[];userId?:string;staffPlaces?:number;regularPlaces?:number;notices?:Data[];onOpenNotice?:(notice:Data)=>(()=>void)|undefined;start?:'notices'|'billing'|'payout'|'money'|'autopilot'|'invite'|'profile';onPickRole?:(role:Role)=>void;onRoles?:()=>void;onJoinRole?:(role:Role)=>void;onAskAdministrator?:()=>void;onOpenPage?:(id:string)=>void;onOpenEntry?:(open:JournalOpen)=>(()=>void)|undefined;role:Role;onEdit:()=>void;onChanged?:()=>Promise<unknown>;onSignedOut:(result?:Row_)=>void|Promise<void>;onSwitchRole?:()=>void;onLogout?:()=>void;onLeftNotices?:()=>void}){
 const [view,setView]=useState<MenuView>(start||''),[editing,setEditing]=useState(false),[idOpen,setIdOpen]=useState(false),[phoneOpen,setPhoneOpen]=useState(false),[readUpTo,setReadUpTo]=useState(0),[langOpen,setLangOpen]=useState(false),[channelsOpen,setChannelsOpen]=useState(false),lang=useLang();
 // What was new when «Уведомления» opened keeps its dot while the page is open, though the opening marks it read.
 const [freshIds,setFreshIds]=useState<string[]>([]);
 // Every opening of «Уведомления» marks what is there as read: the counter in the menu then shows only what came after.
 // A failed mark is not repeated on its own; the next opening sends it again.
 useEffect(()=>{if(view!=='notices')return;setFreshIds((notices||[]).filter(n=>!Number(n.read)&&Number(n.created_at)>readUpTo).map(n=>String(n.id)));setReadUpTo(Math.max(0,...(notices||[]).map(n=>Number(n.created_at)||0)));request('/api/notifications',{}).catch(()=>{});},[view]); // eslint-disable-line react-hooks/exhaustive-deps
 const [account,setAccount]=useState<Row_|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 // «Реквизиты для оплаты» (PayoutDetails.tsx): where guests and customers transfer money directly.
 const [payout,setPayout]=useState<Payout|null>(null),[payoutPending,setPayoutPending]=useState<PendingPayout|null>(null);
 // The owner's row «Доходы» shows the last 30 days' net profit; a failure leaves the row without a value.
 const [netMonth,setNetMonth]=useState<number|null>(null);
 // «Оплата услуг» in short (ServiceBilling.tsx): without a card and with something accrued, the menu asks for the card
 // in one row, so the person does not have to find it in the settings. Read again on every return to the menu.
 const [bill,setBill]=useState<{due:number;card:{mask:string}|null;payBy:number|null;paused:boolean}|null>(null);
 useEffect(()=>{if(active==='guest'||view)return;let live=true;request('/api/operations/service-billing/state',undefined,undefined,undefined,active).then(v=>{if(live)setBill(v);}).catch(()=>{});return()=>{live=false;};},[active,view]);
 useEffect(()=>{if(active!=='owner')return;let live=true;loadAnalytics('month').then(r=>{if(live)setNetMonth(r.money.net);}).catch(()=>{});return()=>{live=false;};},[active]);
 useEffect(()=>{let live=true;request('/api/account').then(v=>{if(live){setAccount(v);setPayout(v.payout||null);setPayoutPending(v.payoutPending||null);}}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[]);
 // Instant save: show the new value at once, roll back if the server refuses.
 async function instant(change:(v:Row_)=>Row_,send:()=>Promise<unknown>){if(busy||!account)return;const before=account;setBusy(true);setError('');setMessage('');setAccount(change(account));try{await send();setAccount(await request('/api/account'));setMessage(t('Сохранено.'));}catch(e:any){setAccount(before);setError(e.message);}finally{setBusy(false);}}
 const settings=(patch:Row_)=>instant(v=>({...v,settings:{...v.settings,...patch}}),()=>request('/api/account',{paymentProvider:patch.payment_provider??account!.settings.payment_provider,paymentNotifications:!!(patch.payment_notifications??account!.settings.payment_notifications),expectedVersion:account!.settings.version}));
 // One head per sheet: the open page's name and «‹» go up into the sheet's head (App.tsx), the page draws none.
 // The profile editor sets its own (it has pages inside); the menu itself and «Уведомления» have the sheet's.
 const sub=view.startsWith('safety:'),backTo:MenuView=sub?'safety':view==='safety'||view==='payout'||view==='billing'?'settings':'';
 const headTitle=!view||view==='notices'?'':sub?safetyTitles[view.slice(7) as Exclude<SafetyPage,''>]:headTitles(active)[view as keyof ReturnType<typeof headTitles>]||'';
 const headLabel=sub?t('Назад: Данные и безопасность'):backTo==='settings'?t('Назад: Настройки'):t('Назад в меню');
 useEffect(()=>{if(!onHead||editing||view==='admin')return;onHead(headTitle?{title:headTitle,label:headLabel,back:()=>{setMessage('');setError('');setView(backTo);}}:null);},[onHead,headTitle,editing,backTo,view]); // eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>()=>onHead?.(null),[]); // eslint-disable-line react-hooks/exhaustive-deps
 // Without the profile one quiet line: the reason when the server answered, or «Загружаю профиль…» (the line about the
 // connection is already over the screen, OfflineNotice.tsx, so it is not said twice).
 if(!account)return <View>{error?<Text accessibilityRole="alert" style={s.meta}>{error}</Text>:<ThinkingLine style={s.meta} text={t('Загружаем профиль…')}/>}</View>;
 const p=account.profile||{},worker=active==='cleaner',owner=active==='owner';let roles:Role[]=[];try{roles=JSON.parse(p.roles||'[]');}catch{}
 const filled=[p.name,p.city,p.avatar_id,p.bio,p.languages,...(worker?[p.districts,p.experience,p.availability]:[])],completion=Math.round(filled.filter(Boolean).length/filled.length*100);
 const steps=[!p.avatar_id&&t('Добавьте фото профиля'),!p.bio&&(worker?t('Опишите свою работу и услуги'):owner?t('Расскажите, как вы принимаете гостей'):t('Добавьте пару слов о себе для владельцев')),!p.languages&&t('Укажите языки общения')].filter(Boolean) as string[];
 const ink=menuInk(active),experience=experienceFor(active);
 const edit=()=>setEditing(true);
 // A line of «О вас», as Airbnb's personal info: the name, the value under it, and «Изменить» or «Добавить» on the right.
 const info=(title:string,value:any)=><Pressable key={title} accessibilityRole="button" accessibilityLabel={title+'. '+(value?t('Изменить'):t('Добавить'))} onPress={edit} style={({pressed})=>[m.info,pressed&&a.pressed]}><View style={a.wide}><Text style={a.title}>{title}</Text><Text numberOfLines={2} style={a.note}>{value||t('Не указано')}</Text></View><Text style={m.link}>{value?t('Изменить'):t('Добавить')}</Text></Pressable>;
 const privacy=(patch:Data,body:Data)=>instant(o=>({...o,profile:{...o.profile,...patch}}),()=>request('/api/profile/edit',{name:p.name,contact:p.contact,city:p.city,districts:p.districts,experience:p.experience,availability:p.availability,avatarId:p.avatar_id||null,workStatus:p.work_status||'available',expectedVersion:p.profile_version||0,...body}));
 const work=(v:boolean)=>instant(o=>({...o,profile:{...o.profile,work_status:v?'available':'away'}}),async()=>{await request('/api/profile/edit',{name:p.name,contact:p.contact,city:p.city,districts:p.districts,experience:p.experience,availability:p.availability,avatarId:p.avatar_id||null,workStatus:v?'available':'away',expectedVersion:p.profile_version||0});await onChanged?.();});
 if(editing)return <ProfileEditor onHead={onHead} profile={p} onClose={()=>setEditing(false)} onSaved={async()=>{setAccount(await request('/api/account'));setMessage(t('Профиль сохранён.'));await onChanged?.();}}/>;
 const journal:JournalEntry[]=account.aiJournal||[],today=journalToday(journal,account.serverTime||0);
 // A notice about service fees leads from the notices to «Оплата услуг»: the sheet is the menu again (onLeftNotices).
 const go=(to:MenuView)=>{setMessage('');setError('');if(view==='notices'&&to!=='notices')onLeftNotices?.();setView(to);};
 // «Управление сервисом» is its own stack of pages in this sheet (mobile/src/admin): it puts its own head.
 if(view==='admin')return <FlatMenu.Provider value><AdminHub verified={!!account.adminVerified} onVerified={()=>void request('/api/account').then(setAccount).catch(()=>undefined)} onHead={onHead} onExit={()=>go('')}/></FlatMenu.Provider>;
 // Joining another role is offered in the settings, as a thing done once.
 const join=onJoinRole?(['guest','owner','cleaner'] as Role[]).filter(v=>v!==active&&!roles.includes(v)):[];
 const titles=headTitles(active);
 const clock=account.serverTime||Date.now()/1000,events=roleEvents(notices,active),trust=String(account.reliability?.label||'').replace(/^Надёжность\s+/,'');
 const hint=steps.length>0&&<Pressable accessibilityRole="button" onPress={edit} style={a.next}><RowIcon icon="shanyrak"/><View style={{flex:1}}><Text style={a.title}>{steps[0]}</Text>{steps.length>1&&<Text style={a.note}>{t('и ещё {n} {word} до полного профиля',{n:steps.length-1,word:plural(steps.length-1,['шаг','шага','шагов'],['step','steps'],'қадам')})}</Text>}</View><Text style={[a.chevron,{color:C.ink}]}>›</Text></Pressable>;
 const since=Number(p.created_at)?new Date(Number(p.created_at)*1000).getUTCFullYear():0,trustValue=account.reliability as {score:number|null;label:string;facts:string[];identity?:boolean}|undefined;
 const reputation=[trustValue?.score!=null?'★ '+trustValue.score.toFixed(1).replace('.',','):trustValue?.label?(TRUST_LABELS.includes(trustValue.label)?t(trustValue.label):trustValue.label):'',trustValue?.facts?.[0]?tLine(trustValue.facts[0]):'',since?t('с {year} года',{year:since}):''].filter(Boolean).join(' · ')||p.city||'';
 const idOk=!!(trustValue?.identity??account.identity?.checked);
 const scoreText=trustValue?.score!=null?trustValue.score.toFixed(1).replace('.',',')+' ★':'',trustLabel=trustValue?.label?(TRUST_LABELS.includes(trustValue.label)?t(trustValue.label):trustValue.label):'';
 // The pages of the role that are not in the sheet of the map (the guest's search and bookings, the owner's objects and
 // the cleaner's search for jobs live there) close the first group, as the concept keeps the menu to two groups.
 const more=onOpenPage?rolePages[active].filter(v=>!['map','account','chats','overview',...(active==='guest'?['catalog','bookings','calendar']:active==='owner'?['properties']:['jobs'])].includes(v.id)):[];
 // The other mode in one button at the bottom, as Airbnb's «Switch to hosting»: the guest goes to the owner, the others to the guest.
 const other:Role=active==='guest'?'owner':'guest',toOther=roles.includes(other)?(onPickRole?()=>onPickRole(other):onSwitchRole):onJoinRole?()=>onJoinRole(other):undefined;
 return <FlatMenu.Provider value><View>
  {!onHead&&!!view&&view!=='notices'&&(()=>{const sub=view.startsWith('safety:'),title=sub?safetyTitles[view.slice(7) as Exclude<SafetyPage,''>]:titles[view as keyof typeof titles];return <View style={{flexDirection:'row',alignItems:'center',gap:4,minHeight:44,marginBottom:4}}><Pressable accessibilityRole="button" accessibilityLabel={sub?t('Назад: Данные и безопасность'):view==='safety'||view==='payout'||view==='billing'?t('Назад: Настройки'):t('Назад в меню')} hitSlop={8} onPress={()=>go(sub?'safety':view==='safety'||view==='payout'||view==='billing'?'settings':'')} style={{width:44,height:44,marginLeft:-12,alignItems:'center',justifyContent:'center'}}><Text style={{fontSize:28,lineHeight:32,color:C.ink}}>‹</Text></Pressable><Text accessibilityRole="header" style={[a.name,{fontSize:22,lineHeight:28,flex:1}]}>{title}</Text></View>;})()}
  {/* As in the concept (Airbnb's profile): you in the middle, your reputation in one line and whether your ID is confirmed. */}
  {!view&&<View style={m.hero}><ProfileRing photoId={p.avatar_id} name={p.name} progress={completion/100} ink={ink} onPress={edit}/><Text accessibilityRole="header" numberOfLines={2} style={m.name}>{p.name||t('Мой профиль')}</Text><Text numberOfLines={2} style={m.line}>{reputation}</Text>
   <Pressable accessibilityRole="button" accessibilityLabel={idOk?t('✓ Личность подтверждена'):t('Личность не подтверждена')+'. '+t(experience.profileTitle)} disabled={idOk} onPress={()=>go('profile')} style={m.id}><Image source={menuIcons.shield} style={m.idIcon}/><Text style={[m.idText,idOk&&m.idTextOk]}>{idOk?t('✓ Личность подтверждена'):t('Личность не подтверждена')}</Text></Pressable>
   <Pressable accessibilityRole="button" accessibilityLabel={t('Изменить профиль')} onPress={edit} style={({pressed})=>[a.edit,m.edit,pressed&&a.pressed]}><Text style={a.editText}>{t('Изменить')}</Text></Pressable></View>}
  {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}{!!message&&<Text accessibilityLiveRegion="polite" style={a.saved}>{message}</Text>}
  {!view&&!!bill&&!bill.card&&(bill.due>0||bill.paused)&&<Pressable accessibilityRole="button" onPress={()=>go('billing')} style={[a.next,{marginTop:16}]}><RowIcon icon="wallet" tint={C.warning}/><View style={{flex:1}}><Text style={a.title}>{t('Привяжите карту для оплаты сервиса')}</Text><Text style={a.note}>{bill.paused?t('Новые брони и «Автопилот» на паузе до оплаты {v}.',{v:money(bill.due)}):bill.payBy?t('К оплате {v}. Привяжите до {date}, иначе будет пауза.',{v:money(bill.due),date:dateText(bill.payBy*1000,{timeZone:'Asia/Qyzylorda',day:'numeric',month:'long'})}):t('К оплате {v}. Спишется в понедельник.',{v:money(bill.due)})}</Text></View><Text style={[a.chevron,{color:C.ink}]}>›</Text></Pressable>}
  {!view&&<Group space>{worker&&<SwitchRow icon="briefcase" tint={ink} title={t('Принимаю предложения')} note={/^(Принимает|Не принимает)/.test(account.workerStatus?.label||'')?undefined:t(account.workerStatus?.label||'')} checked={(p.work_status||'available')==='available'} disabled={busy} onChange={work}/>}{staffPlaces>0&&<Row icon="key" tint={ink} title={t('Смена')} value={staffPlaces===1?t('гости сегодня'):t('объектов: {staffPlaces}',{staffPlaces})} onPress={()=>go('shift')}/>}{worker&&<Row icon="chart" tint={ink} title={t('Заработок')} value={t('{v} за неделю',{v:shortTenge(cleanerWeek(jobs,userId,Date.now()/1000).sum)})} onPress={()=>go('money')}/>}{owner&&<Row icon="chart" tint={ink} title={t('Доходы')} value={netMonth===null?undefined:t('{v} за месяц',{v:((netMonth>0?'+':'')+shortTenge(netMonth))})} onPress={()=>go('money')}/>}{owner&&<Row icon="users" tint={ink} title={t('Пригласить владельца')} note={t('Месяц без комиссии вам и ему')} onPress={()=>go('invite')}/>}{active==='guest'&&!!onOpenPage&&<Row icon="bookings" tint={ink} title={t('Мои брони')} onPress={()=>onOpenPage('bookings')}/>}<Row icon="shanyrak" tint={ink} title={t('Автопилот')} value={today?t('ИИ: {today} сегодня',{today}):undefined} onPress={()=>go('autopilot')}/><Row icon="user" tint={ink} title={t(experience.profileTitle)} value={completion<100?completion+'%':trust||t('заполнен')} onPress={()=>go('profile')}/>{more.map(v=><Row key={v.id} icon={v.id as MenuIcon} tint={ink} title={v.title} onPress={()=>onOpenPage?.(v.id)}/>)}</Group>}
  {view==='shift'&&<Shift/>}
  {view==='invite'&&owner&&<InviteOwners initialCode={inviteCode} tint={ink}/>}
  {view==='payout'&&active!=='guest'&&<PayoutForm initial={payout} pending={payoutPending} role={active} onSaved={(v,next)=>{if(v)setPayout(v);setPayoutPending(next);void onChanged?.();}}/>}
  {view==='billing'&&active!=='guest'&&<ServiceBilling key={'billing:'+active} role={active}/>}
  {view==='money'&&(worker?<CleanerEarnings jobs={jobs} userId={userId} now={Date.now()/1000} regular={regularPlaces}/>:<OwnerAnalytics tint={ink}/>)}
  {view==='notices'&&<><View style={m.invites}><NativePush key={'push:'+active} role={active} tint={ink} invite/><NativeTelegram tint={ink} invite/></View><NoticeList list={events} now={clock} waiting={waiting} fresh={n=>freshIds.includes(String(n.id))} onOpen={n=>active!=='guest'&&String(n.dedupe||'').startsWith('service:')&&!String(n.dedupe).startsWith('service:bypass-warning:')?()=>go('billing'):onOpenNotice?.(n)}/></>}
  {view==='autopilot'&&owner&&<OwnerAutopilot key={'autopilot:'+active} journal={journal} now={clock} tint={ink} onOpen={onOpenEntry}/>}{view==='autopilot'&&worker&&<NativeAutopilotPlan key={'plan:'+active} role="cleaner" journal={journal} now={clock} onOpen={onOpenEntry}/>}{view==='autopilot'&&!owner&&!worker&&<><Group title={t('Что сделал ИИ')}><AiJournal entries={journal} now={clock} onOpen={onOpenEntry}/></Group><NativeDecisionRules key={'rules:'+active} tint={ink}/></>}
  {/* As the concept (Airbnb's host profile): a card with the photo and the numbers others see, the identity in one
      line with «Подтвердить», then the data as rows with «Изменить». The photo of the ID is taken after the tap. */}
  {view==='profile'&&<>
   <View accessible accessibilityLabel={(owner?t('Как вас видят гости'):t('Как вас видят владельцы'))+': '+[scoreText,trustLabel,...(trustValue?.facts||[]).map(tLine)].filter(Boolean).join(', ')} style={m.card}>
    <Photo id={p.avatar_id} avatar size={72} name={p.name} alt={t('Мой профиль')}/>
    <View style={{flex:1,minWidth:0}}>
     <View style={m.stat}><Text style={m.statValue}>{scoreText||trustLabel||'—'}</Text>{!!scoreText&&!!trustLabel&&<Text style={m.statLabel}>{trustLabel}</Text>}</View>
     {(trustValue?.facts||[]).slice(0,3).map(f=><View key={f} style={[m.stat,m.statLine]}><Text style={m.fact}>{tLine(f)}</Text></View>)}
    </View>
   </View>
   <Pressable accessibilityRole="button" accessibilityState={{expanded:idOpen}} disabled={idOk} onPress={()=>setIdOpen(v=>!v)} style={({pressed})=>[m.idRow,pressed&&a.pressed]}><RowIcon icon="shield"/><Text style={[a.title,a.wide]}>{idOk?t('✓ Личность подтверждена'):t('Личность не подтверждена')}</Text>{!idOk&&<Text style={m.link}>{idOpen?t('Свернуть'):t('Подтвердить')}</Text>}</Pressable>
   {idOpen&&!idOk&&<IdentityDocs role={active}/>}
   {!!account.phoneCheck&&<Pressable accessibilityRole="button" accessibilityState={{expanded:phoneOpen}} disabled={account.phoneCheck.verified} onPress={()=>setPhoneOpen(v=>!v)} style={({pressed})=>[m.idRow,{marginTop:4},pressed&&a.pressed]}><RowIcon icon="check"/><Text style={[a.title,a.wide]}>{account.phoneCheck.verified?t('✓ Номер подтверждён'):t('Номер не подтверждён')}</Text>{!account.phoneCheck.verified&&<Text style={m.link}>{phoneOpen?t('Свернуть'):t('Подтвердить')}</Text>}</Pressable>}
   {phoneOpen&&!!account.phoneCheck&&!account.phoneCheck.verified&&<PhoneCheck state={account.phoneCheck} role={active} onDone={()=>{setPhoneOpen(false);void request('/api/account').then(setAccount).catch(()=>undefined);}}/>}
   {hint}
   <Group title={t('О вас')}>{info(t('О себе'),p.bio)}{info(t('Языки общения'),p.languages)}{info(t(experience.cityLabel),p.city)}{worker&&<>{info(t('Районы работы'),p.districts)}{info(t('График'),p.availability)}{info(t('Опыт и услуги'),p.experience)}</>}{info(t('Телефон'),p.contact)}</Group>
   {!!account.reliability&&<><Group title={t('Как поднять оценку')}>{(reliabilityHints[active]||[]).map(h=><View key={h} style={a.row}><RowIcon icon="check"/><Text style={[a.title,a.wide]}>{h}</Text></View>)}</Group><ReliabilityObjection role={active}/></>}
  </>}
  {view==='settings'&&<>
   <Group><Row icon="bell" tint={ink} title={t('Куда сообщать')} value={t('телефон, Telegram')} open={channelsOpen} onPress={()=>setChannelsOpen(v=>!v)}/>{channelsOpen&&<><NativePush key={'push:'+active} role={active} tint={ink}/><NativeTelegram tint={ink}/><SwitchRow icon="wallet" tint={ink} title={t('О расчётах и выплатах')} checked={!!account.settings.payment_notifications} disabled={busy} onChange={v=>settings({payment_notifications:v?1:0})}/></>}</Group>
   {active==='guest'?<Text style={a.footnote}>{t('Вы платите владельцу напрямую по реквизитам из брони. Сервис деньги за жильё не принимает.')}</Text>:<><Group title={t('Расчёты')}><Row icon="bank" tint={ink} title={t('Реквизиты для оплаты')} value={payout?'Kaspi •• '+String(payout.phone).replace(/\D/g,'').slice(-4):t('не указаны')} onPress={()=>go('payout')}/><Row icon="wallet" tint={ink} title={t('Оплата услуг')} value={bill?(bill.card?bill.card.mask:t('карта не привязана')):undefined} onPress={()=>go('billing')}/></Group></>}
   <Group title={t('Приватность')}><Choice icon="eye" tint={ink} title={t('Моё фото')} value={p.avatar_visibility||'participants'} options={[['participants',t('Участникам')],['self',t('Только мне')]]} disabled={busy} onChange={v=>privacy({avatar_visibility:v},{avatarVisibility:v})}/><SwitchRow icon="dot" tint={ink} title={t('Показывать, что я в сети')} note={t('Скроете своё — не увидите и у других')} checked={p.show_presence!==0} disabled={busy} onChange={v=>privacy({show_presence:v?1:0},{showPresence:v})}/><SwitchRow icon="read" tint={ink} title={t('Отметки прочтения')} checked={p.show_receipts!==0} disabled={busy} onChange={v=>privacy({show_receipts:v?1:0},{showReceipts:v})}/></Group>
   <Group title={t('Аккаунт')}><Row icon="lock" tint={ink} title={t('Данные и безопасность')} onPress={()=>go('safety')}/>{join.map(v=><Row key={v} icon="plus" tint={ink} title={t(joinTitle(v))} onPress={()=>onJoinRole?.(v)}/>)}</Group></>}
  {(view==='safety'||view.startsWith('safety:'))&&<NativeAccountSafety tint={ink} role={active} admin={!!account.adminVerified} page={view.startsWith('safety:')?view.slice(7) as SafetyPage:''} go={p=>go(p?`safety:${p}` as MenuView:'safety')} onSignedOut={onSignedOut}/>}
  {!view&&<>
  <Group space><Row icon="languages" tint={ink} title={t('Язык')} value={LANGS.find(l=>l.id===lang)?.title} open={langOpen} onPress={()=>setLangOpen(v=>!v)}/>{langOpen&&<View style={[a.row,{paddingHorizontal:8}]}><View style={{flex:1}}><LangSwitch label={t('Язык')}/></View></View>}<Row icon="sliders" tint={ink} title={t('Настройки')} onPress={()=>go('settings')}/>{!!onAskAdministrator&&<Row icon="messages" tint={ink} title={t('Помощь')} value={t('ИИ-администратор')} onPress={onAskAdministrator}/>}{account.platformAdmin&&<Row icon="shield" tint={ink} title={t('Управление сервисом')} note={t('Проверки, обращения, деньги')} onPress={()=>go('admin')}/>}{/* The owner's and the cleaner's map plate has no role chip (RolePlate.tsx): the roles open from here. */}{!!onRoles&&active!=='guest'?<Row icon="users" tint={ink} title={t('Сменить роль')} value={shortRole[active]} onPress={onRoles}/>:!onPickRole&&!!onSwitchRole&&roles.length>1&&<Row icon="users" tint={ink} title={t('Сменить роль')} value={shortRole[active]} onPress={onSwitchRole}/>}{!!onLogout&&<Row icon="logout" title={t('Выйти из аккаунта')} danger onPress={onLogout}/>}</Group>
  {!!toOther&&<Pressable accessibilityRole="button" onPress={toOther} style={({pressed})=>[m.mode,pressed&&a.pressed]}><Text style={m.modeText}>{other==='owner'?t('Перейти в режим владельца'):t('Перейти в режим гостя')}</Text></Pressable>}
  {roles.length>1&&<Text style={[a.footnote,{textAlign:'center'}]}>{t('Имя и фото общие для всех ваших ролей.')}</Text>}</>}
 </View></FlatMenu.Provider>;
}
const m=StyleSheet.create({
 hero:{alignItems:'center',gap:4,paddingTop:4},
 invites:{borderRadius:T.radius.lg,overflow:'hidden',backgroundColor:C.surface},
 name:{...type.title,color:C.ink,fontWeight:'600',textAlign:'center',marginTop:8},
 line:{...type.label,color:C.muted,textAlign:'center'},
 id:{marginTop:8,minHeight:28,paddingHorizontal:12,borderRadius:T.radius.full,flexDirection:'row',alignItems:'center',gap:8,borderWidth:1,borderColor:C.line,backgroundColor:C.surface},
 idIcon:{width:14,height:14,tintColor:C.inkSoft},
 idText:{...type.caption,color:C.inkSoft,fontWeight:'600'},
 idTextOk:{color:C.ink},
 card:{flexDirection:'row',alignItems:'center',gap:16,padding:16,borderRadius:T.radius.xl,borderWidth:1,borderColor:C.line,backgroundColor:C.surface,shadowColor:C.ink,shadowOpacity:.06,shadowRadius:12,shadowOffset:{width:0,height:4},elevation:2},
 stat:{paddingVertical:8},statLine:{borderTopWidth:1,borderTopColor:C.line},
 statValue:{...type.subtitle,color:C.ink,fontWeight:'600'},statLabel:{...type.caption,color:C.muted},fact:{...type.label,color:C.ink,fontWeight:'600'},
 idRow:{minHeight:T.control.field,flexDirection:'row',alignItems:'center',gap:12,marginTop:12},
 link:{...type.label,color:C.ink,fontWeight:'600',textDecorationLine:'underline'},
 info:{minHeight:T.control.primary,flexDirection:'row',alignItems:'center',gap:12,paddingHorizontal:16,paddingVertical:8,borderTopWidth:1,borderTopColor:C.line},
 edit:{position:'absolute',top:0,right:0},
 mode:{alignSelf:'center',minHeight:T.control.primary,marginTop:24,paddingHorizontal:24,borderRadius:T.radius.full,alignItems:'center',justifyContent:'center',backgroundColor:C.ink},
 modeText:{...type.label,color:C.onAccent,fontWeight:'600'},
});
