'use client';
import {Thinking} from './thinking';
import {useRef,useState,type FormEvent} from 'react';
import {ArrowUpRight,Check} from 'lucide-react';
import {Button} from './ui/button';
import {Textarea} from './ui/textarea';
import {JobOperations} from './job-operations';
import './flow-release.css';
import './cleaning-report.css';
type Row=Record<string,any>;
const tasks=['Кухня и санузел убраны','Бельё заменено','Мусор вынесен, поверхности чистые','Вода и электроприборы проверены'];
export function CleaningReport({job,role,busy,onSubmit,onChanged}:{job?:Row;role:string;busy:boolean;onSubmit:(body:Row)=>Promise<unknown>;onChanged:()=>Promise<unknown>}){
 const [checked,setChecked]=useState(tasks.map(()=>false)),[sending,setSending]=useState(false),[error,setError]=useState(''),[photos,setPhotos]=useState<Row[]>([]),lock=useRef(false);
 const completed=checked.filter(Boolean).length,allowed=role==='cleaner'&&job?.status==='in_progress',has=(p:string)=>photos.some(v=>v.phase===p);
 const steps=[has('before'),has('after'),completed===tasks.length],done=steps.filter(Boolean).length;
 async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();if(busy||lock.current||!allowed)return;if(!checked.every(Boolean)){setError('Проверьте и отметьте каждый пункт чек-листа.');return;}const report=String(new FormData(event.currentTarget).get('report')||'').trim();if(!report){setError('Опишите результат уборки.');return;}lock.current=true;setSending(true);setError('');try{await onSubmit({report,checklist:checked});}catch(e){setError(e instanceof Error?e.message:'Не удалось отправить отчёт. Материалы и текст сохранены на экране.');}finally{lock.current=false;setSending(false);}}
 return <section className="inline-card cleaning-report" aria-label="Отчёт об уборке">
 <header className="report-head"><div><h2>Отчёт об уборке</h2><p>{job?.title||'Карточка задания'}</p></div>{job?.fee!==undefined&&<span className="report-fee">{new Intl.NumberFormat('ru-RU').format(job.fee)} ₸</span>}</header>
 {allowed&&<ol className="report-steps" aria-label={'Готово '+done+' из 3'}>{['Фото до','Фото после','Чек-лист'].map((label,i)=><li key={label} className={steps[i]?'is-done':''}><span>{steps[i]?<Check size={12} strokeWidth={3}/>:i+1}</span>{label}</li>)}</ol>}
 {!allowed&&<div className="flow-notice important">{!job?'Данные задания ещё не загружены.':job.status==='submitted'?'Отчёт отправлен. Ожидаем проверку владельца.':job.status==='approved'?'Владелец принял работу.':'Отчёт можно отправить только по вашей текущей уборке после её начала.'}<Button type="button" variant="outline" disabled={busy} onClick={()=>void onChanged()}>Обновить задание</Button></div>}
 <div className="report-layout"><section aria-label="Фотографии и видео">{job&&<JobOperations job={job} role={role} onChanged={onChanged} onPhotos={setPhotos}/>}</section>
 <form onSubmit={submit}><fieldset className="report-checklist" disabled={busy||sending||!allowed}><legend>Чек-лист<span aria-live="polite">{completed} из {tasks.length}</span></legend><div className="report-checklist-list">{tasks.map((task,index)=><label key={task}><input type="checkbox" name={'check'+index} checked={checked[index]} required onChange={event=>setChecked(value=>value.map((v,i)=>i===index?event.target.checked:v))}/><span className="report-check" aria-hidden="true"><Check size={14} strokeWidth={3}/></span><span>{task}</span></label>)}</div></fieldset>
 <label className="report-comment"><span>Комментарий</span><Textarea name="report" required maxLength={1500} rows={3} disabled={busy||sending||!allowed} placeholder="Что сделано, что заметили в квартире"/></label>
 {error&&<p className="flow-error" role="alert">{error}</p>}<Button type="submit" className="report-submit" disabled={busy||sending||!allowed||completed!==tasks.length}>{sending||busy?<><Thinking size="sm" tone="plain" lead/>Отправляем…</>:<>Отправить на проверку<ArrowUpRight size={17}/></>}</Button><small className="report-foot">Владелец проверит отчёт и примет работу. Без кодов доступа и личных контактов в тексте.</small></form></div></section>;
}
