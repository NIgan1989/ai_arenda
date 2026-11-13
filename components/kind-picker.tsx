'use client';
import type {ReactNode} from 'react';
import {BedSingle,Building,Building2,DoorOpen,Hotel,House,Sofa,Trees,UsersRound} from 'lucide-react';
import {defaultOwnStaff,propertyTypes} from '../lib/listings';
import './kind-picker.css';

const ICONS:Record<string,ReactNode>={apartment:<Building2 size={16}/>,studio:<Sofa size={16}/>,room:<DoorOpen size={16}/>,house:<House size={16}/>,guesthouse:<Trees size={16}/>,hostel:<BedSingle size={16}/>,hotel:<Hotel size={16}/>,aparthotel:<Building size={16}/>};

// The kind of housing as a grid of icon tiles, and one switch: does the owner's own staff clean between guests.
// Choosing a hotel, a hostel or an apart-hotel turns «Свой персонал» on; the owner can change it right below.
export function KindPicker({type,ownStaff,onChange}:{type:string;ownStaff:boolean;onChange:(v:{type?:string;ownStaff?:boolean})=>void}){
 return <div className="kp">
  <div className="kp-grid" role="radiogroup" aria-label="Тип жилья">
   {Object.entries(propertyTypes).map(([id,label])=><button key={id} type="button" role="radio" aria-checked={type===id} className="kp-kind" onClick={()=>onChange({type:id,ownStaff:defaultOwnStaff(id)})}>
    <span className="kp-ico" aria-hidden="true">{ICONS[id]}</span><span>{label}</span>
   </button>)}
  </div>
  <label className="kp-staff">
   <span className="kp-staff-ico" aria-hidden="true"><UsersRound size={18}/></span>
   <span className="kp-staff-text"><strong>Свой персонал</strong><small>{ownStaff?'Убирают ваши сотрудники, ИИ исполнителей не ищет':'Выключено: после выезда ИИ найдёт исполнителя'}</small></span>
   <input type="checkbox" role="switch" checked={ownStaff} onChange={e=>onChange({ownStaff:e.target.checked})}/>
  </label>
 </div>;
}
