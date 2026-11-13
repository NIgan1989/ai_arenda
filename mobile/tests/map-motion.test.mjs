import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadPure} from './helpers/pure.mjs';
import {readFileSync} from 'node:fs';

const {pinEvent, appearDelay, flight, flightFrame, answerLeft, ANSWER_WINDOW, FLIGHT_MIN_MS, FLIGHT_MAX_MS, MAP_EVENTS, beams, carouselIndex, beamBox} = await loadPure('mobile/src/map-motion.ts');
const {project} = await loadPure('mobile/src/map-math.ts');
const pin = (tone, label = 'x') => ({tone, label});

test('each change of a pin is one named event', () => {
  assert.equal(pinEvent(undefined, pin('home')), 'appear');
  assert.equal(pinEvent(pin('home', '18 тыс.'), pin('home', '18 тыс.')), 'none');
  assert.equal(pinEvent(pin('home', '18 тыс.'), pin('home', '20 тыс.')), 'update');
  // Guest: the flat is asked, the owner answers, the guest books.
  assert.equal(pinEvent(pin('booking'), pin('pending')), 'ask');
  assert.equal(pinEvent(pin('pending'), pin('offer')), 'answer');
  assert.equal(pinEvent(pin('offer'), pin('booked')), 'celebrate');
  // Owner: a request arrives, then ends without an answer.
  assert.equal(pinEvent(pin('home'), pin('pending')), 'ask');
  assert.equal(pinEvent(pin('pending'), pin('home')), 'settle');
  assert.equal(pinEvent(pin('offer'), pin('home')), 'settle');
  // A request the owner or the AI confirmed («Заявка» → «Заезд 21:00») is a yes, never the calm end of a refusal.
  assert.equal(pinEvent(pin('pending', 'Заявка'), pin('booking', 'Заезд 21:00')), 'answer');
  // Cleaner: applied, assigned, started, handed over.
  assert.equal(pinEvent(pin('job', 'Уборка'), pin('job', 'Отклик ✓')), 'update');
  assert.equal(pinEvent(pin('job'), pin('offer')), 'answer');
  assert.equal(pinEvent(pin('offer'), pin('active')), 'start');
  assert.equal(pinEvent(pin('active'), pin('booking')), 'update');
  // Trouble: late or at risk, then solved.
  assert.equal(pinEvent(pin('active'), pin('alert')), 'alarm');
  assert.equal(pinEvent(pin('alert'), pin('job')), 'calm');
  assert.equal(pinEvent(pin('alert'), pin('active')), 'start');
});

test('a new set of pins appears as a wave from the middle, within 360ms', () => {
  assert.equal(appearDelay(100, 100, 100, 100), 0);
  assert.ok(appearDelay(150, 100, 100, 100) < appearDelay(250, 100, 100, 100));
  assert.equal(appearDelay(5000, 5000, 0, 0), 360);
});

test('a flight starts exactly where the old view was and ends at the new one', () => {
  const view = (center, zoom) => ({...project(center, zoom), zoom});
  const w = 390, h = 800, cx = w / 2, cy = h / 2, ox = w / 2, oy = 260;
  const from = view([76.95, 52.287], 12), to = view([76.97, 52.29], 13);
  const f = flight(from, to);
  assert.equal(f.k, 0.5);
  // A point of the map seen in the new view, and where the old view had it.
  const point = [76.96, 52.28];
  const pNew = {x: project(point, 13).x - to.x + ox, y: project(point, 13).y - to.y + oy};
  const pOld = {x: project(point, 12).x - from.x + ox, y: project(point, 12).y - from.y + oy};
  const start = flightFrame(f, 1, cx, cy, ox, oy), end = flightFrame(f, 0, cx, cy, ox, oy);
  const drawn = frame => ({x: cx + frame.x + frame.scale * (pNew.x - cx), y: cy + frame.y + frame.scale * (pNew.y - cy)});
  assert.ok(Math.abs(drawn(start).x - pOld.x) < 0.01 && Math.abs(drawn(start).y - pOld.y) < 0.01);
  assert.deepEqual({x: Math.round(drawn(end).x * 100), y: Math.round(drawn(end).y * 100)}, {x: Math.round(pNew.x * 100), y: Math.round(pNew.y * 100)});
  // No movement, no flight; a jump over several levels is shown as one.
  assert.equal(flight(from, from), null);
  assert.equal(flight(from, view([76.95, 52.287], 16)).k, 0.5);
  assert.equal(flight(view([76.95, 52.287], 16), from).k, 2);
  // A trip to another city starts at most one tile away, in the direction of the trip.
  const far = flight(from, view([71.43, 51.13], 12), 256);
  assert.ok(Math.abs(Math.hypot(far.dx, far.dy) - 256) < 1e-6);
  assert.ok(far.dx < 0);
});

