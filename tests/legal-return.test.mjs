import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { load } from './helpers/platform.mjs';

const { legalReturn, legalLink } = await load('legal-return');
const { menuFromSearch, searchWithMenu } = await load('menu-address');
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('a document returns to the screen it was opened from', () => {
  assert.deepEqual(legalReturn('/workspace/owner/account?menu=safety'), { href: '/workspace/owner/account?menu=safety', label: 'Назад' });
  assert.deepEqual(legalReturn('app'), { href: 'aiarenda://', label: 'В приложение' });
  for (const bad of [undefined, '', 'https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)', '/privacy', '/terms/owner', '/a/..//evil.example', '/a/../\\evil.example', ['/a']])
    assert.deepEqual(legalReturn(bad), { href: '/', label: 'На карту' }, String(bad));
  assert.equal(legalLink('/terms', '/workspace/guest/account?menu=safety'), '/terms?from=%2Fworkspace%2Fguest%2Faccount%3Fmenu%3Dsafety');
  assert.equal(legalLink('/terms', ''), '/terms');
});

test('the open screen of the menu is kept in the address', () => {
  assert.equal(menuFromSearch('?menu=safety'), 'safety');
  assert.equal(menuFromSearch('?menu=safety:devices'), 'safety:devices');
  assert.equal(menuFromSearch('?menu=hack'), '');
  assert.equal(searchWithMenu('?tab=x', 'safety:ai'), '?tab=x&menu=safety:ai');
  assert.equal(searchWithMenu('?menu=safety', ''), '');
});

test('every link to a document keeps the way back, on the site and in the app', () => {
  assert.doesNotMatch(read('components/safety-controls.tsx'), /href="\/(privacy|terms|data-deletion)"/);
  assert.match(read('components/legal-information.tsx'), /href=\{back\.href\}/);
  assert.doesNotMatch(read('components/legal-information.tsx'), /href="\/"><ChevronLeft/);
  for (const path of ['app/privacy/page.tsx', 'app/privacy/consent/page.tsx', 'app/terms/page.tsx', 'app/terms/owner/page.tsx', 'app/terms/guest/page.tsx', 'app/terms/cleaner/page.tsx', 'app/data-deletion/page.tsx'])
    assert.match(read(path), /from=\{from\}/, path);
  for (const path of ['mobile/src/AccountSafety.tsx', 'mobile/src/AccountControl.tsx', 'mobile/App.tsx'])
    assert.doesNotMatch(read(path), /openURL\(API_URL\+(path|'\/terms')\)/, path);
});
