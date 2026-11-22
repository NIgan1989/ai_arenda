import {t} from '../../lib/i18n';
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { banquetWhen, plural, stayWhen } from '../../lib/map-search-request';
import { Photo } from './ListingMedia';
import { Action, h } from './SheetParts';
import { money, type Row } from './model';
import { windowBadge } from '../../lib/window-badge';
import { C, type } from './styles';
import { T } from './tokens';
import { ReliabilityBadge } from './Reliability';
import { HOME_KINDS, WISHES, BANQUET_WISHES, BANQUET_TYPES, BATH_TYPES, askFirst, categoryOf, draftUnits, homeWords, kindCategoryOf, shownReasons, withMode, withUnits, type GuestDraft } from './ai-request';
import { carouselIndex } from './map-motion';
import { Heart } from './Favorites';
import { markLabel, markOf, type Mine } from './favorites';
import { GuestHelpers, HelperTrail } from './GuestHelpers';
import { guestHelpers, narrowed, stepWords, type Point } from './guest-helpers';
import { noteViews, takeViews, viewLog } from './guest-views';
import { request } from './api';
import { background } from './loading';

const chevron = require('../assets/ui/chevron.png');
// What was already told for the answer on screen. It outlives the sheet being lowered and raised again, so the same
// card is not counted twice for one answer.
const shownLog = viewLog();

type Props = {
  // The answer of /api/public/matching: flats that are free on these conditions, best first.
  preview: Row;
  // The conditions that were searched; the price of every flat is for this stay.
  draft: GuestDraft;
  // The guest's favourites and the homes of earlier stays: they are marked, and the heart on a card changes them.
  mine?: Mine;
  onFavorite?: (id: string) => void;
  selected: string;
  onSelect: (id: string) => void;
  // The card the guest has swiped to: its pin lifts and the map flies to it.
  onFocus?: (id: string) => void;
  onBook: (property: Row) => void;
  onOpen: (property: Row) => void;
  onRefine: () => void;
  // Present when the search was narrowed by a district, a budget or wishes: looks again without them.
  onWiden?: () => void;
  // Searches again with these conditions changed: the way out an empty answer offers.
  onTry?: (patch: Partial<GuestDraft>) => void;
  // Where «Забронировать» of the chosen flat ends, from the top of the sheet's content: the sheet opens that far.
  onBookEdge?: (bottom: number) => void;
  busy: boolean;
  // «Помогайки»: the steps the guest took to narrow the answer, the ones taken back, and where the guest is.
  steps?: string[];
  tried?: string[];
  from?: Point | null;
  // A step forward remembers the card in view; a step back returns to the card of that moment.
  onStep?: (id: string, inView: string) => void;
  onBack?: () => void;
  // The card to open the strip on after a step back.
  anchor?: string;
  // The sheet is fully open: every found place as a list, not one card at a time.
  full?: boolean;
  // «Готово к 18:00» or «Уточняем готовность»: the home at the searched arrival (arrival.ts); null when the answer has no strip.
  readiness?: (flat: Row) => { text: string; check: boolean } | null;
};

// The carousel: a card is a little narrower than the screen, so the next one peeks out and says «swipe».
const GAP = 12,
  CARD_MAX = 340,
  DOTS = 7;
// A dear card left this fast was not read: three of them and the price is offered first.
const GLANCE = 1500;

// The chosen flat rises into the sheet as if from its pin; with «reduce motion» it is simply there.
// onTop: where the card starts in the sheet's content; the rise moves it on screen only, never in the layout.
function Rise({ children, onTop }: { children: React.ReactNode; onTop: (y: number) => void }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(calm => {
        if (!live) return;
        if (calm) v.setValue(1);
        else Animated.spring(v, { toValue: 1, stiffness: 260, damping: 22, mass: 1, useNativeDriver: true }).start();
      })
      .catch(() => v.setValue(1));
    return () => {
      live = false;
    };
  }, []);
  return <Animated.View onLayout={e => onTop(Math.round(e.nativeEvent.layout.y))} style={{ opacity: v.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1] }), transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [28, 0] }) }, { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }] }}>{children}</Animated.View>;
}

function stayWords(draft: GuestDraft) {
  // A hall: "80 гостей", the price is for the party.
  if (categoryOf(draft) === 'banquet') return draft.guests + ' ' + plural(draft.guests, 'гостя', 'гостей', 'гостей');
  const units = draftUnits(draft);
  if (draft.mode === 'night') return units + ' ' + plural(units, 'ночь', 'ночи', 'ночей');
  return draft.mode === 'hourly' ? units + ' ' + plural(units, 'час', 'часа', 'часов') : units + ' ' + plural(units, 'сутки', 'суток', 'суток');
}

