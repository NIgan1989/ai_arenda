import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {load} from './helpers/platform.mjs';
const {pinOf,pinsOf,shortPrice}=await load('map-pin-of');
const at={longitude:76.95,latitude:52.28};

test('the site draws each row as the app\'s pin: a price or a state, one colour per state', () => {
  assert.equal(shortPrice(18000), '18 тыс.');
  assert.equal(shortPrice(9500), '9 500 ₸');
  assert.equal(shortPrice(0), '');
  assert.deepEqual(pinOf({mapKey: 'property:a', title: 'Студия', price: 18000, location: at}), {key: 'property:a', point: [76.95, 52.28], label: '18 тыс.', tone: 'home', title: 'Студия'});
  // A guest's match: asked (with the owner's time to answer), then answered; the AI's best choice keeps its ring.
  const asked = pinOf({mapKey: 'property:b', price: 12000, matchPending: true, askExpiresAt: 1000, location: at});
  assert.deepEqual([asked.tone, asked.label, asked.until], ['pending', 'Запрос', 1000]);
  assert.equal(pinOf({mapKey: 'property:b', price: 12000, ownerConfirmed: true, location: at}).tone, 'offer');
  assert.equal(pinOf({mapKey: 'property:c', price: 12000, match: {best: true}, location: at}).best, true);
  // A row that already knows its pin (the owner's and the cleaner's maps) keeps it.
  const owned = pinOf({mapKey: 'property:d', price: 15000, pinTone: 'active', pinLabel: 'Уборка идёт', pinProgress: 1.4, location: at});
  assert.deepEqual([owned.tone, owned.label, owned.progress], ['active', 'Уборка идёт', 1]);
  assert.equal(pinOf({mapKey: 'job:e', kind: 'job', pinTone: 'offer', pinLabel: 'Начинайте', pinOrder: 2, location: at}).order, 2);
  assert.equal(pinOf({mapKey: 'job:f', kind: 'job', location: at}).label, 'Уборка');
  assert.equal(pinOf({mapKey: 'job:f', kind: 'job', pinTone: 'nonsense', location: at}).tone, 'job');
  // Rows without a place are not drawn.
  assert.deepEqual(pinsOf([{mapKey: 'x'}, {mapKey: 'y', location: {longitude: 400, latitude: 1}}, {location: at}]), []);
});

test('the site map draws pins, beams, heat and the route of the day as the app does', () => {
  const canvas = readFileSync('components/map-canvas.tsx', 'utf8'), pills = readFileSync('components/map-pills.tsx', 'utf8');
  const workspace = readFileSync('components/map-workspace.tsx', 'utf8'), guest = readFileSync('components/smart-guest-map.tsx', 'utf8');
  assert.match(canvas, /<MapPills map=\{map\.current\} pins=\{shownPins\}/);
  assert.match(canvas, /withEchoes\(pins,echoes\.current,stage\)/);
  assert.match(pills, /pinEvent\(last\.current/);
  assert.match(workspace, /ownerPin\(p, processes, now, advice\.get\(p\.id\)\)/);
  assert.match(workspace, /cleanerPin\(\{ \.\.\.job, \.\.\.p \}/);
  assert.match(workspace, /heat=\{heat\} sparks=\{sparks\} lines=\{routeLine\}/);
  assert.match(guest, /beams\(beamFrom, pinsOf\(items\)\)/);
});
