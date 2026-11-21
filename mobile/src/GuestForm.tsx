import {t} from '../../lib/i18n';
import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Action, Chips, Stepper, h } from './SheetParts';
import { C, type } from './styles';
import { T } from './tokens';
import { mapCities } from './map-math';
import { OCCASIONS, allKinds, maxGuestsOf, wishesOf, draftSlot, withSlot, categoryKinds, categoryOf, dayChoices, draftUnits, withDay, withMode, withTime, withUnits, type GuestDraft } from './ai-request';
import { SECTION_TITLES, sectionWords, type Section } from './guest-tokens';
import { BANQUET_SLOTS, addDays, kzToday, type BanquetSlot } from '../../lib/map-search-request';

const chevron = require('../assets/ui/chevron.png');

type Props = {
  draft: GuestDraft;
  // One part of the form (a token was tapped), or every condition as a list of rows.
  only?: Section | 'all';
  onChange: (next: GuestDraft) => void;
  // Opens the point picker on the map; the point comes back through onChange.
  onPickPoint: () => void;
  // Shown when the phone knows where the guest is and it is in the searched city.
  onNearMe?: () => void;
  onSubmit: () => void;
  busy: boolean;
};

const two = (value: number) => String(value).padStart(2, '0');
const clock = (minutes: number) => two(Math.floor(minutes / 60)) + ':' + two(minutes % 60);

