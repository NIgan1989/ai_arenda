import {t} from '../../lib/i18n';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { C, type } from './styles';
import { T } from './tokens';
import type { GuestToken, Section } from './guest-tokens';

type Props = {
  tokens: GuestToken[];
  // The tokens an empty answer blames: shown in red.
  blamed?: string[];
  // The part of the form that is open: its tokens are outlined.
  open?: Section | 'all' | '';
  onOpen: (section: Section | 'all') => void;
  onClear: (token: GuestToken) => void;
  // One row that scrolls (over the results) instead of wrapping (on the map and in the form).
  line?: boolean;
  busy?: boolean;
};

// The guest's conditions under the AI line. A tap on a token opens its part of the form; the cross takes the
// condition off and the search runs again. «Условия» opens the whole form.
export function GuestTokens({ tokens, blamed = [], open = '', onOpen, onClear, line = false, busy = false }: Props) {
  const items = (
    <>{tokens.map(token => {
        const bad = blamed.includes(token.id), set = !!token.clear, active = open === token.section;
        return (
          <View key={token.id} style={[s.token, set && s.set, bad && s.bad, active && s.active]}><Pressable
              accessibilityRole="button"
              accessibilityLabel={bad ? t('{title}. С этим условием свободного нет. Изменить',{title:token.title}) : t('{title}. Изменить',{title:token.title})}
              accessibilityState={{ expanded: active, disabled: busy }}
              disabled={busy}
              onPress={() => onOpen(token.section)}
              hitSlop={{ top: 6, bottom: 6 }}
              style={({ pressed }) => [s.body, set && s.bodySet, pressed && s.pressed]}
            ><Text numberOfLines={1} style={[s.text, set && s.textSet, bad && s.textBad]}>{token.title}</Text></Pressable>{set && (
              <Pressable accessibilityRole="button" accessibilityLabel={t('Убрать условие: {title}',{title:token.title})} accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => onClear(token)} hitSlop={{ top: 6, bottom: 6, right: 4 }} style={({ pressed }) => [s.cross, pressed && s.pressed]}><View style={[s.crossDot, bad && s.crossDotBad]}><Text style={[s.crossText, bad && s.textBad]}>✕</Text></View></Pressable>
            )}</View>
        );
      })}<Pressable accessibilityRole="button" accessibilityLabel={t('Все условия поиска')} accessibilityState={{ expanded: open === 'all', disabled: busy }} disabled={busy} onPress={() => onOpen('all')} hitSlop={{ top: 6, bottom: 6 }} style={({ pressed }) => [s.token, s.more, open === 'all' && s.active, pressed && s.pressed]}><Text style={s.moreText}>{t('+ Условия')}</Text></Pressable></>
  );
  if (line) return <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={s.scroll} contentContainerStyle={s.row} accessibilityLabel={t('Условия поиска')}>{items}</ScrollView>;
  return <View style={s.wrap} accessibilityLabel={t('Условия поиска')}>{items}</View>;
}

const H = 36;
const s = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  scroll: { marginHorizontal: -16, flexGrow: 0 },
  row: { gap: 8, paddingHorizontal: 16 },
  token: { height: H, maxWidth: '100%', flexDirection: 'row', alignItems: 'center', borderRadius: T.radius.full, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  set: { borderColor: C.accentLine, backgroundColor: C.accentSoft },
  bad: { borderColor: C.danger, backgroundColor: C.dangerSoft },
  active: { borderColor: C.accent, borderWidth: 2 },
  body: { height: H, justifyContent: 'center', paddingHorizontal: 12, flexShrink: 1 },
  bodySet: { paddingRight: 4 },
  text: { ...type.label, color: C.inkSoft, fontWeight: '500' },
  textSet: { color: C.accentPressed, fontWeight: '600' },
  textBad: { color: C.danger },
  cross: { width: 32, height: H, alignItems: 'center', justifyContent: 'center' },
  crossDot: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: C.accentLine },
  crossDotBad: { backgroundColor: C.surface },
  crossText: { fontSize: 10, lineHeight: 12, color: C.accentPressed, fontWeight: '700' },
  more: { paddingHorizontal: 12, borderStyle: 'dashed', borderColor: C.accentLine, justifyContent: 'center' },
  moreText: { ...type.label, color: C.accent, fontWeight: '600' },
  pressed: { opacity: 0.6 }
});
