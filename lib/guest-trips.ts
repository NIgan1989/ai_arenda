import { checkinOpen, checkinOpensLabel } from './checkin-window';
import { wordsOf } from './stay-words';
import { recordSpan } from './record-span';
import { lateOpen, lateNote, lateLabel } from './late-arrival';

type Row = Record<string, any>;

// One of the guest's bookings as a row in the sheet of the map: what it is, when, and what it waits for.
export type GuestTrip = {
  id: string;
  title: string;
  start: number;
  when: string;
  status: string;
  tone: 'active' | 'warning' | 'success' | 'neutral';
  /** Still ahead or going on; false for a stay that is over, cancelled or was refused. */
  open: boolean;
};

const PAST: Record<string, string> = {
  completed: 'Проживание завершено', cancelled: 'Бронь отменена', rejected: 'Заявка отклонена', expired: 'Срок заявки истёк',
};

// What the booking waits for, in the guest's own words: the next thing the guest (or the owner) has to do.
function state(b: Row, now: number): Pick<GuestTrip, 'status' | 'tone'> {
  const w = wordsOf(b);
  if (b.status === 'requested') {
    return b.expires_at && b.expires_at <= now ? { status: PAST.expired, tone: 'neutral' } : { status: 'Ждём ответа владельца', tone: 'warning' };
  }
  if (b.status !== 'confirmed') {
    return b.status === 'completed' && !b.review_rating
      ? { status: w.rate, tone: 'active' }
      : { status: b.status === 'completed' ? w.done : PAST[b.status] || 'Бронь закрыта', tone: 'neutral' };
  }
  if (b.terms?.actual_checkout) return { status: w.done, tone: 'neutral' };
  if (b.end <= now) {
    return b.terms?.checkout_reported_at ? { status: w.leave + ' на проверке', tone: 'neutral' } : { status: 'Сообщите ' + w.ofLeave, tone: 'warning' };
  }
  if (b.terms?.actual_checkin) return { status: w.youAre, tone: 'success' };
  if (b.payment_status !== 'owner_verified') return { status: 'Ждёт оплаты', tone: 'warning' };
  if (b.terms?.deposit > 0 && b.terms?.deposit_status === 'pending') return { status: 'Ждёт депозита', tone: 'warning' };
  return b.start <= now ? { status: 'Время ' + w.arriveGen + ' наступило', tone: 'success' } : { status: 'Оплачено', tone: 'success' };
}

// The guest's bookings for the sheet of the map. What is going on or still ahead comes first, the nearest on top;
// under it the stays that are over, the latest first, and only a few of them: the sheet is not an archive.
export function guestTrips(data: Row | null | undefined, now: number, past = 5): GuestTrip[] {
  const userId = data?.user?.id;
  if (!userId) return [];
  const mine: Row[] = (data.bookings || []).filter((b: Row) => b.guest_id === userId);
  const open = (b: Row) => b.status === 'requested' ? b.expires_at === undefined || b.expires_at > now : b.status === 'confirmed' && !b.terms?.actual_checkout;
  const row = (b: Row, isOpen: boolean): GuestTrip => ({ id: b.id, title: b.title, start: b.start, when: recordSpan(b.start, b.end), ...state(b, now), open: isOpen });
  return [
    ...mine.filter(open).sort((a, b) => a.start - b.start).map(b => row(b, true)),
    ...mine.filter(b => !open(b)).sort((a, b) => b.start - a.start).slice(0, past).map(b => row(b, false)),
  ];
}

// «Мои брони · 2»: the number counts only what is still ahead or going on.
export function guestTripsLabel(trips: GuestTrip[]) {
  const open = trips.filter(trip => trip.open).length;
  return open ? 'Мои брони · ' + open : 'Мои брони';
}

export type GuestStepId = 'pay' | 'deposit' | 'late' | 'checkin' | 'checkout' | 'review';
export type GuestStep = { id: GuestStepId; label: string; disabled?: boolean; note?: string };

