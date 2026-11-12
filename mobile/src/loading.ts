// One loading signal for the app. A request counts as a «long action» only when it starts soon after a tap,
// so background refreshes (inbox, map, autosave) never light the line. The entry splash waits for `entryReady`.
const GESTURE_WINDOW=1500;
type Listener=()=>void;
const state={requests:0,lastGesture:0,entryReady:false,listeners:new Set<Listener>()};
const emit=()=>state.listeners.forEach(listener=>listener());

export function markGesture(){state.lastGesture=Date.now();return false;}
export function subscribeLoading(listener:Listener){state.listeners.add(listener);return()=>{state.listeners.delete(listener);};}
export const loadingBusy=()=>state.requests>0;
export const isEntryReady=()=>state.entryReady;
export function entryReady(){if(state.entryReady)return;state.entryReady=true;emit();}

/** Wraps one request; returns the function that closes it, or null when the request runs in the background. */
export function trackRequest():(()=>void)|null{
  if(Date.now()-state.lastGesture>=GESTURE_WINDOW)return null;
  state.requests++;emit();
  let closed=false;
  return()=>{
    if(closed)return;closed=true;state.requests--;
    // A request that follows a tracked one (save, then reload) belongs to the same action.
    state.lastGesture=Math.max(state.lastGesture,Date.now()-GESTURE_WINDOW+300);emit();
  };
}
