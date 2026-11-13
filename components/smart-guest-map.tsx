'use client';
import { goWorkspace } from '../lib/workspace-go';
import {Thinking} from './thinking';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowUpRight, LocateFixed, Pencil } from 'lucide-react';
import { MapCanvas } from './map-canvas';
import { beams } from '../mobile/src/map-motion';
import { pinsOf } from '../lib/map-pin-of';
import { PropertyListing } from './property-listing';
import { PropertyCover } from './property-cover';
import { BookingRequest } from './booking-request';
import { SearchIntro, type SearchFocus, type SearchLink, type SearchNote } from './public-search-intro';
import { nowCard, type NowCardData } from './now-card';
import { administratorChatPath, askAdministratorInChats, cleanAiText, leaveAiAsk, type AiChip } from '../lib/ai-line';
import { mapCities, cityNearLocation } from '../lib/map-location';
import { requestBrowserLocation, type BrowserLocationFix } from '../lib/browser-location';
import {
  MAX_GUESTS, NO_BUDGET, defaultStay, freshStay, guestRequestLine, guestSearchRequest, mapSearchFilters, plural, unbrokenParts, weekendStay,
  type GuestSearch, type GuestStay,
} from '../lib/map-search-request';
import './smart-map.css';

type Row = Record<string, any>;
type Stage = 'request' | 'search' | 'result' | 'detail' | 'book';

type SmartGuestMapProps = {
  publicMode?: boolean;
  onChanged?: () => void;
  accountId: string;
  city?: string;
  onChoose: (property: Row, filters: Row) => void;
  /** Part of the shell's contract. The guest's own stay is the "Сейчас" card now, so nothing here calls it. */
  onActivity?: () => void;
  /** The /api/state payload the shell has already loaded. Only without it does the map load the state itself. */
  data?: Row;
  /** Opens a booking with its actions; without it the "Сейчас" card links to the bookings page. */
  onProcess?: (kind: 'booking' | 'job' | 'property', id: string) => void;
  /** Opens the AI administrator over the map and sends it the text. */
  onAsk?: (text: string) => void;
  /** The heading of the public page. */
  title?: string;
  /** Links shown at the end of the opened sheet on the public page. */
  links?: SearchLink[];
};

const DEFAULT_CITY = 'Павлодар';
const DEFAULT_CENTER: [number, number] = [76.9674, 52.2856];
const DRAFT_STORAGE = 'smart-match-draft';
const KZ = 5 * 3600000;
// The server's reason in the words the listing itself uses for the same state.
const REASON_TEXT: Record<string, string> = { 'Готовность проверена': 'Готова к заселению' };

import { PriceTip } from './price-tip';
import { windowBadge } from '../lib/window-badge';
import { dealBadge, dealNote } from '../lib/price-deal';
const money = (value: number) => new Intl.NumberFormat('ru-RU').format(value) + ' ₸';
// ISO time of the server as the Kazakhstan-local string the form works with.
const toLocal = (iso: string) => new Date(Date.parse(iso) + KZ).toISOString().slice(0, 16);
const localPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const round = (value: number) => Math.round(value * 100) / 100;

function remember(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Session storage is optional: the search works without it.
  }
}

function forget(key: string) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // See remember().
  }
}

// A dialog or a sheet opened over the map takes Escape itself.
const OPEN_OVERLAY = 'dialog[open], [data-slot=dialog-content][data-state=open], [data-slot=sheet-content][data-state=open], [data-slot=popover-content][data-state=open]';

// Moves focus to the first of the given elements that takes it; false when none did.
function focusIn(host: HTMLElement, ...selectors: string[]) {
  for (const selector of selectors) {
    const target = host.querySelector<HTMLElement>(selector);
    target?.focus({ preventScroll: true });
    if (target && document.activeElement === target) return true;
  }
  return false;
}

function recall(key: string) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

const NO_CONNECTION = 'Не удалось связаться с сервером. Проверьте интернет и попробуйте ещё раз.';
const PAST_TEXT = { date: 'Эта дата уже прошла.', time: 'Это время уже прошло.' };
const ASK_WHEN = 'Укажите, когда нужно жильё.';

// The answer of the server, or an error in words meant for the person: a request that did not reach the server
// and an error page instead of an answer never show the browser's own technical text.
async function answer(request: Promise<Response>, fallback: string): Promise<Row> {
  let response: Response;
  try {
    response = await request;
  } catch {
    throw Error(NO_CONNECTION);
  }
  let value: Row | null = null;
  try {
    value = await response.json() as Row;
  } catch {
    // Not an answer of the service: handled below.
  }
  if (response.ok && value) return value;
  // What the service itself says is shown only for a request it refused; its own failure gets the general words.
  throw Error(response.status < 500 && typeof value?.error === 'string' && value.error ? value.error : fallback);
}

