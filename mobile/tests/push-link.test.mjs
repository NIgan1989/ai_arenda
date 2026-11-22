import test from 'node:test';
import assert from 'node:assert/strict';
import {loadPure} from './helpers/pure.mjs';
// A tap on a push opens only a screen of the app, the one of the role the push was for (audit of notices, point 4).
const {pushLink} = await loadPure('mobile/src/push-link.ts', 'mobile/src/deep-links.ts');

test('a push opens its card, its chat, or the map of its role', () => {
  assert.deepEqual(pushLink({role: 'owner', url: '/workspace/owner/bookings?entity=b-1'}), {kind: 'link', url: 'aiarenda://workspace/owner/bookings?entity=b-1'});
  assert.deepEqual(pushLink({role: 'cleaner', url: '/workspace/cleaner/assignments?entity=j1'}), {kind: 'link', url: 'aiarenda://workspace/cleaner/assignments?entity=j1'});
  assert.deepEqual(pushLink({role: 'guest', url: '/workspace/guest/chats?room=r_1'}), {kind: 'chat', role: 'guest', roomId: 'r_1'});
  assert.deepEqual(pushLink({role: 'guest', url: '/workspace/guest/chats'}), {kind: 'chat', role: 'guest'});
  assert.deepEqual(pushLink({role: 'owner', url: '/workspace/owner/map'}), {kind: 'link', url: 'aiarenda://workspace/owner/map'});
});

test('a push cannot lead outside the app or into another role', () => {
  const map = role => ({kind: 'link', url: 'aiarenda://workspace/' + role + '/map'});
  assert.deepEqual(pushLink({role: 'guest', url: 'https://evil.test/workspace/guest/bookings'}), map('guest'));
  assert.deepEqual(pushLink({role: 'guest', url: '/workspace/owner/bookings?entity=b1'}), map('guest'));
  assert.deepEqual(pushLink({role: 'owner', url: '/workspace/owner/bookings?entity=../x'}), map('owner'));
  assert.deepEqual(pushLink({role: 'guest', url: '/workspace/owner/chats?room=r1'}), map('guest'));
  assert.equal(pushLink({role: 'admin', url: '/workspace/owner/map'}), null);
  assert.equal(pushLink(null), null);
});
