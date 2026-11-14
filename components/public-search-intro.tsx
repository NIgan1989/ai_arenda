'use client';
import {Thinking} from './thinking';
import { useEffect, useRef, type FormEvent, type PointerEvent, type Ref } from 'react';
import { CalendarCheck, ChevronDown, ChevronRight, Minus, Plus, SlidersHorizontal, Sparkles } from 'lucide-react';
import { AiLine, roleAiLine, type AiChip } from './ai-line';
import { NowCard, type NowCardData } from './now-card';
import { MAX_GUESTS, stayLine, switchStay } from '../lib/map-search-request';
import { WISHES, dayChoices, draftUnits, withDay, withTime, withUnits, type GuestDraft } from '../mobile/src/ai-request';
import './public-search-intro.css';

type Row = Record<string, any>;

/** A short message under the line: what was understood, or what went wrong. `ask` is a text the rules did not understand. */
export type SearchNote = { text: string; tone?: 'error'; ask?: string };
export type SearchFocus = { field: 'when' | 'city'; id: number };
/** `phoneOnly`: the same link is already in the header of a wide screen. */
export type SearchLink = { href: string; label: string; phoneOnly?: boolean };

type SearchIntroProps = {
  /** The page heading; only the public page has one. */
  title?: string;
  draft: Row;
  cities: string[];
  busy: boolean;
  expanded: boolean;
  onExpanded: (expanded: boolean) => void;
  note: SearchNote | null;
  /** The field to move to after a request that named no dates or no city. */
  focus: SearchFocus | null;
  card: NowCardData | null;
  onOpenCard?: (card: NowCardData) => void;
  /** The guest's own bookings: the row under the line that opens them on the map. */
  trips?: { label: string; hint?: string; onOpen: () => void };
  onText: (text: string) => void;
  onChip: (chip: AiChip) => void;
  onChange: (patch: Row) => void;
  onSubmit: () => void;
  /** Hands a text the search rules did not understand to the AI administrator, when the person asks for it. */
  onAsk?: (text: string) => void;
  askLabel?: string;
  /** The sparkle on the line: only where a text can really reach the AI administrator from here. */
  ai?: boolean;
  zoneNotice: string;
  onLocate: () => void;
  onPick: () => void;
  onClearZone: () => void;
  /** The one line under the main button. */
  fine: string;
  links?: SearchLink[];
  panelRef?: Ref<HTMLElement>;
};

// The first thing a guest or a visitor sees over the map: one line for a free request, three shortcuts,
// the "Сейчас" card and, behind "Уточнить", the same request as buttons, as in the app.
export function SearchIntro(props: SearchIntroProps) {
  const { expanded, onExpanded, note, busy } = props;
  const line = roleAiLine('guest');
  const drag = useSheetDrag(expanded, onExpanded);

  return (
    <section
      ref={props.panelRef}
      className="map-home-panel request-sheet"
      data-expanded={expanded ? 'true' : 'false'}
      aria-label="Запрос жилья"
    >
      <button
        type="button"
        className="map-home-handle"
        aria-label={expanded ? 'Свернуть' : 'Развернуть'}
        aria-expanded={expanded}
        {...drag}
      />
      {props.title && <h1 className="request-title">{props.title}</h1>}
      <AiLine
        placeholder={line.placeholder}
        shortPlaceholder={line.shortPlaceholder}
        label={line.label}
        icon={props.ai ? 'ai' : 'search'}
        chips={expanded ? [] : line.chips}
        busy={busy}
        keepText
        onSubmit={props.onText}
        onChip={props.onChip}
      />
      {note && (
        <div className={'request-note' + (note.tone === 'error' ? ' is-error' : '')} role={note.tone === 'error' ? 'alert' : 'status'}>
          <span>{note.text}</span>
          {note.ask && props.onAsk && (
            <button type="button" onClick={() => props.onAsk?.(note.ask as string)}>
              <Sparkles size={18} aria-hidden="true" />
              {props.askLabel || 'Спросить AI администратора'}
            </button>
          )}
        </div>
      )}
      {/* A note is the answer to what was just typed and takes the card's place while it is shown. On a short phone
          the card would leave too little of the map: there it waits in the opened sheet (see the styles). */}
      {!note && <NowCard card={props.card} onOpen={props.onOpenCard} />}
      {props.trips && !expanded && (
        <button type="button" className="map-home-refine request-trips" onClick={props.trips.onOpen}>
          <CalendarCheck size={18} aria-hidden="true" />
          <span className="request-trips-label">{props.trips.label}</span>
          {props.trips.hint && <span className="request-trips-hint">{props.trips.hint}</span>}
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      )}
      <button type="button" className="map-home-refine" aria-expanded={expanded} onClick={() => onExpanded(!expanded)}>
        <SlidersHorizontal size={18} aria-hidden="true" />
        Уточнить
        <ChevronDown size={18} aria-hidden="true" />
      </button>
      {expanded && (
        <div className="map-home-details">
          <RequestForm {...props} />
          {props.links && props.links.length > 0 && (
            <nav className="request-links" aria-label="О сервисе">
              {props.links.map(link => (
                <a key={link.href} className={link.phoneOnly ? 'is-phone-only' : undefined} href={link.href}>{link.label}</a>
              ))}
            </nav>
          )}
        </div>
      )}
    </section>
  );
}

