import {t,forms,L} from './i18n';
// «Передать ИИ»: what the feed offers a person who still does by hand what the AI administrator can do.
// The state is /api/operations/autopilot/state (lib/autopilot-plans.ts). null: nothing to offer.
type Row = Record<string, any>;

const money = (n: number) => new Intl.NumberFormat('ru-RU').format(n || 0) + ' ₸';
const hhmm = (m: number) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
const DAYS = L(['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']);

// The rules the AI takes cleanings by until the performer sets their own: the same start as the plan's screen.
export const CLEANER_RULES = { districts: [] as string[], days: 63, fromMinute: 600, toMinute: 1140, minFee: 0, maxPerDay: 4, askNewOwner: true };

export function planPrice(settings: Row | null | undefined, units: number, role: 'owner' | 'cleaner') {
  const s = settings || {}, sum = money(Number(s.price || 0) * (role === 'owner' ? Math.max(1, units) : 1));
  if (!s.charge) return t('Плата пока не взимается.');
  return s.trialDays ? t(forms(s.trialDays, 'Первые {days} день бесплатно, потом {sum} в месяц с привязанной карты.', 'Первые {days} дня бесплатно, потом {sum} в месяц с привязанной карты.', 'Первые {days} дней бесплатно, потом {sum} в месяц с привязанной карты.'), { days: s.trialDays, sum }) : t('{sum} в месяц с привязанной карты.', { sum });
}

export type OwnerHandoff = { title: string; line: string; ready: Row[]; needFee: Row[]; notReady: Row[]; price: string };
export function ownerHandoff(state: Row | null | undefined): OwnerHandoff | null {
  const manual: Row[] = (state?.flats || []).filter((f: Row) => !f.managed);
  if (!manual.length) return null;
  const ready = manual.filter(f => f.ready), notReady = manual.filter(f => !f.ready);
  const needFee = ready.filter(f => !f.ownStaff && !(Number(f.cleaningFee) >= 100));
  const n = manual.length;
  return {
    title: n === 1 ? t('«{title}» вы ведёте сами',{title:manual[0].title}) : t(forms(n, 'Вы сами ведёте {n} объект', 'Вы сами ведёте {n} объекта', 'Вы сами ведёте {n} объектов'), { n }),
    line: t('ИИ ответит гостям, подтвердит заезд и выезд, закажет и примет уборку.'),
    ready, needFee, notReady, price: planPrice(state?.settings, ready.length, 'owner'),
  };
}

export function rulesLine(rules: Row) {
  const days = [0, 1, 2, 3, 4, 5, 6].filter(i => Number(rules.days) >> i & 1).map(i => DAYS[i]);
  return [
    rules.districts?.length ? rules.districts.join(', ') : t('Любой район'),
    days.length === 7 ? t('каждый день') : days.join(', '),
    hhmm(Number(rules.fromMinute)) + '–' + hhmm(Math.min(Number(rules.toMinute), 1439)),
    t(forms(Number(rules.maxPerDay), 'до {n} уборки в день', 'до {n} уборок в день', 'до {n} уборок в день'), { n: rules.maxPerDay }),
    Number(rules.minFee) > 0 ? t('от {sum}', { sum: money(Number(rules.minFee)) }) : '',
  ].filter(Boolean).join(' · ');
}

export type CleanerHandoff = { title: string; line: string; rules: Row; rulesText: string; price: string };
export function cleanerHandoff(state: Row | null | undefined): CleanerHandoff | null {
  if (!state || state.live) return null;
  const rules = state.rules ? { ...CLEANER_RULES, ...state.rules } : CLEANER_RULES;
  return {
    title: t('ИИ может брать уборки за вас'),
    line: t('По вашим правилам. Вам останется приехать и убрать.'),
    rules, rulesText: rulesLine(rules), price: planPrice(state.settings, 1, 'cleaner'),
  };
}
