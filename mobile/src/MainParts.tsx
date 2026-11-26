import React, { type ReactNode } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { t as tr } from '../../lib/i18n';
import { menuIcons, type MenuIcon } from './AccountRows';
import { Photo } from './ListingMedia';
import { C, type } from './styles';
import { T } from './tokens';

// The parts of the one main screen of every role (concept «Один стандарт главного экрана», 2026-11-26,
// mobbin/main-standard): under the AI line the «Сейчас» card with one deal and one dark button, under it one line;
// the opened sheet shows the day as times on one rail; the objects are rows with a dot of their state; a chosen pin
// is one row with «Открыть», as the guest's. Black and white: colour is only in the small dots.

export type Dot = 'ok' | 'wait' | 'alert' | 'calm' | 'ink';
const DOT: Record<Dot, string> = { ok: C.success, wait: C.gold, alert: C.danger, calm: C.lineStrong, ink: C.ink };

// «Сейчас · гость ждёт ответа» with a dot, the time left on the right, the deal in large letters, one line, the buttons.
export function NowFrame({ dot = 'ink', kicker, timer, title, line, label, children }: { dot?: Dot; kicker: string; timer?: string; title: string; line?: string; label?: string; children?: ReactNode }) {
  return (
    <View style={m.now} accessibilityLabel={label}>
      <View style={m.kick}><View style={[m.dot, { backgroundColor: DOT[dot] }]} /><Text numberOfLines={1} style={m.kickText}>{kicker}</Text>{!!timer && <Text style={m.timer} accessibilityLabel={tr('Осталось {v}', { v: timer })}>{timer}</Text>}</View>
      <Text numberOfLines={2} style={m.nowTitle}>{title}</Text>
      {!!line && <Text numberOfLines={2} style={m.nowLine}>{line}</Text>}
      {children}
    </View>
  );
}

// The one dark button of the card, and the quiet word under a swipe («Отказать», «Пропустить»).
export function DarkButton({ title, onPress, disabled = false, small = false }: { title: string; onPress: () => void; disabled?: boolean; small?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [small ? m.small : m.dark, (pressed || disabled) && m.dim]}><Text numberOfLines={1} style={small ? m.smallText : m.darkText}>{title}</Text></Pressable>;
}
export function QuietButton({ title, onPress, disabled = false }: { title: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={disabled} onPress={onPress} style={({ pressed }) => [m.quiet, (pressed || disabled) && m.dim]}><Text style={m.quietText}>{title}</Text></Pressable>;
}

// The one line under the card: «Сегодня · 2 заезда · 1 уборка ›», «Мой день · 2 уборки · 6 000 ₸ ›».
export function DayLine({ icon, title, value, onPress, label, border = true }: { icon: MenuIcon; title: string; value?: string; onPress: () => void; label?: string; border?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label || [title, value].filter(Boolean).join(': ')} onPress={onPress} style={({ pressed }) => [m.line, border && m.lineTop, pressed && m.dim]}>
      <Image source={menuIcons[icon]} style={m.lineIcon} />
      <Text numberOfLines={1} style={m.lineTitle}>{title}</Text>
      {!!value && <Text numberOfLines={1} style={m.lineValue}>{value}</Text>}
      <Image source={menuIcons.chevron} style={m.chev} />
    </Pressable>
  );
}

// A heading of a block in the sheet: «Мои объекты · 5» with «Все ›» on the right.
export function BlockHead({ title, more, onMore }: { title: string; more?: string; onMore?: () => void }) {
  return (
    <View style={m.head}><Text accessibilityRole="header" numberOfLines={1} style={m.headTitle}>{title}</Text>{!!more && !!onMore && <Pressable accessibilityRole="button" accessibilityLabel={more} onPress={onMore} hitSlop={8}><Text style={m.headMore}>{more} ›</Text></Pressable>}</View>
  );
}

// One moment of the day on the rail, as the steps of Careem and the stops of Waymo: the time on the left, a dot on the
// line (filled where the person is needed or the stop is next), the name and one line, one small dark button.
export function TimeRow({ time, title, line, now = false, last = false, button, onButton, busy = false, onPress, label }: { time: string; title: string; line?: string; now?: boolean; last?: boolean; button?: string; onButton?: () => void; busy?: boolean; onPress?: () => void; label?: string }) {
  const body = <><Text numberOfLines={1} style={m.rowTitle}>{title}</Text>{!!line && <Text numberOfLines={1} style={m.rowLine}>{line}</Text>}</>;
  return (
    <View style={m.row}>
      <Text numberOfLines={1} style={[m.time, now && m.timeNow]}>{time}</Text>
      <View style={m.rail}><View style={[m.railDot, now && m.railDotOn]} />{!last && <View style={m.railLine} />}</View>
      {onPress ? <Pressable accessibilityRole="button" accessibilityLabel={label || title + (line ? '. ' + line : '')} onPress={onPress} style={({ pressed }) => [m.rowText, pressed && m.dim]}>{body}</Pressable> : <View style={m.rowText}>{body}</View>}
      {!!button && !!onButton && <DarkButton small title={button} disabled={busy} onPress={onButton} />}
    </View>
  );
}