// The same form as in the app (mobile/src/GuestForm.tsx): choices are buttons, numbers are steppers, the day is
// one of the week ahead. Free text in the line above fills the same conditions, so a day it named is chosen here too.
function RequestForm({ draft, cities, busy, focus, onChange, onSubmit, zoneNotice, onPick, onClearZone, fine }: SearchIntroProps) {
  const city = useRef<HTMLDivElement>(null), when = useRef<HTMLDivElement>(null);
  const hourly = draft.mode === 'hourly', guests = Math.max(1, Math.min(MAX_GUESTS, Number(draft.guests) || 1));
  const features: string[] = Array.isArray(draft.features) ? draft.features : [];
  const now = Date.now();
  const stay = draft as GuestDraft, units = draftUnits(stay);
  const startMinutes = Number(draft.start.slice(11, 13)) * 60 + Number(draft.start.slice(14, 16));
  const cityChoices = cities.includes(draft.city) || !draft.city ? cities : [draft.city, ...cities];

  useEffect(() => {
    if (!focus) return;
    (focus.field === 'city' ? city.current : when.current)?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: false });
  }, [focus?.id]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!busy) onSubmit();
  }
  const stayPatch = (next: GuestDraft) => ({ mode: next.mode, start: next.start, end: next.end });

  return (
    <form className="request-form" onSubmit={submit}>
      <Chips name="Срок аренды" value={draft.mode} options={[['daily', 'На сутки'], ['hourly', 'На часы']]} onChange={mode => draft.mode !== mode && onChange(switchStay(mode, draft.start, now))} />
      <Chips label="Город" value={draft.city} options={cityChoices.map(name => [name, name])} onChange={name => name !== draft.city && onChange({ city: name, district: '', near: null })} groupRef={city} />
      <Chips label="Когда" value={draft.start.slice(0, 10)} options={dayChoices(stay, now)} onChange={day => onChange(stayPatch(withDay(stay, day, now)))} groupRef={when} />
      <div className="request-pair">
        <Stepper label={hourly ? 'Начало' : 'Заезд'} value={startMinutes} text={clock(startMinutes)} min={0} max={1410} step={30} onChange={minutes => onChange(stayPatch(withTime(stay, clock(minutes), now)))} />
        <Stepper label={hourly ? 'Часов' : 'Суток'} value={units} text={String(units)} min={1} max={hourly ? 23 : 30} onChange={value => onChange(stayPatch(withUnits(stay, value, now)))} />
      </div>
      <p className="request-when-line" aria-live="polite">{stayLine(draft.start, draft.end, draft.mode)}</p>
      <div className="request-pair">
        <Stepper label="Гостей" value={guests} text={String(guests)} min={1} max={MAX_GUESTS} onChange={value => onChange({ guests: String(value) })} />
        <label className="request-field">
          <span>Бюджет на весь срок, ₸</span>
          <input className="request-input" name="maxPrice" inputMode="numeric" value={draft.maxPrice || ''} maxLength={9} placeholder="Любой" onChange={event => onChange({ maxPrice: event.target.value.replace(/\D/g, '') })} />
        </label>
      </div>
      <label className="request-field">
        <span>Район</span>
        <input className="request-input" name="district" value={draft.district || ''} maxLength={120} placeholder="Любой" onChange={event => onChange({ district: event.target.value })} />
      </label>
      <div className="request-field">
        <span>Обязательно в жилье</span>
        <div className="request-chips is-wrap" role="group" aria-label="Обязательно в жилье">
          {WISHES.map(([feature, label]) => {
            const on = features.includes(feature);
            return <button key={feature} type="button" role="checkbox" aria-checked={on} onClick={() => onChange({ features: on ? features.filter(value => value !== feature) : [...features, feature] })}>{label}</button>;
          })}
        </div>
      </div>
      <Chips label="Что важнее" value={draft.priority || 'balanced'} options={[['balanced', 'Баланс'], ['cheaper', 'Дешевле'], ['closer', 'Ближе']]} onChange={priority => onChange({ priority })} />
      <div className="request-zone">
        <span>{zoneNotice || 'Ищем по всему городу.'}</span>
        <button type="button" className="is-plain" disabled={busy} onClick={() => {
          if (draft.near) { onClearZone(); if (draft.priority === 'closer') onChange({ priority: 'balanced' }); }
          else onPick();
        }}>{draft.near ? 'Убрать точку' : 'Указать точку на карте'}</button>
      </div>
      <div className="request-submit">
        <p className="request-fine">{hourly ? '' : 'Выезд до 12:00. '}Депозит оплачивается отдельно.</p>
        <button type="submit" className="request-primary" disabled={busy} aria-busy={busy}>
          {busy && <Thinking size="sm" tone="plain" />}
          {busy ? 'Ищем…' : 'Показать варианты'}
        </button>
        <p className="request-fine">{fine}</p>
      </div>
    </form>
  );
}

