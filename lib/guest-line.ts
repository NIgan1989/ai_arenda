import {t} from './i18n';
// One line under the guest's booking card: what the guest does now, or what the booking waits for.
// The steps are guestSteps (lib/guest-trips.ts); null leaves the card with the general hint of the process.
import { guestSteps, payDue } from './guest-trips';
import { threadWhen } from './process-threads';
import { wordsOf } from './stay-words';

type Row = Record<string, any>;

export function guestLine(b: Row | null | undefined, now: number, paymentMode?: string): string | null {
  if (!b) return null;
  if (b.status === 'requested') return t('Ждём ответа владельца.');
  const step = guestSteps(b, now, paymentMode).find(s => s.id !== 'late');
  if (!step) return null;
  const w = wordsOf(b);
  // The guest transfers the stay and the refundable deposit to the owner directly and says «Я оплатил».
  if (step.id === 'pay') return (payDue(b).left > 0 ? (payDue(b).deposit ? t('Переведите владельцу оплату и депозит') : t('Переведите оплату владельцу')) : t('Переведите владельцу депозит, он вернётся {afterLeave}',{afterLeave:w.afterLeave})) + ' → ' + w.arrive + ' ' + threadWhen(b.start, now);
  if (step.id === 'checkin') {
    // The owner confirms the check-in only after the payment, the deposit and the readiness of the home:
    // «Всё готово» is said when all three are there, otherwise the line names what is still waited for.
    const arrive = ' → ' + w.arrive + ' ' + threadWhen(b.start, now);
    if (b.payment_status !== 'owner_verified') return t('Владелец проверяет перевод и подтвердит оплату') + arrive;
    if (b.terms?.deposit > 0 && b.terms?.deposit_status === 'pending') return t('Владелец проверяет перевод и подтвердит депозит') + arrive;
    return b.readiness === 'ready' ? t('Всё готово') + arrive : null;
  }
  if (step.id === 'checkout') return w.youInside + ' → ' + w.leave + ' ' + threadWhen(b.end, now);
  return t('{done}. Оцените его, это помогает другим гостям.',{done:w.done});
}