// An object of the owner: its photo, the name, a dot with its state, the price, a chevron.
export function PlaceRow({ photo, title, dot, state, price, onPress, label }: { photo?: string | null; title: string; dot: Dot; state: string; price?: string; onPress: () => void; label?: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label || title + '. ' + state} onPress={onPress} style={({ pressed }) => [m.place, pressed && m.dim]}>
      <View style={m.thumb}><Photo id={photo} fill alt={tr('Фото: {title}', { title })} /></View>
      <View style={m.placeText}><Text numberOfLines={1} style={m.rowTitle}>{title}</Text><View style={m.state}><View style={[m.dotSmall, { backgroundColor: DOT[dot] }]} /><Text numberOfLines={1} style={m.rowLine}>{state}</Text></View></View>
      {!!price && <Text numberOfLines={1} style={m.price}>{price}</Text>}
      <Image source={menuIcons.chevron} style={m.chev} />
    </Pressable>
  );
}

// A row of the sheet with an icon, as «Добавить жильё» and «Кто отвечает гостям · ИИ».
export function IconRow({ icon, title, value, onPress, label, right }: { icon: MenuIcon; title: string; value?: string; onPress: () => void; label?: string; right?: ReactNode }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label || [title, value].filter(Boolean).join(': ')} onPress={onPress} style={({ pressed }) => [m.line, m.lineTop, pressed && m.dim]}>
      <Image source={menuIcons[icon]} style={m.lineIcon} />
      <Text numberOfLines={1} style={m.lineTitle}>{title}</Text>
      {!!value && <Text numberOfLines={1} style={m.lineValue}>{value}</Text>}
      {right || <Image source={menuIcons.chevron} style={m.chev} />}
    </Pressable>
  );
}

// The chosen pin: the photo, the name, one line and «Открыть». The tabs of the object open after «Открыть».
export function PinRow({ photo, title, line, onOpen }: { photo?: string | null; title: string; line?: string; onOpen: () => void }) {
  return (
    <View style={m.pin}>
      <View style={m.pinThumb}><Photo id={photo} fill alt={tr('Фото: {title}', { title })} /></View>
      <View style={m.placeText}><Text numberOfLines={1} style={m.pinTitle}>{title}</Text>{!!line && <Text numberOfLines={1} style={m.rowLine}>{line}</Text>}</View>
      <Pressable accessibilityRole="button" accessibilityLabel={tr('Открыть: {title}', { title })} onPress={onOpen} style={({ pressed }) => [m.open, pressed && m.dim]}><Text style={m.openText}>{tr('Открыть')}</Text></Pressable>
    </View>
  );
}

const R = T.radius, H = T.control;
const m = StyleSheet.create({
  now: { gap: 4, padding: 16, borderRadius: R.xl, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line },
  kick: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  kickText: { flex: 1, minWidth: 0, ...type.caption, color: C.inkSoft, fontWeight: '600' },
  timer: { ...type.caption, color: C.goldInk, fontWeight: '700', backgroundColor: C.goldSoft, paddingHorizontal: 8, paddingVertical: 2, borderRadius: R.full, overflow: 'hidden', fontVariant: ['tabular-nums'] },
  nowTitle: { ...type.subtitle, color: C.ink, fontWeight: '800' },
  nowLine: { ...type.label, color: C.muted, marginBottom: 8 },
  dark: { minHeight: H.field, borderRadius: R.full, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, marginTop: 4 },
  darkText: { ...type.body, color: C.surface, fontWeight: '700' },
  small: { minHeight: 36, borderRadius: R.full, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  smallText: { ...type.label, color: C.surface, fontWeight: '700' },
  quiet: { minHeight: H.touch, alignItems: 'center', justifyContent: 'center' },
  quietText: { ...type.label, color: C.muted, fontWeight: '600' },
  dim: { opacity: 0.6 },
  line: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12 },
  lineTop: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line },
  lineIcon: { width: 20, height: 20, tintColor: C.ink },
  lineTitle: { ...type.body, color: C.ink, fontWeight: '600', flexShrink: 0 },
  lineValue: { flex: 1, minWidth: 0, textAlign: 'right', ...type.label, color: C.muted },
  chev: { width: 16, height: 16, tintColor: C.lineStrong, marginLeft: 'auto' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  headTitle: { flex: 1, minWidth: 0, ...type.subtitle, color: C.ink, fontWeight: '800' },
  headMore: { ...type.label, color: C.muted, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, minHeight: 56 },
  time: { width: 52, ...type.caption, color: C.muted, fontWeight: '600', paddingTop: 2, fontVariant: ['tabular-nums'] },
  timeNow: { color: C.ink },
  rail: { width: 14, alignItems: 'center', alignSelf: 'stretch', paddingTop: 4 },
  railDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: C.ink, backgroundColor: C.surface },
  railDotOn: { backgroundColor: C.ink },
  railLine: { flex: 1, width: 2, backgroundColor: C.line, marginTop: 2 },
  rowText: { flex: 1, minWidth: 0, gap: 1, paddingBottom: 12 },
  placeText: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { ...type.body, color: C.ink, fontWeight: '700' },
  rowLine: { ...type.caption, color: C.muted },
  place: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  thumb: { width: 48, height: 48, borderRadius: R.md, overflow: 'hidden', backgroundColor: C.surfaceAlt },
  state: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dotSmall: { width: 7, height: 7, borderRadius: 4 },
  price: { ...type.label, color: C.muted, fontVariant: ['tabular-nums'] },
  pin: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 },
  pinThumb: { width: 52, height: 52, borderRadius: R.md, overflow: 'hidden', backgroundColor: C.surfaceAlt },
  pinTitle: { ...type.body, color: C.ink, fontWeight: '700' },
  open: { minHeight: 40, paddingHorizontal: 16, borderRadius: R.full, borderWidth: 1, borderColor: C.lineStrong, alignItems: 'center', justifyContent: 'center' },
  openText: { ...type.label, color: C.ink, fontWeight: '700' },
});
