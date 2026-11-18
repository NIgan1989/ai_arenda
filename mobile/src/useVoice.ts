import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { voiceErrorNote, voiceLevel, voiceText, type VoiceLang, type VoiceNote } from './voice';

// The native module is in the builds made after voice input was added. An older build, or a browser without the
// Web Speech API, has none: the microphone is then simply not shown.
type Speech = {
  start: (options: Record<string, unknown>) => void;
  stop: () => void;
  abort: () => void;
  requestPermissionsAsync: () => Promise<{ granted: boolean }>;
  isRecognitionAvailable: () => boolean;
  addListener: (event: string, listener: (event: any) => void) => { remove: () => void };
};
let speech: Speech | null = null;
try {
  speech = require('expo-speech-recognition').ExpoSpeechRecognitionModule as Speech;
} catch {
  speech = null;
}
// The language chosen for dictation is kept while the app is open.
let chosen: VoiceLang = 'ru-RU';
// Listening that was cancelled from outside (another page covered the line, the app went to the background):
// whatever was heard is dropped, nothing is sent.
let dropped = false;
/** Stops listening without sending anything. Called when the line is no longer what the person looks at. */
export function cancelVoice() {
  dropped = true;
  try { speech?.abort(); } catch { /* Nothing was running. */ }
}

type Options = {
  max: number;
  // The words so far: shown in the line while the guest speaks.
  onText: (text: string) => void;
  // Listening ended with words: they are the request.
  onDone: (text: string) => void;
};

export function useVoice({ max, onText, onDone }: Options) {
  const [available] = useState(() => { try { return !!speech && speech.isRecognitionAvailable(); } catch { return false; } });
  const [listening, setListening] = useState(false), [level, setLevel] = useState(0), [note, setNote] = useState<VoiceNote | null>(null), [lang, setLangState] = useState<VoiceLang>(chosen);
  const heard = useRef(''), failed = useRef(false), again = useRef(false), handlers = useRef({ onText, onDone });
  handlers.current = { onText, onDone };
  const begin = (language: VoiceLang) => {
    heard.current = ''; failed.current = false; dropped = false;
    speech!.start({ lang: language, interimResults: true, maxAlternatives: 1, continuous: false, addsPunctuation: false, iosTaskHint: 'search', volumeChangeEventOptions: { enabled: true, intervalMillis: 150 } });
  };
  useEffect(() => {
    if (!speech) return;
    const subs = [
      speech.addListener('start', () => { setListening(true); setNote(null); }),
      speech.addListener('result', event => {
        const text = voiceText(event?.results?.[0]?.transcript || '', max);
        if (!text) return;
        heard.current = text; handlers.current.onText(text);
      }),
      speech.addListener('volumechange', event => setLevel(voiceLevel(event?.value))),
      speech.addListener('error', event => {
        failed.current = true;
        // Words were heard before the error (a pause the recogniser calls «no speech»): they still count.
        if (heard.current && (event?.error === 'no-speech' || event?.error === 'speech-timeout')) { failed.current = false; return; }
        setNote(voiceErrorNote(String(event?.error || ''), chosen));
        // A language the phone cannot recognise is not tried again: the next press listens in Russian.
        if (event?.error === 'language-not-supported' && chosen !== 'ru-RU') { chosen = 'ru-RU'; setLangState('ru-RU'); }
      }),
      speech.addListener('end', () => {
        setListening(false); setLevel(0);
        // Another language was chosen while listening: the same request is listened to again in it.
        if (dropped) { dropped = false; again.current = false; heard.current = ''; handlers.current.onText(''); return; }
        if (again.current) { again.current = false; try { begin(chosen); } catch { /* The line stays as it was. */ } return; }
        const text = heard.current; heard.current = '';
        if (text && !failed.current) handlers.current.onDone(text);
      })
    ];
    // The app left the screen: the microphone does not stay on behind it.
    const app = AppState.addEventListener('change', state => { if (state !== 'active') cancelVoice(); });
    return () => { app.remove(); for (const sub of subs) sub.remove(); try { speech!.abort(); } catch { /* Nothing was running. */ } };
  }, []);
  const start = async () => {
    if (!speech || listening) return;
    setNote(null);
    try {
      const permission = await speech.requestPermissionsAsync();
      if (!permission.granted) { setNote(voiceErrorNote('not-allowed')); return; }
      begin(chosen);
    } catch { setNote(voiceErrorNote('')); }
  };
  // Stop keeps what was heard and sends it; nothing heard yet is a quiet end.
  const stop = () => { try { if (heard.current) speech?.stop(); else speech?.abort(); } catch { /* Already stopped. */ } };
  const setLang = (next: VoiceLang) => {
    if (next === chosen) return;
    chosen = next; setLangState(next);
    if (listening) { again.current = true; try { speech?.abort(); } catch { again.current = false; } }
  };
  return { available, listening, level, note, lang, start, stop, setLang, clearNote: () => setNote(null) };
}
