import { mcpUrl, expectedTools, parseRpc } from '../scripts/discover.mjs';

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
async function responseText(response) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error('Reporters.io MCP response exceeded the local bridge limit');
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

/** Forward to the fixed hosted server; no retries, redirects, data caching, or local access bypass. */
export function createRemoteClient({ key = process.env.REPORTERS_API_KEY, fetchImpl = fetch } = {}) {
  if (typeof key !== 'string' || !key.trim() || /[\r\n]/.test(key)) throw new Error('Set REPORTERS_API_KEY');
  const credential = key.trim();
  let protocol = '2025-03-26';
  let session;
  let sequence = 0;
  let initialization;
  async function send(method, params, notification = false) {
    const id = notification ? undefined : ++sequence;
    const message = { jsonrpc: '2.0', ...(id === undefined ? {} : { id }), method, ...(params === undefined ? {} : { params }) };
    let response;
    try {
      response = await fetchImpl(mcpUrl, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30000),
        headers: {
          Authorization: `Bearer ${credential}`,
          Accept: 'application/json, text/event-stream',
          'Content-Type': 'application/json',
          'MCP-Protocol-Version': protocol,
          ...(session ? { 'Mcp-Session-Id': session } : {}),
        },
        body: JSON.stringify(message),
      });
    } catch {
      throw new Error('Could not reach Reporters.io MCP; no automatic retry was made');
    }
    if (!response.ok) throw new Error(`Reporters.io MCP HTTP ${response.status}; no automatic retry was made`);
    session = response.headers.get('mcp-session-id') || session;
    const text = await responseText(response);
    return notification ? undefined : parseRpc(text, id);
  }
  async function initialize() {
    if (!initialization) {
      initialization = (async () => {
        const result = await send('initialize', {
          protocolVersion: protocol, capabilities: {},
          clientInfo: { name: 'reporters-stdio-bridge', version: '1.0.0' },
        });
        protocol = result.protocolVersion || protocol;
        await send('notifications/initialized', undefined, true);
        return result;
      })();
    }
    return initialization;
  }
  return {
    initialize,
    async listTools(params = {}) {
      await initialize();
      const result = await send('tools/list', params);
      if (!Array.isArray(result.tools) || result.tools.some(tool => !expectedTools.includes(tool.name))) {
        throw new Error('Reporters.io MCP returned an unsupported tool catalog');
      }
      return result;
    },
    async callTool(params) {
      if (!params || !expectedTools.includes(params.name)) throw new Error('Unknown Reporters.io tool');
      await initialize();
      return send('tools/call', params);
    },
  };
}
