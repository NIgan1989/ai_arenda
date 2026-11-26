import {t} from '../../../lib/i18n';
import React,{useEffect,useState} from 'react';
import {View,TextInput,Pressable,Text,Switch} from 'react-native';
import {Group,a} from '../AccountRows';
import {SwipeConfirm} from '../SwipeConfirm';
import {s,C} from '../styles';
import {useAdmin,Said,Loading,Tabs,Line,Note,Title,Empty,Link,Bottom,TextSheet,money,day,roleName,type Row} from './kit';
import type {Go} from './AdminHub';
import {Docs} from './AdminWork';

// Участники: «Люди» and «Объекты» (board mobbin/admin). A search on top, a role or a state as tabs, one line per person or
// place; it opens on its own page where the rare steps (block, take off the map) are a line of text with a reason.
type Nav={go:Go;back:()=>void};
const roles=(r:unknown)=>(Array.isArray(r)?r:[]).map(x=>t(roleName[x]||x)).join(', ');

function Search({value,onChange,placeholder}:{value:string;onChange:(v:string)=>void;placeholder:string}){
 const [v,setV]=useState(value);
 useEffect(()=>{const id=setTimeout(()=>{if(v.trim()!==value)onChange(v.trim());},400);return()=>clearTimeout(id);},[v]); // eslint-disable-line react-hooks/exhaustive-deps
 return <TextInput accessibilityLabel={placeholder} value={v} onChangeText={setV} placeholder={placeholder} placeholderTextColor={C.muted} returnKeyType="search" maxLength={100} style={[s.field,{marginBottom:4}]}/>;
}
function Pages({page,total,limit,onPage}:{page:number;total:number;limit:number;onPage:(p:number)=>void}){
 const last=Math.max(0,Math.ceil(total/limit)-1);
 if(!last)return null;
 return <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:4}}>
  <Link title={'‹ '+t('Назад')} disabled={page<=0} onPress={()=>onPage(page-1)}/>
  <Text style={a.note}>{t('{a} из {b}',{a:page+1,b:last+1})}</Text>
  <Link title={t('Дальше')+' ›'} disabled={page>=last} onPress={()=>onPage(page+1)}/>
 </View>;
}

export function Users({go}:Nav){
 const [role,setRole]=useState<''|'guest'|'owner'|'cleaner'|'blocked'>(''),[search,setSearch]=useState(''),[page,setPage]=useState(0);
 const blocked=role==='blocked';
 const d=useAdmin(blocked?null:'users?'+new URLSearchParams({role,search,page:String(page)}).toString()),r=useAdmin('restrictions');
 const held:Row[]=r.data?.restrictions||[],heldIds=new Set(held.map(x=>x.user_id));
 return <View>
  <Search value={search} onChange={v=>{setSearch(v);setPage(0);}} placeholder={t('Имя или контакт')}/>
  <Tabs value={role} onChange={v=>{setRole(v);setPage(0);}} items={[['',t('Все')],['guest',t('Гости')],['owner',t('Владельцы')],['cleaner',t('Исполнители')],['blocked',t('Ограничены'),held.length]]}/>
  {blocked?<Group>{held.length?held.map(x=><Line key={x.user_id} icon="lock" dot="red" title={x.name||t('Участник')} note={x.reason} value={x.kind==='blocked'?t('заблокирован'):t('пауза')} onPress={()=>go({id:'user',title:'Участник',param:{id:x.user_id,name:x.name}})}/>):<Line title={t('Ограничений нет')}/>}</Group>
  :!d.data?<Loading error={d.error}/>:<>
   <Group title={t('Найдено · {n}',{n:d.data.total||0})}>{(d.data.users||[]).length?(d.data.users as Row[]).map(u=><Line key={u.id} icon="user" dot={heldIds.has(u.id)?'red':undefined} title={u.name||t('Участник')} note={[roles(u.roles),u.city].filter(Boolean).join(' · ')} value={u.property_count?t('жильё: {n}',{n:u.property_count}):u.assignment_count?t('уборок: {n}',{n:u.assignment_count}):u.booking_count?t('броней: {n}',{n:u.booking_count}):undefined} onPress={()=>go({id:'user',title:'Участник',param:u})}/>):<Empty text={t('Никого не нашли')}/>}</Group>
   <Pages page={page} total={d.data.total||0} limit={d.data.limit||25} onPage={setPage}/>
  </>}
 </View>;
}

export function User({user:u,back}:{user:Row}&Nav){
 const r=useAdmin('restrictions'),[asking,setAsking]=useState<'block'|'lift'|null>(null);
 const held=(r.data?.restrictions as Row[]|undefined)?.find(x=>x.user_id===u.id);
 return <View>
  <Title title={u.name||t('Участник')} note={[roles(u.roles),u.city].filter(Boolean).join(' · ')}/>
  {!!held&&<Group><Line icon="lock" dot="red" title={held.kind==='blocked'?t('Заблокирован'):t('На паузе')} note={held.reason} value={day(held.created_at)}/></Group>}
  <Group>
   {!!u.contact&&<Line icon="phone" title={t('Контакт')} value={u.contact}/>}
   {u.created_at!==undefined&&<Line icon="clock" title={t('С нами с')} value={day(u.created_at)}/>}
   {u.property_count!==undefined&&<Line icon="building" title={t('Жильё')} value={String(u.property_count)}/>}
   {u.booking_count!==undefined&&<Line icon="star" title={t('Брони как гость')} value={String(u.booking_count)}/>}
   {u.assignment_count!==undefined&&<Line icon="brush" title={t('Уборки')} value={String(u.assignment_count)}/>}
  </Group>
  <Group space><Docs path={'identity/docs?userId='+encodeURIComponent(u.id)} photo="identity/photo?id=" title={t('Удостоверение')}/></Group>
  <Note text={t('Просмотр контакта и документов записывается в журнал.')}/>
  {held?<Link title={t('Снять ограничение')} onPress={()=>setAsking('lift')}/>:<Link title={t('Заблокировать аккаунт')} danger onPress={()=>setAsking('block')}/>}
  <TextSheet visible={!!asking} title={asking==='block'?t('Заблокировать аккаунт'):t('Снять ограничение')} note={asking==='block'?t('Все входы завершатся, жильё скроется. Участник увидит основание.'):t('Участник получит уведомление с этим текстом.')} placeholder={t('Основание')} button={asking==='block'?t('Заблокировать'):t('Снять')} busy={r.busy} onClose={()=>setAsking(null)} onSubmit={async v=>{const act=asking;setAsking(null);if(await r.save('restrictions/decide',{userId:u.id,action:act,reason:v})&&act==='block')back();}}/>
  <Said error={r.error} note={r.note}/>
 </View>;
}

