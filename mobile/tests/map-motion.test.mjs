import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadPure} from './helpers/pure.mjs';
import {readFileSync} from 'node:fs';

const {pinEvent, appearDelay, flight, flightFrame, MAP_EVENTS} = await loadPure('mobile/src/map-motion.ts');
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
  // Cleaner: applied, assigned, started, handed over.
  assert.equal(pinEvent(pin('job', 'Уборка'), pin('job', 'Отклик ✓')), 'update');
  assert.equal(pinEvent(pin('job'), pin('offer')), 'answer');
  assert.equal(pinEvent(pin('offer'), pin('active')), 'start');
  assert.equal(pinEvent(pin('active'), pin('booking')), 'update');
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

test('the list of map events covers every role, and the doc lists each of them', () => {
  for (const role of ['all', 'guest', 'owner', 'cleaner']) assert.ok(MAP_EVENTS.some(e => e.role === role));
  const doc = readFileSync(new URL('../../docs/MAP_MOTION.md', import.meta.url), 'utf8');
  for (const e of MAP_EVENTS) assert.ok(doc.includes(e.event), 'docs/MAP_MOTION.md misses: ' + e.event);
});
