import {t} from '../../lib/i18n';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { cleanerHandoff, ownerHandoff } from '../../lib/autopilot-handoff';
import { request } from './api';
import { C, type } from './styles';
import { T } from './tokens';
import type { Row } from './model';

// compact: the sheet is collapsed, so the offer is one line; a tap opens the sheet (onExpand) and the offer with it.
// stamp: what the offer depends on in the workspace data (the owner's prices and rules); tick: the time of the last refresh of that data.
type Props = { role: 'owner' | 'cleaner'; accountId: string; stamp?: string; tick?: number; compact?: boolean; onExpand?: () => void; onChanged: () => Promise<unknown> | void; onSetup: (flatId?: string) => void };

// «Не сейчас» holds until the app is opened again: the offer is one row, not a banner that comes back on every screen.
const later = new Set<string>();
const money = (n: number) => new Intl.NumberFormat('ru-RU').format(n || 0) + ' ₸';

// «Передать ИИ» in the feed of the map sheet. The owner who leads a home by hand and the performer who takes cleanings
// by hand see one row; a tap opens what the AI will do, the price and one button. Nothing is asked that the service
// already knows: only the cleaning price of a home that has none.
export function AutopilotHandoff({ role, accountId, stamp = '', tick = 0, compact, onExpand, onChanged, onSetup }: Props) {
  const key = role + ':' + accountId;
  const [state, setState] = useState<Row | null>(null), [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const [fees, setFees] = useState<Record<string, string>>({}), [notice, setNotice] = useState(''), [hidden, setHidden] = useState(later.has(key));
  const live = useRef(true);
  const load = () => request('/api/operations/autopilot/state', undefined, undefined, undefined, role).then(v => { if (live.current) setState(v); }).catch(() => { /* No offer without the state: the feed stays as it is. */ });
  useEffect(() => { live.current = true; void load(); return () => { live.current = false; }; }, [key, stamp]);
  // The person went to fill the prices or the rules: the offer is read again with the next refresh of the workspace.
  const stale = useRef(false);
  useEffect(() => { if (stale.current) { stale.current = false; void load(); } }, [tick]);
  const setup = (flatId?: string) => { stale.current = true; onSetup(flatId); };
  const owner = role === 'owner' ? ownerHandoff(state) : null, cleaner = role === 'cleaner' ? cleanerHandoff(state) : null, offer = owner || cleaner;
  if (!offer || hidden) return notice ? <Text accessibilityLiveRegion="polite" style={a.done}>✦ {notice}</Text> : null;
  const missing = owner ? owner.needFee.some(f => Number(fees[f.id] || 0) < 100) : false, none = owner ? !owner.ready.length : false;
  async function start() {
    setBusy(true); setNotice('');
    try {
      const body = owner
        ? { propertyIds: owner.ready.map(f => f.id), cleaningFees: Object.fromEntries(owner.needFee.map(f => [f.id, Number(fees[f.id])])) }
        : cleaner!.rules;
      const result = await request('/api/operations/autopilot/start', body, undefined, undefined, role);
      if (!live.current) return;
      // A home the server refused (an expired mandate, a tariff under the minimum) keeps the offer open with the reason.
      const failed: Row[] = result?.failed || [];
      setNotice(failed.length ? failed.map(f => f.error).join(' ') : result?.message || t('Автопилот включён.'));
      if (!failed.length) setOpen(false);
      setState(result?.state || null); if (!result?.state) await load();
      await onChanged();
    } catch (e: any) { if (live.current) setNotice(e?.message || t('Не получилось включить. Попробуйте ещё раз.')); }
    finally { if (live.current) setBusy(false); }
  }
  if (compact && !open) return (
    <Pressable accessibilityRole="button" accessibilityLabel={t('Передать ИИ: {title}',{title:offer.title})} onPress={() => { setNotice(''); setOpen(true); onExpand?.(); }} style={({ pressed }) => [a.slim, pressed && a.pressed]}>
      <Text style={a.slimMark}>✦</Text><Text numberOfLines={1} style={[a.linkText, a.text]}>{owner ? t('Передать жильё ИИ') : t('ИИ может брать уборки за вас')}</Text><Text style={a.linkText}>›</Text>
    </Pressable>
  );
  return (
    <View style={a.box} accessibilityLabel={t('Передать ИИ: {title}',{title:offer.title})}>
      <View style={a.row}>
        <View style={a.mark}><Text style={a.markText}>✦</Text></View>
        <View style={a.text}><Text numberOfLines={2} style={a.title}>{offer.title}</Text><Text numberOfLines={open ? undefined : 2} style={a.line}>{offer.line}</Text></View>
        {!open && <Pressable accessibilityRole="button" accessibilityLabel={(owner ? t('Передать ИИ') : t('Включить')) + ': ' + offer.title} onPress={() => { setNotice(''); setOpen(true); }} style={({ pressed }) => [a.button, pressed && a.pressed]}><Text style={a.buttonText}>{owner ? t('Передать ИИ') : t('Включить')}</Text></Pressable>}
      </View>
      {open && <>
        {owner?.needFee.map(f => (
          <View key={f.id} style={a.fee}>
            <Text style={a.feeLabel}>{t('{title}: сколько платить за уборку, ₸',{title:f.title})}</Text>
            <TextInput accessibilityLabel={t('Стоимость уборки: {title}',{title:f.title})} style={a.field} keyboardType="number-pad" placeholder={t('Например, 5000')} placeholderTextColor={C.muted} value={fees[f.id] || ''} onChangeText={v => setFees({ ...fees, [f.id]: v.replace(/\D/g, '').slice(0, 7) })} />
          </View>
        ))}
        {owner?.ready.filter(f => !owner.needFee.includes(f) && !f.ownStaff).map(f => <Text key={f.id} style={a.fact}>{t('{title}: уборка {sum} после каждого выезда',{title:f.title,sum:money(f.cleaningFee)})}</Text>)}
        {owner?.notReady.map(f => (
          <View key={f.id} style={a.setup}>
            <Text style={[a.fact, a.text]}>{t('{title}: сначала укажите цены и правила, по ним ИИ отвечает гостям',{title:f.title})}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={t('Заполнить: {title}',{title:f.title})} onPress={() => setup(f.id)} style={a.link}><Text style={a.linkText}>{t('Заполнить')}</Text></Pressable>
          </View>
        ))}
        {cleaner && <Text style={a.fact}>{t('{rules}. О новом владельце ИИ спросит вас.',{rules:cleaner.rulesText})}</Text>}
        {!none && <Text style={a.fact}>{offer.price}{' '}{t('Отключить можно в любой момент.')}</Text>}
        {!!notice && <Text accessibilityRole="alert" style={a.error}>{notice}</Text>}
        <View style={a.actions}>
          {!none && <Pressable accessibilityRole="button" accessibilityLabel={t('Включить автопилот')} disabled={busy || missing} onPress={() => void start()} style={({ pressed }) => [a.button, a.grow, (busy || missing) && a.off, pressed && a.pressed]}><Text style={a.buttonText}>{busy ? t('Включаю…') : t('Включить')}</Text></Pressable>}
          {cleaner && <Pressable accessibilityRole="button" disabled={busy} onPress={() => setup()} style={a.link}><Text style={a.linkText}>{t('Изменить правила')}</Text></Pressable>}
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => { later.add(key); setHidden(true); }} style={a.link}><Text style={a.linkMuted}>{t('Не сейчас')}</Text></Pressable>
        </View>
      </>}
    </View>
  );
}

