'use client';
// Adding a flat in two moves: the owner tells the AI about it in one message, then checks the card
// the AI filled. The AI asks only what it could not read (address, district, daily price) — one
// question at a time, like the administrator in the chat. The long form stays for editing later.
import {useEffect,useMemo,useRef,useState} from 'react';
import {ArrowLeft,ArrowUp,Building2,Camera,Check,MapPin,Minus,Plus,Sparkles,X} from 'lucide-react';
import {Photo,preparePhoto} from './media';
import {PhotoGrid} from './photo-grid';
import {amenities,checkinMethods,propertyTypes} from '../lib/listings';
import {DRAFT_EXAMPLE,answerDraft,draftDescription,draftListingBody,draftQuestions,draftRules,draftTitle,emptyDraft,moneyAnswer,readListingText,type ListingDraft} from '../lib/listing-draft';
import {plural} from '../lib/map-search-request';
import './property-quick.css';
type Row=Record<string,any>;
type API=(path:string,body?:Row)=>Promise<any>;
type Saved={id:string;message:string;published:boolean;placed?:boolean};
const money=(n:number)=>new Intl.NumberFormat('ru-RU').format(n)+' ₸';
const STEPS=['Расскажите','Проверьте','Готово'];
const RULES:[keyof ListingDraft,string][]=[['pets','Можно с питомцами'],['smoking','Можно курить'],['parties','Можно вечеринки']];

