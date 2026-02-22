import { CELL_SIZE_M, SLAB_DEPTH_M } from 'src/sim/heatWorld.core';
import {
  OUTSIDE_TARGET_ID,
  type Material,
  type TempRange,
  type Unit,
  type UnitRuntime,
  type World,
} from 'src/sim/heatWorld.types';
import { createStepPhaseTracker, flushStepProfilingWindow } from 'src/sim/heatWorld.profiling';

const DIR_LEFT = 0;
const DIR_RIGHT = 1;
const DIR_UP = 2;
const DIR_DOWN = 3;
const DIR_VECTORS = [
  [-1, 0], // left
  [1, 0], // right
  [0, -1], // up
  [0, 1], // down
] as const;

const CELL_VOLUME_M3 = CELL_SIZE_M * CELL_SIZE_M * SLAB_DEPTH_M;
const EDGE_AREA_M2 = CELL_SIZE_M * SLAB_DEPTH_M;
const EDGE_LENGTH_M = CELL_SIZE_M;

// Clamps value into [min, max].
function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

// Harmonic mean used for interface conductivity between two materials.
function harmonicMean(a: number, b: number) {
  const eps = 1e-12;
  return (2 * a * b) / (a + b + eps);
}

// Computes single-cell heat capacity [J/K].
function cellCapJPerK(m: Material) {
  return Math.max(1e-9, m.rho * m.cp * CELL_VOLUME_M3);
}

// Computes edge conductance between adjacent cells [W/K].
function edgeConductanceWPerK(a: Material, b: Material) {
  const lambdaEff = harmonicMean(a.lambda, b.lambda);
  return lambdaEff * (EDGE_AREA_M2 / EDGE_LENGTH_M);
}

// Resolves which external target a boundary edge points to (unit/outside/null).
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

  if (nx < 0 || ny < 0 || nx >= w || ny >= h) return OUTSIDE_TARGET_ID;

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

    rayMode = true;
    cx += dx;
    cy += dy;
  }

  return rayMode ? null : OUTSIDE_TARGET_ID;
}

