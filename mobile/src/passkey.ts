// The browser version of src/passkey.native.ts, for the test stand opened at http://localhost:8090: the same calls on top
// of navigator.credentials, with the JSON shapes the server (lib/passkeys.ts) and react-native-passkey use.
const toBase64url=(buffer:ArrayBuffer)=>btoa(Array.from(new Uint8Array(buffer),b=>String.fromCharCode(b)).join('')).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const fromBase64url=(value:string)=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4)),c=>c.charCodeAt(0));
const ids=(list:any[]|undefined)=>(list||[]).map(c=>({...c,id:fromBase64url(c.id)}));

export function passkeyAvailable(){return typeof window!=='undefined'&&!!(window as any).PublicKeyCredential&&!!window.isSecureContext;}
export async function passkeyCreate(options:Record<string,any>){
 const credential=await navigator.credentials.create({publicKey:{...options,challenge:fromBase64url(options.challenge),user:{...options.user,id:fromBase64url(options.user.id)},excludeCredentials:ids(options.excludeCredentials)} as any}) as any;
 const r=credential.response;
 return {id:credential.id,rawId:toBase64url(credential.rawId),type:credential.type,authenticatorAttachment:credential.authenticatorAttachment,clientExtensionResults:credential.getClientExtensionResults(),response:{clientDataJSON:toBase64url(r.clientDataJSON),attestationObject:toBase64url(r.attestationObject),transports:r.getTransports?.()||[]}};
}
export async function passkeyGet(options:Record<string,any>){
 const credential=await navigator.credentials.get({publicKey:{...options,challenge:fromBase64url(options.challenge),allowCredentials:ids(options.allowCredentials)} as any}) as any;
 const r=credential.response;
 return {id:credential.id,rawId:toBase64url(credential.rawId),type:credential.type,authenticatorAttachment:credential.authenticatorAttachment,clientExtensionResults:credential.getClientExtensionResults(),response:{clientDataJSON:toBase64url(r.clientDataJSON),authenticatorData:toBase64url(r.authenticatorData),signature:toBase64url(r.signature),...(r.userHandle?{userHandle:toBase64url(r.userHandle)}:{})}};
}
export function passkeyFailure(error:unknown):'cancelled'|'none'|'exists'|'failed'{const name=(error as {name?:string})?.name;return name==='NotAllowedError'?'cancelled':name==='InvalidStateError'?'exists':'failed';}
const store=()=>{try{return globalThis.localStorage??null;}catch{return null;}};
export async function readPasskeyNote(key:string){try{return store()?.getItem('aiarenda.passkey.'+key)??null;}catch{return null;}}
export async function writePasskeyNote(key:string,value:string|null){try{if(value===null)store()?.removeItem('aiarenda.passkey.'+key);else store()?.setItem('aiarenda.passkey.'+key,value);}catch{/* the stand only */}}
