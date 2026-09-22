const MAX_MESSAGE = 2000;

function defaultUrl() {
  if (typeof window === 'undefined') return 'http://localhost:8787';
  const host = window.location.hostname;
  if (host.endsWith('.sandbox.novita.ai')) return `https://${host.replace(/^\d+-/, '8787-')}`;
  return 'http://localhost:8787';
}

const baseUrl = (import.meta.env?.VITE_ROBOT_AGENT_URL || defaultUrl()).replace(/\/$/, '');

export async function chatWithRobot(robot, message, signal) {
  const text = String(message ?? '').trim().slice(0, MAX_MESSAGE);
  if (!text) throw new Error('MESSAGE IS EMPTY');
  const token = import.meta.env?.VITE_ROBOT_AGENT_TOKEN || '';
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${baseUrl}/robots/${encodeURIComponent(robot.id)}/chat`, {
    method: 'POST',
    headers,
    signal,
    body: JSON.stringify({
      message: text,
      robot: { id: robot.id, name: robot.name, type: robot.type, building: robot.building },
    }),
  });
  let payload = null;
  try { payload = await response.json(); } catch { /* handled below */ }
  if (!response.ok) throw new Error(payload?.detail || `AGENT SERVICE ERROR (${response.status})`);
  return payload;
}
