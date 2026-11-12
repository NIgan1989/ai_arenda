import type { Role } from './domain';

// href: where the shortcut leads when it is a plain link; active: shown as chosen (a filter that is on);
// hint: the full name for assistive technology when the label on the chip is shortened.
export type AiChip = { id: string; label: string; href?: string; active?: boolean; hint?: string };
// shortPlaceholder: the last resort for a line narrower than a 360px phone gives it (see AiLine).
export type RoleAiLine = { placeholder: string; shortPlaceholder?: string; label: string; chips: AiChip[] };

export const AI_LINE_MAX = 2000;

// The one AI line of the first screen: what it says and which shortcuts sit under it.
// The same words are used by the app (mobile/src/MapSheetHead.tsx). The shortcuts of a role fit one row
// of a 360px phone. The questions of the owner and of the cleaner are answered from their own data:
// tests/administrator-process-read.test.mjs keeps that true.
export function roleAiLine(role: Role): RoleAiLine {
  if (role === 'owner') return {
    placeholder: 'Что сегодня требует внимания?',
    shortPlaceholder: 'Что требует внимания?',
    label: 'Вопрос AI администратору',
    chips: [
      { id: 'requests', label: 'Заявки', hint: 'Заявки гостей', href: '/workspace/owner/bookings' },
      { id: 'free-dates', label: 'Календарь', href: '/workspace/owner/calendar' },
      { id: 'add-property', label: '+ Квартира', hint: 'Добавить квартиру', href: '/workspace/owner/properties?new=1' },
    ],
  };
  if (role === 'cleaner') return {
    placeholder: 'Есть уборки рядом на сегодня?',
    shortPlaceholder: 'Уборки рядом сегодня?',
    label: 'Вопрос AI администратору',
    chips: [
      { id: 'jobs-nearby', label: 'Задания рядом', href: '/workspace/cleaner/jobs' },
      { id: 'schedule', label: 'Мой график', href: '/workspace/cleaner/calendar' },
    ],
  };
  return {
    // The longer "Квартира на 3 часа сегодня в центре" does not fit the line of a 360px phone.
    placeholder: 'На 3 часа сегодня в центре',
    label: 'Какое жильё найти',
    chips: [
      { id: 'daily', label: 'На сутки' },
      { id: 'hourly', label: 'На часы' },
      { id: 'weekend', label: 'На выходные' },
    ],
  };
}

export const cleanAiText = (text: unknown) =>
  (typeof text === 'string' ? text : '').replace(/\s+/g, ' ').trim().slice(0, AI_LINE_MAX);

// ---------- A question carried from another page to the chat with the AI administrator ----------
// Nothing is ever sent to the administrator because of an address: a link from another site must not make
// a signed-in person write. The page that has the question leaves it in sessionStorage (this tab, this site only)
// and opens the chats page; the chats page takes it once and sends it.

type AskStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const ASK_LIFETIME = 30 * 60 * 1000;
export const aiAskKey = (role: Role) => 'ai-arenda-ask:' + role;
export const administratorChatPath = (role: Role) => '/workspace/' + role + '/chats';

function tabStorage(): AskStorage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    // Storage is switched off in this browser.
    return null;
  }
}

// Leaves the question for the chats page. False when there is nothing to leave or nowhere to keep it.
export function leaveAiAsk(role: Role, text: string, storage: AskStorage | null = tabStorage(), now = Date.now()) {
  const ask = cleanAiText(text);
  if (!ask || !storage) return false;
  try {
    storage.setItem(aiAskKey(role), JSON.stringify({ text: ask, at: now }));
    return true;
  } catch {
    return false;
  }
}

// Takes the question left for this role and forgets it, so it is sent once. A question left long ago
// (the person went away and came back) is forgotten without being sent.
export function takeAiAsk(role: Role, storage: AskStorage | null = tabStorage(), now = Date.now()) {
  if (!storage) return '';
  try {
    const saved = storage.getItem(aiAskKey(role));
    if (saved === null) return '';
    storage.removeItem(aiAskKey(role));
    const value = JSON.parse(saved) as { text?: unknown; at?: unknown };
    const age = now - Number(value?.at);
    return age >= 0 && age <= ASK_LIFETIME ? cleanAiText(value?.text) : '';
  } catch {
    return '';
  }
}

// For a page that has no administrator dialog of its own: leaves the question and opens the chats page.
// On the map page call onAsk(text) instead: the dialog opens over the map.
export function askAdministratorInChats(role: Role, text: string) {
  leaveAiAsk(role, text);
  window.location.assign(administratorChatPath(role));
}
