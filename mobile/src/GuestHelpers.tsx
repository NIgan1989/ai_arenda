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

// «Помогайки»: one row of short phrases over the found places. A tap narrows what is shown, right here.
export function GuestHelpers({ helpers, onPress, busy = false }: Props) {
  if (!helpers.length) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={s.scroll} contentContainerStyle={s.row} accessibilityLabel={t('Подсказки: сузить выбор')}><Text style={s.spark} accessibilityElementsHidden importantForAccessibility="no">✦</Text>{helpers.map(helper => (
        <Pressable
          key={helper.id}
          accessibilityRole="button"
          accessibilityLabel={helper.off ? t('{title}: уже пробовали',{title:helper.title}) : t('{title}: останется {count}',{title:helper.title,count:helper.count})}
          accessibilityState={{ disabled: busy || !!helper.off }}
          disabled={busy || !!helper.off}
          onPress={() => onPress(helper)}
          hitSlop={{ top: 6, bottom: 6 }}
          style={({ pressed }) => [s.chip, helper.hot && s.hot, helper.off && s.off, pressed && s.pressed]}
        ><Text numberOfLines={1} style={[s.text, helper.hot && s.textHot, helper.off && s.textOff]}>{helper.title}</Text>{!helper.off && (
            <View style={[s.count, helper.hot && s.countHot]}><Text style={[s.countText, helper.hot && s.textHot]}>{helper.count}</Text></View>
          )}</Pressable>
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
  spark: { ...type.label, color: C.aiFrom },
  chip: { height: H, flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 12, paddingRight: 6, borderRadius: T.radius.full, borderWidth: 1.5, borderColor: C.accentLine, backgroundColor: C.surface },
  hot: { backgroundColor: C.accent, borderColor: C.accent },
  off: { borderColor: C.line, paddingRight: 12 },
  pressed: { opacity: 0.6 },
  text: { ...type.label, color: C.accent, fontWeight: '600' },
  textHot: { color: C.onAccent },
  textOff: { color: C.muted, textDecorationLine: 'line-through', fontWeight: '400' },
  count: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: C.accentSoft },
  countHot: { backgroundColor: 'rgba(255,255,255,0.22)' },
  countText: { ...type.caption, color: C.accent, fontWeight: '700' },
  trail: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 12, paddingRight: 4, borderRadius: T.radius.md, borderWidth: 1, borderColor: C.accentLine, backgroundColor: C.accentSoft },
  trailText: { ...type.label, flex: 1, color: C.accent },
  trailWords: { fontWeight: '700' },
  undo: { height: H, paddingHorizontal: 12, borderRadius: T.radius.full, borderWidth: 1, borderColor: C.accentLine, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  undoText: { ...type.label, color: C.accent, fontWeight: '700' }
});
