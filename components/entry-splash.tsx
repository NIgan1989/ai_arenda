import {BRAND_LINE,DOME_BARS_H,DOME_BARS_V,DOME_BAR_STROKE,DOME_RAY_STROKE,DOME_RING,DOME_STROKE,WORDMARK_AI,WORDMARK_BOX,WORDMARK_QONAQ,domeRays} from '../lib/brand';

// The entry story, on the night-blue plate of the brand: the шаңырақ, the crown of a yurt, is put together line by line —
// the ring is drawn, the bars cross it, the roof poles spread around as rays — the name rises under it, and then the
// crown opens: its ring becomes a window and widens until the whole map is in it.
// It takes about three and a half seconds — long enough to be seen, not a flash. Shown once per browser session.
// The splash is plain HTML with its own small script, so it starts before React loads and never waits for it.
// The app tells the same story with the same drawing: mobile/src/EntrySplash.tsx.
const SIZE=160;
// The colours repeat design/tokens.json (night, nightGlow, gold, domeFrom, domeTo): the splash paints before the
// stylesheet with the tokens arrives. tests/brand.test.mjs keeps the two in step.
const NIGHT='#1E1B4B',GLOW='#3B36A8',GOLD='#E8B44C',DOME_FROM='#A5B4FC',DOME_TO='#22D3EE';
// The window is the inside of the ring: its share of the sign's box.
const WINDOW=DOME_RING*2;

