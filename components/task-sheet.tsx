'use client';
import {useEffect,useState,type ReactNode} from 'react';
import {ArrowLeft,X} from 'lucide-react';
import {Sheet,SheetContent,SheetTitle,SheetDescription} from './ui/sheet';
import {useSwipeDismiss} from './use-swipe-dismiss';
import './task-sheet.css';
export function TaskSheet({open,onOpenChange,children,footer}:{open:boolean;onOpenChange:(open:boolean)=>void;children:ReactNode;footer?:ReactNode}){
 const [height,setHeight]=useState<number|undefined>();
 useEffect(()=>{const viewport=window.visualViewport,resize=()=>setHeight(window.innerWidth<=767?viewport?.height:undefined);resize();viewport?.addEventListener('resize',resize);window.addEventListener('resize',resize);return()=>{viewport?.removeEventListener('resize',resize);window.removeEventListener('resize',resize);};},[]);
 const close=()=>onOpenChange(false),swipe=useSwipeDismiss(close);
 return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent className="map-action-sheet task-sheet" showCloseButton={false} style={height?{height}:undefined} {...swipe}><div className="swipe-dismiss-edge" data-swipe-edge aria-hidden="true"/><header className="task-sheet-header" data-swipe-handle><div className="task-sheet-grip" aria-hidden="true"/><button type="button" onClick={close} aria-label="Назад к карте"><ArrowLeft size={20}/></button><div><SheetTitle>Детали и действия</SheetTitle><SheetDescription className="sr-only">Что с этим сейчас и что можно сделать.</SheetDescription></div><button type="button" onClick={close} aria-label="Закрыть детали"><X size={20}/></button></header><div className="task-sheet-body">{children}</div>{footer&&<div className="task-sheet-footer">{footer}</div>}</SheetContent></Sheet>;
}
