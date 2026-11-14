// One line under the guest's booking card: what the guest does now, or what the booking waits for.
// The steps are guestSteps (lib/guest-trips.ts); null leaves the card with the general hint of the process.
import { guestSteps } from './guest-trips';
import { threadWhen } from './process-threads';

type Row = Record<string, any>;

export function guestLine(b: Row | null | undefined, now: number, paymentMode?: string): string | null {
  if (!b) return null;
  if (b.status === 'requested') return 'Ждём ответа владельца.';
  const step = guestSteps(b, now, paymentMode).find(s => s.id !== 'late');
  if (!step) return null;
  if (step.id === 'pay') return 'Оплатите бронь, чтобы она не снялась → Заезд ' + threadWhen(b.start, now);
  if (step.id === 'deposit') return 'Внесите депозит, он вернётся после выезда → Заезд ' + threadWhen(b.start, now);
  if (step.id === 'checkin') return 'Всё готово → Заезд ' + threadWhen(b.start, now);
  if (step.id === 'checkout') return 'Вы в жилье → Выезд ' + threadWhen(b.end, now);
  return 'Проживание завершено. Оцените его, это помогает другим гостям.';
}
