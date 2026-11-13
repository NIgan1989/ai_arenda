import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Action, Chips, Stepper, h } from './SheetParts';
import { C, type } from './styles';
import { T } from './tokens';
import { mapCities } from './map-math';
import { MAX_GUESTS, WISHES, dayChoices, draftUnits, withDay, withMode, withTime, withUnits, type GuestDraft } from './ai-request';

type Props = {
  draft: GuestDraft;
  onChange: (next: GuestDraft) => void;
  // Opens the point picker on the map; the point comes back through onChange.
  onPickPoint: () => void;
  onSubmit: () => void;
  busy: boolean;
};

const two = (value: number) => String(value).padStart(2, '0');
const clock = (minutes: number) => two(Math.floor(minutes / 60)) + ':' + two(minutes % 60);

// The structured request for those who prefer fields to free text. The AI line fills the same conditions,
// so what was typed there is already chosen here.
export function GuestForm({ draft, onChange, onPickPoint, onSubmit, busy }: Props) {
  const hourly = draft.mode === 'hourly';
  const startMinutes = Number(draft.start.slice(11, 13)) * 60 + Number(draft.start.slice(14, 16));
  const units = draftUnits(draft);
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
          <Text style={h.label}>Бюджет на весь срок, ₸</Text>
          <TextInput
            accessibilityLabel="Бюджет на весь срок в тенге"
            style={h.input}
            keyboardType="number-pad"
            maxLength={9}
            placeholder="Любой"
            placeholderTextColor={C.muted}
            value={draft.maxPrice}
            onChangeText={text => onChange({ ...draft, maxPrice: text.replace(/[^\d]/g, '') })}
            editable={!busy}
          />
        </View>
      </View>
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
      <Text style={h.note}>{hourly ? '' : 'Выезд до 12:00. '}Депозит оплачивается отдельно.</Text>
      <Action title={busy ? 'Ищем…' : 'Показать варианты'} disabled={busy} onPress={onSubmit} />
    </>
  );
}

const f = StyleSheet.create({
  wishes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  link: { minHeight: T.control.touch, justifyContent: 'center', paddingLeft: 8 },
  linkText: { ...type.label, color: C.accent, fontWeight: '600' }
});
