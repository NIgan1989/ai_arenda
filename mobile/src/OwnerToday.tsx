import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ownerThreads, threadClock, type ProcessThread } from '../../lib/process-threads';
import { t as tr } from '../../lib/i18n';
import { TimeRow } from './MainParts';
import type { FeedNeed } from './AutopilotThreads';
import { C, type } from './styles';
import { T } from './tokens';

type Row = Record<string, any>;
type Tab = 'today' | 'soon' | 'all';
// view: the tab is chosen outside (the one row of tabs of the opened sheet, 2026-11-27); the own pills are hidden then.
type Props = { data: Row; now: number; needs?: FeedNeed[]; view?: 'today' | 'soon'; onOpen: (kind: 'booking' | 'job', id: string) => void };

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
export function timeLabel(at: number, now: number) {
  const ahead = dayOf(at) - dayOf(now);
  if (ahead === 0) return threadClock(at);
  if (ahead === 1) return tr('завтра');
  if (ahead === -1) return tr('вчера');
  const d = new Date((at + ZONE) * 1000);
  return d.getUTCDate() + '.' + String(d.getUTCMonth() + 1).padStart(2, '0');
}

// What the owner's day holds, for the one line under the «Сейчас» card: «2 заезда · 1 уборка», and how many things wait.
export function ownerDay(data: Row, now: number) {
  const threads = ownerThreads(data, now, 8 * DAY), today = dayOf(now), live = threads.filter(t => !t.finished);
  const arrivals = live.filter(t => t.kind === 'booking' && t.tag === 'Бронь' && dayOf(t.at) === today).length;
  const cleanings = live.filter(t => t.kind === 'job' && dayOf(t.at) === today).length;
  const parts = [arrivals ? count(arrivals, 'заезд', 'заезда', 'заездов') : '', cleanings ? count(cleanings, 'уборка', 'уборки', 'уборок') : ''].filter(Boolean);
  return { line: parts.join(' · ') || tr('спокойно'), yours: threads.filter(t => t.yours), cleanings: live.filter(t => t.kind === 'job').length };
}

