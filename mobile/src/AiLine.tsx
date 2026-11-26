import {t} from '../../lib/i18n';
import React, { useState } from 'react';
import {Thinking} from './Thinking';
import { Image, Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { C, type } from './styles';
import { T } from './tokens';
import { AI_LINE_MAX, cleanAiText } from '../../lib/ai-line';
import { useVoice } from './useVoice';
import { VOICE_LANGS } from './voice';

// The AI administrator's mark: the crown of the sign, not the sparkles of every generated app.
const sparkle = require('../assets/menu/shanyrak.png');
const arrow = require('../assets/ui/arrow-up.png');
const mic = require('../assets/ui/mic.png');
const stopIcon = require('../assets/ui/stop.png');

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  onSend: (text: string) => void;
  placeholder: string;
  // The last resort for a line so narrow that the example does not fit even one text size smaller.
  shortPlaceholder?: string;
  label: string;
  busy?: boolean;
};

const SMALLER = type.label.fontSize / type.body.fontSize;

// The one line of the first screen: free Russian text in, a real action out.
// The screen that owns it decides what "send" does (a search for the guest, a message to the AI administrator for others).
export function AiLine({ value, onChangeText, onSend, placeholder, shortPlaceholder, label, busy = false }: Props) {
  const [focused, setFocused] = useState(false);
  // An example cut in the middle reads as broken, so it is shown whole, as on the site: in the size of the
  // typed text where it fits, one size smaller on a narrow phone, and only then replaced by the short one.
  const [room, setRoom] = useState(0);
  const [natural, setNatural] = useState(0);
  const [shortWidth, setShortWidth] = useState(0);
  const fits = (width: number, scale = 1) => !room || !width || width * scale + 4 <= room;
  const example = fits(natural)
    ? { text: placeholder, compact: false }
    : fits(natural, SMALLER) || !shortPlaceholder
      ? { text: placeholder, compact: true }
      : { text: shortPlaceholder, compact: !fits(shortWidth) };
  const text = cleanAiText(value);
  const send = () => {
    if (text && !busy) onSend(text);
  };
  // Voice: the words appear in the line while they are said; when the guest stops speaking, they are sent as typed.
  const voice = useVoice({ max: AI_LINE_MAX, onText: onChangeText, onDone: said => { const clean = cleanAiText(said); if (clean) onSend(clean); } });
  // The microphone stands where «Отправить» is while the line is empty; with text in the line the arrow is back.
  const speak = voice.available && !busy && (voice.listening || !text);
  return (
    <View style={a.box}><View style={[a.line, (focused || voice.listening) && a.lineFocused]}><Image source={sparkle} style={a.mark} accessibilityIgnoresInvertColors /><View style={a.field} onLayout={e => setRoom(e.nativeEvent.layout.width)}>{/* The example is drawn as text, not as a native placeholder, so that its size can follow the room it has. */}{!value && (
          // The box takes no touches: a tap anywhere on the line must reach the input under it.
          <View style={a.exampleBox}><Text numberOfLines={1} style={[a.example, example.compact && a.exampleCompact]} importantForAccessibility="no" accessibilityElementsHidden>{voice.listening ? t('Слушаем…') : example.text}</Text><Text numberOfLines={1} style={a.measure} onLayout={e => setNatural(e.nativeEvent.layout.width)} importantForAccessibility="no" accessibilityElementsHidden>{placeholder}</Text>{!!shortPlaceholder && (
              <Text numberOfLines={1} style={a.measure} onLayout={e => setShortWidth(e.nativeEvent.layout.width)} importantForAccessibility="no" accessibilityElementsHidden>{shortPlaceholder}</Text>
            )}</View>
        )}<TextInput
          accessibilityLabel={label}
          accessibilityHint={t('Например: {placeholder}',{placeholder})}
          style={a.input}
          value={value}
          onChangeText={next => { voice.clearNote(); onChangeText(next); }}
          maxLength={AI_LINE_MAX}
          returnKeyType="send"
          submitBehavior="submit"
          onSubmitEditing={send}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          editable={!busy && !voice.listening}
        /></View>{speak ? (
        <View style={a.voice}>{/* The pulse follows the voice, so the guest sees the phone hears them. */}{voice.listening && <View style={[a.pulse, { transform: [{ scale: 1 + voice.level * 0.5 }] }]} />}<Pressable
            accessibilityRole="button"
            accessibilityLabel={voice.listening ? t('Остановить запись') : t('Голосовой ввод')}
            accessibilityHint={voice.listening ? undefined : t('Скажите, что ищете')}
            onPress={voice.listening ? voice.stop : () => void voice.start()}
            style={({ pressed }) => [a.send, a.mic, voice.listening && a.micOn, pressed && a.micPressed]}
          ><Image source={voice.listening ? stopIcon : mic} style={[a.arrow, { tintColor: voice.listening ? C.onAccent : C.ink }]} accessibilityIgnoresInvertColors /></Pressable></View>
      ) : (
      /* The round send button: dimmed until there is something to send. */
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('Отправить')}
        accessibilityState={{ disabled: busy || !text }}
        disabled={busy || !text}
        onPress={send}
        style={({ pressed }) => [a.send, !text && !busy && a.sendIdle, pressed && a.sendPressed]}
      >{busy ? <Thinking size="sm" color={C.onAccent} /> : <Image source={arrow} style={a.arrow} accessibilityIgnoresInvertColors />}</Pressable>
      )}</View>{voice.listening && (
      <View style={a.langs} accessibilityRole="radiogroup" accessibilityLabel={t('Язык речи')}><Text style={a.say}>{t('Говорите. Найду, когда закончите.')}</Text>{VOICE_LANGS.map(([id, title]) => (
          <Pressable key={id} accessibilityRole="radio" accessibilityLabel={title} accessibilityState={{ checked: voice.lang === id }} onPress={() => voice.setLang(id)} hitSlop={8} style={[a.lang, voice.lang === id && a.langOn]}><Text style={[a.langText, voice.lang === id && a.langTextOn]}>{title}</Text></Pressable>
        ))}</View>
    )}{!voice.listening && !!voice.note && (
      <View style={a.note}><Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={a.noteText}>{voice.note.text}</Text>{voice.note.settings && Platform.OS !== 'web' && (
          <Pressable accessibilityRole="button" onPress={() => void Linking.openSettings()} hitSlop={8} style={({ pressed }) => pressed && a.micPressed}><Text style={a.noteLink}>{t('Открыть настройки')}</Text></Pressable>
        )}</View>
    )}</View>
  );
}

