import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadPure} from './helpers/pure.mjs';

const {headLine} = await loadPure('mobile/src/head-line.ts', 'lib/ai-line.ts');
const site = await loadPure('lib/ai-line.ts');
const roles = ['guest', 'owner', 'cleaner'];

test('the line and the chips say what the site says', () => {
  for (const role of roles) {
    const mine = headLine(role), theirs = site.roleAiLine(role);
    assert.equal(mine.placeholder, theirs.placeholder);
    assert.equal(mine.shortPlaceholder, theirs.shortPlaceholder);
    assert.equal(mine.label, theirs.label);
    // Every chip of the site is in the app, in the same order and with the same words.
    assert.deepEqual(mine.chips.map(chip => chip.title), theirs.chips.map(chip => chip.label), role);
  }
});

test('every chip does something in the app', () => {
  const actions = {
    guest: ['daily', 'hourly', 'weekend'],
    owner: ['requests', 'calendar', 'add-property'],
    cleaner: ['nearby', 'schedule']
  };
  for (const role of roles) {
    const chips = headLine(role).chips;
    assert.deepEqual(chips.map(chip => chip.action), actions[role]);
    for (const chip of chips) assert.ok(chip.hint, chip.title);
  }
});

test('the chips of a role fit one row of a 360px phone', () => {
  // 328px between the paddings of the sheet; a chip is its text (14px, about 8px a letter at most) plus 32px, with 8px between chips.
  for (const role of roles) {
    const chips = headLine(role).chips;
    const width = chips.reduce((sum, chip) => sum + chip.title.length * 8 + 32, 0) + (chips.length - 1) * 8;
    assert.ok(width <= 328, role + ': ' + width);
    assert.ok(chips.length >= 2 && chips.length <= 3);
  }
});
