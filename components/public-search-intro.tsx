'use client';
import {Thinking} from './thinking';
import { useEffect, useId, useRef, useState, type FormEvent, type PointerEvent, type Ref } from 'react';
import { ChevronDown, LocateFixed, MapPin, Minus, Plus, SlidersHorizontal, Sparkles } from 'lucide-react';
import { AiLine, roleAiLine, type AiChip } from './ai-line';
import { NowCard, type NowCardData } from './now-card';
import {
  CHECKOUT_TIME, HOUR_CHOICES, MAX_GUESTS, addDays, dailyStay, hourlyStay, kzToday, startTimes, stayHours, stayLine, switchStay,
} from '../lib/map-search-request';
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
  /** Opens the map of the guest's own stay: the route to the flat and location sharing. */
  onRoute?: () => void;
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

const WISHES: [string, string][] = [['parking', 'Парковка'], ['wifi', 'Wi-Fi'], ['kitchen', 'Кухня'], ['workspace', 'Рабочее место']];
const DAY = 86400000;
// How far ahead a stay can start, and how long it can be, in days. The service takes stays of up to 90 days.
const FAR_AHEAD = 365;
const LONGEST_STAY = 90;

// The first thing a guest or a visitor sees over the map: one line for a free request, three shortcuts,
// the "Сейчас" card and, behind "Уточнить", the same request as ordinary fields.
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
      {!note && props.onRoute && props.card?.entityKind === 'booking' && (
        <button type="button" className="smart-route" onClick={props.onRoute}>
          Маршрут и заселение
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

function RequestForm({ draft, cities, busy, focus, onChange, onSubmit, zoneNotice, onLocate, onPick, onClearZone, fine }: SearchIntroProps) {
  const id = useId();
  const city = useRef<HTMLInputElement>(null), when = useRef<HTMLInputElement>(null);
  const hourly = draft.mode === 'hourly', guests = Math.max(1, Math.min(MAX_GUESTS, Number(draft.guests) || 1));
  const features: string[] = Array.isArray(draft.features) ? draft.features : [];
  // District, budget and wishes stay folded until one of them is set.
  const extras = !!(draft.near || draft.district || draft.maxPrice || features.length || draft.priority !== 'balanced');
  const [more, setMore] = useState(extras);
  // Read once per render: the fields only need "now" to hide times that have passed.
  const now = Date.now();

  useEffect(() => {
    if (!focus) return;
    (focus.field === 'city' ? city.current : when.current)?.focus({ preventScroll: false });
  }, [focus?.id]);

  useEffect(() => {
    if (extras) setMore(true);
  }, [extras]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!busy) onSubmit();
  }

  return (
    <form className="request-form" onSubmit={submit}>
      <div className="request-segment" role="group" aria-label="Срок аренды">
        {([['daily', 'На сутки'], ['hourly', 'На часы']] as const).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            aria-pressed={draft.mode === mode}
            onClick={() => draft.mode !== mode && onChange(switchStay(mode, draft.start, now))}
          >
            {label}
          </button>
        ))}
      </div>

      <label className="request-field">
        <span>Город</span>
        <input
          ref={city}
          className="request-input"
          name="city"
          value={draft.city}
          maxLength={80}
          required
          autoComplete="address-level2"
          list={id + 'cities'}
          onChange={event => onChange({ city: event.target.value })}
        />
        <datalist id={id + 'cities'}>{cities.map(name => <option key={name}>{name}</option>)}</datalist>
      </label>

      <fieldset className="request-when">
        <legend>Когда</legend>
        {hourly
          ? <HourlyFields draft={draft} now={now} onChange={onChange} first={when} />
          : <DailyFields draft={draft} now={now} onChange={onChange} first={when} />}
        <p className="request-when-line" aria-live="polite">{stayLine(draft.start, draft.end, draft.mode)}</p>
      </fieldset>

      <div className="request-guests" role="group" aria-labelledby={id + 'guests'}>
        <span id={id + 'guests'}>Гостей</span>
        <div className="request-stepper">
          <button type="button" aria-label="Меньше гостей" disabled={guests <= 1} onClick={() => onChange({ guests: String(guests - 1) })}>
            <Minus size={18} aria-hidden="true" />
          </button>
          <output aria-live="polite">{guests}</output>
          <button type="button" aria-label="Больше гостей" disabled={guests >= MAX_GUESTS} onClick={() => onChange({ guests: String(guests + 1) })}>
            <Plus size={18} aria-hidden="true" />
          </button>
        </div>
      </div>

      <button type="button" className="request-more" aria-expanded={more} onClick={() => setMore(!more)}>
        Район, бюджет и пожелания
        <ChevronDown size={18} aria-hidden="true" />
      </button>
      {more && (
        <div className="request-extras">
          <div className="request-pair">
            <label className="request-field">
              <span>Район</span>
              <input
                className="request-input"
                name="district"
                value={draft.district || ''}
                maxLength={120}
                placeholder="Любой"
                onChange={event => onChange({ district: event.target.value })}
              />
            </label>
            <label className="request-field">
              <span>Бюджет на весь срок, ₸</span>
              <input
                className="request-input"
                name="maxPrice"
                inputMode="numeric"
                value={draft.maxPrice || ''}
                maxLength={9}
                placeholder="Любой"
                onChange={event => onChange({ maxPrice: event.target.value.replace(/\D/g, '') })}
              />
            </label>
          </div>
          <label className="request-field">
            <span>Что важнее</span>
            <select className="request-input" value={draft.priority} onChange={event => onChange({ priority: event.target.value })}>
              <option value="balanced">Цена и расположение</option>
              <option value="cheaper">Дешевле</option>
              <option value="closer">Ближе к выбранному месту</option>
            </select>
          </label>
          <div className="request-checks" role="group" aria-label="Что должно быть в квартире">
            {WISHES.map(([feature, label]) => (
              <label key={feature}>
                <input
                  type="checkbox"
                  checked={features.includes(feature)}
                  onChange={event => onChange({ features: event.target.checked ? [...features, feature] : features.filter(value => value !== feature) })}
                />
                {label}
              </label>
            ))}
          </div>
          <div className="request-zone">
            <button type="button" disabled={busy} onClick={onLocate}>
              <LocateFixed size={18} aria-hidden="true" />
              Рядом со мной
            </button>
            <button type="button" onClick={onPick}>
              <MapPin size={18} aria-hidden="true" />
              Указать на карте
            </button>
            {draft.near && <button type="button" className="is-plain" onClick={onClearZone}>Убрать место</button>}
          </div>
          {zoneNotice && <p className="request-zone-note" role="status">{zoneNotice}</p>}
        </div>
      )}

      <div className="request-submit">
        <button type="submit" className="request-primary" disabled={busy} aria-busy={busy}>
          {busy && <Thinking size="sm" tone="plain" />}
          Подобрать жильё
        </button>
        <p className="request-fine">{fine}</p>
      </div>
    </form>
  );
}

