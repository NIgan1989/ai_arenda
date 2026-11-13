import { checkinOpen, checkinOpensLabel } from './checkin-window';
import { recordSpan } from './record-span';

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
  if (b.status === 'requested') {
    return b.expires_at && b.expires_at <= now ? { status: PAST.expired, tone: 'neutral' } : { status: 'Ждём ответа владельца', tone: 'warning' };
  }
  if (b.status !== 'confirmed') {
    return b.status === 'completed' && !b.review_rating
      ? { status: 'Оцените проживание', tone: 'active' }
      : { status: PAST[b.status] || 'Бронь закрыта', tone: 'neutral' };
  }
  if (b.terms?.actual_checkout) return { status: PAST.completed, tone: 'neutral' };
  if (b.end <= now) {
    return b.terms?.checkout_reported_at ? { status: 'Выезд на проверке', tone: 'neutral' } : { status: 'Сообщите о выезде', tone: 'warning' };
  }
  if (b.terms?.actual_checkin) return { status: 'Вы заселены', tone: 'success' };
  if (b.payment_status !== 'owner_verified') return { status: 'Ждёт оплаты', tone: 'warning' };
  if (b.terms?.deposit > 0 && b.terms?.deposit_status === 'pending') return { status: 'Ждёт депозита', tone: 'warning' };
  return b.start <= now ? { status: 'Время заезда наступило', tone: 'success' } : { status: 'Оплачено', tone: 'success' };
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

export type GuestStepId = 'pay' | 'deposit' | 'checkin' | 'checkout' | 'review';
export type GuestStep = { id: GuestStepId; label: string; disabled?: boolean; note?: string };

const money = (value: number) => new Intl.NumberFormat('ru-RU').format(value) + ' ₸';

// Everything the guest can do next with a booking, in the order it is done. The card of the booking shows all of
// it; the map shows only the first step that can be taken now (guestStep).
export function guestSteps(b: Row, now: number, paymentMode?: string): GuestStep[] {
  if (b.status === 'completed') return b.review_rating ? [] : [{ id: 'review', label: 'Оценить проживание' }];
  if (b.status !== 'confirmed') return [];
  const steps: GuestStep[] = [], left = b.amount - (b.terms?.paid_amount || 0);
  if (paymentMode === 'test' && left > 0) steps.push({ id: 'pay', label: 'Оплатить ' + money(left) });
  if (paymentMode === 'test' && b.terms?.deposit > 0 && b.terms?.deposit_status === 'pending') {
    steps.push({ id: 'deposit', label: 'Внести депозит ' + money(b.terms.deposit) });
  }
  if (!b.terms?.actual_checkin && !b.terms?.checkin_reported_at && b.end > now) {
    steps.push({
      id: 'checkin', label: 'Я заселился',
      ...(checkinOpen(b.start, now) ? {} : { disabled: true, note: 'Кнопка станет активной за 15 минут до заезда: ' + checkinOpensLabel(b.start, now) + '.' }),
    });
  }
  if (b.start <= now && !b.terms?.checkout_reported_at) steps.push({ id: 'checkout', label: 'Сообщить о выезде' });
  return steps;
}

export function guestStep(b: Row | null | undefined, now: number, paymentMode?: string): GuestStep | null {
  return b ? guestSteps(b, now, paymentMode).find(step => !step.disabled) || null : null;
}

// The guest's booking on the map: what it waits for, in one short label and a state colour.
// Yellow while a payment is due, green from the moment the check-in opens (15 minutes before the arrival),
// calm while the guest lives there. The step rules are guestSteps above.
export function guestPin(b: Row, now: number, paymentMode?: string): { label: string; tone: 'pending' | 'booked' | 'booking' } | null {
  if (b.status !== 'confirmed') return null;
  const clock = (at: number) => { const d = new Date((at + 5 * 3600) * 1000); return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0'); };
  const step = guestStep(b, now, paymentMode);
  if (step?.id === 'pay' || step?.id === 'deposit') return { label: step.id === 'pay' ? 'Оплатить' : 'Внести депозит', tone: 'pending' };
  if (step?.id === 'checkin') return { label: 'Можно заселяться', tone: 'booked' };
  if (b.terms?.actual_checkin || b.terms?.checkin_reported_at) return { label: 'Вы здесь до ' + clock(b.end), tone: 'booking' };
  return { label: 'Заезд ' + clock(b.start), tone: 'booking' };
}
