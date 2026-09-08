import { extractSpec } from '../ai/tools.js';
import { validateSpec } from '../buildings/spec.js';

export function createBuildingFlow({ session, manager, confirmBar, reportError, reportInfo }) {
  function cancel() {
    confirmBar.hide();
    manager.clearReview();
  }

  function confirm() {
    const name = manager.getReview()?.name ?? 'BUILDING';
    confirmBar.hide();
    const result = manager.commitReview();
    if (!result.ok) {
      reportError?.(result.errors?.[0] ?? 'COULD NOT ADD THE BUILDING');
      return;
    }
    session.setToolMode(null);
    reportInfo?.(`ADDED ${name} TO THE TOWN`);
  }

  function discard() {
    confirmBar.hide();
    manager.clearReview();
    reportInfo?.('BUILDING DISCARDED');
  }

  session.onMessage(({ text, mode }) => {
    if (mode?.tool !== 'building') return;
    const raw = extractSpec(text);
    if (!raw) {
      reportError?.('NO JSON BUILDING SPEC IN REPLY');
      return;
    }
    const check = validateSpec(raw);
    if (!check.ok) {
      reportError?.(check.errors[0]);
      return;
    }
    const cell = mode.site ?? manager.freeCells()[0] ?? null;
    if (!cell) {
      reportError?.('NO FREE BUILD SITE — EXPAND THE MAP FIRST');
      return;
    }
    const placed = manager.setReview({ spec: check.value, cell });
    if (!placed.ok) {
      reportError?.(placed.errors[0]);
      return;
    }
    confirmBar.show(`REVIEW: ${placed.name} — ADD TO TOWN?`, { onYes: confirm, onNo: discard });
  });

  return { cancel };
}
