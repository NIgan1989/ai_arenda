import {t} from '../../lib/i18n';
import React,{useEffect,useState} from 'react';
import {View,Text,TextInput,Pressable,StyleSheet} from 'react-native';
import {Photo,m,pickImages,uploadImage} from './ListingMedia';
import {Badge} from './PropertyListing';
import {request} from './api';
import {C,s,type} from './styles';
import {T} from './tokens';
import type {Row} from './model';
import {AddressField} from './AddressSuggest';
import {SwitchRow} from './AccountRows';
import {PhotoSource} from './PhotoSource';

// «Изменить профиль» (board «Экраны старой версии», 2026-11-26; Airbnb's «Edit profile»): one head with «‹», the photo
// in the middle with «Изменить» under it, then each field as a row with its value. A tap on a row opens that one field
// with «Сохранить» at the bottom; the photo and the switch save at once. There is no long form and no «Отмена».
type Key='name'|'contact'|'city'|'bio'|'languages'|'districts'|'experience'|'availability';
const FIELDS:{id:Key;label:string;max:number;multiline?:boolean;cleaner?:boolean;placeholder?:string}[]=[
 {id:'name',label:'Имя',max:100},{id:'contact',label:'Телефон или мессенджер',max:120},{id:'city',label:'Город',max:80},
 {id:'bio',label:'О себе',max:500,multiline:true},{id:'languages',label:'Языки общения',max:100,placeholder:'Русский, казахский'},
 {id:'districts',label:'Районы работы',max:300,cleaner:true,placeholder:'Через запятую: Центр, Усольский'},
 {id:'experience',label:'Опыт и услуги',max:1000,multiline:true,cleaner:true},{id:'availability',label:'Дни и часы работы',max:300,cleaner:true,placeholder:'Пн–Пт, 9:00–18:00'},
];
export function ProfileEditor({profile:p,onSaved,onClose,onHead}:{profile:Row;onSaved:()=>Promise<void>;onClose:()=>void;onHead?:(head:{title:string;label:string;back:()=>void}|null)=>void}){
 const [values,setValues]=useState<Row>({...p,avatarId:p.avatar_id||null,workStatus:p.work_status||'available'}),[open,setOpen]=useState<Key|null>(null),[draft,setDraft]=useState<Row>({});
 const [photoOpen,setPhotoOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),cleaner=JSON.parse(p.roles||'[]').includes('cleaner');
 async function save(patch:Row){if(busy)return false;setBusy(true);setError('');const next={...values,...patch};try{await request('/api/profile/edit',{...next,expectedVersion:p.profile_version||0});setValues(next);await onSaved();return true;}catch(e:any){setError(e.message);return false;}finally{setBusy(false);}}
 async function photo(camera:boolean){setPhotoOpen(false);setBusy(true);setError('');try{const [image]=await pickImages(camera,1);if(!image)return;const id=await uploadImage(image,'avatar');setBusy(false);await save({avatarId:id});}catch(e:any){setError(e.message||t('Не удалось загрузить фото.'));}finally{setBusy(false);}}
 const edit=(id:Key)=>{setError('');setDraft({[id]:values[id]||'',...(id==='city'?{cityId:values.cityId||''}:{})});setOpen(id);};
 const head=(title:string,back:()=>void,label:string)=>onHead?null:<View style={e.head}><Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={8} onPress={back} style={e.back}><Text style={e.backText}>‹</Text></Pressable><Text accessibilityRole="header" numberOfLines={1} style={e.title}>{title}</Text></View>;
 const failed=!!error&&<Text style={s.error} accessibilityRole="alert">{error}</Text>;
 const field=FIELDS.find(f=>f.id===open);
 // In the menu the head is the sheet's own (AccountControl onHead): the editor gives it its name and «‹».
 useEffect(()=>{onHead?.(field?{title:t(field.label),label:t('Назад: Изменить профиль'),back:()=>setOpen(null)}:{title:t('Изменить профиль'),label:t('Назад в меню'),back:onClose});},[open]); // eslint-disable-line react-hooks/exhaustive-deps
 if(field){
  const value=String(draft[field.id]??''),changed=value.trim()!==String(values[field.id]||'').trim()||(field.id==='city'&&draft.cityId!==values.cityId);
  const input=field.id==='city'||field.id==='districts'
   ?<AddressField kind={field.id==='city'?'city':'district'} multi={field.id==='districts'} label={t(field.label)} labelStyle={e.hidden} inputStyle={e.input} value={value} city={String(values.city||'')} place={String(values.cityId||'')} max={field.max} placeholder={field.placeholder?t(field.placeholder):''} disabled={busy} onChange={v=>setDraft(d=>({...d,[field.id]:v,...(field.id==='city'?{cityId:''}:{})}))} onPick={c=>field.id==='city'&&setDraft(d=>({...d,cityId:c.id||''}))}/>
   :<TextInput accessibilityLabel={t(field.label)} autoFocus value={value} onChangeText={v=>setDraft(d=>({...d,[field.id]:v}))} maxLength={field.max} multiline={!!field.multiline} placeholder={field.placeholder?t(field.placeholder):''} placeholderTextColor={C.muted} editable={!busy} style={[e.input,field.multiline&&e.area]}/>;
  return <View style={e.page}>{head(t(field.label),()=>setOpen(null),t('Назад: Изменить профиль'))}{input}<Text style={e.count}>{value.length} / {field.max}</Text>{failed}
   <Pressable accessibilityRole="button" accessibilityState={{disabled:busy||!changed}} disabled={busy||!changed} onPress={()=>void save(draft).then(ok=>{if(ok)setOpen(null);})} style={({pressed})=>[e.save,(busy||!changed||pressed)&&e.dim]}><Text style={e.saveText}>{busy?t('Сохраняем…'):t('Сохранить')}</Text></Pressable></View>;
 }
 return <View style={e.page}>
  {head(t('Изменить профиль'),onClose,t('Назад в меню'))}
  <View style={e.photo}><Pressable accessibilityRole="button" accessibilityLabel={t('Фото профиля. Изменить')} disabled={busy} onPress={()=>setPhotoOpen(true)}><Photo id={values.avatarId} avatar size={104} name={values.name} alt={t('Фото профиля')}/></Pressable><Pressable accessibilityRole="button" disabled={busy} onPress={()=>setPhotoOpen(true)} hitSlop={8}><Text style={e.link}>{busy&&!open?t('Сохраняем…'):values.avatarId?t('Изменить'):t('Добавить фото')}</Text></Pressable></View>
  {failed}
  <View style={e.rows}>{FIELDS.filter(f=>!f.cleaner||cleaner).map(f=><Pressable key={f.id} accessibilityRole="button" accessibilityLabel={t(f.label)+'. '+(values[f.id]||t('Не указано'))} disabled={busy} onPress={()=>edit(f.id)} style={({pressed})=>[e.row,pressed&&{backgroundColor:C.surfaceAlt}]}>
   <View style={{flex:1,minWidth:0}}><Text style={e.rowTitle}>{t(f.label)}</Text><Text numberOfLines={2} style={[e.rowValue,!values[f.id]&&{color:C.muted}]}>{values[f.id]||t('Не указано')}</Text></View><Text style={e.chevron}>›</Text>
  </Pressable>)}</View>
  {cleaner&&<View style={e.rows}><SwitchRow title={t('Принимаю новые предложения')} checked={values.workStatus==='available'} disabled={busy} onChange={v=>void save({workStatus:v?'available':'away'})}/></View>}
  <PhotoSource visible={photoOpen} title={t('Фото профиля')} busy={busy} onClose={()=>setPhotoOpen(false)} onCamera={()=>void photo(true)} onGallery={()=>void photo(false)} onRemove={values.avatarId?()=>{setPhotoOpen(false);void save({avatarId:null});}:undefined}/>
 </View>;
}
const e=StyleSheet.create({
 page:{gap:12},
 head:{flexDirection:'row',alignItems:'center',gap:4,minHeight:44},back:{width:44,height:44,marginLeft:-12,alignItems:'center',justifyContent:'center'},backText:{fontSize:28,lineHeight:32,color:C.ink},
 title:{...type.title,color:C.ink,fontWeight:'600',letterSpacing:-.3,flex:1},
 photo:{alignItems:'center',gap:8,paddingVertical:8},link:{...type.label,color:C.ink,fontWeight:'600',textDecorationLine:'underline'},
 rows:{marginHorizontal:-16,borderTopWidth:1,borderTopColor:C.line},
 row:{minHeight:T.control.primary,flexDirection:'row',alignItems:'center',gap:12,paddingHorizontal:16,paddingVertical:12,borderBottomWidth:1,borderBottomColor:C.line},
 rowTitle:{...type.label,color:C.ink,fontWeight:'600'},rowValue:{...type.label,color:C.inkSoft},chevron:{...type.subtitle,color:C.lineStrong},
 hidden:{display:'none'},
 input:{minHeight:T.control.primary,borderWidth:1,borderColor:C.lineStrong,borderRadius:T.radius.md,backgroundColor:C.surface,paddingHorizontal:16,paddingVertical:12,fontSize:16,lineHeight:24,color:C.ink},area:{minHeight:140,textAlignVertical:'top'},
 count:{...type.caption,color:C.muted,textAlign:'right'},
 save:{minHeight:T.control.primary,borderRadius:T.radius.full,backgroundColor:C.ink,alignItems:'center',justifyContent:'center',marginTop:8},saveText:{...type.body,color:C.onAccent,fontWeight:'600'},dim:{opacity:.45},
});
export function CleanerCard({worker:p}:{worker:Row}){return <View style={s.card}><View style={m.heading}><Photo id={p.avatar_id} avatar alt={t('Фото: {name}',{name:p.name})}/><View style={{flex:1}}><Text style={s.cardTitle}>{p.name}</Text><Text style={s.meta}>{p.city} · {p.districts}</Text></View></View><Badge status={p.display_status}/>{p.display_status?.upcoming&&<Text style={s.meta}>{t('Есть предстоящие назначения. Время проверяется при назначении.')}</Text>}<Text style={s.text}>{p.experience}</Text><Text style={s.meta}>{t('График: {v}',{v:p.availability})}</Text><Text style={s.meta}>{t('Анкета заполнена исполнителем. Квалификация платформой пока не подтверждена.')}</Text></View>;}
