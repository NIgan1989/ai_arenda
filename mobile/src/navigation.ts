// Leading the way on our own map: where along the road route the person is, the next turn and how far it is,
// whether they left the route, and whether they have arrived. Pure functions, covered by mobile/tests/navigation.test.mjs.
type Point=[number,number];
export type NavStep={at:Point;type:string;modifier?:string;name?:string;distance:number;text:string};
export type NavRoute={geometry:{coordinates:Point[]};distance:number;duration:number;steps?:NavStep[]};

// Metres between two points (haversine).
export function metres(a:Point,b:Point){
 const rad=Math.PI/180,dLat=(b[1]-a[1])*rad,dLon=(b[0]-a[0])*rad,h=Math.sin(dLat/2)**2+Math.cos(a[1]*rad)*Math.cos(b[1]*rad)*Math.sin(dLon/2)**2;
 return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
}
// The nearest point of the route to a position: on which segment, how far along the route, how far off it.
// Locally the earth is flat enough: segments are projected in metres around the position.
export function snap(line:Point[],p:Point){
 const k=Math.cos(p[1]*Math.PI/180),toXY=(q:Point)=>[(q[0]-p[0])*111320*k,(q[1]-p[1])*110540] as const;
 let best={index:0,along:0,off:Infinity,point:line[0]},walked=0;
 for(let i=0;i<line.length-1;i++){
  const [ax,ay]=toXY(line[i]),[bx,by]=toXY(line[i+1]),dx=bx-ax,dy=by-ay,len2=dx*dx+dy*dy,len=metres(line[i],line[i+1]);
  const t=len2?Math.max(0,Math.min(1,-(ax*dx+ay*dy)/len2)):0,off=Math.hypot(ax+dx*t,ay+dy*t);
  if(off<best.off)best={index:i,along:walked+len*t,off,point:[line[i][0]+(line[i+1][0]-line[i][0])*t,line[i][1]+(line[i+1][1]-line[i][1])*t]};
  walked+=len;
 }
 return best;
}
// How far along the route each point lies (the nearest vertex is close enough for turns, which are vertices of the route).
function alongOf(line:Point[],p:Point){let walked=0,best=0,bestOff=Infinity;for(let i=0;i<line.length;i++){if(i)walked+=metres(line[i-1],line[i]);const off=metres(line[i],p);if(off<bestOff){bestOff=off;best=walked;}}return best;}

export type NavState={next:NavStep|null;toNext:number;left:number;secondsLeft:number;off:number;path:Point[]};
// Where the person is on the route: the next step ahead (not the one just passed), the metres to it, what is left,
// how far off the route they are, and the rest of the route from their place on it (for the line on the map).
export function navState(route:NavRoute,p:Point):NavState{
 const line=route.geometry.coordinates,total=Math.max(1,line.slice(1).reduce((s,q,i)=>s+metres(line[i],q),0)),here=snap(line,p);
 const steps=(route.steps||[]).map(s=>({s,along:alongOf(line,s.at)})).filter(x=>x.s.type!=='depart');
 const ahead=steps.find(x=>x.along>here.along+8)||null,left=Math.max(0,total-here.along);
 return {next:ahead?.s||null,toNext:ahead?Math.max(0,ahead.along-here.along):left,left,secondsLeft:Math.round(route.duration*left/total),off:here.off,path:[p,here.point,...line.slice(here.index+1)]};
}
// A new route is asked when the person is clearly off the road route, not when the GPS wobbles.
export const OFF_ROUTE=60,ARRIVED=40;
export function offRoute(state:NavState,accuracy=0){return state.off>OFF_ROUTE+Math.min(accuracy,60);}
export function arrived(p:Point,target:Point){return metres(p,target)<=ARRIVED;}

// «300 м», «1,2 км», «12 км»; «через 300 м» for the turn ahead.
export function distanceText(m:number){const v=Math.max(0,m);if(v<1000)return (v<100?Math.round(v/10)*10:Math.round(v/50)*50)+' м';const km=v/1000;return (km<10?km.toFixed(1).replace('.',','):String(Math.round(km)))+' км';}
export function minutesText(s:number){const m=Math.max(1,Math.round(s/60));return m<60?m+' мин':(Math.floor(m/60)+' ч '+(m%60?m%60+' мин':'')).trim();}
// The arrow for the turn ahead.
export function turnArrow(step:NavStep|null){
 if(!step)return '↑';if(step.type==='arrive')return '⚑';if(step.type==='roundabout'||step.type==='rotary')return '↻';
 const m=step.modifier||'';return m==='uturn'?'↶':m.includes('left')?(m.includes('slight')?'↖':'←'):m.includes('right')?(m.includes('slight')?'↗':'→'):'↑';
}
