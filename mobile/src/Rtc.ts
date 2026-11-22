// WebRTC in the browser build (the QA stand and the site preview): the browser's own objects.
// The phone build uses Rtc.native.ts with react-native-webrtc; both give the call screen the same few functions.
const ICE={iceServers:[{urls:'stun:stun.cloudflare.com:3478'}],bundlePolicy:'max-bundle' as RTCBundlePolicy};
export function newPeer():any{return new RTCPeerConnection(ICE);}
export function description(type:'offer'|'answer',sdp:string):any{return {type,sdp};}
export async function microphone():Promise<any>{return await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});}
let speaker:HTMLAudioElement|null=null;
export function playRemote(track:any){speaker=speaker||new Audio();speaker.autoplay=true;speaker.srcObject=new MediaStream([track]);void speaker.play().catch(()=>{});}
export function stopRemote(){if(speaker){speaker.pause();speaker.srcObject=null;}}
