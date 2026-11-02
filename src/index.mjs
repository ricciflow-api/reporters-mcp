#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createRemoteClient } from './remote.mjs';
import { createBridgeServer } from './server.mjs';

try {
  const server = await createBridgeServer(createRemoteClient());
  server.onerror = () => process.stderr.write('Reporters.io MCP protocol error\n');
  await server.connect(new StdioServerTransport());
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => {
    await server.close();
    process.exitCode = 0;
  });
} catch (error) {
  const message = error instanceof Error && /^(Set REPORTERS_API_KEY|Reporters\.io MCP HTTP \d{3}; no automatic retry was made|Could not reach Reporters\.io MCP; no automatic retry was made)$/.test(error.message)
    ? error.message : 'Could not start Reporters.io MCP bridge';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