test('a longer trip flies longer and along an arc, and still starts and ends in place', () => {
  const view = (center, zoom) => ({...project(center, zoom), zoom});
  const home = view([76.95, 52.287], 13);
  const near = flight(home, view([76.951, 52.287], 13), 256, 256), far = flight(home, view([76.99, 52.30], 13), 256, 256);
  assert.equal(near.arc, 0);
  assert.equal(near.ms, FLIGHT_MIN_MS + Math.round((FLIGHT_MAX_MS - FLIGHT_MIN_MS) * Math.hypot(near.dx, near.dy) / 512));
  assert.ok(far.arc > 0 && far.arc <= 0.2);
  assert.ok(far.ms > near.ms && far.ms <= FLIGHT_MAX_MS);
  // The arc lifts the camera half-way only: the first and last frames are the plain ones.
  const plain = {...far, arc: 0};
  for (const u of [0, 1]) assert.deepEqual(flightFrame(far, u, 195, 400, 195, 260), flightFrame(plain, u, 195, 400, 195, 260));
  assert.ok(flightFrame(far, 0.5, 195, 400, 195, 260).scale < flightFrame(plain, 0.5, 195, 400, 195, 260).scale);
});

test('the strip under a waiting pin shows the share of the answer time left', () => {
  assert.equal(ANSWER_WINDOW, 120);
  assert.equal(answerLeft(1000 + 120, 1000), 1);
  assert.equal(answerLeft(1000 + 30, 1000), 0.25);
  assert.equal(answerLeft(1000, 1030), 0);
  assert.equal(answerLeft(5000, 1000), 1);
  assert.equal(answerLeft(NaN, 1000), 0);
});

test('beams go from the search point to asked and answering flats only', () => {
  const from = [76.95, 52.28];
  const lines = beams(from, [
    {key: 'a', point: [76.96, 52.29], tone: 'pending'},
    {key: 'b', point: [76.97, 52.3], tone: 'offer'},
    {key: 'c', point: [76.98, 52.31], tone: 'home'},
    {key: 'd', point: [NaN, 52.3], tone: 'pending'}
  ]);
  assert.deepEqual(lines.map(l => [l.key, l.tone]), [['beam:a', 'ask'], ['beam:b', 'answer']]);
  assert.deepEqual(lines[0].from, from);
  assert.deepEqual(beams(null, [{key: 'a', point: [76.96, 52.29], tone: 'pending'}]), []);
  assert.deepEqual(beams([200, 10], [{key: 'a', point: [76.96, 52.29], tone: 'pending'}]), []);
});

test('the carousel stops on the nearest card and never outside the list', () => {
  assert.equal(carouselIndex(0, 300, 5), 0);
  assert.equal(carouselIndex(140, 300, 5), 0);
  assert.equal(carouselIndex(160, 300, 5), 1);
  assert.equal(carouselIndex(5000, 300, 5), 4);
  assert.equal(carouselIndex(-40, 300, 5), 0);
  assert.equal(carouselIndex(300, 0, 5), 0);
  assert.equal(carouselIndex(300, 300, 0), 0);
});

test('a beam on the web preview is one rotated line between its ends', () => {
  const box = beamBox({x: 0, y: 0}, {x: 30, y: 40});
  assert.deepEqual([box.cx, box.cy, box.length], [15, 20, 50]);
  assert.ok(Math.abs(box.angle - 53.13) < 0.01);
  assert.equal(beamBox({x: 10, y: 10}, {x: 0, y: 10}).angle, 180);
});

test('the list of map events covers every role, and the doc lists each of them', () => {
  for (const role of ['all', 'guest', 'owner', 'cleaner']) assert.ok(MAP_EVENTS.some(e => e.role === role));
  const doc = readFileSync(new URL('../../docs/MAP_MOTION.md', import.meta.url), 'utf8');
  for (const e of MAP_EVENTS) assert.ok(doc.includes(e.event), 'docs/MAP_MOTION.md misses: ' + e.event);
});
