type Row = Record<string, any>;

export type JobStepId = 'apply' | 'start' | 'report' | 'accept' | 'pick';
export type JobStep = { id: JobStepId; label: string };

// What the cleaner does next with a cleaning: answer an open one, start when the guest has left, send the report.
// The card of the job, the map of the site and the map of the app all offer this one step as their main button.
export function cleanerStep(job: Row | null | undefined, application: Row | undefined, userId: string): JobStep | null {
  if (!job) return null;
  if (job.status === 'open') return !application || application.status === 'rejected' ? { id: 'apply', label: 'Откликнуться' } : null;
  if (job.assigned_to !== userId) return null;
  if (job.status === 'assigned') return job.checkout_confirmed ? { id: 'start', label: 'Начать уборку' } : null;
  return job.status === 'in_progress' ? { id: 'report', label: 'Отправить отчёт' } : null;
}

// What the owner does next with a cleaning: choose among those who answered, accept the report.
export function ownerJobStep(job: Row | null | undefined, pending: number): JobStep | null {
  if (!job) return null;
  if (job.status === 'submitted') return { id: 'accept', label: 'Рассмотреть отчёт' };
  return job.status === 'open' && pending > 0 ? { id: 'pick', label: pending > 1 ? 'Выбрать исполнителя · ' + pending : 'Выбрать исполнителя' } : null;
}

// One line about a cleaning of the cleaner's day, in the cleaner's words.
export function cleanerLine(job: Row): string {
  if (job.status === 'submitted') return 'Отчёт у владельца на приёмке';
  if (job.status === 'in_progress') return 'Уборка идёт, подготовьте отчёт';
  return job.checkout_confirmed ? 'Гость выехал, можно начинать' : 'Ждём выезда гостя';
}
