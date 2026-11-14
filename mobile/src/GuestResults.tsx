import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { plural } from '../../lib/map-search-request';
import { Photo } from './ListingMedia';
import { Action, h } from './SheetParts';
import { money, type Row } from './model';
import { windowBadge } from '../../lib/window-badge';
import { C, type } from './styles';
import { T } from './tokens';
import { ReliabilityBadge } from './Reliability';
import { draftUnits, shownReasons, type GuestDraft } from './ai-request';
import { carouselIndex } from './map-motion';

const chevron = require('../assets/ui/chevron.png');

type Props = {
  // The answer of /api/public/matching: flats that are free on these conditions, best first.
  preview: Row;
  // The conditions that were searched; the price of every flat is for this stay.
  draft: GuestDraft;
  selected: string;
  onSelect: (id: string) => void;
  // The card the guest has swiped to: its pin lifts and the map flies to it.
  onFocus?: (id: string) => void;
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

// The carousel: a card is a little narrower than the screen, so the next one peeks out and says «swipe».
const TOP = 3;
const GAP = 12,
  CARD_MAX = 300;

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
  const units = draftUnits(draft);
  return draft.mode === 'hourly' ? units + ' ' + plural(units, 'час', 'часа', 'часов') : units + ' ' + plural(units, 'сутки', 'суток', 'суток');
}

// What the guest sees after a search: a short list, then one flat with a way to book it and a way back.
export function GuestResults({ preview, draft, selected, onSelect, onFocus, onBook, onOpen, onRefine, onWiden, onAskOwners, onBookEdge, busy }: Props) {
  const flats: Row[] = preview.properties || [];
  const chosen = flats.find(flat => flat.id === selected);
  const width = useWindowDimensions().width,
    card = Math.min(CARD_MAX, width - 72),
    step = card + GAP;
  // index: the card in view; seen: the farthest card reached, so photos load only near what the guest has looked at.
  const [index, setIndex] = useState(0),
    [seen, setSeen] = useState(0);
  // The guest sees the three best first: the rest is one tap away, on the last card of the strip.
  const [all, setAll] = useState(false);
  useEffect(() => { setAll(false); }, [preview]);
  const list = all || flats.length <= TOP + 1 ? flats : flats.slice(0, TOP), rest = flats.length - list.length;
  const settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const strip = useRef<ScrollView>(null);
  // Back from a result: the carousel opens again on the card the guest was looking at, as the counter and the map say.
  useEffect(() => {
    if (!chosen && index) strip.current?.scrollTo({ x: index * step, animated: false });
  }, [!!chosen]);
  // «Забронировать» ends where the chosen card starts in the sheet plus where the button ends in the card.
  const [cardTop, setCardTop] = useState(0),
    [buttonBottom, setButtonBottom] = useState(0);
  useEffect(() => {
    if (chosen && buttonBottom) onBookEdge?.(cardTop + buttonBottom);
  }, [cardTop, buttonBottom, chosen?.id]);
  useEffect(() => () => clearTimeout(settle.current), []);
  // The map follows once the swipe has stopped, not on every card that passes by.
  const scrolled = (x: number) => {
    const at = carouselIndex(x, step, list.length);
    if (at !== index) setIndex(at);
    if (at > seen) setSeen(at);
    clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      if (list[at]) onFocus?.(list[at].id);
    }, 160);
  };
  const about = (flat: Row) => [flat.district, ...shownReasons(flat.match?.reasons, draft)].filter(Boolean).join(' · ');

  if (!flats.length) {
    return (
      <>
        <Text accessibilityRole="header" style={h.cardTitle}>
          На эти условия свободного жилья нет
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
      <Rise key={chosen.id} onTop={setCardTop}>
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
              <Text numberOfLines={2} style={h.note}>
                {about(chosen)}
              </Text>
            )}
          </View>
          <View style={r.amount}>
            <Text style={h.price}>{money(chosen.estimate.amount)}</Text>
            <Text style={h.note}>за {stayWords(draft)}</Text>
            {!!windowBadge(chosen.estimate.window) && <Text style={r.window}>{windowBadge(chosen.estimate.window)}</Text>}
            {!!chosen.estimate.deal && <Text style={r.deal}>Цена выгодная</Text>}
          </View>
        </View>
        {!!chosen.host && <View style={{ marginBottom: 12 }}><ReliabilityBadge value={chosen.host} title="Владелец" /></View>}
        <View onLayout={e => setButtonBottom(Math.round(e.nativeEvent.layout.y + e.nativeEvent.layout.height))}>
          <Action title="Забронировать" disabled={busy} onPress={() => onBook(chosen)} />
        </View>
        {!!chosen.photos?.[0] && <Photo id={chosen.photos[0]} alt={chosen.title + ', фото'} />}
        <Action secondary title="Подробнее о жилье" disabled={busy} onPress={() => onOpen(chosen)} />
      </Rise>
    );
  }

  return (
    <>
      <Text accessibilityRole="header" style={h.cardTitle}>
        {rest ? list.length + ' лучших из ' + flats.length + ' на ' + stayWords(draft) : 'Свободно на ' + stayWords(draft) + ': ' + flats.length}
      </Text>
      <ScrollView
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
      >
        {list.map((flat, i) => (
          <Pressable
            key={flat.id}
            accessibilityRole="button"
            accessibilityLabel={(flat.match?.best ? 'Лучший выбор для вас. ' : '') + flat.title + ', ' + money(flat.estimate.amount)}
            onPress={() => {
              // The map flies to the chosen card's pin, even when the swipe that showed it has not settled yet.
              clearTimeout(settle.current);
              setIndex(i);
              onFocus?.(flat.id);
              onSelect(flat.id);
            }}
            style={({ pressed }) => [r.card, { width: card }, i === index && r.cardInView, flat.match?.best && r.cardBest, pressed && r.cardPressed]}
          >
            <View style={r.cardPhoto}>
              <Photo id={i <= seen + 2 ? flat.photos?.[0] : null} alt={flat.title + ', фото'} fill />
              {!!flat.match?.best && <Text style={r.bestOnPhoto}>✦ Лучший выбор для вас</Text>}
            </View>
            <View style={r.cardBody}>
              <View style={r.cardTop}>
                <Text numberOfLines={1} style={[h.eventTitle, h.grow]}>
                  {flat.title}
                </Text>
                <Text style={h.rowPrice}>{money(flat.estimate.amount)}</Text>
              </View>
              <Text numberOfLines={1} style={h.note}>
                {about(flat) || 'за ' + stayWords(draft)}
              </Text>
              {(!!flat.estimate.window || !!flat.estimate.deal) && (
                <View style={r.badges}>
                  {!!flat.estimate.window && <Text style={r.window}>−{flat.estimate.window.percent}%</Text>}
                  {!!flat.estimate.deal && <Text style={r.deal}>Цена выгодная</Text>}
                </View>
              )}
              {/* Two taps to a booking: this button, then «Отправить заявку» on the check of the booking. */}
              <Pressable accessibilityRole="button" accessibilityLabel={'Забронировать: ' + flat.title} disabled={busy} onPress={() => onBook(flat)} style={({ pressed }) => [r.book, (pressed || busy) && h.dim]}>
                <Text style={r.bookText}>Забронировать</Text>
              </Pressable>
            </View>
          </Pressable>
        ))}
        {rest > 0 && (
          <Pressable accessibilityRole="button" accessibilityLabel={'Показать ещё ' + rest} onPress={() => setAll(true)} style={({ pressed }) => [r.card, r.moreCard, pressed && r.cardPressed]}>
            <Text style={r.moreCount}>+{rest}</Text>
            <Text style={r.moreText}>Ещё {rest} {rest % 10 === 1 && rest % 100 !== 11 ? 'вариант' : rest % 10 > 1 && rest % 10 < 5 && !(rest % 100 > 11 && rest % 100 < 15) ? 'варианта' : 'вариантов'}</Text>
          </Pressable>
        )}
      </ScrollView>
      {!!onAskOwners && (
        <>
          <Text style={h.note}>Владельцы получат даты, число гостей и сумму, без вашего имени и телефона.</Text>
          <Action secondary title={busy ? 'Отправляем…' : 'Спросить владельцев'} disabled={busy} onPress={onAskOwners} />
        </>
      )}
    </>
  );
}