// The text of a failure for the screen. Anything that is not written for the person (not in Russian) is replaced.
const told = (failure: unknown, fallback: string) =>
  failure instanceof Error && /[а-яё]/i.test(failure.message) ? failure.message : fallback;

export async function matchingAPI(action: string, body: Row = {}, role = 'guest') {
  return answer(fetch('/api/operations/matching/' + action, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Workspace-Role': role },
    body: JSON.stringify(body),
    cache: 'no-store',
  }), 'Не удалось обработать подбор. Попробуйте ещё раз.');
}

async function getQuote(body: Row) {
  return answer(fetch('/api/quote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Workspace-Role': 'guest' },
    body: JSON.stringify(body),
  }), 'Не удалось проверить условия. Попробуйте ещё раз.');
}

// The request exactly as /api/public/matching and matching/begin expect it: Kazakhstan time with its offset.
function requestBody(draft: Row) {
  return {
    city: String(draft.city || '').trim(),
    district: String(draft.district || '').trim(),
    mode: draft.mode,
    guests: String(draft.guests),
    maxPrice: String(draft.maxPrice || NO_BUDGET),
    priority: draft.priority || 'balanced',
    features: Array.isArray(draft.features) ? draft.features : [],
    near: draft.near || null,
    start: draft.start + '+05:00',
    end: draft.end + '+05:00',
  };
}

// "Понял: Астана, 2 гостя." — only what the text itself named.
function understoodLine(result: GuestSearch, before: Row) {
  const { stated, filters } = result, guests = Number(filters.guests);
  const parts = [
    stated.city && filters.city,
    stated.district && filters.district,
    filters.mode !== before.mode && (filters.mode === 'hourly' ? 'на часы' : 'на сутки'),
    stated.guests && guests + ' ' + plural(guests, 'гость', 'гостя', 'гостей'),
    stated.budget && 'до ' + money(Number(filters.maxPrice)),
    stated.wishes && 'пожелания',
  ].filter(Boolean);
  return parts.length ? 'Понял: ' + parts.join(', ') + '. ' : '';
}

function priceLine(property: Row, mode: string) {
  const periods = Number(property.estimate?.periods) || 1;
  const length = mode === 'hourly'
    ? periods + ' ' + plural(periods, 'час', 'часа', 'часов')
    : periods === 1 ? 'сутки' : periods + ' ' + plural(periods, 'сутки', 'суток', 'суток');
  return money(property.estimate.amount) + ' за ' + length;
}

function MatchingBooking({ property, filters, requestId, onChanged, onEdit }: {
  property: Row; filters: Row; requestId: string; onChanged: () => Promise<unknown>; onEdit: () => void;
}) {
  const initial = { start: toLocal(filters.start), end: toLocal(filters.end), guests: filters.guests, mode: filters.mode };
  const quote = useQuery({
    queryKey: ['matching-quote', requestId, property.offerId],
    queryFn: () => getQuote({ ...filters, propertyId: property.id, billingMode: filters.mode }),
    retry: 1,
    refetchOnWindowFocus: false,
  });
  if (quote.isPending) return <p className="smart-status" role="status">Считаем итоговую сумму…</p>;
  if (quote.error || !quote.data) {
    return (
      <div className="smart-error" role="alert">
        {told(quote.error, 'Не удалось проверить условия. Попробуйте ещё раз.')}
        <button type="button" className="smart-button" onClick={onEdit}>Изменить запрос</button>
      </div>
    );
  }
  return (
    <BookingRequest
      property={property}
      requestKey={'match:' + requestId}
      disabled={false}
      initial={initial}
      initialQuote={quote.data}
      onChangeDates={onEdit}
      onQuote={getQuote}
      onConfirm={async body => {
        await matchingAPI('book', { ...body, id: requestId, offerId: property.offerId });
        await onChanged();
      }}
    />
  );
}

