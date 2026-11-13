'use client';
import { goWorkspace } from '../lib/workspace-go';
import { ownerPin } from '../mobile/src/owner-map';
import { cleanerPin, dayRoute, routeLines, routeSummary } from '../mobile/src/cleaner-map';
import {useEffect,useRef,useState,type PointerEvent as ReactPointerEvent,type ReactNode} from 'react';
import {latestMove} from '../lib/ai-move-marks';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {ArrowLeft,Brush,Building2,CalendarCheck,ChevronDown,ChevronRight,LocateFixed,MapPin,MessagesSquare,Navigation,Zap} from 'lucide-react';
import {JourneyNavigation,type LocationFix} from './journey-navigation';
import type {JourneyRoute} from '../lib/route-geometry';
import type {Role} from '../lib/domain';
import {PropertyCover} from './property-cover';
import {cityNearLocation,mapCities} from '../lib/map-location';
import {browserLocationFix,locationFailure,requestBrowserLocation} from '../lib/browser-location';
import {MapCanvas} from './map-canvas';import {StatusBadge} from './property-listing';import {processStatus} from '../lib/process-status';
import {AiLine,roleAiLine,type AiChip} from './ai-line';
import {NowCard,nowCard,nowCardWhen,type NowCardData} from './now-card';
import './map-workspace.css';
import {SmartGuestMap,matchingAPI} from './smart-guest-map';
import {MatchingInbox} from './matching-inbox';
import {ProcessJourney} from './process-journey';
import {PriceTip} from './price-tip';
import {kindLabel} from '../lib/listings';
import {guestStep,guestTrips} from '../lib/guest-trips';
import {ownerStep,ownerStepOnMap} from '../lib/owner-steps';
import {cleanerLine,cleanerStep,ownerJobStep} from '../lib/job-steps';
import {calendarEntries} from '../lib/calendar-days';
import {hubLine,type HubTab} from '../lib/property-hub';
import {PropertyHub} from './property-hub';
import {CheckinGuide} from './checkin-guide';
type Row=Record<string,any>;
async function mapAPI(role:string,action:string,body:Row={}){const r=await fetch('/api/operations/map/'+action,{method:'POST',headers:{'Content-Type':'application/json','X-Workspace-Role':role},body:JSON.stringify(body),cache:'no-store',keepalive:action==='journey/stop'}),v=await r.json() as Row;if(!r.ok)throw Object.assign(Error(v.error||'Нет связи с картой.'),{status:r.status});return v;}
type MapWorkspaceInput={publicMode?:boolean;role:string;accountId:string;data:Row;onChoose:(p:Row,initial:Row)=>void;onDiscussion:(c:Row)=>void;onProcess:(kind:string,id:string,step?:string)=>void;onCreate:()=>void;onAsk:(text:string)=>void;onChanged?:()=>void;onEdit?:(id:string,step:string|null)=>void};

// The guest's first screen is the search map. It gets the state the shell has already loaded (so it does not ask
// the server for it again), opens a booking in the shell's task sheet and hands a question to the AI administrator.
export function MapWorkspace(props: MapWorkspaceInput) {
  // null: the search. '': the guest's own bookings on the map. 'booking:<id>': one of them, opened at once.
  const [stay, setStay] = useState<string | null>(null);
  if (props.role === 'guest' && stay === null) {
    const signedIn = !props.publicMode;
    return (
      <SmartGuestMap
        publicMode={props.publicMode}
        accountId={props.accountId}
        city={props.data.profile?.city}
        onChoose={props.onChoose}
        onActivity={signedIn ? id => setStay(id ? 'booking:' + id : '') : undefined}
        data={signedIn ? props.data : undefined}
        onProcess={signedIn ? props.onProcess : undefined}
        onAsk={signedIn ? props.onAsk : undefined}
        onChanged={props.onChanged}
      />
    );
  }
  return <RoleMap {...props} initial={stay || ''} onBack={stay !== null ? () => setStay(null) : undefined} />;
}

// ---------- First screen of the owner and of the cleaner (and "my rental" of the guest) ----------

const zone = 'Asia/Almaty';
const clockFormat = new Intl.DateTimeFormat('ru-RU', { timeZone: zone, hour: '2-digit', minute: '2-digit' });
const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: zone });
const clock = (seconds: number) => clockFormat.format(new Date(seconds * 1000));
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const money = (amount: number) => new Intl.NumberFormat('ru-RU').format(amount) + ' ₸';

function plural(n: number, one: string, few: string, many: string) {
  const tens = n % 100, units = n % 10;
  return n + ' ' + (tens > 10 && tens < 20 ? many : units === 1 ? one : units > 1 && units < 5 ? few : many);
}

// "Сегодня в 14:00 – 16:00", or both dates when the stay ends on another day. Kazakhstan time.
function period(start: number, end: number, now: number) {
  const sameDay = dayFormat.format(new Date(start * 1000)) === dayFormat.format(new Date(end * 1000));
  return capital(nowCardWhen(start, now)) + ' – ' + (sameDay ? clock(end) : nowCardWhen(end, now));
}

const accuracyNote = (fix: LocationFix) =>
  (fix.accuracy > 500 ? 'Положение приблизительное' : 'Вы на карте') + ', точность ±' + Math.round(fix.accuracy) + ' м. Видно только вам.';

type LocationResult = { fix: LocationFix | null; problem: string };
type RoleMapInput = MapWorkspaceInput & { onBack?: () => void; initial?: string };

function Thumb({ item, role }: { item: Row; role: string }) {
  if (!item.kind) return <span className="map-role-thumb"><PropertyCover property={item} role={role} /></span>;
  return (
    <span className="map-role-thumb is-icon" aria-hidden="true">
      {item.kind === 'job' ? <Brush size={20} /> : <CalendarCheck size={20} />}
    </span>
  );
}

