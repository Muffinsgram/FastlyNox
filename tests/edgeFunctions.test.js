import test from 'node:test';
import assert from 'node:assert/strict';
import { invokeAuthenticatedFunction, readFunctionError } from '../src/lib/edgeFunctions.js';

test('non-2xx errors expose the server response while preserving the response body', async () => {
  const context = new Response(JSON.stringify({ error: 'Üyeleri taşıma yetkin yok.' }), { status: 403 });
  const result = { data: null, error: { message: 'Edge Function returned a non-2xx status code', context } };
  assert.equal(await readFunctionError(result), 'Üyeleri taşıma yetkin yok.');
  assert.equal(context.bodyUsed, false);
  assert.equal(await readFunctionError({ error: { context: new Response('gateway', { status: 503 }) } }), 'Ses yönetimi sunucusunda hata oluştu. Yeniden dene.');
});

test('an expired authorization retries once with the refreshed user token', async () => {
  const tokens = [];
  let refreshes = 0;
  const client = {
    auth: {
      async getSession() { return { data: { session: { access_token: 'old', expires_at: Date.now() / 1000 + 1000 } } }; },
      async refreshSession() { refreshes++; return { data: { session: { access_token: 'new' } } }; },
    },
    functions: { async invoke(_name, options) {
      tokens.push(options.headers.Authorization);
      return tokens.length === 1 ? { error: { context: new Response('{}', { status: 401 }) } } : { data: { success: true }, error: null };
    } },
  };
  assert.deepEqual((await invokeAuthenticatedFunction(client, 'voice', {})).data, { success: true });
  assert.deepEqual(tokens, ['Bearer old', 'Bearer new']);
  assert.equal(refreshes, 1);
});

test('permission errors are neither retried nor hidden behind a generic gateway message', async () => {
  let refreshes = 0;
  const client = {
    auth: { async getSession() { return { data: { session: { access_token: 'valid' } } }; }, async refreshSession() { refreshes++; } },
    functions: { async invoke() { return { error: { message: 'non-2xx', context: new Response('{"error":"Yetkin yok"}', { status: 403 }) } }; } },
  };
  const result = await invokeAuthenticatedFunction(client, 'voice', {});
  assert.equal(result.error.message, 'Yetkin yok');
  assert.equal(refreshes, 0);
});