// Kept inline so the first paint does not wait for the site's stylesheets.
const styles=`.entry-splash{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;background:${NIGHT};overflow:hidden;
  /* Without its script the splash still leaves by itself. */
  animation:entry-splash-fallback .01s linear 9s forwards}
.entry-splash[data-state="skip"],.entry-splash[data-state="done"]{display:none}
.entry-splash-stage{position:relative;display:grid;justify-items:center;gap:16px;padding:24px;text-align:center}
.entry-splash-sign{position:relative;width:${SIZE}px;height:${SIZE}px}
/* The plate itself: a disc the size of the ring's inside and a shadow that covers the rest of the screen.
   When the story ends the disc clears — the ring is a window — and the hole grows. Only transform and opacity
   change, so the opening stays smooth while the page under it is still starting.
   The glow and the words rest in their shown state and are animated from the hidden one, and they leave by an
   animation as well: a browser does not start a transition from where an animation left an element. */
.entry-splash-iris{position:absolute;left:${(100-WINDOW)/2}%;top:${(100-WINDOW)/2}%;width:${WINDOW}%;height:${WINDOW}%;border-radius:50%;background:${NIGHT};box-shadow:0 0 0 110vmax ${NIGHT}}
.entry-splash-glow{position:absolute;left:50%;top:50%;width:560px;height:560px;margin:-280px 0 0 -280px;border-radius:50%;pointer-events:none;
  background:radial-gradient(closest-side,${GLOW},rgba(59,54,168,.45) 45%,rgba(59,54,168,0) 100%);opacity:.85;transform:scale(1.06);animation:entry-glow 3.6s ease-out both}
.entry-splash-mark{position:relative;display:block;overflow:visible}
.entry-splash-mark path,.entry-splash-mark circle{fill:none;stroke-linecap:round}
.entry-splash-ring,.entry-splash-bars path{stroke:url(#entry-splash-ink);stroke-dasharray:1;stroke-dashoffset:1;opacity:0;animation:entry-draw .9s cubic-bezier(.65,0,.35,1) .15s forwards}
.entry-splash-bars path{animation-duration:.6s}
.entry-splash-bars path:nth-child(1){animation-delay:.75s}.entry-splash-bars path:nth-child(2){animation-delay:.87s}
.entry-splash-bars path:nth-child(3){animation-delay:1.05s}.entry-splash-bars path:nth-child(4){animation-delay:1.17s}
.entry-splash-rays{transform-origin:50px 50px;animation:entry-rays 1.5s cubic-bezier(.2,.7,.2,1) 1.4s both}
.entry-splash-rays path{stroke:${GOLD};opacity:0;animation:entry-ray .4s ease-out forwards;animation-delay:calc(1.4s + var(--i)*26ms)}
/* A light runs once round the finished ring. */
.entry-splash-glint{stroke:#fff;stroke-dasharray:.1 .9;opacity:0;transform-origin:50px 50px;animation:entry-glint 1.1s cubic-bezier(.4,0,.2,1) 2.1s both}
.entry-splash-name{display:block;filter:drop-shadow(0 0 12px rgba(34,211,238,.45));animation:entry-rise .7s cubic-bezier(.2,.7,.2,1) 1.9s both}
.entry-splash-line{position:relative;font-size:14px;line-height:20px;letter-spacing:.01em;color:rgba(255,255,255,.76);animation:entry-rise .7s cubic-bezier(.2,.7,.2,1) 2.25s both}
@keyframes entry-draw{0%{stroke-dashoffset:1;opacity:0}4%{opacity:1}100%{stroke-dashoffset:0;opacity:1}}
@keyframes entry-ray{to{opacity:1}}
@keyframes entry-rays{from{transform:rotate(-14deg) scale(.84)}to{transform:none}}
@keyframes entry-glint{0%{opacity:0;transform:rotate(-90deg)}15%{opacity:.9}85%{opacity:.9}100%{opacity:0;transform:rotate(270deg)}}
@keyframes entry-rise{from{opacity:0;transform:translateY(12px)}}
@keyframes entry-glow{0%{opacity:0;transform:scale(.8)}40%{opacity:.85}}
@keyframes entry-leave{to{opacity:0}}
@keyframes entry-sink{to{opacity:0;transform:translateY(8px)}}
@keyframes entry-splash-fallback{to{visibility:hidden;pointer-events:none}}
/* The crown opens: the bars and the words go, the ring clears into a window, the window takes the screen. */
.entry-splash[data-state="leaving"]{background:transparent;pointer-events:none}
.entry-splash[data-state="leaving"] .entry-splash-iris{background:transparent;transform:scale(var(--entry-open,40));transition:background-color .24s ease,transform .95s cubic-bezier(.62,0,.3,1) .14s}
.entry-splash[data-state="leaving"] .entry-splash-glow{animation:entry-leave .3s ease forwards}
.entry-splash[data-state="leaving"] .entry-splash-bars,.entry-splash[data-state="leaving"] .entry-splash-glint{opacity:0;transition:opacity .2s ease}
.entry-splash[data-state="leaving"] .entry-splash-mark{transform:scale(2.4);opacity:0;transition:transform .95s cubic-bezier(.62,0,.3,1) .14s,opacity .55s ease .3s}
.entry-splash[data-state="leaving"] .entry-splash-name,.entry-splash[data-state="leaving"] .entry-splash-line{animation:entry-sink .22s ease forwards}
/* While the story plays, the loading line waits. The page is not scroll-locked: the splash covers it, and a lock could outlive a splash whose script never ran. */
.entry-splash[data-state="playing"]~.app-loader,.entry-splash[data-state="playing"]~.app-loader-pill{display:none}
@media (prefers-reduced-motion:reduce){
  .entry-splash-glow,.entry-splash-rays,.entry-splash-glint{animation:none}
  .entry-splash-ring,.entry-splash-bars path{animation:none;stroke-dashoffset:0;opacity:1}
  .entry-splash-rays path{animation:none;opacity:1}
  .entry-splash-name,.entry-splash-line{animation:none}
  .entry-splash[data-state="leaving"]{background:${NIGHT};opacity:0;transition:opacity .15s linear}
  .entry-splash[data-state="leaving"] .entry-splash-iris{background:${NIGHT};transform:none;transition:none}
  .entry-splash[data-state="leaving"] .entry-splash-mark,.entry-splash[data-state="leaving"] .entry-splash-bars{transform:none;opacity:1;transition:none}
  .entry-splash[data-state="leaving"] .entry-splash-glow,.entry-splash[data-state="leaving"] .entry-splash-name,.entry-splash[data-state="leaving"] .entry-splash-line{animation:none}
}`;

