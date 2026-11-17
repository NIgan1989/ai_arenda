import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadPure} from './helpers/pure.mjs';

const {mineOf, markOf, markLabel, favouredFirst, againList, toggled} = await loadPure('mobile/src/favorites.ts');
const homes = ['a', 'b', 'c', 'd'].map(id => ({id, title: id.toUpperCase()}));

test('the state gives the favourites and the homes of earlier stays; anything else is an empty list', () => {
  assert.deepEqual(mineOf({favorites: ['a', 7], stayed: ['b']}), {favorites: ['a'], stayed: ['b']});
  assert.deepEqual(mineOf(null), {favorites: [], stayed: []});
  assert.deepEqual(mineOf({favorites: 'a'}), {favorites: [], stayed: []});
});

test('a favourite is marked before «Вы здесь жили»', () => {
  const mine = {favorites: ['a'], stayed: ['a', 'b']};
  assert.equal(markOf('a', mine), 'favorite');
  assert.equal(markOf('b', mine), 'stayed');
  assert.equal(markOf('c', mine), '');
  assert.equal(markLabel('favorite'), '♥ Ваше избранное');
  assert.equal(markLabel('stayed'), 'Вы здесь жили');
  assert.equal(markLabel(''), '');
});

test('in the results favourites come first, then earlier stays, the rest in the order of the search', () => {
  assert.deepEqual(favouredFirst(homes, {favorites: ['d'], stayed: ['c']}).map(p => p.id), ['d', 'c', 'a', 'b']);
  assert.deepEqual(favouredFirst(homes, {favorites: [], stayed: []}).map(p => p.id), ['a', 'b', 'c', 'd']);
});

test('«Снова туда же» lists only homes still in the catalogue, each once, favourites first', () => {
  assert.deepEqual(againList(homes, {favorites: ['c', 'gone'], stayed: ['c', 'a']}).map(p => p.id), ['c', 'a']);
  assert.deepEqual(againList(homes, {favorites: ['a', 'b', 'c'], stayed: ['d']}, 2).map(p => p.id), ['a', 'b']);
});

test('the heart tapped: on puts the home first, off takes it out, stays are untouched', () => {
  const mine = {favorites: ['a'], stayed: ['b']};
  assert.deepEqual(toggled(mine, 'c', true), {favorites: ['c', 'a'], stayed: ['b']});
  assert.deepEqual(toggled(mine, 'a', false), {favorites: [], stayed: ['b']});
});
