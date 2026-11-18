// The brand of the service in one place: its name and the drawing of its sign. No imports: the site, the app
// and the scripts that make the images all read this file.
//
// «AiQonaq»: қонақ is a guest, «Ai» is the AI administrator who receives them (and «ай», the moon, for those who hear it).
// The sign is a шаңырақ, the crown of a yurt seen from inside: a ring, two pairs of bars across it and the roof
// poles around it as rays. In Kazakh culture it stands for a home. The colours are in design/tokens.json
// (night, nightGlow, gold, domeFrom, domeTo).
export const BRAND_NAME='AiQonaq';
export const BRAND_LINE='Жильё, бани и залы на часы и сутки';

// ── The sign, in a 100×100 box with the centre at 50,50 ──────────────────────────────────────────────────────
export const DOME_RING=35;
// Two bars one way, two the other; each bows a little, as the bent wood of a real crown does.
export const DOME_BARS_V=['M43 16.2Q40 50 43 83.8','M57 16.2Q60 50 57 83.8'];
export const DOME_BARS_H=['M16.2 43Q50 40 83.8 43','M16.2 57Q50 60 83.8 57'];
export const DOME_STROKE=3.2,DOME_BAR_STROKE=2.6,DOME_RAY_STROKE=2.2;
export const DOME_RAYS=24,DOME_RAY_FROM=42,DOME_RAY_TO=47.5;
/** The rays as [x1,y1,x2,y2]; the first one points up, the rest follow clockwise. */
export function domeRays(count=DOME_RAYS,from=DOME_RAY_FROM,to=DOME_RAY_TO):[number,number,number,number][]{
  const round=(n:number)=>Math.round(n*100)/100;
  return Array.from({length:count},(_,i)=>{const a=i*2*Math.PI/count-Math.PI/2,c=Math.cos(a),s=Math.sin(a);return [round(50+c*from),round(50+s*from),round(50+c*to),round(50+s*to)];});
}

// ── The name as a drawing ────────────────────────────────────────────────────────────────────────────────────
// «Ai» in bold and «Qonaq» in regular, the outlines of the Unbounded typeface (SIL Open Font License 1.1,
// © The Unbounded Project Authors). Kept as outlines so that no page waits for a font.
export const WORDMARK_BOX='0 -830 5240 1000';
export const WORDMARK_RATIO=5.24;
export const WORDMARK_AI='M216-144V-311H733V-144ZM615-750 956 0H735L449-662H509L222 0H1L342-750ZM1013-580 1116-560 1218-580V0H1013ZM1115-627Q1062-627 1029-653Q996-680 996-726Q996-771 1029-798Q1062-825 1115-825Q1170-825 1202-798Q1235-771 1235-726Q1235-680 1202-653Q1170-627 1115-627Z';
export const WORDMARK_QONAQ='M1653-286H1814L2147 52H1983ZM1748 14Q1620 14 1523-35Q1426-84 1372-172Q1318-259 1318-375Q1318-491 1372-578Q1426-666 1523-715Q1620-764 1748-764Q1876-764 1973-715Q2070-666 2124-578Q2178-491 2178-375Q2178-259 2124-172Q2070-84 1973-35Q1876 14 1748 14ZM1748-104Q1839-104 1905-137Q1971-170 2008-231Q2044-292 2044-375Q2044-458 2008-519Q1971-580 1905-613Q1839-646 1748-646Q1658-646 1592-613Q1525-580 1488-519Q1452-458 1452-375Q1452-292 1488-231Q1525-170 1592-137Q1658-104 1748-104ZM2604 14Q2501 14 2424-24Q2346-61 2302-128Q2259-195 2259-283Q2259-372 2302-438Q2346-505 2424-542Q2501-580 2604-580Q2707-580 2784-542Q2862-505 2906-438Q2949-372 2949-283Q2949-195 2906-128Q2862-61 2784-24Q2707 14 2604 14ZM2604-88Q2670-88 2718-112Q2765-136 2791-180Q2817-223 2817-283Q2817-343 2791-386Q2765-430 2718-454Q2670-478 2604-478Q2539-478 2491-454Q2443-430 2417-386Q2391-343 2391-283Q2391-223 2417-180Q2443-136 2491-112Q2539-88 2604-88ZM3028-566H3158L3192-362V0H3062V-381ZM3417-580Q3497-580 3553-548Q3609-516 3638-456Q3668-397 3668-313V0H3538V-292Q3538-381 3496-426Q3455-472 3375-472Q3320-472 3278-448Q3237-423 3214-379Q3192-335 3192-276L3146-301Q3155-389 3192-451Q3229-513 3287-546Q3345-580 3417-580ZM4326 0 4304-210 4330-283 4304-355 4326-566H4460L4430-283L4460 0ZM4366-283Q4347-194 4303-127Q4259-60 4194-23Q4130 14 4051 14Q3968 14 3904-24Q3840-61 3804-128Q3768-195 3768-283Q3768-372 3804-438Q3840-505 3904-542Q3968-580 4051-580Q4130-580 4194-543Q4259-506 4304-440Q4348-373 4366-283ZM3900-283Q3900-226 3924-182Q3947-139 3988-114Q4029-90 4082-90Q4136-90 4182-114Q4228-139 4264-182Q4299-226 4320-283Q4299-340 4264-384Q4228-427 4182-452Q4136-476 4082-476Q4029-476 3988-452Q3947-427 3924-384Q3900-340 3900-283ZM5233-566V165H5103V-200L5109-235V-349L5103-369V-566ZM5153-283Q5134-194 5090-127Q5046-60 4982-23Q4917 14 4838 14Q4755 14 4691-24Q4627-61 4591-128Q4555-195 4555-283Q4555-372 4591-438Q4627-505 4691-542Q4755-580 4838-580Q4917-580 4982-543Q5046-506 5090-440Q5135-373 5153-283ZM4687-283Q4687-226 4710-182Q4734-139 4775-114Q4816-90 4869-90Q4923-90 4969-114Q5015-139 5050-182Q5086-226 5107-283Q5086-340 5050-384Q5015-427 4969-452Q4923-476 4869-476Q4816-476 4775-452Q4734-427 4710-384Q4687-340 4687-283Z';

