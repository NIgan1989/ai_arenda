'use client';
import {useRef,type PointerEvent} from 'react';
export function useSwipeDismiss(onClose:()=>void){
 const gesture=useRef<{id:number;x:number;y:number;header:boolean;direction?:'right'|'down'}|null>(null);
 const reset=(node:HTMLElement)=>{node.style.translate='';node.style.opacity='';gesture.current=null;};
 return {
  onPointerDown(event:PointerEvent<HTMLElement>){if(window.innerWidth>767||event.button!==0)return;const target=event.target as Element,header=!!target.closest('[data-swipe-handle]'),edge=!!target.closest('[data-swipe-edge]');if(!header&&!edge||target.closest('input,textarea,select,a,button:not([data-swipe-handle])'))return;gesture.current={id:event.pointerId,x:event.clientX,y:event.clientY,header};},
  onPointerMove(event:PointerEvent<HTMLElement>){const g=gesture.current;if(!g||g.id!==event.pointerId)return;const x=event.clientX-g.x,y=event.clientY-g.y;if(!g.direction){if(x>12&&x>Math.abs(y)*1.3)g.direction='right';else if(g.header&&y>12&&y>Math.abs(x)*1.3)g.direction='down';else return;event.currentTarget.setPointerCapture(event.pointerId);}event.preventDefault();const distance=Math.max(0,g.direction==='right'?x:y);event.currentTarget.style.translate=g.direction==='right'?distance+'px 0':'0 '+distance+'px';event.currentTarget.style.opacity=String(Math.max(.5,1-distance/600));},
  onPointerUp(event:PointerEvent<HTMLElement>){const g=gesture.current;if(!g)return;const distance=g.direction==='right'?event.clientX-g.x:g.direction==='down'?event.clientY-g.y:0;reset(event.currentTarget);if(distance>=72)onClose();},
  onPointerCancel(event:PointerEvent<HTMLElement>){reset(event.currentTarget);}
 };
}
