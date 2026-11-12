// Web Mercator helpers for the native raster map. Pure functions, covered by tests/mobile-map-math.test.mjs.
export type MapPoint=[number,number];
export const TILE=256,MIN_ZOOM=3,MAX_ZOOM=18;
export function validPoint(value:unknown):MapPoint|null{
 if(!Array.isArray(value)||value.length<2)return null;const [lng,lat]=value;
 return typeof lng==='number'&&typeof lat==='number'&&Number.isFinite(lng)&&Number.isFinite(lat)&&Math.abs(lng)<=180&&Math.abs(lat)<=85?[lng,lat]:null;
}
export function project([lng,lat]:MapPoint,zoom:number){
 const size=TILE*2**zoom,sin=Math.sin(lat*Math.PI/180);
 return {x:(lng+180)/360*size,y:(.5-Math.log((1+sin)/(1-sin))/(4*Math.PI))*size};
}
export function unproject(x:number,y:number,zoom:number):MapPoint{
 const size=TILE*2**zoom,lng=x/size*360-180,lat=Math.atan(Math.sinh(Math.PI*(1-2*y/size)))*180/Math.PI;
 return [Math.max(-180,Math.min(180,lng)),Math.max(-85,Math.min(85,lat))];
}
// Largest zoom at which every point fits the visible area.
export function fitView(points:MapPoint[],width:number,height:number,maxZoom=15):{center:MapPoint;zoom:number}|null{
 const valid=points.filter(p=>validPoint(p));if(!valid.length||width<=0||height<=0)return null;
 const lngs=valid.map(p=>p[0]),lats=valid.map(p=>p[1]),west=Math.min(...lngs),east=Math.max(...lngs),south=Math.min(...lats),north=Math.max(...lats);
 let zoom=Math.min(MAX_ZOOM,maxZoom);
 for(;zoom>MIN_ZOOM;zoom--){const a=project([west,north],zoom),b=project([east,south],zoom);if(b.x-a.x<=width&&b.y-a.y<=height)break;}
 const a=project([west,north],zoom),b=project([east,south],zoom);
 return {center:unproject((a.x+b.x)/2,(a.y+b.y)/2,zoom),zoom};
}
export function visibleTiles(center:MapPoint,zoom:number,width:number,height:number,originY=height/2){
 const c=project(center,zoom),count=2**zoom,left=c.x-width/2,top=c.y-originY,tiles:{key:string;x:number;y:number;left:number;top:number}[]=[];
 for(let tx=Math.floor(left/TILE);tx*TILE<left+width;tx++)for(let ty=Math.floor(top/TILE);ty*TILE<top+height;ty++){
  if(ty<0||ty>=count)continue;const x=((tx%count)+count)%count;
  tiles.push({key:zoom+'/'+x+'/'+ty+'@'+tx,x,y:ty,left:Math.round(tx*TILE-left),top:Math.round(ty*TILE-top)});
 }
 return tiles;
}
export const mapCities:Record<string,MapPoint>={Павлодар:[76.95,52.287],Алматы:[76.89,43.24],Астана:[71.43,51.13],Шымкент:[69.60,42.32],Караганда:[73.10,49.80],Актобе:[57.17,50.28],Атырау:[51.92,47.11],Актау:[51.17,43.65],Костанай:[63.62,53.22],Петропавловск:[69.15,54.87],Кокшетау:[69.38,53.28],Семей:[80.23,50.41],Тараз:[71.37,42.90],Уральск:[51.37,51.23],Кызылорда:[65.50,44.85],'Усть-Каменогорск':[82.61,49.95],Туркестан:[68.27,43.30]};
// Kazakhstan has a single UTC+5 zone; the request form works in that wall-clock time.
export function kzTime(dayOffset:number,hour:number,now=Date.now()){
 const local=new Date(now+5*3600000);
 return new Date(Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate()+dayOffset,hour)-5*3600000);
}
export function kzHour(now=Date.now()){return new Date(now+5*3600000).getUTCHours();}
export function stayInterval(mode:'daily'|'hourly',dayOffset:number,hour:number,units:number,now=Date.now()){
 const start=kzTime(dayOffset,hour,now),end=mode==='hourly'?new Date(start.getTime()+units*3600000):kzTime(dayOffset+units,12,now);
 return {start:start.toISOString(),end:end.toISOString()};
}
export function countdown(seconds:number){const v=Math.max(0,Math.floor(seconds));return Math.floor(v/60)+':'+String(v%60).padStart(2,'0');}

// ---------- Pins that would cover each other ----------
// Price pins are text boxes; at city zoom neighbours overlap and cut each other's text. Boxes are visited in
// order of importance (lower `rank` first, then input order); a box that touches one already shown joins it,
// and the screen draws the shown box with "+N". Pure function, covered by mobile/tests/map-cluster.test.mjs.
export type PinBox = { key: string; x: number; y: number; width: number; height: number; rank?: number };
export type PinGroup = { key: string; members: string[] };

const SUFFIX = 28; // room for the "+N" of a pin that stands for several

/** The width of a pin with this label: 14px semibold text plus its padding. */
export function pinWidth(label: string) {
  return Math.max(44, Math.round(label.length * 8 + 24));
}

export function groupPins(boxes: PinBox[], gap = 6): PinGroup[] {
  const ordered = boxes
    .map((box, index) => ({ box, index }))
    .sort((a, b) => (a.box.rank ?? 0) - (b.box.rank ?? 0) || a.index - b.index)
    .map(item => item.box);
  const shown: { box: PinBox; members: string[] }[] = [];
  for (const box of ordered) {
    // A shown box may grow by its "+N", so it is tested at that width.
    const host = shown.find(({ box: other }) => {
      const reach = (other.width + SUFFIX + box.width) / 2 + gap;
      return Math.abs(other.x - box.x) < reach && Math.abs(other.y - box.y) < (other.height + box.height) / 2 + gap;
    });
    if (host) host.members.push(box.key);
    else shown.push({ box, members: [box.key] });
  }
  return shown.map(({ box, members }) => ({ key: box.key, members }));
}
