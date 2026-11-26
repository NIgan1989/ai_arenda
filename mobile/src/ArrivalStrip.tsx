import {t as tr} from '../../lib/i18n';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { C, type } from './styles';
import { T } from './tokens';
import { clock, type Arrival } from './arrival';
import { PopSheet } from './PopSheet';

// The arrival over the found places: one row «Заезд · 14:30 ›»; a tap opens the half-hour steps round the asked time on
// their own sheet, each said in words, «15:00 · свободно 9» (board «Экраны старой версии», 2026-11-26).
// Picking a time changes only the words of the pins whose answer changed; the pins stay where they are.
export function ArrivalStrip({ arrival, at, counts, asked, onPick, busy }: { arrival: Arrival; at: number; counts: number[]; asked: number; onPick: (at: number) => void; busy?: boolean }) {
  const [open, setOpen] = useState(false);
  const free = (n: number) => (n ? tr('свободно {n}', { n }) : tr('всё занято'));
  const now = counts[Math.max(0, arrival.steps.indexOf(at))] || 0;
  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel={tr('Заезд в {v}, можно занять: {n}', { v: clock(at), n: now })} accessibilityHint={tr('Выбрать другое время')} onPress={() => setOpen(true)} style={({ pressed }) => [a.row, pressed && a.pressed]}>
        <Text style={a.key}>{tr('Заезд')}</Text>
        <Text style={a.value}>{clock(at)}</Text>
        <Text style={a.note}>{free(now)}</Text>
        <Text style={a.chevron}>›</Text>
      </Pressable>
      <PopSheet visible={open} title={tr('Заезд')} onClose={() => setOpen(false)}>
        <View>
          {arrival.steps.map((t, i) => {
            const on = t === at, n = counts[i] || 0;
            return (
              <Pressable key={t} accessibilityRole="radio" accessibilityState={{ selected: on, disabled: busy && !on }} accessibilityLabel={tr('Заезд в {v}, можно занять: {n}', { v: clock(t), n })} disabled={busy && !on} onPress={() => { setOpen(false); if (!on) onPick(t); }} style={({ pressed }) => [a.item, i === arrival.steps.length - 1 && a.last, pressed && a.pressed]}>
                <Text style={[a.time, !n && a.none]}>{clock(t)}</Text>
                <Text style={[a.itemNote, !n && a.none]}>{free(n)}{t === asked ? ' · ' + tr('вы просили') : ''}</Text>
                <View style={[a.radio, on && a.radioOn]}>{on && <View style={a.radioDot} />}</View>
              </Pressable>
            );
          })}
        </View>
      </PopSheet>
    </>
  );
}
const a = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: T.control.touch, marginBottom: 8, paddingHorizontal: 12, borderRadius: T.radius.md, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  key: { ...type.label, color: C.muted },
  value: { ...type.label, color: C.ink, fontWeight: '700' },
  note: { ...type.label, flex: 1, color: C.inkSoft },
  chevron: { ...type.subtitle, color: C.muted },
  pressed: { opacity: 0.7 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, borderBottomWidth: 1, borderBottomColor: C.line },
  last: { borderBottomWidth: 0 },
  time: { ...type.body, width: 64, color: C.ink, fontWeight: '600' },
  itemNote: { ...type.label, flex: 1, color: C.inkSoft },
  none: { color: C.muted },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: C.lineStrong, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: C.ink },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.ink },
});
