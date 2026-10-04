import { createServer } from 'node:http';
import { listFunctions, runFunction, providerFromEnv } from './run.js';

const MAX_BODY = 1_000_000;

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('BODY TOO LARGE'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(new Error('BODY MUST BE JSON'));
      }
    });
    req.on('error', reject);
  });
}

export function createApiServer({ token = process.env.ROBOT_TOWN_API_TOKEN, provider = providerFromEnv() } = {}) {
  return createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'content-type, authorization',
        'access-control-allow-methods': 'GET, POST, OPTIONS',
      });
      return res.end();
    }
    const path = new URL(req.url, 'http://x').pathname.replace(/\/+$/, '');
    if (path === '/health') return send(res, 200, { ok: true });
    if (token && req.headers.authorization !== `Bearer ${token}`) {
      return send(res, 401, { ok: false, errors: ['UNAUTHORIZED'] });
    }
    if (req.method === 'GET' && path === '/api/functions') return send(res, 200, { functions: listFunctions() });
    const match = /^\/api\/functions\/([a-z_-]+)$/.exec(path);
    if (match && req.method === 'POST') {
      let input;
      try {
        input = await readJson(req);
      } catch (err) {
        return send(res, 400, { ok: false, errors: [err.message] });
      }
      const result = await runFunction(match[1], input, { provider });
      const { status, ...body } = result;
      return send(res, status, body);
    }
    return send(res, 404, { ok: false, errors: ['NOT FOUND'] });
  });
}