// Creates empty runtime statistics object for a unit.
function createInitialUnitRuntime(): UnitRuntime {
  return {
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

// Ensures all SoA buffers are allocated for current world size.
function ensureOptimisedStorage(world: World, n: number) {
  if (world._tempByCell.length !== n) {
    world._tempByCell = new Float64Array(n);
  }
  if (world._unitIdByCell.length !== n) {
    world._unitIdByCell = new Array(n).fill(null);
  }
  if (world._cellCapJPerK.length !== n) {
    world._cellCapJPerK = new Float64Array(n);
  }
  if (world._edgeConductanceRightWPerK.length !== n) {
    world._edgeConductanceRightWPerK = new Float64Array(n);
  } else {
    world._edgeConductanceRightWPerK.fill(0);
  }
  if (world._edgeConductanceDownWPerK.length !== n) {
    world._edgeConductanceDownWPerK = new Float64Array(n);
  } else {
    world._edgeConductanceDownWPerK.fill(0);
  }
  if (world._boundaryTargetByDir.length !== n * 4) {
    world._boundaryTargetByDir = new Array(n * 4).fill(null);
  } else {
    world._boundaryTargetByDir.fill(null);
  }
}

// Resets runtime state for all units before cache rebuild.
function resetRuntimeForAllUnits(world: World) {
  const units = Object.values(world.units);
  for (let i = 0, len = units.length; i < len; i++) {
    const unit = units[i];
    if (!unit) continue;
    unit.runtime = createInitialUnitRuntime();
  }
}

// Rebuilds unit-owned cell lists and aggregate capacity.
function rebuildUnitCellTopology(world: World) {
  const cells = world.cells;
  for (let cellInd = 0, len = cells.length; cellInd < len; cellInd++) {
    const cell = cells[cellInd];
    if (!cell || cell.unitId === null) continue;

    const unit = world.units[cell.unitId];
    const rt = unit?.runtime;
    if (!rt) continue;

    rt.allCells.push(cellInd);
    const material = world.materials[cell.materialId];
    if (material?.emitTemp == null) {
      rt.totalCapJPerK += cellCapJPerK(material!);
    } else {
      rt.heaterCells.push(cellInd);
    }
  }
}

// Rebuilds directional boundary target map for inter-unit heat accounting.
function rebuildBoundaryTargets(world: World) {
  const cells = world.cells;
  for (let cellInd = 0, len = cells.length; cellInd < len; cellInd++) {
    const cell = cells[cellInd];
    if (!cell || !cell.unitId) continue;

    const rt = world.units[cell.unitId]?.runtime;
    if (!rt) continue;

    const byDir: (string | null)[] = [null, null, null, null];
    for (let dir = 0; dir < 4; dir++) {
      const [dx, dy] = DIR_VECTORS[dir]!;
      const targetId = resolveBoundaryTargetForDirection(world, cellInd, cell.unitId, dx, dy);
      byDir[dir] = targetId;
      world._boundaryTargetByDir[cellInd * 4 + dir] = targetId;
    }
    rt.boundaryTargetsByCell[cellInd] = byDir;
  }
}

// Rebuilds per-cell SoA caches and emitter index lists.
function rebuildCellCaches(world: World, n: number) {
  const cells = world.cells;
  const capByCell = world._cellCapJPerK;
  const tempByCell = world._tempByCell;
  const unitIdByCell = world._unitIdByCell;
  const unitEmitterCells = world._unitEmitterCells;
  const fixedEmitterCells = world._fixedEmitterCells;
  const fixedEmitterEmitTemp = world._fixedEmitterEmitTemp;

  unitEmitterCells.length = 0;
  fixedEmitterCells.length = 0;
  fixedEmitterEmitTemp.length = 0;

  for (let i = 0; i < n; i++) {
    const c = cells[i];
    const m = c ? world.materials[c.materialId] : undefined;
    tempByCell[i] = c?.T ?? 0;
    unitIdByCell[i] = c?.unitId ?? null;
    capByCell[i] = m ? cellCapJPerK(m) : 1e-9;

    const emitTemp = m?.emitTemp;
    if (!c || emitTemp == null || !Number.isFinite(emitTemp)) continue;
    if (!c.unitId || !world.units[c.unitId]) {
      fixedEmitterCells.push(i);
      fixedEmitterEmitTemp.push(emitTemp);
      continue;
    }
    unitEmitterCells.push(i);
  }
}

// Rebuilds right/down conductance maps used by diffusion loops.
function rebuildConductionCaches(world: World) {
  const { w, h, cells } = world;
  const rightG = world._edgeConductanceRightWPerK;
  const downG = world._edgeConductanceDownWPerK;

  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w - 1; x++) {
      const i = row + x;
      const j = i + 1;
      const ci = cells[i];
      const cj = cells[j];
      const mi = ci ? world.materials[ci.materialId] : undefined;
      const mj = cj ? world.materials[cj.materialId] : undefined;
      rightG[i] = mi && mj ? edgeConductanceWPerK(mi, mj) : 0;
    }
  }

  for (let y = 0; y < h - 1; y++) {
    const row = y * w;
    const rowBelow = row + w;
    for (let x = 0; x < w; x++) {
      const i = row + x;
      const j = rowBelow + x;
      const ci = cells[i];
      const cj = cells[j];
      const mi = ci ? world.materials[ci.materialId] : undefined;
      const mj = cj ? world.materials[cj.materialId] : undefined;
      downG[i] = mi && mj ? edgeConductanceWPerK(mi, mj) : 0;
    }
  }
}

// Lazily rebuilds all optimisation caches when world changed.
function optimiseWorld(world: World) {
  if (world.__OPTIMISED) return;

  const n = world.w * world.h;
  ensureOptimisedStorage(world, n);
  resetRuntimeForAllUnits(world);
  rebuildUnitCellTopology(world);
  rebuildBoundaryTargets(world);
  rebuildCellCaches(world, n);
  rebuildConductionCaches(world);
  world.__OPTIMISED = true;
}

// Returns whether unit should be in "home" schedule at current time.
function isHomeNow(unit: Unit, secOfDay: number) {
  if (unit.params.kind !== 'unit') return false;

  const tMin = Math.floor(secOfDay / 60) % 1440;
  const from = clamp(unit.params.homeFromMin, 0, 1439);
  const to = clamp(unit.params.homeToMin, 0, 1439);

  if (from === to) return true;
  if (from < to) return tMin >= from && tMin < to;
  return tMin >= from || tMin < to;
}