// What the guest sees after a search: a short list, then one flat with a way to book it and a way back.
// The server's time as the request form keeps it: Kazakhstan wall clock, 'YYYY-MM-DDTHH:mm'.
const kzLocal = (iso: string) => new Date(Date.parse(iso) + 5 * 3600000).toISOString().slice(0, 16);

// An empty answer: the reason the server found (lib/smart-matching.ts emptyHint) and one way out of it.
export function emptyAnswer(empty: Row | undefined, draft: GuestDraft, narrowed: boolean): { title: string; note: string; action?: { title: string; patch: Partial<GuestDraft> } } {
  const guests = (n: number) => n + ' ' + plural(n, 'гостя', 'гостей', 'гостей');
  if (empty?.reason === 'city') return { title: t('В городе {city} пока нет жилья',{city:draft.city}), note: t('Сервис только приходит сюда. Выберите другой город в «Изменить условия».') };
  if (empty?.reason === 'guests') {
    const most = Number(empty.maxGuests) || 1;
    return { title: t('Нет жилья на {v}',{v:guests(draft.guests)}), note: t('Самое большое жильё здесь — до {v}. Можно снять два объекта рядом.',{v:guests(most)}), action: { title: t('Искать на {v}',{v:guests(most)}), patch: { guests: most } } };
  }
  if (empty?.reason === 'hourly') return { title: t('На часы здесь пока не сдают'), note: t('Есть жильё на сутки.'), action: { title: t('Искать на сутки'), patch: withMode(draft, 'daily') } };
  if (empty?.reason === 'now') {
    const count = Number(empty.count) || 0;
    return {
      title: t('Готового жилья с мгновенным подтверждением сейчас нет'),
      note: t('Свободно ещё {found}: там владелец отвечает до 15 минут или жильё ещё готовят к заезду.',{found:count + ' ' + plural(count, 'вариант', 'варианта', 'вариантов')}),
      action: { title: t('Показать все варианты'), patch: { now: false } }
    };
  }
  if (empty?.reason === 'minHours') {
    const least = Number(empty.minHours) || 2, hours = least + ' ' + plural(least, 'час', 'часа', 'часов');
    return { title: t('Так ненадолго здесь не бронируют'), note: t('Минимум — {hours}.',{hours}), action: { title: t('Искать на {hours}',{hours}), patch: withUnits(draft, least) } };
  }
  if (empty?.reason === 'prep' && empty.next) {
    // Free, but the place is made ready before the guests (a bath is heated): the first hour it can start.
    const start = kzLocal(empty.next.start), end = kzLocal(empty.next.end), minutes = Number(empty.prepMinutes) || 0;
    const long = [Math.floor(minutes / 60) ? t('{h} ч',{h:Math.floor(minutes / 60)}) : '', minutes % 60 ? t('{m} мин',{m:(minutes % 60)}) : ''].filter(Boolean).join(' ');
    return { title: t('Так скоро не успеют подготовить'), note: categoryOf(draft) === 'bath' ? t('Баню топят {long} до гостей. Ближайшее начало — {time}.',{long,time:start.slice(11)}) : t('Место готовят {long} до гостей. Ближайшее начало — {time}.',{long,time:start.slice(11)}), action: { title: t('Показать с {time}',{time:start.slice(11)}), patch: { start, end, now: false } } };
  }
  if (empty?.reason === 'busy') {
    const next = empty.next;
    if (!next) return { title: t('На это время всё занято'), note: t('Свободного нет и в ближайшую неделю. Попробуйте другие даты.') };
    const start = kzLocal(next.start), end = kzLocal(next.end), when = categoryOf(draft) === 'banquet' ? banquetWhen(start) : stayWhen(start, end, draft.mode);
    return { title: t('На это время всё занято'), note: categoryOf(draft) === 'banquet' ? t('Ближайшее свободное на то же время — {when}.',{when}) : t('Ближайшее свободное на тот же срок — {when}.',{when}), action: { title: t('Показать на {when}',{when}), patch: { start, end, now: false } } };
  }
  if (empty?.reason === 'budget') {
    const cheapest = Number(empty.cheapest), units = draftUnits(draft), unit = draft.mode === 'hourly' ? t('час') : draft.mode === 'night' ? t('ночь') : t('сутки');
    const limit = draft.perUnit ? Math.ceil(cheapest / units / 100) * 100 : Math.ceil(cheapest / 100) * 100;
    return {
      title: t('В пределах бюджета свободного нет'),
      note: units > 1 ? t('Самое доступное на это время — {sum} за всё ({each} за {unit}).',{sum:money(cheapest),each:money(Math.round(cheapest / units)),unit}) : t('Самое доступное на это время — {sum}.',{sum:money(cheapest)}),
      action: { title: draft.perUnit ? t('Показать до {sum} за {unit}',{sum:money(limit),unit}) : t('Показать до {sum}',{sum:money(limit)}), patch: { maxPrice: String(limit) } }
    };
  }
  if (empty?.reason === 'filters') {
    const count = Number(empty.count) || 0;
    if (categoryOf(draft) === 'banquet') {
      if (count && empty.blocker === 'features') return { title: t('Свободного зала с этим нет: {v}',{v:BANQUET_WISHES.filter(([id]) => draft.features.includes(id)).map(([, name]) => name.toLocaleLowerCase('ru')).join(', ')}), note: t('Без этого условия свободно: {count}.',{count}), action: { title: t('Искать без пожеланий'), patch: { features: [] } } };
      if (count && empty.blocker === 'kinds') return { title: t('Такого зала свободного нет'), note: t('Других залов на это время свободно: {count}.',{count}), action: { title: t('Показать любой зал'), patch: { kinds: [...BANQUET_TYPES] } } };
      if (!count || !empty.blocker) return { title: t('С этими условиями свободного зала нет'), note: count ? t('Без района и пожеланий свободно: {count}.',{count}) : t('Попробуйте другой день, обед вместо вечера или меньше гостей.') };
    }
    // One condition empties the answer on its own: it is named, with one tap to search without it.
    const free = t('Без этого условия свободно: {count}.',{count});
    if (count && empty.blocker === 'kinds' && categoryOf(draft) === 'bath') return { title: t('Свободной нет: {v}',{v:homeWords({ kinds: draft.kinds, rooms: '' })}), note: t('Других бань и саун на это время свободно: {count}.',{count}), action: { title: t('Показать любую баню'), patch: { kinds: [...BATH_TYPES] } } };
    if (count && empty.blocker === 'kinds') return { title: t('Нет свободного жилья такого типа: {v}',{v:homeWords({ kinds: draft.kinds, rooms: '' })}), note: t('Другого жилья на это время свободно: {count}.',{count}), action: { title: t('Показать любое жильё'), patch: { kinds: [] } } };
    if (count && empty.blocker === 'rooms') return { title: t('С таким числом комнат свободного нет'), note: free, action: { title: t('Показать с любым числом комнат'), patch: { rooms: '' } } };
    if (count && empty.blocker === 'district') return { title: t('В районе {district} свободного нет',{district:draft.district}), note: t('В других районах свободно: {count}.',{count}), action: { title: t('Искать по всему городу'), patch: { district: '' } } };
    if (count && empty.blocker === 'features') return { title: t('Свободного жилья с этим нет: {v}',{v:WISHES.filter(([id]) => draft.features.includes(id)).map(([, name]) => (name === 'Wi-Fi' ? name : name.toLocaleLowerCase('ru'))).join(', ')}), note: free, action: { title: t('Искать без пожеланий'), patch: { features: [] } } };
    if (count && empty.blocker === 'maxFloor') return { title: t('Так низко свободного нет'), note: free, action: { title: t('Искать на любом этаже'), patch: { maxFloor: 0 } } };
    if (count && empty.blocker === 'near') return { title: t('Рядом с этим местом свободного нет'), note: t('В городе свободно: {count}.',{count}), action: { title: t('Искать по всему городу'), patch: { near: null, priority: 'balanced' } } };
    return { title: t('С этими условиями свободного нет'), note: count ? t('Без района, типа жилья и пожеланий свободно: {count}.',{count}) : t('Даже без района, типа жилья и пожеланий свободного нет. Попробуйте другое время.') };
  }
  if (categoryOf(draft) === 'banquet') return { title: t('На этот день свободного зала нет'), note: narrowed ? t('Поиск сужают район, цена на гостя или пожелания. Можно искать без них.') : t('Попробуйте другой день, обед вместо вечера или меньше гостей.') };
  return { title: t('На эти условия свободного жилья нет'), note: narrowed ? t('Поиск сужают район, бюджет или пожелания. Можно искать без них.') : t('Попробуйте другое время или другой срок.') };
}

