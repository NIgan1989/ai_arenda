import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  THREAD_BY, cleanerThreads, cleanerWeek, dayRibbon, lastAiMove, ownerThreads, ribbonX, threadClock, threadWhen, threadsSummary,
  type ProcessThread, type ThreadStep
} from '../../lib/process-threads';
import { C, type } from './styles';
import { T } from './tokens';

type Row = Record<string, any>;
type Props = { role: 'owner' | 'cleaner'; data: Row; now: number; onOpen: (kind: 'booking' | 'job', id: string) => void };

const FOLDED = 3;
const pct = (n: number) => `${n}%` as `${number}%`;

// The dot of the step under way breathes, as on the site (components/autopilot-threads.css).
function NowDot() {
  const breath = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null, live = true;
    AccessibilityInfo.isReduceMotionEnabled().then(calm => {
      if (!live || calm) return;
      loop = Animated.loop(Animated.timing(breath, { toValue: 1, duration: 1600, useNativeDriver: true }));
      loop.start();
    }).catch(() => {});
    return () => { live = false; loop?.stop(); };
  }, [breath]);
  return (
    <View style={a.dotNow}>
      <Animated.View style={[a.halo, { opacity: breath.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }), transform: [{ scale: breath.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.3] }) }] }]} />
    </View>
  );
}

function Rail({ t }: { t: ProcessThread }) {
  return (
    <View style={a.rail} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {t.steps.map((s, i) => (
        <View key={s.key} style={[a.railPart, i === t.steps.length - 1 && a.railLast]}>
          {s.state === 'now' ? <NowDot /> : <View style={[a.dot, s.state === 'done' && (s.by === 'ai' ? a.dotAi : a.dotDone), s.state === 'next' && a.dotNext]} />}
          {i < t.steps.length - 1 && (
            <View style={a.line}><View style={[a.lineFill, { width: pct(s.state === 'done' ? 100 : s.state === 'now' && typeof s.progress === 'number' ? Math.round(s.progress * 100) : 0) }]} /></View>
          )}
        </View>
      ))}
    </View>
  );
}

function Step({ s, last, now }: { s: ThreadStep; last: boolean; now: number }) {
  const shown = s.state === 'done' || s.state === 'now' || s.state === 'next';
  return (
    <View style={a.step}>
      <Text style={a.stepTime}>{s.at ? threadWhen(s.at, now) : ''}</Text>
      <View style={a.stepRail}>
        <View style={[a.stepDot, s.state === 'done' && (s.by === 'ai' ? a.stepDotAi : a.stepDotDone), (s.state === 'now' || s.state === 'next') && a.stepDotNow]} />
        {!last && <View style={[a.stepThread, s.state === 'done' && a.stepThreadDone]} />}
      </View>
      <View style={a.stepText}>
        <View style={a.stepHead}>
          <Text style={[a.stepLabel, s.state === 'wait' && a.stepLabelWait]}>{s.label}</Text>
          <Text style={[a.who, s.by === 'ai' && a.whoAi]}>{THREAD_BY[s.by]}</Text>
        </View>
        {shown && !!s.note && <Text style={a.note}>{s.note}</Text>}
        {s.state === 'now' && typeof s.progress === 'number' && <View style={a.bar}><View style={[a.barFill, { width: pct(Math.round(s.progress * 100)) }]} /></View>}
      </View>
    </View>
  );
}

