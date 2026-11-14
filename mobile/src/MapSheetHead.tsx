import React, { type ReactNode } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AiLine } from './AiLine';
import { NowCard } from './NowCard';
import type { NowCard as NowCardModel } from './now-card';
import type { Role } from './model';
import { headLine, type HeadAction } from './head-line';
import { C, type } from './styles';
import { T } from './tokens';

const chevron = require('../assets/ui/chevron.png');

type Props = {
  role: Role;
  text: string;
  onText: (text: string) => void;
  onSend: (text: string) => void;
  onChip: (action: HeadAction) => void;
  busy?: boolean;
  // Guest only: the conditions the search will use, and the way to the full form.
  summary?: string;
  onRefine?: () => void;
  refining?: boolean;
  now: NowCardModel | null;
  onNow: () => void;
  // A number on a chip: what waits behind it (the owner's «Заявки»: guests' requests and cleaners' responses).
  counts?: Partial<Record<HeadAction, number>>;
  children?: ReactNode;
};

// Where a narrow sheet may not break the conditions line: before a " · ", and between a number and its
// word, so neither "гостя" nor "ноября" nor "₸" starts a line alone.
// A word joiner after the dash keeps "13–14 ноября" and "19:00–22:00" whole, as on the site.
const unbroken = (line: string) => line.replace(/ ·/g, '\u00a0·').replace(/(\d) (?=[\d₸а-яё])/gi, '$1\u00a0').replace(/(^|[ \u00a0])до (?=\d)/g, '$1до\u00a0').replace(/–/g, '–\u2060');

// The default state of the bottom sheet: one AI line, a row of chips and the "Сейчас" card when there is one.
export function MapSheetHead({ role, text, onText, onSend, onChip, busy = false, summary, onRefine, refining = false, now, onNow, counts, children }: Props) {
  const line = headLine(role);
  return (
    <View style={s.head}>
      <AiLine value={text} onChangeText={onText} onSend={onSend} busy={busy} placeholder={line.placeholder} shortPlaceholder={line.shortPlaceholder} label={line.label} />
      {/* The chips of every role fit one row of a 360px phone; the row still scrolls for a larger system font. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={s.chipsScroll} contentContainerStyle={s.chips}>
        {line.chips.map(chip => (
          <Pressable
            key={chip.id}
            accessibilityRole="button"
            accessibilityLabel={chip.hint + (counts?.[chip.action] ? ', ждут ответа: ' + counts[chip.action] : '')}
            disabled={busy}
            onPress={() => onChip(chip.action)}
            style={({ pressed }) => [s.chip, !!counts?.[chip.action] && s.chipActive, pressed && s.chipPressed]}
          >
            <Text style={[s.chipText, !!counts?.[chip.action] && s.chipTextActive]}>{chip.title}</Text>
            {!!counts?.[chip.action] && <Text style={s.chipCount}>{counts[chip.action]}</Text>}
          </Pressable>
        ))}
      </ScrollView>
      {!!summary && !!onRefine && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={'Условия поиска: ' + summary + '. ' + (refining ? 'Свернуть' : 'Уточнить')}
          accessibilityState={{ expanded: refining }}
          onPress={onRefine}
          style={({ pressed }) => [s.refine, pressed && s.refinePressed]}
        >
          {/* Every condition that is applied is shown: the line wraps instead of being cut. */}
          <Text style={s.summary}>{unbroken(summary)}</Text>
          <Text style={s.refineText}>{refining ? 'Свернуть' : 'Уточнить'}</Text>
          <Image source={chevron} style={[s.chevron, refining && s.chevronOpen]} accessibilityIgnoresInvertColors />
        </Pressable>
      )}
      {children}
      {now && <NowCard card={now} onOpen={onNow} />}
    </View>
  );
}

const s = StyleSheet.create({
  head: { gap: 12 },
  // The row scrolls to the screen edge, past the sheet padding.
  chipsScroll: { marginHorizontal: -16, flexGrow: 0 },
  chips: { gap: 8, paddingHorizontal: 16 },
  chip: {
    minHeight: T.control.touch,
    paddingHorizontal: 16,
    borderRadius: T.radius.full,
    backgroundColor: C.surfaceAlt,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    justifyContent: 'center'
  },
  chipPressed: { backgroundColor: C.line },
  chipActive: { backgroundColor: C.accentSoft },
  chipTextActive: { color: C.accentPressed, fontWeight: '600' },
  chipCount: { ...type.caption, fontWeight: '700', color: C.onAccent, backgroundColor: C.accent, minWidth: 20, paddingHorizontal: 6, borderRadius: 999, overflow: 'hidden', textAlign: 'center' },
  chipText: { ...type.label, color: C.ink, fontWeight: '500' },
  // One row: what the search will use on the left, the way to the full form on the right.
  refine: { minHeight: T.control.touch, flexDirection: 'row', alignItems: 'center', gap: 4 },
  refinePressed: { opacity: 0.6 },
  summary: { flex: 1, minWidth: 0, marginRight: 8, ...type.label, color: C.inkSoft },
  refineText: { ...type.label, color: C.accent, fontWeight: '600' },
  chevron: { width: 16, height: 16, tintColor: C.accent, transform: [{ rotate: '90deg' }] },
  chevronOpen: { transform: [{ rotate: '-90deg' }] }
});
