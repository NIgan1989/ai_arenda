'use client';
import {useState} from 'react';
import {ChevronRight} from 'lucide-react';
import {journalClock,journalGroups,journalHref,journalMeta,type JournalLine} from '../lib/ai-move-marks';
import {goWorkspace} from '../lib/workspace-go';
import './ai-journal.css';

// The journal of the AI administrator: what it did for this person, as a timeline under the heads of the days,
// the newest first. An entry says the step, the home, and who and when; it opens the card of the cleaning or
// of the booking, the home, or the chat. Three entries are shown; the rest open in place.
export type JournalEntry=JournalLine;
export function AiJournal({entries,now,role}:{entries:JournalEntry[];now:number;role:string}){
 const [all,setAll]=useState(false),shown=all?entries:entries.slice(0,3);
 if(!entries.length)return <p className="ai-journal-empty">Здесь появится короткая запись о каждом действии ИИ: что подтвердил, кого назначил, о чём напомнил.</p>;
 return <div className="ai-journal">
  {journalGroups(shown,now).map(g=><section key={g.day}>
   <h4>{g.day}</h4>
   <ul>{g.lines.map((e,i)=>{
    const href=journalHref(role,e.open),meta=journalMeta(e);
    const body=<><i aria-hidden="true"/><span className="ai-journal-text"><span className="ai-journal-head"><b>{e.text}</b><time>{journalClock(e.at)}</time></span>{e.title&&<span>{e.title}</span>}{meta&&<small>{meta}</small>}</span>{href&&<ChevronRight size={16} aria-hidden="true"/>}</>;
    return <li key={e.at+':'+i}>{href?<button type="button" className="ai-journal-line" onClick={()=>goWorkspace(href)}>{body}</button>:<div className="ai-journal-line">{body}</div>}</li>;
   })}</ul>
  </section>)}
  {entries.length>3&&<button type="button" className="ai-journal-more" aria-expanded={all} onClick={()=>setAll(v=>!v)}>{all?'Свернуть':'Показать все · '+entries.length}</button>}
 </div>;
}
