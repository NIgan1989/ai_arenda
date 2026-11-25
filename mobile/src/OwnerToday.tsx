import React, { useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { ownerThreads, threadClock, type ProcessThread } from '../../lib/process-threads';
import { t as tr } from '../../lib/i18n';
import { menuIcons } from './AccountRows';
import type { FeedNeed } from './AutopilotThreads';
import { C, type } from './styles';
import { T } from './tokens';

type Row = Record<string, any>;
type Tab = 'today' | 'soon' | 'all';
type Props = { data: Row; now: number; needs?: FeedNeed[]; onOpen: (kind: 'booking' | 'job', id: string) => void };

const ZONE = 5 * 3600, DAY = 86400;
const dayOf = (at: number) => Math.floor((at + ZONE) / DAY);
const FOLDED = 5;

// «2 заезда», «1 уборка»: Russian has three forms, the other languages take the row of i18n.
function count(n: number, one: string, few: string, many: string) {
  const ten = n % 10, hundred = n % 100;
  const word = ten === 1 && hundred !== 11 ? one : ten >= 2 && ten <= 4 && (hundred < 12 || hundred > 14) ? few : many;
  return n + ' ' + tr(word);
}

// The time of what happens next in the deal: the step under way, else its start.
const whenOf = (t: ProcessThread) => Number(t.steps[t.current]?.at) || t.at;

// The left column of a row: the clock today, «завтра», or the date.
function timeLabel(at: number, now: number) {
  const ahead = dayOf(at) - dayOf(now);
  if (ahead === 0) return threadClock(at);
  if (ahead === 1) return tr('завтра');
  if (ahead === -1) return tr('вчера');
  const d = new Date((at + ZONE) * 1000);
  return d.getUTCDate() + '.' + String(d.getUTCMonth() + 1).padStart(2, '0');
}

// «Сегодня» of the owner, as in the concept of 2026-11-25: on top in big letters what the day holds, under it one
// feed of the day by time. What waits for the owner is framed in gold with one button; the rest the autopilot does.
export function OwnerToday({ data, now, needs = [], onOpen }: Props) {
  const [tab, setTab] = useState<Tab>('today');
  const [all, setAll] = useState(false);
  // A week and a day ahead, so «Скоро» holds the whole next week; «Сегодня» and «Все» cut it themselves.
  const threads = useMemo(() => ownerThreads(data, now, 8 * DAY), [data, now]);
  const today = dayOf(now);
  const live = threads.filter(t => !t.finished);
  const arrivals = live.filter(t => t.kind === 'booking' && t.tag === 'Бронь' && dayOf(t.at) === today).length;
  const cleanings = live.filter(t => t.kind === 'job' && dayOf(t.at) === today).length;
  const yours = threads.filter(t => t.yours);
  const asks = needs.length + yours.length;
  const calm = threads.filter(t => !t.yours).sort((a, b) => whenOf(a) - whenOf(b));
  const dayIn = (t: ProcessThread, id: Tab) => { const day = dayOf(whenOf(t)); return id === 'today' ? day <= today : day > today && day <= today + 7; };
  const inTab = (t: ProcessThread) => tab === 'all' || dayIn(t, tab);
  const shown = calm.filter(inTab);
  const rows = all ? shown : shown.slice(0, FOLDED);
  const parts = [arrivals ? count(arrivals, 'заезд', 'заезда', 'заездов') : '', cleanings ? count(cleanings, 'уборка', 'уборки', 'уборок') : ''].filter(Boolean);
  const todayCount = calm.filter(t => dayIn(t, 'today')).length + asks, soonCount = calm.filter(t => dayIn(t, 'soon')).length;
  const tabButton = (id: Tab, title: string, n?: number) => (
    <Pressable key={id} accessibilityRole="tab" accessibilityState={{ selected: tab === id }} onPress={() => { setTab(id); setAll(false); }} style={[o.tab, tab === id && o.tabOn]}>
      <Text style={[o.tabText, tab === id && o.tabTextOn]}>{title}{n ? ' · ' + n : ''}</Text>
    </Pressable>
  );
  return (
    <View style={o.box} accessibilityLabel={tr('Сегодня')}>
      {/* As Airbnb's «Today» for hosts: no big headline, two pills and the feed; the day's sum is one quiet line. */}
      <View style={o.tabs} accessibilityRole="tablist">{tabButton('today', tr('Сегодня'), todayCount)}{tabButton('soon', tr('Скоро'), soonCount)}{tabButton('all', tr('Все'))}</View>
      <Text style={o.lead}>{[parts.join(' · ') || tr('Сегодня спокойно'), asks ? tr('нужны вы: {n}', { n: asks }) : tr('остальное ведёт автопилот')].join(' · ')}</Text>
      {needs.map(n => (
        <View key={n.key} style={[o.row, o.rowYours]} accessibilityLabel={tr('Ждёт вас: {title}. {line}', { title: n.title, line: n.line })}>
          <Text style={[o.time, o.timeNow]}>{tr('сейчас')}</Text>
          <View style={o.text}><Text numberOfLines={1} style={o.rowTitle}>{n.title}</Text><Text numberOfLines={2} style={o.line}>{n.line}</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel={n.action + ': ' + n.title} onPress={n.onPress} style={({ pressed }) => [o.answer, pressed && o.pressed]}><Text style={o.answerText}>{n.action}</Text></Pressable>
        </View>
      ))}
      {yours.map(t => (
        <View key={t.kind + t.id} style={[o.row, o.rowYours]}>
          <Text style={[o.time, o.timeNow]}>{tr('сейчас')}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={tr(t.tag) + ' ' + t.title + '. ' + t.line} onPress={() => onOpen(t.kind, t.id)} style={o.text}><Text numberOfLines={1} style={o.rowTitle}>{t.kind === 'booking' && t.tag === 'Бронь' && t.current === 0 ? tr('Заявка') : tr(t.tag)} · {t.title}</Text><Text numberOfLines={2} style={o.line}>{t.line}</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={tr('Решить: {tag} {title}', { tag: tr(t.tag), title: t.title })} onPress={() => onOpen(t.kind, t.id)} style={({ pressed }) => [o.answer, pressed && o.pressed]}><Text style={o.answerText}>{t.kind === 'booking' && t.tag === 'Бронь' && t.current === 0 ? tr('Ответить') : tr('Решить')}</Text></Pressable>
        </View>
      ))}
      {rows.map(t => {
        const step = t.steps[t.current];
        const word = t.finished ? tr('Готово') : step?.label || tr(t.tag);
        return (
          <Pressable key={t.kind + t.id} accessibilityRole="button" accessibilityLabel={word + ' ' + t.title + '. ' + t.line} onPress={() => onOpen(t.kind, t.id)} style={({ pressed }) => [o.row, pressed && o.pressed]}>
            <Text style={o.time}>{timeLabel(whenOf(t), now)}</Text>
            <View style={[o.icon, t.kind === 'job' && o.iconJob]}><Image source={t.kind === 'job' ? menuIcons.sparkles : t.tag === 'Возврат' ? menuIcons.wallet : menuIcons.key} style={[o.iconImage, t.kind === 'job' && o.iconImageJob]} /></View>
            <View style={o.text}><Text numberOfLines={1} style={o.rowTitle}>{word} · {t.title}</Text><Text numberOfLines={2} style={o.line}>{t.line}</Text></View>
          </Pressable>
        );
      })}
      {!rows.length && !needs.length && !yours.length && <Text style={o.empty}>{tab === 'soon' ? tr('На неделю вперёд пока пусто') : tr('Броней и уборок сейчас нет')}</Text>}
      {shown.length > FOLDED && <Pressable accessibilityRole="button" onPress={() => setAll(v => !v)} style={o.more}><Text style={o.moreText}>{all ? tr('Свернуть') : tr('Ещё {n}', { n: shown.length - FOLDED })}</Text></Pressable>}
    </View>
  );
}

const o = StyleSheet.create({
  box: { gap: 8 },
  title: { ...type.title, fontSize: 28, lineHeight: 34, fontWeight: '800', color: C.ink },
  titleAccent: { color: C.accent },
  lead: { ...type.label, color: C.muted },
  tabs: { flexDirection: 'row', gap: 8, marginTop: 4 },
  tab: { minHeight: 40, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', borderRadius: T.radius.full, backgroundColor: C.surfaceAlt },
  tabOn: { backgroundColor: C.ink },
  tabText: { ...type.label, color: C.ink, fontWeight: '600' },
  tabTextOn: { color: C.surface },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 8, paddingHorizontal: 12, borderRadius: T.radius.lg, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line },
  rowYours: { borderWidth: 2, borderColor: C.gold },
  time: { ...type.caption, width: 48, color: C.muted, fontWeight: '600', fontVariant: ['tabular-nums'] },
  timeNow: { color: C.ink },
  icon: { width: 40, height: 40, borderRadius: T.radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: C.accentSoft },
  iconJob: { backgroundColor: C.successSoft },
  iconImage: { width: 20, height: 20, tintColor: C.accent },
  iconImageJob: { tintColor: C.success },
  text: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { ...type.body, color: C.ink, fontWeight: '700' },
  line: { ...type.caption, color: C.muted },
  answer: { minHeight: 40, paddingHorizontal: 16, borderRadius: T.radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: C.accent },
  answerText: { ...type.label, color: C.onAccent, fontWeight: '700' },
  pressed: { opacity: 0.7 },
  empty: { ...type.label, color: C.muted, paddingVertical: 8 },
  more: { minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  moreText: { ...type.label, color: C.accent, fontWeight: '600' },
});
