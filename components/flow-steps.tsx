import {Check} from 'lucide-react';
export function FlowSteps({labels,current,onStep,disabled=false}:{labels:string[];current:number;onStep?:(index:number)=>void;disabled?:boolean}){
 return <ol className="flow-steps" aria-label="Этапы оформления">{labels.map((label,index)=><li key={label} className={index===current?'is-current':index<current?'is-complete':''} aria-current={index===current?'step':undefined}>{onStep?<button type="button" onClick={()=>onStep(index)} disabled={disabled||index>current+1}><span aria-hidden="true">{index<current?<Check size={14}/>:index+1}</span>{label}</button>:<span className="flow-step-label"><span aria-hidden="true">{index<current?<Check size={14}/>:index+1}</span>{label}</span>}</li>)}</ol>;
}