function MapRow({ item, role, line, onOpen, order }: { item: Row; role: string; line: string; onOpen: () => void; order?: number }) {
  return (
    <li>
      <button type="button" className="map-role-row" onClick={onOpen}>
        {order ? <span className="map-role-thumb is-icon is-order" aria-label={'Остановка ' + order}>{order}</span> : <Thumb item={item} role={role} />}
        <span className="map-role-row-text">
          <strong>{item.title}</strong>
          <span>{line}</span>
        </span>
        <ChevronRight size={18} aria-hidden="true" />
      </button>
    </li>
  );
}

function RoleMap({ role, accountId, data, onDiscussion, onProcess, onCreate, onAsk, onBack, onChanged, onEdit, initial = '' }: RoleMapInput) {
  const qc = useQueryClient();
  // The owner sees every flat he has; the cleaner looks for jobs in one city.
  const [city, setCity] = useState<string>(role === 'cleaner' ? data.profile?.city || '' : '');
  const [selected, setSelected] = useState(initial), [expanded, setExpanded] = useState(false), [hubTab, setHubTab] = useState<HubTab>('today');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false), [picked, setPicked] = useState<[number, number] | null>(null);
  const [travelMode, setTravelMode] = useState('walking'), [session, setSession] = useState(''), [gpsStatus, setGpsStatus] = useState('');
  const [privateRoute, setPrivateRoute] = useState<JourneyRoute | null>(null);
  const [localFix, setLocalFix] = useState<LocationFix | null>(null), [localPoint, setLocalPoint] = useState<[number, number] | null>(null);
  const [watching, setWatching] = useState(false), [locating, setLocating] = useState(false);
  // A passing remark ("found you") goes away by itself; a problem stays until the next attempt.
  const [locationNote, setLocationNote] = useState<{ text: string; stays: boolean } | null>(null);
  // How much of the map the folded sheet covers on a phone, so the map keeps its pins above it. Not set for the card on a wide screen.
  const [covered, setCovered] = useState<number | undefined>();
  const sending = useRef(false), live = useRef(true), manualCity = useRef(false);
  const locationRequest = useRef<Promise<LocationResult> | null>(null);
  const panel = useRef<HTMLElement>(null), inboxHost = useRef<HTMLDivElement>(null), dragFrom = useRef<number | null>(null), swiped = useRef(false);

  const filters = { city, guests: '1', mode: 'daily', page: '1' };
  const query = useQuery({
    queryKey: ['map-workspace', accountId, role, filters],
    queryFn: () => mapAPI(role, 'search', { filters }),
    refetchInterval: 8000, refetchIntervalInBackground: false, refetchOnWindowFocus: true, retry: 1,
  });
  // Quick requests of guests are loaded and refreshed by MatchingInbox; this only reads the same data.
  const inbox = useQuery({ queryKey: ['matching-inbox', accountId], queryFn: () => matchingAPI('inbox', {}, 'owner'), enabled: role === 'owner', retry: 1 });

  const now: number = query.data?.serverTime || data.serverTime || Date.now() / 1000;
  // Each pin says its most urgent state, as in the app (mobile/src/owner-map.ts, cleaner-map.ts): the owner's object its
  // guest or cleaning, the price advice of the AI with its ring; the cleaner's job its step, the day's stops their numbers.
  const processes: Row[] = query.data?.processes || [];
  const advice = new Map<string, { from: number; to: number }>((data.approvals || []).filter((c: Row) => c.kind === 'price' && c.price?.propertyId && c.canDecide).map((c: Row) => [c.price.propertyId, { from: Number(c.price.from), to: Number(c.price.to) }]));
  const route = role === 'cleaner' ? dayRoute(data.jobs || [], accountId, now) : [];
  const flats: Row[] = role === 'owner' ? (query.data?.properties || []).map((p: Row) => {
    const pin = ownerPin(p, processes, now, advice.get(p.id));
    return { ...p, mapPrice: p.price, mapKey: 'property:' + p.id, pinTone: pin.tone, pinLabel: pin.label, pinProgress: pin.progress, pinBest: pin.best, pinAi: latestMove(query.data?.aiMarks, [{ kind: 'property', id: String(p.id) }], now) };
  }) : [];
  const deals: Row[] = processes.map((p: Row) => {
    if (role !== 'cleaner' || p.kind !== 'job') return { ...p, mapKey: p.kind + ':' + p.id };
    const job = (data.jobs || []).find((j: Row) => j.id === p.id), applied = (data.applications || []).some((a: Row) => a.job_id === p.id && a.user_id === accountId && a.status !== 'rejected');
    const pin = cleanerPin({ ...job, ...p }, route.find(r => r.id === p.id), now, applied);
    return { ...p, mapKey: p.kind + ':' + p.id, pinTone: pin.tone, pinLabel: pin.label, pinProgress: pin.progress, pinOrder: pin.order, pinAi: latestMove(query.data?.aiMarks, [{ kind: 'job', id: String(p.id) }], now) };
  }).sort((a: Row, b: Row) => a.start - b.start);
  // Demand around the owner's objects glows, with sparks over the busiest places while guests are asking right now;
  // the cleaner's stops of the day are joined by the route line in their order.
  const cells: Row[] = role === 'owner' ? query.data?.demand?.cells || [] : [], searchingNow = Number(query.data?.demand?.searching) || 0;
  const heat = cells.map(c => ({ point: [Number(c.longitude), Number(c.latitude)] as [number, number], weight: Number(c.weight) || 0 }));
  const sparks = searchingNow ? heat.slice(0, Math.min(3, searchingNow)).map(c => c.point) : [];
  const routeLine = role === 'cleaner' ? routeLines(route.map(r => { const d = processes.find((p: Row) => p.kind === 'job' && p.id === r.id); return d?.location ? [Number(d.location.longitude), Number(d.location.latitude)] as [number, number] : null; })) : [];
  const nearby = role === 'cleaner' ? deals.filter(d => d.kind === 'job' && d.status === 'open') : [];
  const mine = role === 'cleaner' ? deals.filter(d => !(d.kind === 'job' && d.status === 'open')) : deals;
  const pins = role === 'owner' ? flats : deals;
  const chosen = [...flats, ...deals].find(item => item.mapKey === selected);
  const journeys: Row[] = query.data?.journeys || [];
  const myJourney = journeys.find(j => j.mine);
  const sharing = !!session || !!myJourney;
  const center: [number, number] = query.data?.center || [67, 48];
  const point = chosen?.location;
  const focus = picked || localPoint || (point ? [point.longitude, point.latitude] as [number, number] : null);
  const offers: Row[] = inbox.data?.offers || [];
  const quickOn = (inbox.data?.preferences || []).filter((p: Row) => p.enabled).length;
  const noFlats = role === 'owner' && !!data.user && !(data.ownProperties || []).length;

  const record = (item: Row): Row | undefined => (item.kind === 'job' ? data.jobs : data.bookings)?.find((e: Row) => e.id === item.id);
  const status = (item: Row) => processStatus(item.kind, record(item) || item, role, accountId,
    data.applications?.find((a: Row) => a.job_id === item.id && a.user_id === accountId));
  const when = (at: number) => capital(nowCardWhen(at, now));

  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  useEffect(() => {
    const sheet = panel.current, host = sheet?.parentElement;
    if (!sheet || !host) return;
    const measure = () => {
      // An opened sheet hides the map anyway: the map keeps the view it had under the folded one.
      if (sheet.dataset.expanded === 'true') return;
      const box = sheet.getBoundingClientRect(), outer = host.getBoundingClientRect();
      setCovered(box.width >= outer.width - 1 ? Math.round((outer.bottom - box.top) / 8) * 8 : undefined);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(sheet);
    measure();
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (role === 'cleaner' && !manualCity.current && data.profile?.city) setCity(current => current || data.profile.city);
  }, [role, data.profile?.city]);
  useEffect(() => { panel.current?.scrollTo({ top: 0 }); }, [selected, picking, expanded]);
  useEffect(() => { if (!chosen) { setPicking(false); setPicked(null); } }, [selected]);
  // Opening the picker looks the flat up by its address, so the owner only checks the pin or taps the right house.
  const [spotNote, setSpotNote] = useState('');
  // Once the owner taps the map or uses "I am here", a late address answer must not move the pin back.
  const handPicked = useRef(false);
  const pickByHand = (spot: [number, number]) => { handPicked.current = true; setPicked(spot); };
  useEffect(() => {
    if (!picking || role !== 'owner' || !chosen || chosen.kind) return;
    let on = true; handPicked.current = false; setSpotNote('Ищу дом по адресу…');
    const existing = point ? [point.longitude, point.latitude] as [number, number] : null;
    if (existing && point?.precision === 'exact') { setPicked(existing); setSpotNote('Метка стоит там, где вы её сохранили. Нажмите на карте, чтобы передвинуть.'); return; }
    mapAPI(role, 'geocode', { propertyId: chosen.id }).then((r: Row) => {
      if (!on || handPicked.current) return; setPicked([r.longitude, r.latitude]);
      setSpotNote(r.found ? 'Нашёл дом по адресу «' + chosen.address + '». Если метка не на том доме, нажмите на нужный дом на карте.' : 'По адресу дом не нашёлся, метка в центре города. Нажмите на свой дом на карте или «Я сейчас здесь».');
    }).catch(() => { if (on && !handPicked.current) setSpotNote('Нажмите на свой дом на карте или «Я сейчас здесь».'); });
    return () => { on = false; };
  }, [picking, chosen?.id]);
  // A flat just added with the AI asks to be put on the map: open it with the point picker on.
  const [pendingPick, setPendingPick] = useState('');
  useEffect(() => {
    if (role !== 'owner') return;
    const take = () => { try { const id = sessionStorage.getItem('owner-map-pick'); if (id) { sessionStorage.removeItem('owner-map-pick'); setPendingPick(id); } } catch { /* storage off */ } };
    take(); window.addEventListener('owner-map-pick', take); return () => window.removeEventListener('owner-map-pick', take);
  }, [role]);
  useEffect(() => {
    if (!pendingPick || !flats.some(f => f.id === pendingPick)) return;
    setSelected('property:' + pendingPick); setPendingPick(''); setExpanded(false);
    requestAnimationFrame(() => { setPicked(null); setPicking(true); });
  }, [pendingPick, flats]);

  // My own position is kept in the browser and forgotten after 90 seconds without an update.
  useEffect(() => {
    if (!localFix) return;
    const remaining = 90000 - (Date.now() - localFix.recordedAt * 1000);
    if (remaining <= 0) { setLocalFix(null); return; }
    const timer = setTimeout(() => setLocalFix(null), remaining);
    return () => clearTimeout(timer);
  }, [localFix]);
  useEffect(() => {
    if (!watching || !navigator.geolocation) return;
    const watch = navigator.geolocation.watchPosition(
      p => { const fix = browserLocationFix(p); if (fix) setLocalFix(fix); },
      e => { setLocationNote({ text: locationFailure(e), stays: true }); if (e.code === 1) { setWatching(false); setLocalFix(null); setLocalPoint(null); } },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
    const timer = setTimeout(() => setWatching(false), 3600000);
    return () => { navigator.geolocation.clearWatch(watch); clearTimeout(timer); };
  }, [watching]);
  useEffect(() => {
    if (!locationNote || locationNote.stays) return;
    const timer = setTimeout(() => setLocationNote(null), 6000);
    return () => clearTimeout(timer);
  }, [locationNote]);

  // One request at a time; whoever asked decides what to do with the answer.
  async function readLocation(): Promise<LocationResult> {
    if (!locationRequest.current) {
      setLocating(true);
      locationRequest.current = requestBrowserLocation(navigator.geolocation, window.isSecureContext)
        .then((fix): LocationResult => ({ fix, problem: '' }), (e: Error): LocationResult => ({ fix: null, problem: e.message }))
        .finally(() => { locationRequest.current = null; if (live.current) setLocating(false); });
    }
    const result = await locationRequest.current;
    if (live.current && result.fix) setLocalFix(result.fix);
    return result;
  }
  // "Nearby" for the cleaner is the known city he is in.
  function cityFromLocation(fix: LocationFix, force: boolean) {
    if (role !== 'cleaner' || (!force && manualCity.current)) return null;
    const found = cityNearLocation(fix.longitude, fix.latitude);
    if (found && found !== city) setCity(found);
    return found;
  }
  function chooseCity(next: string) { manualCity.current = true; setCity(next); setSelected(''); }
  // The round button on the map: show me, and for the cleaner switch to the city I am in.
  async function locate() {
    if (watching) { setWatching(false); setLocalFix(null); setLocalPoint(null); setLocationNote(null); return; }
    setLocationNote({ text: 'Определяем положение… Разрешите доступ, если браузер попросит.', stays: true });
    const { fix, problem } = await readLocation();
    if (!live.current) return;
    if (!fix) { setLocationNote({ text: problem, stays: true }); return; }
    cityFromLocation(fix, true);
    setLocalPoint([fix.longitude, fix.latitude]); setExpanded(false); setWatching(true);
    setLocationNote({ text: accuracyNote(fix), stays: false });
  }
  async function locateCity() {
    setLocationNote({ text: 'Определяем город…', stays: true });
    const { fix, problem } = await readLocation();
    if (!live.current) return;
    if (!fix) { setLocationNote({ text: problem, stays: true }); return; }
    const found = cityFromLocation(fix, true);
    if (found) manualCity.current = true;
    setLocationNote(found
      ? { text: 'Город определён: ' + found + '. Точное положение остаётся в браузере.', stays: false }
      : { text: 'Рядом нет города из списка. Выберите город вручную.', stays: true });
  }
  // If the browser already has the permission, the cleaner's city follows where he is, without a word.
  useEffect(() => {
    if (role !== 'cleaner') return;
    let alive = true;
    void (async () => {
      try {
        const permission = await navigator.permissions?.query({ name: 'geolocation' });
        if (permission?.state !== 'granted' || !alive) return;
        const { fix } = await readLocation();
        if (fix && alive) cityFromLocation(fix, false);
      } catch { /* the city from the profile stays */ }
    })();
    return () => { alive = false; };
  }, []);

  // ----- Sharing my way to the flat with its owner (guest before check-in, cleaner before the job) -----
  useEffect(() => {
    if (!query.data) return;
    if (session && !query.data.journeys.some((j: Row) => j.id === session)) { setSession(''); setGpsStatus(''); setLocationNote({ text: 'Передача положения завершена.', stays: false }); }
  }, [query.data]);
  useEffect(() => {
    if (!session) return;
    let alive = true, watch: number | undefined;
    const update = async (p: GeolocationPosition) => {
      if (alive) setLocalFix({ longitude: p.coords.longitude, latitude: p.coords.latitude, accuracy: p.coords.accuracy, recordedAt: p.timestamp / 1000 });
      if (!alive || sending.current || document.hidden) return;
      sending.current = true;
      try {
        await mapAPI(role, 'journey/point', { id: session, longitude: p.coords.longitude, latitude: p.coords.latitude, accuracy: p.coords.accuracy, recordedAt: Math.floor(p.timestamp / 1000) });
        if (alive) setGpsStatus('Владелец видит, где вы. Точность ±' + Math.round(p.coords.accuracy) + ' м.');
        void qc.invalidateQueries({ queryKey: ['map-workspace', accountId, role] });
      } catch (e: any) {
        if (alive) { setGpsStatus(e.message); if ([403, 409, 410].includes(e.status)) setSession(''); }
      } finally { sending.current = false; }
    };
    if (!navigator.geolocation) { setGpsStatus('Геолокация недоступна.'); return; }
    watch = navigator.geolocation.watchPosition(update, e => {
      if (!alive) return;
      setGpsStatus(e.code === 1 ? 'Нет разрешения на геолокацию. Передача остановлена.' : 'Нет сигнала. Последняя точка может устареть.');
      if (e.code === 1) { void mapAPI(role, 'journey/stop', { id: session }).catch(() => {}); setSession(''); }
    }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
    const visibility = () => { if (document.hidden) setGpsStatus('Вкладка скрыта: положение может не обновляться.'); };
    document.addEventListener('visibilitychange', visibility);
    return () => {
      alive = false;
      if (watch !== undefined) navigator.geolocation.clearWatch(watch);
      document.removeEventListener('visibilitychange', visibility);
      void mapAPI(role, 'journey/stop', { id: session }).catch(() => {});
    };
  }, [session, role, accountId]);

  async function act(action: string, body: Row) {
    setBusy(true); setError('');
    try { const value = await mapAPI(role, action, body); await query.refetch(); return value; }
    catch (e: any) { setError(e.message); return null; }
    finally { setBusy(false); }
  }
  async function startSharing() {
    if (!chosen) return;
    if (!navigator.geolocation) { setError('Геолокация недоступна. Маршрут можно открыть и без неё.'); return; }
    setBusy(true); setError('');
    navigator.geolocation.getCurrentPosition(async () => {
      const value = await act('journey/start', { kind: chosen.kind, entityId: chosen.id, mode: travelMode, consent: true });
      if (value) { setSession(value.id); setGpsStatus('Передача включена на час или пока открыта карта.'); }
      setBusy(false);
    }, () => {
      setError('Не удалось получить положение. Проверьте разрешение в браузере.'); setBusy(false);
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 });
  }
  async function stopSharing() {
    const id = session || myJourney?.id;
    if (id && !await act('journey/stop', { id })) return false;
    setSession(''); setGpsStatus(''); setLocationNote({ text: 'Передача положения остановлена.', stays: false });
    return true;
  }

  // ----- Panel -----
  function select(id: string) {
    setError(''); setPrivateRoute(null); setSelected(id); setExpanded(false); setHubTab('today');
    setPicked(null); setLocalPoint(null); setPicking(false);
  }
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (document.querySelector('dialog[open], [data-slot=dialog-content][data-state=open], [data-slot=sheet-content][data-state=open], [data-slot=popover-content][data-state=open]')) return;
      if (picking) { setPicking(false); setPicked(null); }
      else if (expanded) setExpanded(false);
      else if (selected) select('');
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [picking, expanded, selected]);

  // The handle follows the finger: up opens the sheet, down closes it; a tap toggles it.
  const handle = {
    onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => { dragFrom.current = e.clientY; e.currentTarget.setPointerCapture(e.pointerId); },
    onPointerUp: (e: ReactPointerEvent<HTMLButtonElement>) => {
      const from = dragFrom.current; dragFrom.current = null;
      if (from !== null && Math.abs(e.clientY - from) > 24) { swiped.current = true; setExpanded(e.clientY < from); }
    },
    onClick: () => { if (swiped.current) { swiped.current = false; return; } setExpanded(v => !v); },
  };

  // MatchingInbox keeps its own open state: its launcher is hidden by CSS and pressed from here.
  function openInbox() {
    const host = inboxHost.current;
    if (host?.querySelector('.matching-inbox-panel')) return true;
    const launcher = host?.querySelector<HTMLButtonElement>('.matching-inbox > button');
    if (!launcher) return false;
    launcher.click();
    return true;
  }
  function pressChip(chip: AiChip) {
    if (chip.id === 'requests' && offers.length && openInbox()) return;
    if (chip.id === 'add-property') { onCreate(); return; }
    if (chip.id === 'jobs-nearby') { setExpanded(v => !v); return; }
    if (chip.href) goWorkspace(chip.href);
  }
  // Something to answer or to fix opens its actions at once; a calm reminder is shown on the map first.
  function openNow(card: NowCardData) {
    if (card.kind === 'request' && !card.entityId) { openInbox(); return; }
    const onMap = card.entityId ? deals.find(d => d.kind === card.entityKind && d.id === card.entityId) : undefined;
    if (onMap && !card.urgent && ['checkin', 'checkout', 'stay', 'job', 'application'].includes(card.kind)) { select(onMap.mapKey); return; }
    if (card.entityKind && card.entityId) onProcess(card.entityKind, card.entityId);
    else if (card.href) goWorkspace(card.href);
  }

  const line = roleAiLine(role as Role);
  const chips: AiChip[] = noFlats ? [] : line.chips.map(chip =>
    chip.id === 'requests' && offers.length ? { ...chip, hint: 'Запросы гостей без ответа: ' + offers.length, active: true }
      : chip.id === 'jobs-nearby' ? { ...chip, active: expanded }
        : chip);
  const offer = offers[0];
  const card: NowCardData | null = noFlats ? null : offer
    ? { kind: 'request', title: 'Гость ждёт ответа', detail: 'Ответить до ' + clock(offer.expires_at) + ' · ' + offer.title, at: offer.expires_at, actionLabel: 'Ответить', urgent: true }
    : nowCard(role as Role, data, now);
  const loaded = !!query.data;
  const noJobs = role === 'cleaner' && loaded && !nearby.length;
  const noJobsLine = <p className="map-role-note">Сейчас рядом нет заданий. Новые появятся здесь.</p>;

  const dealLine = (item: Row) => when(item.start) + ' · ' + (role === 'cleaner' && item.status === 'open' && record(item)?.fee ? money(record(item)!.fee) : status(item).label);
  const flatLine = (item: Row) => kindLabel(item.details?.type) + ' · ' + (item.display_status?.label || 'Статус уточняется') + ' · ' + item.city + (item.location ? '' : ' · нет точки на карте');
  const rows = (items: Row[], text: (item: Row) => string) => (
    <ul className="map-role-list">
      {items.map(item => <MapRow key={item.mapKey} item={item} role={role} line={text(item)} onOpen={() => select(item.mapKey)} />)}
    </ul>
  );
  const disclosure = (icon: ReactNode, label: string, counter: string) => (
    <button type="button" className="map-home-refine" aria-expanded={expanded} onClick={() => setExpanded(v => !v)}>
      {icon}<span className="map-role-refine-label">{label}</span>
      {counter && <span className="map-role-count">{counter}</span>}
      <ChevronDown size={18} aria-hidden="true" />
    </button>
  );
  // The guest's bookings come from the state the shell has loaded, so the list is there before the map answers.
  // One that is still ahead opens on the map; a past one has no place there and opens its card.
  const trips = role === 'guest' ? guestTrips(data, now) : [];
  const tripRows = (items: typeof trips) => (
    <ul className="map-role-list">
      {items.map(trip => (
        <MapRow key={trip.id} item={{ kind: 'booking', title: trip.title }} role={role} line={when(trip.start) + ' · ' + trip.status}
          onOpen={() => { if (trip.open) select('booking:' + trip.id); else onProcess('booking', trip.id); }} />
      ))}
    </ul>
  );
  const pending = !loaded && !query.isError && <p className="map-role-note" role="status">Загружаем…</p>;
  // The cleaner's day: the stops of the route in their order, and the rest of what is his (later days, reports sent, answers given).
  const stops = route.map(r => mine.find(d => d.kind === 'job' && d.id === r.id)).filter((d): d is Row => !!d);
  const later = role === 'cleaner' ? mine.filter(d => !stops.includes(d)) : [];
  const daySummary = routeSummary(stops.map(d => ({ fee: Number(record(d)?.fee) || 0, point: d.location ? [Number(d.location.longitude), Number(d.location.latitude)] as [number, number] : null })));

  const home = (
    <>
      {onBack && <button type="button" className="map-role-back" onClick={onBack}><ArrowLeft size={18} aria-hidden="true" />К поиску жилья</button>}
      {role !== 'guest' && <AiLine placeholder={line.placeholder} shortPlaceholder={line.shortPlaceholder} label={line.label} chips={chips} onSubmit={onAsk} onChip={pressChip} />}
      {/* The guest's list below starts with the same booking the card would name. */}
      {role !== 'guest' && <NowCard card={card} onOpen={openNow} />}
      {noFlats && (
        <div className="map-role-empty">
          <p>Добавьте первое жильё, и оно появится на карте</p>
          <button type="button" className="map-role-button" onClick={onCreate}>Добавить жильё</button>
        </div>
      )}
      {noJobs && !card && noJobsLine}
      {role === 'owner' && !noFlats && (
        <>
          {disclosure(<Building2 size={18} aria-hidden="true" />, 'Мои объекты', loaded ? String(flats.length) : '')}
          <div className="map-home-details">
            {pending}
            {rows(flats, flatLine)}
            {mine.length > 0 && <><h2 className="map-role-heading">Брони и уборки</h2>{rows(mine, dealLine)}</>}
            {inbox.data && (
              <button type="button" className="map-role-row is-link" onClick={openInbox}>
                <span className="map-role-thumb is-icon" aria-hidden="true"><Zap size={20} /></span>
                <span className="map-role-row-text">
                  <strong>Быстрые запросы гостей</strong>
                  <span>{quickOn ? 'Включены: ' + plural(quickOn, 'объект', 'объекта', 'объектов') : 'Выключены'}</span>
                </span>
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            )}
          </div>
        </>
      )}
      {role === 'cleaner' && (
        <>
          {disclosure(<MapPin size={18} aria-hidden="true" />, stops.length ? 'Мой день' : city || 'Все города',
            !loaded ? '' : stops.length ? plural(stops.length, 'уборка', 'уборки', 'уборок') : nearby.length ? plural(nearby.length, 'задание', 'задания', 'заданий') : 'нет заданий')}
          <div className="map-home-details">
            {pending}
            {/* The day first, in the order it is driven; then what is ahead, then what can be taken nearby. */}
            {stops.length > 0 && (
              <>
                <p className="map-role-note">{daySummary}</p>
                <ul className="map-role-list">
                  {stops.map(stop => <MapRow key={stop.mapKey} item={stop} role={role} order={stop.pinOrder} line={clock(stop.start) + ' · ' + cleanerLine(record(stop) || stop)} onOpen={() => select(stop.mapKey)} />)}
                </ul>
              </>
            )}
            {later.length > 0 && <><h2 className="map-role-heading">{stops.length ? 'Дальше' : 'Мои задания'}</h2>{rows(later, dealLine)}</>}
            {nearby.length > 0 && <><h2 className="map-role-heading">{city ? 'Задания рядом' : 'Задания'}</h2>{rows(nearby.slice(0, 20), dealLine)}</>}
            {noJobs && !!card && noJobsLine}
            <div className="map-role-city">
              <label>
                <span>Город</span>
                <select className="map-role-select" value={city} onChange={e => chooseCity(e.target.value)}>
                  <option value="">Все города</option>
                  {[...new Set([...Object.keys(mapCities), ...(city ? [city] : [])])].map(name => <option key={name} value={name}>{name}</option>)}
                </select>
              </label>
              <button type="button" className="map-role-button is-quiet" disabled={locating} onClick={() => void locateCity()}><LocateFixed size={18} aria-hidden="true" />Мой город</button>
            </div>
            <a className="map-role-row is-link" href="/workspace/cleaner/jobs">
              <span className="map-role-row-text"><strong>Все задания</strong></span>
              <ChevronRight size={18} aria-hidden="true" />
            </a>
          </div>
        </>
      )}
      {role === 'guest' && (
        <>
          <h2 className="map-role-heading">Мои брони</h2>
          {tripRows(trips.filter(trip => trip.open))}
          {!trips.some(trip => trip.open) && <p className="map-role-note">{trips.length ? 'Сейчас броней нет.' : 'Броней пока нет. Найдите жильё на карте.'}</p>}
          {trips.some(trip => !trip.open) && <><h2 className="map-role-heading">Прошлые</h2>{tripRows(trips.filter(trip => !trip.open))}</>}
        </>
      )}
    </>
  );

  // ----- A flat or a booking/job chosen on the map or in the list -----
  const back = <button type="button" className="map-role-back" onClick={() => select('')}><ArrowLeft size={18} aria-hidden="true" />Назад</button>;
  const precision = !point ? 'Точка на карте ещё не указана.'
    : point.source === 'fixture' ? 'Учебная точка, это не настоящий адрес.'
      : point.precision === 'exact' ? 'Точка указана владельцем.' : 'Показан примерный район, точный адрес скрыт.';
  const more = (label: string) => (
    <button type="button" className="map-home-refine" aria-expanded={expanded} onClick={() => setExpanded(v => !v)}>
      {label}<ChevronDown size={18} aria-hidden="true" />
    </button>
  );

  let flatCard: ReactNode = null, dealCard: ReactNode = null, pointEditor: ReactNode = null;
  if (chosen && !chosen.kind) {
    // A booking or a cleaning of this flat is shown on the map when it is there, in its card otherwise.
    const openDeal = (kind: string, id: string) => { if (deals.some(d => d.mapKey === kind + ':' + id)) select(kind + ':' + id); else onProcess(kind, id); };
    const own: Row = (data.ownProperties || []).find((p: Row) => p.id === chosen.id) || chosen;
    flatCard = (
      <>
        {back}
        <div className="map-role-flat">
          <Thumb item={chosen} role={role} />
          <div className="map-role-flat-text">
            <h2 className="map-role-title">{chosen.title}</h2>
            <StatusBadge status={chosen.display_status} />
            <span className="map-role-when">{hubLine(calendarEntries(data, 'owner', chosen.id, now), now)}</span>
          </div>
        </div>
        <PropertyHub property={own} data={data} now={now} open={expanded} tab={hubTab}
          onTab={tab => { setExpanded(!(expanded && tab === hubTab)); setHubTab(tab); }} onOpen={openDeal}
          onEdit={step => onEdit?.(chosen.id, step || null)} onStep={step => onProcess('property', chosen.id, step === 'preview' ? undefined : step)}
          onPoint={() => { setPicked(null); setPicking(true); setExpanded(false); }} pointNote={precision} onChanged={onChanged} />
      </>
    );
    pointEditor = (
      <div className="map-role-point">
        <h2 className="map-role-title">Где дом на карте</h2>
        <p className="map-role-note" aria-live="polite">{spotNote}</p>
        <div className="map-role-actions">
          <button type="button" className="map-role-button" disabled={busy || !picked} onClick={async () => {
            if (!picked) return;
            const saved = await act('location', { propertyId: chosen.id, longitude: picked[0], latitude: picked[1], version: point?.version || 0, confirmed: true });
            if (saved) { setPicking(false); setPicked(null); }
          }}>Сохранить</button>
          <button type="button" className="map-role-button is-quiet" disabled={locating} onClick={async () => {
            setLocating(true); const { fix, problem } = await readLocation(); setLocating(false);
            if (!live.current) return;
            if (fix) { pickByHand([Number(fix.longitude.toFixed(6)), Number(fix.latitude.toFixed(6))]); setSpotNote('Метка там, где вы сейчас. Если дом не здесь, нажмите на него на карте.'); }
            else setSpotNote(problem);
          }}><LocateFixed size={18} aria-hidden="true" />Я сейчас здесь</button>
          <button type="button" className="map-role-button is-quiet" onClick={() => { setPicking(false); setPicked(null); }}>Отмена</button>
        </div>
      </div>
    );
  }
  if (chosen?.kind) {
    const actual = record(chosen), job = chosen.kind === 'job';
    const travelers = journeys.filter(j => j.kind === chosen.kind && j.entityId === chosen.id);
    const chosenJourney = travelers[0];
    // The way to the flat is offered to the one who goes there, within a day of the start.
    const canTravel = role !== 'owner' && point?.precision === 'exact' && chosen.start < now + 86400 && chosen.end > now
      && (job ? actual?.assigned_to === accountId && actual?.status === 'assigned' : actual?.status === 'confirmed' && !actual?.terms?.actual_checkin);
    const hasMore = canTravel || point?.precision === 'exact' || travelers.length > 0;
    // The guest's main button is the step that is due now (pay, check in, check out); the card with the rest is one tap further.
    const guestStay = role === 'guest' && !job ? actual : null, next = guestStep(guestStay, now, data.paymentMode);
    // The badge says what the booking waits for ("Ждёт оплаты"), as its row in the list does.
    const guestTrip = guestStay ? trips.find(trip => trip.id === chosen.id) : undefined;
    // The owner's main button is his next step as well: a request is answered from the map, without the card in between.
    const ownerNext = role === 'owner' && !job ? ownerStep(actual, now) : null;
    // A cleaning has its one step too: the cleaner answers, starts and reports; the owner chooses and accepts.
    const jobNext = !job ? null : role === 'cleaner' ? cleanerStep(actual || chosen, data.applications?.find((a: Row) => a.job_id === chosen.id && a.user_id === accountId), accountId)
      : role === 'owner' ? ownerJobStep(actual, (data.applications || []).filter((a: Row) => a.job_id === chosen.id && a.status === 'pending').length) : null;
    // The cleaner's own job says what it waits for, in the same words as its row of the day.
    const ownJob = job && role === 'cleaner' && actual?.assigned_to === accountId && ['assigned', 'in_progress', 'submitted'].includes(actual.status) ? actual : null;
    const main = next ? { id: next.id as string, label: next.label } : ownerNext ? { id: ownerNext.id as string, label: ownerStepOnMap(ownerNext) } : jobNext ? { id: jobNext.id as string, label: jobNext.label } : null;
    dealCard = (
      <>
        {back}
        <div className="map-role-card">
          <div className="map-role-card-head">
            <span className="map-role-eyebrow">{job ? 'Уборка' : 'Проживание'}</span>
            <StatusBadge status={guestTrip ? { label: guestTrip.status, tone: guestTrip.tone } : ownJob ? { label: cleanerLine(ownJob), tone: ownJob.status === 'submitted' ? 'neutral' : ownJob.status === 'in_progress' || ownJob.checkout_confirmed ? 'success' : 'warning' } : status(chosen)} />
          </div>
          <h2 className="map-role-title">{chosen.title}</h2>
          <span className="map-role-when">{period(chosen.start, chosen.end, now)}{job && actual?.fee ? ' · ' + money(actual.fee) : ''}</span>
        </div>
        <div className="map-role-actions">
          {/* One main button: the step that is due; with nothing due, the way there for the one who goes; otherwise the card. */}
          {!main && canTravel
            ? <button type="button" className="map-role-button" aria-expanded={expanded} onClick={() => setExpanded(true)}><Navigation size={18} aria-hidden="true" />Маршрут до жилья</button>
            : <button type="button" className="map-role-button" onClick={() => onProcess(chosen.kind, chosen.id, main?.id)}>{main ? main.label : job ? 'Открыть задание' : 'Открыть бронь'}</button>}
          <button type="button" className="map-role-button is-quiet" onClick={() => onDiscussion({ kind: chosen.kind, entityId: chosen.id, channel: job ? 'cleaning' : 'stay' })}>
            <MessagesSquare size={18} aria-hidden="true" />{role !== 'owner' ? 'Написать владельцу' : job ? 'Чат по уборке' : 'Написать гостю'}
          </button>
        </div>
        {more(expanded ? 'Свернуть' : guestStay ? 'Маршрут и заселение' : hasMore ? 'Маршрут и подробности' : 'Подробнее')}
        <div className="map-home-details">
          <ProcessJourney kind={chosen.kind} item={actual || chosen} />
          {guestStay?.status === 'confirmed' && <CheckinGuide key={'guide:' + chosen.id} bookingId={chosen.id} />}
          {canTravel && (
            <JourneyNavigation key={chosen.mapKey} role={role} kind={chosen.kind} entityId={chosen.id} mode={travelMode} onMode={setTravelMode}
              sharingId={session || myJourney?.id}
              onSharing={id => { setSession(id); setGpsStatus('Владелец видит ваше положение и маршрут.'); }}
              onStopSharing={stopSharing} onLocation={setLocalFix}
              onRoute={route => { setPrivateRoute(route); if (route) setExpanded(false); }} />
          )}
          {travelers.length > 0 && (
            <ul className="map-role-travelers" aria-label="Кто в пути">
              {travelers.map(j => (
                <li key={j.id}>
                  <strong>{j.mine ? 'Вы в пути' : j.kind === 'booking' ? 'Гость в пути' : 'Исполнитель в пути'}</strong>
                  <span>{j.longitude === null ? 'Нет свежего положения' : 'Обновлено в ' + clock(j.recordedAt) + ', точность ±' + Math.round(j.accuracy || 0) + ' м'}</span>
                  {j.route && <span>Маршрут: {(j.route.distance / 1000).toFixed(1)} км, около {Math.max(1, Math.round(j.route.duration / 60))} мин</span>}
                </li>
              ))}
            </ul>
          )}
          {point?.precision === 'exact' && (
            <a className="map-role-button is-quiet" href={'https://yandex.kz/maps/?rtext=~' + point.latitude + ',' + point.longitude + '&rtt=' + (travelMode === 'walking' ? 'pd' : 'auto')} target="_blank" rel="noreferrer">
              <Navigation size={18} aria-hidden="true" />Маршрут в Яндекс Картах
            </a>
          )}
          {canTravel && !chosenJourney && (
            <div className="map-role-sharing">
              <p className="map-role-note">Владелец увидит, где вы. Передача идёт до часа, пока открыта карта, и её можно остановить.</p>
              <button type="button" className="map-role-button is-quiet" disabled={busy || !!myJourney || !!session} onClick={startSharing}>{busy ? 'Подключаем…' : 'Я в пути: показать владельцу'}</button>
            </div>
          )}
          <p className="map-role-note">{precision}</p>
          {(main || canTravel) && <button type="button" className="map-role-button is-quiet" onClick={() => onProcess(chosen.kind, chosen.id)}>{job ? 'Всё о задании' : 'Все действия с бронью'}</button>}
        </div>
      </>
    );
  }

  const view = picking && pointEditor ? 'point' : flatCard ? 'flat' : dealCard ? 'deal' : 'home';
  const people = [...journeys.filter(p => !localFix || !p.mine), ...(localFix ? [{ id: 'local-me', mine: true, kind: role === 'cleaner' ? 'job' : 'booking', ...localFix }] : [])];
  const routes = [
    ...journeys.filter(j => j.route && chosen
      && (chosen.kind ? j.entityId === chosen.id && j.kind === chosen.kind : deals.some(d => d.id === j.entityId && d.kind === j.kind && d.propertyId === chosen.id))
      && (!privateRoute || j.entityId !== privateRoute.entityId || j.kind !== privateRoute.kind)).map(j => j.route),
    ...(privateRoute ? [privateRoute] : []),
  ];
  const draft = picking && picked ? [{ mapKey: 'draft-point', location: { longitude: picked[0], latitude: picked[1] } }] : [];

  return (
    <div className="map-concept-operations" data-role={role}>
      <section className="map-role" data-expanded={expanded ? 'true' : 'false'} aria-label="Карта">
        <h1 className="sr-only">Карта</h1>
        {(role === 'owner' || role === 'guest') && !selected && !picking && <PriceTip role={role} cards={data.approvals || []} onChanged={onChanged} onEdit={onEdit} />}
        {/* MapCanvas places the pins correctly only when they are known before the map is ready and its
            camera has not been moved yet. So the map is created once the data has come, and again for another city. */}
        {(loaded || query.isError) && (
          <MapCanvas key={city + (loaded ? ':data' : ':empty')} searchKey={selected ? '' : 'fit'}
            sheetSize={expanded && focus && !routes.length ? 2 : 1} sheetHeight={covered}
            items={[...pins, ...draft]}
            selected={draft.length ? 'draft-point' : role === 'owner' && chosen?.kind ? 'property:' + chosen.propertyId : selected}
            onSelect={select} center={center} people={people} routes={routes} pick={picking}
            onPick={p => pickByHand([Number(p[0].toFixed(6)), Number(p[1].toFixed(6))])} focus={focus} memoryKey={accountId + ':' + role + ':' + city}
            heat={heat} sparks={sparks} lines={routeLine} />
        )}
        <button type="button" className="map-home-round map-role-locate" disabled={locating} aria-busy={locating} aria-pressed={watching}
          aria-label={locating ? 'Определяем положение' : watching ? 'Скрыть моё положение' : 'Показать, где я'} onClick={() => void locate()}>
          <LocateFixed size={20} aria-hidden="true" />
        </button>
        <section ref={panel} className="map-home-panel map-role-panel" data-expanded={expanded ? 'true' : 'false'} data-view={view} aria-label={view === 'home' ? 'Главное' : 'Выбрано на карте'}>
          <button type="button" className="map-home-handle" aria-label={expanded ? 'Свернуть' : 'Развернуть'} aria-expanded={expanded} {...handle} />
          {error && <p className="map-role-status is-error" role="alert">{error}</p>}
          {!loaded && query.isError && (
            <p className="map-role-status is-error" role="alert">
              <span>Не удалось загрузить карту.</span>
              <button type="button" className="map-role-inline" onClick={() => void query.refetch()}>Повторить</button>
            </p>
          )}
          {locationNote && <p className="map-role-status" role="status"><LocateFixed size={16} aria-hidden="true" /><span>{locationNote.text}</span></p>}
          {gpsStatus && !sharing && <p className="map-role-status" role="status"><Navigation size={16} aria-hidden="true" /><span>{gpsStatus}</span></p>}
          {sharing && (
            <div className="map-role-live">
              <p role="status"><Navigation size={16} aria-hidden="true" /><span>{gpsStatus || 'Передача положения включена.'}</span></p>
              <button type="button" className="map-role-button is-danger" disabled={busy} aria-label="Остановить передачу положения" onClick={() => void stopSharing()}>Остановить</button>
            </div>
          )}
          {view === 'point' ? pointEditor : view === 'flat' ? flatCard : view === 'deal' ? dealCard : home}
        </section>
      </section>
      {role === 'owner' && <div ref={inboxHost} className="map-role-inbox"><MatchingInbox accountId={accountId} /></div>}
    </div>
  );
}
