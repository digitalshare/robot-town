import { BUILDINGS, SECTOR, CHARGING_PADS, GRID } from '../data/layout.js';
import { getAdapter } from './providers/index.js';
import { trimHistory } from './messages.js';
import { aiError, toRequestError } from './http.js';
import { parseSlashCommand, buildingToolContext, spaceToolContext } from './tools.js';
import { roomFor } from '../interior/spaceSpec.js';

export function townSystemPrompt({ tool = null } = {}) {
  const facilities = BUILDINGS.map((b) => `- ${b.name} (id ${b.id}, x ${b.x}, z ${b.z}, footprint ${b.footprint[0]} x ${b.footprint[1]})`).join(
    '\n'
  );
  const lines = [
    `You are the operations assistant for ${SECTOR.label}, an isometric 3D robot town rendered in the browser with three.js.`,
    'The user is looking at the town and can hover buildings to see their names.',
    'Facilities in this sector:',
    facilities,
    `${CHARGING_PADS.length} charging pads; road grid lines at x/z = ${GRID.linesX.join(', ')}.`,
    'Answer in 2-4 short sentences unless asked for detail.',
  ];
  if (tool) {
    lines.push(`You have one tool, ${tool}. Use it only through the schema below.`);
  } else {
    lines.push('You have no tools and cannot change the scene.');
    lines.push('If asked to modify the town, name the files a developer would edit (src/data/layout.js, src/buildings/*).');
  }
  return lines.join('\n');
}

export function createChatSession(store, { systemPrompt = null } = {}) {
  const history = [];
  const messageCbs = new Set();
  let controller = null;
  let streaming = false;
  let toolMode = null;

  function resolveSystem(mode) {
    if (typeof systemPrompt === 'function') return systemPrompt(mode);
    if (mode?.tool === 'building') {
      return `${townSystemPrompt({ tool: 'create_building' })}\n${buildingToolContext({ site: mode.site })}`;
    }
    if (mode?.tool === 'space') {
      return `${townSystemPrompt({ tool: 'create_space' })}\n${spaceToolContext({ record: mode.building, room: roomFor(mode.building) })}`;
    }
    return townSystemPrompt();
  }

  function abort() {
    if (controller) controller.abort();
  }

  async function send(text, { onStart, onDelta, onEnd, onError } = {}) {
    const provider = store.getActiveProvider();
    if (!provider) {
      onError?.(aiError('NO ACTIVE MODEL — ADD A PROVIDER IN SETTINGS AND SET IT ACTIVE', { kind: 'no-model' }));
      return;
    }
    if (!provider.model) {
      onError?.(aiError('PROVIDER NOT READY — TEST THE CONNECTION AND SELECT A MODEL', { kind: 'no-model' }));
      return;
    }

    const command = parseSlashCommand(text);
    const named = command?.name === 'building' || command?.name === 'space' ? command.name : null;
    const tool = named ?? toolMode?.tool ?? null;
    if (tool === 'space' && !toolMode?.building) {
      onError?.(aiError('NO BUILDING ATTACHED — CLICK A BUILDING AND CHOOSE DESIGN WITH AI', { kind: 'no-target' }));
      return;
    }
    const mode = tool
      ? { tool, site: toolMode?.site ?? null, building: toolMode?.building ?? null, command: Boolean(named) }
      : null;
    const userText = command ? command.args || text : text;

    abort();
    history.push({ role: 'user', content: userText });
    onStart?.();
    streaming = true;
    controller = new AbortController();

    let acc = '';
    const finish = (aborted) => {
      if (acc) history.push({ role: 'assistant', content: acc });
      streaming = false;
      controller = null;
      onEnd?.({ aborted, text: acc });
      if (!aborted) for (const fn of messageCbs) fn({ text: acc, mode });
    };

    try {
      const messages = [{ role: 'system', content: resolveSystem(mode) }, ...trimHistory(history)];
      await getAdapter(provider.protocol).streamChat(provider, provider.model, messages, {
        signal: controller.signal,
        onDelta: (t) => {
          acc += t;
          onDelta?.(t);
        },
      });
      finish(false);
    } catch (err) {
      if (err?.name === 'AbortError') {
        finish(true);
        return;
      }
      if (acc) history.push({ role: 'assistant', content: acc });
      streaming = false;
      controller = null;
      onError?.(toRequestError(err, provider));
    }
  }

  return {
    get history() {
      return history;
    },
    get streaming() {
      return streaming;
    },
    get toolMode() {
      return toolMode;
    },
    setToolMode(mode) {
      if (!mode || typeof mode !== 'object') {
        toolMode = null;
        return null;
      }
      toolMode =
        mode.tool === 'space'
          ? { tool: 'space', building: mode.building ?? null, site: null }
          : { tool: 'building', site: mode.site ?? null, building: null };
      return toolMode;
    },
    onMessage(fn) {
      messageCbs.add(fn);
      return () => messageCbs.delete(fn);
    },
    send,
    abort,
    clear() {
      abort();
      history.length = 0;
    },
  };
}
