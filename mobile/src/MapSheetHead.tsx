import React, { useState, type ReactNode } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AiLine } from './AiLine';
import { NowCard } from './NowCard';
import type { NowCard as NowCardModel } from './now-card';
import type { Role } from './model';
import { headLine, type HeadAction } from './head-line';
import { CATEGORIES, KIND_ICONS, categoryKinds, type Category } from './ai-request';
import { C, type } from './styles';
import { T } from './tokens';

const chevron = require('../assets/ui/chevron.png');
// A tile is a third of a narrow sheet: the long names are said shorter there, in full to a screen reader.
const SHORT: Record<string, string> = { guesthouse: 'Гостевой', hotel: 'Отель', aparthotel: 'Апарт' };

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
  choice?: { icon: string; title: string };
  onKind?: (category: Category, kind: string | null) => void;
  children?: ReactNode;
};

// Where a narrow sheet may not break the conditions line: before a " · ", and between a number and its
// word, so neither "гостя" nor "ноября" nor "₸" starts a line alone.
// A word joiner after the dash keeps "13–14 ноября" and "19:00–22:00" whole, as on the site.
const unbroken = (line: string) => line.replace(/ ·/g, '\u00a0·').replace(/(\d) (?=[\d₸а-яё])/gi, '$1\u00a0').replace(/(^|[ \u00a0])до (?=\d)/g, '$1до\u00a0').replace(/–/g, '–\u2060');

// The default state of the bottom sheet: one AI line, a row of chips and the "Сейчас" card when there is one.
export function MapSheetHead({ role, text, onText, onSend, onChip, chips = true, busy = false, summary, onRefine, refining = false, now, onNow, counts, category = 'stay', kind = '', choice, onKind, children }: Props) {
  const line = headLine(role, Date.now(), category);
  // The picker opens on the category that is chosen; a tab only shows another category, a tile chooses.
  const [picking, setPicking] = useState(false), [tab, setTab] = useState<Category>(category);
  const picker = !!onKind && chips && picking, shown = CATEGORIES.find(c => c.id === tab)!;
  const pick = (id: string | null) => { setPicking(false); onKind?.(tab, id); };
  return (
    <View style={s.head}>
      <AiLine value={text} onChangeText={onText} onSend={onSend} busy={busy} placeholder={line.placeholder} shortPlaceholder={line.shortPlaceholder} label={line.label} />
      {/* The chips of every role fit one row of a 360px phone; the row still scrolls for a larger system font. */}
      {picker && <View style={s.picker}>
        <View style={s.tabs} accessibilityRole="tablist" accessibilityLabel="Категория">
          {CATEGORIES.map(c => {
            const on = c.id === tab;
            return (
              <Pressable key={c.id} accessibilityRole="tab" accessibilityLabel={c.hint} accessibilityState={{ selected: on }} onPress={() => setTab(c.id)} style={[s.tab, on && s.tabOn]}>
                <Text style={s.tabIcon}>{c.icon}</Text>
                <Text style={[s.tabText, on && s.tabTextOn]}>{c.title}</Text>
              </Pressable>
            );
          })}
          <Pressable accessibilityRole="button" accessibilityLabel="Закрыть выбор категории" onPress={() => setPicking(false)} style={s.pickerClose}><Text style={s.pickerCloseText}>✕</Text></Pressable>
        </View>
        <View style={s.tiles} accessibilityRole="radiogroup" accessibilityLabel={shown.title + ': тип'}>
          {[['', tab === 'bath' ? 'Любая' : 'Любое'] as [string, string], ...categoryKinds(tab)].map(([id, title]) => {
            const on = tab === category && id === kind;
            return (
              <Pressable key={id || 'any'} accessibilityRole="radio" accessibilityLabel={id ? title : shown.title + ': ' + title.toLowerCase()} accessibilityState={{ checked: on }} disabled={busy} onPress={() => pick(id || null)} style={({ pressed }) => [s.tile, on && s.tileOn, pressed && !on && s.chipPressed]}>
                <Text style={s.tileIcon}>{id ? KIND_ICONS[id] : '✦'}</Text>
                <Text numberOfLines={1} style={[s.tileText, on && s.tileTextOn]}>{SHORT[id] || title}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>}
      {chips && !picker && <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={s.chipsScroll} contentContainerStyle={s.chips}>
        {!!onKind && !!choice && (
          <Pressable accessibilityRole="button" accessibilityLabel={'Категория: ' + choice.title + '. Выбрать'} accessibilityState={{ expanded: false }} disabled={busy} onPress={() => { setTab(category); setPicking(true); }} style={({ pressed }) => [s.chip, s.catChip, pressed && s.chipPressed]}>
            <Text style={s.catIcon}>{choice.icon}</Text>
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
  catIcon: { fontSize: 16, lineHeight: 20 },
  catText: { ...type.label, color: C.accentPressed, fontWeight: '700' },
  catChevron: { width: 14, height: 14, tintColor: C.accentPressed, transform: [{ rotate: '90deg' }] },
  // The picker takes the place of the chips: the categories as tabs, the types of one as tiles of three in a row.
  picker: { gap: 10, padding: 10, borderRadius: T.radius.lg, backgroundColor: C.surfaceAlt },
  tabs: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  tab: { flex: 1, minHeight: 40, borderRadius: T.radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  tabOn: { backgroundColor: C.surface },
  tabIcon: { fontSize: 16, lineHeight: 20 },
  tabText: { ...type.label, color: C.inkSoft, fontWeight: '600' },
  tabTextOn: { color: C.ink, fontWeight: '700' },
  pickerClose: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  pickerCloseText: { ...type.label, color: C.muted },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tile: { flexGrow: 1, flexBasis: '30%', maxWidth: '33%', minHeight: 48, paddingHorizontal: 10, borderRadius: T.radius.md, backgroundColor: C.surface, flexDirection: 'row', alignItems: 'center', gap: 6 },
  tileOn: { backgroundColor: C.accent },
  tileIcon: { fontSize: 18, lineHeight: 22 },
  tileText: { flex: 1, minWidth: 0, ...type.caption, color: C.ink, fontWeight: '600' },
  tileTextOn: { color: C.onAccent },
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