// How far the window must grow: until its edge is past the farthest corner of the screen.
const script=`(function(){var s=document.getElementById('entry-splash');if(!s)return;
try{if(sessionStorage.getItem('ai-arenda-entry')){s.setAttribute('data-state','skip');return;}sessionStorage.setItem('ai-arenda-entry','1');}catch(e){}
var calm=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches,t0=Date.now(),left=false;
function open(){var i=s.querySelector('.entry-splash-iris');if(!i)return;var r=i.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,w=window.innerWidth,h=window.innerHeight;
s.style.setProperty('--entry-open',String(Math.ceil(Math.sqrt(Math.pow(Math.max(x,w-x),2)+Math.pow(Math.max(y,h-y),2))/(r.width/2)*1.06)));}
function leave(){if(left)return;left=true;setTimeout(function(){open();s.setAttribute('data-state','leaving');setTimeout(function(){s.setAttribute('data-state','done');},calm?160:1150);},Math.max(0,(calm?450:3400)-(Date.now()-t0)));}
if(document.readyState==='complete')leave();else window.addEventListener('load',leave,{once:true});setTimeout(leave,5600);})();`;

export function EntrySplash(){
  return <>
    <style dangerouslySetInnerHTML={{__html:styles}}/>
    <div id="entry-splash" className="entry-splash" data-state="playing" aria-hidden="true" suppressHydrationWarning>
      <div className="entry-splash-stage">
        <div className="entry-splash-sign">
          <span className="entry-splash-iris"/>
          <span className="entry-splash-glow"/>
          <svg className="entry-splash-mark" viewBox="0 0 100 100" width={SIZE} height={SIZE} role="presentation">
            <defs>
              <linearGradient id="entry-splash-ink" gradientUnits="userSpaceOnUse" x1="15" y1="15" x2="85" y2="85">
                <stop offset="0" stopColor={DOME_FROM}/><stop offset="1" stopColor={DOME_TO}/>
              </linearGradient>
            </defs>
            <g className="entry-splash-rays" strokeWidth={DOME_RAY_STROKE}>
              {domeRays().map(([x1,y1,x2,y2],i)=><path key={i} d={`M${x1} ${y1}L${x2} ${y2}`} style={{['--i' as string]:i}}/>)}
            </g>
            <circle className="entry-splash-ring" cx="50" cy="50" r={DOME_RING} pathLength={1} strokeWidth={DOME_STROKE} transform="rotate(-90 50 50)"/>
            <g className="entry-splash-bars" strokeWidth={DOME_BAR_STROKE}>
              {[...DOME_BARS_V,...DOME_BARS_H].map(d=><path key={d} d={d} pathLength={1}/>)}
            </g>
            <circle className="entry-splash-glint" cx="50" cy="50" r={DOME_RING} pathLength={1} strokeWidth={DOME_STROKE}/>
          </svg>
        </div>
        <svg className="entry-splash-name" viewBox={WORDMARK_BOX} width="200" height="38" role="presentation">
          <defs>
            <linearGradient id="entry-splash-ai" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="1240" y2="0">
              <stop offset="0" stopColor={DOME_FROM}/><stop offset="1" stopColor={DOME_TO}/>
            </linearGradient>
          </defs>
          <path d={WORDMARK_AI} fill="url(#entry-splash-ai)"/><path d={WORDMARK_QONAQ} fill="#fff"/>
        </svg>
        <div className="entry-splash-line">{BRAND_LINE}</div>
      </div>
    </div>
    <script dangerouslySetInnerHTML={{__html:script}}/>
  </>;
}
