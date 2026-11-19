import React, { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { C, type } from './styles';
import { T } from './tokens';
import { clock, type Arrival } from './arrival';

// The arrival under the map: half-hour steps round the asked time, each with how many homes can be taken then.
// Moving along it changes only the words of the pins whose answer changed; the pins stay where they are.
const CHIP = 64,
  GAP = 8;
export function ArrivalStrip({ arrival, at, counts, asked, onPick, busy }: { arrival: Arrival; at: number; counts: number[]; asked: number; onPick: (at: number) => void; busy?: boolean }) {
  const strip = useRef<ScrollView>(null),
    width = useRef(0);
  const index = Math.max(0, arrival.steps.indexOf(at));
  // The chosen time stays in the middle of the strip.
  useEffect(() => {
    const x = index * (CHIP + GAP) - (width.current - CHIP) / 2;
    strip.current?.scrollTo({ x: Math.max(0, x), animated: true });
  }, [index]);
  return (
    <View style={a.wrap}>
      <Text style={a.title}>Заезд</Text>
      <ScrollView
        ref={strip}
        horizontal
        showsHorizontalScrollIndicator={false}
        onLayout={e => {
          width.current = e.nativeEvent.layout.width;
          strip.current?.scrollTo({ x: Math.max(0, index * (CHIP + GAP) - (width.current - CHIP) / 2), animated: false });
        }}
        contentContainerStyle={a.row}
        style={a.strip}
      >
        {arrival.steps.map((t, i) => {
          const on = t === at,
            n = counts[i] || 0;
          return (
            <Pressable
              key={t}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={'Заезд в ' + clock(t) + ', можно занять: ' + n}
              disabled={busy && !on}
              onPress={() => !on && onPick(t)}
              style={({ pressed }) => [a.chip, on && a.chipOn, !n && !on && a.chipNone, pressed && a.pressed]}
            >
              <Text style={[a.time, on && a.timeOn]}>{clock(t)}</Text>
              <Text style={[a.count, on && a.countOn]}>{n ? n : '—'}</Text>
              {t === asked && !on && <View style={a.asked} />}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
const a = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, marginBottom: 8 },
  title: { ...type.caption, color: C.muted, fontWeight: '600' },
  strip: { flexGrow: 1 },
  row: { gap: GAP, paddingRight: 8 },
  chip: { width: CHIP, minHeight: T.control.touch, borderRadius: T.radius.md, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', paddingVertical: 4 },
  chipOn: { backgroundColor: C.accent, borderColor: C.accent },
  chipNone: { opacity: 0.55 },
  pressed: { opacity: 0.7 },
  time: { ...type.label, color: C.ink, fontWeight: '600' },
  timeOn: { color: C.onAccent },
  count: { ...type.caption, color: C.muted },
  countOn: { color: C.onAccent },
  asked: { position: 'absolute', bottom: 3, width: 4, height: 4, borderRadius: 2, backgroundColor: C.accent },
});