// Returns currently active comfort range for unit.
function getActiveRange(unit: Unit, secOfDay: number): TempRange {
  if (unit.params.kind === 'shared') return unit.params.comfy;
  return isHomeNow(unit, secOfDay) ? unit.params.home : unit.params.away;
}

// Hysteresis-like emitter switch decision.
function shouldEmitterBeOn(emitTemp: number, avgTemp: number, range: TempRange, wasOn: boolean) {
  if (emitTemp >= range.max) {
    if (avgTemp < range.min) return true;
    if (avgTemp > range.max) return false;
    return wasOn;
  }

  if (emitTemp <= range.min) {
    if (avgTemp > range.max) return true;
    if (avgTemp < range.min) return false;
    return wasOn;
  }

  return avgTemp < range.min || avgTemp > range.max;
}

// Computes normalized emitter power factor [0..1] from comfort error.
function emitterPowerFactor(emitTemp: number, avgTemp: number, range: TempRange) {
  const band = Math.max(1e-9, range.max - range.min);

  if (emitTemp >= range.max) {
    if (avgTemp <= range.min) return 1;
    if (avgTemp >= range.max) return 0;
    return clamp((range.max - avgTemp) / band, 0, 1);
  }

  if (emitTemp <= range.min) {
    if (avgTemp >= range.max) return 1;
    if (avgTemp <= range.min) return 0;
    return clamp((avgTemp - range.min) / band, 0, 1);
  }

  if (avgTemp < range.min) return clamp((range.min - avgTemp) / band, 0, 1);
  if (avgTemp > range.max) return clamp((avgTemp - range.max) / band, 0, 1);
  return 0;
}

// Recomputes average unit temperature from cell ownership lists.
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

// Recomputes active comfort ranges for all units.
function recomputeUnitComfyRanges(world: World, secOfDay: number) {
  const unitsArr = Object.values(world.units);
  for (let i = 0, len = unitsArr.length; i < len; i++) {
    const unit = unitsArr[i];
    const rt = unit?.runtime;
    if (!unit || !rt) continue;
    rt.comfyRange = getActiveRange(unit, secOfDay);
  }
}

// Converts temperature deviation into comfort score [0..100].
function computeComfortScore(avgTemp: number, range: TempRange) {
  const deviation =
    avgTemp < range.min ? range.min - avgTemp : avgTemp > range.max ? avgTemp - range.max : 0;
  const halfBand = Math.max(0.5, (range.max - range.min) / 2);
  const norm = deviation / (halfBand + 2);
  const score = 100 * (1 - norm);
  return clamp(score, 0, 100);
}

// Updates per-step and cumulative comfort scores.
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

