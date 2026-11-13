'use client';
import type {ReactNode} from 'react';
import {BedSingle,Building,Building2,DoorOpen,Hotel,House,Sofa,Trees,UsersRound} from 'lucide-react';
import {defaultOwnStaff,propertyTypes} from '../lib/listings';
import './kind-picker.css';

const ICONS:Record<string,ReactNode>={apartment:<Building2 size={20}/>,studio:<Sofa size={20}/>,room:<DoorOpen size={20}/>,house:<House size={20}/>,guesthouse:<Trees size={20}/>,hostel:<BedSingle size={20}/>,hotel:<Hotel size={20}/>,aparthotel:<Building size={20}/>};

// The kind of housing as one row of icon buttons; the chosen kind is named under the row, and one switch: does the owner's own staff clean between guests.
// Choosing a hotel, a hostel or an apart-hotel turns «Свой персонал» on; the owner can change it right below.
export function KindPicker({type,ownStaff,onChange}:{type:string;ownStaff:boolean;onChange:(v:{type?:string;ownStaff?:boolean})=>void}){
 return <div className="kp">
  <div className="kp-grid" role="radiogroup" aria-label="Тип жилья">
   {Object.entries(propertyTypes).map(([id,label])=><button key={id} type="button" role="radio" aria-checked={type===id} aria-label={label} title={label} className="kp-kind" onClick={()=>onChange({type:id,ownStaff:defaultOwnStaff(id)})}>{ICONS[id]}</button>)}
  </div>
  <p className="kp-name" aria-live="polite">{propertyTypes[type as keyof typeof propertyTypes]||'Выберите тип жилья'}</p>
  <label className="kp-staff">
   <span className="kp-staff-ico" aria-hidden="true"><UsersRound size={16}/></span>
   <span className="kp-staff-text"><strong>Свой персонал</strong><small>{ownStaff?'ИИ не ищет исполнителей':'ИИ найдёт исполнителя'}</small></span>
   <input type="checkbox" role="switch" checked={ownStaff} onChange={e=>onChange({ownStaff:e.target.checked})}/>
  </label>
 </div>;
}