type WhenProps = { draft: Row; now: number; onChange: (patch: Row) => void; first: Ref<HTMLInputElement> };

type DateInputProps = {
  name: string;
  value: string;
  min: string;
  max: string;
  onDate: (date: string) => void;
  inputRef?: Ref<HTMLInputElement>;
};

// A date that can be picked and can be typed. While it is typed the browser reports every step on the way
// ("02" before "20", the year "0002" before "2026"). The field keeps such a step on the screen and passes on only
// a whole date between min and max, so a day that has passed is never turned into another one behind the guest's
// back. Leaving the field with anything else brings back the last date that was taken.
function DateInput({ name, value, min, max, onDate, inputRef }: DateInputProps) {
  const [typed, setTyped] = useState<string | null>(null);
  return (
    <input
      ref={inputRef}
      className="request-input"
      type="date"
      lang="ru"
      name={name}
      required
      min={min}
      max={max}
      value={typed ?? value}
      onChange={event => {
        const date = event.target.value;
        if (/^\d{4}-\d{2}-\d{2}$/.test(date) && date >= min && date <= max) {
          setTyped(null);
          onDate(date);
        } else {
          setTyped(date);
        }
      }}
      onBlur={() => setTyped(null)}
    />
  );
}

// A daily stay is two dates: in at 14:00, out at 12:00 (see dailyStay).
function DailyFields({ draft, now, onChange, first }: WhenProps) {
  const today = kzToday(now), checkin = draft.start.slice(0, 10), checkout = draft.end.slice(0, 10);
  const nights = Math.max(1, Math.round((Date.parse(checkout) - Date.parse(checkin)) / DAY));
  // Check-out is at noon: the same day only for a check-in after midnight, otherwise the next day at the earliest.
  const firstCheckout = draft.start.slice(11) < CHECKOUT_TIME ? checkin : addDays(checkin, 1);
  return (
    <div className="request-pair">
      <label className="request-field">
        <span>Заезд</span>
        <DateInput
          inputRef={first}
          name="checkin"
          min={today}
          max={addDays(today, FAR_AHEAD)}
          value={checkin}
          onDate={date => onChange(dailyStay(date, addDays(date, nights), now))}
        />
      </label>
      <label className="request-field">
        <span>Выезд</span>
        <DateInput
          name="checkout"
          min={firstCheckout}
          max={addDays(checkin, LONGEST_STAY)}
          value={checkout}
          onDate={date => onChange(dailyStay(checkin, date, now, draft.start.slice(11)))}
        />
      </label>
    </div>
  );
}

// An hourly stay is a date, a start time and a length: nobody types the end.
function HourlyFields({ draft, now, onChange, first }: WhenProps) {
  const today = kzToday(now), date = draft.start.slice(0, 10), time = draft.start.slice(11);
  const hours = stayHours(draft.start, draft.end);
  const lengths = HOUR_CHOICES.includes(hours) ? HOUR_CHOICES : [...HOUR_CHOICES, hours].sort((a, b) => a - b);

  function moveTo(nextDate: string) {
    // The same hour on the new day, or the first one still ahead.
    const ahead = startTimes(nextDate, now);
    onChange(hourlyStay(nextDate, ahead.includes(time) ? time : ahead[0] || time, hours));
  }

  return (
    <>
      <div className="request-pair">
        <label className="request-field">
          <span>Дата</span>
          <DateInput inputRef={first} name="date" min={today} max={addDays(today, FAR_AHEAD)} value={date} onDate={moveTo} />
        </label>
        <label className="request-field">
          <span>Начало</span>
          <select className="request-input" name="time" value={time} onChange={event => onChange(hourlyStay(date, event.target.value, hours))}>
            {startTimes(date, now, time).map(value => <option key={value}>{value}</option>)}
          </select>
        </label>
      </div>
      <div className="request-hours" role="group" aria-label="На сколько часов">
        {lengths.map(length => (
          <button key={length} type="button" aria-pressed={length === hours} onClick={() => onChange(hourlyStay(date, time, length))}>
            {length} ч
          </button>
        ))}
      </div>
    </>
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
