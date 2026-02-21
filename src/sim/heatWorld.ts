// src/sim/heatWorld.ts

export type Material = {
  id: string;
  name: string;

  // thermal properties in SI:
  // rho: density [kg/m^3]
  // cp: specific heat capacity [J/(kg*K)]
  // lambda: thermal conductivity [W/(m*K)]
  rho: number;
  cp: number;
  lambda: number;

  // editor / infrastructure view
  color: string; // hex like "#AABBCC"

  // optional emitter: heater/AC as a "material"
  // If set, each step will relax the cell temperature toward emitTemp.
  // Positive = heating, negative (or just lower target) = cooling.
  emitTemp: number | null;
  // Electrical power draw while emitter is active.
  // Energy per step is computed as emitPowerW * dt (J).
  emitPowerW: number | null;
};

export type Cell = {
  T: number;
  materialId: string;
  unitId: string | null; // apartment
  // Per-cell emitter switch (for materials with emitTemp).
  // Controlled automatically by unit avgTemp vs comfy range.
  tempEmitting: boolean;
};

export type TempRange = { min: number; max: number };

export type UnitParams =
  | { kind: 'shared'; comfy: TempRange }
  | {
      kind: 'unit';
      homeFromMin: number; // 0..1439
      homeToMin: number; // 0..1439
      home: TempRange;
      away: TempRange;
    };

export type UnitRuntime = {
  allCells: number[];
  heaterCells: number[];
  totalCapJPerK: number;
  avgTemp: number;
  comfyRange: TempRange;
  // cellIndex -> directional targets (left, right, up, down)
  boundaryTargetsByCell: Record<number, (string | null)[]>;
  heatFlowTick: Record<string, number>;
  heatFlowTotal: Record<string, number>;
  comfortTickScore: number;
  comfortScoreSum: number;
  comfortScoreSamples: number;
  comfortAvgScore: number;
  emitterPowerTickW: number;
  emitterEnergyTickJ: number;
  emitterEnergyTotalJ: number;
};

export type Unit = {
  id: string;
  name: string;
  color: string;
  params: UnitParams;
  runtime?: UnitRuntime;
};

export type World = {
  __OPTIMISED: boolean;
  w: number;
  h: number;
  cells: Cell[];
  materials: Record<string, Material>;
  units: Record<string, Unit>;
  _dQ: Float64Array;
  // flattened [cellIndex * 4 + dir] where dir: 0=left,1=right,2=up,3=down
  _boundaryTargetByDir: (string | null)[];

  resetOptimisation: () => void;
};

export type Vec2 = { x: number; y: number };

export const SHARED_UNIT_ID = 'SHARED';
export const OUTSIDE_TARGET_ID = 'OUTSIDE';

export function xyToN(pos: Vec2, w: number) {
  return pos.y * w + pos.x;
}

export function nToXy(n: number, w: number): Vec2 {
  return { x: n % w, y: Math.floor(n / w) };
}

export function inBounds(pos: Vec2, w: number, h: number) {
  return pos.x >= 0 && pos.x < w && pos.y >= 0 && pos.y < h;
}

function harmonicMean(a: number, b: number) {
  const eps = 1e-12;
  return (2 * a * b) / (a + b + eps);
}

export const CELL_SIZE_M = 0.25;
export const SLAB_DEPTH_M = 2.7;
const CELL_VOLUME_M3 = CELL_SIZE_M * CELL_SIZE_M * SLAB_DEPTH_M;
const EDGE_AREA_M2 = CELL_SIZE_M * SLAB_DEPTH_M;
const EDGE_LENGTH_M = CELL_SIZE_M;

function cellCapJPerK(m: Material) {
  return Math.max(1e-9, m.rho * m.cp * CELL_VOLUME_M3);
}

function edgeConductanceWPerK(a: Material, b: Material) {
  const lambdaEff = harmonicMean(a.lambda, b.lambda);
  return lambdaEff * (EDGE_AREA_M2 / EDGE_LENGTH_M);
}

