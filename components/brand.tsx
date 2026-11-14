import {useId} from 'react';
import {BRAND_NAME,WORDMARK_AI,WORDMARK_BOX,WORDMARK_QONAQ} from '../lib/brand';
import './brand.css';

// The name as a drawing: «Ai» in the colours of the AI, «Qonaq» in the colour of the text around it.
// It is as tall as a capital letter of that text, so it sits wherever the name used to be written.
// `tone="night"` is for the night-blue plate of the splash.
export function Wordmark({tone='light',className}:{tone?:'light'|'night';className?:string}){
 const id=useId();
 return <svg className={'wordmark'+(className?' '+className:'')} data-tone={tone} viewBox={WORDMARK_BOX} role="img" aria-label={BRAND_NAME}>
  <defs><linearGradient id={id} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="1240" y2="0"><stop offset="0" className="wordmark-from"/><stop offset="1" className="wordmark-to"/></linearGradient></defs>
  <path d={WORDMARK_AI} fill={`url(#${id})`}/><path d={WORDMARK_QONAQ} fill="currentColor"/>
 </svg>;
}

export function Brand({subtitle='Жильё и заботы под контролем'}:{subtitle?:string}){
 return <a href="/" className="brand" aria-label={BRAND_NAME+' — главная'}><img src="/brand-mark.png" width={48} height={48} alt=""/><span><Wordmark/>{!!subtitle&&<small>{subtitle}</small>}</span></a>;
}
