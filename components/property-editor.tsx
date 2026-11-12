'use client';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {ArrowLeft,BedDouble,Camera,Check,Clock,FileText,MapPin,Minus,Plus,ScrollText,Sparkles,Wallet,Wifi,X} from 'lucide-react';
import {Photo} from './media';
import {PhotoGrid} from './photo-grid';
import {EDIT_STEPS,editBody,editRequest,nextAdvice,stepLine,stepNeeds,type EditBody,type EditStep} from '../lib/listing-edit';
import {amenities,checkinMethods,propertyTypes} from '../lib/listings';
import './property-quick.css';
import './property-editor.css';
type Row=Record<string,any>;
type API=(path:string,body?:Row)=>Promise<any>;
const ICONS:Record<EditStep,ReactNode>={photos:<Camera size={18}/>,flat:<BedDouble size={18}/>,place:<MapPin size={18}/>,text:<FileText size={18}/>,amenities:<Wifi size={18}/>,prices:<Wallet size={18}/>,checkin:<Clock size={18}/>,rules:<ScrollText size={18}/>};
const SAVED:Record<EditStep|'publish',string>={photos:'Фото сохранены.',flat:'Квартира сохранена.',place:'Адрес сохранён.',text:'Описание сохранено.',amenities:'Удобства сохранены.',prices:'Цены сохранены.',checkin:'Заезд сохранён.',rules:'Правила сохранены.',publish:'Готово.'};

