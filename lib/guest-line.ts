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
  // One payment covers the stay and the refundable deposit.
  if (step.id === 'pay') return (b.terms?.deposit > 0 && b.terms?.deposit_status === 'pending' ? 'Оплатите бронь и депозит одним платежом' : 'Оплатите бронь, чтобы она не снялась') + ' → Заезд ' + threadWhen(b.start, now);
  if (step.id === 'deposit') return 'Внесите депозит, он вернётся после выезда → Заезд ' + threadWhen(b.start, now);
  if (step.id === 'checkin') {
    // The owner confirms the check-in only after the payment, the deposit and the readiness of the home:
    // «Всё готово» is said when all three are there, otherwise the line names what is still waited for.
    const arrive = ' → Заезд ' + threadWhen(b.start, now);
    if (b.payment_status !== 'owner_verified') return 'Ждём, когда владелец подтвердит оплату' + arrive;
    if (b.terms?.deposit > 0 && b.terms?.deposit_status === 'pending') return 'Ждём, когда владелец подтвердит депозит' + arrive;
    return b.readiness === 'ready' ? 'Всё готово' + arrive : null;
  }
  if (step.id === 'checkout') return 'Вы в жилье → Выезд ' + threadWhen(b.end, now);
  return 'Проживание завершено. Оцените его, это помогает другим гостям.';
}
