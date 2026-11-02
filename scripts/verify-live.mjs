import assert from 'node:assert/strict';
import { discover, expectedTools, mcpUrl } from './discover.mjs';
if (!process.argv.includes('--authenticated')) {
  const response = await fetch(mcpUrl, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000), headers: { Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'reporters-missing-key-check', version: '1.0.0' } } }) });
  assert.equal(response.status, 401, 'MCP must reject a missing credential');
  console.log('Live MCP missing-key rejection passed; no data tools called.');
} else {
  const result = await discover();
  const names = result.tools.map(tool => tool.name);
  assert.ok(names.length > 0, "Authenticated discovery must expose supported tools");
  assert.equal(new Set(names).size, names.length, "Tool names must be unique");
  assert.ok(names.every(name => expectedTools.includes(name)), "Discovery returned an unknown public tool");
  assert.notEqual(result.initialized.capabilities?.tools?.listChanged, true, "Fixed tool catalogs must not advertise change subscriptions");
  console.log('Live authenticated initialization and tool discovery passed; no data tools called.');
}
