'use client';
import {useEffect,useState,type ReactNode} from 'react';
import {ArrowLeft,X} from 'lucide-react';
import {Sheet,SheetContent,SheetTitle,SheetDescription} from './ui/sheet';
import {useSwipeDismiss} from './use-swipe-dismiss';
import './task-sheet.css';
export function TaskSheet({open,onOpenChange,children,footer}:{open:boolean;onOpenChange:(open:boolean)=>void;children:ReactNode;footer?:ReactNode}){
 // On a phone the sheet follows the visible part of the screen: when the iPhone keyboard opens, Safari both shrinks
 // and scrolls the visual viewport, so the sheet takes its height and its top, or it slides off the screen.
 const [box,setBox]=useState<{height:number;top:number}|undefined>();
 useEffect(()=>{const viewport=window.visualViewport,resize=()=>setBox(window.innerWidth<=767&&viewport?{height:viewport.height,top:viewport.offsetTop}:undefined);resize();viewport?.addEventListener('resize',resize);viewport?.addEventListener('scroll',resize);window.addEventListener('resize',resize);return()=>{viewport?.removeEventListener('resize',resize);viewport?.removeEventListener('scroll',resize);window.removeEventListener('resize',resize);};},[]);
 const close=()=>onOpenChange(false),swipe=useSwipeDismiss(close);
 return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent className="map-action-sheet task-sheet" showCloseButton={false} style={box?{height:box.height,maxHeight:box.height,top:box.top,bottom:'auto'}:undefined} {...swipe}><div className="swipe-dismiss-edge" data-swipe-edge aria-hidden="true"/><header className="task-sheet-header" data-swipe-handle><div className="task-sheet-grip" aria-hidden="true"/><button type="button" onClick={close} aria-label="Назад к карте"><ArrowLeft size={20}/></button><div><SheetTitle>Детали и действия</SheetTitle><SheetDescription className="sr-only">Что с этим сейчас и что можно сделать.</SheetDescription></div><button type="button" onClick={close} aria-label="Закрыть детали"><X size={20}/></button></header><div className="task-sheet-body">{children}</div>{footer&&<div className="task-sheet-footer">{footer}</div>}</SheetContent></Sheet>;
}
