'use client';
import {useEffect,useRef,useState,type PointerEvent as ReactPointerEvent,type ReactNode} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {ArrowLeft,Brush,Building2,CalendarCheck,ChevronDown,ChevronRight,LocateFixed,MapPin,MessagesSquare,Navigation,Zap} from 'lucide-react';
import {JourneyNavigation,type LocationFix} from './journey-navigation';
import type {JourneyRoute} from '../lib/route-geometry';
import type {Role} from '../lib/domain';
import {PropertyCover} from './property-cover';
import {cityNearLocation,mapCities} from '../lib/map-location';
import {browserLocationFix,locationFailure,requestBrowserLocation} from '../lib/browser-location';
import {MapCanvas} from './map-canvas';import {PropertyListing,StatusBadge} from './property-listing';import {processStatus} from '../lib/process-status';
import {AiLine,roleAiLine,type AiChip} from './ai-line';
import {NowCard,nowCard,nowCardWhen,type NowCardData} from './now-card';
import './map-workspace.css';
import {SmartGuestMap,matchingAPI} from './smart-guest-map';
import {MatchingInbox} from './matching-inbox';
import {ProcessJourney} from './process-journey';
type Row=Record<string,any>;
async function mapAPI(role:string,action:string,body:Row={}){const r=await fetch('/api/operations/map/'+action,{method:'POST',headers:{'Content-Type':'application/json','X-Workspace-Role':role},body:JSON.stringify(body),cache:'no-store',keepalive:action==='journey/stop'}),v=await r.json() as Row;if(!r.ok)throw Object.assign(Error(v.error||'Нет связи с картой.'),{status:r.status});return v;}
type MapWorkspaceInput={publicMode?:boolean;role:string;accountId:string;data:Row;onChoose:(p:Row,initial:Row)=>void;onDiscussion:(c:Row)=>void;onProcess:(kind:string,id:string)=>void;onCreate:()=>void;onAsk:(text:string)=>void};

