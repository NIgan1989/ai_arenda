'use client';
import Lightbox from 'yet-another-react-lightbox';
import Zoom from 'yet-another-react-lightbox/plugins/zoom';
import Download from 'yet-another-react-lightbox/plugins/download';
import 'yet-another-react-lightbox/styles.css';
export function PhotoViewer({images,index=0,onClose,root}:{images:string[];index?:number;onClose:()=>void;root?:HTMLElement|null}){
 return <Lightbox open close={onClose} index={index} slides={images.map((src,i)=>({src,alt:'Фото '+(i+1),download:{url:src,filename:'photo-'+(i+1)+'.jpg'}}))} plugins={[Zoom,Download]} portal={root?{root}:undefined} labels={{Close:'Закрыть',Next:'Следующее фото',Previous:'Предыдущее фото',Download:'Скачать', 'Zoom in':'Увеличить','Zoom out':'Уменьшить'}}/>;
}
