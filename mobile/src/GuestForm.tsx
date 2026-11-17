import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Action, Chips, Stepper, h } from './SheetParts';
import { C, type } from './styles';
import { T } from './tokens';
import { mapCities } from './map-math';
import { HOME_KINDS, MAX_GUESTS, WISHES, dayChoices, draftUnits, withDay, withMode, withTime, withUnits, type GuestDraft } from './ai-request';

type Props = {
  draft: GuestDraft;
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
export function GuestForm({ draft, onChange, onPickPoint, onNearMe, onSubmit, busy }: Props) {
  const hourly = draft.mode === 'hourly';
  const startMinutes = Number(draft.start.slice(11, 13)) * 60 + Number(draft.start.slice(14, 16));
  const units = draftUnits(draft);
  // Home type, rooms, district, wishes, priority and the point on the map: how many of them are set.
  const set = draft.kinds.length + Number(!!draft.rooms) + Number(!!draft.district) + draft.features.length + Number(draft.priority !== 'balanced') + Number(!!draft.near);
  const toggleKind = (id: string) => onChange({ ...draft, kinds: draft.kinds.includes(id) ? draft.kinds.filter(v => v !== id) : [...draft.kinds, id] });
  // Rooms: any, exactly 1 or 2, 3 and more; a count the text named that is not here stays as an option.
  const roomOptions: [string, string][] = [['', 'Любое'], ['1', '1'], ['2', '2'], ['3+', '3+']];
  if (draft.rooms && !roomOptions.some(([id]) => id === draft.rooms)) roomOptions.push([draft.rooms, draft.rooms.endsWith('+') ? 'от ' + draft.rooms.slice(0, -1) : draft.rooms]);
  // The budget is a price per day (per hour on the hourly tariff); a total named in the line keeps its own label.
  const budgetLabel = draft.perUnit || !draft.maxPrice ? (hourly ? 'Цена за час до, ₸' : 'Цена за сутки до, ₸') : 'Бюджет на весь срок, ₸';
  const [more, setMore] = useState(set > 0), extra = more;
  const toggleWish = (id: string) =>
    onChange({ ...draft, features: draft.features.includes(id) ? draft.features.filter(v => v !== id) : [...draft.features, id] });

  return (
    <>
      <Chips
        name="Срок аренды"
        value={draft.mode}
        options={[
          ['daily', 'На сутки'],
          ['hourly', 'На часы']
        ]}
        onChange={mode => onChange(withMode(draft, mode))}
        disabled={busy}
      />
      <Chips
        label="Город"
        value={draft.city}
        options={Object.keys(mapCities).map(city => [city, city])}
        onChange={city => onChange(city === draft.city ? draft : { ...draft, city, district: '', near: null })}
        disabled={busy}
      />
      <Chips label="Когда" value={draft.start.slice(0, 10)} options={dayChoices(draft)} onChange={day => onChange(withDay(draft, day))} disabled={busy} />
      <View style={h.pair}>
        <Stepper
          label={hourly ? 'Начало' : 'Заезд'}
          value={startMinutes}
          text={clock(startMinutes)}
          min={0}
          max={1410}
          step={30}
          onChange={minutes => onChange(withTime(draft, clock(minutes)))}
          disabled={busy}
        />
        <Stepper
          label={hourly ? 'Часов' : 'Суток'}
          value={units}
          text={String(units)}
          min={1}
          max={hourly ? 23 : 30}
          onChange={value => onChange(withUnits(draft, value))}
          disabled={busy}
        />
      </View>
      <View style={h.pair}>
        <Stepper
          label="Гостей"
          value={draft.guests}
          text={String(draft.guests)}
          min={1}
          max={MAX_GUESTS}
          onChange={guests => onChange({ ...draft, guests })}
          disabled={busy}
        />
        <View style={h.stepper}>
          <Text style={h.label}>{budgetLabel}</Text>
          <TextInput
            accessibilityLabel={budgetLabel.replace(', ₸', ' в тенге')}
            style={h.input}
            keyboardType="number-pad"
            maxLength={9}
            placeholder="Любой"
            placeholderTextColor={C.muted}
            value={draft.maxPrice}
            onChangeText={text => onChange({ ...draft, maxPrice: text.replace(/[^\d]/g, ''), perUnit: text ? draft.perUnit : true })}
            editable={!busy}
          />
        </View>
      </View>
      {/* The rest narrows the search and is rarely needed: one row opens it, and it is open when something is set there. */}
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: extra }} disabled={busy} onPress={() => setMore(v => !v)} style={({ pressed }) => [f.more, pressed && h.dim]}>
        <Text style={f.linkText}>{extra ? 'Свернуть условия' : 'Ещё условия' + (set ? ' · ' + set : '')}</Text>
      </Pressable>
      {extra && <>
      <View>
        <Text style={h.label}>Тип жилья</Text>
        <View style={f.wishes}>
          {Object.entries(HOME_KINDS).map(([id, title]) => {
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
              >
                <Text style={[h.chipText, on && h.chipTextOn]}>{title}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <Chips label="Комнат" value={draft.rooms} options={roomOptions} onChange={rooms => onChange({ ...draft, rooms })} disabled={busy} />
      <View>
        <Text style={h.label}>Район</Text>
        <TextInput
          accessibilityLabel="Район"
          style={h.input}
          placeholder="Любой"
          placeholderTextColor={C.muted}
          maxLength={120}
          value={draft.district}
          onChangeText={district => onChange({ ...draft, district })}
          editable={!busy}
        />
      </View>
      <View>
        <Text style={h.label}>Обязательно в жилье</Text>
        <View style={f.wishes}>
          {WISHES.map(([id, title]) => {
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
              >
                <Text style={[h.chipText, on && h.chipTextOn]}>{title}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <Chips
        label="Что важнее"
        value={draft.priority}
        options={[
          ['balanced', 'Баланс'],
          ['cheaper', 'Дешевле'],
          ['closer', 'Ближе']
        ]}
        onChange={priority => onChange({ ...draft, priority })}
        disabled={busy}
      />
      <View style={h.row}>
        <Text style={[h.note, h.grow]}>{draft.near ? 'Ищем в 5 км от выбранной точки.' : 'Ищем по всему городу.'}</Text>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => {
            if (draft.near) onChange({ ...draft, near: null, priority: draft.priority === 'closer' ? 'balanced' : draft.priority });
            else onPickPoint();
          }}
          style={({ pressed }) => [f.link, (pressed || busy) && h.dim]}
        >
          <Text style={f.linkText}>{draft.near ? 'Убрать точку' : 'Указать точку на карте'}</Text>
        </Pressable>
      </View>
      {!draft.near && !!onNearMe && (
        <Pressable accessibilityRole="button" disabled={busy} onPress={onNearMe} style={({ pressed }) => [f.link, { alignSelf: 'flex-end' }, (pressed || busy) && h.dim]}>
          <Text style={f.linkText}>Рядом со мной</Text>
        </Pressable>
      )}
      </>}
      <Text style={h.note}>{hourly ? '' : 'Выезд до 12:00. '}Депозит оплачивается отдельно.</Text>
      <Action title={busy ? 'Ищем…' : 'Показать варианты'} disabled={busy} onPress={onSubmit} />
    </>
  );
}

const f = StyleSheet.create({
  wishes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  link: { minHeight: T.control.touch, justifyContent: 'center', paddingLeft: 8 },
  more: { minHeight: T.control.touch, justifyContent: 'center', alignSelf: 'flex-start', paddingRight: 12 },
  linkText: { ...type.label, color: C.accent, fontWeight: '600' }
});
