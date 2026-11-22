import {RTCPeerConnection,RTCSessionDescription,mediaDevices} from 'react-native-webrtc';
// WebRTC on Android and iPhone (react-native-webrtc). A received audio track plays by itself, so playRemote does nothing.
const ICE={iceServers:[{urls:'stun:stun.cloudflare.com:3478'}],bundlePolicy:'max-bundle'};
export function newPeer():any{return new RTCPeerConnection(ICE as any);}
export function description(type:'offer'|'answer',sdp:string):any{return new RTCSessionDescription({type,sdp});}
export async function microphone():Promise<any>{return await mediaDevices.getUserMedia({audio:true,video:false});}
export function playRemote(_track:any){}
export function stopRemote(){}