// The guest's first screen and the public page: the map, one line for a request and, after it, one offer at a time.
export function SmartGuestMap({ publicMode = false, onChanged, accountId, city, onChoose, data, onProcess, onAsk, onActivity, title, links }: SmartGuestMapProps) {
  // ---------- State ----------
  const [draft, setDraft] = useState<Row>(() => ({
    city: city || DEFAULT_CITY, district: '', guests: '2', maxPrice: '', priority: 'balanced', features: [], near: null,
    ...defaultStay('daily'),
  }));
  const [stage, setStage] = useState<Stage>('request');
  const [preview, setPreview] = useState<Row | null>(null);
  const [requestId, setRequestId] = useState('');
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState<SearchNote | null>(null);
  const [focus, setFocus] = useState<SearchFocus | null>(null);
  const [picking, setPicking] = useState(false);
  const [zoneNotice, setZoneNotice] = useState('');
  const [me, setMe] = useState<BrowserLocationFix | null>(null);
  const [panel, setPanel] = useState<HTMLElement | null>(null);
  // How much of the map's height the sheet across the bottom covers; 0 when the sheet is a card on the side.
  const [covered, setCovered] = useState<number | undefined>();
  // What was cut to what the service offers ("30 часов" searched as 23): said next to the result.
  const [remark, setRemark] = useState('');

  const root = useRef<HTMLElement>(null), heading = useRef<HTMLHeadingElement>(null), toFields = useRef(false);
  const lock = useRef(false), requestKey = useRef(''), generation = useRef(0);
  // Dates and city count as chosen once the guest named them; until then a request without them is asked for them.
  const whenChosen = useRef(false), cityChosen = useRef(false), asked = useRef(false);
  const requestStorage = 'smart-match:' + accountId;

  // ---------- Data ----------
  const catalog = useQuery({
    queryKey: ['guest-cities'],
    queryFn: async () => {
      const response = await fetch('/api/public/catalog?limit=1');
      if (!response.ok) throw Error('Список городов недоступен.');
      return ((await response.json() as Row).cities || []) as string[];
    },
    staleTime: 3600000,
    retry: 1,
  });
  const cities = useMemo(() => [...new Set([...Object.keys(mapCities), ...(catalog.data || [])])], [catalog.data]);

  const ownState = useQuery({
    queryKey: ['guest-now', accountId],
    enabled: !publicMode && !data,
    queryFn: async () => {
      const response = await fetch('/api/state?catalog=0', { cache: 'no-store', headers: { 'X-Workspace-Role': 'guest' } });
      if (!response.ok) throw Error('Состояние недоступно.');
      return await response.json() as Row;
    },
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
    retry: 1,
  });
  const account = data || ownState.data;
  const card = publicMode || !account ? null : nowCard('guest', account, account.serverTime || Date.now() / 1000);

  const live = useQuery({
    queryKey: ['smart-matching', accountId, requestId],
    enabled: !!requestId && !publicMode,
    queryFn: () => matchingAPI('state', { id: requestId }),
    refetchInterval: query => query.state.error ? false : ['searching', 'ready', 'booking'].includes(query.state.data?.status || 'searching') ? 3000 : false,
    refetchIntervalInBackground: false,
    retry: 1,
  });
  const state = live.data as Row | undefined;
  const active = !!requestId && !!state && ['searching', 'ready', 'booking'].includes(state.status);
  const waiting = !!requestId && (!state || state.status === 'searching' || state.status === 'booking');
  const candidates: Row[] = requestId ? state?.properties || [] : preview?.properties || [];
  const current = candidates[Math.min(index, Math.max(0, candidates.length - 1))];
  const filters: Row | undefined = state?.filters || preview?.filters;
  const items = [...candidates, ...(state?.pendingProperties || [])].map(property => ({
    ...property, mapKey: 'property:' + property.id, matchPending: !property.ownerConfirmed && !!requestId,
  }));
  // While owners are asked, beams run from the searched point (or the middle of the city) to each asked flat,
  // dashed yellow while it waits, indigo once its owner said yes (as in the app, mobile/src/map-motion.ts beams).
  const near = filters?.near;
  const beamFrom: [number, number] | null = near && Number.isFinite(Number(near.longitude)) ? [Number(near.longitude), Number(near.latitude)] : mapCities[draft.city] || null;
  const lines = active ? beams(beamFrom, pinsOf(items)) : [];
  const center = mapCities[draft.city] || preview?.center || DEFAULT_CENTER;
  const queryError = live.error ? told(live.error, 'Не удалось обновить подбор. Попробуйте ещё раз.') : '';

  // ---------- Applying conditions from outside the form ----------
  // A link or the administrator hands over ready conditions: only known keys, only valid values.
  function applyConditions(input: Row) {
    const values = mapSearchFilters(input), patch: Row = {};
    if (values.city) patch.city = values.city;
    if (typeof input.guests === 'string' && /^\d{1,2}$/.test(input.guests) && Number(input.guests) >= 1 && Number(input.guests) <= MAX_GUESTS) patch.guests = input.guests;
    if (/^\d{3,9}$/.test(values.maxPrice || '')) patch.maxPrice = values.maxPrice;
    if (typeof input.mode === 'string') patch.mode = values.mode === 'hourly' ? 'hourly' : 'daily';
    const dated = localPattern.test(values.start || '') && localPattern.test(values.end || '') && values.end > values.start
      && Date.parse(values.start + '+05:00') > Date.now();
    if (dated) Object.assign(patch, { start: values.start, end: values.end });
    else if (patch.mode) Object.assign(patch, defaultStay(patch.mode));
    if (patch.city) cityChosen.current = true;
    if (dated) whenChosen.current = true;
    return { patch, dated };
  }

  useEffect(() => {
    const show = (input: Row) => {
      if (requestId) return;
      const { patch, dated } = applyConditions(input), next = { ...draft, ...patch };
      setPreview(null);
      setRemark('');
      setStage('request');
      setDraft(next);
      // "Показать на карте" with dates is a finished request; without them the guest still has to say when.
      if (dated && input.book === undefined) void search(next, false);
      else if (input.book === undefined) {
        setNote({ text: ASK_WHEN });
        openFields('when');
      }
    };
    const listener = (event: Event) => show((event as CustomEvent<Row>).detail || {});
    window.addEventListener('rental-map-search', listener);
    return () => window.removeEventListener('rental-map-search', listener);
  }, [requestId, draft]);

  // Once, when the page opens: conditions from the address, the request saved before signing in, an unfinished search.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let next = draft, resume = false;
    try {
      const saved = sessionStorage.getItem(DRAFT_STORAGE);
      if (saved) {
        const value = JSON.parse(saved);
        if (value?.city && localPattern.test(value.start) && localPattern.test(value.end) && Date.parse(value.start + '+05:00') > Date.now()) {
          next = { ...next, ...value, maxPrice: value.maxPrice === NO_BUDGET ? '' : value.maxPrice || '' };
          whenChosen.current = cityChosen.current = true;
          resume = params.get('matchResume') === '1';
          if (resume) sessionStorage.removeItem(DRAFT_STORAGE);
        }
      }
      if (!publicMode) {
        const id = sessionStorage.getItem(requestStorage);
        if (id) {
          setRequestId(id);
          setStage('search');
          resume = false;
        }
      }
    } catch {
      // Restoring is optional and must not stand in the way of a new search.
    }
    const fromLink = params.get('mapSearch') === '1', linked = fromLink || params.has('book');
    if (linked) next = { ...next, ...applyConditions(Object.fromEntries(params)).patch };
    if (next !== draft) setDraft(next);
    // Back from signing in: show the same offers again, the question to the owners is one tap away.
    if (resume && !publicMode) void search(next, false);
    else if (fromLink && whenChosen.current) void search(next, false);
    else if (fromLink) {
      // "Показать на карте" without dates: the city and the guests are in the fields, the guest still has to say when.
      setNote({ text: ASK_WHEN });
      openFields('when');
    }
    if (fromLink) {
      // The conditions are in the fields: the link leaves the address, so a reload starts from a clean page.
      for (const key of ['mapSearch', 'city', 'guests', 'rooms', 'roomsExact', 'minPrice', 'maxPrice', 'mode', 'sort', 'start', 'end', 'page']) params.delete(key);
      window.history.replaceState(window.history.state, '', window.location.pathname + (params.size ? '?' + params : '') + window.location.hash);
    }
  }, [accountId, publicMode]);

  // /workspace/guest/map?q=<text>: the text is applied once, as if it was typed into the line, and leaves the address.
  useEffect(() => {
    if (asked.current || catalog.isPending) return;
    const params = new URLSearchParams(window.location.search);
    if (!params.has('q')) return;
    asked.current = true;
    const text = cleanAiText(params.get('q'));
    params.delete('q');
    window.history.replaceState(window.history.state, '', window.location.pathname + (params.size ? '?' + params : '') + window.location.hash);
    // A search that is still running keeps the screen: the text does not replace it.
    if (text && !requestId && !recall(requestStorage)) void ask(text);
  }, [catalog.isPending]);

  useEffect(() => {
    if (state?.filters) {
      const saved = state.filters;
      setDraft({ ...saved, start: toLocal(saved.start), end: toLocal(saved.end), maxPrice: saved.maxPrice === NO_BUDGET ? '' : saved.maxPrice });
      whenChosen.current = cityChosen.current = true;
    }
    if (state?.status === 'ready') setStage(value => value === 'search' ? 'result' : value);
    if (state && ['empty', 'cancelled', 'expired', 'booked'].includes(state.status)) setStage('result');
  }, [state?.status, state?.id]);

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [stage]);

  // After "Изменить запрос" focus goes to the request line (to the form itself: a phone does not open the keyboard for it).
  useEffect(() => {
    if (stage !== 'request' || !toFields.current || !panel) return;
    // The sheet of the request replaces the sheet of the result: until it is on the page there is nothing to focus.
    if (focusIn(panel, '.map-home-ai-form', '.map-home-refine')) toFields.current = false;
  }, [stage, panel]);

  // Escape steps back: out of choosing a point on the map, then out of the opened fields.
  useEffect(() => {
    if (!picking && !(stage === 'request' && expanded)) return;
    const close = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || document.querySelector(OPEN_OVERLAY)) return;
      if (picking) {
        setPicking(false);
        return;
      }
      // The fields are about to leave the page: focus must not be left on one of them.
      const inside = !!panel?.querySelector('.map-home-details')?.contains(document.activeElement);
      setExpanded(false);
      if (inside && panel) focusIn(panel, '.map-home-refine');
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [picking, expanded, stage, panel]);

  // The height of the sheet: for what sits on the map just above it, and for the map itself,
  // which keeps what it shows clear of the sheet.
  useEffect(() => {
    const host = root.current;
    if (!panel || !host) return;
    const update = () => {
      const box = panel.getBoundingClientRect(), outer = host.getBoundingClientRect();
      host.style.setProperty('--smart-sheet', Math.round(box.height) + 'px');
      // An opened sheet hides the map anyway: the map keeps the view it had under the folded one.
      if (host.dataset.covered === 'true') return;
      setCovered(box.width >= outer.width - 1 ? Math.round((outer.bottom - box.top) / 8) * 8 : 0);
    };
    const observer = new ResizeObserver(update);
    observer.observe(panel);
    update();
    return () => observer.disconnect();
  }, [panel]);

  // ---------- Actions ----------
  function openFields(field?: SearchFocus['field']) {
    setExpanded(true);
    if (field) setFocus({ field, id: Date.now() });
  }

  function change(patch: Row) {
    if ('start' in patch || 'end' in patch || 'mode' in patch) whenChosen.current = true;
    if ('city' in patch) cityChosen.current = true;
    setNote(null);
    setDraft(previous => ({ ...previous, ...patch }));
  }

  // Looks for flats that fit. With askOwners a signed-in guest's request also goes to the owners
  // who take quick requests; the free line and the shortcuts only look.
  async function search(conditions: Row, askOwners: boolean) {
    if (lock.current) return;
    const next = { ...conditions, city: String(conditions.city || '').trim(), ...freshStay(conditions as GuestStay) };
    if (!next.city) {
      setNote({ text: 'Укажите город.', tone: 'error' });
      openFields('city');
      return;
    }
    lock.current = true;
    const version = ++generation.current;
    setBusy(true);
    setError('');
    setNote(null);
    setIndex(0);
    setDraft(next);
    setStage('search');
    try {
      const result = await answer(
        fetch('/api/public/matching?q=' + encodeURIComponent(JSON.stringify(requestBody(next))), { cache: 'no-store' }),
        'Не удалось подобрать жильё. Попробуйте ещё раз.',
      );
      if (version !== generation.current) return;
      setPreview(result);
      if (askOwners && !publicMode && result.properties.some((property: Row) => property.quickRequest)) {
        requestKey.current ||= crypto.randomUUID();
        const sent = await matchingAPI('begin', { ...result.filters, requestKey: requestKey.current, consent: true });
        setRequestId(sent.id);
        remember(requestStorage, sent.id);
      } else {
        setStage('result');
      }
      remember(DRAFT_STORAGE, JSON.stringify(next));
    } catch (failure) {
      if (version !== generation.current) return;
      setNote({ text: told(failure, 'Не удалось подобрать жильё. Попробуйте ещё раз.'), tone: 'error' });
      setStage('request');
      setExpanded(true);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  // The free line. The text is read by the search rules, not by a model: what it names is applied, a request
  // without dates is asked for them, and whatever was cut or could not be taken is said. A text the rules
  // do not understand is not guessed at: the guest is offered to ask the AI administrator.
  async function ask(text: string) {
    if (lock.current) return;
    const result = guestSearchRequest(text, draft, cities, Date.now());
    if (!result.understood) {
      setNote({ text: 'Не понял запрос. Назовите день и срок.', ask: text });
      return;
    }
    let next = result.filters;
    const remarks = result.remarks.join(' ');
    setRemark('');
    if (result.stated.city) cityChosen.current = true;
    if (result.stated.when) whenChosen.current = true;
    if (result.past) {
      // A day or an hour that has passed is never moved to another one: the guest is asked for the date.
      setDraft(next);
      setNote({ text: [PAST_TEXT[result.past], remarks, ASK_WHEN].filter(Boolean).join(' '), tone: 'error' });
      openFields('when');
      return;
    }
    if (result.nearby) {
      const zone = await findZone();
      if (!zone) {
        setDraft(next);
        setExpanded(true);
        return;
      }
      next = { ...next, ...zone };
    }
    if (!whenChosen.current) {
      setDraft(next);
      setNote({ text: [understoodLine(result, draft).trim(), remarks, ASK_WHEN].filter(Boolean).join(' ') });
      openFields('when');
      return;
    }
    // Shown next to the result: the search has run with what the note says.
    setRemark(remarks);
    await search(next, false);
  }

  function chip(shortcut: AiChip) {
    if (lock.current) return;
    whenChosen.current = true;
    setNote(null);
    setRemark('');
    if (shortcut.id === 'hourly') {
      // A few hours need a start and a length: the fields open in the hourly mode.
      setDraft(previous => ({ ...previous, ...defaultStay('hourly') }));
      openFields();
      return;
    }
    void search({ ...draft, ...(shortcut.id === 'weekend' ? weekendStay() : defaultStay('daily')) }, false);
  }

  // Asks the owners who take quick requests whether the flat is free; needs an account.
  async function askOwners() {
    if (lock.current || !filters) return;
    if (publicMode) {
      remember(DRAFT_STORAGE, JSON.stringify(draft));
      window.location.assign('/signin?next=' + encodeURIComponent('/workspace/guest/map?matchResume=1'));
      return;
    }
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      requestKey.current ||= crypto.randomUUID();
      const result = await matchingAPI('begin', { ...filters, requestKey: requestKey.current, consent: true });
      setRequestId(result.id);
      remember(requestStorage, result.id);
      setStage('search');
      setIndex(0);
    } catch (failure) {
      setError(told(failure, 'Не удалось отправить запрос. Попробуйте ещё раз.'));
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }

  // Back to the request with its conditions in the fields; a search that is still running is cancelled first.
  async function edit() {
    if (lock.current) return;
    setError('');
    if (active) {
      setBusy(true);
      lock.current = true;
      try {
        await matchingAPI('cancel', { id: requestId });
      } catch (failure) {
        setError(told(failure, 'Не удалось отменить подбор. Попробуйте ещё раз.'));
        return;
      } finally {
        setBusy(false);
        lock.current = false;
      }
    }
    generation.current++;
    setRequestId('');
    forget(requestStorage);
    requestKey.current = '';
    setPreview(null);
    setPicking(false);
    setNote(null);
    setRemark('');
    setExpanded(true);
    toFields.current = true;
    setStage('request');
  }

  async function findPosition() {
    try {
      const fix = await requestBrowserLocation(navigator.geolocation, window.isSecureContext);
      setMe(fix);
      return fix;
    } catch (failure) {
      const text = told(failure, 'Положение недоступно. Выберите район вручную.');
      if (stage === 'request') setNote({ text, tone: 'error' });
      else setError(text);
      return null;
    }
  }

  // The search zone around the guest: a point rounded to 0.01° and a 5 km radius.
  async function findZone(): Promise<Row | null> {
    const fix = await findPosition();
    if (!fix) return null;
    const near = cityNearLocation(fix.longitude, fix.latitude);
    setZoneNotice('Ищем в 5 км от вас. Точное положение не передаётся.');
    return { ...(near ? { city: near } : {}), near: { longitude: round(fix.longitude), latitude: round(fix.latitude), radius: 5000 } };
  }

  async function locateZone() {
    if (busy) return;
    setBusy(true);
    setNote(null);
    const zone = await findZone();
    if (zone) setDraft(previous => ({ ...previous, ...zone }));
    setBusy(false);
  }

  // The round button on the map: shows where the guest is and, until a city is chosen, searches in theirs.
  async function showMe() {
    const fix = await findPosition();
    if (!fix || stage !== 'request' || cityChosen.current) return;
    const near = cityNearLocation(fix.longitude, fix.latitude);
    if (near && near !== draft.city) {
      setDraft(previous => ({ ...previous, city: near, district: '', near: null }));
      setNote({ text: 'Ищем в городе ' + near + ': он ближе всего к вам.' });
    }
  }

  function openCard(now: NowCardData) {
    if (onProcess && now.entityKind && now.entityId) onProcess(now.entityKind, now.entityId);
    else if (now.href) goWorkspace(now.href);
  }

  // A question the search rules did not understand goes to the AI administrator only when the guest asks for it.
  // A visitor signs in first: the question waits in this tab (never in the address) and the chats page sends it once.
  function askAdministrator(text: string) {
    setNote(null);
    if (publicMode) {
      leaveAiAsk('guest', text);
      window.location.assign('/signin?next=' + encodeURIComponent(administratorChatPath('guest')));
    } else if (onAsk) {
      onAsk(text);
    } else {
      askAdministratorInChats('guest', text);
    }
  }

  // ---------- Screen ----------
  const mode = filters?.mode || draft.mode;
  const limited = !!draft.maxPrice && draft.maxPrice !== NO_BUDGET;
  const reasons: string[] = current
    ? [
        ...current.match.reasons
          .filter((reason: string) => limited || reason !== 'В пределах бюджета')
          .map((reason: string) => REASON_TEXT[reason] || reason),
        ...(current.ownerConfirmed ? ['Владелец подтвердил, что жильё свободно'] : []),
        ...(current.estimate?.deal ? [dealNote(current.estimate.deal, money)] : []),
      ]
    : [];
  const canAskOwners = !requestId && candidates.some(property => property.quickRequest);
  // A search restored after a reload has no conditions to show until the server returns them.
  const summary = stage === 'request' || (requestId && !state) ? '' : guestRequestLine(draft);
  const submit = () => {
    setRemark('');
    void search(draft, true);
  };
  const focusPoint: [number, number] | null = draft.near
    ? [draft.near.longitude, draft.near.latitude]
    : me ? [me.longitude, me.latitude] : null;

  return (
    <section
      ref={root}
      className={'smart-map stage-' + stage + (publicMode ? ' is-public' : '')}
      data-covered={!picking && (stage === 'detail' || stage === 'book' || (stage === 'request' && expanded)) ? 'true' : 'false'}
      aria-label="Подбор жилья"
    >
      {/* The public page has its own heading in the sheet; the signed-in guest's page gets one for screen readers. */}
      {!title && <h1 className="sr-only">Поиск жилья</h1>}
      <MapCanvas
        adaptivePanel
        searching={waiting}
        items={items}
        selected={current ? 'property:' + current.id : ''}
        onSelect={id => {
          const found = candidates.findIndex(property => 'property:' + property.id === id);
          if (found >= 0) {
            setIndex(found);
            setStage('result');
          }
        }}
        center={center}
        sheetSize={1}
        sheetHeight={covered}
        searchKey={preview?.serverTime ? String(preview.serverTime) : requestId}
        memoryKey={publicMode ? undefined : accountId + ':guest'}
        lines={lines}
        people={me ? [{ id: 'me', mine: true, longitude: me.longitude, latitude: me.latitude, accuracy: me.accuracy }] : []}
        focus={focusPoint}
        pick={picking}
        onPick={point => {
          change({ near: { longitude: round(point[0]), latitude: round(point[1]), radius: 5000 } });
          setPicking(false);
          setZoneNotice('Ищем в 5 км от выбранного места.');
        }}
      />

      {/* The AI administrator's answer about the guest's own stay: stay longer or come earlier. */}
      {data && !picking && <PriceTip role="guest" cards={data.approvals || []} onChanged={onChanged} />}

      <button type="button" className="map-home-round smart-locate" aria-label="Показать, где я" onClick={() => void showMe()}>
        <LocateFixed size={20} aria-hidden="true" />
      </button>

      {picking && (
        <div className="smart-pick" role="status">
          <span>Нажмите место на карте</span>
          <button type="button" onClick={() => setPicking(false)}>Отмена</button>
        </div>
      )}

      {!picking && stage === 'request' && (
        <SearchIntro
          panelRef={setPanel}
          title={title}
          draft={draft}
          cities={catalog.data?.length ? catalog.data : Object.keys(mapCities)}
          busy={busy}
          expanded={expanded}
          onExpanded={setExpanded}
          note={note}
          focus={focus}
          card={card}
          onOpenCard={openCard}
          onRoute={onActivity}
          onText={text => void ask(text)}
          onChip={chip}
          onChange={change}
          onSubmit={submit}
          onAsk={askAdministrator}
          askLabel={publicMode ? 'Войти и спросить AI' : 'Спросить AI администратора'}
          ai={!publicMode}
          zoneNotice={draft.near ? zoneNotice || 'Ищем в 5 км от выбранного места.' : ''}
          onLocate={() => void locateZone()}
          onPick={() => setPicking(true)}
          onClearZone={() => {
            change({ near: null });
            setZoneNotice('');
          }}
          fine={publicMode
            ? 'Смотреть можно без входа. Вход нужен, чтобы отправить заявку.'
            : 'Запрос увидят до трёх владельцев. Это ещё не бронь.'}
          links={links}
        />
      )}

      {!picking && stage !== 'request' && (
        <section
          ref={setPanel}
          className="map-home-panel smart-stage"
          data-expanded={stage === 'detail' || stage === 'book' ? 'true' : 'false'}
          aria-label="Подбор жилья"
        >
          {(stage === 'search' || stage === 'result') && state?.status !== 'booked' && summary && (
            <button
              type="button"
              className="smart-line"
              disabled={busy || state?.status === 'booking'}
              aria-label={'Изменить запрос: ' + summary}
              onClick={() => void edit()}
            >
              <span>{unbrokenParts(summary)}</span>
              <Pencil size={18} aria-hidden="true" />
            </button>
          )}
          {remark && (stage === 'search' || stage === 'result') && <p className="smart-remark" role="status">{remark}</p>}

          {(error || queryError) && (
            <div className="smart-error" role="alert">
              {error || queryError}
              {queryError && <button type="button" className="smart-button" onClick={() => void live.refetch()}>Повторить</button>}
            </div>
          )}

          {stage === 'search' ? (
            <div className="smart-wait" role="status">
              <Thinking size="lg" />
              <div>
                <h2 ref={heading} tabIndex={-1}>
                  {state?.status === 'booking' ? 'Отправляем заявку' : requestId ? 'Спрашиваем владельцев' : 'Ищем жильё'}
                </h2>
                <p>
                  {requestId && state
                    ? `Отправили запросов: ${state.sent}. Ждём ответа: ${state.pending}. На ответ у владельца две минуты.`
                    : 'Проверяем свободные даты и цену.'}
                </p>
              </div>
              {requestId && (
                <button type="button" className="smart-button" disabled={busy || state?.status === 'booking'} onClick={() => void edit()}>
                  Отменить поиск
                </button>
              )}
            </div>
          ) : state?.status === 'booked' ? (
            <div className="smart-done">
              <h2 ref={heading} tabIndex={-1}>Заявка отправлена</h2>
              <p>Ответ владельца появится в бронях. Деньги не списаны.</p>
              <a className="smart-primary" href="/workspace/guest/bookings">
                Мои брони
                <ArrowUpRight size={18} aria-hidden="true" />
              </a>
              <button type="button" className="smart-route" disabled={busy} onClick={() => void edit()}>
                Новый поиск
              </button>
            </div>
          ) : stage === 'detail' && current ? (
            <div className="smart-detail">
              <button type="button" className="smart-back" onClick={() => setStage('result')}>
                <ArrowLeft size={18} aria-hidden="true" />
                Назад
              </button>
              <PropertyListing
                property={current}
                role="guest"
                publicView
                billingMode={draft.mode}
                actionLabel="Забронировать"
                onChoose={() => requestId ? setStage('book') : onChoose(current, { ...draft })}
              />
            </div>
          ) : stage === 'book' && current && filters ? (
            <div className="smart-detail">
              <button type="button" className="smart-back" onClick={() => setStage('detail')}>
                <ArrowLeft size={18} aria-hidden="true" />
                К жилью
              </button>
              <MatchingBooking
                key={current.id + ':' + current.offerId}
                property={current}
                filters={filters}
                requestId={requestId}
                onChanged={() => live.refetch()}
                onEdit={() => void edit()}
              />
            </div>
          ) : current ? (
            <div className="smart-offer">
              <div className="smart-offer-head">
                <div className="smart-offer-cover"><PropertyCover property={current} role="guest" publicView /></div>
                <div className="smart-offer-text">
                  {candidates.length > 1 && <span className="smart-offer-count">Вариант {index + 1} из {candidates.length}</span>}
                  {!!current.match?.best && <span className="smart-window smart-best">Лучший выбор для вас</span>}
                  <h2 ref={heading} tabIndex={-1}>{current.title}</h2>
                  <strong>{priceLine(current, mode)}</strong>
                  {!!windowBadge(current.estimate?.window) && <span className="smart-window">{windowBadge(current.estimate.window)}</span>}
                  {!!dealBadge(current.estimate?.deal) && <span className="smart-window smart-deal" title={dealNote(current.estimate.deal, money)}>{dealBadge(current.estimate.deal)}</span>}
                  <small>{current.policy.deposit ? 'Депозит ' + money(current.policy.deposit) + ' отдельно' : 'Без депозита'}</small>
                </div>
              </div>
              {reasons.length > 0 && (
                <p className="smart-reasons">
                  {reasons.map((reason, i) => <span key={reason}>{i > 0 && ' · '}<span className="smart-reason">{reason}</span></span>)}
                </p>
              )}
              <button type="button" className="smart-primary" onClick={() => setStage('detail')}>Посмотреть жильё</button>
              {canAskOwners && (
                <button type="button" className="smart-button" disabled={busy} onClick={() => void askOwners()}>
                  {busy && <Thinking size="sm" tone="plain" />}
                  {publicMode ? 'Войти и спросить владельцев' : 'Спросить владельцев'}
                </button>
              )}
              <div className="smart-offer-foot">
                <small>
                  {canAskOwners
                    ? 'Запрос увидят до трёх владельцев. Это ещё не бронь.'
                    : current.ownerConfirmed ? 'Владелец ждёт вашу заявку.' : 'Свободно по календарю. Бронь подтверждает владелец.'}
                </small>
                {candidates.length > 1 && (
                  <button type="button" className="smart-next" onClick={() => setIndex((index + 1) % candidates.length)}>Другой вариант</button>
                )}
              </div>
            </div>
          ) : (
            <div className="smart-done">
              <h2 ref={heading} tabIndex={-1}>
                {state?.status === 'expired' ? 'Время подбора вышло' : state?.status === 'cancelled' ? 'Поиск отменён' : 'Ничего не нашлось'}
              </h2>
              <p>
                {requestId
                  ? 'Владельцы не подтвердили готовность. Измените условия или попробуйте ещё раз.'
                  : 'Попробуйте другие даты, район или бюджет.'}
              </p>
              <button type="button" className="smart-primary" onClick={() => void edit()}>Изменить запрос</button>
            </div>
          )}
        </section>
      )}
    </section>
  );
}
