/** Bounded MCP initialization and discovery; never calls data tools. */
export const expectedTools = ['get_account', 'search_reporters', 'get_reporter', 'list_reporter_articles', 'reveal_reporter_contacts', 'search_outlets', 'get_outlet', 'list_outlet_reporters', 'list_outlet_articles', 'reveal_outlet_contacts', 'get_search_filters'].sort();
export const mcpUrl = 'https://reporters.io/api/mcp';

export function parseRpc(text, expectedId) {
  let values;
  try { values = [JSON.parse(text)]; }
  catch {
    values = text.split(/\r?\n\r?\n/).flatMap(event => {
      const data = event.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
      if (!data) return [];
      try { return [JSON.parse(data)]; } catch { return []; }
    });
  }
  const result = values.find(value => value.id === expectedId);
  if (!result || result.error) throw new Error('MCP discovery returned an invalid or error response');
  return result.result;
}

export async function discover({ key = process.env.REPORTERS_API_KEY, fetchImpl = fetch } = {}) {
  if (!key?.trim() || /[\r\n]/.test(key)) throw new Error('Set REPORTERS_API_KEY');
  let protocol = '2025-03-26', session;
  async function send(message, id) {
    const response = await fetchImpl(mcpUrl, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000),
      headers: { Authorization: `Bearer ${key.trim()}`, Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json', 'MCP-Protocol-Version': protocol, ...(session ? { 'Mcp-Session-Id': session } : {}) },
      body: JSON.stringify(message),
    });
    if (!response.ok) throw new Error(`MCP discovery HTTP ${response.status}`);
    session = response.headers.get('mcp-session-id') || session;
    const text = await response.text();
    return id === undefined ? undefined : parseRpc(text, id);
  }
  const initialized = await send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: protocol, capabilities: {}, clientInfo: { name: 'reporters-public-discovery', version: '1.0.0' } } }, 1);
  protocol = initialized.protocolVersion || protocol;
  await send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  const result = await send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }, 2);
  return { initialized, tools: result.tools };
}