const a = StyleSheet.create({
  box: { gap: 8 },
  voice: { width: T.control.touch, height: T.control.touch, alignItems: 'center', justifyContent: 'center' },
  pulse: { position: 'absolute', width: T.control.touch, height: T.control.touch, borderRadius: T.radius.full, backgroundColor: C.dangerSoft },
  mic: { backgroundColor: C.surfaceAlt },
  micOn: { backgroundColor: C.danger },
  micPressed: { opacity: 0.6 },
  langs: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  say: { flex: 1, minWidth: 0, ...type.label, color: C.muted },
  lang: { minHeight: 32, paddingHorizontal: 12, borderRadius: T.radius.full, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, justifyContent: 'center' },
  langOn: { borderColor: C.ink, backgroundColor: C.surfaceAlt },
  langText: { ...type.caption, color: C.inkSoft, fontWeight: '600' },
  langTextOn: { color: C.inkSoft },
  note: { gap: 4 },
  noteText: { ...type.label, color: C.inkSoft },
  noteLink: { ...type.label, color: C.ink, fontWeight: '600' },
  line: {
    minHeight: T.control.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 12,
    paddingRight: 4,
    borderRadius: T.radius.full,
    borderWidth: 2,
    borderColor: C.line,
    backgroundColor: C.surface,
    shadowColor: C.ink,
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4
  },
  lineFocused: { borderColor: C.ink },
  mark: { width: 20, height: 20, tintColor: C.ink },
  field: { flex: 1, minWidth: 0, justifyContent: 'center' },
  exampleBox: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'center', pointerEvents: 'none' },
  example: { ...type.body, color: C.muted },
  exampleCompact: { ...type.label },
  measure: { position: 'absolute', left: 0, opacity: 0, ...type.body },
  input: {
    height: T.control.field,
    paddingVertical: 0,
    ...type.body,
    color: C.ink,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null)
  },
  send: { width: T.control.touch, height: T.control.touch, borderRadius: T.radius.full, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  sendIdle: { opacity: 0.45 },
  sendPressed: { backgroundColor: C.inkSoft },
  arrow: { width: 24, height: 24, tintColor: C.onAccent }
});
