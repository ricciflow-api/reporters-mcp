import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { spawnSync } from 'node:child_process';
import { createRemoteClient } from '../src/remote.mjs';
import { createBridgeServer } from '../src/server.mjs';

const tools = [{ name: 'search_reporters', description: 'Search', inputSchema: { type: 'object', properties: { query: { type: 'string' } } }, annotations: { readOnlyHint: true, destructiveHint: false } }];
function fixture(handler) {
  const calls = [];
  const remote = createRemoteClient({ key: 'synthetic-key', fetchImpl: async (url, options) => {
    assert.equal(url, 'https://reporters.io/api/mcp');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, 'Bearer synthetic-key');
    const message = JSON.parse(options.body);
    assert(!options.body.includes('synthetic-key'));
    calls.push(message);
    if (handler) {
      const response = handler(message, calls);
      if (response) return response;
    }
    if (message.method === 'notifications/initialized') return new Response(null, { status: 202 });
    const result = message.method === 'initialize' ? { protocolVersion: '2025-03-26', capabilities: { tools: {} } }
      : message.method === 'tools/list' ? { tools }
      : { content: [{ type: 'text', text: '{"data":{"items":[]},"request_id":"synthetic"}' }], structuredContent: { data: { items: [] }, request_id: 'synthetic' }, isError: false };
    return Response.json({ jsonrpc: '2.0', id: message.id, result });
  } });
  return { remote, calls };
}

test('bridge forwards current schemas, annotations, structured results and deliberate retry keys through MCP', async () => {
  const { remote, calls } = fixture();
  const server = await createBridgeServer(remote);
  const client = new Client({ name: 'bridge-test', version: '1.0.0' });
  const [local, peer] = InMemoryTransport.createLinkedPair();
  try {
    await Promise.all([server.connect(local), client.connect(peer)]);
    assert.deepEqual((await client.listTools()).tools, tools);
    const args = { query: 'climate', idempotency_key: 'same-deliberate-operation' };
    const result = await client.callTool({ name: 'search_reporters', arguments: args });
    assert.deepEqual(result.structuredContent, { data: { items: [] }, request_id: 'synthetic' });
    assert.equal(result.isError, false);
    assert.deepEqual(calls.map(call => call.method), ['initialize', 'notifications/initialized', 'tools/list', 'tools/call']);
    assert.deepEqual(calls.at(-1).params.arguments, args);
  } finally { await client.close(); await server.close(); }
});

test('discovery rechecks hosted access instead of serving a cached tool catalog', async () => {
  let lists = 0;
  const { remote, calls } = fixture(message => {
    if (message.method === 'tools/list' && ++lists === 2) return new Response('private denial', { status: 403 });
  });
  await remote.listTools();
  await assert.rejects(remote.listTools(), /HTTP 403/);
  assert.equal(calls.filter(call => call.method === 'tools/list').length, 2);
});

test('startup rejects missing or invalid keys before exposing local tools', async () => {
  assert.throws(() => createRemoteClient({ key: '' }), /Set REPORTERS_API_KEY/);
  const { remote, calls } = fixture(() => new Response('private body', { status: 401 }));
  await assert.rejects(createBridgeServer(remote), /HTTP 401/);
  assert.equal(calls.length, 1);
});

test('unknown tools are blocked and failures are not retried or disclosed', async () => {
  let calls = 0;
  const remote = createRemoteClient({ key: 'synthetic-key', fetchImpl: async () => { calls++; throw new Error('secret transport detail'); } });
  await assert.rejects(remote.callTool({ name: 'untrusted_tool' }), /Unknown Reporters.io tool/);
  assert.equal(calls, 0);
  await assert.rejects(remote.initialize(), /Could not reach Reporters.io MCP/);
  assert.equal(calls, 1);
  const server = await createBridgeServer({ initialize: async () => {}, listTools: async () => ({ tools }), callTool: async () => { throw new Error('secret remote detail'); } });
  const client = new Client({ name: 'error-test', version: '1.0.0' });
  const [local, peer] = InMemoryTransport.createLinkedPair();
  try {
    await Promise.all([server.connect(local), client.connect(peer)]);
    const result = await client.callTool({ name: 'search_reporters', arguments: {} });
    assert.equal(result.isError, true);
    assert(!JSON.stringify(result).includes('secret'));
  } finally { await client.close(); await server.close(); }
});

test('bridge preserves hosted tool errors and bounds responses', async () => {
  const failure = { isError: true, content: [{ type: 'text', text: 'public operation error' }] };
  const { remote } = fixture(message => message.method === 'tools/call' ? Response.json({ jsonrpc: '2.0', id: message.id, result: failure }) : undefined);
  assert.deepEqual(await remote.callTool({ name: 'search_reporters', arguments: {} }), failure);
  const { remote: oversized } = fixture(message => message.method === 'tools/list' ? new Response('x'.repeat(2 * 1024 * 1024 + 1)) : undefined);
  await assert.rejects(oversized.listTools(), /exceeded the local bridge limit/);
});


test('stdio entrypoint keeps protocol output clean when a credential is missing', () => {
  const result = spawnSync(process.execPath, ['src/index.mjs'], { encoding: 'utf8', env: { PATH: process.env.PATH, REPORTERS_API_KEY: '' }, timeout: 5000 });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /^Set REPORTERS_API_KEY\n$/);
});


test('a contact response is never replayed locally after hosted access is revoked', async () => {
  let reveals = 0;
  const delivered = { content: [{ type: 'text', text: 'synthetic contact' }], structuredContent: { data: { reporter_id: '123', email: 'fixture@example.test' } }, isError: false };
  const { remote, calls } = fixture(message => {
    if (message.method !== 'tools/call') return;
    if (++reveals === 2) return new Response('private denial', { status: 403 });
    return Response.json({ jsonrpc: '2.0', id: message.id, result: delivered });
  });
  const input = { name: 'reveal_reporter_contacts', arguments: { reporter_id: '123', idempotency_key: 'same-reveal-operation' } };
  assert.deepEqual(await remote.callTool(input), delivered);
  await assert.rejects(remote.callTool(input), /HTTP 403/);
  assert.equal(calls.filter(call => call.method === 'tools/call').length, 2);
});
