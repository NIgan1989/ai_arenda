import * as SecureStore from 'expo-secure-store';
import {Passkey} from 'react-native-passkey';

// The phone's own passkey sheet (Face ID, Touch ID, a fingerprint or the screen lock) through react-native-passkey:
// iOS 15+ and Android 9+ with Google Play services. The server side is lib/passkeys.ts; src/passkey.ts is the browser
// version for the test stand.
export function passkeyAvailable(){try{return Passkey.isSupported();}catch{return false;}}
export async function passkeyCreate(options:Record<string,any>){return await Passkey.create(options as any) as Record<string,any>;}
export async function passkeyGet(options:Record<string,any>){return await Passkey.get(options as any) as Record<string,any>;}
// «cancelled»: the person closed the sheet, nothing to say; «none»: this phone holds no key for the service;
// «exists»: this phone already holds a key of the account (a synced one, for example).
export function passkeyFailure(error:unknown):'cancelled'|'none'|'exists'|'failed'{
 const code=(error as {error?:string})?.error;
 return code==='UserCancelled'?'cancelled':code==='NoCredentials'?'none':code==='CredentialAlreadyExists'?'exists':'failed';
}
// Which account turned the passkey on with this phone, and who was already asked: kept on the phone only.
export async function readPasskeyNote(key:string){try{return await SecureStore.getItemAsync('aiarenda.passkey.'+key);}catch{return null;}}
export async function writePasskeyNote(key:string,value:string|null){try{if(value===null)await SecureStore.deleteItemAsync('aiarenda.passkey.'+key);else await SecureStore.setItemAsync('aiarenda.passkey.'+key,value);}catch{/* a note that is not kept only means the offer may come once more */}}
