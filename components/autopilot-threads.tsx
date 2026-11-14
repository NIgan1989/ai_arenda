'use client';
import { useMemo, useState } from 'react';
import {
  THREAD_BY, cleanerThreads, cleanerWeek, dayRibbon, lastAiMove, ownerThreads, ribbonX, threadClock, threadWhen, threadsSummary,
  type ProcessThread,
} from '../lib/process-threads';
import './autopilot-threads.css';

type Row = Record<string, any>;
type Props = {
  role: 'owner' | 'cleaner';
  data: Row | null | undefined;
  now: number;
  /** Открыть бронь или уборку целиком (карточка процесса). */
  onOpen: (kind: 'booking' | 'job', id: string) => void;
};

const FOLDED = 3;

// Нить шагов: пройденные точки зелёные (с переливом, если шаг сделал ИИ), текущая пульсирует.
function Rail({ t }: { t: ProcessThread }) {
  return (
    <span className="ap-rail" aria-hidden="true">
      {t.steps.map((s, i) => (
        <span key={s.key} className="ap-rail-part">
          <span className={'ap-dot is-' + s.state + (s.by === 'ai' ? ' is-ai' : '')} />
          {i < t.steps.length - 1 && (
            <span className="ap-line"><i style={{ width: (s.state === 'done' ? 100 : s.state === 'now' && typeof s.progress === 'number' ? Math.round(s.progress * 100) : 0) + '%' }} /></span>
          )}
        </span>
      ))}
    </span>
  );
}