// The block «Автопилот» of the map sheet: every booking and cleaning of the owner (the cleaner's jobs) from start to end,
// and the step each one is at. The cleaner also has the week and the ribbon of the chosen day. The same as on the site.
export function AutopilotThreads({ role, data, now, onOpen }: Props) {
  const [filter, setFilter] = useState<'all' | 'booking' | 'job'>('all');
  const [open, setOpen] = useState('');
  const [all, setAll] = useState(false);
  const [day, setDay] = useState<number | null>(null);
  const threads = useMemo(() => role === 'owner' ? ownerThreads(data, now) : cleanerThreads(data, now), [role, data, now]);
  const week = useMemo(() => role === 'cleaner' ? cleanerWeek(data, now) : [], [role, data, now]);
  const [width, setWidth] = useState(0);
  if (!data?.user?.id || (!threads.length && role === 'owner')) return null;
  const dayKey = day ?? week[0]?.key ?? 0;
  const shown = threads.filter(t => filter === 'all' || t.kind === filter);
  const rows = all ? shown : shown.slice(0, FOLDED);
  const last = lastAiMove(data, role, now);
  const count = (kind: 'booking' | 'job') => threads.filter(t => t.kind === kind && !t.finished).length;
  const ribbon = role === 'cleaner' ? dayRibbon(cleanerThreads(data, now, true), data, dayKey, now) : null;
  const tab = (id: 'all' | 'booking' | 'job', title: string, n?: number) => (
    <Pressable key={id} accessibilityRole="button" accessibilityState={{ selected: filter === id }} onPress={() => setFilter(id)} style={[a.tab, filter === id && a.tabOn]}>
      <Text style={[a.tabText, filter === id && a.tabTextOn]}>{title}</Text>
      {typeof n === 'number' && <Text style={[a.tabCount, filter === id && a.tabTextOn]}>{n}</Text>}
    </Pressable>
  );
  return (
    <View style={a.box} accessibilityLabel="Автопилот">
      <View style={a.head}>
        <Text style={a.badge}>✦ Автопилот</Text>
        <Text style={a.sum}>{threadsSummary(role, threads)}</Text>
        <Text style={a.clock}>{threadClock(now)}</Text>
      </View>
      {last && <View style={a.last}><Text style={a.lastTime}>✦ {threadClock(last.at)}</Text><Text numberOfLines={1} style={a.lastText}>{last.text}{last.title ? ' · ' + last.title : ''}</Text></View>}
      {role === 'owner' && <View style={a.tabs}>{tab('all', 'Всё')}{tab('booking', 'Брони', count('booking'))}{tab('job', 'Уборки', count('job'))}</View>}
      {role === 'cleaner' && <>
        <View style={a.week}>
          {week.map(d => (
            <Pressable key={d.key} accessibilityRole="button" accessibilityState={{ selected: d.key === dayKey }} accessibilityLabel={(d.today ? 'Сегодня, ' : '') + d.week + ' ' + d.date + ': уборок ' + d.count} onPress={() => setDay(d.key)} style={[a.day, d.key === dayKey && a.dayOn]}>
              <Text style={[a.dayWeek, d.key === dayKey && a.dayWeekOn]}>{d.week}</Text>
              <Text style={[a.dayDate, d.key === dayKey && a.dayDateOn]}>{d.date}</Text>
              <View style={a.dayDots}>{Array.from({ length: Math.min(3, d.count) }, (_, i) => <View key={i} style={[a.dayDot, d.key === dayKey && a.dayDotOn]} />)}</View>
            </Pressable>
          ))}
        </View>
        {ribbon && <View style={a.ribbon} onLayout={e => setWidth(e.nativeEvent.layout.width)}>
          <View style={a.ticks}>{!!width && ribbon.ticks.map(t => <Text key={t.at} style={[a.tick, { left: ribbonX(ribbon, t.at) / 100 * width - 20 }]}>{t.label}</Text>)}</View>
          <View style={a.track}>
            {ribbon.bars.map(b => (
              <Pressable key={b.id} accessibilityRole="button" accessibilityLabel={b.title + ', ' + b.label} onPress={() => { setOpen(b.id); setAll(true); }}
                style={[a.seg, b.state === 'done' && a.segDone, b.state === 'now' && a.segNow, b.state === 'next' && a.segNext, { left: pct(ribbonX(ribbon, b.from)), width: pct(Math.max(2, ribbonX(ribbon, b.to) - ribbonX(ribbon, b.from))) }]} />
            ))}
            {ribbon.now !== null && <View style={[a.nowLine, { left: pct(ribbonX(ribbon, ribbon.now)) }]} />}
          </View>
          {!ribbon.bars.length && <Text style={a.empty}>В этот день уборок нет</Text>}
        </View>}
      </>}
      {rows.map(t => {
        const isOpen = open === t.id;
        return (
          <View key={t.kind + t.id} style={[a.item, isOpen && a.itemOpen]}>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: isOpen }} accessibilityLabel={t.tag + ' ' + t.title + '. ' + t.status + '. ' + t.line} onPress={() => setOpen(isOpen ? '' : t.id)} style={a.row}>
              <View style={a.rowTop}>
                <Text style={[a.tag, t.kind === 'job' && a.tagJob]}>{t.tag}</Text>
                <Text numberOfLines={1} style={a.title}>{t.title}</Text>
                <Text style={[a.status, t.finished && a.statusDone, t.yours && a.statusYours]}>{t.status}</Text>
              </View>
              <Rail t={t} />
              <Text numberOfLines={1} style={a.rowLine}>{t.line}</Text>
            </Pressable>
            {isOpen && <View style={a.more}>
              {t.steps.map((s, i) => <Step key={s.key} s={s} last={i === t.steps.length - 1} now={now} />)}
              <Pressable accessibilityRole="button" onPress={() => onOpen(t.kind, t.id)} style={({ pressed }) => [a.open, pressed && a.openPressed]}>
                <Text style={a.openText}>{t.kind === 'booking' ? 'Открыть бронь' : t.tag === 'Задание' ? 'Открыть задание' : 'Открыть уборку'}</Text>
              </Pressable>
            </View>}
          </View>
        );
      })}
      {!rows.length && <Text style={a.empty}>{role === 'owner' ? (filter === 'job' ? 'Уборок сейчас нет' : 'Броней сейчас нет') : 'Когда вас назначат на уборку, она появится здесь'}</Text>}
      {shown.length > FOLDED && <Pressable accessibilityRole="button" onPress={() => setAll(v => !v)} style={a.moreButton}><Text style={a.moreText}>{all ? 'Свернуть' : 'Ещё ' + (shown.length - FOLDED)}</Text></Pressable>}
    </View>
  );
}