// The guest's first screen is the search map. It gets the state the shell has already loaded (so it does not ask
// the server for it again), opens a booking in the shell's task sheet and hands a question to the AI administrator.
export function MapWorkspace(props: MapWorkspaceInput) {
  const [activity, setActivity] = useState(false);
  if (props.role === 'guest' && !activity) {
    const signedIn = !props.publicMode;
    return (
      <SmartGuestMap
        publicMode={props.publicMode}
        accountId={props.accountId}
        city={props.data.profile?.city}
        onChoose={props.onChoose}
        onActivity={signedIn ? () => setActivity(true) : undefined}
        data={signedIn ? props.data : undefined}
        onProcess={signedIn ? props.onProcess : undefined}
        onAsk={signedIn ? props.onAsk : undefined}
      />
    );
  }
  return <RoleMap {...props} onBack={activity ? () => setActivity(false) : undefined} />;
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
type RoleMapInput = MapWorkspaceInput & { onBack?: () => void };

function Thumb({ item, role }: { item: Row; role: string }) {
  if (!item.kind) return <span className="map-role-thumb"><PropertyCover property={item} role={role} /></span>;
  return (
    <span className="map-role-thumb is-icon" aria-hidden="true">
      {item.kind === 'job' ? <Brush size={20} /> : <CalendarCheck size={20} />}
    </span>
  );
}

function MapRow({ item, role, line, onOpen }: { item: Row; role: string; line: string; onOpen: () => void }) {
  return (
    <li>
      <button type="button" className="map-role-row" onClick={onOpen}>
        <Thumb item={item} role={role} />
        <span className="map-role-row-text">
          <strong>{item.title}</strong>
          <span>{line}</span>
        </span>
        <ChevronRight size={18} aria-hidden="true" />
      </button>
    </li>
  );
}

function RoleMap({ role, accountId, data, onDiscussion, onProcess, onCreate, onAsk, onBack }: RoleMapInput) {
  const qc = useQueryClient();
  // The owner sees every flat he has; the cleaner looks for jobs in one city.
  const [city, setCity] = useState<string>(role === 'cleaner' ? data.profile?.city || '' : '');
  const [selected, setSelected] = useState(''), [expanded, setExpanded] = useState(false);
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
  const flats: Row[] = role === 'owner' ? (query.data?.properties || []).map((p: Row) => ({ ...p, mapPrice: p.price, mapKey: 'property:' + p.id })) : [];
  const deals: Row[] = (query.data?.processes || []).map((p: Row) => ({ ...p, mapKey: p.kind + ':' + p.id })).sort((a: Row, b: Row) => a.start - b.start);
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
  useEffect(() => {
    if (!picking || role !== 'owner' || !chosen || chosen.kind) return;
    let on = true; setSpotNote('Ищу дом по адресу…');
    const existing = point ? [point.longitude, point.latitude] as [number, number] : null;
    if (existing && point?.precision === 'exact') { setPicked(existing); setSpotNote('Метка стоит там, где вы её сохранили. Нажмите на карте, чтобы передвинуть.'); return; }
    mapAPI(role, 'geocode', { propertyId: chosen.id }).then((r: Row) => {
      if (!on) return; setPicked([r.longitude, r.latitude]);
      setSpotNote(r.found ? 'Нашёл дом по адресу «' + chosen.address + '». Если метка не на том доме, нажмите на нужный дом на карте.' : 'По адресу дом не нашёлся, метка в центре города. Нажмите на свой дом на карте или «Я сейчас здесь».');
    }).catch(() => { if (on) setSpotNote('Нажмите на свой дом на карте или «Я сейчас здесь».'); });
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
    setError(''); setPrivateRoute(null); setSelected(id); setExpanded(false);
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
    if (chip.href) window.location.assign(chip.href);
  }
  // Something to answer or to fix opens its actions at once; a calm reminder is shown on the map first.
  function openNow(card: NowCardData) {
    if (card.kind === 'request' && !card.entityId) { openInbox(); return; }
    const onMap = card.entityId ? deals.find(d => d.kind === card.entityKind && d.id === card.entityId) : undefined;
    if (onMap && !card.urgent && ['checkin', 'checkout', 'stay', 'job', 'application'].includes(card.kind)) { select(onMap.mapKey); return; }
    if (card.entityKind && card.entityId) onProcess(card.entityKind, card.entityId);
    else if (card.href) window.location.assign(card.href);
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
  const flatLine = (item: Row) => (item.display_status?.label || 'Статус уточняется') + ' · ' + item.city + (item.location ? '' : ' · нет точки на карте');
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
  const pending = !loaded && !query.isError && <p className="map-role-note" role="status">Загружаем…</p>;

  const home = (
    <>
      {onBack && <button type="button" className="map-role-back" onClick={onBack}><ArrowLeft size={18} aria-hidden="true" />К поиску жилья</button>}
      {role !== 'guest' && <AiLine placeholder={line.placeholder} shortPlaceholder={line.shortPlaceholder} label={line.label} chips={chips} onSubmit={onAsk} onChip={pressChip} />}
      <NowCard card={card} onOpen={openNow} />
      {noFlats && (
        <div className="map-role-empty">
          <p>Добавьте первую квартиру, и она появится на карте</p>
          <button type="button" className="map-role-button" onClick={onCreate}>Добавить квартиру</button>
        </div>
      )}
      {noJobs && !card && noJobsLine}
      {role === 'owner' && !noFlats && (
        <>
          {disclosure(<Building2 size={18} aria-hidden="true" />, 'Мои квартиры', loaded ? String(flats.length) : '')}
          <div className="map-home-details">
            {pending}
            {rows(flats, flatLine)}
            {mine.length > 0 && <><h2 className="map-role-heading">Брони и уборки</h2>{rows(mine, dealLine)}</>}
            {inbox.data && (
              <button type="button" className="map-role-row is-link" onClick={openInbox}>
                <span className="map-role-thumb is-icon" aria-hidden="true"><Zap size={20} /></span>
                <span className="map-role-row-text">
                  <strong>Быстрые запросы гостей</strong>
                  <span>{quickOn ? 'Включены: ' + plural(quickOn, 'квартира', 'квартиры', 'квартир') : 'Выключены'}</span>
                </span>
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            )}
          </div>
        </>
      )}
      {role === 'cleaner' && (
        <>
          {disclosure(<MapPin size={18} aria-hidden="true" />, city || 'Все города', !loaded ? '' : nearby.length ? plural(nearby.length, 'задание', 'задания', 'заданий') : 'нет заданий')}
          <div className="map-home-details">
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
            {pending}
            {nearby.length > 0 && <><h2 className="map-role-heading">{city ? 'Задания рядом' : 'Задания'}</h2>{rows(nearby.slice(0, 20), dealLine)}</>}
            {noJobs && !!card && noJobsLine}
            {mine.length > 0 && <><h2 className="map-role-heading">Мои задания</h2>{rows(mine, dealLine)}</>}
            <a className="map-role-row is-link" href="/workspace/cleaner/jobs">
              <span className="map-role-row-text"><strong>Все задания</strong></span>
              <ChevronRight size={18} aria-hidden="true" />
            </a>
          </div>
        </>
      )}
      {role === 'guest' && (
        <>
          <h2 className="map-role-heading">Моя аренда</h2>
          {pending}
          {rows(mine, dealLine)}
          {loaded && !mine.length && <p className="map-role-note">Броней пока нет.</p>}
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
    const openFlat = () => onProcess('property', chosen.id);
    const flatDeals = deals.filter(d => d.propertyId === chosen.id);
    flatCard = (
      <>
        {back}
        {!expanded && (
          <div className="map-role-flat">
            <Thumb item={chosen} role={role} />
            <div className="map-role-flat-text">
              <h2 className="map-role-title">{chosen.title}</h2>
              <StatusBadge status={chosen.display_status} />
              {!!chosen.price && <span className="map-role-when">{money(chosen.price)} за сутки</span>}
            </div>
          </div>
        )}
        {!expanded && <div className="map-role-actions"><button type="button" className="map-role-button" onClick={openFlat}>Действия</button></div>}
        {more(expanded ? 'Свернуть' : 'Подробнее')}
        <div className="map-home-details">
          <PropertyListing property={chosen} role={role} onChoose={openFlat} actionLabel="Действия" onEdit={openFlat} onSettings={openFlat} />
          {flatDeals.length > 0 && <><h2 className="map-role-heading">Брони и уборки</h2>{rows(flatDeals, dealLine)}</>}
          <button type="button" className="map-role-button is-quiet" onClick={() => { setPicked(null); setPicking(true); setExpanded(false); }}>
            <MapPin size={18} aria-hidden="true" />{point ? 'Уточнить точку на карте' : 'Указать точку на карте'}
          </button>
          <p className="map-role-note">{precision}</p>
        </div>
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
            if (fix) { setPicked([Number(fix.longitude.toFixed(6)), Number(fix.latitude.toFixed(6))]); setSpotNote('Метка там, где вы сейчас. Если дом не здесь, нажмите на него на карте.'); }
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
    dealCard = (
      <>
        {back}
        <div className="map-role-card">
          <div className="map-role-card-head">
            <span className="map-role-eyebrow">{job ? 'Уборка' : 'Проживание'}</span>
            <StatusBadge status={status(chosen)} />
          </div>
          <h2 className="map-role-title">{chosen.title}</h2>
          <span className="map-role-when">{period(chosen.start, chosen.end, now)}{job && actual?.fee ? ' · ' + money(actual.fee) : ''}</span>
        </div>
        <div className="map-role-actions">
          <button type="button" className="map-role-button" onClick={() => onProcess(chosen.kind, chosen.id)}>Действия</button>
          <button type="button" className="map-role-button is-quiet" onClick={() => onDiscussion({ kind: chosen.kind, entityId: chosen.id, channel: job ? 'cleaning' : 'stay' })}>
            <MessagesSquare size={18} aria-hidden="true" />{role !== 'owner' ? 'Написать владельцу' : job ? 'Чат по уборке' : 'Написать гостю'}
          </button>
        </div>
        {more(expanded ? 'Свернуть' : hasMore ? 'Маршрут и подробности' : 'Подробнее')}
        <div className="map-home-details">
          <ProcessJourney kind={chosen.kind} item={actual || chosen} />
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
        {/* MapCanvas places the pins correctly only when they are known before the map is ready and its
            camera has not been moved yet. So the map is created once the data has come, and again for another city. */}
        {(loaded || query.isError) && (
          <MapCanvas key={city + (loaded ? ':data' : ':empty')} searchKey={selected ? '' : 'fit'}
            sheetSize={expanded && focus && !routes.length ? 2 : 1} sheetHeight={covered}
            items={[...pins, ...draft]}
            selected={draft.length ? 'draft-point' : role === 'owner' && chosen?.kind ? 'property:' + chosen.propertyId : selected}
            onSelect={select} center={center} people={people} routes={routes} pick={picking}
            onPick={p => setPicked([Number(p[0].toFixed(6)), Number(p[1].toFixed(6))])} focus={focus} />
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
