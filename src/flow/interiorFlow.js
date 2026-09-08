import { findBuildingRecord } from '../town/records.js';

export function createInteriorFlow({ townStore, confirmBar, menu, onEnter }) {
  function handleBuildingClick(id) {
    if (!id) return;
    const record = findBuildingRecord(townStore.getState(), id);
    if (!record) return;
    if (townStore.getSpace(record.id)) {
      onEnter(record);
      return;
    }
    confirmBar.show(`NO INDOOR SPACE FOR ${record.name} — DESIGN ONE WITH AI?`, {
      yesLabel: 'DESIGN WITH AI',
      noLabel: 'ENTER SHELL',
      onYes: () => menu.openWithBuilding(record),
      onNo: () => onEnter(record),
    });
  }

  return { handleBuildingClick };
}
