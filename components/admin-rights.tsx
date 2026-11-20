'use client';
import {useState} from 'react';
import {FileCheck2,ShieldOff,EyeOff} from 'lucide-react';
import {Button} from './ui/button';

type Row=Record<string,any>;
type Save=(path:string,body:Row)=>Promise<Row|undefined>;
const kinds:Row={owner:'Собственник',sublease:'Субаренда (с согласием собственника)'};

async function get(path:string){const r=await fetch('/api/admin/'+path,{cache:'no-store'}),v=await r.json() as Row;if(!r.ok)throw Error(v.error||'Не удалось открыть.');return v;}

// The owner's proof of the right to let the place (lib/property-rights.ts): seen only here, by the platform administrator.
export function RightDocsAdmin({propertyId}:{propertyId:string}){
 const [docs,setDocs]=useState<Row[]|null>(null),[names,setNames]=useState<Row|null>(null),[error,setError]=useState('');
 async function open(){if(docs)return;try{const v=await get('rights?propertyId='+encodeURIComponent(propertyId));setNames(v.names||null);setDocs(await Promise.all((v.docs||[]).map(async(d:Row)=>({...d,uri:(await get('rights/photo?id='+encodeURIComponent(d.id)).catch(()=>null))?.data||''}))));}catch(e:any){setError(e.message);}}
 return <details className="admin-rights" onToggle={e=>{if((e.target as HTMLDetailsElement).open)void open();}}>
  <summary><FileCheck2 size={15}/>Документ о праве сдавать</summary>
  {error?<p role="alert">{error}</p>:!docs?<p>Загружаем…</p>:!docs.length?<p>Документ не приложен. Одобрить жильё нельзя, пока владелец его не приложит.</p>:docs[0].checked_at?<p>{kinds[docs[0].kind]||docs[0].kind}: проверено, фото удалено после проверки.</p>:<>
   <p>{kinds[docs[0].kind]||docs[0].kind}. ФИО в документе должно совпадать с владельцем и получателем Kaspi, адрес — с объявлением.</p>
   {names&&<dl className="admin-rights-names"><div><dt>Профиль</dt><dd>{names.profile||'—'}</dd></div><div><dt>Получатель Kaspi</dt><dd>{names.recipient||'реквизиты не указаны'}{names.pendingRecipient?' (меняется на «'+names.pendingRecipient+'»)':''}</dd></div></dl>}
   <div className="admin-rights-photos">{docs.map(d=><a key={d.id} href={d.uri} target="_blank" rel="noreferrer"><img src={d.uri} alt="Документ о праве" width={120} height={120}/></a>)}</div>
   <small>После одобрения фото документа удаляется, остаётся только отметка о проверке.</small>
  </>}
 </details>;
}

/** Asked before a place is approved: the administrator confirms the names match (lib/platform-admin.ts, namesChecked). */
export const namesMatch=()=>window.confirm('ФИО в документе о праве совпадает с владельцем и с получателем Kaspi?');

// «Снять с показа» and «Заблокировать владельца»: always with a reason the owner reads.
export function RestrictActions({propertyId,ownerId,restriction,busy,save}:{propertyId:string;ownerId:string;restriction?:string|null;busy:boolean;save:Save}){
 const [error,setError]=useState('');
 const ask=(text:string)=>{const v=window.prompt(text)?.trim();if(!v)setError('Нужна причина: её увидит владелец.');return v;};
 return <div className="admin-property-actions">
  <Button variant="outline" disabled={busy} onClick={()=>{const reason=ask('Почему снимаете жильё с показа?');if(reason)void save('properties/unlist',{propertyId,reason});}}><EyeOff size={16}/>Снять с показа</Button>
  {restriction?<Button variant="outline" disabled={busy} onClick={()=>{const reason=ask(restriction==='hold'?'Почему снимаете паузу (жалоба не подтвердилась)?':'Почему разблокируете владельца?');if(reason)void save('restrictions/decide',{userId:ownerId,action:'lift',reason});}}>{restriction==='hold'?'Снять паузу':'Разблокировать владельца'}</Button>
   :null}
  {restriction!=='blocked'&&<Button variant="destructive" disabled={busy} onClick={()=>{const reason=ask('Почему блокируете владельца? Все его входы завершатся, объекты скроются.');if(reason)void save('restrictions/decide',{userId:ownerId,action:'block',reason});}}><ShieldOff size={16}/>Заблокировать владельца</Button>}
  {!!error&&<small role="alert">{error}</small>}
 </div>;
}
