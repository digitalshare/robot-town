// Shared obstacle avoidance for every moving robot, indoors and out.
// Plain {x,z} math with no three.js import, so either scene can drive one world.

const LOOKAHEAD = 0.55; // seconds of travel the feeler probes ahead
const REPULSION = 0.5; // push-out strength as a fraction of speed
const REPULSION_REACH = 0.6; // how far an obstacle starts shoving
const SEP_MARGIN = 0.35; // personal space beyond the body radius
const LATERAL_GAIN = 0.8; // sideways steer used to break head-on deadlocks
const CORNER_EXTRA = 2.5; // reach floor for corner waypoints on thin boxes
const CORNER_CLEARANCE = 0.2; // how far past the body radius a corner sits
const MIN_CORNER_DIST = 0.6; // closer than this a corner gives no usable heading
const CORNER_TIE = 0.6; // penalty applied to corners on the unfavoured side
const STUCK_TIME = 0.7; // window over which progress is measured
const STUCK_DIST = 0.06; // less than this per window counts as trapped
const CELL = 4; // broad-phase cell edge, ~2x the largest interaction range
const MAX_STEP = 0.05;
const PEAK_SPEED = 1.35; // avoidance may exceed cruise speed by this much
const RELAX_PASSES = 8; // capped; relax exits on the first settled pass
const SCAN_DIVISIONS = 48;
const EPS = 1e-6;

export function inflateRects(rects, pad = 0.8) {
  const out = [];
  for (const o of Array.isArray(rects) ? rects : []) {
    if (!o || !Number.isFinite(o.x) || !Number.isFinite(o.z)) continue;
    const hw = Math.max(0, Number(o.w) || 0) / 2 + pad;
    const hd = Math.max(0, Number(o.d) || 0) / 2 + pad;
    out.push({ minX: o.x - hw, maxX: o.x + hw, minZ: o.z - hd, maxZ: o.z + hd });
  }
  return out;
}

function pushOf(x, z, r, b, out) {
  const px = Math.min(Math.max(x, b.minX), b.maxX);
  const pz = Math.min(Math.max(z, b.minZ), b.maxZ);
  const dx = x - px;
  const dz = z - pz;
  const d2 = dx * dx + dz * dz;
  if (d2 > r * r) return null;
  if (d2 > EPS * EPS) {
    const d = Math.sqrt(d2);
    out.nx = dx / d;
    out.nz = dz / d;
    out.depth = r - d;
    return out;
  }
  // Centre is inside the box: escape along whichever face is closest.
  const left = x - b.minX;
  const right = b.maxX - x;
  const back = z - b.minZ;
  const front = b.maxZ - z;
  const shallowest = Math.min(left, right, back, front);
  out.nx = shallowest === left ? -1 : shallowest === right ? 1 : 0;
  out.nz = out.nx ? 0 : shallowest === back ? -1 : 1;
  out.depth = shallowest + r;
  return out;
}

const SCRATCH_PUSH = { nx: 0, nz: 0, depth: 0 };

export function circleBox(cx, cz, r, b) {
  const hit = pushOf(cx, cz, r, b, SCRATCH_PUSH);
  return hit ? { nx: hit.nx, nz: hit.nz, depth: hit.depth } : null;
}

function overlapsBox(x, z, r, b) {
  const dx = x - Math.min(Math.max(x, b.minX), b.maxX);
  const dz = z - Math.min(Math.max(z, b.minZ), b.maxZ);
  return dx * dx + dz * dz <= r * r;
}

function boxDistance(x, z, b) {
  const dx = Math.max(b.minX - x, 0, x - b.maxX);
  const dz = Math.max(b.minZ - z, 0, z - b.maxZ);
  return Math.hypot(dx, dz);
}

// Numeric keys keep the hot path free of string allocation. Valid for cell
// indices in [-2048, 2047], which covers the whole town at any cell size used.
const KEY_OFFSET = 1 << 11;
const cellKey = (cx, cz) => (cx + KEY_OFFSET) * 4096 + (cz + KEY_OFFSET);