// Все шаги дела сверху вниз: время, кто делает, что произошло.
function Steps({ t, now }: { t: ProcessThread; now: number }) {
  return (
    <ol className="ap-steps">
      {t.steps.map(s => (
        <li key={s.key} className={'ap-step is-' + s.state + (s.by === 'ai' ? ' is-ai' : '')}>
          <time>{s.at ? threadWhen(s.at, now) : ''}</time>
          <i aria-hidden="true" />
          <span className="ap-step-text">
            <span><b>{s.label}</b><span className={'ap-who' + (s.by === 'ai' ? ' is-ai' : '')}>{THREAD_BY[s.by]}</span></span>
            {(s.state === 'done' || s.state === 'now' || s.state === 'next') && s.note && <small>{s.note}</small>}
            {s.state === 'now' && typeof s.progress === 'number' && <span className="ap-bar"><i style={{ width: Math.round(s.progress * 100) + '%' }} /></span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

// Блок «Автопилот» в шторке карты: все брони и уборки владельца (задания исполнителя) от начала до конца и шаг,
// на котором каждое дело сейчас. У исполнителя сверху неделя и лента выбранного дня.
export function AutopilotThreads({ role, data, now, onOpen }: Props) {
  const [filter, setFilter] = useState<'all' | 'booking' | 'job'>('all');
  const [open, setOpen] = useState('');
  const [all, setAll] = useState(false);
  const threads = useMemo(() => role === 'owner' ? ownerThreads(data, now) : cleanerThreads(data, now), [role, data, now]);
  const week = useMemo(() => role === 'cleaner' ? cleanerWeek(data, now) : [], [role, data, now]);
  const [day, setDay] = useState<number | null>(null);
  const dayKey = day ?? week[0]?.key ?? 0;
  if (!data?.user?.id || (!threads.length && role === 'owner')) return null;

  const shown = threads.filter(t => filter === 'all' || t.kind === filter);
  const rows = all ? shown : shown.slice(0, FOLDED);
  const last = lastAiMove(data, role, now);
  const count = (kind: 'booking' | 'job') => threads.filter(t => t.kind === kind && !t.finished).length;
  const ribbon = role === 'cleaner' ? dayRibbon(threads, data, dayKey, now) : null;

  return (
    <section className="ap" aria-label="Автопилот">
      <div className="ap-head">
        <span className="ap-badge">✦ Автопилот</span>
        <span className="ap-sum">{threadsSummary(role, threads)}</span>
        <time className="ap-clock">{threadClock(now)}</time>
      </div>
      {last && <p className="ap-last"><b>✦ {threadClock(last.at)}</b><span>{last.text}{last.title ? ' · ' + last.title : ''}</span></p>}
      {role === 'owner' && (
        <div className="ap-filter" role="group" aria-label="Что показать">
          <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>Всё</button>
          <button type="button" aria-pressed={filter === 'booking'} onClick={() => setFilter('booking')}>Брони <span>{count('booking')}</span></button>
          <button type="button" aria-pressed={filter === 'job'} onClick={() => setFilter('job')}>Уборки <span>{count('job')}</span></button>
        </div>
      )}
      {role === 'cleaner' && (
        <>
          <div className="ap-week" role="group" aria-label="Неделя">
            {week.map(d => (
              <button key={d.key} type="button" aria-pressed={d.key === dayKey} aria-label={(d.today ? 'Сегодня, ' : '') + d.week + ' ' + d.date + ': уборок ' + d.count} onClick={() => setDay(d.key)}>
                <span>{d.week}</span><b>{d.date}</b><span className="ap-week-dots">{Array.from({ length: Math.min(3, d.count) }, (_, i) => <i key={i} />)}</span>
              </button>
            ))}
          </div>
          {ribbon && (
            <div className="ap-ribbon">
              <div className="ap-ticks" aria-hidden="true">{ribbon.ticks.map(t => <span key={t.at} style={{ left: ribbonX(ribbon, t.at) + '%' }}>{t.label}</span>)}</div>
              <div className="ap-track">
                {ribbon.bars.map(b => (
                  <button key={b.id} type="button" className={'ap-seg is-' + b.state} style={{ left: ribbonX(ribbon, b.from) + '%', width: Math.max(2, ribbonX(ribbon, b.to) - ribbonX(ribbon, b.from)) + '%' }}
                    aria-label={b.title + ', ' + b.label} title={b.title + ' · ' + b.label} onClick={() => { setOpen(b.id); setAll(true); }} />
                ))}
                {ribbon.now !== null && <span className="ap-now" style={{ left: ribbonX(ribbon, ribbon.now) + '%' }} />}
              </div>
              {!ribbon.bars.length && <p className="ap-empty">В этот день уборок нет</p>}
            </div>
          )}
        </>
      )}
      {rows.length > 0 && (
        <ul className="ap-rows">
          {rows.map(t => {
            const isOpen = open === t.id;
            return (
              <li key={t.kind + t.id} className={isOpen ? 'is-open' : undefined}>
                <button type="button" className="ap-row" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? '' : t.id)}>
                  <span className="ap-row-top">
                    <span className={'ap-tag' + (t.kind === 'booking' ? '' : ' is-job')}>{t.tag}</span>
                    <b>{t.title}</b>
                    <span className={'ap-status' + (t.finished ? ' is-done' : t.yours ? ' is-yours' : '')}>{t.status}</span>
                  </span>
                  <Rail t={t} />
                  <span className="ap-row-line">{t.line}</span>
                </button>
                {isOpen && (
                  <div className="ap-row-more">
                    <Steps t={t} now={now} />
                    <button type="button" className="ap-open" onClick={() => onOpen(t.kind, t.id)}>
                      {t.kind === 'booking' ? 'Открыть бронь' : t.tag === 'Задание' ? 'Открыть задание' : 'Открыть уборку'}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {!rows.length && <p className="ap-empty">{role === 'owner' ? (filter === 'job' ? 'Уборок сейчас нет' : 'Броней сейчас нет') : 'Когда вас назначат на уборку, она появится здесь'}</p>}
      {shown.length > FOLDED && (
        <button type="button" className="ap-more" onClick={() => setAll(v => !v)}>{all ? 'Свернуть' : 'Ещё ' + (shown.length - FOLDED)}</button>
      )}
    </section>
  );
}
