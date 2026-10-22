import type { Role } from './domain';

type Row = Record<string, any>;
export type OperationEvent = {
  id: string; entityId: string; kind: 'booking' | 'job';
  title: string; detail: string; at: number; urgent: boolean;
};

// Build each participant's view from authorised records, never from chat text.
export function operationOverview(data: Row, userId: string, role: Role, now: number) {
  const bookings: Row[] = (data.bookings || []).filter((b: Row) =>
    (role === 'owner' ? b.owner_id === userId : role === 'guest' && b.guest_id === userId) &&
    (b.status === 'confirmed' || (b.status === 'requested' && b.expires_at > now)));
  const jobs: Row[] = (data.jobs || []).filter((j: Row) =>
    (role === 'owner' ? j.owner_id === userId : role === 'cleaner' && j.assigned_to === userId) &&
    ['open', 'assigned', 'in_progress', 'submitted'].includes(j.status));
  const attention: OperationEvent[] = [], upcoming: OperationEvent[] = [];
  const bookingEvent = (b: Row, title: string, at: number, urgent = false): OperationEvent =>
    ({ id: `booking:${b.id}:${title}`, entityId: b.id, kind: 'booking', title, detail: b.title, at, urgent });
  for (const b of bookings) {
    if (b.status === 'requested') {
      const event = bookingEvent(b, role === 'owner' ? 'Подтвердить заявку' : 'Ожидается решение владельца', b.expires_at, role === 'owner');
      (role === 'owner' ? attention : upcoming).push(event);
    } else if (b.end <= now && !b.terms?.actual_checkout) {
      attention.push(bookingEvent(b,role==='owner'?'Проверить фактический выезд':'Уточнить завершение проживания',b.end,true));
    } else if (b.end > now) {
      upcoming.push(bookingEvent(b, b.start > now ? 'Заезд' : 'Выезд', b.start > now ? b.start : b.end));
      if (role === 'owner' && b.payment_status !== 'owner_verified')
        attention.push(bookingEvent(b, 'Проверить поступление оплаты', b.start));
    }
  }
  for (const j of jobs) {
    const late = j.status !== 'submitted' && j.end <= now;
    const title = j.status === 'submitted' ? (role === 'owner' ? 'Проверить отчёт об уборке' : 'Отчёт ожидает приёмки') :
      late ? 'Срок уборки прошёл' : j.status === 'open' ? 'Найти исполнителя' : j.status === 'in_progress' ? 'Уборка в работе' : 'Уборка назначена';
    const event: OperationEvent = { id: `job:${j.id}`, entityId: j.id, kind: 'job', title, detail: j.title,
      at: j.status === 'in_progress' || j.status === 'submitted' || late ? j.end : j.start, urgent: late };
    ((j.status === 'submitted' && role === 'owner') || late || (j.status === 'open' && role === 'owner') ? attention : upcoming).push(event);
  }
  const byTime = (a: OperationEvent, b: OperationEvent) => Number(b.urgent) - Number(a.urgent) || a.at - b.at;
  return {
    role, generatedAt: now,
    activeBookings: bookings.filter(b => b.status === 'requested' || !b.terms?.actual_checkout).length,
    activeJobs: jobs.length,
    unread: (data.notifications || []).filter((n: Row) => !n.read).length,
    attention: attention.sort(byTime), upcoming: upcoming.sort(byTime),
  };
}
