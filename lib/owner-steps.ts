import { checkinOpen } from './checkin-window';

type Row = Record<string, any>;

export type OwnerStepId = 'answer' | 'checkin' | 'checkout-review' | 'deposit' | 'paid' | 'checkout';
export type OwnerStep = { id: OwnerStepId; label: string };

// Everything the owner can do next with a booking, the most pressing first. The card of the booking shows all of
// it; the map shows the first one as its main button (ownerStep), so a request is answered without opening the card.
export function ownerSteps(b: Row, now: number): OwnerStep[] {
  if (b.status === 'requested') return [{ id: 'answer', label: 'Рассмотреть заявку' }];
  if (b.status !== 'confirmed') return [];
  const steps: OwnerStep[] = [];
  if (checkinOpen(b.start, now) && !b.terms?.actual_checkin) steps.push({ id: 'checkin', label: 'Подтвердить заселение' });
  if (b.terms?.checkout_reported_at) steps.push({ id: 'checkout-review', label: 'Рассмотреть выезд' });
  if (b.terms?.deposit_status === 'pending') steps.push({ id: 'deposit', label: 'Подтвердить депозит' });
  if (b.payment_status !== 'owner_verified') steps.push({ id: 'paid', label: 'Отметить оплату' });
  if (!b.terms?.checkout_reported_at && b.start <= now) steps.push({ id: 'checkout', label: 'Подтвердить выезд' });
  return steps;
}

export function ownerStep(b: Row | null | undefined, now: number): OwnerStep | null {
  return b ? ownerSteps(b, now)[0] || null : null;
}

// On the map the request is answered, not "considered": the button says what the owner is about to do.
export const ownerStepOnMap = (step: OwnerStep) => step.id === 'answer' ? 'Ответить на заявку' : step.label;