// Editing a flat: an overview of short steps, each opened on its own small screen and saved at once.
// After each save the AI administrator offers the next step, so the owner never scrolls a long form.
export function PropertyEditor({property,role,api,onSave,onClose}:{property:Row;role:string;api:API;onSave:(body:Row)=>Promise<Row|undefined>;onClose:()=>void}){
 const [p,setP]=useState(property),[base,setBase]=useState<EditBody>(()=>editBody(property)),[draft,setDraft]=useState<EditBody>(base);
 const [open,setOpen]=useState<EditStep|null>(null),[busy,setBusy]=useState(false),[uploading,setUploading]=useState(false),[error,setError]=useState(''),[done,setDone]=useState(''),[skipped,setSkipped]=useState<string[]>([]);
 const box=useRef<HTMLElement>(null);
 useEffect(()=>{box.current?.scrollIntoView({block:'start',behavior:'instant' as ScrollBehavior});},[open]);
 const advice=nextAdvice(base,skipped);
 function go(step:EditStep){setDraft(base);setError('');setDone('');setOpen(step);}
 async function commit(next:EditBody,what:EditStep|'publish'){
  if(busy||uploading)return;setBusy(true);setError('');
  try{const fresh=await onSave(editRequest(next,p));const row=fresh||{...p,listing_version:(p.listing_version||0)+1};setP(row);const b=fresh?editBody(fresh):next;setBase(b);setDraft(b);setOpen(null);setDone(SAVED[what]);}
  catch(e:any){setError(e?.message||'Не удалось сохранить.');}finally{setBusy(false);}
 }
 const d=draft.details,r=draft.rental;
 const set=(v:Partial<EditBody>)=>setDraft(o=>({...o,...v}));
 const setD=(v:Partial<EditBody['details']>)=>setDraft(o=>({...o,details:{...o.details,...v}}));
 const setR=(v:Partial<EditBody['rental']>)=>setDraft(o=>({...o,rental:{...o.rental,...v}}));
 const num=(label:string,value:number,on:(n:number)=>void,max=10000000,hint='')=><label className="pq-tile"><span>{label}</span><input inputMode="numeric" value={value?String(value):''} placeholder="0" onChange={e=>on(Math.min(max,Number(e.target.value.replace(/\D/g,''))||0))}/>{hint&&<small className="pe-hint">{hint}</small>}</label>;
 const count=(label:string,value:number,min:number,max:number,on:(n:number)=>void)=><div className="pq-tile"><span>{label}</span><div className="pq-counter"><button type="button" aria-label={label+': меньше'} disabled={value<=min} onClick={()=>on(value-1)}><Minus size={16}/></button><output aria-live="polite">{value}</output><button type="button" aria-label={label+': больше'} disabled={value>=max} onClick={()=>on(value+1)}><Plus size={16}/></button></div></div>;
 const chip=(key:string,label:string,on:boolean,press:()=>void,radio=false)=><button key={key} type="button" role={radio?'radio':'checkbox'} aria-checked={on} className="pq-chip" onClick={press}>{on&&!radio&&<Check size={14}/>}{label}</button>;
 const field=(label:string,value:string,on:(v:string)=>void,max=120,placeholder='')=><label className="pq-field"><span>{label}</span><input value={value} maxLength={max} placeholder={placeholder} onChange={e=>on(e.target.value)}/></label>;

 if(open){const title=EDIT_STEPS.find(s=>s.key===open)!.title;
  return <section ref={box} className="pq pe" aria-labelledby="pe-step-title">
   <header className="pe-bar"><button type="button" className="pq-icon" onClick={()=>{setOpen(null);setError('');}} aria-label="Назад к списку" disabled={busy}><ArrowLeft size={20}/></button><h2 id="pe-step-title">{title}</h2></header>
   <div className="pe-body">
    {open==='photos'&&<PhotoGrid photos={draft.photos} onChange={photos=>set({photos})} role={role} api={api} onBusy={setUploading} disabled={busy}/>}
    {open==='flat'&&<>
     <div className="pq-chips" role="radiogroup" aria-label="Тип жилья">{Object.entries(propertyTypes).map(([id,label])=>chip(id,label,d.type===id,()=>setD({type:id}),true))}</div>
     <div className="pq-two">{count('Комнаты',draft.rooms,1,20,n=>set({rooms:n}))}{count('Гостей',draft.capacity,1,50,n=>setDraft(o=>({...o,capacity:n,details:{...o.details,beds:Math.max(o.details.beds,n)}})))}{count('Спальных мест',d.beds,1,50,n=>setD({beds:n}))}{count('Санузлы',d.bathrooms,1,20,n=>setD({bathrooms:n}))}</div>
     <div className="pe-three">{num('Площадь, м²',d.area,n=>setD({area:n}),2000)}{num('Этаж',d.floor,n=>setD({floor:n}),100)}{num('Этажей',d.floors,n=>setD({floors:n}),100)}</div>
    </>}
    {open==='place'&&<>
     <div className="pq-two">{field('Город',draft.city,v=>set({city:v}),80)}{field('Район',draft.district,v=>set({district:v}),120,'Например, Центр')}</div>
     {field('Точный адрес',draft.address,v=>set({address:v}),300,'Улица, дом, квартира')}
     <p className="pe-hint">Адрес видит только гость с подтверждённой бронью. Метку на карте ставим по нему.</p>
    </>}
    {open==='text'&&<>
     {field('Название',draft.title,v=>set({title:v}),120)}
     <label className="pq-field"><span>Описание</span><textarea rows={6} maxLength={2500} value={draft.description} onChange={e=>set({description:e.target.value})}/></label>
     <p className={'pe-hint'+(draft.description.trim().length<80?' is-warn':'')}>{draft.description.trim().length} знаков{draft.description.trim().length<80?' · для показа гостям нужно от 80':''}</p>
    </>}
    {open==='amenities'&&<div className="pq-chips">{Object.entries(amenities).map(([id,label])=>{const on=d.amenities.includes(id);return chip(id,label,on,()=>setD({amenities:on?d.amenities.filter(a=>a!==id):[...d.amenities,id]}));})}</div>}
    {open==='prices'&&<>
     <div className="pq-two">{num('Сутки, ₸',draft.price,n=>set({price:n}))}{num('Час, ₸',r.hourlyPrice,n=>setR({hourlyPrice:n}),10000000,'0 — без почасовой')}{num('Ночь, ₸',r.nightlyPrice,n=>setR({nightlyPrice:n}),10000000,'0 — без ночной')}{num('Депозит, ₸',r.deposit,n=>setR({deposit:n}))}</div>
     {r.hourlyPrice>0&&<div className="pq-two">{count('Минимум часов',r.minHours,1,24,n=>setR({minHours:n}))}</div>}
    </>}
    {open==='checkin'&&<>
     <div className="pq-two"><label className="pq-tile"><span>Заезд с</span><input type="time" value={r.checkinTime} onChange={e=>setR({checkinTime:e.target.value})}/></label><label className="pq-tile"><span>Выезд до</span><input type="time" value={r.checkoutTime} onChange={e=>setR({checkoutTime:e.target.value})}/></label></div>
     <p className="pq-h">Как гость получит ключи</p>
     <div className="pq-chips" role="radiogroup" aria-label="Способ заселения">{Object.entries(checkinMethods).map(([id,label])=>chip(id,label,d.checkinMethod===id,()=>setD({checkinMethod:id}),true))}</div>
     <div className="pq-two">{num('Уборка между гостями, мин',draft.cleaningMinutes,n=>set({cleaningMinutes:n}),1440)}</div>
    </>}
    {open==='rules'&&<>
     <div className="pq-chips">{([['pets','Можно с питомцами'],['smoking','Можно курить'],['parties','Можно вечеринки']] as const).map(([k,label])=>chip(k,label,d[k],()=>setD({[k]:!d[k]})))}</div>
     <label className="pq-field"><span>Правила и возврат депозита</span><textarea rows={5} maxLength={2500} value={r.houseRules} placeholder="Тишина после 23:00, без шумных компаний. Депозит вернём в день выезда после проверки." onChange={e=>setR({houseRules:e.target.value})}/></label>
     <p className="pe-hint">Не пишите здесь коды замков и личные контакты.</p>
    </>}
    {error&&<p className="pq-error" role="alert">{error}</p>}
   </div>
   <div className="pe-save"><button type="button" className="pq-primary" disabled={busy||uploading} onClick={()=>commit(draft,open)}>{busy?'Сохраняю…':uploading?'Загружаю фото…':<><Check size={18}/>Сохранить</>}</button></div>
  </section>;
 }

 return <section ref={box} className="pq pe" aria-labelledby="pe-title">
  <header className="pe-head">
   <span className="pe-thumb">{base.photos[0]?<Photo id={base.photos[0]} role={role} alt="Обложка"/>:<Camera size={20}/>}</span>
   <div><h2 id="pe-title">{base.title||'Без названия'}</h2><p className={base.published?'is-on':''}>{base.published?'Гости видят на карте':'Скрыто от гостей'}</p></div>
   <button type="button" className="pq-icon pe-close" onClick={onClose} aria-label="Закрыть" disabled={busy}><X size={20}/></button>
  </header>
  <div className="pe-advice" role="status">
   <span className="pq-orb pq-orb-sm" aria-hidden="true"><Sparkles size={14}/></span>
   <div><p>{done&&<b>{done} </b>}{advice.text}</p>
    {error&&<p className="pe-advice-error" role="alert">{error}</p>}
    {advice.step&&<span className="pe-advice-actions">
     <button type="button" className="pq-send pe-go" disabled={busy} onClick={()=>advice.step==='publish'?commit({...base,published:true},'publish'):go(advice.step as EditStep)}>{busy&&advice.step==='publish'?'Сохраняю…':advice.action}</button>
     <button type="button" className="pe-later" onClick={()=>{setSkipped(v=>[...v,advice.step as string]);setDone('');}}>Не сейчас</button>
    </span>}
   </div>
  </div>
  <ul className="pe-list">
   {EDIT_STEPS.map(s=><li key={s.key}><button type="button" onClick={()=>go(s.key)} className={stepNeeds(base,s.key)?'needs':''}><span className="pe-ico">{ICONS[s.key]}</span><span className="pe-text"><strong>{s.title}</strong><small>{stepLine(base,s.key)}</small></span>{stepNeeds(base,s.key)&&<span className="pe-dot" aria-label="Нужно заполнить"/>}</button></li>)}
   <li className="pe-wide"><label className="pe-switch"><span className="pe-text"><strong>Показывать гостям</strong><small>{base.published?'Объявление на карте':'Черновик, видите только вы'}</small></span><input type="checkbox" role="switch" checked={base.published} disabled={busy} onChange={e=>commit({...base,published:e.target.checked},'publish')}/></label></li>
  </ul>
 </section>;
}
