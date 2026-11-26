import {t} from '../../lib/i18n';
import React, { useEffect, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Action, Chips, Stepper, h } from './SheetParts';
import { C, type } from './styles';
import { T } from './tokens';
import { mapCities } from './map-math';
import { AddressField } from './AddressSuggest';
import { OCCASIONS, STAY_CLASS_LIST, allKinds, maxGuestsOf, wishesOf, draftSlot, withSlot, categoryKinds, categoryOf, classWords, dayChoices, draftUnits, homeWords, withDay, withMode, withTime, withUnits, type GuestDraft } from './ai-request';
import { SECTION_TITLES, sectionWords, type Section } from './guest-tokens';
import { hasChoices, resetDraft, type FormCount } from './form-count';
import { wishIcons } from './wish-icons';
import { stayClassNotes, isStayClass } from '../../lib/stay-class';
import { BANQUET_SLOTS, addDays, kzToday, plural, type BanquetSlot } from '../../lib/map-search-request';

const chevron = require('../assets/ui/chevron.png');

type Props = {
  draft: GuestDraft;
  // One part of the form (a token was tapped), or every condition as a list of sections.
  only?: Section | 'all';
  onChange: (next: GuestDraft) => void;
  // Opens the point picker on the map; the point comes back through onChange.
  onPickPoint: () => void;
  // Shown when the phone knows where the guest is and it is in the searched city.
  onNearMe?: () => void;
  onSubmit: () => void;
  // The map's sheet pins the button bar under its scroll (MapHome footBar): the form then hands the bar up instead of drawing it.
  onFoot?: (bar: React.ReactNode | null) => void;
  busy: boolean;
  // What the conditions find while they are chosen (useFormCount.ts): the number on the button, the classes, the prices.
  count?: FormCount | null;
};

// The parts of the form as the guest sees them (concept of 2026-11-26, Airbnb filters): each its own section with a bold
// title and what it holds, folded by a tap; the type, the class and the rooms are three sections, not one.
type Part = 'when' | 'guests' | 'price' | 'where' | 'kind' | 'class' | 'rooms' | 'wishes' | 'priority';
const PARTS: Record<Section, Part[]> = { when: ['when'], guests: ['guests'], price: ['price'], where: ['where'], home: ['kind', 'class', 'rooms'], wishes: ['wishes'], priority: ['priority'] };
// Long lists show their first chips; the chosen ones are always shown.
const SHORT_KINDS = 5, SHORT_WISHES = 8;
// Quick budgets per day, per hour or per guest of a hall; the field under them takes any other.
const BUDGETS = { stay: [10000, 15000, 20000, 30000], hourly: [2000, 3000, 5000, 8000], banquet: [5000, 8000, 12000, 15000] };

const two = (value: number) => String(value).padStart(2, '0');
const clock = (minutes: number) => two(Math.floor(minutes / 60)) + ':' + two(minutes % 60);
const money = (v: number) => new Intl.NumberFormat('ru-RU').format(v).replace(/\s/g, ' ');
const cap = (text: string) => (text ? text[0].toLocaleUpperCase('ru') + text.slice(1) : text);

// A strip of equal parts (Airbnb «Type of place»): the chosen part is dark. `multi`: several parts may be chosen.
function Segments({ name, options, on, onPress, multi = false, disabled }: { name: string; options: [string, string, string?][]; on: (id: string) => boolean; onPress: (id: string) => void; multi?: boolean; disabled?: boolean }) {
  return <View style={f.seg} accessibilityRole={multi ? undefined : 'radiogroup'} accessibilityLabel={name}>{options.map(([id, title, sub], at) => {
    const chosen = on(id);
    return <Pressable key={id} accessibilityRole={multi ? 'checkbox' : 'radio'} accessibilityLabel={sub ? title + ', ' + sub : title} accessibilityState={{ checked: chosen, disabled }} disabled={disabled} onPress={() => onPress(id)} style={({ pressed }) => [f.segPart, at > 0 && f.segLine, chosen && f.segOn, pressed && h.dim]}>
      <Text numberOfLines={1} style={[f.segText, chosen && f.segTextOn]}>{title}</Text>
      {!!sub && <Text numberOfLines={1} style={[f.segSub, chosen && f.segSubOn]}>{sub}</Text>}
    </Pressable>;
  })}</View>;
}

