import assert from 'node:assert/strict';
import { discover, expectedTools, mcpUrl } from './discover.mjs';
if (!process.argv.includes('--authenticated')) {
  const response = await fetch(mcpUrl, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000), headers: { Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'reporters-missing-key-check', version: '1.0.0' } } }) });
  assert.equal(response.status, 401, 'MCP must reject a missing credential');
  console.log('Live MCP missing-key rejection passed; no data tools called.');
} else {
  const result = await discover();
  assert.deepEqual(result.tools.map(tool => tool.name).sort(), expectedTools);
  console.log('Live authenticated initialization and tool discovery passed; no data tools called.');
}
