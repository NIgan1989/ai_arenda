// The language of the app (lib/i18n.ts): the one chosen in the menu, kept on this phone; before any choice, the
// language of the phone. The choice is not a secret; it is kept beside the last role (api.ts).
import {useEffect,useState} from 'react';
import {Platform} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import {lang,langOf,onLang,setLang,isLang,type Lang} from '../../lib/i18n';

const langKey='ai-arenda-lang-v1';
const browserStore=()=>{try{return globalThis.localStorage??null;}catch{return null;}};
function phoneTag(){
  try{return Intl.DateTimeFormat().resolvedOptions().locale;}catch{return '';}
}
async function readSaved():Promise<string|null>{
  try{return Platform.OS==='web'?browserStore()?.getItem(langKey)??null:await SecureStore.getItemAsync(langKey);}catch{return null;}
}
/** At launch: the phone's language at once, the saved choice as soon as it is read. */
export function startLang(){
  const web=Platform.OS==='web'?(globalThis.navigator?.language||''):'';
  setLang(langOf(web||phoneTag()));
  void readSaved().then(saved=>{if(isLang(saved))setLang(saved);});
}
/** The choice in the menu: shown at once, kept for the next launch. */
export async function chooseLang(next:Lang){
  setLang(next);
  try{if(Platform.OS==='web')browserStore()?.setItem(langKey,next);else await SecureStore.setItemAsync(langKey,next);}catch{/* Not kept: the next launch starts from the phone's language. */}
}
/** The current language; the component that calls it draws again when it changes. The root of the app calls it,
 *  so every screen is drawn again in the new language. */
export function useLang():Lang{
  const [value,setValue]=useState(lang());
  useEffect(()=>onLang(setValue),[]);
  return value;
}