export function Properties({go}:Nav){
 const [search,setSearch]=useState(''),[page,setPage]=useState(0),[tab,setTab]=useState<'all'|'check'|'nomap'|'hidden'>('all');
 const d=useAdmin('properties?'+new URLSearchParams({search,page:String(page)}).toString());
 const items:Row[]=d.data?.items||[];
 const shown=items.filter(p=>tab==='all'||(tab==='check'&&p.review_status!=='approved')||(tab==='nomap'&&!p.has_location)||(tab==='hidden'&&(!p.published||p.restriction)));
 return <View>
  <Search value={search} onChange={v=>{setSearch(v);setPage(0);}} placeholder={t('Название, город или владелец')}/>
  <Tabs value={tab} onChange={setTab} items={[['all',t('Все')],['check',t('Без проверки')],['nomap',t('Без точки')],['hidden',t('Скрыты')]]}/>
  {!d.data?<Loading error={d.error}/>:<>
   <Group title={t('Найдено · {n}',{n:d.data.total||0})}>{shown.length?shown.map(p=><Line key={p.id} icon="building" dot={p.restriction?'red':!p.published?'grey':undefined} title={p.title} note={[p.city,p.owner_name,!p.has_location&&t('без точки'),p.review_status==='approved'?t('проверено'):t('не проверено')].filter(Boolean).join(' · ')} value={money(p.price)} onPress={()=>go({id:'property',title:'Объект',param:p})}/>):<Empty text={t('На этой странице таких нет')}/>}</Group>
   <Pages page={page} total={d.data.total||0} limit={d.data.limit||25} onPage={setPage}/>
   {tab!=='all'&&<Note text={t('Отбор по текущей странице списка.')}/>}
  </>}
 </View>;
}

export function Property({place:p,go,back}:{place:Row}&Nav){
 const d=useAdmin(null),[match,setMatch]=useState(false),[unlisting,setUnlisting]=useState(false);
 const approved=p.review_status==='approved';
 return <View>
  <Title title={p.title} note={[p.city,p.district].filter(Boolean).join(', ')}/>
  <Group>
   <Line icon="user" title={p.owner_name||t('Владелец')} note={p.restriction?t('Аккаунт ограничен'):t('Владелец')} dot={p.restriction?'red':undefined} onPress={()=>go({id:'user',title:'Участник',param:{id:p.owner_id,name:p.owner_name,roles:['owner']}})}/>
   <Line icon="wallet" title={t('Цена')} value={money(p.price)}/>
   <Line icon="eye" title={t('На карте')} value={p.published?(p.has_location?t('показано'):t('нет точки')):t('скрыто')} dot={!p.has_location?'red':undefined}/>
   <Line icon="camera" title={t('Фото')} value={String(p.photos||0)}/>
   <Line icon="check" title={t('Проверка')} value={approved?t('одобрено'):p.review_status==='rejected'?t('отклонено'):p.review_status==='pending'?t('ждёт'):t('не было')}/>
  </Group>
  <Group space>
   <Docs path={'rights?propertyId='+encodeURIComponent(p.id)} photo="rights/photo?id=" title={t('Документ на жильё')}/>
   <Docs path={'identity/docs?userId='+encodeURIComponent(p.owner_id)} photo="identity/photo?id=" title={t('Удостоверение владельца')}/>
  </Group>
  {!approved&&<Bottom>
   <Pressable accessibilityRole="checkbox" accessibilityState={{checked:match}} onPress={()=>setMatch(v=>!v)} style={[a.row,{paddingHorizontal:4}]}><View style={a.wide}><Text style={a.title}>{t('ФИО совпадает')}</Text><Text style={a.note}>{t('В документах, профиле и у получателя Kaspi')}</Text></View><Switch accessibilityLabel={t('ФИО совпадает')} value={match} onValueChange={setMatch} trackColor={{false:C.lineStrong,true:C.ink}} thumbColor={C.surface}/></Pressable>
   <SwipeConfirm label={t('Проведите, чтобы одобрить жильё')} disabled={d.busy||!match} onConfirm={async()=>{if(await d.save('properties/approve',{propertyId:p.id,confirmed:true,namesMatch:true},false))back();}}/>
  </Bottom>}
  {!!p.published&&<Link title={t('Снять с показа')} danger onPress={()=>setUnlisting(true)}/>}
  <TextSheet visible={unlisting} title={t('Снять с показа')} note={t('Вернуть можно только после новой проверки. Владелец увидит причину.')} placeholder={t('Причина')} button={t('Снять с показа')} busy={d.busy} onClose={()=>setUnlisting(false)} onSubmit={async v=>{setUnlisting(false);if(await d.save('properties/unlist',{propertyId:p.id,reason:v},false))back();}}/>
  <Said error={d.error} note={d.note}/>
 </View>;
}