export function defaultUnits(): Record<string, Unit> {
  const shared: Unit = {
    id: SHARED_UNIT_ID,
    name: 'Shared space',
    color: '#9E9E9E',
    params: { kind: 'shared', comfy: { min: 14, max: 22 } },
  };

  const a: Unit = {
    id: 'A',
    name: 'Unit A',
    color: '#8E44AD',
    params: {
      kind: 'unit',
      homeFromMin: 22 * 60,
      homeToMin: 6 * 60,
      home: { min: 20, max: 22 },
      away: { min: 16, max: 18 },
    },
  };

  const b: Unit = {
    id: 'B',
    name: 'Unit B',
    color: '#27AE60',
    params: {
      kind: 'unit',
      homeFromMin: 16 * 60,
      homeToMin: 8 * 60,
      home: { min: 20, max: 22 },
      away: { min: 15, max: 17 },
    },
  };

  return {
    [shared.id]: shared,
    [a.id]: a,
    [b.id]: b,
  };
}

export function defaultMaterials(): Record<string, Material> {
  const air: Material = {
    id: 'air',
    name: 'Air',
    rho: 1.225,
    cp: 1005,
    // Effective conductivity for a coarse grid (includes unresolved air mixing).
    lambda: 2.5,
    color: '#2D3A4A',
    emitTemp: null,
    emitPowerW: null,
  };

  const brick: Material = {
    id: 'brick',
    name: 'Brick wall',
    rho: 1800,
    cp: 840,
    lambda: 0.72,
    color: '#7B4E2B',
    emitTemp: null,
    emitPowerW: null,
  };

  const concrete: Material = {
    id: 'concrete',
    name: 'Concrete',
    rho: 2300,
    cp: 880,
    lambda: 1.7,
    color: '#6E7076',
    emitTemp: null,
    emitPowerW: null,
  };

  const insulation: Material = {
    id: 'eps',
    name: 'Insulation (EPS)',
    rho: 20,
    cp: 1300,
    lambda: 0.035,
    color: '#D8D3A8',
    emitTemp: null,
    emitPowerW: null,
  };

  const windowMat: Material = {
    id: 'window',
    name: 'Window',
    rho: 2500,
    cp: 750,
    lambda: 1.0,
    color: '#7FB3D5',
    emitTemp: null,
    emitPowerW: null,
  };

  // Heater/AC as materials (targets)
  const heater: Material = {
    id: 'heater',
    name: 'Heater',
    // Device-like effective thermal mass, not full-cell filled steel.
    rho: 40,
    cp: 500,
    lambda: 3.0,
    color: '#C0392B',
    emitTemp: 55, // target temperature
    emitPowerW: 1200,
  };

  const ac: Material = {
    id: 'ac',
    name: 'AC',
    // Device-like effective thermal mass.
    rho: 35,
    cp: 900,
    lambda: 3.0,
    color: '#1F7AE0',
    emitTemp: 16,
    emitPowerW: 900,
  };

  // Outside boundary as a "material" is optional; you can just paint it on edges.
  const outside: Material = {
    id: 'outside',
    name: 'Outside',
    rho: 1e9, // huge so it behaves almost fixed
    cp: 1000,
    lambda: 0.3,
    color: '#0B1B2B',
    emitTemp: 0, // behaves like fixed outside temperature
    emitPowerW: 0,
  };

  return {
    air,
    brick,
    concrete,
    eps: insulation,
    window: windowMat,
    heater,
    ac,
    outside,
  };
}

