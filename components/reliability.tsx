'use client';
import {ShieldCheck,Sparkles,Star} from 'lucide-react';
import type {Reliability} from '../lib/reliability-text';
import {reliabilityShort} from '../lib/reliability-text';
import './reliability.css';
// The reliability rating: a score out of five with what it is made of.
export function ReliabilityBadge({value,compact=false,title}:{value?:Reliability|null;compact?:boolean;title?:string}){
 if(!value)return null;
 if(compact)return <span className={'reliability-chip is-'+value.level} title={value.label+(value.facts.length?': '+value.facts.join(', '):'')}>{value.score===null?<Sparkles size={13} aria-hidden="true"/>:<Star size={13} aria-hidden="true"/>}{value.score===null?'новый':reliabilityShort(value).slice(2)}</span>;
 return <div className={'reliability is-'+value.level} role="group" aria-label={(title||'Надёжность')+': '+value.label}>
  <span className="reliability-score">{value.score===null?<Sparkles size={18} aria-hidden="true"/>:<><Star size={16} aria-hidden="true"/>{value.score.toFixed(1).replace('.',',')}</>}</span>
  <span className="reliability-text">{title&&<small>{title}</small>}<strong>{value.label}</strong>{value.facts.length>0&&<span>{value.facts.join(' · ')}</span>}</span>
  {value.level==='excellent'&&<ShieldCheck size={18} className="reliability-mark" aria-hidden="true"/>}
 </div>;
}
// What moves the rating, per role, in one line each.
export const reliabilityHints:Record<string,string[]>={
 guest:['Подтвердите телефон','Выезжайте вовремя и без споров','Не отменяйте подтверждённые брони'],
 owner:['Отвечайте на заявки за 30 минут','Не отменяйте подтверждённые брони','Держите жильё в порядке: гости ставят оценку'],
 cleaner:['Приходите на принятые уборки','Сдавайте отчёт с фото с первого раза','Отвечайте на предложения']
};