// A chip that is one of several choices: the chosen one keeps its white and gets a dark frame (Airbnb amenities).
function Pick({ title, on, icon, onPress, disabled }: { title: string; on: boolean; icon?: number; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="checkbox" accessibilityLabel={title} accessibilityState={{ checked: on, disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [f.pick, on && f.pickOn, pressed && h.dim]}>
    {icon !== undefined && <Image source={icon} style={f.pickIcon} accessibilityIgnoresInvertColors />}
    <Text style={[f.pickText, on && f.pickTextOn]}>{title}</Text>
  </Pressable>;
}

// The guest's conditions as fields, for those who prefer them to free text. The AI line fills the same conditions,
// so what was typed there is already chosen here. Only the look follows the concept; the search is the same.
export function GuestForm({ draft, only = 'all', onChange, onPickPoint, onNearMe, onSubmit, busy, count, onFoot }: Props) {
  const hourly = draft.mode === 'hourly';
  const startMinutes = Number(draft.start.slice(11, 13)) * 60 + Number(draft.start.slice(14, 16));
  const units = draftUnits(draft);
  const category = categoryOf(draft), bath = category === 'bath', hall = category === 'banquet', venue = category !== 'stay';
  // «Баня» never loses its last type: an empty list would mean «Жильё».
  const toggleKind = (id: string) => {
    const kinds = draft.kinds.includes(id) ? draft.kinds.filter(v => v !== id) : [...draft.kinds, id];
    onChange({ ...draft, kinds: venue && !kinds.length ? allKinds(category) : kinds });
  };
  // Rooms: any, exactly 1 or 2, 3 and more; a count the text named that is not here stays as a step.
  const roomOptions: [string, string][] = [['', t('Любое')], ['1', '1'], ['2', '2'], ['3+', '3+']];
  if (draft.rooms && !roomOptions.some(([id]) => id === draft.rooms)) roomOptions.push([draft.rooms, draft.rooms.endsWith('+') ? t('от {v}', { v: draft.rooms.slice(0, -1) }) : draft.rooms]);
  const roomAt = Math.max(0, roomOptions.findIndex(([id]) => id === draft.rooms));
  // The budget is a price per day (per hour on the hourly tariff); a total named in the line keeps its own label.
  // A hall: any day up to three months ahead, by the chips or one day at a time.
  const today = kzToday(), day = draft.start.slice(0, 10), ahead = Math.round((Date.parse(day) - Date.parse(today)) / 86400000);
  const dayText = (date: string) => { const d = new Date(date + 'T00:00:00Z'); return [t('вс'), t('пн'), t('вт'), t('ср'), t('чт'), t('пт'), t('сб')][d.getUTCDay()] + ', ' + d.getUTCDate() + ' ' + [t('янв'), t('фев'), t('мар'), t('апр'), t('мая'), t('июн'), t('июл'), t('авг'), t('сен'), t('окт'), t('ноя'), t('дек')][d.getUTCMonth()]; };
  const budgetLabel = hall ? (draft.perUnit || !draft.maxPrice ? t('Цена на гостя до, ₸') : t('Бюджет на всё, ₸')) : draft.perUnit || !draft.maxPrice ? (hourly ? t('Цена за час до, ₸') : draft.mode === 'night' ? t('Цена за ночь до, ₸') : t('Цена за сутки до, ₸')) : t('Бюджет на весь срок, ₸');
  const budgets = hall ? BUDGETS.banquet : hourly ? BUDGETS.hourly : BUDGETS.stay;
  // A price typed in the field stays the field's while it is typed, even when it passes a chip's value («10000» on the way to «100000»).
  const [typedPrice, setTypedPrice] = useState('');
  const typing = !!typedPrice && typedPrice === draft.maxPrice;
  const budgetChosen = !draft.maxPrice ? '' : !typing && draft.perUnit && budgets.includes(Number(draft.maxPrice)) ? draft.maxPrice : 'own';
  // What places usually cost: counted while no budget cuts the list, then kept for this city and tariff.
  const priceKey = draft.city + '|' + category + '|' + draft.mode, usual = useRef<{ key: string; low: number; high: number } | null>(null);
  if (count?.low && count.high) usual.current = { key: priceKey, low: count.low, high: count.high };
  const usualPrice = usual.current?.key === priceKey ? usual.current : null;
  const [open, setOpen] = useState<Part[]>(['kind', 'class', 'price']);
  const [allKindsShown, setAllKindsShown] = useState(false), [allWishesShown, setAllWishesShown] = useState(false);
  const toggleWish = (id: string) =>
    onChange({ ...draft, features: draft.features.includes(id) ? draft.features.filter(v => v !== id) : [...draft.features, id] });
  const toggleClass = (id: string) => onChange({ ...draft, classes: draft.classes?.includes(id) ? draft.classes.filter(v => v !== id) : [...(draft.classes || []), id] });
  const kindList = categoryKinds(category), wishList = wishesOf(category);
  const shownKinds = allKindsShown || kindList.length <= SHORT_KINDS + 1 ? kindList : kindList.filter(([id], at) => at < SHORT_KINDS || draft.kinds.includes(id));
  const shownWishes = allWishesShown || wishList.length <= SHORT_WISHES + 1 ? wishList : wishList.filter(([id], at) => at < SHORT_WISHES || draft.features.includes(id));
  const more = (shown: boolean, set: (v: boolean) => void, total: number, title: string) => <Pressable accessibilityRole="button" disabled={busy} onPress={() => set(!shown)} style={({ pressed }) => [f.more, pressed && h.dim]}><Text style={f.moreText}>{shown ? t('Свернуть') : title + ' (' + total + ')'}</Text></Pressable>;
  const classNote = (draft.classes || []).filter(isStayClass).map(id => STAY_CLASS_LIST.find(([k]) => k === id)?.[1] + ': ' + stayClassNotes[id].toLocaleLowerCase('ru')).join('\n');

  const parts: Record<Part, React.ReactNode> = {
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
    price: <><View style={f.picks} accessibilityRole="radiogroup" accessibilityLabel={budgetLabel}>{[['', t('Любая')] as [string, string], ...budgets.map(v => [String(v), t('до {sum}', { sum: money(v) })] as [string, string])].map(([v, title]) => <Pressable key={v} accessibilityRole="radio" accessibilityState={{ checked: budgetChosen === v, disabled: busy }} disabled={busy} onPress={() => { setTypedPrice(''); onChange({ ...draft, maxPrice: v, perUnit: true }); }} style={[h.chip, budgetChosen === v && h.chipOn]}><Text style={[h.chipText, budgetChosen === v && h.chipTextOn]}>{title}</Text></Pressable>)}</View><View><Text style={h.label}>{budgetChosen === 'own' ? budgetLabel : t('Или своя цена')}</Text><TextInput
            accessibilityLabel={budgetLabel.replace(', ₸', ' в тенге')}
            style={h.input}
            keyboardType="number-pad"
            maxLength={9}
            placeholder={t('Например, {sum}', { sum: money(budgets[1] + budgets[0] / 5) })}
            placeholderTextColor={C.muted}
            value={budgetChosen === 'own' ? draft.maxPrice : ''}
            onChangeText={text => { const maxPrice = text.replace(/[^\d]/g, ''); setTypedPrice(maxPrice); onChange({ ...draft, maxPrice, perUnit: text ? draft.perUnit : true }); }}
            editable={!busy}
          /></View>{!!usualPrice && <Text style={f.hint}>{t('Обычно здесь сдают за {low} – {high} ₸', { low: money(usualPrice.low), high: money(usualPrice.high) }) + ' ' + (hall ? t('на гостя') : hourly ? t('в час') : draft.mode === 'night' ? t('за ночь') : t('в сутки')) + '.'}</Text>}</>,
    where: <><Chips
        label={t('Город')}
        value={draft.city}
        options={Object.keys(mapCities).map(city => [city, city])}
        onChange={city => onChange(city === draft.city ? draft : { ...draft, city, district: '', near: null })}
        disabled={busy}
      /><AddressField
          kind="district"
          label={t('Район')}
          labelStyle={h.label}
          inputStyle={h.input}
          city={draft.city}
          placeholder={t('Любой')}
          max={120}
          value={draft.district}
          onChange={district => onChange({ ...draft, district })}
          disabled={busy}
        /><View style={h.row}><Text style={[h.note, h.grow]}>{draft.near ? t('Ищем в 5 км от выбранной точки.') : t('Ищем по всему городу.')}</Text><Pressable
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
    kind: <><View style={f.picks}>{shownKinds.map(([id, title]) => <Pick key={id} title={title} on={draft.kinds.includes(id)} onPress={() => toggleKind(id)} disabled={busy} />)}</View>{kindList.length > SHORT_KINDS + 1 && more(allKindsShown, setAllKindsShown, kindList.length, t('Все типы'))}</>,
    class: <><Segments name={t('Класс жилья')} multi options={STAY_CLASS_LIST.map(([id, title]) => [id, title, count ? '· ' + (count.classes[id] || 0) : undefined])} on={id => !!draft.classes?.includes(id)} onPress={toggleClass} disabled={busy} /><Text style={f.hint}>{classNote || t('Можно выбрать несколько. Класс жилья предлагает ИИ, владелец подтверждает.')}</Text></>,
    rooms: null,
    wishes: <><View style={f.picks}>{shownWishes.map(([id, title]) => <Pick key={id} title={title} icon={wishIcons[id]} on={draft.features.includes(id)} onPress={() => toggleWish(id)} disabled={busy} />)}</View>{wishList.length > SHORT_WISHES + 1 && more(allWishesShown, setAllWishesShown, wishList.length, venue ? t('Показать все') : t('Все удобства и правила'))}</>,
    priority: <Segments name={t('Что важнее')} options={[['balanced', t('Баланс')], ['cheaper', t('Дешевле')], ['closer', t('Ближе')]]} on={id => draft.priority === id} onPress={id => onChange({ ...draft, priority: id as GuestDraft['priority'] })} disabled={busy} />
  };
  const titles = Object.fromEntries(SECTION_TITLES(draft)) as Record<Section, string>;
  const typed = venue ? draft.kinds.length < allKinds(category).length : draft.kinds.length > 0;
  const partTitle = (id: Part) => id === 'kind' ? (hall ? t('Зал или кафе') : bath ? t('Баня или сауна') : t('Тип жилья')) : id === 'class' ? t('Класс жилья') : id === 'rooms' ? t('Комнаты') : titles[id];
  const partWords = (id: Part) => id === 'kind' ? (typed ? cap(homeWords({ kinds: draft.kinds, rooms: '' })) : bath ? t('Любая') : t('Любой'))
    : id === 'class' ? classWords(draft.classes) || t('Любой') : id === 'rooms' ? roomOptions[roomAt][1] : sectionWords(draft, id);
  const partsOf = (section: Section) => PARTS[section].filter(id => !venue || (id !== 'class' && id !== 'rooms'));
  // «Комнаты» is one line with its counter: there is nothing to fold.
  const rooms = <View style={f.roomsRow}><Text style={f.title}>{t('Комнаты')}</Text><View style={f.counter}>
    <Pressable accessibilityRole="button" accessibilityLabel={t('{label}: меньше', { label: t('Комнаты') })} disabled={busy || roomAt === 0} onPress={() => onChange({ ...draft, rooms: roomOptions[roomAt - 1][0] })} style={[f.round, (busy || roomAt === 0) && f.roundOff]}><Text style={[f.roundText, roomAt === 0 && f.roundTextOff]}>−</Text></Pressable>
    <Text accessibilityLiveRegion="polite" style={f.counterValue}>{roomOptions[roomAt][1]}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={t('{label}: больше', { label: t('Комнаты') })} disabled={busy || roomAt === roomOptions.length - 1} onPress={() => onChange({ ...draft, rooms: roomOptions[roomAt + 1][0] })} style={[f.round, (busy || roomAt === roomOptions.length - 1) && f.roundOff]}><Text style={[f.roundText, roomAt === roomOptions.length - 1 && f.roundTextOff]}>+</Text></Pressable>
  </View></View>;
  const sections = (list: Part[], fold: boolean) => <View>{list.map((id, at) => {
    if (id === 'rooms') return <View key={id} style={at > 0 && f.sectionNext}>{rooms}</View>;
    const on = !fold || open.includes(id), title = partTitle(id), words = partWords(id);
    const head = <><Text style={f.title}>{title}</Text><Text numberOfLines={1} style={f.value}>{words}</Text>{fold && <Image source={chevron} style={[f.chevron, on && f.chevronOpen]} accessibilityIgnoresInvertColors />}</>;
    return <View key={id} style={at > 0 && f.sectionNext}>
      {fold ? <Pressable accessibilityRole="button" accessibilityLabel={title + ': ' + words} accessibilityState={{ expanded: on, disabled: busy }} disabled={busy} onPress={() => setOpen(on ? open.filter(v => v !== id) : [...open, id])} style={({ pressed }) => [f.head, pressed && h.dim]}>{head}</Pressable>
        : <View accessibilityRole="header" style={f.head}>{head}</View>}
      {on && <View style={f.body}>{parts[id]}</View>}
    </View>;
  })}</View>;
  // The button says what it will find (Airbnb «Show 307 places»); «Сбросить» takes off what was chosen.
  const found = count && count.total > 0 ? t('Показать {n} {word}', { n: count.total, word: plural(count.total, 'вариант', 'варианта', 'вариантов') }) : t('Показать варианты');
  const reset = hasChoices(draft);
  // The pinned bar lives in the parent's state: it calls the latest handlers through refs, so it is handed up only when what it shows changes.
  const latest = useRef({ onChange, onSubmit, draft });
  latest.current = { onChange, onSubmit, draft };
  const bar = <View style={f.bar}>{reset && <Pressable accessibilityRole="button" disabled={busy} onPress={() => latest.current.onChange(resetDraft(latest.current.draft))} style={({ pressed }) => [f.reset, (pressed || busy) && h.dim]}><Text style={f.resetText}>{t('Сбросить')}</Text></Pressable>}<View style={h.grow}><Action title={busy ? t('Ищем…') : found} disabled={busy} onPress={() => latest.current.onSubmit()} /></View></View>;
  // As Airbnb's «Show 305 places»: the button stays at the bottom of the sheet however far the form is scrolled.
  useEffect(() => { onFoot?.(bar); }, [onFoot, found, reset, busy]);
  useEffect(() => () => onFoot?.(null), [onFoot]);
  const foot = <><Text style={h.note}>{hall ? t('Цена зала считается на гостя. При отмене вся оплата возвращается.') : (hourly ? t('Депозит оплачивается отдельно.') : t('Выезд до 12:00. Депозит оплачивается отдельно.'))}</Text>
    {!onFoot && bar}</>;
  // One token was tapped: only its part of the form, with the way to the rest.
  if (only !== 'all') return <>{sections(partsOf(only), false)}{foot}</>;
  return <>{sections((Object.keys(PARTS) as Section[]).flatMap(partsOf), true)}{foot}</>;
}

const f = StyleSheet.create({
  link: { minHeight: T.control.touch, justifyContent: 'center', paddingLeft: 8 },
  linkText: { ...type.label, color: C.ink, fontWeight: '600', textDecorationLine: 'underline' },
  sectionNext: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line },
  head: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { ...type.subtitle, color: C.ink, fontWeight: '600' },
  value: { flex: 1, minWidth: 0, textAlign: 'right', ...type.label, color: C.muted },
  chevron: { width: 14, height: 14, tintColor: C.muted, transform: [{ rotate: '90deg' }] },
  chevronOpen: { transform: [{ rotate: '-90deg' }] },
  body: { gap: 12, paddingBottom: 20 },
  hint: { ...type.caption, color: C.muted },
  picks: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pick: { minHeight: T.control.compact, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 15, borderRadius: T.radius.full, borderWidth: 1, borderColor: C.lineStrong, backgroundColor: C.surface },
  pickOn: { borderWidth: 2, borderColor: C.ink, paddingHorizontal: 14 },
  pickIcon: { width: 18, height: 18, tintColor: C.inkSoft },
  pickText: { ...type.label, color: C.inkSoft },
  pickTextOn: { color: C.ink, fontWeight: '600' },
  more: { alignSelf: 'flex-start', minHeight: T.control.compact, justifyContent: 'center' },
  moreText: { ...type.label, color: C.ink, fontWeight: '600', textDecorationLine: 'underline' },
  seg: { flexDirection: 'row', borderWidth: 1, borderColor: C.lineStrong, borderRadius: 14, overflow: 'hidden', backgroundColor: C.surface },
  segPart: { flex: 1, minHeight: T.control.field, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  segLine: { borderLeftWidth: 1, borderLeftColor: C.line },
  segOn: { backgroundColor: C.ink },
  segText: { ...type.label, color: C.inkSoft },
  segTextOn: { color: C.surface, fontWeight: '600' },
  segSub: { fontSize: 11, lineHeight: 14, color: C.muted },
  segSubOn: { color: C.surface, opacity: 0.75 },
  roomsRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  counter: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  counterValue: { minWidth: 56, textAlign: 'center', ...type.body, color: C.ink, fontWeight: '600' },
  round: { width: 36, height: 36, borderRadius: T.radius.full, borderWidth: 1, borderColor: C.lineStrong, alignItems: 'center', justifyContent: 'center' },
  roundOff: { borderColor: C.line },
  roundText: { fontSize: 20, lineHeight: 22, color: C.ink },
  roundTextOff: { color: C.lineStrong },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  reset: { minHeight: T.control.touch, justifyContent: 'center' },
  resetText: { ...type.body, color: C.ink, fontWeight: '600', textDecorationLine: 'underline' }
});