// The structured request for those who prefer fields to free text. The AI line fills the same conditions,
// so what was typed there is already chosen here.
export function GuestForm({ draft, only = 'all', onChange, onPickPoint, onNearMe, onSubmit, busy }: Props) {
  const hourly = draft.mode === 'hourly';
  const startMinutes = Number(draft.start.slice(11, 13)) * 60 + Number(draft.start.slice(14, 16));
  const units = draftUnits(draft);
  const category = categoryOf(draft), bath = category === 'bath', hall = category === 'banquet', venue = category !== 'stay';
  // «Баня» never loses its last type: an empty list would mean «Жильё».
  const toggleKind = (id: string) => {
    const kinds = draft.kinds.includes(id) ? draft.kinds.filter(v => v !== id) : [...draft.kinds, id];
    onChange({ ...draft, kinds: venue && !kinds.length ? allKinds(category) : kinds });
  };
  // Rooms: any, exactly 1 or 2, 3 and more; a count the text named that is not here stays as an option.
  const roomOptions: [string, string][] = [['', t('Любое')], ['1', '1'], ['2', '2'], ['3+', '3+']];
  if (draft.rooms && !roomOptions.some(([id]) => id === draft.rooms)) roomOptions.push([draft.rooms, draft.rooms.endsWith('+') ? t('от {v}', { v: draft.rooms.slice(0, -1) }) : draft.rooms]);
  // The budget is a price per day (per hour on the hourly tariff); a total named in the line keeps its own label.
  // A hall: any day up to three months ahead, by the chips or one day at a time.
  const today = kzToday(), day = draft.start.slice(0, 10), ahead = Math.round((Date.parse(day) - Date.parse(today)) / 86400000);
  const dayText = (date: string) => { const d = new Date(date + 'T00:00:00Z'); return [t('вс'), t('пн'), t('вт'), t('ср'), t('чт'), t('пт'), t('сб')][d.getUTCDay()] + ', ' + d.getUTCDate() + ' ' + [t('янв'), t('фев'), t('мар'), t('апр'), t('мая'), t('июн'), t('июл'), t('авг'), t('сен'), t('окт'), t('ноя'), t('дек')][d.getUTCMonth()]; };
  const budgetLabel = hall ? (draft.perUnit || !draft.maxPrice ? t('Цена на гостя до, ₸') : t('Бюджет на всё, ₸')) : draft.perUnit || !draft.maxPrice ? (hourly ? t('Цена за час до, ₸') : draft.mode === 'night' ? t('Цена за ночь до, ₸') : t('Цена за сутки до, ₸')) : t('Бюджет на весь срок, ₸');
  const [open, setOpen] = useState<Section | ''>('');
  const toggleWish = (id: string) =>
    onChange({ ...draft, features: draft.features.includes(id) ? draft.features.filter(v => v !== id) : [...draft.features, id] });

  const parts: Record<Section, React.ReactNode> = {
    when: <>{hall && <Chips label={t('Повод')} value={draft.occasion || ''} options={OCCASIONS} onChange={occasion => onChange({ ...draft, occasion })} disabled={busy} />}{!venue && (
        <Chips
          name="Срок аренды"
          value={draft.mode}
          options={[
            ['daily', t('На сутки')],
            ['night', t('На ночь')],
            ['hourly', t('На часы')]
          ]}
          onChange={mode => onChange(withMode(draft, mode))}
          disabled={busy}
        />
      )}<Chips label={t('Когда')} value={draft.start.slice(0, 10)} options={dayChoices(draft)} onChange={day => onChange(withDay(draft, day))} disabled={busy} />{hall && (
        <View style={h.pair}><Stepper label={t('День')} value={ahead} text={dayText(day)} min={0} max={89} onChange={n => onChange(withDay(draft, addDays(today, n)))} disabled={busy} /><View style={h.stepper}><Chips label={t('Время')} value={draftSlot(draft)} options={(Object.keys(BANQUET_SLOTS) as BanquetSlot[]).map(id => [id, BANQUET_SLOTS[id].title + ' ' + BANQUET_SLOTS[id].from.slice(0, 2) + '–' + (BANQUET_SLOTS[id].to.slice(0, 2) === '00' ? '24' : BANQUET_SLOTS[id].to.slice(0, 2))])} onChange={slot => onChange(withSlot(draft, day, slot as BanquetSlot))} disabled={busy} /></View></View>
      )}{!hall && <View style={h.pair}><Stepper
          label={hourly ? t('Начало') : t('Заезд')}
          value={startMinutes}
          text={clock(startMinutes)}
          min={0}
          max={1410}
          step={30}
          onChange={minutes => onChange(withTime(draft, clock(minutes)))}
          disabled={busy}
        /><Stepper
          label={hourly ? t('Часов') : draft.mode === 'night' ? t('Ночей') : t('Суток')}
          value={units}
          text={String(units)}
          min={1}
          max={hourly ? 23 : 30}
          onChange={value => onChange(withUnits(draft, value))}
          disabled={busy}
        /></View>}</>,
    guests: <><Stepper
          label={t('Гостей')}
          value={draft.guests}
          text={String(draft.guests)}
          min={1}
          max={maxGuestsOf(category)}
          step={hall ? 10 : 1}
          onChange={guests => onChange({ ...draft, guests })}
          disabled={busy}
        /></>,
    price: <><View><Text style={h.label}>{budgetLabel}</Text><TextInput
            accessibilityLabel={budgetLabel.replace(', ₸', ' в тенге')}
            style={h.input}
            keyboardType="number-pad"
            maxLength={9}
            placeholder={t('Любой')}
            placeholderTextColor={C.muted}
            value={draft.maxPrice}
            onChangeText={text => onChange({ ...draft, maxPrice: text.replace(/[^\d]/g, ''), perUnit: text ? draft.perUnit : true })}
            editable={!busy}
          /></View></>,
    where: <><Chips
        label={t('Город')}
        value={draft.city}
        options={Object.keys(mapCities).map(city => [city, city])}
        onChange={city => onChange(city === draft.city ? draft : { ...draft, city, district: '', near: null })}
        disabled={busy}
      /><View><Text style={h.label}>{t('Район')}</Text><TextInput
          accessibilityLabel={t('Район')}
          style={h.input}
          placeholder={t('Любой')}
          placeholderTextColor={C.muted}
          maxLength={120}
          value={draft.district}
          onChangeText={district => onChange({ ...draft, district })}
          editable={!busy}
        /></View><View style={h.row}><Text style={[h.note, h.grow]}>{draft.near ? t('Ищем в 5 км от выбранной точки.') : t('Ищем по всему городу.')}</Text><Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => {
            if (draft.near) onChange({ ...draft, near: null, priority: draft.priority === 'closer' ? 'balanced' : draft.priority });
            else onPickPoint();
          }}
          style={({ pressed }) => [f.link, (pressed || busy) && h.dim]}
        ><Text style={f.linkText}>{draft.near ? t('Убрать точку') : t('Указать точку на карте')}</Text></Pressable></View>{!draft.near && !!onNearMe && (
        <Pressable accessibilityRole="button" disabled={busy} onPress={onNearMe} style={({ pressed }) => [f.link, { alignSelf: 'flex-end' }, (pressed || busy) && h.dim]}><Text style={f.linkText}>{t('Рядом со мной')}</Text></Pressable>
      )}</>,
    home: <><View><Text style={h.label}>{hall ? t('Зал или кафе') : bath ? t('Баня или сауна') : t('Тип жилья')}</Text><View style={f.wishes}>{categoryKinds(category).map(([id, title]) => {
            const on = draft.kinds.includes(id);
            return (
              <Pressable
                key={id}
                accessibilityRole="checkbox"
                accessibilityLabel={title}
                accessibilityState={{ checked: on, disabled: busy }}
                disabled={busy}
                onPress={() => toggleKind(id)}
                style={[h.chip, on && h.chipOn]}
              ><Text style={[h.chipText, on && h.chipTextOn]}>{title}</Text></Pressable>
            );
          })}</View></View>{!venue && <Chips label={t('Комнат')} value={draft.rooms} options={roomOptions} onChange={rooms => onChange({ ...draft, rooms })} disabled={busy} />}</>,
    wishes: <><View><Text style={h.label}>{venue ? t('Обязательно') : t('Обязательно в жилье')}</Text><View style={f.wishes}>{wishesOf(category).map(([id, title]) => {
            const on = draft.features.includes(id);
            return (
              <Pressable
                key={id}
                accessibilityRole="checkbox"
                accessibilityLabel={title}
                accessibilityState={{ checked: on, disabled: busy }}
                disabled={busy}
                onPress={() => toggleWish(id)}
                style={[h.chip, on && h.chipOn]}
              ><Text style={[h.chipText, on && h.chipTextOn]}>{title}</Text></Pressable>
            );
          })}</View></View></>,
    priority: <><Chips
        label={t('Что важнее')}
        value={draft.priority}
        options={[
          ['balanced', t('Баланс')],
          ['cheaper', t('Дешевле')],
          ['closer', t('Ближе')]
        ]}
        onChange={priority => onChange({ ...draft, priority })}
        disabled={busy}
      /></>
  };
  const foot = <><Text style={h.note}>{hall ? t('Цена зала считается на гостя. При отмене вся оплата возвращается.') : (hourly ? t('Депозит оплачивается отдельно.') : t('Выезд до 12:00. Депозит оплачивается отдельно.'))}</Text><Action title={busy ? t('Ищем…') : t('Показать варианты')} disabled={busy} onPress={onSubmit} /></>;
  // One token was tapped: only its part of the form, with the way to the rest.
  if (only !== 'all') return (
    <><View style={f.part}>{parts[only]}</View>{foot}</>
  );
  // Every condition as a row with what it holds; one row is open at a time.
  return (
    <><View>{SECTION_TITLES(draft).map(([id, title], at) => {
          const on = open === id;
          return (
            <View key={id} style={at > 0 && f.rowNext}><Pressable accessibilityRole="button" accessibilityLabel={title + ': ' + sectionWords(draft, id)} accessibilityState={{ expanded: on, disabled: busy }} disabled={busy} onPress={() => setOpen(on ? '' : id)} style={({ pressed }) => [f.row, pressed && h.dim]}><Text style={[f.rowTitle, on && f.rowTitleOn]}>{title}</Text><Text numberOfLines={1} style={f.rowValue}>{sectionWords(draft, id)}</Text><Image source={chevron} style={[f.chevron, on && f.chevronOpen]} accessibilityIgnoresInvertColors /></Pressable>{on && <View style={[f.part, f.partOpen]}>{parts[id]}</View>}</View>
          );
        })}</View>{foot}</>
  );
}

const f = StyleSheet.create({
  wishes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  link: { minHeight: T.control.touch, justifyContent: 'center', paddingLeft: 8 },
  part: { gap: 12 },
  partOpen: { paddingBottom: 16 },
  row: { minHeight: T.control.field, flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowNext: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line },
  rowTitle: { ...type.body, color: C.ink, fontWeight: '500' },
  rowTitleOn: { color: C.accent, fontWeight: '600' },
  rowValue: { flex: 1, minWidth: 0, textAlign: 'right', ...type.label, color: C.muted },
  chevron: { width: 14, height: 14, tintColor: C.muted, transform: [{ rotate: '90deg' }] },
  chevronOpen: { transform: [{ rotate: '-90deg' }] },
  linkText: { ...type.label, color: C.accent, fontWeight: '600' }
});