export function createWorld(opts: {
  w: number;
  h: number;
  initTemp: number;
  materials?: Record<string, Material>;
  units?: Record<string, Unit>;
  defaultMaterialId?: string; // usually "air"
  defaultUnitId?: string | null; // usually null (no unit)
}): World {
  const materials = opts.materials ?? defaultMaterials();
  const defaultMaterialId = opts.defaultMaterialId ?? 'air';
  if (!materials[defaultMaterialId])
    throw new Error(`Missing default material: ${defaultMaterialId}`);

  const units = opts.units ?? defaultUnits();
  const defaultUnitId = opts.defaultUnitId ?? null;
  if (defaultUnitId !== null && !units[defaultUnitId])
    throw new Error(`Missing default unit: ${defaultUnitId}`);

  const n = opts.w * opts.h;
  const cells: Cell[] = new Array(n);

  for (let i = 0; i < n; i++) {
    cells[i] = {
      T: opts.initTemp,
      materialId: defaultMaterialId,
      unitId: defaultUnitId,
      tempEmitting: false,
    };
  }

  return {
    __OPTIMISED: false,
    w: opts.w,
    h: opts.h,
    cells,
    materials,
    units,
    _dQ: new Float64Array(n),
    _boundaryTargetByDir: new Array(n * 4).fill(null),
    resetOptimisation() {
      this.__OPTIMISED = false;
    },
  };
}

function resolveBoundaryTargetForDirection(
  world: World,
  sourceCellIndex: number,
  sourceUnitId: string,
  dx: number,
  dy: number,
): string | null {
  const { w, h, cells } = world;
  const sx = sourceCellIndex % w;
  const sy = (sourceCellIndex / w) | 0;
  const nx = sx + dx;
  const ny = sy + dy;

  // direct outside from map boundary
  if (nx < 0 || ny < 0 || nx >= w || ny >= h) return OUTSIDE_TARGET_ID; // TODO: asi spíš null, protože nebude probíhat přenos tepla mimo mapu

  let cx = nx;
  let cy = ny;
  let rayMode = false;

  while (cx >= 0 && cy >= 0 && cx < w && cy < h) {
    const n = cy * w + cx;
    const c = cells[n];
    if (!c) return null;

    if (c.unitId === sourceUnitId) return null;
    if (c.unitId && c.unitId !== sourceUnitId) return c.unitId;
    if (c.materialId === 'outside') return OUTSIDE_TARGET_ID;

    // start raycast through non-unit infrastructure
    rayMode = true;
    cx += dx;
    cy += dy;
  }

  // if raycast ended at map boundary, ignore
  return rayMode ? null : OUTSIDE_TARGET_ID;
}

