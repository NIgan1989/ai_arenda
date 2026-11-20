// One line under the guest's booking card: what the guest does now, or what the booking waits for.
// The steps are guestSteps (lib/guest-trips.ts); null leaves the card with the general hint of the process.
import { guestSteps, payDue } from './guest-trips';
import { threadWhen } from './process-threads';
import { wordsOf } from './stay-words';
import { dueNow, prepayOf } from './prepay';

type Row = Record<string, any>;

export function guestLine(b: Row | null | undefined, now: number, paymentMode?: string): string | null {
  if (!b) return null;
  if (b.status === 'requested') return 'Ждём ответа владельца.';
  const step = guestSteps(b, now, paymentMode).find(s => s.id !== 'late');
  if (!step) return null;
  const w = wordsOf(b);
  // The guest transfers the stay and the refundable deposit to the owner directly and says «Я оплатил».
  if (step.id === 'pay') return (payDue(b, now).left > 0 ? (payDue(b, now).deposit ? 'Переведите владельцу оплату и депозит' : 'Переведите оплату владельцу') : 'Переведите владельцу депозит, он вернётся ' + w.afterLeave) + ' → ' + w.arrive + ' ' + threadWhen(b.start, now);
  if (step.id === 'checkin') {
    // The owner confirms the check-in only after the payment, the deposit and the readiness of the home:
    // «Всё готово» is said when all three are there, otherwise the line names what is still waited for.
    const arrive = ' → ' + w.arrive + ' ' + threadWhen(b.start, now);
    // Paid at the arrival (lib/prepay.ts): nothing is owed yet, the details open 15 minutes before it.
    if (b.payment_status !== 'owner_verified' && dueNow(b, now).phase === 'prepay') return (prepayOf(b.terms) ? (dueNow(b, now).sum ? 'Владелец проверяет перевод предоплаты' : 'Предоплата получена, остальное при заселении') : 'Оплата при заселении: реквизиты откроются за 15 минут до ' + w.arriveGen) + arrive;
    if (b.payment_status !== 'owner_verified') return 'Владелец проверяет перевод и подтвердит оплату' + arrive;
    if (b.terms?.deposit > 0 && b.terms?.deposit_status === 'pending') return 'Владелец проверяет перевод и подтвердит депозит' + arrive;
    return b.readiness === 'ready' ? 'Всё готово' + arrive : null;
  }
  if (step.id === 'checkout') return w.youInside + ' → ' + w.leave + ' ' + threadWhen(b.end, now);
  return w.done + '. Оцените его, это помогает другим гостям.';
}
