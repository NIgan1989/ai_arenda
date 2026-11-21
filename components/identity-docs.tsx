'use client';
import {useCallback,useEffect,useState} from 'react';

// «Удостоверение личности» on the website (lib/identity-docs.ts): the same card as in the app, so a guest who books
// in the browser can attach the ID too. The photo is seen only by the participant and the platform administrators.
type Doc={id:string;checked_at:number|null};
type Reply={checked?:boolean;docs?:Doc[];message?:string;error?:string};
async function call(role:string,path:string,body?:Record<string,unknown>):Promise<Reply>{
 const response=await fetch('/api/operations/'+path,{cache:'no-store',method:body?'POST':'GET',headers:{'X-Workspace-Role':role,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
 const value=(await response.json().catch(()=>({}))) as Reply;if(!response.ok)throw Error(value.error||'Не удалось выполнить действие.');return value;
}
// The server takes a JPEG up to 1600 px and about 350 KB.
async function jpeg(file:File){
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>15*1024*1024)throw Error('Выберите JPEG, PNG или WebP до 15 МБ.');
 const url=URL.createObjectURL(file);try{const img=new Image();img.src=url;await img.decode();
  const scale=Math.min(1,1600/Math.max(img.width,img.height)),canvas=document.createElement('canvas');canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);
  canvas.getContext('2d')!.drawImage(img,0,0,canvas.width,canvas.height);
  for(const quality of [.85,.7,.55,.4]){const data=canvas.toDataURL('image/jpeg',quality);if(data.length<460000)return data;}
  throw Error('Не удалось уменьшить фото. Выберите другой снимок.');
 }finally{URL.revokeObjectURL(url);}
}
export function IdentityDocs({role}:{role:string}){
 const [docs,setDocs]=useState<Doc[]>([]),[checked,setChecked]=useState(false),[busy,setBusy]=useState(false),[said,setSaid]=useState<{text:string;error:boolean}|null>(null);
 const fetchDocs=useCallback(async()=>{const v=await call(role,'identity');return {checked:!!v.checked,docs:((v.docs||[]) as Doc[]).filter(d=>!d.checked_at)};},[role]);
 const load=async()=>{const v=await fetchDocs();setChecked(v.checked);setDocs(v.docs);};
 useEffect(()=>{let live=true;fetchDocs().then(v=>{if(live){setChecked(v.checked);setDocs(v.docs);}}).catch(()=>{});return()=>{live=false;};},[fetchDocs]);
 async function add(file?:File){if(!file)return;setBusy(true);setSaid(null);try{const v=await call(role,'identity/save',{data:await jpeg(file)});setSaid({text:v.message||"",error:false});await load();}catch(e){setSaid({text:e instanceof Error&&e.message?e.message:'Не удалось приложить фото.',error:true});}finally{setBusy(false);}}
 async function remove(id:string){setBusy(true);setSaid(null);try{const v=await call(role,'identity/remove',{id});setSaid({text:v.message||"",error:false});await load();}catch(e){setSaid({text:e instanceof Error&&e.message?e.message:'Не удалось убрать фото.',error:true});}finally{setBusy(false);}}
 const why=role==='guest'?'Нужно один раз перед первой заявкой на бронь: так владелец знает, что гость настоящий.':role==='owner'?'Нужно для проверки жилья: администратор сверит ФИО с документом о праве и получателем Kaspi.':'Нужно для допуска к уборкам: владелец знает, кого впускает.';
 return <section className="acct-group" aria-label="Удостоверение личности" style={{padding:16,display:'grid',gap:8}}>
  <strong>Удостоверение личности</strong>
  <small>{checked?'Личность подтверждена администратором. Фото удалено после проверки.':docs.length?'Фото приложено ('+docs.length+' из 2). Администратор сверит его с профилем, затем фото удалится.':why}</small>
  {!checked&&docs.map((d,i)=><span key={d.id}>{i?'Обратная сторона':'Лицевая сторона'} · <button type="button" className="inline-button secondary" disabled={busy} onClick={()=>void remove(d.id)}>Убрать</button></span>)}
  {!checked&&docs.length<2&&<label className="inline-button">{busy?'Прикладываю…':docs.length?'Добавить обратную сторону':'Приложить фото удостоверения'}<input type="file" hidden accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e=>{void add(e.target.files?.[0]);e.target.value='';}}/></label>}
  {said&&<small role="status" style={said.error?{color:'var(--danger, #b42318)'}:undefined}>{said.text}</small>}
  <small>🔒 Фото видит только администратор сервиса</small>
 </section>;
}
