import {t} from '../../lib/i18n';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { C, type } from './styles';
import { T } from './tokens';
import type { Helper } from './guest-helpers';

type Props = {
  helpers: Helper[];
  onPress: (helper: Helper) => void;
  busy?: boolean;
};

// «Помогайки»: one row of short grey phrases over the list of found places, as the chips under Airbnb's search: no ✦ and
// no counters (board «Экраны старой версии», 2026-11-26); the count stays in the screen reader's words. A tap narrows the list.
export function GuestHelpers({ helpers, onPress, busy = false }: Props) {
  if (!helpers.length) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={s.scroll} contentContainerStyle={s.row} accessibilityLabel={t('Подсказки: сузить выбор')}>{helpers.map(helper => (
        <Pressable
          key={helper.id}
          accessibilityRole="button"
          accessibilityLabel={helper.off ? t('{title}: уже пробовали',{title:helper.title}) : t('{title}: останется {count}',{title:helper.title,count:helper.count})}
          accessibilityState={{ disabled: busy || !!helper.off }}
          disabled={busy || !!helper.off}
          onPress={() => onPress(helper)}
          hitSlop={{ top: 6, bottom: 6 }}
          style={({ pressed }) => [s.chip, helper.hot && s.hot, helper.off && s.off, pressed && s.pressed]}
        ><Text numberOfLines={1} style={[s.text, helper.hot && s.textHot, helper.off && s.textOff]}>{helper.title}</Text></Pressable>
      ))}</ScrollView>
  );
}

// The steps taken, and the one tap that takes the last of them back.
export function HelperTrail({ words, count, onBack, busy = false }: { words: string; count: string; onBack: () => void; busy?: boolean }) {
  return (
    <View style={s.trail}><Text numberOfLines={1} style={s.trailText}><Text style={s.trailWords}>{words}</Text>{count ? ' · ' + count : ''}</Text><Pressable accessibilityRole="button" accessibilityLabel={t('Вернуть как было')} accessibilityState={{ disabled: busy }} disabled={busy} onPress={onBack} hitSlop={{ top: 8, bottom: 8, left: 8 }} style={({ pressed }) => [s.undo, pressed && s.pressed]}><Text style={s.undoText}>{t('↩ Вернуть')}</Text></Pressable></View>
  );
}

const H = 36;
const s = StyleSheet.create({
  scroll: { marginHorizontal: -16, flexGrow: 0 },
  row: { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
  chip: { height: H, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, borderRadius: T.radius.full, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  hot: { backgroundColor: C.accent, borderColor: C.accent },
  off: { borderColor: C.line },
  pressed: { opacity: 0.6 },
  text: { ...type.label, color: C.ink, fontWeight: '500' },
  textHot: { color: C.onAccent },
  textOff: { color: C.muted, textDecorationLine: 'line-through', fontWeight: '400' },
  trail: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 12, paddingRight: 4, borderRadius: T.radius.md, borderWidth: 1, borderColor: C.accentLine, backgroundColor: C.accentSoft },
  trailText: { ...type.label, flex: 1, color: C.accent },
  trailWords: { fontWeight: '600' },
  undo: { height: H, paddingHorizontal: 12, borderRadius: T.radius.full, borderWidth: 1, borderColor: C.accentLine, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  undoText: { ...type.label, color: C.accent, fontWeight: '600' }
});
