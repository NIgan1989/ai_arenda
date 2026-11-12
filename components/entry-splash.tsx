// The entry story: the house of the logo is drawn in one stroke that ends as the letter «a»,
// the name rises under it, and the screen opens. Shown once per browser session, before the first screen.
// The splash is plain HTML with its own small script, so it starts before React loads and never waits for it.
export const LOGO_PATH='M35 85H22Q15 85 15 78V44Q15 40 18.5 37.5L46 18.5Q50 16 54 18.5L81.5 37.5Q85 40 85 44V78Q85 85 78 85H57C46 85 38 77 38 66V59A14 14 0 0 1 66 59V72';

// Kept inline so the first paint does not wait for the site's stylesheets.
const styles=`.entry-splash{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;background:var(--t-bg,#F2F4F8);overflow:hidden;
  /* Without its script the splash still leaves by itself. */
  animation:entry-splash-fallback .01s linear 6s forwards}
.entry-splash[data-state="skip"],.entry-splash[data-state="done"]{display:none}
.entry-splash[data-state="leaving"]{opacity:0;transform:scale(1.04);filter:blur(6px);pointer-events:none;transition:opacity .5s cubic-bezier(.4,0,.2,1),transform .5s cubic-bezier(.4,0,.2,1),filter .5s ease}
.entry-splash-glow{position:absolute;inset:-20%;background:
  radial-gradient(38% 30% at 50% 42%,rgba(99,102,241,.20),transparent 70%),
  radial-gradient(30% 26% at 62% 58%,rgba(6,182,212,.16),transparent 70%);
  animation:entry-glow 2.4s ease-in-out both}
.entry-splash-stage{position:relative;display:grid;justify-items:center;gap:12px;padding:24px;text-align:center}
.entry-splash-mark{display:block;overflow:visible;filter:drop-shadow(0 10px 24px rgba(79,70,229,.18))}
.entry-splash-mark path{fill:none;stroke-width:9;stroke-linecap:round;stroke-linejoin:round}
.entry-splash-trace{stroke:rgba(79,70,229,.10)}
.entry-splash-stroke{stroke-dasharray:1;stroke-dashoffset:1;animation:entry-draw 1.15s cubic-bezier(.65,0,.35,1) .12s forwards,entry-breathe .7s ease-out 1.25s}
.entry-splash-ring{position:absolute;top:24px;left:50%;width:112px;height:112px;margin-left:-56px;border-radius:50%;border:2px solid rgba(99,102,241,.45);opacity:0;animation:entry-ring 1.1s cubic-bezier(.2,.7,.2,1) 1.05s forwards}
.entry-splash-ring-late{border-color:rgba(6,182,212,.45);animation-delay:1.25s}
.entry-splash-name{font-size:28px;line-height:36px;font-weight:750;letter-spacing:-.02em;color:var(--t-ink,#0E1324);opacity:0;transform:translateY(12px);animation:entry-rise .55s cubic-bezier(.2,.7,.2,1) .95s forwards}
.entry-splash-line{font-size:14px;line-height:20px;color:var(--t-muted,#5F6780);opacity:0;transform:translateY(8px);animation:entry-rise .55s cubic-bezier(.2,.7,.2,1) 1.15s forwards}
@keyframes entry-draw{to{stroke-dashoffset:0}}
@keyframes entry-breathe{0%{transform:scale(1)}40%{transform:scale(1.06)}100%{transform:scale(1)}}
.entry-splash-stroke{transform-origin:50% 50%;transform-box:fill-box}
@keyframes entry-ring{0%{opacity:.9;transform:scale(.9)}100%{opacity:0;transform:scale(2.1)}}
@keyframes entry-rise{to{opacity:1;transform:none}}
@keyframes entry-glow{0%{opacity:0;transform:scale(.9)}60%{opacity:1}100%{opacity:1;transform:scale(1)}}
@keyframes entry-splash-fallback{to{visibility:hidden;pointer-events:none}}
/* While the story plays, the page under it keeps still and the loading line waits. */
html:has(.entry-splash[data-state="playing"]) body{overflow:hidden}
.entry-splash[data-state="playing"]~.app-loader,.entry-splash[data-state="playing"]~.app-loader-pill{display:none}
@media (prefers-reduced-motion:reduce){
  .entry-splash-glow,.entry-splash-ring{animation:none;opacity:0}
  .entry-splash-stroke{animation:none;stroke-dashoffset:0}
  .entry-splash-name,.entry-splash-line{animation:none;opacity:1;transform:none}
  .entry-splash[data-state="leaving"]{transform:none;filter:none;transition:opacity .15s linear}
}`;

const script=`(function(){var s=document.getElementById('entry-splash');if(!s)return;
try{if(sessionStorage.getItem('ai-arenda-entry')){s.setAttribute('data-state','skip');return;}sessionStorage.setItem('ai-arenda-entry','1');}catch(e){}
var calm=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches,t0=Date.now(),left=false;
function leave(){if(left)return;left=true;setTimeout(function(){s.setAttribute('data-state','leaving');setTimeout(function(){s.setAttribute('data-state','done');},calm?160:520);},Math.max(0,(calm?450:1900)-(Date.now()-t0)));}
if(document.readyState==='complete')leave();else window.addEventListener('load',leave,{once:true});setTimeout(leave,3600);})();`;

export function EntrySplash(){
  return <>
    <style dangerouslySetInnerHTML={{__html:styles}}/>
    <div id="entry-splash" className="entry-splash" data-state="playing" aria-hidden="true" suppressHydrationWarning>
      <div className="entry-splash-glow"/>
      <div className="entry-splash-stage">
        <span className="entry-splash-ring"/>
        <span className="entry-splash-ring entry-splash-ring-late"/>
        <svg className="entry-splash-mark" viewBox="0 0 100 100" width="112" height="112" role="presentation">
          <defs>
            <linearGradient id="entry-splash-ink" gradientUnits="userSpaceOnUse" x1="15" y1="16" x2="85" y2="86">
              <stop offset="0" stopColor="#4F46E5"/><stop offset=".55" stopColor="#3B82F6"/><stop offset="1" stopColor="#06B6D4"/>
            </linearGradient>
          </defs>
          <path className="entry-splash-trace" d={LOGO_PATH} pathLength={1}/>
          <path className="entry-splash-stroke" d={LOGO_PATH} pathLength={1} stroke="url(#entry-splash-ink)"/>
        </svg>
        <div className="entry-splash-name">AI&nbsp;Аренда</div>
        <div className="entry-splash-line">Жильё на часы и сутки</div>
      </div>
    </div>
    <script dangerouslySetInnerHTML={{__html:script}}/>
  </>;
}