function optimiseWorld(world: World) {
  if (world.__OPTIMISED) return;

  const units = Object.values(world.units);
  const cells = world.cells;
  const n = world.w * world.h;

  // generate runtime property of units
  for (let i = 0, len = units.length; i < len; i++) {
    const unit = units[i];
    if (!unit) continue;

    unit.runtime = {
      allCells: [],
      heaterCells: [],
      totalCapJPerK: 0,
      avgTemp: 0,
      comfyRange: { min: -Infinity, max: Infinity },
      boundaryTargetsByCell: {},
      heatFlowTick: {},
      heatFlowTotal: {},
      comfortTickScore: 100,
      comfortScoreSum: 0,
      comfortScoreSamples: 0,
      comfortAvgScore: 100,
      emitterPowerTickW: 0,
      emitterEnergyTickJ: 0,
      emitterEnergyTotalJ: 0,
    };
  }

  if (world._boundaryTargetByDir.length !== n * 4) {
    world._boundaryTargetByDir = new Array(n * 4).fill(null);
  } else {
    world._boundaryTargetByDir.fill(null);
  }

  // assign every unit its cells for quick access
  for (let cellInd = 0, len = cells.length; cellInd < len; cellInd++) {
    const cell = cells[cellInd];
    if (!cell || cell.unitId === null) continue;

    const unit = world.units[cell.unitId];
    if (!unit) continue;

    if (unit) {
      unit.runtime?.allCells.push(cellInd);

      const material = world.materials[cell.materialId];
      if (unit.runtime && material?.emitTemp == null) {
        unit.runtime.totalCapJPerK += cellCapJPerK(material);
      }
      if (material?.emitTemp != null) {
        unit.runtime?.heaterCells.push(cellInd);
      }
    }
  }

  // detect boundary targets per unit cell and direction
  const dirs = [
    [-1, 0], // left
    [1, 0], // right
    [0, -1], // up
    [0, 1], // down
  ] as const;

  for (let cellInd = 0, len = cells.length; cellInd < len; cellInd++) {
    const cell = cells[cellInd];
    if (!cell || !cell.unitId) continue;

    const unit = world.units[cell.unitId];
    const rt = unit?.runtime;
    if (!unit || !rt) continue;

    const byDir: (string | null)[] = [null, null, null, null];

    for (let dir = 0; dir < 4; dir++) {
      const [dx, dy] = dirs[dir];
      const targetId = resolveBoundaryTargetForDirection(world, cellInd, cell.unitId, dx, dy);
      byDir[dir] = targetId;
      world._boundaryTargetByDir[cellInd * 4 + dir] = targetId;
    }

    rt.boundaryTargetsByCell[cellInd] = byDir;
  }

  world.__OPTIMISED = true;
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function isHomeNow(unit: Unit, secOfDay: number) {
  if (unit.params.kind !== 'unit') return false;

  const tMin = Math.floor(secOfDay / 60) % 1440;
  const from = clamp(unit.params.homeFromMin, 0, 1439);
  const to = clamp(unit.params.homeToMin, 0, 1439);

  if (from === to) return true;
  if (from < to) return tMin >= from && tMin < to;
  return tMin >= from || tMin < to;
}

function getActiveRange(unit: Unit, secOfDay: number): TempRange {
  if (unit.params.kind === 'shared') return unit.params.comfy;
  return isHomeNow(unit, secOfDay) ? unit.params.home : unit.params.away;
}

function shouldEmitterBeOn(emitTemp: number, avgTemp: number, range: TempRange, wasOn: boolean) {
  // Heater-like source (target above comfy range): heat when too cold.
  if (emitTemp >= range.max) {
    if (avgTemp < range.min) return true;
    if (avgTemp > range.max) return false;
    return wasOn;
  }

  // Cooler-like source (target below comfy range): cool when too hot.
  if (emitTemp <= range.min) {
    if (avgTemp > range.max) return true;
    if (avgTemp < range.min) return false;
    return wasOn;
  }

  // Neutral source (target inside range): active only outside comfy range.
  if (avgTemp < range.min || avgTemp > range.max) return true;
  return false;
}

function emitterPowerFactor(emitTemp: number, avgTemp: number, range: TempRange) {
  const band = Math.max(1e-9, range.max - range.min);

  // Heater-like source: full power below min, taper to zero at max.
  if (emitTemp >= range.max) {
    if (avgTemp <= range.min) return 1;
    if (avgTemp >= range.max) return 0;
    return clamp((range.max - avgTemp) / band, 0, 1);
  }

  // Cooler-like source: full power above max, taper to zero at min.
  if (emitTemp <= range.min) {
    if (avgTemp >= range.max) return 1;
    if (avgTemp <= range.min) return 0;
    return clamp((avgTemp - range.min) / band, 0, 1);
  }

  // Neutral target inside comfy range:
  // power only outside comfy band, then ramps with distance.
  if (avgTemp < range.min) return clamp((range.min - avgTemp) / band, 0, 1);
  if (avgTemp > range.max) return clamp((avgTemp - range.max) / band, 0, 1);
  return 0;
}

function recomputeUnitAvgTemps(world: World) {
  const unitsArr = Object.values(world.units);
  for (let i = 0, len = unitsArr.length; i < len; i++) {
    const unit = unitsArr[i];
    if (!unit?.runtime) continue;

    const cellCount = unit.runtime.allCells.length;
    if (cellCount === 0) {
      unit.runtime.avgTemp = 0;
      continue;
    }

    let sum = 0;
    for (let j = 0; j < cellCount; j++) {
      const cellInd = unit.runtime.allCells[j];
      if (cellInd == null) continue;

      const cell = world.cells[cellInd];
      if (!cell) continue;
      sum += cell.T;
    }

    unit.runtime.avgTemp = sum / cellCount;
  }
}

function recomputeUnitComfyRanges(world: World, secOfDay: number) {
  const unitsArr = Object.values(world.units);
  for (let i = 0, len = unitsArr.length; i < len; i++) {
    const unit = unitsArr[i];
    const rt = unit?.runtime;
    if (!unit || !rt) continue;

    rt.comfyRange = getActiveRange(unit, secOfDay);
  }
}

function computeComfortScore(avgTemp: number, range: TempRange) {
  const deviation =
    avgTemp < range.min ? range.min - avgTemp : avgTemp > range.max ? avgTemp - range.max : 0;
  const halfBand = Math.max(0.5, (range.max - range.min) / 2);
  const norm = deviation / (halfBand + 2);
  const score = 100 * (1 - norm);
  return clamp(score, 0, 100);
}

function recomputeUnitComfortScores(world: World) {
  const unitsArr = Object.values(world.units);
  for (let i = 0; i < unitsArr.length; i++) {
    const rt = unitsArr[i]?.runtime;
    if (!rt) continue;

    const tickScore = computeComfortScore(rt.avgTemp, rt.comfyRange);
    rt.comfortTickScore = tickScore;
    rt.comfortScoreSum += tickScore;
    rt.comfortScoreSamples += 1;
    rt.comfortAvgScore = rt.comfortScoreSum / Math.max(1, rt.comfortScoreSamples);
  }
}

function updateEmitterStates(world: World) {
  const { cells, materials, units } = world;
  const n = cells.length;

  // auto-control per-cell emitters by unit avgTemp + active comfy range
  for (let i = 0; i < n; i++) {
    const c = cells[i];
    const m = materials[c.materialId];
    if (!m || m.emitTemp == null) continue;
    if (!c.unitId) continue;

    const unit = units[c.unitId];
    const rt = unit?.runtime;
    if (!unit || !rt) continue;

    c.tempEmitting = shouldEmitterBeOn(m.emitTemp, rt.avgTemp, rt.comfyRange, c.tempEmitting);
  }
}

type EmitterRequest = {
  unitId: string;
  cellIndex: number;
  dir: 1 | -1;
  rawPowerW: number;
};

function buildEmitterRequests(world: World): EmitterRequest[] {
  const requests: EmitterRequest[] = [];
  const { cells, materials, units } = world;

  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (!c?.unitId || !c.tempEmitting) continue;

    const m = materials[c.materialId];
    if (!m || m.emitTemp == null) continue;

    const unit = units[c.unitId];
    const rt = unit?.runtime;
    if (!rt) continue;

    const emitPowerW = Math.max(0, m.emitPowerW ?? 0);
    if (emitPowerW <= 0) continue;

    const dirSign = Math.sign(m.emitTemp - c.T);
    if (dirSign === 0) continue;

    const powerScale = emitterPowerFactor(m.emitTemp, rt.avgTemp, rt.comfyRange);
    const rawPowerW = emitPowerW * powerScale;
    if (rawPowerW <= 0) continue;

    requests.push({
      unitId: c.unitId,
      cellIndex: i,
      dir: dirSign > 0 ? 1 : -1,
      rawPowerW,
    });
  }

  return requests;
}

