import { extractSpec } from '../ai/tools.js';

export function createSpaceFlow({ session, townStore, interiorView, onEnter, reportError, reportInfo }) {
  session.onMessage(({ text, mode }) => {
    if (mode?.tool !== 'space') return;
    const record = mode.building;
    if (!record) {
      reportError?.('NO BUILDING ATTACHED TO THIS REQUEST');
      return;
    }
    const raw = extractSpec(text);
    if (!raw) {
      reportError?.('NO JSON SPACE SPEC IN REPLY');
      return;
    }
    const added = townStore.addSpace(record.id, raw);
    if (!added.ok) {
      reportError?.(added.errors[0]);
      return;
    }
    reportInfo?.(`SPACE ADDED TO ${record.name}`);
    if (interiorView.isActive() && interiorView.current()?.id === record.id) interiorView.rebuild();
    else onEnter?.(record);
  });
}
