import {t} from '../../lib/i18n';
import React,{useEffect,useState} from 'react';
import {ThinkingLine} from './Thinking';
import {Pressable,StyleSheet,Text,View} from 'react-native';
import {C,type} from './styles';
import {T} from './tokens';
import {request} from './api';
import {regularBenefits,regularSince} from '../../lib/regular-cleaner-text';
import {EditButton,EditNote,EditRow,EditSheet,editStyles as e,type EditMenuItem} from './EditSheet';
type Row=Record<string,any>;
const R=T.radius;
// The three gains named when «Что даёт закрепление» opens: short titles only, the long texts stay on the site.
const SHORT=['first','backup','proof'];

// «Постоянный исполнитель» for one flat (same screen as components/regular-cleaner.tsx), as one sheet (board «Экраны
// старой версии»): the pinned cleaner is one card with what they did here; without one, the people to pin are rows to
// choose from and «Закрепить» is pinned at the bottom. «Снять закрепление» is rare, so it lives in «⋯» and asks first.
export function RegularCleaner({propertyId,onBack,onClose}:{propertyId:string;onBack:()=>void;onClose:()=>void}){
 const [state,setState]=useState<Row|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[note,setNote]=useState(''),[confirm,setConfirm]=useState(false),[pick,setPick]=useState(''),[more,setMore]=useState(false);
 async function load(){try{setState(await request('/api/operations/regular/state',{propertyId}));}catch(x:any){setError(x?.message||t('Не удалось загрузить.'));}}
 useEffect(()=>{load();},[propertyId]);
 async function run(path:string,body:Row){if(busy)return;setBusy(true);setError('');setNote('');try{const r=await request(path,{propertyId,...body});setNote(r?.message||'');setConfirm(false);await load();}catch(x:any){setError(x?.message||t('Не получилось.'));}finally{setBusy(false);}}
 const r=state?.regular,benefits=state?regularBenefits(state).filter(b=>SHORT.includes(b.key)):[],candidates:Row[]=state?.candidates||[];
 // The best-ranked person is chosen until the owner taps another; the button names who will be pinned.
 const chosen=r?null:candidates.find(c=>c.id===pick)||candidates[0]||null;
 const avatar=(name:string,big=false)=><View style={[f.avatar,big&&f.avatarBig]} accessibilityElementsHidden importantForAccessibility="no"><Text style={f.avatarText}>{(name||'?').slice(0,1).toUpperCase()}</Text></View>;
 const menu:EditMenuItem[]=r&&!confirm?[{title:t('Снять закрепление'),danger:true,onPress:()=>setConfirm(true)}]:[];
 const foot=r&&confirm?<><EditButton title={t('Снять')} busy={busy&&t('Снимаем…')} onPress={()=>run('/api/operations/regular/unpin',{})}/><EditButton line title={t('Отмена')} disabled={busy} onPress={()=>setConfirm(false)}/></>
  :chosen?<EditButton title={t('Закрепить {name}',{name:chosen.name})} busy={busy&&t('Закрепляем…')} onPress={()=>run('/api/operations/regular/pin',{cleanerId:chosen.id})}/>:undefined;
 return <EditSheet title={t('Постоянный исполнитель')} onBack={confirm?()=>setConfirm(false):onBack} onClose={onClose} menu={menu} foot={foot} busy={busy}>
  {!state&&!error&&<ThinkingLine style={e.note} text={t('Загружаем…')}/>}
  {r&&<View accessible accessibilityLabel={[r.name,regularSince(r)].filter(Boolean).join('. ')} style={f.card}>{avatar(r.name,true)}<View style={e.rowText}><Text numberOfLines={1} style={e.rowTitle}>{r.name}</Text>{!!regularSince(r)&&<Text numberOfLines={1} style={e.rowLine}>{regularSince(r)}</Text>}</View></View>}
  {r&&confirm&&<View style={f.ask}><Text style={f.askTitle}>{t('Снять закрепление: {name}?',{name:r.name})}</Text><EditNote text={t('Уже назначенные уборки останутся за ним, новые ИИ будет предлагать лучшим свободным исполнителям.')}/></View>}
  {state&&!r&&(candidates.length?<>
   <EditNote text={t('Закрепите исполнителя, с которым уже работаете, и уборки этого жилья будут сами приходить к нему.')}/>
   <View accessibilityRole="radiogroup">{candidates.map((c,i)=>{const on=chosen?.id===c.id,line=regularSince(c);return <Pressable key={c.id} accessibilityRole="radio" accessibilityLabel={[c.name,line].filter(Boolean).join('. ')} accessibilityState={{checked:on,disabled:busy}} disabled={busy} onPress={()=>setPick(c.id)} style={({pressed})=>[e.row,i<candidates.length-1&&e.rowLineBottom,pressed&&e.pressed]}>
    {avatar(c.name)}<View style={e.rowText}><Text numberOfLines={1} style={e.rowTitle}>{c.name}</Text>{!!line&&<Text numberOfLines={1} style={e.rowLine}>{line}</Text>}</View>
    <View style={[f.radio,on&&f.radioOn]}>{on&&<View style={f.radioDot}/>}</View>
   </Pressable>;})}</View>
  </>:<EditNote text={t('Пока закрепить некого. После первой уборки через сервис здесь появится тот, кто её сделал.')}/>)}
  {state&&!confirm&&<View>
   <EditRow icon="star" title={t('Что даёт закрепление')} onPress={()=>setMore(v=>!v)} last={!more}/>
   {more&&<View style={f.more}>{benefits.map(b=><Text key={b.key} style={e.note}>{b.title}</Text>)}</View>}
  </View>}
  {!!note&&<EditNote tone="done" text={note}/>}
  {!!error&&<EditNote tone="error" text={error}/>}
 </EditSheet>;
}
const f=StyleSheet.create({
 // The pinned cleaner: the whole card, outlined, no «›» because the app has no profile screen to open.
 card:{flexDirection:'row',alignItems:'center',gap:12,minHeight:72,padding:12,borderRadius:R.lg,borderWidth:1,borderColor:C.line},
 avatar:{width:40,height:40,borderRadius:R.full,backgroundColor:C.surfaceAlt,borderWidth:1,borderColor:C.line,alignItems:'center',justifyContent:'center'},
 avatarBig:{width:48,height:48},avatarText:{...type.body,color:C.ink,fontWeight:'600'},
 ask:{gap:4},askTitle:{...type.body,color:C.ink,fontWeight:'600'},
 radio:{width:24,height:24,borderRadius:R.full,borderWidth:2,borderColor:C.lineStrong,alignItems:'center',justifyContent:'center'},
 radioOn:{borderColor:C.ink},radioDot:{width:12,height:12,borderRadius:R.full,backgroundColor:C.ink},
 // The gains open under their row, in line with its title (icon 24 + gap 12).
 more:{gap:4,paddingLeft:36,paddingBottom:12,borderBottomWidth:1,borderBottomColor:C.line},
});
