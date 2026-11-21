import {L,t} from '../../lib/i18n';
// The words of the one AI line and of the shortcuts under it. They are the site's own (lib/ai-line.ts),
// so the app and the browser never show different examples or different chips. This file only says what
// a tap on each shortcut does in the app. Covered by mobile/tests/head-line.test.mjs.
// One shortcut is the app's own: the owner's «+ Жильё» of the site is «Жильё» here and opens the list of
// the owner's objects, where adding one is the first button (the app only, since 2026-11-15).
import { roleAiLine } from '../../lib/ai-line';

export type HeadRole = 'guest' | 'owner' | 'cleaner';
// What the app does for a shortcut: a guest search, a page of the role, or the opened sheet.
export type HeadAction = 'now' | 'night' | 'daily' | 'hourly' | 'weekend' | 'evening' | 'tomorrow' | 'toi' | 'party' | 'memorial' | 'requests' | 'calendar' | 'properties' | 'nearby' | 'schedule';
export type HeadChip = {
  id: string;
  title: string; // the short label on the chip
  hint: string; // the full name for a screen reader: «Моё жильё: посмотреть, изменить, добавить» for «Жильё»
  action: HeadAction;
};
export type HeadLine = {
  placeholder: string;
  // The last resort for a line so narrow that the example does not fit even one text size smaller.
  shortPlaceholder?: string;
  label: string;
  chips: HeadChip[];
};

// The site's shortcut ids and what each of them does in the app.
const ACTIONS: Record<string, HeadAction> = {
  daily: 'daily',
  hourly: 'hourly',
  weekend: 'weekend',
  requests: 'requests',
  'free-dates': 'calendar',
  'add-property': 'properties',
  'jobs-nearby': 'nearby',
  schedule: 'schedule'
};
// The words of the app where they differ from the site's.
const OWN: Record<string, { title: string; hint: string }> = L({
  'add-property': { title: 'Жильё', hint: 'Моё жильё: посмотреть, изменить, добавить' }
});

// The guest's chips are the app's own (since 2026-11-17): «Сейчас» first, then what fits the hour. In the evening
// and at night «На ночь» and «На часы», in the day «На часы» and «На сутки». «На выходные» is said in the line.
const GUEST_DAY: HeadChip[] = L([
  { id: 'now', title: 'Сейчас', hint: 'Сейчас: готовое жильё рядом с мгновенным подтверждением', action: 'now' },
  { id: 'hourly', title: 'На часы', hint: 'На часы: ближайшие три часа', action: 'hourly' },
  { id: 'daily', title: 'На сутки', hint: 'На сутки: с сегодняшнего дня', action: 'daily' }
]);
const GUEST_NIGHT: HeadChip[] = L([
  GUEST_DAY[0],
  { id: 'night', title: 'На ночь', hint: 'На ночь: до 12:00, по ночной цене, где она есть', action: 'night' },
  GUEST_DAY[1]
]);
// The category «Баня»: a bath is taken for a few hours, mostly in the evening.
const GUEST_BATH: HeadChip[] = L([
  { id: 'now', title: 'Сейчас', hint: 'Сейчас: свободная баня рядом с мгновенным подтверждением', action: 'now' },
  { id: 'evening', title: 'Вечером', hint: 'Вечером: три часа с 19:00', action: 'evening' },
  { id: 'tomorrow', title: 'Завтра', hint: 'Завтра вечером: три часа с 19:00', action: 'tomorrow' }
]);
const BATH_LINE = L({ placeholder: 'Баня на 6 человек сегодня в 20:00', shortPlaceholder: 'Баня на 6 в 20:00' });
// The category «Банкет»: what the hall is for. The day, the slot and the guests are in the line or in the form.
const GUEST_BANQUET: HeadChip[] = L([
  { id: 'toi', title: 'Той', hint: 'Той или свадьба: зал на вечер субботы', action: 'toi' },
  { id: 'party', title: 'Юбилей', hint: 'Юбилей или праздник: зал на вечер субботы', action: 'party' },
  { id: 'memorial', title: 'Поминки', hint: 'Поминки, ас: зал на завтра, на обед', action: 'memorial' }
]);
const BANQUET_LINE = L({ placeholder: 'Той на 150 человек 5 декабря', shortPlaceholder: 'Той на 150, 5 декабря' });
/** Evening and night in Kazakhstan: from 18:00 to 06:00. */
export const isEvening = (now = Date.now()) => { const hour = new Date(now + 5 * 3600000).getUTCHours(); return hour >= 18 || hour < 6; };

export function headLine(role: HeadRole, now = Date.now(), category: 'stay' | 'bath' | 'banquet' = 'stay'): HeadLine {
  const line = roleAiLine(role);
  if (role === 'guest' && category === 'banquet') return { ...BANQUET_LINE, label: t('Какой зал найти'), chips: GUEST_BANQUET };
  if (role === 'guest' && category === 'bath') return { ...BATH_LINE, label: line.label, chips: GUEST_BATH };
  if (role === 'guest') return { placeholder: line.placeholder, shortPlaceholder: line.shortPlaceholder, label: line.label, chips: isEvening(now) ? GUEST_NIGHT : GUEST_DAY };
  return {
    placeholder: line.placeholder,
    shortPlaceholder: line.shortPlaceholder,
    label: line.label,
    // A shortcut the app has no action for is not shown: a chip that does nothing would be a lie.
    chips: line.chips.flatMap(chip => (ACTIONS[chip.id] ? [{ id: chip.id, title: OWN[chip.id]?.title || chip.label, hint: OWN[chip.id]?.hint || chip.hint || chip.label, action: ACTIONS[chip.id] }] : []))
  };
}
