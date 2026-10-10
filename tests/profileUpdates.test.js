import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProfilePatch, saveProfilePatch, profileUpdateError } from '../src/lib/profileUpdates.js';

const previous = { id: 'user', username: 'Ken', avatar_url: 'old.webp', status_text: 'Busy', status_expires_at: '2030-01-01T00:00:00Z' };
const draft = { username: 'Ken', avatar_url: 'new.webp', banner_url: '', banner_position_x: 50, banner_position_y: 50, banner_zoom: 1, bio: '', status_text: 'Busy' };

test('changing only the avatar never writes optional profile columns or resets status expiry', () => {
  assert.deepEqual(buildProfilePatch(previous, draft, { avatarChanged: true }), { avatar_url: 'new.webp' });
});

test('only changed text and banner settings are sent, with explicit image removal supported', () => {
  assert.deepEqual(buildProfilePatch(previous, { ...draft, username: 'New name', bio: ' Hello ', avatar_url: null, banner_zoom: 1.5 }, { avatarChanged: true }), { username: 'New name', avatar_url: null, banner_zoom: 1.5, bio: 'Hello' });
  assert.deepEqual(buildProfilePatch({ ...previous, avatar_url: 'new.webp' }, draft, { avatarChanged: true }), {});
});

test('a changed status sets its expiry while an unrelated save preserves it', () => {
  assert.deepEqual(buildProfilePatch(previous, { ...draft, status_text: 'Away' }, { statusDuration: '1', now: 0 }), { status_text: 'Away', status_expires_at: '1970-01-01T01:00:00.000Z' });
});

function clientFor(result, captured) {
  return { from(table) { assert.equal(table, 'profiles'); return { update(patch) { captured.push(patch); return { eq(field, id) { assert.equal(field, 'id'); assert.equal(id, 'user'); return { select(columns) { assert.equal(columns, 'id'); return { maybeSingle: async () => result }; } }; } }; } }; } };
}

test('saving an avatar against a legacy schema only sends avatar_url and confirms a row was updated', async () => {
  const captured = [];
  await saveProfilePatch(clientFor({ data: { id: 'user' }, error: null }, captured), 'user', buildProfilePatch(previous, draft, { avatarChanged: true }));
  assert.deepEqual(captured, [{ avatar_url: 'new.webp' }]);
});

test('RLS zero-row updates and server errors cannot be reported as success or trigger cleanup', async () => {
  await assert.rejects(saveProfilePatch(clientFor({ data: null, error: null }, []), 'user', { avatar_url: 'new' }), /Oturumunu/);
  const error = { code: 'PGRST204', message: 'Missing profile column' };
  await assert.rejects(saveProfilePatch(clientFor({ data: null, error }, []), 'user', { bio: 'Hello' }), value => value === error);
  assert.equal(profileUpdateError(error), 'Missing profile column');
});
