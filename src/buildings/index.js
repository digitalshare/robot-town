import { buildHousing } from './housing.js';
import { buildLabs } from './labs.js';
import { buildRecycling } from './recycling.js';
import { buildDroneport } from './droneport.js';
import { buildDatacore } from './datacore.js';
import { buildSolararray } from './solararray.js';
import { buildPowerstorage } from './powerstorage.js';
import { buildManufacturing } from './manufacturing.js';
import { buildWarehouse } from './warehouse.js';
import { buildMaintenance } from './maintenance.js';
import { buildAistrategy } from './aistrategy.js';
import { buildGardens } from './gardens.js';

export const BUILDERS = {
  housing: buildHousing,
  labs: buildLabs,
  recycling: buildRecycling,
  droneport: buildDroneport,
  datacore: buildDatacore,
  solararray: buildSolararray,
  powerstorage: buildPowerstorage,
  manufacturing: buildManufacturing,
  warehouse: buildWarehouse,
  maintenance: buildMaintenance,
  aistrategy: buildAistrategy,
  gardens: buildGardens,
};
