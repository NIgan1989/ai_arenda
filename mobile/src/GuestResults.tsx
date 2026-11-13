import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { plural } from '../../lib/map-search-request';
import { Photo } from './ListingMedia';
import { Action, h } from './SheetParts';
import { money, type Row } from './model';
import { windowBadge } from '../../lib/window-badge';
import { C, type } from './styles';
import { T } from './tokens';
import { draftUnits, shownReasons, type GuestDraft } from './ai-request';

const chevron = require('../assets/ui/chevron.png');

type Props = {
  // The answer of /api/public/matching: flats that are free on these conditions, best first.
  preview: Row;
  // The conditions that were searched; the price of every flat is for this stay.
  draft: GuestDraft;
  selected: string;
  onSelect: (id: string) => void;
  onBook: (property: Row) => void;
  onOpen: (property: Row) => void;
  onRefine: () => void;
  // Present when the search was narrowed by a district, a budget or wishes: looks again without them.
  onWiden?: () => void;
  // Present only when some owner of these flats answers quick requests.
  onAskOwners?: () => void;
  // Where «Забронировать» of the chosen flat ends, from the top of the sheet's content: the sheet opens that far.
  onBookEdge?: (bottom: number) => void;
  busy: boolean;
};

const PAGE = 5;

function stayWords(draft: GuestDraft) {
  const units = draftUnits(draft);
  return draft.mode === 'hourly' ? units + ' ' + plural(units, 'час', 'часа', 'часов') : units + ' ' + plural(units, 'сутки', 'суток', 'суток');
}

// What the guest sees after a search: a short list, then one flat with a way to book it and a way back.
export function GuestResults({ preview, draft, selected, onSelect, onBook, onOpen, onRefine, onWiden, onAskOwners, onBookEdge, busy }: Props) {
  const [shown, setShown] = useState(PAGE);
  const flats: Row[] = preview.properties || [];
  const chosen = flats.find(flat => flat.id === selected);
  const about = (flat: Row) => [flat.district, ...shownReasons(flat.match?.reasons, draft)].filter(Boolean).join(' · ');

  if (!flats.length) {
    return (
      <>
        <Text accessibilityRole="header" style={h.cardTitle}>
          На эти условия свободных квартир нет
        </Text>
        <Text style={h.note}>{onWiden ? 'Поиск сужают район, бюджет или пожелания. Можно искать без них.' : 'Попробуйте другое время или другой срок.'}</Text>
        {!!onWiden && <Action title={busy ? 'Ищем…' : 'Искать без этих условий'} disabled={busy} onPress={onWiden} />}
        <Action secondary title="Изменить условия" disabled={busy} onPress={onRefine} />
      </>
    );
  }

  if (chosen) {
    // The name, the price and the way to book come first, so they are on screen in the half-open sheet;
    // the photo and the rest are below.
    return (
      <>
        <Pressable accessibilityRole="button" accessibilityLabel="Все варианты" onPress={() => onSelect('')} style={({ pressed }) => [r.back, pressed && h.dim]}>
          <Image source={chevron} style={r.backIcon} accessibilityIgnoresInvertColors />
          <Text style={r.backText}>Все варианты · {flats.length}</Text>
        </Pressable>
        <View style={r.chosen}>
          <View style={h.grow}>
            {!!chosen.match?.best && <Text style={r.best}>Лучший выбор для вас</Text>}
            <Text accessibilityRole="header" numberOfLines={2} style={h.cardTitle}>
              {chosen.title}
            </Text>
            {!!about(chosen) && (
              <Text style={h.note}>
                {about(chosen)}
              </Text>
            )}
          </View>
          <View style={r.amount}>
            <Text style={h.price}>{money(chosen.estimate.amount)}</Text>
            <Text style={h.note}>за {stayWords(draft)}</Text>
            {!!windowBadge(chosen.estimate.window) && <Text style={r.window}>{windowBadge(chosen.estimate.window)}</Text>}
          </View>
        </View>
        <View onLayout={e => onBookEdge?.(Math.round(e.nativeEvent.layout.y + e.nativeEvent.layout.height))}>
          <Action title="Забронировать" disabled={busy} onPress={() => onBook(chosen)} />
        </View>
        {!!chosen.photos?.[0] && <Photo id={chosen.photos[0]} alt={chosen.title + ', фото'} />}
        <Action secondary title="Подробнее о квартире" disabled={busy} onPress={() => onOpen(chosen)} />
        <Text style={h.note}>Перед отправкой заявки вы увидите даты, сумму и правила. Деньги в приложении не списываются.</Text>
      </>
    );
  }

  return (
    <>
      <Text accessibilityRole="header" style={h.cardTitle}>
        Свободно на {stayWords(draft)}: {flats.length}
      </Text>
      <View>
        {flats.slice(0, shown).map(flat => (
          <Pressable
            key={flat.id}
            accessibilityRole="button"
            accessibilityLabel={flat.title + ', ' + money(flat.estimate.amount)}
            onPress={() => onSelect(flat.id)}
            style={({ pressed }) => [r.row, pressed && r.rowPressed]}
          >
            <View style={h.grow}>
              {!!flat.match?.best && <Text style={r.best}>Лучший выбор для вас</Text>}
              <Text numberOfLines={2} style={h.eventTitle}>
                {flat.title}
              </Text>
              {!!about(flat) && (
                <Text numberOfLines={2} style={h.note}>
                  {about(flat)}
                </Text>
              )}
            </View>
            <View style={r.amount}>
              <Text style={h.rowPrice}>{money(flat.estimate.amount)}</Text>
              {!!flat.estimate.window && <Text style={r.window}>−{flat.estimate.window.percent}%</Text>}
            </View>
            <Image source={chevron} style={r.rowIcon} accessibilityIgnoresInvertColors />
          </Pressable>
        ))}
      </View>
      {flats.length > shown && <Action secondary title={'Показать ещё ' + Math.min(PAGE, flats.length - shown)} onPress={() => setShown(shown + PAGE)} />}
      {!!onAskOwners && (
        <>
          <Text style={h.note}>
            Можно спросить владельцев, свободна ли квартира прямо сейчас. Они получат даты, число гостей и сумму. Имя, телефон и точка поиска не передаются.
          </Text>
          <Action secondary title={busy ? 'Отправляем…' : 'Спросить владельцев'} disabled={busy} onPress={onAskOwners} />
        </>
      )}
    </>
  );
}

const r = StyleSheet.create({
  row: {
    minHeight: T.control.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.line
  },
  rowPressed: { backgroundColor: C.bg },
  rowIcon: { width: 16, height: 16, tintColor: C.muted },
  back: { minHeight: T.control.touch, flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingRight: 12 },
  backIcon: { width: 16, height: 16, tintColor: C.accent, transform: [{ rotate: '180deg' }] },
  backText: { ...type.label, color: C.accent, fontWeight: '600' },
  chosen: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  amount: { alignItems: 'flex-end' },
  best: { ...type.caption, alignSelf: 'flex-start', marginBottom: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: T.radius.full, overflow: 'hidden', backgroundColor: C.accentSoft, color: C.accent, fontWeight: '600' },
  window: { ...type.caption, marginTop: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: T.radius.full, overflow: 'hidden', backgroundColor: C.accentSoft, color: C.accent, fontWeight: '600' }
});
