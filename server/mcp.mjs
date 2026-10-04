// Minimal MCP server over stdio (newline-delimited JSON-RPC). Tools come from the shared function registry.
import { createInterface } from 'node:readline';
import { listFunctions, runFunction } from './run.js';

const PROTOCOL = '2024-11-05';

export async function handle(msg) {
  const { id, method, params } = msg;
  const ok = (result) => ({ jsonrpc: '2.0', id, result });
  const fail = (code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });
  switch (method) {
    case 'initialize':
      return ok({
        protocolVersion: PROTOCOL,
        capabilities: { tools: {} },
        serverInfo: { name: 'robot-town', version: '0.5.0' },
      });
    case 'ping':
      return ok({});
    case 'tools/list':
      return ok({ tools: listFunctions().map((f) => ({ name: f.tool, description: f.description, inputSchema: f.inputSchema })) });
    case 'tools/call': {
      const fn = listFunctions().find((f) => f.tool === params?.name);
      if (!fn) return fail(-32602, `UNKNOWN TOOL ${params?.name}`);
      const { status, ...result } = await runFunction(fn.id, params.arguments ?? {});
      return ok({ content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], isError: !result.ok });
    }
    default:
      return id === undefined ? null : fail(-32601, `METHOD NOT FOUND ${method}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const rl = createInterface({ input: process.stdin });
  rl.on('line', async (line) => {
    if (!line.trim()) return;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'PARSE ERROR' } }) + '\n');
    }
    const reply = await handle(msg);
    if (reply) process.stdout.write(JSON.stringify(reply) + '\n');
  });
}