// ── The small sign ───────────────────────────────────────────────────────────────────────────────────────────
// At the size of a letter (a pin on the map, the waiting sign) the rays would turn to dust, so the crown is drawn
// alone and bolder: the ring to the edge of the box, the bars set wider.
export const GLYPH_RING=41,GLYPH_STROKE=9,GLYPH_BAR_STROKE=7;
export const GLYPH_BARS='M39 13Q35 50 39 87M61 13Q65 50 61 87M13 39Q50 35 87 39M13 61Q50 65 87 61';

// ── The ornament ───────────────────────────────────────────────────────────────────────────────────────────────
// One thin line of «қошқар мүйіз», the ram's horn: two curls facing each other, joined by the line they grow from.
// It is a tile 22 wide and 12 high. The only place it stands is the edge of the map's sheet, under the grip:
// a strip of twelve tiles that fades out at both ends.
export const ORNAMENT_TILE=[22,12] as const,ORNAMENT_TILES=12,ORNAMENT_STROKE=1.2;
export const ORNAMENT_SIZE=[ORNAMENT_TILE[0]*ORNAMENT_TILES,ORNAMENT_TILE[1]] as const;
const ornamentTile=(x:number)=>`M${x} 9h4c0-7 7-7 7-2 0 3-4 3-4 0M${x+ORNAMENT_TILE[0]} 9h-4c0-7-7-7-7-2 0 3 4 3 4 0`;
/** The strip as a whole <svg>, in one colour; `width` is the size of the image in pixels. */
export function ornamentSvg(color:string,width:number=ORNAMENT_SIZE[0]){
  const [w,h]=ORNAMENT_SIZE,stop=(at:number,shown:boolean)=>`<stop offset="${at}" stop-color="${color}"${shown?'':' stop-opacity="0"'}/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${width*h/w}" viewBox="0 0 ${w} ${h}">`
    +`<defs><linearGradient id="fade" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${w}" y2="0">${stop(0,false)}${stop(.25,true)}${stop(.75,true)}${stop(1,false)}</linearGradient></defs>`
    +`<path d="${Array.from({length:ORNAMENT_TILES},(_,i)=>ornamentTile(i*ORNAMENT_TILE[0])).join('')}" fill="none" stroke="url(#fade)" stroke-width="${ORNAMENT_STROKE}" stroke-linecap="round"/></svg>`;
}

