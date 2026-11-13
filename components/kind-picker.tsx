'use client';
import type {ReactNode} from 'react';
import {BedSingle,Building,Building2,DoorOpen,Hotel,House,Sofa,Trees,Sparkles,UsersRound} from 'lucide-react';
import {defaultOwnStaff,propertyTypes} from '../lib/listings';
import './kind-picker.css';

const ICONS:Record<string,ReactNode>={apartment:<Building2 size={22}/>,studio:<Sofa size={22}/>,room:<DoorOpen size={22}/>,house:<House size={22}/>,guesthouse:<Trees size={22}/>,hostel:<BedSingle size={22}/>,hotel:<Hotel size={22}/>,aparthotel:<Building size={22}/>};

// The kind of housing as a grid of icon tiles, and who cleans between guests.
// Choosing a hotel, a hostel or an apart-hotel turns «Свой персонал» on; the owner can change it right below.
export function KindPicker({type,ownStaff,onChange}:{type:string;ownStaff:boolean;onChange:(v:{type?:string;ownStaff?:boolean})=>void}){
 return <div className="kp">
  <div className="kp-grid" role="radiogroup" aria-label="Тип жилья">
   {Object.entries(propertyTypes).map(([id,label])=><button key={id} type="button" role="radio" aria-checked={type===id} className="kp-kind" onClick={()=>onChange({type:id,ownStaff:defaultOwnStaff(id)})}>
    <span className="kp-ico" aria-hidden="true">{ICONS[id]}</span><span>{label}</span>
   </button>)}
  </div>
  <p className="kp-h">Кто убирает после гостей</p>
  <div className="kp-staff" role="radiogroup" aria-label="Кто убирает после гостей">
   <button type="button" role="radio" aria-checked={!ownStaff} onClick={()=>onChange({ownStaff:false})}><strong><Sparkles size={15}/>Исполнители сервиса</strong><small>ИИ находит исполнителя после каждого выезда</small></button>
   <button type="button" role="radio" aria-checked={ownStaff} onClick={()=>onChange({ownStaff:true})}><strong><UsersRound size={15}/>Свой персонал</strong><small>Убирают ваши сотрудники, ИИ исполнителей не ищет</small></button>
  </div>
 </div>;
}