function computeUnitPowerScales(
  world: World,
  requests: EmitterRequest[],
  dt: number,
): Record<string, { heat: number; cool: number }> {
  const sums: Record<string, { heat: number; cool: number }> = {};
  for (let i = 0; i < requests.length; i++) {
    const req = requests[i];
    const cur = (sums[req.unitId] ??= { heat: 0, cool: 0 });
    if (req.dir > 0) cur.heat += req.rawPowerW;
    else cur.cool += req.rawPowerW;
  }

  const scales: Record<string, { heat: number; cool: number }> = {};
  const safeDt = Math.max(1e-9, dt);
  const gain = 0.12;
  const units = Object.values(world.units);

  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    const rt = u?.runtime;
    if (!u || !rt) continue;

    const raw = sums[u.id] ?? { heat: 0, cool: 0 };
    if (raw.heat <= 0 && raw.cool <= 0) continue;

    const target = (rt.comfyRange.min + rt.comfyRange.max) / 2;
    const err = target - rt.avgTemp;
    const cap = Math.max(1e-9, rt.totalCapJPerK);
    const requiredPowerW = (Math.abs(err) * cap * gain) / safeDt;

    const heatScale =
      err > 0 && raw.heat > 0 ? clamp(requiredPowerW / Math.max(raw.heat, 1e-9), 0, 1) : 0;
    const coolScale =
      err < 0 && raw.cool > 0 ? clamp(requiredPowerW / Math.max(raw.cool, 1e-9), 0, 1) : 0;

    scales[u.id] = { heat: heatScale, cool: coolScale };
  }

  return scales;
}

