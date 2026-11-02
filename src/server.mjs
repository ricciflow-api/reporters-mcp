import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

export async function createBridgeServer(remote) {
  // Hosted initialization verifies the key and current Pro access before local startup.
  await remote.initialize();
  const server = new Server({ name: 'reporters', version: '1.0.0' }, { capabilities: { tools: { listChanged: false } } });
  server.setRequestHandler(ListToolsRequestSchema, async ({ params }) => remote.listTools(params || {}));
  server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
    try { return await remote.callTool(params); }
    catch (error) {
      const message = error instanceof Error && /^(Reporters\.io MCP HTTP \d{3}; no automatic retry was made|Could not reach Reporters\.io MCP; no automatic retry was made|Unknown Reporters\.io tool)$/.test(error.message)
        ? error.message : 'Reporters.io MCP request failed; no automatic retry was made';
      return { isError: true, content: [{ type: 'text', text: message }] };
    }
  });
  return server;
}
