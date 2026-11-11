type Row=Record<string,any>;
export type MapPoint=[number,number];
export function mapPoint(value:unknown):MapPoint|null{
 if(!Array.isArray(value)||value.length<2)return null;
 const [lng,lat]=value;
 return typeof lng==='number'&&typeof lat==='number'&&Number.isFinite(lng)&&Number.isFinite(lat)&&Math.abs(lng)<=180&&Math.abs(lat)<=85?[lng,lat]:null;
}
export function rentalMarkerLabel(item:Row){
 if(item.kind==='job')return 'Уборка';if(item.kind==='booking')return 'Заезд';
 const price=item.estimate?.amount??item.mapPrice??item.price;
 return typeof price==='number'&&Number.isFinite(price)&&price>0?Math.round(price/1000)+' тыс.':'Объект';
}
// Only cluster supplied coordinates; never infer or geocode private addresses.
export function groupMapMarkers(items:Row[],project:(point:MapPoint)=>{x:number;y:number},zoom:number){
 const groups:{items:Row[];points:MapPoint[];x:number;y:number}[]=[];
 for(const item of items){const point=mapPoint([item.location?.longitude,item.location?.latitude]);if(!point)continue;
  const pixel=project(point),group=zoom<16?groups.find(g=>Math.hypot(g.x-pixel.x,g.y-pixel.y)<65):undefined;
  if(group){group.items.push(item);group.points.push(point);}else groups.push({items:[item],points:[point],x:pixel.x,y:pixel.y});
 }
 return groups;
}
export function rasterMapPadding(width:number,height:number,sheetSize:number){
 const top=Math.min(150,Math.max(24,height*.25));
 const left=width>700?(sheetSize===0?24:Math.min(400,width*.45)):24;
 const bottom=width>700?64:sheetSize===0?60:Math.min(Math.round(height*(sheetSize===2?.86:.44))+24,Math.max(24,height-top-80));
 return {topLeft:[left,top] as [number,number],bottomRight:[Math.min(56,width*.15),bottom] as [number,number]};
}
