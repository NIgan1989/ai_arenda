import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadPure} from './helpers/pure.mjs';

const {guestTokens, blamedTokens, sectionWords, whenWords, SECTION_TITLES} = await loadPure('mobile/src/guest-tokens.ts', 'mobile/src/ai-request.ts', 'lib/map-search-request.ts');
const {newDraft, guestRequestFromText, chipDraft, withKind, matchingBody} = await loadPure('mobile/src/ai-request.ts', 'lib/map-search-request.ts');

// Wednesday 18 November 2026, 15:00 in Kazakhstan.
const NOW = Date.parse('2026-11-18T10:00:00Z');
const cities = ['Павлодар', 'Экибастуз'];
const ids = tokens => tokens.map(t => t.id);
const said = (text, from = newDraft('Павлодар', NOW)) => guestRequestFromText(text, from, cities, NOW).draft;

test('a new search shows only what every search has, and nothing to take off', () => {
  const tokens = guestTokens(newDraft('Павлодар', NOW), NOW);
  assert.deepEqual(ids(tokens), ['when', 'guests', 'city']);
  assert.ok(tokens.every(t => !t.clear));
  assert.equal(tokens[1].title, '2 гостя');
  assert.equal(tokens[2].title, 'Павлодар');
});

test('what the phrase names becomes a token that can be taken off', () => {
  const draft = said('студия завтра на двоих до 20000 с wi-fi и парковкой');
  const tokens = guestTokens(draft, NOW);
  assert.deepEqual(ids(tokens).slice(0, 5), ['home', 'when', 'guests', 'price', 'city']);
  assert.deepEqual(ids(tokens).slice(5).sort(), ['f:parking', 'f:wifi']);
  const by = Object.fromEntries(tokens.map(t => [t.id, t]));
  assert.equal(by.home.title, 'Студия');
  assert.match(by.price.title, /^до 20 000 ₸/);
  assert.equal(by['f:wifi'].title, 'Wi-Fi');
  // Taking a token off changes that condition only.
  const without = {...draft, ...by['f:wifi'].clear};
  assert.deepEqual(without.features, draft.features.filter(id => id !== 'wifi'));
  assert.equal(without.maxPrice, draft.maxPrice);
  const cheap = {...draft, ...by.price.clear};
  assert.equal(cheap.maxPrice, '');
  assert.equal(matchingBody({...draft, ...by.home.clear}).kinds.length, 0);
});

test('the day says the hour only when it is not the usual check-in', () => {
  const day = said('завтра на сутки');
  assert.equal(whenWords(day, NOW), '19–20 ноября');
  assert.match(whenWords(said('на 3 часа'), NOW), /^Сегодня \d\d:\d\d–\d\d:\d\d$/);
  const now = chipDraft('now', newDraft('Павлодар', NOW), NOW);
  assert.match(whenWords(now, NOW), /, с \d\d:\d\d$/);
  const tokens = guestTokens(now, NOW);
  assert.equal(tokens[0].id, 'now');
  assert.equal(tokens[0].title, 'Готово сейчас');
  assert.equal({...now, ...tokens[0].clear}.now, false);
});

test('«Сейчас» with the point of the phone is one token, and takes the point off with it', () => {
  const draft = {...chipDraft('now', newDraft('Павлодар', NOW), NOW), near: {longitude: 76.95, latitude: 52.28, radius: 15000}, priority: 'closer'};
  const tokens = guestTokens(draft, NOW);
  assert.ok(!ids(tokens).includes('near') && !ids(tokens).includes('priority'));
  assert.equal(tokens[0].title, 'Сейчас, рядом с вами');
  const off = {...draft, ...tokens[0].clear};
  assert.equal(off.near, null);
  assert.equal(off.priority, 'balanced');
});

test('a point, a landmark and «ближе»', () => {
  const draft = {...newDraft('Павлодар', NOW), near: {longitude: 76.95, latitude: 52.28, radius: 5000, label: 'вокзал'}, priority: 'closer'};
  const tokens = guestTokens(draft, NOW), near = tokens.find(t => t.id === 'near');
  assert.equal(near.title, 'Рядом: вокзал');
  // Without the point «ближе» cannot stay: the search would refuse it.
  assert.deepEqual(near.clear, {near: null, priority: 'balanced'});
  assert.equal(tokens.find(t => t.id === 'priority').title, 'Ближе');
  assert.equal(guestTokens({...draft, near: {...draft.near, label: undefined}}, NOW).find(t => t.id === 'near').title, 'Рядом с точкой');
});

test('a bath and a hall: the category is not a condition, one type is', () => {
  const bath = withKind(newDraft('Павлодар', NOW), 'bath', null, NOW);
  assert.ok(!ids(guestTokens(bath, NOW)).includes('home'));
  const sauna = withKind(bath, 'bath', 'sauna', NOW), token = guestTokens(sauna, NOW).find(t => t.id === 'home');
  assert.equal(token.title, 'Сауна');
  assert.equal({...sauna, ...token.clear}.kinds.length, 2);
  const hall = chipDraft('toi', newDraft('Павлодар', NOW), NOW), tokens = guestTokens(hall, NOW);
  assert.equal(tokens[0].id, 'occasion');
  assert.equal(tokens[0].title, 'Той, свадьба');
  assert.ok(!tokens[0].clear);
});

test('an empty answer blames the tokens that leave nothing free', () => {
  const tokens = guestTokens(said('студия завтра до 20000 с феном и утюгом в центре'), NOW);
  assert.deepEqual(blamedTokens({reason: 'filters', blocker: 'features'}, tokens), ['f:hairdryer', 'f:iron']);
  assert.deepEqual(blamedTokens({reason: 'filters', blocker: 'kinds'}, tokens), ['home']);
  assert.deepEqual(blamedTokens({reason: 'budget'}, tokens), ['price']);
  assert.deepEqual(blamedTokens({reason: 'busy'}, tokens), ['when']);
  assert.deepEqual(blamedTokens({reason: 'guests'}, tokens), ['guests']);
  assert.deepEqual(blamedTokens({reason: 'city'}, tokens), ['city']);
  // A token that is not there is never blamed; with no single reason the type, the district and the wishes are.
  assert.deepEqual(blamedTokens({reason: 'filters', blocker: 'near'}, tokens), []);
  assert.deepEqual(blamedTokens({reason: 'filters'}, tokens).sort(), ['district', 'f:hairdryer', 'f:iron', 'home'].filter(id => tokens.some(t => t.id === id)));
  assert.deepEqual(blamedTokens({reason: 'now'}, tokens), []);
  assert.deepEqual(blamedTokens(null, tokens), []);
});

test('every part of the form has a row with what it holds', () => {
  const draft = said('студия завтра на двоих до 20000 с wi-fi');
  const rows = Object.fromEntries(SECTION_TITLES(draft).map(([id]) => [id, sectionWords(draft, id, NOW)]));
  assert.equal(rows.guests, '2 гостя');
  assert.match(rows.price, /^До 20 000 ₸/);
  assert.equal(rows.home, 'Студия');
  assert.equal(rows.wishes, 'Wi-Fi');
  assert.equal(rows.priority, 'Баланс');
  const empty = newDraft('Павлодар', NOW);
  assert.equal(sectionWords(empty, 'price', NOW), 'Любая');
  assert.equal(sectionWords(empty, 'home', NOW), 'Любое');
  assert.equal(sectionWords(empty, 'wishes', NOW), 'Не важно');
  assert.equal(sectionWords(empty, 'where', NOW), 'Павлодар');
});
