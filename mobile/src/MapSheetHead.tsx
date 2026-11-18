import React, { useState, type ReactNode } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AiLine } from './AiLine';
import { NowCard } from './NowCard';
import type { NowCard as NowCardModel } from './now-card';
import type { Role } from './model';
import { headLine, type HeadAction } from './head-line';
import { CATEGORIES, categoryKinds, type Category } from './ai-request';
import { KindIcon } from './KindIcon';
import { C, type } from './styles';
import { T } from './tokens';

const chevron = require('../assets/ui/chevron.png');

type Props = {
  role: Role;
  text: string;
  onText: (text: string) => void;
  onSend: (text: string) => void;
  onChip: (action: HeadAction) => void;
  // false: the quick chips give their place to what is under the line (the guest's results).
  chips?: boolean;
  busy?: boolean;
  // Guest only: the conditions the search will use, and the way to the full form.
  summary?: string;
  onRefine?: () => void;
  refining?: boolean;
  now: NowCardModel | null;
  onNow: () => void;
  // A number on a chip: what waits behind it (the owner's «Заявки»: guests' requests and cleaners' responses).
  counts?: Partial<Record<HeadAction, number>>;
  // Guest only: what is looked for. One button in the row of chips opens the categories with their types.
  category?: Category;
  // The one type that is chosen and what the button says; no kind is the whole category.
  kind?: string;
  choice?: { id: string; title: string };
  onKind?: (category: Category, kind: string | null) => void;
  // Guest only: a service that is ordered, not looked for on the map (a cleaning of one's own home).
  onService?: () => void;
  // The picker opened or closed: the sheet makes room for it and returns to where it was.
  onPicker?: (open: boolean) => void;
  children?: ReactNode;
};

// Where a narrow sheet may not break the conditions line: before a " · ", and between a number and its
// word, so neither "гостя" nor "ноября" nor "₸" starts a line alone.
// A word joiner after the dash keeps "13–14 ноября" and "19:00–22:00" whole, as on the site.
const unbroken = (line: string) => line.replace(/ ·/g, '\u00a0·').replace(/(\d) (?=[\d₸а-яё])/gi, '$1\u00a0').replace(/(^|[ \u00a0])до (?=\d)/g, '$1до\u00a0').replace(/–/g, '–\u2060');

