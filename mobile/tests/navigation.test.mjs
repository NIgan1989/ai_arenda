import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadPure} from './helpers/pure.mjs';

const {metres, snap, navState, offRoute, arrived, distanceText, minutesText, turnArrow, OFF_ROUTE} = await loadPure('mobile/src/navigation.ts');

// An L-shaped road: east along a street for about 680 m, then north for about 560 m.
const corner = [76.96, 52.28];
const route = {
  distance: 1240, duration: 240,
  geometry: {coordinates: [[76.95, 52.28], [76.955, 52.28], corner, [76.96, 52.285]]},
  steps: [
    {at: [76.95, 52.28], type: 'depart', distance: 680, text: 'Начните движение'},
    {at: corner, type: 'turn', modifier: 'left', name: 'улица Ленина', distance: 560, text: 'Поверните налево на улица Ленина'},
    {at: [76.96, 52.285], type: 'arrive', distance: 0, text: 'Вы на месте'}
  ]
};

test('the next turn is the one ahead, with the metres to it and what is left', () => {
  const start = navState(route, [76.95, 52.28]);
  assert.equal(start.next.text, 'Поверните налево на улица Ленина');
  assert.ok(Math.abs(start.toNext - metres([76.95, 52.28], corner)) < 5);
  assert.ok(Math.abs(start.left - 1239) < 15);
  assert.equal(start.secondsLeft, 240);
  const middle = navState(route, [76.9575, 52.2801]);
  assert.ok(Math.abs(middle.toNext - metres([76.9575, 52.28], corner)) < 5);
  assert.ok(middle.off < 15);
  // Past the corner, the turn is behind: the arrival is next.
  const after = navState(route, [76.96, 52.282]);
  assert.equal(after.next.type, 'arrive');
  assert.ok(after.secondsLeft < 240 && after.secondsLeft > 0);
});

test('the line on the map starts at the person and follows the rest of the road', () => {
  const s = navState(route, [76.9575, 52.2801]);
  assert.deepEqual(s.path[0], [76.9575, 52.2801]);
  assert.deepEqual(s.path.slice(-2), [corner, [76.96, 52.285]]);
});

test('leaving the road asks for a new route, GPS wobble does not', () => {
  assert.equal(offRoute(navState(route, [76.9575, 52.2803]), 10), false);
  assert.equal(offRoute(navState(route, [76.9575, 52.2815]), 10), true);
  assert.equal(OFF_ROUTE, 60);
  assert.equal(snap(route.geometry.coordinates, corner).index >= 1, true);
});

test('arrival is within 40 m of the object', () => {
  assert.equal(arrived([76.96, 52.2848], [76.96, 52.285]), true);
  assert.equal(arrived([76.96, 52.284], [76.96, 52.285]), false);
});

test('distances, minutes and arrows read naturally', () => {
  assert.equal(distanceText(42), '40 м');
  assert.equal(distanceText(320), '300 м');
  assert.equal(distanceText(1240), '1,2 км');
  assert.equal(distanceText(15400), '15 км');
  assert.equal(minutesText(20), '1 мин');
  assert.equal(minutesText(600), '10 мин');
  assert.equal(minutesText(4500), '1 ч 15 мин');
  assert.equal(minutesText(3600), '1 ч');
  assert.equal(turnArrow({type: 'turn', modifier: 'left'}), '←');
  assert.equal(turnArrow({type: 'turn', modifier: 'slight right'}), '↗');
  assert.equal(turnArrow({type: 'roundabout'}), '↻');
  assert.equal(turnArrow({type: 'arrive'}), '⚑');
  assert.equal(turnArrow(null), '↑');
});