const money = (value: number) => new Intl.NumberFormat('ru-RU').format(value) + ' ₸';

// Everything the guest can do next with a booking, in the order it is done. The card of the booking shows all of
// it; the map shows only the first step that can be taken now (guestStep).
// What the guest still has to transfer to the owner: the unpaid part of the stay and a deposit not yet received.
// `reported` is true once the guest has said «Я оплатил» for everything that is due.
export function payDue(b: Row): { left: number; deposit: number; sum: number; reported: boolean } {
  const t = b.terms || {}, left = Math.max(0, Number(b.amount) - (Number(t.paid_amount) || 0));
  const deposit = Number(t.deposit) > 0 && t.deposit_status === 'pending' ? Number(t.deposit) : 0;
  return { left, deposit, sum: left + deposit, reported: (!left || !!t.payment_reported_at) && (!deposit || !!t.deposit_reported_at) };
}

export function guestSteps(b: Row, now: number, paymentMode?: string): GuestStep[] {
  const w = wordsOf(b);
  if (b.status === 'completed') return b.review_rating ? [] : [{ id: 'review', label: w.rateBtn }];
  if (b.status !== 'confirmed') return [];
  const steps: GuestStep[] = [];
  // The guest transfers the stay and the deposit straight to the owner and says so in one tap («Я оплатил»);
  // after that the step is the owner's (he checks the bank and confirms), so the guest sees no payment button.
  const due = payDue(b);
  if (due.sum > 0 && !due.reported) steps.push({ id: 'pay', label: 'Я оплатил ' + money(due.sum) });
  if (!b.terms?.actual_checkin && !b.terms?.checkin_reported_at && b.end > now) {
    steps.push({
      id: 'checkin', label: w.iAmIn,
      ...(checkinOpen(b.start, now, b.terms?.early_checkin_at) ? {} : { disabled: true, note: 'Кнопка станет активной за 15 минут до ' + w.arriveGen + ': ' + checkinOpensLabel(b.start, now, b.terms?.early_checkin_at) + '.' }),
    });
  }
  // «Задерживаюсь на час»: the guest warns the owner before the AI has to ask (lib/late-arrival.ts).
  const late = { start: b.start, end: b.end, arrival_eta: b.terms?.arrival_eta, late_count: b.terms?.late_count };
  if (!b.terms?.actual_checkin && !b.terms?.checkin_reported_at && lateOpen(late, now)) {
    steps.push({ id: 'late', label: lateLabel(late), note: lateNote(late, now) || undefined });
  }
  if (b.start <= now && !b.terms?.checkout_reported_at) steps.push({ id: 'checkout', label: 'Сообщить ' + w.ofLeave });
  return steps;
}

export function guestStep(b: Row | null | undefined, now: number, paymentMode?: string): GuestStep | null {
  return b ? guestSteps(b, now, paymentMode).find(step => !step.disabled && step.id !== 'late') || null : null;
}

// The guest's booking on the map: what it waits for, in one short label and a state colour.
// Yellow while a payment is due, green from the moment the check-in opens (15 minutes before the arrival),
// calm while the guest lives there. The step rules are guestSteps above.
export function guestPin(b: Row, now: number, paymentMode?: string): { label: string; tone: 'pending' | 'booked' | 'booking' } | null {
  if (b.status !== 'confirmed') return null;
  const clock = (at: number) => { const d = new Date((at + 5 * 3600) * 1000); return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0'); };
  const step = guestStep(b, now, paymentMode);
  if (step?.id === 'pay') return { label: 'Оплатить', tone: 'pending' };
  if (step?.id === 'checkin') return { label: wordsOf(b).canIn, tone: 'booked' };
  if (b.terms?.actual_checkin || b.terms?.checkin_reported_at) return { label: 'Вы здесь до ' + clock(b.end), tone: 'booking' };
  return { label: wordsOf(b).arrive + ' ' + clock(b.start), tone: 'booking' };
}