export function PropertyQuick({city,role,api,onSave,onGuestMode,onPlace,onClose,onMap,onDone}:{city:string;role:string;api:API;onSave:(body:Row)=>Promise<Row>;onGuestMode:(body:Row)=>Promise<unknown>;onPlace?:(body:Row)=>Promise<unknown>;onClose:()=>void;onMap?:(id:string)=>void;onDone:(saved:Saved)=>void}){
 const [step,setStep]=useState(0),[text,setText]=useState(''),[draft,setDraft]=useState<ListingDraft>(()=>emptyDraft(city)),[found,setFound]=useState<string[]>([]);
 const [photos,setPhotos]=useState<string[]>([]),[uploading,setUploading]=useState(false),[answer,setAnswer]=useState(''),[mode,setMode]=useState<'auto'|'manual'>('auto');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState<Saved|null>(null);
 const fileRef=useRef<HTMLInputElement>(null),answerRef=useRef<HTMLInputElement>(null);
 // The keyboard opens by itself only with a mouse and keyboard; on a phone it waits for a tap.
 const box=useRef<HTMLElement>(null),first=useRef(true);
 // Each new step starts at the sheet's top, not where the previous one was scrolled to.
 useEffect(()=>{if(first.current){first.current=false;return;}box.current?.scrollIntoView({block:'start',behavior:'smooth'});},[step]);
 const [fine]=useState(()=>typeof window!=='undefined'&&window.matchMedia?.('(pointer:fine)').matches);
 const questions=useMemo(()=>{const q=draftQuestions(draft);return mode==='auto'&&!(draft.cleaningFee>=100)?[...q,{key:'cleaningFee' as const,label:'Уборка',question:'Сколько вы платите за уборку после гостя? ИИ будет заказывать её сам.',placeholder:'Например, 3 000'}]:q;},[draft,mode]);
 const ask=questions[0];
 const patch=(value:Partial<ListingDraft>)=>setDraft(d=>({...d,...value,known:[...new Set([...d.known,...Object.keys(value)])]}));
 const guessed=(key:string)=>!draft.known.includes(key);

 function read(){if(!text.trim())return;const r=readListingText(text,draft);setDraft(r.draft);setFound(r.found);setError('');setStep(1);}
 function reply(e:React.FormEvent){e.preventDefault();if(!ask||!answer.trim())return;
  if(ask.key==='cleaningFee'){const v=moneyAnswer(answer);if(v>=100)patch({cleaningFee:v});else{setError('Напишите сумму числом, от 100 ₸.');return;}}
  else setDraft(d=>answerDraft(d,ask.key,answer));
  setAnswer('');setError('');if(fine)requestAnimationFrame(()=>answerRef.current?.focus());}
 async function addPhotos(files:FileList|null){if(!files?.length)return;setUploading(true);setError('');try{for(const file of Array.from(files).slice(0,8-photos.length)){const data=await preparePhoto(file),r=await api('media',{kind:'property',data});setPhotos(v=>v.length<8&&!v.includes(r.id)?[...v,r.id]:v);}}catch(e:any){setError(e.message||'Фото не загрузилось.');}finally{setUploading(false);}}
 async function save(){
  if(busy||uploading||questions.length)return;setBusy(true);setError('');
  try{
   let result:Row,published=photos.length>0;
   try{result=await onSave(draftListingBody(draft,photos,published));}
   catch(e:any){if(!published||!/провер|допуск/i.test(String(e?.message)))throw e;published=false;result=await onSave(draftListingBody(draft,photos,false));}
   // The flat goes on the map by its address right away; the owner only checks the pin.
   let placed=false;try{placed=!!((await onPlace?.({propertyId:result.id})) as Row|undefined)?.saved;}catch{/* the map pin can be set later */}
   let note='';try{await onGuestMode({propertyId:result.id,mode,cleaningFee:mode==='auto'?draft.cleaningFee:undefined});}catch(e:any){note=' '+(e?.message||'Режим ответов гостям включите в «Запросах гостей».');}
   const done={id:result.id,published,placed,message:(published?'Квартира опубликована, гости уже видят её на карте.':photos.length?'Сохранена черновиком: чтобы показать гостям, пройдите проверку в «Управление → Допуск».':'Сохранена черновиком. Добавьте фото, и её можно будет показать гостям.')+note};
   setSaved(done);setStep(2);
  }catch(e:any){setError(e?.message||'Не удалось сохранить квартиру.');}finally{setBusy(false);}
 }
 const priceLine=[draft.price>=100&&money(draft.price)+' / сутки',draft.hourlyPrice>=100&&money(draft.hourlyPrice)+' / час',draft.nightlyPrice>=100&&money(draft.nightlyPrice)+' / ночь'].filter(Boolean).join(' · ');

 return <section ref={box} className="pq" aria-labelledby="pq-title" onFocus={e=>{const t=e.target as HTMLElement;if(fine||!t.matches('input,textarea'))return;
  // The phone keyboard covers the lower half: once it is up, bring the field into the middle of what is left.
  setTimeout(()=>t.scrollIntoView({block:'center',behavior:'smooth'}),350);}}>
  <header className="pq-head"><span className="pq-orb" aria-hidden="true"><Sparkles size={18}/></span><div><h2 id="pq-title">Новая квартира</h2><p>{['ИИ заполнит объявление по вашему рассказу','ИИ заполнил карточку. Проверьте и поправьте','Квартира добавлена'][step]}</p></div>{step<2&&<button type="button" className="pq-icon" onClick={onClose} aria-label="Закрыть" disabled={busy}><X size={20}/></button>}</header>
  <ol className="pq-steps" aria-label={'Шаг '+(step+1)+' из 3'}>{STEPS.map((s,i)=><li key={s} className={i<step?'is-done':i===step?'is-now':''} aria-current={i===step?'step':undefined}><span>{i<step?<Check size={12}/>:i+1}</span>{s}</li>)}</ol>
  {error&&<p className="pq-error" role="alert">{error}</p>}

  {step===0&&<div className="pq-body">
   <label className="pq-line"><span className="pq-sr">Расскажите о квартире</span><textarea value={text} onChange={e=>setText(e.target.value)} rows={5} maxLength={2000} autoFocus={fine} placeholder="Например: однушка на Торайгырова 64, 4 этаж, до 3 гостей, есть Wi-Fi и стиралка, 15 000 в сутки, 2 500 в час" onKeyDown={e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey))read();}}/>
    <span className="pq-line-bar"><button type="button" className="pq-chip" onClick={()=>setText(DRAFT_EXAMPLE)}>Пример</button><span className="pq-count">{text.length? text.length+' / 2000':'Порядок не важен'}</span></span></label>
   <PhotoGrid photos={photos} onChange={setPhotos} role={role} api={api} onBusy={setUploading}/>
   <p className="pq-hint">ИИ поймёт комнаты, этаж, площадь, гостей, цены за сутки и час, удобства, правила и адрес. Фото можно добавить и потом.</p>
   <div className="pq-actions"><button type="button" className="pq-primary" disabled={!text.trim()||uploading} onClick={read}><Sparkles size={18}/>Заполнить с ИИ</button></div>
  </div>}

  {step===1&&<div className="pq-body">
   {ask?<form className="pq-ask" onSubmit={reply}>
    <span className="pq-orb pq-orb-sm" aria-hidden="true"><Sparkles size={14}/></span>
    <div><p className="pq-ask-q">{ask.question}</p><p className="pq-ask-left">{questions.length>1?'Ещё вопросов: '+(questions.length-1):'Последний вопрос'}</p>
     <span className="pq-ask-row"><input ref={answerRef} aria-label={ask.label} value={answer} onChange={e=>setAnswer(e.target.value)} placeholder={ask.placeholder} autoFocus={fine} inputMode={ask.key==='price'||ask.key==='cleaningFee'?'numeric':'text'}/><button className="pq-send" disabled={!answer.trim()} aria-label="Ответить"><ArrowUp size={20}/></button></span></div>
   </form>:<p className="pq-ready"><Check size={16}/>Всё нужное есть. {found.length?'ИИ понял из рассказа: '+found.length+' '+plural(found.length,'деталь','детали','деталей')+'.':''}</p>}
   <article className="pq-preview">
    <div className="pq-cover">{photos[0]?<Photo id={photos[0]} role={role} alt="Обложка"/>:<span className="pq-cover-empty"><Building2 size={30}/><button type="button" onClick={()=>fileRef.current?.click()}><Camera size={16}/>{uploading?'Загружаю…':'Добавить фото'}</button></span>}<span className="pq-cover-tag">{photos.length?'Увидят гости':'Черновик без фото'}</span>{photos.length>1&&<span className="pq-cover-count">{photos.length} фото</span>}</div>
    <input ref={fileRef} type="file" hidden multiple accept="image/jpeg,image/png,image/webp" onChange={e=>{void addPhotos(e.target.files);e.target.value='';}}/>
    <div className="pq-preview-body">
     <input className="pq-title" aria-label="Название" value={draftTitle(draft)} maxLength={120} onChange={e=>patch({title:e.target.value})}/>
     <p className="pq-where"><MapPin size={14}/>{[draft.district||'Район не указан',draft.city].filter(Boolean).join(' · ')}</p>
     <p className="pq-price">{priceLine||'Цена не указана'}</p>
    </div>
   </article>

   <h3 className="pq-h">Квартира</h3>
   <div className="pq-chips" role="radiogroup" aria-label="Тип жилья">{Object.entries(propertyTypes).map(([id,label])=><button key={id} type="button" role="radio" aria-checked={draft.type===id} className="pq-chip" onClick={()=>patch({type:id})}>{label}</button>)}</div>
   <div className="pq-grid">
    <Counter label="Комнаты" value={draft.rooms} min={1} max={20} guessed={guessed('rooms')} onChange={v=>patch({rooms:v})}/>
    <Counter label="Гостей" value={draft.capacity} min={1} max={50} guessed={guessed('capacity')} onChange={v=>setDraft(d=>({...d,capacity:v,beds:Math.max(d.beds,v),known:[...new Set([...d.known,'capacity'])]}))}/>
    <Num label="Площадь, м²" value={draft.area} min={5} max={2000} guessed={guessed('area')} onChange={v=>patch({area:v})}/>
    <label className="pq-tile"><span>Этаж{guessed('floor')&&<em>ИИ предположил</em>}</span><span className="pq-pair"><input type="number" inputMode="numeric" min={0} max={100} value={draft.floor} onChange={e=>patch({floor:Math.max(0,Number(e.target.value)||0)})} aria-label="Этаж"/>из<input type="number" inputMode="numeric" min={1} max={100} value={draft.floors} onChange={e=>patch({floors:Math.max(1,Number(e.target.value)||1)})} aria-label="Этажей в доме"/></span></label>
   </div>
   <label className="pq-field"><span>Точный адрес · видят только гость с бронью и уборщица</span><input value={draft.address} maxLength={300} placeholder="Улица, дом, квартира" onChange={e=>patch({address:e.target.value})}/></label>
   <div className="pq-two"><label className="pq-field"><span>Район</span><input value={draft.district} maxLength={120} onChange={e=>patch({district:e.target.value})}/></label><label className="pq-field"><span>Город</span><input value={draft.city} maxLength={80} onChange={e=>patch({city:e.target.value})}/></label></div>

   <h3 className="pq-h">Цены</h3>
   <div className="pq-grid">
    <Num label="Сутки, ₸" value={draft.price} min={0} max={10000000} step={500} onChange={v=>patch({price:v})}/>
    <Num label="Час, ₸ · 0 — нет" value={draft.hourlyPrice} min={0} max={10000000} step={500} onChange={v=>patch({hourlyPrice:v})}/>
    <Num label="Ночь, ₸ · 0 — нет" value={draft.nightlyPrice} min={0} max={10000000} step={500} onChange={v=>patch({nightlyPrice:v})}/>
    <Num label="Депозит, ₸" value={draft.deposit} min={0} max={10000000} step={1000} onChange={v=>patch({deposit:v})}/>
   </div>

   <h3 className="pq-h">Удобства</h3>
   <div className="pq-chips">{Object.entries(amenities).map(([id,label])=>{const on=draft.amenities.includes(id);return <button key={id} type="button" aria-pressed={on} className="pq-chip" onClick={()=>patch({amenities:on?draft.amenities.filter(a=>a!==id):[...draft.amenities,id]})}>{on&&<Check size={13}/>}{label}</button>;})}</div>

   <h3 className="pq-h">Правила и заселение</h3>
   <div className="pq-chips">{RULES.map(([key,label])=><button key={key} type="button" aria-pressed={!!draft[key]} className="pq-chip" onClick={()=>patch({[key]:!draft[key]} as Partial<ListingDraft>)}>{!!draft[key]&&<Check size={13}/>}{label}</button>)}</div>
   <div className="pq-grid">
    <label className="pq-tile"><span>Заезд с</span><input type="time" value={draft.checkinTime} onChange={e=>patch({checkinTime:e.target.value})}/></label>
    <label className="pq-tile"><span>Выезд до</span><input type="time" value={draft.checkoutTime} onChange={e=>patch({checkoutTime:e.target.value})}/></label>
    <label className="pq-tile pq-wide"><span>Как гость получит ключи</span><select value={draft.checkinMethod} onChange={e=>patch({checkinMethod:e.target.value})}>{Object.entries(checkinMethods).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
   </div>

   <details className="pq-more"><summary>Текст объявления и правила · ИИ написал сам</summary>
    <label className="pq-field"><span>Описание для гостей</span><textarea rows={5} maxLength={2500} value={draftDescription(draft)} onChange={e=>setDraft(d=>({...d,description:e.target.value}))}/></label>
    <label className="pq-field"><span>Правила проживания</span><textarea rows={3} maxLength={2500} value={draftRules(draft)} onChange={e=>setDraft(d=>({...d,houseRules:e.target.value}))}/></label>
   </details>

   <h3 className="pq-h">Кто отвечает гостям</h3>
   <div className="pq-mode" role="radiogroup" aria-label="Кто отвечает гостям">
    <button type="button" role="radio" aria-checked={mode==='auto'} onClick={()=>setMode('auto')}><strong><Sparkles size={15}/>ИИ</strong><small>Отвечает за минуту, подтверждает бронь и заказывает уборку</small></button>
    <button type="button" role="radio" aria-checked={mode==='manual'} onClick={()=>setMode('manual')}><strong>Я сам</strong><small>Запросы приходят вам, вы решаете</small></button>
   </div>
   {mode==='auto'&&draft.cleaningFee>=100&&<Num label="Уборка после гостя, ₸" value={draft.cleaningFee} min={100} max={1000000} step={500} onChange={v=>patch({cleaningFee:v})}/>}

   <div className="pq-actions pq-sticky"><button type="button" className="pq-ghost" onClick={()=>setStep(0)} disabled={busy}><ArrowLeft size={16}/>Назад</button><button type="button" className="pq-primary" disabled={busy||uploading||!!questions.length} onClick={save}>{busy?'Сохраняю…':photos.length?'Опубликовать':'Сохранить черновик'}</button></div>
  </div>}

  {step===2&&saved&&<div className="pq-body pq-done">
   <span className="pq-done-mark" aria-hidden="true"><Check size={28}/></span>
   <h3>{draftTitle(draft)}</h3><p>{saved.message}</p>
   <p className="pq-done-mode">{(saved.placed?'Метку на карте ИИ поставил сам по адресу. ':'')+(mode==='auto'?'Гостям отвечает ИИ: он подтвердит бронь по вашим ценам и закажет уборку.':'Запросы гостей будут приходить вам.')}</p>
   <div className="pq-actions pq-stack">{onMap&&<button type="button" className="pq-primary" onClick={()=>onMap(saved.id)}><MapPin size={18}/>{saved.placed?'Проверить метку на карте':'Отметить дом на карте'}</button>}<button type="button" className={onMap?'pq-ghost':'pq-primary'} onClick={()=>onDone(saved)}>Готово</button></div>
  </div>}
 </section>;
}
function Counter({label,value,min,max,guessed,onChange}:{label:string;value:number;min:number;max:number;guessed?:boolean;onChange:(v:number)=>void}){
 return <div className="pq-tile"><span>{label}{guessed&&<em>ИИ предположил</em>}</span><span className="pq-counter"><button type="button" aria-label={label+': меньше'} disabled={value<=min} onClick={()=>onChange(Math.max(min,value-1))}><Minus size={16}/></button><output aria-live="polite">{value}</output><button type="button" aria-label={label+': больше'} disabled={value>=max} onClick={()=>onChange(Math.min(max,value+1))}><Plus size={16}/></button></span></div>;
}
function Num({label,value,min,max,step=1,guessed,onChange}:{label:string;value:number;min:number;max:number;step?:number;guessed?:boolean;onChange:(v:number)=>void}){
 return <label className="pq-tile"><span>{label}{guessed&&<em>ИИ предположил</em>}</span><input type="number" inputMode="numeric" min={min} max={max} step={step} value={value||''} placeholder="0" onChange={e=>onChange(Math.max(0,Math.min(max,Number(e.target.value)||0)))}/></label>;
}
