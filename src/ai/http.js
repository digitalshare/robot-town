export function aiError(message, { kind = 'unknown', status = 0, cause = null } = {}) {
  const err = new Error(message);
  err.kind = kind;
  err.status = status;
  if (cause) err.cause = cause;
  return err;
}

function scrub(text, provider) {
  const key = provider?.apiKey;
  if (!key || !text) return text;
  return String(text).split(key).join('***');
}

function statusMessage(status, base) {
  if (status === 401 || status === 403) return 'INVALID API KEY OR NOT AUTHORIZED (HTTP ' + status + ')';
  if (status === 404) return 'ENDPOINT OR MODEL NOT FOUND (HTTP 404) — CHECK BASE URL';
  if (status === 429) return 'RATE LIMITED / QUOTA EXCEEDED (HTTP 429)';
  if (status >= 500) return 'PROVIDER ERROR (HTTP ' + status + ')';
  return 'REQUEST FAILED (HTTP ' + status + ') AGAINST ' + base;
}

async function bodyMessage(response, provider) {
  let detail = '';
  try {
    const text = await response.text();
    try {
      const json = JSON.parse(text);
      detail = json?.error?.message ?? json?.message ?? '';
    } catch {
      detail = text;
    }
    detail = scrub(String(detail).slice(0, 200), provider);
  } catch {
    detail = '';
  }
  return detail;
}

export async function assertOk(response, provider) {
  if (response.ok) return response;
  const base = provider?.baseUrl || provider?.protocol || 'provider';
  const detail = await bodyMessage(response, provider);
  const message = statusMessage(response.status, base) + (detail ? ' — ' + detail : '');
  throw aiError(message, { kind: response.status === 401 || response.status === 403 ? 'auth' : 'http', status: response.status });
}

export function toRequestError(err, provider) {
  if (err?.name === 'AbortError') return err;
  if (err?.kind) return err;
  const base = provider?.baseUrl || provider?.protocol || 'provider';
  if (err instanceof TypeError) {
    return aiError('NETWORK OR CORS ERROR — COULD NOT REACH ' + base + '. CHECK THE BASE URL AND THE PROVIDER’S BROWSER CORS POLICY.', {
      kind: 'network',
      cause: err,
    });
  }
  return aiError(scrub(err?.message || 'UNKNOWN REQUEST ERROR', provider), { kind: 'unknown', cause: err });
}

export async function readSse(response, onEvent) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let data = [];
  let sawEvent = false;

  const flushLine = (line) => {
    if (!line) {
      if (data.length) {
        const payload = data.join('\n');
        data = [];
        if (payload === '[DONE]') return true;
        onEvent(payload);
        sawEvent = true;
      }
      return false;
    }
    if (line.startsWith(':')) return false;
    if (line.startsWith('data:')) data.push(line.slice(5).trim());
    return false;
  };

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).replace(/\r$/, '');
        buf = buf.slice(i + 1);
        if (flushLine(line)) return { sawEvent: true };
      }
    }
    if (buf.trim()) {
      if (flushLine(buf.replace(/\r$/, ''))) return { sawEvent: true };
    }
    if (data.length) {
      const payload = data.join('\n');
      if (payload !== '[DONE]') onEvent(payload);
      sawEvent = true;
    }
    return { sawEvent };
  } finally {
    reader.cancel().catch(() => {});
  }
}