export function createGrid(cellSize = CELL) {
  const size = Math.max(0.5, cellSize);
  const cells = new Map();
  const seen = new Set();
  let outRef = [];

  function addRange(item, x0, x1, z0, z1) {
    const cx0 = Math.floor(x0 / size);
    const cx1 = Math.floor(x1 / size);
    const cz0 = Math.floor(z0 / size);
    const cz1 = Math.floor(z1 / size);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        const k = cellKey(cx, cz);
        const bucket = cells.get(k);
        if (bucket) bucket.push(item);
        else cells.set(k, [item]);
      }
    }
  }

  function scan(x0, x1, z0, z1, out) {
    outRef = out || [];
    outRef.length = 0;
    seen.clear();
    const cx0 = Math.floor(x0 / size);
    const cx1 = Math.floor(x1 / size);
    const cz0 = Math.floor(z0 / size);
    const cz1 = Math.floor(z1 / size);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        const bucket = cells.get(cellKey(cx, cz));
        if (!bucket) continue;
        for (const item of bucket) {
          if (seen.has(item)) continue;
          seen.add(item);
          outRef.push(item);
        }
      }
    }
    return outRef;
  }

  return {
    clear() {
      cells.clear();
    },
    insert(item, x, z, r = 0) {
      addRange(item, x - r, x + r, z - r, z + r);
    },
    insertRect(item, minX, maxX, minZ, maxZ) {
      addRange(item, minX, maxX, minZ, maxZ);
    },
    query(x, z, r, out) {
      return scan(x - r, x + r, z - r, z + r, out);
    },
    queryRect(minX, maxX, minZ, maxZ, out) {
      return scan(minX, maxX, minZ, maxZ, out);
    },
  };
}

export function createObstacles(rects = [], { pad = 0, cellSize = CELL, extraFree = null } = {}) {
  let boxes = [];
  const grid = createGrid(cellSize);
  const scratch = [];

  function reindex(list) {
    boxes = list;
    grid.clear();
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      grid.insertRect(i, b.minX, b.maxX, b.minZ, b.maxZ);
    }
  }

  function free(x, z, r) {
    grid.queryRect(x - r, x + r, z - r, z + r, scratch);
    for (const i of scratch) if (overlapsBox(x, z, r, boxes[i])) return false;
    return true;
  }

  function isFree(x, z, r) {
    return free(x, z, r) && (!extraFree || extraFree(x, z, r));
  }

  reindex(inflateRects(rects, pad));

  return {
    set(nextRects, nextPad = 0) {
      reindex(inflateRects(nextRects, nextPad));
    },
    list() {
      return boxes;
    },
    count() {
      return boxes.length;
    },
    isFree,
    pushOut(x, z, r) {
      let px = x;
      let pz = z;
      let hit = false;
      for (let pass = 0; pass < 3; pass++) {
        let depth = 0;
        let nx = 0;
        let nz = 0;
        grid.queryRect(px - r, px + r, pz - r, pz + r, scratch);
        for (const i of scratch) {
          const p = pushOf(px, pz, r, boxes[i], SCRATCH_PUSH);
          if (p && p.depth > depth) {
            depth = p.depth;
            nx = p.nx;
            nz = p.nz;
          }
        }
        if (!depth) break;
        hit = true;
        px += nx * (depth + EPS);
        pz += nz * (depth + EPS);
      }
      return { x: px, z: pz, hit };
    },
    nearest(x, z, r) {
      let best = null;
      let bestDist = Infinity;
      grid.queryRect(x - r, x + r, z - r, z + r, scratch);
      for (const i of scratch) {
        const d = boxDistance(x, z, boxes[i]);
        if (d < bestDist) {
          bestDist = d;
          best = boxes[i];
        }
      }
      return best;
    },
    // Free corners of one box expanded past the agent radius, scored by total
    // detour cost. This is what lets a bot head for a box and still get round
    // it instead of stalling in the potential-field minimum behind it.
    corners(b, r, ax, az, goalX, goalZ, handed = 1) {
      if (!b) return null;
      const off = r + CORNER_CLEARANCE;
      const minX = b.minX - off;
      const maxX = b.maxX + off;
      const minZ = b.minZ - off;
      const maxZ = b.maxZ + off;
      // Corners of the box being bumped are always reachable targets; the floor
      // only matters for thin boxes whose corners hug their own footprint.
      const reach = Math.max(CORNER_EXTRA, Math.hypot(maxX - minX, maxZ - minZ) / 2);
      const pts = [
        [minX, minZ],
        [maxX, minZ],
        [minX, maxZ],
        [maxX, maxZ],
      ];
      let best = null;
      let bestScore = Infinity;
      for (const [cx, cz] of pts) {
        const near = Math.hypot(cx - ax, cz - az);
        // A corner we are already standing on scores best on detour cost but
        // gives no heading at all, which parks the agent on the box corner.
        if (near < MIN_CORNER_DIST || near > reach) continue;
        if (!isFree(cx, cz, r * 0.25)) continue;
        const cross = (goalX - ax) * (cz - az) - (goalZ - az) * (cx - ax);
        const side = cross >= 0 ? 1 : -1;
        const score =
          Math.hypot(cx - ax, cz - az) + Math.hypot(goalX - cx, goalZ - cz) + (side === handed ? 0 : CORNER_TIE);
        if (score < bestScore) {
          bestScore = score;
          best = { x: cx, z: cz };
        }
      }
      return best;
    },
  };
}

