// Voice input of the AI line: the words of its states and errors. The recognition itself is the phone's own
// (Android SpeechRecognizer, iOS SFSpeechRecognizer) through expo-speech-recognition; see useVoice.ts.
// No React Native here, so the words are covered by mobile/tests/voice.test.mjs.
export type VoiceLang = 'ru-RU' | 'kk-KZ';
export const VOICE_LANGS: [VoiceLang, string][] = [['ru-RU', 'Русский'], ['kk-KZ', 'Қазақша']];

export type VoiceNote = { text: string; settings?: boolean };

/**
 * What the line says when listening ended with an error. '' for what needs no words: the guest stopped it,
 * or said nothing and the line simply returns to the example.
 */
export function voiceErrorNote(code: string, lang: VoiceLang = 'ru-RU'): VoiceNote | null {
  switch (code) {
    case 'aborted': return null;
    case 'no-speech': case 'speech-timeout': return { text: 'Не расслышал. Нажмите на микрофон и скажите ещё раз.' };
    case 'not-allowed': return { text: 'Нет доступа к микрофону. Разрешите его в настройках телефона или напишите запрос.', settings: true };
    case 'language-not-supported': return { text: lang === 'kk-KZ' ? 'Казахскую речь этот телефон не распознаёт. Скажите по-русски или напишите.' : 'Русскую речь этот телефон не распознаёт. Напишите запрос.' };
    case 'network': return { text: 'Для распознавания речи нужен интернет. Проверьте связь или напишите запрос.' };
    case 'service-not-allowed': return { text: 'Распознавание речи на телефоне выключено. Включите его в настройках или напишите запрос.', settings: true };
    case 'busy': return { text: 'Микрофон занят другим приложением. Попробуйте ещё раз.' };
    case 'interrupted': return { text: 'Запись прервалась. Нажмите на микрофон ещё раз.' };
    default: return { text: 'Не получилось распознать речь. Попробуйте ещё раз или напишите запрос.' };
  }
}

/** The recognised words as the line takes them: one line, no trailing full stop, cut to the line's length. */
export function voiceText(transcript: string, max: number) {
  const text = String(transcript || '').replace(/\s+/g, ' ').trim().replace(/[.。]+$/, '');
  return text.length > max ? text.slice(0, max).replace(/\s+\S*$/, '') : text;
}

/** The volume the recogniser reports (-2…10) as a size of the pulse around the button, 0…1. */
export const voiceLevel = (value: number) => Math.max(0, Math.min(1, (Number(value) || 0) / 10));
