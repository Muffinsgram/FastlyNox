import test from 'node:test';
import assert from 'node:assert/strict';
import { memberRefreshFailure, memberRetryDelay, roleRefreshPatch } from '../src/lib/memberRefresh.js';

test('Cloudflare role refresh failures never display the HTML response and retry automatically', () => {
  const failure = memberRefreshFailure({ message: '<!DOCTYPE html><html><head><title>supabase.co | 522: Connection timed out</title></head><body>Error code 522</body></html>' });
  assert.equal(failure.transient, true);
  assert.match(failure.message, /Otomatik yeniden deneniyor/);
  assert.doesNotMatch(failure.message, /<|DOCTYPE|supabase.co/);
  assert.ok(failure.message.length < 160);
});

test('partial failures preserve the previous role and assignment snapshot', () => {
  const success = { data: [{ id: 'admin', name: 'Admin' }] };
  const assignment = { data: [{ user_id: 'alice', role_id: 'admin' }] };
  const failed = { data: null, error: { status: 522 } };
  assert.equal(roleRefreshPatch(success, failed), null);
  assert.equal(roleRefreshPatch(failed, assignment), null);
  assert.deepEqual(roleRefreshPatch(success, assignment), { roles: success.data, assignments: { alice: ['admin'] } });
  assert.deepEqual(roleRefreshPatch({ data: [] }, { data: [] }), { roles: [], assignments: {} });
});

test('retry delays back off and permission/schema failures do not retry forever', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 20].map(memberRetryDelay), [2000, 4000, 8000, 16000, 30000, 30000]);
  assert.equal(memberRefreshFailure({ message: 'Failed to fetch' }, 'Üyeler').transient, true);
  assert.equal(memberRefreshFailure({ status: 403, message: 'Denied' }).transient, false);
  assert.match(memberRefreshFailure({ code: '42P01', message: 'Missing table' }).message, /veritabanının güncellenmesi/);
});