// Updates on/off state for unit-controlled emitter cells.
function updateEmitterStates(world: World) {
  const { cells, materials, units, _unitEmitterCells } = world;
  for (let i = 0; i < _unitEmitterCells.length; i++) {
    const cellIndex = _unitEmitterCells[i];
    if (cellIndex == null) continue;
    const c = cells[cellIndex];
    if (!c || !c.unitId) continue;
    const m = materials[c.materialId];
    if (!m || m.emitTemp == null) continue;

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

// Builds list of active emitter power requests for this step.
function buildEmitterRequests(world: World): EmitterRequest[] {
  const requests: EmitterRequest[] = [];
  const { cells, materials, units, _unitEmitterCells } = world;

  for (let k = 0; k < _unitEmitterCells.length; k++) {
    const i = _unitEmitterCells[k];
    if (i == null) continue;
    const c = cells[i];
    if (!c || !c.unitId || !c.tempEmitting) continue;

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

// Computes per-unit power scaling so emitters respect demand/capacity.
function computeUnitPowerScales(
  world: World,
  requests: EmitterRequest[],
  dt: number,
): Record<string, { heat: number; cool: number }> {
  const sums: Record<string, { heat: number; cool: number }> = {};
  for (let i = 0; i < requests.length; i++) {
    const req = requests[i];
    if (!req) continue;
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

// Clears per-tick heat flow/emitter counters.
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

// Adds inter-target heat flow to tick + cumulative maps.
function addHeatFlow(world: World, fromUnitId: string, targetId: string, amount: number) {
  const rt = world.units[fromUnitId]?.runtime;
  if (!rt || !Number.isFinite(amount) || amount === 0) return;
  rt.heatFlowTick[targetId] = (rt.heatFlowTick[targetId] ?? 0) + amount;
  rt.heatFlowTotal[targetId] = (rt.heatFlowTotal[targetId] ?? 0) + amount;
}

// Adds emitter electric consumption stats.
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

// Records directional inter-unit heat transfer for both edge cells.
function recordInterUnitHeatFlowKnownDirs(
  world: World,
  unitI: string | null,
  unitJ: string | null,
  i: number,
  j: number,
  dirIj: 0 | 1 | 2 | 3,
  dirJi: 0 | 1 | 2 | 3,
  q: number,
) {
  if (unitI) {
    const targetId = world._boundaryTargetByDir[i * 4 + dirIj];
    if (targetId) addHeatFlow(world, unitI, targetId, q);
  }

  if (unitJ) {
    const targetId = world._boundaryTargetByDir[j * 4 + dirJi];
    if (targetId) addHeatFlow(world, unitJ, targetId, -q);
  }
}

type StepArrays = {
  dQ: Float64Array;
  rightG: Float64Array;
  downG: Float64Array;
  capByCell: Float64Array;
  tempByCell: Float64Array;
  unitIdByCell: (string | null)[];
};

// Prepares reusable per-step SoA references and clears dQ accumulator.
function prepareStepArrays(world: World, n: number): StepArrays {
  let dQ = world._dQ;
  if (dQ.length !== n) {
    world._dQ = new Float64Array(n);
    dQ = world._dQ;
  } else {
    dQ.fill(0);
  }

  return {
    dQ,
    rightG: world._edgeConductanceRightWPerK,
    downG: world._edgeConductanceDownWPerK,
    capByCell: world._cellCapJPerK,
    tempByCell: world._tempByCell,
    unitIdByCell: world._unitIdByCell,
  };
}

// Accumulates heat transfer over horizontal edges into dQ.
function accumulateHorizontalConduction(world: World, dt: number, arrays: StepArrays) {
  const { w, h } = world;
  const { dQ, rightG, tempByCell, unitIdByCell } = arrays;

  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w - 1; x++) {
      const i = row + x;
      const j = i + 1;
      const Ti = tempByCell[i];
      const Tj = tempByCell[j];
      if (Ti == null || Tj == null || Ti === Tj) continue;

      const g = rightG[i];
      if (g == null || g <= 0) continue;

      const q = g * (Ti - Tj) * dt;
      dQ[i]! -= q;
      dQ[j]! += q;

      const unitI = unitIdByCell[i] ?? null;
      const unitJ = unitIdByCell[j] ?? null;
      if (unitI || unitJ) {
        recordInterUnitHeatFlowKnownDirs(world, unitI, unitJ, i, j, DIR_RIGHT, DIR_LEFT, q);
      }
    }
  }
}

// Accumulates heat transfer over vertical edges into dQ.
function accumulateVerticalConduction(world: World, dt: number, arrays: StepArrays) {
  const { w, h } = world;
  const { dQ, downG, tempByCell, unitIdByCell } = arrays;

  for (let y = 0; y < h - 1; y++) {
    const row = y * w;
    const rowBelow = (y + 1) * w;
    for (let x = 0; x < w; x++) {
      const i = row + x;
      const j = rowBelow + x;
      const Ti = tempByCell[i];
      const Tj = tempByCell[j];
      if (Ti == null || Tj == null || Ti === Tj) continue;

      const g = downG[i];
      if (g == null || g <= 0) continue;

      const q = g * (Ti - Tj) * dt;
      dQ[i]! -= q;
      dQ[j]! += q;

      const unitI = unitIdByCell[i] ?? null;
      const unitJ = unitIdByCell[j] ?? null;
      if (unitI || unitJ) {
        recordInterUnitHeatFlowKnownDirs(world, unitI, unitJ, i, j, DIR_DOWN, DIR_UP, q);
      }
    }
  }
}

// Applies dQ/cap to temperatures and mirrors result back to cell objects.
function applyDiffusionToCells(world: World, arrays: StepArrays, n: number) {
  const { cells } = world;
  const { dQ, capByCell, tempByCell } = arrays;

  for (let i = 0; i < n; i++) {
    const cap = capByCell[i];
    if (cap == null) continue;
    tempByCell[i]! += dQ[i]! / (cap > 0 ? cap : 1e-9);
  }

  for (let i = 0; i < n; i++) {
    const c = cells[i];
    if (!c) continue;
    const t = tempByCell[i];
    if (t == null) continue;
    c.T = t;
  }
}

// Applies fixed infrastructure emitters (outside/non-unit references).
function applyFixedEmitters(world: World, tempByCell: Float64Array) {
  const cells = world.cells;
  for (let i = 0; i < world._fixedEmitterCells.length; i++) {
    const cellIndex = world._fixedEmitterCells[i];
    if (cellIndex == null) continue;
    const c = cells[cellIndex];
    if (!c) continue;
    const emitTemp = world._fixedEmitterEmitTemp[i];
    if (emitTemp == null || !Number.isFinite(emitTemp)) continue;
    c.tempEmitting = true;
    c.T = emitTemp;
    tempByCell[cellIndex] = emitTemp;
  }
}

// Applies unit emitter requests with computed power scales.
function applyUnitEmitters(
  world: World,
  dt: number,
  arrays: StepArrays,
  emitterRequests: EmitterRequest[],
  unitPowerScales: Record<string, { heat: number; cool: number }>,
) {
  const { cells, materials } = world;
  const { capByCell, tempByCell } = arrays;

  for (let i = 0; i < emitterRequests.length; i++) {
    const req = emitterRequests[i];
    if (!req) continue;

    const c = cells[req.cellIndex];
    if (!c || !c.unitId) continue;
    const m = materials[c.materialId];
    if (!m) continue;

    const scale = unitPowerScales[c.unitId];
    const unitScale = req.dir > 0 ? (scale?.heat ?? 0) : (scale?.cool ?? 0);
    const effectivePowerW = req.rawPowerW * unitScale;
    if (effectivePowerW <= 0) continue;

    const cap = capByCell[req.cellIndex];
    if (cap == null) continue;
    const qEmitter = effectivePowerW * dt * req.dir;
    const nextT = c.T + qEmitter / (cap > 0 ? cap : 1e-9);
    c.T = nextT;
    tempByCell[req.cellIndex] = nextT;
    addEmitterConsumption(world, c.unitId, effectivePowerW, dt);
  }
}

/**
 * One simulation step:
 * 1) diffuse energy between neighbors using conductance caches
 * 2) update temperature from accumulated dQ
 * 3) apply emitter logic and update comfort/flow metrics
 */
export function stepWorld(world: World, dt: number, secOfDay = 0) {
  const n = world.w * world.h;
  const { stepStartMs, phaseTotals, markPhase } = createStepPhaseTracker();

  optimiseWorld(world);
  resetHeatFlowTick(world);
  markPhase('optimiseAndReset');

  const arrays = prepareStepArrays(world, n);
  markPhase('prepareBuffers');

  accumulateHorizontalConduction(world, dt, arrays);
  markPhase('conductionHorizontal');

  accumulateVerticalConduction(world, dt, arrays);
  markPhase('conductionVertical');

  applyDiffusionToCells(world, arrays, n);
  markPhase('applyDiffusion');

  recomputeUnitAvgTemps(world);
  recomputeUnitComfyRanges(world, secOfDay);
  updateEmitterStates(world);
  markPhase('preEmitterControl');

  applyFixedEmitters(world, arrays.tempByCell);
  markPhase('applyFixedEmitters');

  const emitterRequests = buildEmitterRequests(world);
  markPhase('buildEmitterRequests');

  const unitPowerScales = computeUnitPowerScales(world, emitterRequests, dt);
  markPhase('computePowerScales');

  applyUnitEmitters(world, dt, arrays, emitterRequests, unitPowerScales);
  markPhase('applyUnitEmitters');

  recomputeUnitAvgTemps(world);
  recomputeUnitComfyRanges(world, secOfDay);
  recomputeUnitComfortScores(world);
  markPhase('postEmitterMetrics');

  updateEmitterStates(world);
  markPhase('postEmitterState');

  flushStepProfilingWindow(phaseTotals, stepStartMs, emitterRequests.length);
}

// Safe material delete helper: replaces references with fallbackId.
export function deleteMaterial(world: World, id: string, fallbackId = 'air') {
  if (!world.materials[id]) return;
  if (!world.materials[fallbackId]) throw new Error(`Missing fallback material: ${fallbackId}`);

  delete world.materials[id];
  for (const c of world.cells) {
    if (c.materialId === id) c.materialId = fallbackId;
  }
}
