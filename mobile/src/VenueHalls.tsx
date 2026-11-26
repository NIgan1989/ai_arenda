import {t} from '../../lib/i18n';
// «Залы» of one venue (lib/venue.ts): the owner adds the next hall from one that is already filled in. The address,
// the pin, the photos, the rules and the person on shift come with it; the name, the capacity and the price are the
// hall's own. Each hall is booked on its own and has its own calendar.
// One sheet (board «Экраны старой версии», 2026-11-26): the halls are short rows that open the hall, «Добавить зал»
// is pinned at the bottom and turns the sheet into one field; the venue's name is a row that turns into its field.
import React,{useEffect,useState} from 'react';
import {StyleSheet,Text} from 'react-native';
import {ThinkingLine} from './Thinking';
import {C,type} from './styles';
import {EditButton,EditField,EditNote,EditRow,EditSheet,editDot,editStyles} from './EditSheet';
type Row=Record<string,any>;

export function VenueHalls({property,call,onBack,onClose,onOpen,onChanged}:{property:Row;call:(path:string,body:Row)=>Promise<any>;onBack:()=>void;onClose:()=>void;onOpen?:(id:string)=>void|Promise<void>;onChanged?:(venue:Row|null)=>void}){
 const [venue,setVenue]=useState<Row|null|undefined>(undefined),[busy,setBusy]=useState(false),[error,setError]=useState(''),[note,setNote]=useState(''),[title,setTitle]=useState(''),[name,setName]=useState(''),[naming,setNaming]=useState(false),[adding,setAdding]=useState(false);
 useEffect(()=>{let live=true;call('venue/state',{propertyId:property.id}).then(v=>{if(live){setVenue(v.venue||null);setName(v.venue?.title||property.title||'');}}).catch(x=>{if(live)setError(x?.message||t('Не удалось загрузить.'));});return()=>{live=false;};},[property.id]); // eslint-disable-line react-hooks/exhaustive-deps
 async function add(){if(busy||!title.trim())return;setBusy(true);setError('');setNote('');try{const r=await call('venue/hall',{propertyId:property.id,title:title.trim(),venueTitle:name.trim()||property.title});setVenue(r.venue);onChanged?.(r.venue);setTitle('');setAdding(false);if(onOpen)await onOpen(r.id);else setNote(r.message||'');}catch(x:any){setError(x?.message||t('Не получилось.'));}finally{setBusy(false);}}
 async function rename(){if(busy||!name.trim())return;setBusy(true);setError('');setNote('');try{const r=await call('venue/rename',{propertyId:property.id,title:name.trim()});setVenue(r.venue);onChanged?.(r.venue);setNote(r.message||'');setNaming(false);}catch(x:any){setError(x?.message||t('Не получилось.'));}finally{setBusy(false);}}
 const halls:Row[]=venue?.halls||[];
 // «‹» from a field goes back to the list of halls; from the list, back to the place.
 const back=adding||naming?()=>{setAdding(false);setNaming(false);setError('');}:onBack;
 const open=(next:'add'|'name')=>{setNote('');setError('');setAdding(next==='add');setNaming(next==='name');};
 const foot=adding?<EditButton title={t('Добавить')} disabled={!title.trim()} busy={busy&&t('Добавляем…')} onPress={add}/>
  :naming?<EditButton title={t('Сохранить')} disabled={!name.trim()} busy={busy&&t('Сохраняем…')} onPress={rename}/>
  :venue!==undefined?<EditButton title={t('Добавить зал')} disabled={busy} onPress={()=>open('add')}/>:undefined;
 return <EditSheet title={adding?t('Новый зал'):naming?t('Название заведения'):t('Залы')} onBack={back} onClose={onClose} busy={busy} foot={foot}>
  {venue===undefined&&!error&&<ThinkingLine style={editStyles.note} text={t('Загружаем…')}/>}
  {adding?<>
   {venue===null&&<EditField label={t('Название заведения')} value={name} onChange={setName} placeholder={t('Сауна «Жар»')}/>}
   <EditField label={t('Название нового зала')} value={title} onChange={setTitle} placeholder={t('Малый зал')}/>
   <EditNote text={t('Адрес, фото, правила и сотрудник скопируются из этого зала. Останется указать вместимость и цену.')}/>
  </>:naming?<EditField label={t('Название заведения')} value={name} onChange={setName}/>
  :<>
   {venue===null&&<EditNote text={t('Залы по одному адресу: у каждого своя цена и свой календарь.')}/>}
   {!!venue&&<EditRow icon="building" title={t('Название заведения')} line={venue.title} label={t('Заведение: {title}. Переименовать',{title:venue.title})} disabled={busy} onPress={()=>open('name')}/>}
   {halls.map((h,i)=>{const here=h.id===property.id;
    return <EditRow key={h.id} title={h.title} line={Number(h.published)?t('до {n} гостей · гости видят',{n:h.capacity}):t('до {n} гостей · черновик',{n:h.capacity})} dot={Number(h.published)?editDot.ok:editDot.off} label={t(here?'Зал: {title}, открыт сейчас':'Зал: {title}',{title:h.title})} last={i===halls.length-1} disabled={busy} onPress={here||!onOpen?undefined:()=>onOpen(h.id)} right={here?<Text style={f.here}>{t('этот зал')}</Text>:undefined}/>;})}
  </>}
  {!!note&&<EditNote tone="done" text={note}/>}
  {!!error&&<EditNote tone="error" text={error}/>}
 </EditSheet>;
}
const f=StyleSheet.create({
 here:{...type.label,color:C.muted},
});