// «Сегодня» of the owner (concept «Один стандарт», 2026-11-26): two pills as Airbnb's «Today» for hosts, one quiet line
// of the day's sum, then the day by time on one rail. Where the owner is needed the dot is filled and the row has one
// small dark button; the rest the autopilot does.
export function OwnerToday({ data, now, needs = [], view, onOpen }: Props) {
  const [own, setTab] = useState<Tab>('today');
  const tab: Tab = view || own;
  const [all, setAll] = useState(false);
  // A week and a day ahead, so «Скоро» holds the whole next week; «Сегодня» and «Все» cut it themselves.
  const threads = useMemo(() => ownerThreads(data, now, 8 * DAY), [data, now]);
  const today = dayOf(now);
  const live = threads.filter(t => !t.finished);
  const arrivals = live.filter(t => t.kind === 'booking' && t.tag === 'Бронь' && dayOf(t.at) === today).length;
  const cleanings = live.filter(t => t.kind === 'job' && dayOf(t.at) === today).length;
  // In the outer «Скоро» what waits for the owner now stays in «Сегодня», where it is answered.
  const yours = view === 'soon' ? [] : threads.filter(t => t.yours);
  if (view === 'soon') needs = [];
  const asks = needs.length + yours.length;
  const calm = threads.filter(t => !t.yours).sort((a, b) => whenOf(a) - whenOf(b));
  const dayIn = (t: ProcessThread, id: Tab) => { const day = dayOf(whenOf(t)); return id === 'today' ? day <= today : day > today && day <= today + 7; };
  const inTab = (t: ProcessThread) => tab === 'all' || dayIn(t, tab);
  const shown = calm.filter(inTab);
  const rows = all ? shown : shown.slice(0, FOLDED);
  const parts = [arrivals ? count(arrivals, 'заезд', 'заезда', 'заездов') : '', cleanings ? count(cleanings, 'уборка', 'уборки', 'уборок') : ''].filter(Boolean);
  const todayCount = calm.filter(t => dayIn(t, 'today')).length + asks, soonCount = calm.filter(t => dayIn(t, 'soon')).length;
  const total = needs.length + yours.length + rows.length;
  const tabButton = (id: Tab, title: string, n?: number) => (
    <Pressable key={id} accessibilityRole="tab" accessibilityState={{ selected: tab === id }} onPress={() => { setTab(id); setAll(false); }} style={[o.tab, tab === id && o.tabOn]}>
      <Text style={[o.tabText, tab === id && o.tabTextOn]}>{title}{n ? ' · ' + n : ''}</Text>
    </Pressable>
  );
  let at = 0;
  const last = () => ++at === total;
  return (
    <View style={o.box} accessibilityLabel={tr('Сегодня')}>
      {!view && <View style={o.tabs} accessibilityRole="tablist">{tabButton('today', tr('Сегодня'), todayCount)}{tabButton('soon', tr('Скоро'), soonCount)}{tabButton('all', tr('Все'))}</View>}
      {total > 0 && view !== 'soon' && <Text style={o.lead}>{[parts.join(' · ') || tr('Сегодня спокойно'), asks ? tr('нужны вы: {n}', { n: asks }) : tr('остальное ведёт автопилот')].join(' · ')}</Text>}
      <View>
        {needs.map(n => <TimeRow key={n.key} now time={tr('сейчас')} title={n.title} line={n.line} button={n.action} onButton={n.onPress} last={last()} label={tr('Ждёт вас: {title}. {line}', { title: n.title, line: n.line })} />)}
        {yours.map(t => {
          const ask = t.kind === 'booking' && t.tag === 'Бронь' && t.current === 0;
          return <TimeRow key={t.kind + t.id} now time={tr('сейчас')} title={(ask ? tr('Заявка') : tr(t.tag)) + ' · ' + t.title} line={t.line} button={ask ? tr('Ответить') : tr('Решить')} onButton={() => onOpen(t.kind, t.id)} onPress={() => onOpen(t.kind, t.id)} last={last()} label={tr(t.tag) + ' ' + t.title + '. ' + t.line} />;
        })}
        {rows.map(t => {
          const step = t.steps[t.current];
          const word = t.finished ? tr('Готово') : step?.label || tr(t.tag);
          return <TimeRow key={t.kind + t.id} time={timeLabel(whenOf(t), now)} title={word + ' · ' + t.title} line={t.line} onPress={() => onOpen(t.kind, t.id)} last={last()} label={word + ' ' + t.title + '. ' + t.line} />;
        })}
      </View>
      {!total && <Text style={o.empty}>{tab === 'soon' ? tr('На неделю вперёд пока пусто') : tr('Броней и уборок сейчас нет')}</Text>}
      {shown.length > FOLDED && <Pressable accessibilityRole="button" onPress={() => setAll(v => !v)} style={o.more}><Text style={o.moreText}>{all ? tr('Свернуть') : tr('Ещё {n}', { n: shown.length - FOLDED })}</Text></Pressable>}
    </View>
  );
}

const o = StyleSheet.create({
  box: { gap: 8 },
  lead: { ...type.label, color: C.muted },
  tabs: { flexDirection: 'row', gap: 20, marginTop: 4, borderBottomWidth: 1, borderBottomColor: C.line },
  tab: { minHeight: 40, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent', marginBottom: -1 },
  tabOn: { borderBottomColor: C.ink },
  tabText: { ...type.label, color: C.muted, fontWeight: '600' },
  tabTextOn: { color: C.ink },
  empty: { ...type.label, color: C.muted, paddingVertical: 8 },
  more: { minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  moreText: { ...type.label, color: C.ink, fontWeight: '600' },
});