const r = StyleSheet.create({
  carousel: { marginHorizontal: -16, marginTop: 8, marginBottom: 12 },
  carouselContent: { paddingHorizontal: 16, gap: GAP },
  card: { borderRadius: T.radius.lg, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, overflow: 'hidden' },
  cardInView: { borderColor: C.accentLine },
  cardBest: { borderColor: C.aiFrom, borderWidth: 2 },
  cardPressed: { opacity: 0.85 },
  cardPhoto: { height: 112, backgroundColor: C.surfaceAlt },
  bestOnPhoto: { ...type.caption, position: 'absolute', left: 8, top: 8, paddingHorizontal: 8, paddingVertical: 2, borderRadius: T.radius.full, overflow: 'hidden', backgroundColor: C.aiFrom, color: C.onAccent, fontWeight: '600' },
  cardBody: { padding: 12, gap: 4 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badges: { flexDirection: 'row', gap: 8 },
  back: { minHeight: T.control.touch, flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingRight: 12 },
  backIcon: { width: 16, height: 16, tintColor: C.accent, transform: [{ rotate: '180deg' }] },
  backText: { ...type.label, color: C.accent, fontWeight: '600' },
  chosen: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  amount: { alignItems: 'flex-end' },
  best: { ...type.caption, alignSelf: 'flex-start', marginBottom: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: T.radius.full, overflow: 'hidden', backgroundColor: C.accentSoft, color: C.accent, fontWeight: '600' },
  deal: { ...type.caption, marginTop: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: T.radius.full, overflow: 'hidden', backgroundColor: C.successSoft, color: C.success, fontWeight: '600' },
  window: { ...type.caption, marginTop: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: T.radius.full, overflow: 'hidden', backgroundColor: C.accentSoft, color: C.accent, fontWeight: '600' },
  book: { minHeight: 36, marginTop: 8, borderRadius: T.radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: C.accent },
  bookText: { ...type.label, color: C.onAccent, fontWeight: '600' },
  moreCard: { width: 132, alignItems: 'center', justifyContent: 'center', gap: 4, padding: 12, backgroundColor: C.accentSoft, borderColor: C.accentLine },
  moreCount: { ...type.title, color: C.accent, fontWeight: '700' },
  moreText: { ...type.label, color: C.accent, fontWeight: '600', textAlign: 'center' }
});
