import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { load } from './helpers/platform.mjs';

const { cleanerStep, ownerJobStep, cleanerLine } = await load('job-steps');
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const me = 'cleaner-1';

test('the cleaner has one step a cleaning: answer, start, report', () => {
  assert.equal(cleanerStep({ status: 'open' }, undefined, me)?.id, 'apply');
  assert.equal(cleanerStep({ status: 'open' }, { status: 'pending' }, me), null, 'an answer already sent waits for the owner');
  assert.equal(cleanerStep({ status: 'open' }, { status: 'rejected' }, me)?.id, 'apply');
  assert.equal(cleanerStep({ status: 'assigned', assigned_to: me }, undefined, me), null, 'the guest has not left yet');
  assert.equal(cleanerStep({ status: 'assigned', assigned_to: me, checkout_confirmed: 1 }, undefined, me)?.label, 'Начать уборку');
  assert.equal(cleanerStep({ status: 'in_progress', assigned_to: me }, undefined, me)?.label, 'Отправить отчёт');
  assert.equal(cleanerStep({ status: 'submitted', assigned_to: me }, undefined, me), null);
  assert.equal(cleanerStep({ status: 'in_progress', assigned_to: 'someone-else' }, undefined, me), null);
  assert.equal(cleanerStep(null, undefined, me), null);
});

test('the owner chooses among the answers and accepts the report', () => {
  assert.equal(ownerJobStep({ status: 'open' }, 0), null);
  assert.equal(ownerJobStep({ status: 'open' }, 1)?.label, 'Выбрать исполнителя');
  assert.equal(ownerJobStep({ status: 'open' }, 3)?.label, 'Выбрать исполнителя · 3');
  assert.equal(ownerJobStep({ status: 'submitted' }, 0)?.id, 'accept');
  assert.equal(ownerJobStep({ status: 'in_progress' }, 0), null);
});

test('a stop of the day says what it waits for', () => {
  assert.equal(cleanerLine({ status: 'assigned' }), 'Ждём выезда гостя');
  assert.equal(cleanerLine({ status: 'assigned', checkout_confirmed: true }), 'Гость выехал, можно начинать');
  assert.equal(cleanerLine({ status: 'in_progress' }), 'Уборка идёт, подготовьте отчёт');
  assert.equal(cleanerLine({ status: 'submitted' }), 'Отчёт у владельца на приёмке');
});

test('the card of the job, the map of the site and the map of the app share the rule', () => {
  const chat = read('app/chat.tsx'), map = read('components/map-workspace.tsx'), app = read('mobile/src/MapHome.tsx');
  assert.match(chat, /function runJobStep\(/);
  assert.match(chat, /runJobStep\(work,step as JobStepId\)/);
  assert.match(map, /cleanerStep\(actual \|\| chosen/);
  assert.match(map, /Маршрут до жилья/);
  assert.ok(map.indexOf('{daySummary}') < map.indexOf("'Задания рядом"), 'the day comes before the jobs nearby');
  assert.match(app, /cleanerStep\(j,undefined,userId\)/);
  assert.match(app, /act\(j\.id,'start'\)/);
});