// "Студия · 1 комн. · до 2 гостей": what the home is, said on the card before why it was chosen.
export function homeLine(flat: Row) {
  const kind = HOME_KINDS[flat.details?.type] || '', rooms = Number(flat.rooms), capacity = Number(flat.capacity);
  return [kind, rooms > 0 && flat.details?.type !== 'studio' && kindCategoryOf(flat.details?.type) === 'stay' ? t('{rooms} комн.',{rooms}) : '', capacity > 0 ? t('до {guests}',{guests:capacity + ' ' + plural(capacity, 'гостя', 'гостей', 'гостей')}) : ''].filter(Boolean).join(' · ');
}

export function GuestResults({ preview, draft, mine, onFavorite, selected, onSelect, onFocus, onBook, onOpen, onRefine, onWiden, onTry, onBookEdge, busy, steps = [], tried = [], from = null, onStep, onBack, anchor = '', full = false, readiness }: Props) {
  const found: Row[] = preview.properties || [];
  // Dear cards the guest swiped past without reading, in this answer.
  const [pricey, setPricey] = useState(0);
  const context = { draft, from, tried, pricey, taken: steps };
  const flats = steps.length ? narrowed(found, steps, context) : found;
  const chosen = flats.find(flat => flat.id === selected);
  const width = useWindowDimensions().width,
    card = Math.min(CARD_MAX, width - 64),
    step = card + GAP;
  // index: the card in view; seen: the farthest card reached, so photos load only near what the guest has looked at.
  const [index, setIndex] = useState(0),
    [seen, setSeen] = useState(0);
  const list = flats;
  const helpers = onStep ? guestHelpers(flats, context) : [];
  const middle = [...flats.map(flat => Number(flat.estimate?.amount) || 0)].sort((x, y) => x - y)[Math.floor((flats.length - 1) / 2)] || 0;
  const arrived = useRef(Date.now());
  useEffect(() => { setPricey(0); }, [preview]);
  // Another set of cards (a step forward or back): the strip opens on the remembered card, else on the first.
  const listKey = flats.map(flat => flat.id).join();
  useEffect(() => {
    const at = Math.max(0, flats.findIndex(flat => flat.id === anchor));
    setIndex(at);
    setSeen(at);
    arrived.current = Date.now();
    strip.current?.scrollTo({ x: at * step, animated: false });
    if (flats[at] && (steps.length || anchor)) onFocus?.(flats[at].id);
  }, [listKey]);
  const settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const strip = useRef<ScrollView>(null);
  // Back from a result: the carousel opens again on the card the guest was looking at, as the counter and the map say.
  // The same after the full list: the strip is mounted anew there, and must not start from its first card.
  useEffect(() => {
    if (!chosen && !full && index) strip.current?.scrollTo({ x: index * step, animated: false });
  }, [!!chosen, full]);
  // «Забронировать» ends where the chosen card starts in the sheet plus where the button ends in the card.
  const [cardTop, setCardTop] = useState(0),
    [buttonBottom, setButtonBottom] = useState(0);
  // The strip of cards ends with its dots: the half-open sheet shows the card in view whole.
  const [stripBottom, setStripBottom] = useState(0);
  useEffect(() => {
    if (chosen) { if (buttonBottom) onBookEdge?.(cardTop + buttonBottom); }
    else onBookEdge?.(full || !flats.length ? 0 : stripBottom);
  }, [cardTop, buttonBottom, chosen?.id, stripBottom, full, flats.length]);
  useEffect(() => () => onBookEdge?.(0), []);
  useEffect(() => () => clearTimeout(settle.current), []);
  // «Показы»: the card in view (every row of the full list) is counted for its owner, once for this answer.
  // Sent a little later and in one go, so swiping does not turn into a request per card.
  const viewTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const sendViews = () => {
    const ids = takeViews(shownLog);
    if (ids.length) background(() => request('/api/public/views', { ids })).catch(() => {});
  };
  useEffect(() => {
    // An opened place takes the strip's seat: then it is the one the guest sees.
    const onScreen = chosen ? [String(chosen.id)] : full ? list.map(flat => String(flat.id)) : list[index] ? [String(list[index].id)] : [];
    if (!noteViews(shownLog, String(preview.serverTime || ''), onScreen)) return;
    clearTimeout(viewTimer.current);
    viewTimer.current = setTimeout(sendViews, 2000);
  }, [preview.serverTime, index, full, listKey, chosen?.id]);
  useEffect(() => () => { clearTimeout(viewTimer.current); sendViews(); }, []);
  // The map follows once the swipe has stopped, not on every card that passes by.
  const scrolled = (x: number) => {
    const at = carouselIndex(x, step, list.length);
    if (at !== index) {
      if (at > index && Date.now() - arrived.current < GLANCE && (Number(list[index]?.estimate?.amount) || 0) > middle) setPricey(n => n + 1);
      arrived.current = Date.now();
      setIndex(at);
    }
    if (at > seen) setSeen(at);
    clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      if (list[at]) onFocus?.(list[at].id);
    }, 160);
  };
  // «Сейчас»: the time on the way comes first, it is what the guest decides by.
  const mark = (flat: Row) => (mine ? markLabel(markOf(flat.id, mine), ['banya', 'sauna', 'banquet', 'cafe'].includes(flat.details?.type)) : '');
  // «Заведение»: a hall says which venue it belongs to, when the venue has more than one hall and another name.
  const venueName = (flat: Row) => (flat.venue && Number(flat.venue.halls) > 1 && flat.venue.title !== flat.title ? String(flat.venue.title) : '');
  // The other free halls of the chosen one's venue: the guest switches between them without going back to the list.
  const otherHalls = (flat: Row) => (flat.venue ? flats.filter(x => x.id !== flat.id && x.venue?.id === flat.venue.id) : []);
  const quiet = draft.occasion === 'memorial';
  // A bath or a sauna: the total with its hours and the guests' surcharge beside it (audit of 2026-11-22).
  const bathSum = (flat: Row) => { const e = flat.estimate || {}, n = Number(e.periods) || 0, add = Number(e.surcharge) || 0; if (kindCategoryOf(flat.details?.type) !== 'bath' || e.billingMode !== 'hourly' || !n) return ''; return t('{n} ч × {rate}',{n,rate:money((Number(e.rate) || 0) - add)}) + (add ? ' + ' + t('{v} за гостей',{v:money(add * n)}) : ''); };
  // «Номера одного типа»: one card for many rooms alike, with how many of them are free at the asked time.
  const roomsLeft = (flat: Row) => (flat.units && Number(flat.units.total) > 1 ? (flat.units.free !== undefined ? t('Свободно номеров: {free} из {total}',{free:flat.units.free,total:flat.units.total}) : t('Номеров: {total}',{total:flat.units.total})) : '');
  const perGuest = (flat: Row) => (kindCategoryOf(flat.details?.type) === 'banquet' ? Number(flat.policy?.extra_guest_price) || 0 : 0);
  const least = (flat: Row) => Number(flat.policy?.included_guests) || 0;
  // With the arrival line the card says readiness itself, for the asked time; the general «готово» would repeat it.
  const reasonsOf = (flat: Row) => shownReasons(flat.match?.reasons, draft, kindCategoryOf(flat.details?.type) !== 'stay').filter(x => !(readiness?.(flat) && x === t('Готово к заселению')));
  const about = (flat: Row) => {
    const reasons = reasonsOf(flat);
    // A hall: the price per guest is what halls are compared by.
    if (perGuest(flat)) return [venueName(flat), mark(flat), t('{v} за гостя',{v:money(perGuest(flat))}), homeLine(flat), flat.district, ...reasons].filter(Boolean).join(' · ');
    return (draft.now ? [...reasons.slice(0, 1), venueName(flat), mark(flat), homeLine(flat), flat.district, ...reasons.slice(1)] : [venueName(flat), mark(flat), homeLine(flat), flat.district, ...reasons]).filter(Boolean).join(' · ');
  };

  const ready = (flat: Row, long = false) => {
    const said = readiness?.(flat);
    return said ? <Text numberOfLines={long ? 2 : 1} style={[r.ready, said.check && r.readyCheck]}>{said.check ? (long ? said.text : t('Уточняем готовность')) : '✓ ' + said.text}</Text> : null;
  };

  if (!flats.length) {
    const answer = emptyAnswer(preview.empty, draft, !!onWiden), way = answer.action;
    // The way out says how many places it opens, when the server counted them.
    const opens = way && (preview.empty?.reason === 'now' || (preview.empty?.reason === 'filters' && preview.empty?.blocker)) ? Number(preview.empty?.count) || 0 : 0;
    return (
      <><Text accessibilityRole="header" style={h.cardTitle}>{answer.title}</Text><Text style={h.note}>{answer.note}</Text>{!!way && !!onTry && <Action title={busy ? t('Ищем…') : way.title + (opens ? ' · ' + opens : '')} disabled={busy} onPress={() => onTry(way.patch)} />}{!way && !!onWiden && preview.empty?.reason !== 'city' && <Action title={busy ? t('Ищем…') : t('Искать без этих условий')} disabled={busy} onPress={onWiden} />}<Action secondary title={t('Изменить условия')} disabled={busy} onPress={onRefine} /></>
    );
  }

  if (chosen) {
    // The name, the price and the way to book come first, so they are on screen in the half-open sheet;
    // the photo and the rest are below.
    return (
      <Rise key={chosen.id} onTop={setCardTop}><Pressable accessibilityRole="button" accessibilityLabel={t('Все варианты')} onPress={() => onSelect('')} style={({ pressed }) => [r.back, pressed && h.dim]}><Image source={chevron} style={r.backIcon} accessibilityIgnoresInvertColors /><Text style={r.backText}>{flats.length > 1 ? t('Все варианты · {length}',{length:flats.length}) : t('К вариантам')}</Text></Pressable><View style={r.chosen}><View style={h.grow}>{!!chosen.match?.best && <Text style={r.best}>{quiet ? t('Подходит лучше других') : t('Лучший выбор для вас')}</Text>}<Text accessibilityRole="header" numberOfLines={2} style={h.cardTitle}>{chosen.title}</Text>{ready(chosen, true)}{!!about(chosen) && (
              <Text numberOfLines={2} style={h.note}>{about(chosen)}</Text>
            )}</View>{!!mine && !!onFavorite && <Heart on={mine.favorites.includes(chosen.id)} title={chosen.title} onPress={() => onFavorite(chosen.id)} />}<View style={r.amount}><Text style={h.price}>{money(chosen.estimate.amount)}</Text><Text style={h.note}>{t('за {stay}',{stay:stayWords(draft)})}{chosen.estimate.billingMode === 'nightly' ? t(' · ночная цена') : ''}</Text>{!!windowBadge(chosen.estimate.window) && <Text style={r.window}>{windowBadge(chosen.estimate.window)}</Text>}{!!chosen.estimate.deal && <Text style={r.deal}>{t('Цена выгодная')}</Text>}</View></View>{otherHalls(chosen).length > 0 && (
          <View style={r.halls}><Text style={r.hallsTitle}>{t('Ещё свободные залы')}{chosen.venue?.title ? ' · ' + chosen.venue.title : ''}</Text><View style={r.hallsRow}>{otherHalls(chosen).map(x => (
                <Pressable key={x.id} accessibilityRole="button" accessibilityLabel={t('Зал: {title}, до {capacity} гостей, {v}',{title:x.title,capacity:x.capacity,v:money(x.estimate.amount)})} disabled={busy} onPress={() => { onFocus?.(x.id); onSelect(x.id); }} style={({ pressed }) => [r.hall, pressed && h.dim]}><Text numberOfLines={1} style={r.hallName}>{x.title}</Text><Text numberOfLines={1} style={r.hallMeta}>{t('до {n}',{n:x.capacity})} · {money(x.estimate.amount)}</Text></Pressable>
              ))}</View></View>
        )}{perGuest(chosen) > 0 && (
          <View style={r.halls}><Text style={r.hallsTitle}>{t('{sum} за гостя',{sum:money(perGuest(chosen))})}{least(chosen) > 1 ? ' · ' + t('заказ от {guests}',{guests:least(chosen) + ' ' + plural(least(chosen), 'гостя', 'гостей', 'гостей')}) : ''}</Text>{draft.guests < least(chosen) && <Text style={h.note}>{t('У вас гостей меньше: цена как за {n}.',{n:least(chosen)})}</Text>}{!!chosen.details?.menu && <Text style={h.note}>{t('Меню: {v}',{v:String(chosen.details.menu)})}</Text>}<Text style={h.note}>{t('При отмене вся оплата возвращается.')}</Text></View>
        )}{!!chosen.host && <View style={{ marginBottom: 12 }}><ReliabilityBadge value={chosen.host} title={t('Владелец')} subtleAttention /></View>}<View onLayout={e => setButtonBottom(Math.round(e.nativeEvent.layout.y + e.nativeEvent.layout.height))}><Action title={t('Забронировать')} disabled={busy} onPress={() => onBook(chosen)} /></View>{askFirst(chosen) && <Text style={h.note}>{t('Спросим владельца и ещё двух подходящих: ответ за 2 минуты, без вашего имени и телефона. Бронь создаётся после вашего подтверждения.')}</Text>}{!!chosen.photos?.[0] && <Photo id={chosen.photos[0]} alt={t('{title}, фото',{title:chosen.title})} />}<Action secondary title={kindCategoryOf(chosen.details?.type) === 'banquet' ? t('Подробнее о зале') : kindCategoryOf(chosen.details?.type) === 'bath' ? t('Подробнее') : t('Подробнее о жилье')} disabled={busy} onPress={() => onOpen(chosen)} /></Rise>
    );
  }

  const why = (flat: Row) => reasonsOf(flat).slice(0, 3).join(' · ');
  const what = (flat: Row) => [venueName(flat), mark(flat), perGuest(flat) ? t('{v} за гостя',{v:money(perGuest(flat))}) : '', bathSum(flat), roomsLeft(flat), homeLine(flat), bathSum(flat) ? '' : flat.district].filter(Boolean).join(' · ');
  const bestWords = quiet ? t('Подходит лучше других') : t('✦ Лучший выбор');
  const trail = steps.length > 0 && !!onBack && <HelperTrail words={stepWords(steps, draft)} count={flats.length + ' ' + plural(flats.length, 'вариант', 'варианта', 'вариантов')} onBack={onBack} busy={busy} />;
  const tips = <GuestHelpers helpers={helpers} busy={busy} onPress={helper => onStep?.(helper.id, list[index]?.id || '')} />;

  if (full) {
    // Every found place at once: the guest who wants the whole list pulls the sheet up.
    return (
      <>{trail}{tips}<Text accessibilityRole="header" style={h.cardTitle}>{t('Свободно на {stay}: {n}',{stay:stayWords(draft),n:flats.length})}</Text><View>{list.map(flat => (
            <Pressable key={flat.id} accessibilityRole="button" accessibilityLabel={flat.title + ', ' + money(flat.estimate.amount)} onPress={() => { onFocus?.(flat.id); onSelect(flat.id); }} style={({ pressed }) => [r.line, pressed && r.cardPressed]}><View style={r.lineThumb}><Photo id={flat.photos?.[0]} alt={t('{title}, фото',{title:flat.title})} fill /></View><View style={h.grow}><View style={r.cardTop}><Text numberOfLines={1} style={[h.eventTitle, h.grow]}>{flat.title}</Text><Text style={h.rowPrice}>{money(flat.estimate.amount)}</Text></View><Text numberOfLines={1} style={h.note}>{what(flat) || t('за {v}',{v:stayWords(draft)})}</Text>{ready(flat)}{!!why(flat) && <Text numberOfLines={1} style={r.why}>{why(flat)}</Text>}</View></Pressable>
          ))}</View></>
    );
  }

  return (
    <View style={r.strip} onLayout={e => setStripBottom(Math.round(e.nativeEvent.layout.y + e.nativeEvent.layout.height))}>{trail}{tips}<View style={r.counter}><Text accessibilityRole="header" style={h.cardTitle}>{list.length > 1 ? t('{v} из {length}',{v:(index + 1),length:list.length}) : t('Свободно на {v}',{v:stayWords(draft)})}</Text>{list.length > 1 && <Text style={h.note}>{t('на {stay}',{stay:stayWords(draft)})}</Text>}</View><ScrollView
        ref={strip}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={step}
        decelerationRate="fast"
        disableIntervalMomentum
        scrollEventThrottle={32}
        onScroll={e => scrolled(e.nativeEvent.contentOffset.x)}
        style={r.carousel}
        contentContainerStyle={r.carouselContent}
      >{list.map((flat, i) => (
          <Pressable
            key={flat.id}
            accessibilityRole="button"
            accessibilityLabel={(flat.match?.best ? (quiet ? t('Подходит лучше других. ') : t('Лучший выбор для вас. ')) : '') + flat.title + ', ' + money(flat.estimate.amount)}
            onPress={() => {
              // The map flies to the chosen card's pin, even when the swipe that showed it has not settled yet.
              clearTimeout(settle.current);
              setIndex(i);
              onFocus?.(flat.id);
              onSelect(flat.id);
            }}
            style={({ pressed }) => [r.card, { width: card }, i === index && r.cardInView, pressed && r.cardPressed]}
          ><View style={r.cardRow}><View style={r.cardPhoto}><Photo id={Math.abs(i - index) <= 2 || i <= seen + 2 ? flat.photos?.[0] : null} alt={t('{title}, фото',{title:flat.title})} fill />{!!mine && !!onFavorite && <View style={r.heartOnPhoto}><Heart on={mine.favorites.includes(flat.id)} title={flat.title} onPress={() => onFavorite(flat.id)} /></View>}</View><View style={r.cardBody}>{!!flat.match?.best && <Text style={r.bestTag}>{bestWords}</Text>}<Text numberOfLines={1} style={h.eventTitle}>{flat.title}</Text>{ready(flat)}<Text numberOfLines={1} style={h.note}>{what(flat) || t('за {v}',{v:stayWords(draft)})}</Text><View style={r.priceRow}><Text style={h.rowPrice}>{money(flat.estimate.amount)}</Text>{!!flat.estimate.window && <Text style={r.window}>−{flat.estimate.window.percent}%</Text>}{!!flat.estimate.deal && <Text style={r.deal}>{t('Цена выгодная')}</Text>}</View></View></View>{/* Why this place answers the request, in the guest's own conditions. */}{!!why(flat) && <Text numberOfLines={1} style={r.why}>{why(flat)}</Text>}{/* Two taps to a booking: this button, then «Отправить заявку» on the check of the booking. */}<Pressable accessibilityRole="button" accessibilityLabel={t('Забронировать: {title}',{title:flat.title})} disabled={busy} onPress={() => onBook(flat)} style={({ pressed }) => [r.book, (pressed || busy) && h.dim]}><Text style={r.bookText}>{t('Забронировать')}</Text></Pressable></Pressable>
        ))}</ScrollView>{list.length > 1 && (
        <View style={r.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{Array.from({ length: Math.min(DOTS, list.length) }, (_, i) => {
            // More cards than dots: the dots follow the card in view like a window over the strip.
            const first = Math.max(0, Math.min(list.length - DOTS, index - Math.floor(DOTS / 2)));
            return <View key={i} style={[r.dot, first + i === index && r.dotOn]} />;
          })}</View>
      )}</View>
  );
}