const a = StyleSheet.create({
  box: { gap: 12, padding: 12, borderRadius: T.radius.lg, borderWidth: 1, borderColor: C.line, backgroundColor: C.surfaceAlt },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  mark: { width: 28, height: 28, borderRadius: T.radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: C.ink },
  markText: { ...type.label, color: C.gold, fontWeight: '700' },
  text: { flex: 1, minWidth: 0, gap: 2 },
  title: { ...type.label, color: C.ink, fontWeight: '600' },
  line: { ...type.caption, color: C.muted },
  fact: { ...type.caption, color: C.inkSoft },
  button: { minHeight: 36, paddingHorizontal: 16, borderRadius: T.radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: C.ink },
  buttonText: { ...type.label, color: C.onAccent, fontWeight: '600' },
  grow: { flexGrow: 1 },
  off: { opacity: 0.4 },
  pressed: { opacity: 0.6 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  link: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 8 },
  linkText: { ...type.label, color: C.ink, fontWeight: '600' },
  linkMuted: { ...type.label, color: C.muted, fontWeight: '600' },
  slim: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36, paddingHorizontal: 12, borderRadius: T.radius.full, backgroundColor: C.surfaceAlt },
  slimMark: { ...type.label, color: C.ink, fontWeight: '700' },
  fee: { gap: 4 },
  feeLabel: { ...type.caption, color: C.inkSoft },
  field: { ...type.body, minHeight: T.control.field, paddingHorizontal: 12, borderRadius: T.radius.md, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, color: C.ink },
  setup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  error: { ...type.caption, color: C.danger },
  done: { ...type.caption, color: C.ink, fontWeight: '600' },
});