export function createAvoidance(opts = {}) {
  const rng = opts.rng || Math.random;
  const speed = Number.isFinite(opts.speed) ? opts.speed : 2.2;
  const radius = Number.isFinite(opts.radius) ? opts.radius : 0.45;
  const sepMargin = Number.isFinite(opts.sepMargin) ? opts.sepMargin : SEP_MARGIN;
  const lookahead = Number.isFinite(opts.lookahead) ? opts.lookahead : LOOKAHEAD;
  const arrive = Number.isFinite(opts.arrive) ? opts.arrive : 0.18;
  const stuckTime = Number.isFinite(opts.stuckTime) ? opts.stuckTime : STUCK_TIME;
  const stuckDist = Number.isFinite(opts.stuckDist) ? opts.stuckDist : STUCK_DIST;
  const cellSize = Number.isFinite(opts.cellSize) ? opts.cellSize : CELL;
  const minTargetDist = Number.isFinite(opts.minTargetDist) ? opts.minTargetDist : 2;

  let bounds = opts.bounds || null;
  const agents = [];
  const agentGrid = createGrid(cellSize);
  const neighbours = [];

  function inBounds(x, z, r) {
    if (!bounds) return true;
    return x - r >= bounds.minX && x + r <= bounds.maxX && z - r >= bounds.minZ && z + r <= bounds.maxZ;
  }

  const obstacles = createObstacles(opts.obstacles || [], {
    pad: opts.pad || 0,
    cellSize,
    extraFree: (x, z, r) => inBounds(x, z, r),
  });

  // Sampling area, inset so a drawn target is never flush against a wall.
  function area() {
    if (bounds) {
      const inset = radius + 0.05;
      return {
        minX: bounds.minX + inset,
        maxX: bounds.maxX - inset,
        minZ: bounds.minZ + inset,
        maxZ: bounds.maxZ - inset,
      };
    }
    const list = obstacles.list();
    if (!list.length) return { minX: -4, maxX: 4, minZ: -4, maxZ: 4 };
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const b of list) {
      minX = Math.min(minX, b.minX);
      maxX = Math.max(maxX, b.maxX);
      minZ = Math.min(minZ, b.minZ);
      maxZ = Math.max(maxZ, b.maxZ);
    }
    return { minX: minX - 2, maxX: maxX + 2, minZ: minZ - 2, maxZ: maxZ + 2 };
  }

  function isFree(x, z, r = radius) {
    return obstacles.isFree(x, z, r);
  }

  function clampToBounds(a) {
    if (!bounds) return;
    const loX = bounds.minX + a.r;
    const hiX = bounds.maxX - a.r;
    const loZ = bounds.minZ + a.r;
    const hiZ = bounds.maxZ - a.r;
    a.x = loX > hiX ? (bounds.minX + bounds.maxX) / 2 : Math.min(Math.max(a.x, loX), hiX);
    a.z = loZ > hiZ ? (bounds.minZ + bounds.maxZ) / 2 : Math.min(Math.max(a.z, loZ), hiZ);
  }

  function sampleTarget(from = { x: 0, z: 0 }, { minDist = minTargetDist, tries = 32, r = radius } = {}) {
    const box = area();
    const spanX = Math.max(0, box.maxX - box.minX);
    const spanZ = Math.max(0, box.maxZ - box.minZ);
    if (spanX <= 0 || spanZ <= 0) return { x: box.minX, z: box.minZ };
    for (let i = 0; i < tries; i++) {
      const x = box.minX + rng() * spanX;
      const z = box.minZ + rng() * spanZ;
      if (!isFree(x, z, r)) continue;
      if (minDist && Math.hypot(x - from.x, z - from.z) < minDist) continue;
      return { x, z };
    }
    // Rejection failed (cluttered room, or a tiny free pocket): walk a coarse
    // grid and take the free cell furthest from the caller. Unlike a blind
    // centre fallback this can never hand back a point inside furniture.
    const step = Math.max(0.5, Math.max(spanX, spanZ) / SCAN_DIVISIONS);
    let best = null;
    let bestDist = -1;
    let anyBest = null;
    let anyDist = -1;
    for (let x = box.minX; x <= box.maxX + EPS; x += step) {
      for (let z = box.minZ; z <= box.maxZ + EPS; z += step) {
        if (!isFree(x, z, r)) continue;
        const d = Math.hypot(x - from.x, z - from.z);
        if (d > anyDist) {
          anyDist = d;
          anyBest = { x, z };
        }
        if (minDist && d < minDist) continue;
        if (d > bestDist) {
          bestDist = d;
          best = { x, z };
        }
      }
    }
    if (best) return best;
    if (anyBest) return anyBest;
    const cx = (box.minX + box.maxX) / 2;
    const cz = (box.minZ + box.maxZ) / 2;
    return { x: cx, z: cz };
  }

  function addAgent(spec = {}) {
    const r = Number.isFinite(spec.r) ? spec.r : radius;
    const wander = spec.wander !== false;
    const home = { x: Number(spec.home?.x) || 0, z: Number(spec.home?.z) || 0 };
    const a = {
      id: spec.id,
      index: agents.length,
      r,
      wander,
      home,
      // Idle bots hold their stored home exactly; only wanderers get unstuck.
      x: wander && Number.isFinite(Number(spec.x)) ? Number(spec.x) : home.x,
      z: wander && Number.isFinite(Number(spec.z)) ? Number(spec.z) : home.z,
      vx: 0,
      vz: 0,
      moving: false,
      justArrived: false,
      wait: 0,
      stuckFor: 0,
      lastX: 0,
      lastZ: 0,
      handed: rng() < 0.5 ? 1 : -1,
      target: { x: home.x, z: home.z },
    };
    if (wander) {
      if (!isFree(a.x, a.z, r)) {
        const spot = sampleTarget({ x: a.x, z: a.z }, { minDist: 0, tries: 48, r });
        a.x = spot.x;
        a.z = spot.z;
      }
      a.target = spec.target ? { x: spec.target.x, z: spec.target.z } : sampleTarget(a, { minDist: 0, r });
    }
    a.lastX = a.x;
    a.lastZ = a.z;
    agents.push(a);
    return a;
  }

  function removeAgent(id) {
    const at = agents.findIndex((a) => a.id === id);
    if (at < 0) return false;
    agents.splice(at, 1);
    for (let i = at; i < agents.length; i++) agents[i].index = i;
    return true;
  }

  function find(id) {
    return agents.find((a) => a.id === id) ?? null;
  }

  function setObstacles(rects, pad = 0) {
    obstacles.set(rects, pad);
    for (const a of agents) {
      if (!a.wander) continue;
      if (!isFree(a.x, a.z, a.r)) {
        const spot = sampleTarget({ x: a.x, z: a.z }, { minDist: 0, tries: 48, r: a.r });
        a.x = spot.x;
        a.z = spot.z;
      }
      if (!isFree(a.target.x, a.target.z, a.r * 0.5)) a.target = sampleTarget(a, { minDist: 0, r: a.r });
    }
  }

  function blocked(a, x, z) {
    if (!isFree(x, z, a.r)) return true;
    agentGrid.query(x, z, a.r + sepMargin, neighbours);
    for (const b of neighbours) {
      if (b === a) continue;
      const dx = x - b.x;
      const dz = z - b.z;
      const reach = a.r + b.r;
      if (dx * dx + dz * dz < reach * reach) return true;
    }
    return false;
  }

  // Checking only the destination lets a fast frame jump from one side of a
  // thin obstacle to the other. Sample the swept path so the body stops before
  // contact and can use the slide fallback below instead.
  function canTraverse(a, dx, dz) {
    const distance = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(distance / Math.max(0.08, a.r * 0.35)));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (blocked(a, a.x + dx * t, a.z + dz * t)) return false;
    }
    return true;
  }

  // Last-resort guarantee: walk each agent out of whatever it ended the frame
  // inside. Gauss-Seidel — only the agent being visited moves — converges where
  // a symmetric split oscillates, because every push reads current positions and
  // is followed by that same agent's own clamp.
  function relax() {
    for (let pass = 0; pass < RELAX_PASSES; pass++) {
      agentGrid.clear();
      for (const a of agents) agentGrid.insert(a, a.x, a.z, a.r * 1.5);
      let settled = true;
      for (const a of agents) {
        if (!a.wander) continue;
        let changed = false;
        agentGrid.query(a.x, a.z, a.r * 1.5, neighbours);
        for (const b of neighbours) {
          if (b === a) continue;
          let dx = a.x - b.x;
          let dz = a.z - b.z;
          let d = Math.hypot(dx, dz);
          const min = a.r + b.r;
          if (d >= min) continue;
          if (d < EPS) {
            dx = a.index < b.index ? -1 : 1;
            dz = 0;
            d = 1;
          }
          // An idle neighbour never yields, so the wanderer takes the whole push.
          const push = (min - d) * (b.wander ? 0.5 : 1) + EPS;
          a.x += (dx / d) * push;
          a.z += (dz / d) * push;
          changed = true;
        }
        const out = obstacles.pushOut(a.x, a.z, a.r);
        if (out.hit) {
          a.x = out.x;
          a.z = out.z;
          changed = true;
        }
        const beforeX = a.x;
        const beforeZ = a.z;
        clampToBounds(a);
        if (a.x !== beforeX || a.z !== beforeZ) changed = true;
        if (changed) settled = false;
      }
      if (settled) return;
    }
  }

  function step(dt, stepOpts = {}) {
    const h = Math.min(Math.max(Number(dt) || 0, 0), MAX_STEP);
    if (!h || !agents.length) return;
    const [waitMin, waitMax] = Array.isArray(stepOpts.waitRange) ? stepOpts.waitRange : [0.4, 1.2];
    const waitSpan = Math.max(0, waitMax - waitMin);

    agentGrid.clear();
    for (const a of agents) agentGrid.insert(a, a.x, a.z, a.r + sepMargin);

    for (const a of agents) {
      a.moving = false;
      a.justArrived = false;
      if (!a.wander) {
        a.x = a.home.x;
        a.z = a.home.z;
        a.vx = 0;
        a.vz = 0;
        continue;
      }
      if (a.wait > 0) {
        a.wait -= h;
        a.vx = 0;
        a.vz = 0;
        if (a.wait > 0) continue;
      }

      const prevX = a.x;
      const prevZ = a.z;

      let dx = a.target.x - a.x;
      let dz = a.target.z - a.z;
      const dist = Math.hypot(dx, dz);
      if (dist < arrive) {
        a.justArrived = true;
        a.wait = waitMin + rng() * waitSpan;
        a.vx = 0;
        a.vz = 0;
        a.stuckFor = 0;
        a.lastX = a.x;
        a.lastZ = a.z;
        a.target = sampleTarget(a, { r: a.r });
        continue;
      }
      const ux = dx / dist;
      const uz = dz / dist;
      let vx = ux * speed;
      let vz = uz * speed;

      // Obstacle bypass: probe ahead, aim for a free corner of whatever is in
      // the way, and lean off it. Corner aiming alone clips edges; repulsion
      // alone deadlocks when the goal sits straight behind a box.
      const probeX = a.x + ux * speed * lookahead;
      const probeZ = a.z + uz * speed * lookahead;
      if (!isFree(probeX, probeZ, a.r)) {
        const box = obstacles.nearest(probeX, probeZ, a.r);
        const corner = obstacles.corners(box, a.r, a.x, a.z, a.target.x, a.target.z, a.handed);
        if (corner) {
          const cdx = corner.x - a.x;
          const cdz = corner.z - a.z;
          const cd = Math.hypot(cdx, cdz) || 1;
          vx = (cdx / cd) * speed;
          vz = (cdz / cd) * speed;
        }
        const infl = obstacles.pushOut(a.x, a.z, a.r + REPULSION_REACH);
        const gain = (REPULSION * speed) / REPULSION_REACH;
        vx += (infl.x - a.x) * gain;
        vz += (infl.z - a.z) * gain;
      }

      // Separation. perp(a->b) is already antisymmetric between the two agents,
      // so a head-on pair always picks opposite sides without any negotiation.
      agentGrid.query(a.x, a.z, a.r + sepMargin, neighbours);
      const headingX = vx;
      const headingZ = vz;
      const headingLen = Math.hypot(headingX, headingZ) || 1;
      for (const b of neighbours) {
        if (b === a) continue;
        let dx2 = b.x - a.x;
        let dz2 = b.z - a.z;
        let d2 = Math.hypot(dx2, dz2);
        const reach = a.r + b.r + sepMargin;
        if (d2 >= reach) continue;
        if (d2 < EPS) {
          dx2 = a.index < b.index ? -1 : 1;
          dz2 = 0;
          d2 = 1;
        }
        const nx = dx2 / d2;
        const nz = dz2 / d2;
        const weight = (reach - d2) / reach;
        vx -= nx * weight * speed * SEP_MARGIN * 2;
        vz -= nz * weight * speed * SEP_MARGIN * 2;
        // Approaching, not receding: the heading has a positive component
        // along the direction toward the neighbour.
        const headOn = (headingX / headingLen) * nx + (headingZ / headingLen) * nz > 0.4;
        if (headOn) {
          vx += -nz * LATERAL_GAIN * speed;
          vz += nx * LATERAL_GAIN * speed;
        }
      }

      const vlen = Math.hypot(vx, vz);
      const peak = speed * PEAK_SPEED;
      if (vlen > peak) {
        vx = (vx / vlen) * peak;
        vz = (vz / vlen) * peak;
      }

      const stepX = vx * h;
      const stepZ = vz * h;
      // Slide along whatever stopped us rather than freezing against it.
      if (canTraverse(a, stepX, stepZ)) {
        a.x += stepX;
        a.z += stepZ;
      } else if (canTraverse(a, stepX, 0)) {
        a.x += stepX;
      } else if (canTraverse(a, 0, stepZ)) {
        a.z += stepZ;
      }

      const out = obstacles.pushOut(a.x, a.z, a.r);
      a.x = out.x;
      a.z = out.z;
      clampToBounds(a);

      a.vx = (a.x - prevX) / h;
      a.vz = (a.z - prevZ) / h;
      a.moving = Math.abs(a.x - prevX) > EPS || Math.abs(a.z - prevZ) > EPS;

      a.stuckFor += h;
      if (a.stuckFor >= stuckTime) {
        if (Math.hypot(a.x - a.lastX, a.z - a.lastZ) < stuckDist) {
          a.target = sampleTarget(a, { minDist: 0, tries: 48, r: a.r });
          a.handed = -a.handed;
          a.wait = 0;
        }
        a.lastX = a.x;
        a.lastZ = a.z;
        a.stuckFor = 0;
      }
    }

    relax();
  }

  return {
    obstacles,
    agents,
    speed,
    radius,
    sepMargin,
    bounds: () => bounds,
    setBounds(next) {
      bounds = next || null;
    },
    setObstacles,
    addAgent,
    removeAgent,
    find,
    isFree,
    sampleTarget,
    step,
  };
}
