import { functionFor, FUNCTIONS, recordFrom } from '../src/ai/functions.js';
import { getAdapter } from '../src/ai/providers/index.js';
import { toRequestError } from '../src/ai/http.js';

export function providerFromEnv(env = process.env) {
  return {
    protocol: env.ROBOT_TOWN_AI_PROTOCOL || 'openai',
    baseUrl: env.ROBOT_TOWN_AI_BASE_URL || '',
    apiKey: env.ROBOT_TOWN_AI_API_KEY || '',
    model: env.ROBOT_TOWN_AI_MODEL || '',
  };
}

export function listFunctions() {
  return FUNCTIONS.map((f) => ({
    id: f.id,
    tool: f.tool,
    description: f.description,
    inputSchema: { type: 'object', ...f.input },
  }));
}

// Runs one command function end to end: prompt -> model -> extracted spec -> validated spec.
export async function runFunction(id, input, { provider = providerFromEnv(), signal } = {}) {
  const fn = functionFor(id);
  if (!fn) return { ok: false, status: 404, errors: [`UNKNOWN FUNCTION ${id}`] };
  const request = typeof input?.request === 'string' ? input.request.trim() : '';
  if (!request) return { ok: false, status: 400, errors: ['request IS REQUIRED'] };
  if (!provider.model || !provider.apiKey) {
    return { ok: false, status: 503, errors: ['NO MODEL CONFIGURED — SET ROBOT_TOWN_AI_API_KEY AND ROBOT_TOWN_AI_MODEL'] };
  }

  let record = null;
  if (input.building !== undefined || fn.input.required.includes('building')) {
    const ref = recordFrom(input);
    if (ref.error) return { ok: false, status: 400, errors: [ref.error] };
    record = ref.record;
  }

  const { base, context } = fn.parts(fn.args(input, record));
  const messages = [
    { role: 'system', content: [base, context].filter(Boolean).join('\n') },
    { role: 'user', content: request },
  ];
  let reply = '';
  try {
    await getAdapter(provider.protocol).streamChat(provider, provider.model, messages, {
      signal,
      onDelta: (t) => (reply += t),
    });
  } catch (err) {
    const failure = toRequestError(err, provider);
    return { ok: false, status: 502, errors: [failure.message] };
  }

  const raw = fn.extract(reply);
  if (!raw) return { ok: false, status: 422, errors: ['NO JSON SPEC IN MODEL REPLY'], reply };
  const check = fn.validate(raw, record);
  if (!check.ok) return { ok: false, status: 422, errors: check.errors, reply };
  return { ok: true, status: 200, function: fn.id, spec: check.value, reply };
}