function resetHeatFlowTick(world: World) {
  const unitsArr = Object.values(world.units);
  for (let i = 0; i < unitsArr.length; i++) {
    const rt = unitsArr[i]?.runtime;
    if (!rt) continue;
    rt.heatFlowTick = {};
    rt.emitterPowerTickW = 0;
    rt.emitterEnergyTickJ = 0;
  }
}

function dirFromTo(i: number, j: number, w: number): 0 | 1 | 2 | 3 | null {
  if (j === i - 1) return 0;
  if (j === i + 1) return 1;
  if (j === i - w) return 2;
  if (j === i + w) return 3;
  return null;
}

function addHeatFlow(world: World, fromUnitId: string, targetId: string, amount: number) {
  const rt = world.units[fromUnitId]?.runtime;
  if (!rt || !Number.isFinite(amount) || amount === 0) return;

  rt.heatFlowTick[targetId] = (rt.heatFlowTick[targetId] ?? 0) + amount;
  rt.heatFlowTotal[targetId] = (rt.heatFlowTotal[targetId] ?? 0) + amount;
}

function addEmitterConsumption(world: World, unitId: string, powerW: number, dt: number) {
  const rt = world.units[unitId]?.runtime;
  if (!rt) return;
  if (!Number.isFinite(powerW) || powerW <= 0) return;
  if (!Number.isFinite(dt) || dt <= 0) return;

  const energyJ = powerW * dt;
  rt.emitterPowerTickW += powerW;
  rt.emitterEnergyTickJ += energyJ;
  rt.emitterEnergyTotalJ += energyJ;
}

function recordInterUnitHeatFlow(world: World, i: number, j: number, q: number) {
  const { cells, w, _boundaryTargetByDir } = world;

  const ci = cells[i];
  const cj = cells[j];
  if (!ci || !cj) return;

  const dirIj = dirFromTo(i, j, w);
  const dirJi = dirFromTo(j, i, w);
  if (dirIj == null || dirJi == null) return;

  if (ci.unitId) {
    const targetId = _boundaryTargetByDir[i * 4 + dirIj];
    if (targetId) {
      addHeatFlow(world, ci.unitId, targetId, q);
    }
  }

  if (cj.unitId) {
    const targetId = _boundaryTargetByDir[j * 4 + dirJi];
    if (targetId) {
      addHeatFlow(world, cj.unitId, targetId, -q);
    }
  }
}

/**
 * One simulation step:
 * 1) diffuse energy between neighbors4 using per-edge conductance derived from materials k
 * 2) update temperature using per-cell cap
 * 3) apply material emitters
 *    - infrastructure emitters without unit can still pin temperature
 *    - unit emitters add/remove energy by power (emitPowerW * dt)
 */
