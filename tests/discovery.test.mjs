import { test } from 'node:test';
import assert from 'node:assert/strict';
import { discover, expectedTools, parseRpc } from '../scripts/discover.mjs';

test('parses a bounded JSON or SSE discovery response', () => {
  assert.deepEqual(parseRpc('{"jsonrpc":"2.0","id":1,"result":{"ok":true}}', 1), { ok: true });
  assert.deepEqual(parseRpc('event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"ok":true}}\n\n', 1), { ok: true });
  assert.throws(() => parseRpc('{"id":1,"error":{"message":"private"}}', 1), /invalid or error/);
  assert.throws(() => parseRpc('null', 1), /invalid or error/);
});

test('only initialization, notification and discovery are sent; Bearer stays in headers', async () => {
  const calls = [];
  const result = await discover({ key: 'fixture-key', fetchImpl: async (url, options) => {
    const message = JSON.parse(options.body); calls.push(message.method);
    assert.equal(url, 'https://reporters.io/api/mcp');
    assert.equal(options.headers.Authorization, 'Bearer fixture-key');
    assert.equal(options.redirect, 'error');
    if (message.method === 'notifications/initialized') return new Response(null, { status: 202 });
    return Response.json({ jsonrpc: '2.0', id: message.id, result: message.method === 'initialize' ? { protocolVersion: '2025-03-26' } : { tools: expectedTools.map(name => ({ name })) } });
  } });
  assert.deepEqual(calls, ['initialize', 'notifications/initialized', 'tools/list']);
  assert.deepEqual(result.tools.map(tool => tool.name), expectedTools);
});

test('HTTP failures are not retried or echoed with response bodies', async () => {
  let calls = 0;
  await assert.rejects(discover({ key: 'fixture-key', fetchImpl: async () => { calls++; return new Response('private response', { status: 401 }); } }), /HTTP 401/);
  assert.equal(calls, 1);
});
