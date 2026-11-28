// Draws every image of the brand from one source: the drawing in lib/brand.ts and the colours in design/tokens.json.
//   node scripts/build-brand-assets.mjs
// The site gets its logo, its browser icons, the icons of the installed web app (public/) and the small sign and the
// ornament for its stylesheets (app/brand-images.css); the app gets its icon, the layers of the entry splash, the
// name as an image and the two small signs (mobile/assets/brand/).
// Run it after the drawing or the colours change and commit the result: nothing builds these images on its own.
// It uses sharp, which the site's framework already brings along.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import ts from 'typescript';
import sharp from 'sharp';

const root=new URL('../',import.meta.url),at=p=>fileURLToPath(new URL(p,root));
const tokens=JSON.parse(readFileSync(at('design/tokens.json'),'utf8')),c=tokens.color,a=tokens.appColor;
const compiled=join(mkdtempSync(join(tmpdir(),'brand-')),'brand.mjs');
writeFileSync(compiled,ts.transpileModule(readFileSync(at('lib/brand.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText);
const b=await import(pathToFileURL(compiled).href);

const svg=(w,h,box,body)=>`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${box}">${body}</svg>`;
const written=[];
async function png(file,markup,{opaque}={}){
  let image=sharp(Buffer.from(markup),{density:72});
  if(opaque)image=image.flatten({background:c.night}).removeAlpha();
  const info=await image.png({compressionLevel:9}).toFile(at(file));written.push(`${file} ${info.width}×${info.height}`);
}
// An image the app shows at a fixed size comes in three densities, as React Native expects: name.png, name@2x.png, name@3x.png.
async function densities(name,w,h,draw){for(const k of [1,2,3])await png(`mobile/assets/brand/${name}${k>1?'@'+k+'x':''}.png`,draw(w*k,h*k));}

mkdirSync(at('mobile/assets/brand'),{recursive:true});

// ── The site ─────────────────────────────────────────────────────────────────────────────────────────────────
writeFileSync(at('public/favicon.svg'),b.badgeSvg(c,{size:64,detail:'tiny'})+'\n');written.push('public/favicon.svg');
// The small sign and the ornament for the stylesheets, as CSS variables.
writeFileSync(at('app/brand-images.css'),b.brandCss(c.accent));written.push('app/brand-images.css');
await png('public/brand-mark.png',b.badgeSvg(c,{size:512,detail:'compact'}));
await png('public/icon-192.png',b.badgeSvg(c,{size:192,detail:'compact'}));
await png('public/icon-512.png',b.badgeSvg(c,{size:512}));
// A maskable icon is cut to any shape by the system: the plate fills the square and the sign keeps to the safe middle.
await png('public/icon-maskable-512.png',b.badgeSvg(c,{size:512,round:0,scale:.6}),{opaque:true});
await png('public/apple-touch-icon.png',b.badgeSvg(c,{size:180,detail:'compact',round:0}),{opaque:true});

// ── The app icon ─────────────────────────────────────────────────────────────────────────────────────────────
// «Алтын шаңырақ» since 2026-11-28 (palette «Киіз үй», design/tokens.json → appColor): a white plate, the crown in ink
// and its rays in the gold of the swipe. The person taps the icon and the splash draws the same sign on the same white.
const inkSign=(color,k,gold=color)=>`<g transform="translate(50 50) scale(${k}) translate(-50 -50)">${b.domeMarkup({stroke:color,gold})}</g>`;
await png('mobile/assets/brand/icon.png',svg(1024,1024,'0 0 100 100',`<rect width="100" height="100" fill="${a.surface}"/>`+inkSign(a.ink,.7,a.gold)),{opaque:true});
// Android cuts its icon from two layers and shows only the middle two thirds of them.
await png('mobile/assets/brand/adaptive-background.png',svg(1024,1024,'0 0 100 100',`<rect width="100" height="100" fill="${c.surface}"/>`),{opaque:true});
await png('mobile/assets/brand/adaptive-foreground.png',svg(1024,1024,'0 0 100 100',inkSign(a.ink,.5,a.gold)));
await png('mobile/assets/brand/adaptive-monochrome.png',svg(1024,1024,'0 0 100 100',inkSign('#fff',.5)));
// The screen the system shows before the app starts is the night colour alone; the splash then draws the sign on it.
await png('mobile/assets/brand/launch-blank.png',svg(8,8,'0 0 8 8',''));

// ── The entry splash of the app, layer by layer (mobile/src/EntrySplash.tsx) ─────────────────────────────────
const stroke=`fill="none" stroke="url(#dome)" stroke-linecap="round"`,defs=`<defs>${b.domeGradient('dome',c)}</defs>`;
const SPLASH=160;
await densities('dome-ring',SPLASH,SPLASH,(w,h)=>svg(w,h,'0 0 100 100',defs+`<circle cx="50" cy="50" r="${b.DOME_RING}" ${stroke} stroke-width="${b.DOME_STROKE}"/>`));
await densities('dome-bars-v',SPLASH,SPLASH,(w,h)=>svg(w,h,'0 0 100 100',defs+`<path d="${b.DOME_BARS_V.join('')}" ${stroke} stroke-width="${b.DOME_BAR_STROKE}"/>`));
await densities('dome-bars-h',SPLASH,SPLASH,(w,h)=>svg(w,h,'0 0 100 100',defs+`<path d="${b.DOME_BARS_H.join('')}" ${stroke} stroke-width="${b.DOME_BAR_STROKE}"/>`));
// The glow behind the sign: soft enough to be stretched, so one small image serves every screen.
await png('mobile/assets/brand/glow.png',svg(140,140,'0 0 100 100',`<defs><radialGradient id="glow"><stop offset="0" stop-color="${c.nightGlow}"/><stop offset=".45" stop-color="${c.nightGlow}" stop-opacity=".45"/><stop offset="1" stop-color="${c.nightGlow}" stop-opacity="0"/></radialGradient></defs><rect width="100" height="100" fill="url(#glow)"/>`));

// ── The name ─────────────────────────────────────────────────────────────────────────────────────────────────
// 200 wide inside a 240×64 image: the room around it is for the glow of «Ai» on the night plate.
const [bx,by,bw,bh]=b.WORDMARK_BOX.split(' ').map(Number),k=200/bw;
const name=(w,h,{ai,rest,glow})=>svg(w,h,'0 0 240 64',
  `<defs><linearGradient id="ai" gradientUnits="userSpaceOnUse" x1="${bx}" y1="0" x2="${bx+1240}" y2="0"><stop offset="0" stop-color="${ai[0]}"/><stop offset="1" stop-color="${ai[1]}"/></linearGradient>`
  +`<filter id="glow" x="-50%" y="-100%" width="200%" height="300%"><feGaussianBlur stdDeviation="${Math.round(5/k)}"/></filter></defs>`
  +`<g transform="translate(20 ${(64-bh*k)/2}) scale(${k}) translate(${-bx} ${-by})">${glow?`<path d="${b.WORDMARK_AI}" fill="${ai[1]}" opacity=".55" filter="url(#glow)"/>`:''}<path d="${b.WORDMARK_AI}" fill="url(#ai)"/><path d="${b.WORDMARK_QONAQ}" fill="${rest}"/></g>`);
await densities('wordmark-night',240,64,(w,h)=>name(w,h,{ai:[c.domeFrom,c.domeTo],rest:'#fff',glow:true}));
// The app's name: «Ai» in the brown of the main buttons, «Qonaq» in ink.
await densities('wordmark',240,64,(w,h)=>name(w,h,{ai:[a.action,a.action],rest:a.ink,glow:false}));

// ── The small signs, white so that the app paints them in any colour ─────────────────────────────────────────
await densities('dome-glyph',24,24,(w,h)=>svg(w,h,'0 0 100 100',b.glyphMarkup('#fff')));
// The strip of the ornament under the grip of the sheet (mobile/src/SheetParts.tsx).
const [ow,oh]=b.ORNAMENT_SIZE;
await densities('ornament',ow,oh,w=>b.ornamentSvg('#fff',w));

console.log(written.join('\n'));
