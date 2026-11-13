import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadPure} from './helpers/pure.mjs';

const {recallMap, rememberMap, forgetMaps, MAP_KEEP, stageOf, pinStates, withEchoes, targetPin, restoreStep} = await loadPure('mobile/src/map-memory.ts');
const source = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');

test('the map remembers its view, chosen pin and pins per account and role, for half an hour', () => {
  forgetMaps();
  const t = 1_000_000;
  assert.equal(recallMap('u1:owner', t), null);
  rememberMap('u1:owner', {view: {center: [76.95, 52.28], zoom: 15}, viewKey: 'owner:3'}, t);
  rememberMap('u1:owner', {selected: 'property:p1'}, t + 1000);
  const kept = recallMap('u1:owner', t + 2000);
  assert.deepEqual([kept.view.zoom, kept.viewKey, kept.selected], [15, 'owner:3', 'property:p1']);
  // Another role of the same account keeps its own map.
  assert.equal(recallMap('u1:cleaner', t), null);
  // Each change keeps it fresh; half an hour after the last one a return starts from the city again.
  assert.ok(recallMap('u1:owner', t + 1000 + MAP_KEEP));
  assert.equal(recallMap('u1:owner', t + 1001 + MAP_KEEP), null);
});

test('a pin that changed while the map was closed comes back with how it looked', () => {
  const before = {stage: 'owner', pins: pinStates([{key: 'property:a', tone: 'home', label: '15 000 ₸'}, {key: 'property:b', tone: 'pending', label: 'Запрос'}])};
  assert.equal(stageOf('owner:5'), 'owner');
  assert.equal(stageOf('preview:1700000000'), 'preview');
  const now = [{key: 'property:a', tone: 'home', label: '15 000 ₸'}, {key: 'property:b', tone: 'booked', label: 'Заезд сегодня'}, {key: 'property:c', label: 'Новое'}];
  const shown = withEchoes(now, before, 'owner');
  assert.equal(shown[0].was, undefined);
  assert.deepEqual(shown[1].was, {tone: 'pending', label: 'Запрос'});
  assert.equal(shown[2].was, undefined);
  // Pins are compared only within one state of the panel: the guest's list is not «changed» by the plain map.
  assert.equal(withEchoes(now, before, 'base')[1].was, undefined);
  assert.equal(withEchoes(now, null, 'owner')[1].was, undefined);
});

test('«На карте» finds the pin each role sees', () => {
  const data = {
    bookings: [{id: 'b1', property_id: 'p1', city: 'Алматы'}],
    jobs: [{id: 'j1', property_id: 'p2', city: 'Павлодар'}],
    ownProperties: [{id: 'p1', city: 'Алматы'}],
    properties: [{id: 'p3', city: 'Павлодар'}]
  };
  assert.deepEqual(targetPin('guest', {kind: 'booking', id: 'b1'}, data), {key: 'p1', city: 'Алматы'});
  assert.deepEqual(targetPin('owner', {kind: 'booking', id: 'b1'}, data), {key: 'property:p1', city: 'Алматы'});
  assert.deepEqual(targetPin('owner', {kind: 'job', id: 'j1'}, data), {key: 'property:p2', city: 'Павлодар'});
  assert.deepEqual(targetPin('cleaner', {kind: 'job', id: 'j1'}, data), {key: 'job:j1', city: 'Павлодар'});
  assert.deepEqual(targetPin('owner', {kind: 'property', id: 'p1'}, data), {key: 'property:p1', city: 'Алматы'});
  assert.deepEqual(targetPin('guest', {kind: 'property', id: 'p3'}, data), {key: 'p3', city: 'Павлодар'});
  // A map without such a pin offers no button.
  assert.equal(targetPin('cleaner', {kind: 'booking', id: 'b1'}, data), null);
  assert.equal(targetPin('guest', {kind: 'job', id: 'j1'}, data), null);
  assert.equal(targetPin('owner', {kind: 'booking', id: 'missing'}, data), null);
});

test('a remembered view is shown while the same pins are on the map', () => {
  const restore = {view: {center: [76.95, 52.28], zoom: 15}, key: 'owner:3'};
  assert.equal(restoreStep(restore, 'owner:3', 3), 'show');
  assert.equal(restoreStep(restore, 'owner:0', 0), 'hold');
  assert.equal(restoreStep(restore, 'owner:4', 4), 'fit');
  assert.equal(restoreStep(null, 'owner:3', 3), 'fit');
});

test('the pages, the chat and both maps are wired to the memory', () => {
  const app = source('App.tsx'), home = source('src/MapHome.tsx'), chats = source('src/NativeChats.tsx'), pins = source('src/MapPins.tsx');
  assert.match(app, /RecordHead kind="booking"[^>]*onMap=\{onMap\('booking',id\)\}/);
  assert.match(app, /RecordHead kind="job"[^>]*onMap=\{onMap\('job',id\)\}/);
  assert.match(app, /onMap=\{onMap\('property',id\)\}/);
  assert.match(app, /mapLink=\{onMap\}/);
  assert.match(app, /target=\{mapTarget\} onTargetDone=/);
  assert.match(chats, /props\.mapLink\?\.\(subject\.kind,subject\.id\)/);
  assert.match(home, /withEchoes\(next, echoes\.current, stage\)/);
  for (const map of ['src/TileMap.tsx', 'src/LiveMap.native.tsx']) assert.match(source(map), /restoreStep\(back,focusKey,pins\.length\)/);
  assert.match(pins, /useRef<PinState>\(pin\.was\|\|/);
});
