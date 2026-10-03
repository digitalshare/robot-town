import { createServer } from 'node:http';
import { createApiServer } from '../server/http.js';
import { handle } from '../server/mcp.mjs';
import { FUNCTIONS } from '../src/ai/functions.js';
import { EXAMPLE_SPEC } from '../src/ai/tools.js';
import { EXAMPLE_SPACE, EXAMPLE_OBJECT } from '../src/ai/tools.js';

let failures = 0;
const check = (label, cond) => {
  console.log((cond ? 'PASS: ' : 'FAIL: ') + label);
  if (!cond) failures++;
};

const replies = { building: EXAMPLE_SPEC, space: EXAMPLE_SPACE, object: EXAMPLE_OBJECT };
let lastSystem = '';
const llm = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const msgs = JSON.parse(body).messages;
    lastSystem = msgs[0].content;
    const kind = lastSystem.includes('TOOL create_building') ? 'building' : lastSystem.includes('TOOL create_space') ? 'space' : 'object';
    const text = msg(kind);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: text } }] }));
  });
});
const msg = (kind) => '```json\n' + JSON.stringify(replies[kind]) + '\n```\nDone.';
await new Promise((r) => llm.listen(0, r));
const provider = { protocol: 'openai', baseUrl: `http://localhost:${llm.address().port}`, apiKey: 'k', model: 'm' };
const api = createApiServer({ token: 'secret', provider });
await new Promise((r) => api.listen(0, r));
const base = `http://localhost:${api.address().port}`;
const call = (path, body, auth = 'Bearer secret') =>
  fetch(base + path, { method: body ? 'POST' : 'GET', headers: { authorization: auth, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => ({ status: r.status, json: await r.json() }));

const building = { name: 'DATA CORE', footprint: [14, 12] };
let r = await call('/api/functions', null, 'nope');
check('rejects bad token', r.status === 401);
r = await call('/api/functions');
check('lists every registered function', r.json.functions.length === FUNCTIONS.length);
r = await call('/api/functions/building', { request: 'a lookout tower' });
check('building returns validated spec', r.status === 200 && r.json.spec.name === 'LOOKOUT TOWER');
r = await call('/api/functions/space', { request: 'server room', building });
check('space returns validated spec', r.status === 200 && r.json.spec.parts.length === 6 && lastSystem.includes('DATA CORE'));
r = await call('/api/functions/object', { request: 'coolant tank', building });
check('object returns validated spec', r.status === 200 && r.json.spec.part.kind === 'tank');
r = await call('/api/functions/space', { request: 'x' });
check('missing building is 400', r.status === 400);
r = await call('/api/functions/nope', { request: 'x' });
check('unknown function is 404', r.status === 404);

const list = await handle({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
check('MCP lists one tool per function', list.result.tools.map((t) => t.name).join() === FUNCTIONS.map((f) => f.tool).join());

api.close();
llm.close();
process.exit(failures ? 1 : 0);