// ── The same drawings as SVG text, for the images and for the splash that paints before React ────────────────
export type DomeInk={stroke:string;gold:string;rays?:number;weight?:number};
/** The inside of an <svg viewBox="0 0 100 100">: rays, ring, bars. `weight` thickens the lines for small sizes. */
export function domeMarkup({stroke,gold,rays=DOME_RAYS,weight=1}:DomeInk){
  return `<g fill="none" stroke-linecap="round" stroke="${gold}" stroke-width="${DOME_RAY_STROKE*weight}">${domeRays(rays).map(([x1,y1,x2,y2])=>`<path d="M${x1} ${y1}L${x2} ${y2}"/>`).join('')}</g>`
    +`<g fill="none" stroke-linecap="round" stroke="${stroke}"><circle cx="50" cy="50" r="${DOME_RING}" stroke-width="${DOME_STROKE*weight}"/>`
    +`<path d="${[...DOME_BARS_V,...DOME_BARS_H].join('')}" stroke-width="${DOME_BAR_STROKE*weight}"/></g>`;
}
/** The inside of an <svg viewBox="0 0 100 100"> for the small sign, in one colour. */
export function glyphMarkup(color:string){
  return `<g fill="none" stroke="${color}" stroke-linecap="round"><circle cx="50" cy="50" r="${GLYPH_RING}" stroke-width="${GLYPH_STROKE}"/><path d="${GLYPH_BARS}" stroke-width="${GLYPH_BAR_STROKE}"/></g>`;
}
// How much of the sign each size keeps: the app icon and the splash show all 24 rays, a logo in a header 16
// bolder ones, a browser tab 12.
export type DomeDetail='full'|'compact'|'tiny';
export const DOME_DETAIL:Record<DomeDetail,{rays:number;weight:number;scale:number}>={full:{rays:24,weight:1,scale:.74},compact:{rays:16,weight:1.35,scale:.78},tiny:{rays:12,weight:1.8,scale:.8}};
export type BrandColors={night:string;nightGlow:string;gold:string;domeFrom:string;domeTo:string};
/** The gradient the ring and the bars are drawn with. It is set in the units of the drawing: a straight bar has no box of its own to stretch a gradient over. */
export function domeGradient(id:string,c:BrandColors){
  return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="15" y1="15" x2="85" y2="85"><stop offset="0" stop-color="${c.domeFrom}"/><stop offset="1" stop-color="${c.domeTo}"/></linearGradient>`;
}
/** A whole <svg>: the sign on its night-blue plate. `round` is the corner radius in the 100 box (0: a full square, for icons the system rounds itself); `scale` overrides how large the sign sits on the plate. */
export function badgeSvg(c:BrandColors,{size,detail='full',round=23,scale}:{size:number;detail?:DomeDetail;round?:number;scale?:number}){
  const d=DOME_DETAIL[detail],k=scale??d.scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100"><defs>${domeGradient('dome',c)}`
    +`<linearGradient id="plate" x1=".2" y1="0" x2=".8" y2="1"><stop offset="0" stop-color="${c.nightGlow}"/><stop offset="1" stop-color="${c.night}"/></linearGradient></defs>`
    +`<rect width="100" height="100" rx="${round}" fill="url(#plate)"/><g transform="translate(50 50) scale(${k}) translate(-50 -50)">${domeMarkup({stroke:'url(#dome)',gold:c.gold,rays:d.rays,weight:d.weight})}</g></svg>`;
}

// ── The small images of the brand for the site's stylesheets ─────────────────────────────────────────────────
// An SVG as the value of a CSS url(): only what a stylesheet would trip over is escaped.
const cssImage=(svg:string)=>`url("data:image/svg+xml,${svg.replace(/"/g,"'").replace(/#/g,'%23').replace(/</g,'%3C').replace(/>/g,'%3E')}")`;
/** The text of app/brand-images.css: the small sign as a mask, so it takes any colour, and the strip of the ornament in the given colour. */
export function brandCss(ornament:string){
  return '/* Made by scripts/build-brand-assets.mjs from lib/brand.ts and design/tokens.json. Do not edit by hand. */\n:root{\n'
    +`  --brand-sign:${cssImage(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${glyphMarkup('#000')}</svg>`)};\n`
    +`  --brand-ornament:${cssImage(ornamentSvg(ornament))};\n`
    +`  --brand-ornament-width:${ORNAMENT_SIZE[0]}px;\n}\n`;
}
