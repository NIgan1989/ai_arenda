import React, { useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { C, type } from './styles';
import { T } from './tokens';
import { AI_LINE_MAX, cleanAiText } from '../../lib/ai-line';

const sparkle = require('../assets/ui/sparkle.png');
const arrow = require('../assets/ui/arrow-up.png');

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
  return (
    <View style={[a.line, focused && a.lineFocused]}>
      <Image source={sparkle} style={a.mark} accessibilityIgnoresInvertColors />
      <View style={a.field} onLayout={e => setRoom(e.nativeEvent.layout.width)}>
        {/* The example is drawn as text, not as a native placeholder, so that its size can follow the room it has. */}
        {!value && (
          // The box takes no touches: a tap anywhere on the line must reach the input under it.
          <View style={a.exampleBox}>
            <Text numberOfLines={1} style={[a.example, example.compact && a.exampleCompact]} importantForAccessibility="no" accessibilityElementsHidden>
              {example.text}
            </Text>
            <Text numberOfLines={1} style={a.measure} onLayout={e => setNatural(e.nativeEvent.layout.width)} importantForAccessibility="no" accessibilityElementsHidden>
              {placeholder}
            </Text>
            {!!shortPlaceholder && (
              <Text numberOfLines={1} style={a.measure} onLayout={e => setShortWidth(e.nativeEvent.layout.width)} importantForAccessibility="no" accessibilityElementsHidden>
                {shortPlaceholder}
              </Text>
            )}
          </View>
        )}
        <TextInput
          accessibilityLabel={label}
          accessibilityHint={'Например: ' + placeholder}
          style={a.input}
          value={value}
          onChangeText={onChangeText}
          maxLength={AI_LINE_MAX}
          returnKeyType="send"
          submitBehavior="submit"
          onSubmitEditing={send}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          editable={!busy}
        />
      </View>
      {/* The round send button is always there; it is dimmed until there is something to send. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Отправить"
        accessibilityState={{ disabled: busy || !text }}
        disabled={busy || !text}
        onPress={send}
        style={({ pressed }) => [a.send, !text && !busy && a.sendIdle, pressed && a.sendPressed]}
      >
        {busy ? <ActivityIndicator size="small" color={C.onAccent} /> : <Image source={arrow} style={a.arrow} accessibilityIgnoresInvertColors />}
      </Pressable>
    </View>
  );
}

const a = StyleSheet.create({
  line: {
    minHeight: T.control.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 12,
    paddingRight: 4,
    borderRadius: T.radius.full,
    borderWidth: 1,
    borderColor: C.lineStrong,
    backgroundColor: C.surface
  },
  lineFocused: { borderColor: C.accent },
  mark: { width: 24, height: 24, tintColor: C.accent },
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
  send: { width: T.control.touch, height: T.control.touch, borderRadius: T.radius.full, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  sendIdle: { opacity: 0.45 },
  sendPressed: { backgroundColor: C.accentPressed },
  arrow: { width: 24, height: 24, tintColor: C.onAccent }
});
