'use client';
import type { NowCard as NowCardData } from '../lib/now-card';
import './map-home.css';

export { nowCard, nowCardWhen } from '../lib/now-card';
export type { NowCard as NowCardData, NowCardKind } from '../lib/now-card';

type NowCardProps = {
  /** Result of nowCard(); nothing is rendered for null. */
  card: NowCardData | null;
  /** With it the button calls back; without it the button is a link to card.href. */
  onOpen?: (card: NowCardData) => void;
  busy?: boolean;
  className?: string;
};

// The single most important thing for this person right now.
export function NowCard({ card, onOpen, busy = false, className }: NowCardProps) {
  if (!card) return null;
  return (
    <section className={'map-home-now' + (card.urgent ? ' is-urgent' : '') + (className ? ' ' + className : '')} aria-label="Сейчас">
      <div className="map-home-now-text">
        <span className="map-home-now-eyebrow">Сейчас</span>
        <strong className="map-home-now-title">{card.title}</strong>
        <span className="map-home-now-detail">{card.detail}</span>
      </div>
      {onOpen
        ? <button className="map-home-now-action" type="button" disabled={busy} onClick={() => onOpen(card)}>{card.actionLabel}</button>
        : card.href
          ? <a className="map-home-now-action" href={card.href}>{card.actionLabel}</a>
          : null}
    </section>
  );
}
