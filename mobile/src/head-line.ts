// The words of the one AI line and of the shortcuts under it. They are the site's own (lib/ai-line.ts),
// so the app and the browser never show different examples or different chips. This file only says what
// a tap on each shortcut does in the app. Covered by mobile/tests/head-line.test.mjs.
import { roleAiLine } from '../../lib/ai-line';

export type HeadRole = 'guest' | 'owner' | 'cleaner';
// What the app does for a shortcut: a guest search, a page of the role, or the opened sheet.
export type HeadAction = 'daily' | 'hourly' | 'weekend' | 'requests' | 'calendar' | 'add-property' | 'nearby' | 'schedule';
export type HeadChip = {
  id: string;
  title: string; // the short label on the chip
  hint: string; // the full name for a screen reader: "Добавить жильё" for "+ Жильё"
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
  'add-property': 'add-property',
  'jobs-nearby': 'nearby',
  schedule: 'schedule'
};

export function headLine(role: HeadRole): HeadLine {
  const line = roleAiLine(role);
  return {
    placeholder: line.placeholder,
    shortPlaceholder: line.shortPlaceholder,
    label: line.label,
    // A shortcut the app has no action for is not shown: a chip that does nothing would be a lie.
    chips: line.chips.flatMap(chip => (ACTIONS[chip.id] ? [{ id: chip.id, title: chip.label, hint: chip.hint || chip.label, action: ACTIONS[chip.id] }] : []))
  };
}
