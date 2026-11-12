'use client';
import {useState} from 'react';
import {Star} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Textarea} from '@/components/ui/textarea';
import './stay-review.css';

// The guest rates a completed stay: five stars and an optional note for the owner.
const words=['','Плохо','Так себе','Нормально','Хорошо','Отлично'];
export function StayReview({subject,busy,onSubmit}:{subject:string;busy:boolean;onSubmit:(rating:number,text:string)=>void}){
 const [rating,setRating]=useState(0),[text,setText]=useState('');
 return <form className="inline-card stay-review" onSubmit={e=>{e.preventDefault();if(rating)onSubmit(rating,text.trim());}}>
  <strong>{subject}</strong>
  <div className="stay-review-stars" role="radiogroup" aria-label="Оценка проживания">
   {[1,2,3,4,5].map(n=><button key={n} type="button" role="radio" aria-checked={rating===n} aria-label={n+' из 5'} className={n<=rating?'is-on':''} onClick={()=>setRating(n)} disabled={busy}><Star size={32} aria-hidden="true"/></button>)}
  </div>
  <small aria-live="polite">{rating?words[rating]:'Выберите оценку'}</small>
  <Textarea value={text} onChange={e=>setText(e.target.value)} maxLength={1000} placeholder="Что понравилось или что улучшить (необязательно)" aria-label="Отзыв для владельца"/>
  <Button className="inline-button" disabled={busy||!rating}>Отправить оценку</Button>
 </form>;
}