export function stepWorld(world: World, dt: number, secOfDay = 0) {
  const { w, h, cells, units, materials } = world;
  const n = w * h;

  optimiseWorld(world);
  resetHeatFlowTick(world);

  let dQ = world._dQ;
  if (dQ.length !== n) {
    // kdybys někdy měnil rozměry bez createWorld (jinak netřeba)
    world._dQ = new Float64Array(n);
    dQ = world._dQ;
  } else {
    dQ.fill(0);
  }

  const flow = (i: number, j: number) => {
    const ci = cells[i];
    const cj = cells[j];

    const mi = materials[ci.materialId];
    const mj = materials[cj.materialId];
    if (!mi || !mj) return;

    const Ti = ci.T;
    const Tj = cj.T;

    // conduction between cells:
    // G [W/K] = lambda_eff * A / L
    const g = edgeConductanceWPerK(mi, mj);

    // energy transferred this step
    const q = g * (Ti - Tj) * dt;
    dQ[i] -= q;
    dQ[j] += q;
    recordInterUnitHeatFlow(world, i, j, q);
  };

  // horizontal edges
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w - 1; x++) {
      const i = row + x;
      flow(i, i + 1);
    }
  }

  // vertical edges
  for (let y = 0; y < h - 1; y++) {
    const row = y * w;
    const rowBelow = (y + 1) * w;
    for (let x = 0; x < w; x++) {
      const i = row + x;
      flow(i, rowBelow + x);
    }
  }

  // apply temperature changes from diffusion
  for (let i = 0; i < n; i++) {
    const c = cells[i];
    const m = materials[c.materialId];
    if (!m) continue;

    const cap = cellCapJPerK(m);
    c.T += dQ[i] / cap;
  }

  // Use up-to-date unit averages/ranges for this step's emitter control.
  recomputeUnitAvgTemps(world);
  recomputeUnitComfyRanges(world, secOfDay);
  updateEmitterStates(world);

  // apply fixed infrastructure emitters (outside, etc.)
  for (let i = 0; i < n; i++) {
    const c = cells[i];
    const m = materials[c.materialId];
    if (!m || m.emitTemp == null) continue;

    // Cells without unit are considered fixed infrastructure emitters.
    if (!c.unitId) {
      c.tempEmitting = true;
      c.T = m.emitTemp;
      continue;
    }

    // Unknown unit: keep emitter on as safe fallback.
    if (!units[c.unitId]) {
      c.tempEmitting = true;
      c.T = m.emitTemp;
      continue;
    }
  }

  // apply unit emitters using unit-level demand budgeting
  const emitterRequests = buildEmitterRequests(world);
  const unitPowerScales = computeUnitPowerScales(world, emitterRequests, dt);
  for (let i = 0; i < emitterRequests.length; i++) {
    const req = emitterRequests[i];
    const c = cells[req.cellIndex];
    if (!c || !c.unitId) continue;
    const m = materials[c.materialId];
    if (!m) continue;

    const scale = unitPowerScales[c.unitId];
    const unitScale = req.dir > 0 ? (scale?.heat ?? 0) : (scale?.cool ?? 0);
    const effectivePowerW = req.rawPowerW * unitScale;
    if (effectivePowerW <= 0) continue;

    const cap = cellCapJPerK(m);
    const qEmitter = effectivePowerW * dt * req.dir;
    c.T += qEmitter / cap;
    addEmitterConsumption(world, c.unitId, effectivePowerW, dt);
  }

  recomputeUnitAvgTemps(world);
  recomputeUnitComfyRanges(world, secOfDay);
  recomputeUnitComfortScores(world);

  // update state for next step using post-emitter temperatures
  updateEmitterStates(world);
}

export function getMinMaxT(world: World) {
  let min = Infinity;
  let max = -Infinity;
  for (const c of world.cells) {
    if (c.T < min) min = c.T;
    if (c.T > max) max = c.T;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1 };
  if (min === max) return { min, max: min + 1e-9 };
  return { min, max };
}

// Safe material delete helper: replaces references with fallbackId
export function deleteMaterial(world: World, id: string, fallbackId = 'air') {
  if (!world.materials[id]) return;
  if (!world.materials[fallbackId]) throw new Error(`Missing fallback material: ${fallbackId}`);

  delete world.materials[id];
  for (const c of world.cells) {
    if (c.materialId === id) c.materialId = fallbackId;
  }
}