// The default state of the bottom sheet: one AI line, a row of chips and the "Сейчас" card when there is one.
export function MapSheetHead({ role, text, onText, onSend, onChip, chips = true, busy = false, summary, onRefine, refining = false, now, onNow, counts, category = 'stay', kind = '', choice, onKind, onService, onPicker, children }: Props) {
  const line = headLine(role, Date.now(), category);
  // The picker takes the place of the chips: a list of the categories, one of them opened; a tap on a type chooses and closes.
  const [picking, setPicking] = useState(false);
  const picker = !!onKind && chips && picking;
  // The category whose types are shown: the chosen one when the list opens, another by a tap on its row.
  const [opened, setOpened] = useState<Category | null>(category);
  const show = (open: boolean) => { if (open) setOpened(category); setPicking(open); onPicker?.(open); };
  const pick = (to: Category, id: string | null) => { show(false); onKind?.(to, id); };
  return (
    <View style={s.head}>
      <AiLine value={text} onChangeText={onText} onSend={onSend} busy={busy} placeholder={line.placeholder} shortPlaceholder={line.shortPlaceholder} label={line.label} />
      {/* The chips of every role fit one row of a 360px phone; the row still scrolls for a larger system font. */}
      {picker && <View style={s.picker}>
        <View style={s.pickerHead}>
          <Text accessibilityRole="header" style={s.pickerTitle}>Что ищете</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Закрыть выбор категории" onPress={() => show(false)} hitSlop={8} style={s.pickerClose}><Text style={s.pickerCloseText}>✕</Text></Pressable>
        </View>
        {/* A list that opens: one row per category, only the opened one shows its types. */}
        {CATEGORIES.map((c, at) => {
          const open = c.id === opened, chosen = c.id === category;
          return (
            <View key={c.id} style={[s.group, at > 0 && s.groupNext]}>
              <Pressable accessibilityRole="button" accessibilityLabel={c.title + ': ' + c.hint} accessibilityState={{ expanded: open }} disabled={busy} onPress={() => setOpened(open ? null : c.id)} style={({ pressed }) => [s.groupHead, pressed && s.groupPressed]}>
                <KindIcon id={c.id} size={18} color={chosen ? C.accent : C.inkSoft} />
                <Text style={[s.groupTitle, chosen && s.groupTitleOn]}>{c.title}</Text>
                <Text numberOfLines={1} style={s.groupHint}>{chosen && !open && choice && choice.title !== c.title ? choice.title : c.hint}</Text>
                <Image source={chevron} style={[s.groupChevron, open && s.groupChevronOpen]} accessibilityIgnoresInvertColors />
              </Pressable>
              {open && <View style={s.kinds} accessibilityRole="radiogroup" accessibilityLabel={c.title}>
                {[['', c.any] as [string, string], ...categoryKinds(c.id)].map(([id, title]) => {
                  const on = chosen && id === kind;
                  return (
                    <Pressable key={id || 'any'} accessibilityRole="radio" accessibilityLabel={title} accessibilityState={{ checked: on }} disabled={busy} onPress={() => pick(c.id, id || null)} style={({ pressed }) => [s.kind, on && s.kindOn, pressed && !on && s.kindPressed]}>
                      <KindIcon id={id || 'any'} size={18} color={on ? C.onAccent : C.inkSoft} />
                      <Text style={[s.kindText, on && s.kindTextOn]}>{title}</Text>
                    </Pressable>
                  );
                })}
              </View>}
            </View>
          );
        })}
        {!!onService && <View style={[s.group, s.groupNext]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Уборка: закажите уборку у себя дома" disabled={busy} onPress={() => { show(false); onService(); }} style={({ pressed }) => [s.groupHead, pressed && s.groupPressed]}>
            <KindIcon id="cleaning" size={18} color={C.inkSoft} />
            <Text style={s.groupTitle}>Уборка</Text>
            <Text numberOfLines={1} style={s.groupHint}>У вас дома</Text>
            <Image source={chevron} style={s.groupChevron} accessibilityIgnoresInvertColors />
          </Pressable>
        </View>}
      </View>}
      {chips && !picker && <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={s.chipsScroll} contentContainerStyle={s.chips}>
        {!!onKind && !!choice && (
          <Pressable accessibilityRole="button" accessibilityLabel={'Категория: ' + choice.title + '. Выбрать'} accessibilityState={{ expanded: false }} disabled={busy} onPress={() => show(true)} style={({ pressed }) => [s.chip, s.catChip, pressed && s.chipPressed]}>
            <KindIcon id={choice.id} size={18} color={C.accentPressed} />
            <Text style={s.catText}>{choice.title}</Text>
            <Image source={chevron} style={s.catChevron} accessibilityIgnoresInvertColors />
          </Pressable>
        )}
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
      </ScrollView>}
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
  // The category button: the first chip of the row, in the soft accent, with what is chosen.
  catChip: { backgroundColor: C.accentSoft, paddingLeft: 12, paddingRight: 10 },
  catText: { ...type.label, color: C.accentPressed, fontWeight: '700' },
  catChevron: { width: 14, height: 14, tintColor: C.accentPressed, transform: [{ rotate: '90deg' }] },
  // The picker: a title, then each category as a named group of outlined chips, a hairline between the groups.
  picker: { gap: 4 },
  pickerHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pickerTitle: { ...type.label, color: C.ink, fontWeight: '700' },
  pickerClose: { width: 32, height: 32, borderRadius: T.radius.full, backgroundColor: C.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  pickerCloseText: { ...type.caption, color: C.inkSoft },
  group: {},
  groupNext: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line },
  groupHead: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  groupPressed: { opacity: 0.6 },
  groupTitle: { ...type.label, color: C.ink, fontWeight: '600' },
  groupTitleOn: { color: C.accent },
  groupChevron: { width: 14, height: 14, tintColor: C.muted, transform: [{ rotate: '90deg' }] },
  groupChevronOpen: { transform: [{ rotate: '-90deg' }] },
  groupHint: { flex: 1, minWidth: 0, ...type.caption, color: C.muted },
  kinds: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 12 },
  kind: { minHeight: 40, paddingLeft: 10, paddingRight: 14, borderRadius: T.radius.full, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, flexDirection: 'row', alignItems: 'center', gap: 6 },
  kindOn: { borderColor: C.accent, backgroundColor: C.accent },
  kindPressed: { backgroundColor: C.surfaceAlt },
  kindText: { ...type.label, color: C.ink, fontWeight: '500' },
  kindTextOn: { color: C.onAccent, fontWeight: '600' },
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
