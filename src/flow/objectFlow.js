import { extractObjectSpec } from '../ai/tools.js';
import { validateObjectPart, roomFor } from '../interior/spaceSpec.js';
import { typeFor } from '../interior/objectTypes.js';

export function createObjectFlow({ session, townStore, interiorView, onEnter, onSelect, reportError, reportInfo }) {
  session.onMessage(({ text, mode }) => {
    if (mode?.tool !== 'object') return;
    const record = mode.building;
    if (!record) {
      reportError?.('NO BUILDING ATTACHED TO THIS REQUEST');
      return;
    }
    const spec = extractObjectSpec(text);
    if (!spec) {
      reportError?.('NO JSON OBJECT SPEC IN REPLY');
      return;
    }
    const room = mode.room ?? roomFor(record);
    const check = validateObjectPart(spec, room, spec.rot ?? 0);
    if (!check.ok) {
      reportError?.(check.errors[0]);
      return;
    }
    const name = String(spec.name ?? '').trim().slice(0, 40).toUpperCase() || typeFor(check.value.kind)?.name || 'OBJECT';
    const added = townStore.addObject(record.id, { name, part: check.value, rot: check.rot });
    if (!added.ok) {
      reportError?.(added.errors[0]);
      return;
    }
    reportInfo?.(`OBJECT ADDED TO ${record.name}`);
    if (!interiorView.isActive() || interiorView.current()?.id !== record.id) onEnter?.(record);
    session.setToolMode({
      tool: 'object',
      building: record,
      room,
      object: mode.object,
      objects: townStore.getObjects(record.id),
    });
    onSelect?.(added.id);
  });
}
