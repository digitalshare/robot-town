import { getAdapter } from './providers/index.js';
import { trimHistory } from './messages.js';
import { aiError, toRequestError } from './http.js';
import { parseSlashCommand, townSystemPrompt } from './tools.js';
import { functionFor } from './functions.js';
import { roomFor } from '../interior/spaceSpec.js';

export function createChatSession(store, { systemPrompt = null, townStore = null } = {}) {
  const history = [];
  const messageCbs = new Set();
  let controller = null;
  let streaming = false;
  let toolMode = null;

  function promptArgs(mode) {
    const record = mode.building ?? null;
    const room = mode.room ?? (record ? roomFor(record) : null);
    if (mode.tool === 'building') return { site: mode.site ?? null };
    if (mode.tool === 'space') return { record, room, space: record ? townStore?.getSpace?.(record.id) ?? null : null };
    return { record, room, source: mode.object ?? null, objects: mode.objects ?? [] };
  }

  function resolveSystem(mode) {
    if (typeof systemPrompt === 'function') return systemPrompt(mode);
    const fn = functionFor(mode?.tool);
    if (!fn) return townSystemPrompt();
    const { base, context } = fn.parts(promptArgs(mode));
    return [store.getFunctionPrompt?.(fn.id) ?? base, context].filter(Boolean).join('\n');
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
    const named = ['building', 'space', 'object'].includes(command?.name) ? command.name : null;
    const tool = named ?? toolMode?.tool ?? null;
    if (tool === 'space' && !toolMode?.building) {
      onError?.(aiError('NO BUILDING ATTACHED — CLICK A BUILDING AND CHOOSE DESIGN WITH AI', { kind: 'no-target' }));
      return;
    }
    if (tool === 'object' && (!toolMode?.building || !toolMode?.room)) {
      onError?.(aiError('NO ROOM ATTACHED — ENTER A BUILDING FIRST', { kind: 'no-target' }));
      return;
    }
    const mode = tool
      ? {
          tool,
          site: toolMode?.site ?? null,
          building: toolMode?.building ?? null,
          room: toolMode?.room ?? null,
          object: toolMode?.object ?? null,
          objects: toolMode?.objects ?? [],
          command: Boolean(named),
        }
      : null;
    const userText = command ? command.args || text : text;

    abort();
    history.push({ role: 'user', content: userText });
    const messages = [{ role: 'system', content: resolveSystem(mode) }, ...trimHistory(history)];
    onStart?.();
    streaming = true;
    controller = new AbortController();

    let acc = '';
    const record = (status, message) => {
      if (!mode?.tool) return;
      store.recordCall?.({
        fn: mode.tool,
        system: messages[0].content,
        messages: messages.slice(1),
        reply: acc,
        status,
        message,
      });
    };
    const finish = (aborted) => {
      if (acc) history.push({ role: 'assistant', content: acc });
      streaming = false;
      controller = null;
      record(aborted ? 'aborted' : 'ok', '');
      onEnd?.({ aborted, text: acc });
      if (!aborted) for (const fn of messageCbs) fn({ text: acc, mode });
    };

    try {
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
      const failure = toRequestError(err, provider);
      record('error', failure.message);
      onError?.(failure);
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
      switch (mode.tool) {
        case 'space':
          toolMode = { tool: 'space', building: mode.building ?? null, site: null, object: null };
          break;
        case 'object':
          toolMode = {
            tool: 'object',
            building: mode.building ?? null,
            room: mode.room ?? (mode.building ? roomFor(mode.building) : null),
            object: mode.object ?? null,
            objects: Array.isArray(mode.objects) ? mode.objects : [],
            site: null,
          };
          break;
        default:
          toolMode = { tool: 'building', site: mode.site ?? null, building: null, object: null };
      }
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
