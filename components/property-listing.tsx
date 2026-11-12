'use client';
import {Button} from '@/components/ui/button';
import {useState} from 'react';
import {MapPin,BedDouble,Users,Maximize2,ChevronRight,Check,Pencil,Building2} from 'lucide-react';
import './flow-release.css';
import './listing-compact.css';
import {PropertyGallery} from './property-gallery';
import {propertyTypes,amenities,checkinMethods} from '../lib/listings';
import {clock} from '../lib/rental-policy';
import {plural} from '../lib/map-search-request';
type Row=Record<string,any>;
type API=(path:string,body?:Row)=>Promise<any>;
const money=(n:number)=>new Intl.NumberFormat('ru-RU').format(n)+' ₸';
export function StatusBadge({status}:{status?:Row}){return <span className={'listing-status tone-'+(status?.tone||'neutral')}><span/>{status?.label||'Статус уточняется'}</span>;}
export function PropertyListing({property:p,role,onChoose,onEdit,onSettings,publicView=false,billingMode='daily',actionLabel,compact=false}:{compact?:boolean;property:Row;role:string;onChoose:()=>void;onEdit?:()=>void;onSettings?:()=>void;publicView?:boolean;billingMode?:'daily'|'hourly';actionLabel?:string}){
 const [expanded,setExpanded]=useState(false),d=p.details||{},photos=p.photos||[],policy=p.policy||{};
 return <article className={'property-listing'+(compact?' listing-compact'+(expanded?' is-open':''):'')}>
 <div className="listing-visual">{String(p.description||'').startsWith('СИНТЕТИЧЕСКОЕ ОБЪЯВЛЕНИЕ')?<div className="listing-synthetic" role="img" aria-label="Схема учебного объявления"><Building2/><span>Учебное объявление</span><small>Реальной квартиры по этому описанию нет</small></div>:<PropertyGallery photos={photos} publicView={publicView} role={role} title={p.title}/>}<div className="listing-badges"><StatusBadge status={p.display_status}/>{p.demo_owner&&<span className="tag">Учебный объект</span>}</div></div>
 <div className="listing-body"><div className="card-meta"><MapPin size={14}/>{p.city} · {p.district}</div><h2>{p.title}</h2><div className="listing-specs"><span><Building2 size={15}/>{propertyTypes[d.type]||'Квартира'} · {p.rooms} комн.</span>{!!d.area&&<span><Maximize2 size={15}/>{d.area} м²</span>}<span><Users size={15}/>До {p.capacity} гостей</span>{!!d.beds&&<span><BedDouble size={15}/>{d.beds} {plural(Number(d.beds),'спальное место','спальных места','спальных мест')}</span>}</div>
 <p className={expanded?'listing-description':'listing-description clamped'}>{p.description}</p>
 <div className="listing-amenities">{(d.amenities||[]).slice(0,expanded?20:4).map((a:string)=><span key={a}><Check size={13}/>{amenities[a]}</span>)}</div>
 {expanded&&<div className="listing-details"><dl><div><dt>Заселение</dt><dd>{clock(policy.checkin_minutes??840)}</dd></div><div><dt>Выезд</dt><dd>{clock(policy.checkout_minutes??720)}</dd></div><div><dt>Способ заезда</dt><dd>{checkinMethods[d.checkinMethod]||'Уточняется у владельца'}</dd></div>{!!d.bathrooms&&<div><dt>Санузлы</dt><dd>{d.bathrooms}</dd></div>}{d.floor!==undefined&&<div><dt>Этаж</dt><dd>{d.floor===0?'Цоколь':d.floor} из {d.floors}</dd></div>}<div><dt>Возвратный депозит</dt><dd>{money(policy.deposit||0)}</dd></div>{!!policy.hourly_price&&<div><dt>Почасовой тариф</dt><dd>{money(policy.hourly_price)} / ч · от {policy.min_hours} ч</dd></div>}{!!policy.nightly_price&&<div><dt>Тариф за ночь</dt><dd>{money(policy.nightly_price)}</dd></div>}</dl><h3>Правила проживания</h3><p>{policy.house_rules||'Владелец ещё не уточнил правила. Проверьте условия перед заявкой.'}</p>{d.type&&<div className="house-rule-tags"><span>Курение: {d.smoking?'разрешено':'запрещено'}</span><span>Питомцы: {d.pets?'разрешены':'не допускаются'}</span><span>Вечеринки: {d.parties?'разрешены':'запрещены'}</span></div>}{role==='owner'?<p className="private">Точный адрес: {p.address}</p>:<small>Точный адрес и инструкция по доступу появятся после подтверждения брони. Доступность проверим на ваши даты с учётом уборки.</small>}{p.display_status?.reservedNow&&<small>На текущее время есть бронь. Другие даты можно проверить при оформлении.</small>}</div>}
 <button className="listing-expand" type="button" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{expanded?'Свернуть описание':'Все удобства и условия'}<ChevronRight size={15}/></button>
 {!!p.test_preview&&<p className="listing-preview-note">Учебный просмотр. Объект не прошёл обязательный допуск; бронирование недоступно.</p>}<div className="listing-footer"><div><strong>{money(p.estimate?.amount??(billingMode==='hourly'?policy.hourly_price:p.price))}</strong><small>{p.estimate?'за весь срок · '+(policy.deposit?'депозит отдельно':'без депозита'):billingMode==='hourly'?'за начатый час · от '+policy.min_hours+' ч':'за начатые сутки · 24 часа'}</small></div><Button className="inline-button" disabled={!!p.test_preview} onClick={onChoose}>{p.test_preview?'Учебный просмотр':actionLabel||(role==='owner'?'Создать уборку':'Проверить даты')}</Button></div>{role==='owner'&&<div className="listing-owner-actions"><Button className="inline-button secondary" onClick={onEdit}><Pencil size={15}/>Редактировать</Button><Button className="inline-button secondary" onClick={onSettings}>Полномочия и готовность</Button></div>}
 </div></article>;
}
export {PropertyEditor} from './property-editor';
