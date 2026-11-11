// Keeps every size in the product on the shared scale from design/tokens.json.
// node scripts/design-scale.mjs --check   reports values that left the scale (used by tests)
// node scripts/design-scale.mjs --write   snaps them to the nearest step
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
const root=new URL('../',import.meta.url),tokens=JSON.parse(readFileSync(new URL('design/tokens.json',root),'utf8'));
const fonts=Object.values(tokens.font).map(f=>f[0]),radii=Object.values(tokens.radius),controls=Object.values(tokens.control);
const nearest=(n,scale)=>scale.reduce((best,x)=>Math.abs(x-n)<=Math.abs(best-n)?x:best,scale[0]);
export const snapFont=n=>n>=40?Math.round(n/4)*4:nearest(n,fonts);
export const snapRadius=n=>n<=2?n:n>=40?999:nearest(n,radii.filter(r=>r<999).concat(0));
export const snapSpace=n=>{const a=Math.abs(n),sign=n<0?-1:1;if(a<=2)return n;if(a<8)return sign*(a<3?2:a<6?4:8);const low=Math.floor(a/4)*4;return sign*(a-low>2?low+4:low);};
export const snapControl=n=>n<38||n>58?n:nearest(n,controls);
export const snapLine=n=>Math.ceil((n-1)/4)*4;
const dir=(p,ext)=>readdirSync(new URL(p,root)).filter(f=>f.endsWith(ext)).map(f=>p+f);
export const cssFiles=()=>[...dir('app/','.css'),...dir('components/','.css'),...dir('components/patterns/','.css')].filter(f=>f!=='app/tokens.css');
export const nativeFiles=()=>['mobile/App.tsx',...dir('mobile/src/','.tsx'),'mobile/src/styles.ts'];
const px=(value,snap)=>value.replace(/(-?\d*\.?\d+)px/g,(m,n)=>{const x=Number(n);return Number.isInteger(x)?snap(x)+'px':m;});
export function snapCss(text){
 return text
  .replace(/(font-size:)([^;}]+)/g,(m,p,v)=>p+px(v,snapFont))
  .replace(/(border(?:-[a-z]+){0,2}-radius:)([^;}]+)/g,(m,p,v)=>p+px(v,snapRadius))
  .replace(/((?:^|[;{\s])(?:padding|margin|gap|row-gap|column-gap)(?:-[a-z]+)*:)([^;}]+)/g,(m,p,v)=>p+px(v,snapSpace))
  .replace(/((?:^|[;{\s])(?:min-)?(?:height|width):)(\d+)px(?=[;}\s!])/g,(m,p,n)=>p+snapControl(Number(n))+'px');
}
export function snapNative(text){
 return text
  .replace(/\b(fontSize:)(\d+)\b/g,(m,p,n)=>p+snapFont(Number(n)))
  .replace(/\b(lineHeight:)(\d+)\b/g,(m,p,n)=>p+snapLine(Number(n)))
  .replace(/\b(border(?:Top|Bottom)?(?:Left|Right)?Radius:)(\d+)\b/g,(m,p,n)=>p+snapRadius(Number(n)))
  .replace(/\b((?:padding|margin)(?:Top|Bottom|Left|Right|Horizontal|Vertical)?:|gap:)(-?\d+)\b/g,(m,p,n)=>p+snapSpace(Number(n)))
  .replace(/\b((?:minHeight|height|minWidth|width):)(\d+)\b/g,(m,p,n)=>p+snapControl(Number(n)));
}
const run=process.argv[1]&&import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop());
if(run){
 const write=process.argv.includes('--write');let stale=0;
 for(const [files,snap] of [[cssFiles(),snapCss],[nativeFiles(),snapNative]])for(const file of files){
  const url=new URL(file,root),text=readFileSync(url,'utf8'),next=snap(text);
  if(next!==text){stale++;if(write)writeFileSync(url,next);else console.error(file+' has sizes outside the shared scale.');}
 }
 if(stale&&!write){console.error('Run node scripts/design-scale.mjs --write');process.exit(1);}
 console.log(write?`Snapped ${stale} files.`:'All sizes are on the shared scale.');
}