const two = (value: number) => String(value).padStart(2, '0');
const clock = (minutes: number) => two(Math.floor(minutes / 60)) + ':' + two(minutes % 60);

// One choice of a few, as a row of buttons that scrolls sideways (the app's Chips).
function Chips<T extends string>({ label, name, value, options, onChange, groupRef }: { label?: string; name?: string; value: T; options: [T, string][]; onChange: (value: T) => void; groupRef?: Ref<HTMLDivElement> }) {
  return (
    <div className="request-field">
      {label && <span>{label}</span>}
      <div ref={groupRef} className="request-chips" role="radiogroup" aria-label={label || name}>
        {options.map(([id, title]) => <button key={id} type="button" role="radio" aria-checked={id === value} onClick={() => onChange(id)}>{title}</button>)}
      </div>
    </div>
  );
}

// A number changed by − and + (the app's Stepper).
function Stepper({ label, value, text, min, max, step = 1, onChange }: { label: string; value: number; text: string; min: number; max: number; step?: number; onChange: (value: number) => void }) {
  return (
    <div className="request-field" role="group" aria-label={label}>
      <span>{label}</span>
      <div className="request-stepper is-box">
        <button type="button" aria-label={label + ': меньше'} disabled={value <= min} onClick={() => onChange(Math.max(min, value - step))}><Minus size={18} aria-hidden="true" /></button>
        <output aria-live="polite">{text}</output>
        <button type="button" aria-label={label + ': больше'} disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))}><Plus size={18} aria-hidden="true" /></button>
      </div>
    </div>
  );
}

// The handle answers both a tap and a short drag up or down.
function useSheetDrag(expanded: boolean, onExpanded: (expanded: boolean) => void) {
  const origin = useRef<number | null>(null), dragged = useRef(false);
  return {
    onPointerDown(event: PointerEvent<HTMLButtonElement>) {
      origin.current = event.clientY;
      dragged.current = false;
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    onPointerMove(event: PointerEvent<HTMLButtonElement>) {
      if (origin.current === null) return;
      const shift = event.clientY - origin.current;
      if (Math.abs(shift) < 24) return;
      origin.current = null;
      dragged.current = true;
      onExpanded(shift < 0);
    },
    onPointerUp() {
      origin.current = null;
    },
    onPointerCancel() {
      origin.current = null;
    },
    onClick() {
      if (dragged.current) dragged.current = false;
      else onExpanded(!expanded);
    },
  };
}