const r = StyleSheet.create({
  halls: { gap: 8, marginBottom: 12 },
  hallsTitle: { ...type.caption, color: C.muted, fontWeight: '600' },
  hallsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  hall: { minHeight: T.control.touch, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: T.radius.md, borderWidth: 1, borderColor: C.lineStrong, backgroundColor: C.surface, maxWidth: '100%' },
  hallName: { ...type.label, color: C.ink, fontWeight: '600' },
  hallMeta: { ...type.caption, color: C.muted },
  carousel: { marginHorizontal: -16, marginBottom: 4 },
  carouselContent: { paddingHorizontal: 16, gap: GAP },
  card: { borderRadius: T.radius.lg, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, overflow: 'hidden', padding: 12, gap: 8 },
  cardInView: { borderColor: C.accent, borderWidth: 2 },
  cardPressed: { opacity: 0.85 },
  cardRow: { flexDirection: 'row', gap: 12 },
  cardPhoto: { width: 88, height: 88, borderRadius: T.radius.md, overflow: 'hidden', backgroundColor: C.surfaceAlt },
  bestTag: { ...type.caption, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: T.radius.full, overflow: 'hidden', backgroundColor: C.aiFrom, color: C.onAccent, fontWeight: '600' },
  heartOnPhoto: { position: 'absolute', right: 2, top: 2 },
  cardBody: { flex: 1, minWidth: 0, gap: 2, justifyContent: 'center' },
  priceRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 8 },
  why: { ...type.caption, color: C.muted, fontWeight: '600' },
  ready: { ...type.caption, color: C.success, fontWeight: '600' },
  readyCheck: { color: C.warning },
  strip: { gap: 12 },
  counter: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 4 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.lineStrong },
  dotOn: { width: 18, backgroundColor: C.accent },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  lineThumb: { width: 56, height: 56, borderRadius: T.radius.md, overflow: 'hidden', backgroundColor: C.surfaceAlt },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badges: { flexDirection: 'row', gap: 8 },
  back: { minHeight: T.control.touch, flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingRight: 12 },
  backIcon: { width: 16, height: 16, tintColor: C.accent, transform: [{ rotate: '180deg' }] },
  backText: { ...type.label, color: C.accent, fontWeight: '600' },
  chosen: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  amount: { alignItems: 'flex-end' },
  best: { ...type.caption, alignSelf: 'flex-start', marginBottom: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: T.radius.full, overflow: 'hidden', backgroundColor: C.accentSoft, color: C.accent, fontWeight: '600' },
  deal: { ...type.caption, marginTop: 4, color: C.muted },
  window: { ...type.caption, marginTop: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: T.radius.full, overflow: 'hidden', backgroundColor: C.accentSoft, color: C.accent, fontWeight: '600' },
  book: { minHeight: 40, borderRadius: T.radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: C.accent },
  bookText: { ...type.label, color: C.onAccent, fontWeight: '600' }
});
