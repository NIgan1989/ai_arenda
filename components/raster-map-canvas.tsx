'use client';
import {useEffect,useRef,useState} from 'react';
import type * as Leaflet from 'leaflet';
import type {MapCanvasProps} from './map-canvas';
import {groupMapMarkers,mapPoint,rasterMapPadding,rentalMarkerLabel,type MapPoint} from '../lib/map-rendering';
import 'leaflet/dist/leaflet.css';
import './raster-map-canvas.css';

const latLng=([lng,lat]:MapPoint):[number,number]=>[lat,lng];
const reduced=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export function RasterMapCanvas(props:MapCanvasProps){
 const host=useRef<HTMLDivElement>(null),map=useRef<Leaflet.Map|null>(null),library=useRef<typeof Leaflet|null>(null);
 const homes=useRef<Leaflet.LayerGroup|null>(null),people=useRef<Leaflet.LayerGroup|null>(null),travel=useRef<Leaflet.LayerGroup|null>(null);
 const latest=useRef(props);latest.current=props;
 const [ready,setReady]=useState(false),[error,setError]=useState('');
 const fittedSearch=useRef(''),fittedRoute=useRef(''),framing=useRef<{points:MapPoint[];zoom:number}|null>(null);
 function fit(points:MapPoint[],zoom:number){
  const L=library.current,instance=map.current,valid=points.filter(p=>mapPoint(p));if(!L||!instance||!valid.length)return;
  framing.current={points:valid,zoom};
  const p=rasterMapPadding(host.current?.clientWidth||window.innerWidth,host.current?.clientHeight||window.innerHeight,latest.current.sheetSize||0);
  instance.fitBounds(L.latLngBounds(valid.map(latLng)),{paddingTopLeft:p.topLeft,paddingBottomRight:p.bottomRight,maxZoom:zoom,animate:!reduced()});
 }
 function drawHomes(){
  const L=library.current,instance=map.current,layer=homes.current;if(!L||!instance||!layer)return;layer.clearLayers();
  for(const group of groupMapMarkers(latest.current.items,p=>instance.project(latLng(p)),instance.getZoom())){
   const cluster=group.items.length>1,item=group.items[0],point=group.points.reduce((a,p)=>[a[0]+p[0]/group.points.length,a[1]+p[1]/group.points.length],[0,0] as MapPoint);
   const element=document.createElement('span');element.className='raster-map-pin'+(cluster?' is-cluster':'')+(group.items.some(i=>i.mapKey===latest.current.selected)?' is-selected':'');
   element.textContent=cluster?String(group.items.length):rentalMarkerLabel(item);
   const title=cluster?`${group.items.length} объекта — приблизить`:`${item.title||'Объект'} · ${rentalMarkerLabel(item)}`;
   const marker=L.marker(latLng(point),{icon:L.divIcon({html:element,className:'raster-map-marker',iconSize:[70,40],iconAnchor:[35,20]}),title,alt:title,keyboard:true,bubblingMouseEvents:false});
   marker.on('click',()=>{if(latest.current.pick){latest.current.onPick?.(point);return;}if(cluster)fit(group.points,Math.min(19,instance.getZoom()+2));else latest.current.onSelect(item.mapKey);});marker.addTo(layer);
  }
 }
 useEffect(()=>{
  let disposed=false;let observer:ResizeObserver|undefined;
  void import('leaflet').then(module=>{
   if(disposed||!host.current)return;const L=module.default||module;library.current=L;
   const instance=L.map(host.current,{zoomControl:false,attributionControl:false,zoomAnimation:!reduced(),fadeAnimation:!reduced(),minZoom:2,maxZoom:19}).setView(latLng(mapPoint(latest.current.center)||[76.95,52.287]),11);map.current=instance;
   L.control.zoom({position:'topright',zoomInTitle:'Приблизить',zoomOutTitle:'Отдалить'}).addTo(instance);
   // Preserve browser cache/referrer defaults; load only visible tiles.
   const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,keepBuffer:0,updateWhenIdle:true}).addTo(instance);
   let loaded=0;tiles.on('tileload',()=>{loaded++;if(!disposed)setError('');});tiles.on('tileerror',()=>{if(!disposed&&loaded===0)setError('Не удалось загрузить подложку карты. Проверьте соединение.');});
   homes.current=L.layerGroup().addTo(instance);people.current=L.layerGroup().addTo(instance);travel.current=L.layerGroup().addTo(instance);
   instance.on('moveend zoomend',drawHomes);
   instance.on('click',e=>{if(latest.current.pick)latest.current.onPick?.([e.latlng.lng,e.latlng.lat]);});
   observer=new ResizeObserver(()=>{instance.invalidateSize({pan:false});if(framing.current)fit(framing.current.points,framing.current.zoom);});observer.observe(host.current);setReady(true);
  }).catch(()=>{if(!disposed)setError('Не удалось открыть карту. Обновите страницу.');});
  return()=>{disposed=true;observer?.disconnect();map.current?.remove();map.current=null;library.current=null;homes.current=null;people.current=null;travel.current=null;};
 },[]);
 useEffect(()=>{if(ready)drawHomes();},[props.items,props.selected,ready]);
 useEffect(()=>{if(ready&&!(props.routes||[]).length)fit([props.center],11);},[props.center[0],props.center[1],ready]);
 useEffect(()=>{if(!ready||!props.searchKey||fittedSearch.current===props.searchKey||(props.routes||[]).length)return;
  const points=props.items.map(p=>mapPoint([p.location?.longitude,p.location?.latitude])).filter((p):p is MapPoint=>!!p);if(points.length){fittedSearch.current=props.searchKey;fit(points,14);}
 },[props.items,props.searchKey,ready]);
 useEffect(()=>{
  const L=library.current,layer=people.current;if(!ready||!L||!layer)return;layer.clearLayers();
  for(const person of props.people||[]){const point=mapPoint([person.longitude,person.latitude]);if(!point)continue;
   const label=document.createElement('span');label.textContent=(person.mine?'Вы':person.kind==='booking'?'Гость':'Исполнитель')+(person.mode==='driving'?' · авто':person.mode==='walking'?' · пешком':'');
   const color=person.mine?'#347fbd':person.kind==='job'?'#b56630':'#397b68';
   if(person.accuracy>0&&person.accuracy<=500)L.circle(latLng(point),{radius:person.accuracy,color,weight:1,fillOpacity:.12,interactive:false}).addTo(layer);
   L.circleMarker(latLng(point),{radius:10,color:'#fff',weight:3,fillColor:color,fillOpacity:1}).bindTooltip(label,{permanent:true,direction:'bottom',offset:[0,8]}).addTo(layer);
  }
 },[props.people,ready]);
 useEffect(()=>{
  const L=library.current,layer=travel.current;if(!ready||!L||!layer)return;layer.clearLayers();const all:MapPoint[]=[];
  const valid=(props.routes||[]).filter(r=>r.geometry?.type==='LineString'&&r.geometry.coordinates?.length>1&&r.geometry.coordinates.every((p:unknown)=>mapPoint(p)));
  for(const route of valid){const points:MapPoint[]=route.geometry.coordinates;all.push(...points);
   L.polyline(points.map(latLng),{color:'#fff',weight:9,opacity:.95,interactive:false}).addTo(layer);
   L.polyline(points.map(latLng),{color:route.kind==='job'?'#b56630':'#367d9b',weight:5,opacity:.9,interactive:false}).addTo(layer);
   L.circleMarker(latLng(points[points.length-1]),{radius:7,color:'#fff',weight:3,fillColor:'#9d452f',fillOpacity:1,interactive:false}).addTo(layer);
  }
  const key=valid.map(r=>r.kind+':'+r.entityId+':'+r.createdAt).sort().join('|');if(key&&key!==fittedRoute.current)fit(all,15);fittedRoute.current=key;
 },[props.routes,ready]);
 useEffect(()=>{if(ready&&props.focus&&!(props.routes||[]).length&&mapPoint(props.focus))fit([props.focus],15);},[props.focus?.[0],props.focus?.[1],ready]);
 useEffect(()=>{if(ready&&framing.current)fit(framing.current.points,framing.current.zoom);},[props.sheetSize,ready]);
 return <div className={'rental-map-canvas raster-map-canvas'+(props.pick?' picking':'')} data-map-renderer="raster"><div ref={host} aria-label="Карта недвижимости" role="region" className="map-surface"/><div className="raster-map-attribution"><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a></div>{!ready&&!error&&<p className="map-loading" role="status">Открываем карту…</p>}{error&&<p role="status" className="map-network-error">{error}</p>}</div>;
}
