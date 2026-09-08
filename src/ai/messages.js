export function splitSystem(messages) {
  let system = null;
  const turns = [];
  for (const m of messages) {
    if (m.role === 'system') {
      system = system ? system + '\n' + m.content : m.content;
    } else {
      turns.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content });
    }
  }
  return { system, turns };
}

export function mergeConsecutive(turns) {
  const out = [];
  for (const t of turns) {
    const prev = out[out.length - 1];
    if (prev && prev.role === t.role) prev.content += '\n' + t.content;
    else out.push({ role: t.role, content: t.content });
  }
  return out;
}

export function trimHistory(turns, max = 24) {
  let out = turns.slice(-max);
  while (out.length && out[0].role !== 'user') out = out.slice(1);
  return out;
}