const a = StyleSheet.create({
  box: { gap: 12, padding: 12, borderRadius: T.radius.lg, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { ...type.caption, fontWeight: '700', color: C.onAccent, backgroundColor: C.aiFrom, paddingHorizontal: 8, paddingVertical: 2, borderRadius: T.radius.full, overflow: 'hidden' },
  sum: { ...type.label, flex: 1, minWidth: 0, color: C.inkSoft, fontWeight: '500' },
  clock: { ...type.caption, color: C.muted, fontVariant: ['tabular-nums'] },
  last: { flexDirection: 'row', gap: 8, paddingHorizontal: 8, paddingVertical: 4, borderRadius: T.radius.sm, backgroundColor: C.accentSoft },
  lastTime: { ...type.caption, color: C.accent, fontWeight: '600' },
  lastText: { ...type.caption, flex: 1, color: C.muted },
  tabs: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36, paddingHorizontal: 12, borderRadius: T.radius.full, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  tabOn: { backgroundColor: C.ink, borderColor: C.ink },
  tabText: { ...type.label, color: C.inkSoft, fontWeight: '600' },
  tabCount: { ...type.caption, color: C.muted },
  tabTextOn: { color: C.surface },
  item: { borderRadius: T.radius.md },
  itemOpen: { backgroundColor: C.accentSoft },
  row: { gap: 8, padding: 8 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tag: { ...type.caption, fontWeight: '600', color: C.accent, backgroundColor: C.accentSoft, paddingHorizontal: 4, borderRadius: T.radius.xs, overflow: 'hidden' },
  tagJob: { color: C.success, backgroundColor: C.successSoft },
  title: { ...type.label, flex: 1, minWidth: 0, color: C.ink, fontWeight: '600' },
  status: { ...type.caption, color: C.accent, fontWeight: '600' },
  statusDone: { color: C.success },
  statusYours: { color: C.warning },
  rowLine: { ...type.caption, color: C.muted },
  rail: { flexDirection: 'row', alignItems: 'center', height: 16 },
  railPart: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  railLast: { flex: 0 },
  dot: { width: 10, height: 10, borderRadius: T.radius.full, backgroundColor: C.lineStrong },
  dotDone: { backgroundColor: C.success },
  dotAi: { backgroundColor: C.aiFrom },
  dotNext: { width: 16, height: 16, backgroundColor: C.surface, borderWidth: 3, borderColor: C.accentLine },
  dotNow: { width: 16, height: 16, borderRadius: T.radius.full, backgroundColor: C.surface, borderWidth: 3, borderColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: 24, height: 24, borderRadius: T.radius.full, borderWidth: 2, borderColor: C.accent },
  line: { flex: 1, height: 3, marginHorizontal: 2, borderRadius: 2, backgroundColor: C.line, overflow: 'hidden' },
  lineFill: { height: 3, backgroundColor: C.success },
  more: { paddingHorizontal: 8, paddingBottom: 8, gap: 8 },
  step: { flexDirection: 'row', gap: 8, minHeight: 40 },
  stepTime: { ...type.caption, width: 76, textAlign: 'right', color: C.muted, paddingTop: 2, fontVariant: ['tabular-nums'] },
  stepRail: { width: 16, alignItems: 'center' },
  stepDot: { width: 12, height: 12, marginTop: 4, borderRadius: T.radius.full, borderWidth: 2, borderColor: C.lineStrong, backgroundColor: C.surface },
  stepDotDone: { borderColor: C.success, backgroundColor: C.success },
  stepDotAi: { borderColor: C.aiFrom, backgroundColor: C.aiFrom },
  stepDotNow: { borderWidth: 4, borderColor: C.accent },
  stepThread: { flex: 1, width: 2, backgroundColor: C.line },
  stepThreadDone: { backgroundColor: C.success },
  stepText: { flex: 1, minWidth: 0, gap: 2, paddingBottom: 8 },
  stepHead: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  stepLabel: { ...type.label, color: C.ink, fontWeight: '600' },
  stepLabelWait: { color: C.muted, fontWeight: '500' },
  who: { ...type.caption, fontWeight: '600', color: C.inkSoft, backgroundColor: C.surfaceAlt, paddingHorizontal: 4, borderRadius: T.radius.xs, overflow: 'hidden' },
  whoAi: { color: C.accent, backgroundColor: C.accentSoft },
  note: { ...type.caption, color: C.muted },
  bar: { height: 4, marginTop: 4, borderRadius: 2, backgroundColor: C.surface, overflow: 'hidden' },
  barFill: { height: 4, backgroundColor: C.aiFrom },
  open: { minHeight: T.control.touch, borderRadius: T.radius.md, borderWidth: 1, borderColor: C.accentLine, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  openPressed: { backgroundColor: C.accentSoft },
  openText: { ...type.label, color: C.accent, fontWeight: '600' },
  moreButton: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 8 },
  moreText: { ...type.label, color: C.accent, fontWeight: '600' },
  empty: { ...type.label, color: C.muted },
  week: { flexDirection: 'row', gap: 4 },
  day: { flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center', gap: 2, borderRadius: T.radius.md, backgroundColor: C.surfaceAlt },
  dayOn: { backgroundColor: C.accent },
  dayWeek: { ...type.caption, color: C.muted },
  dayWeekOn: { color: C.accentSoft },
  dayDate: { ...type.body, color: C.ink, fontWeight: '600' },
  dayDateOn: { color: C.onAccent },
  dayDots: { flexDirection: 'row', gap: 2, height: 4 },
  dayDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: C.accent },
  dayDotOn: { backgroundColor: C.onAccent },
  ribbon: { gap: 4, marginHorizontal: 16 },
  ticks: { height: 16 },
  tick: { ...type.caption, position: 'absolute', width: 40, textAlign: 'center', color: C.muted, fontVariant: ['tabular-nums'] },
  track: { height: 20, borderRadius: T.radius.full, backgroundColor: C.surfaceAlt },
  seg: { position: 'absolute', top: 4, bottom: 4, borderRadius: T.radius.full, backgroundColor: C.lineStrong },
  segDone: { backgroundColor: C.success },
  segNow: { backgroundColor: C.accent },
  segNext: { backgroundColor: C.accentLine },
  nowLine: { position: 'absolute', top: -4, bottom: -4, width: 2, marginLeft: -1, borderRadius: 1, backgroundColor: C.danger }
});
