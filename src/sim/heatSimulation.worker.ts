/// <reference lib="webworker" />

import { HeatSimulation } from 'src/sim/heatSimulation';
import { configureStepWorldProfiling } from 'src/sim/heatWorld';
import type { World } from 'src/sim/heatWorld';
import type {
  HeatWorldSnapshot,
  SimulationSnapshot,
  WorkerRequest,
  WorkerResponse,
} from 'src/sim/heatWorkerProtocol';

const LOOP_MS = 4;
const IDLE_LOOP_MS = 50;
const PROFILE_STEP_WORLD = false;
const PROFILE_STEP_WORLD_REPORT_EVERY_STEPS = 1000;
const DEFAULT_SNAPSHOT_FPS_LIMIT = 12;
const MIN_SNAPSHOT_FPS_LIMIT = 1;
const MAX_SNAPSHOT_FPS_LIMIT = 60;
const PERF_LOG = false;

let simulation = new HeatSimulation();
let lastLoopTs = performance.now();
let lastSnapshotTs = 0;
let snapshotMinMs = 1000 / DEFAULT_SNAPSHOT_FPS_LIMIT;
let dirty = true;

if (PROFILE_STEP_WORLD) {
  configureStepWorldProfiling({
    enabled: true,
    reportEverySteps: PROFILE_STEP_WORLD_REPORT_EVERY_STEPS,
    logToConsole: true,
  });
}

function clampSnapshotFpsLimit(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_SNAPSHOT_FPS_LIMIT;
  return Math.max(MIN_SNAPSHOT_FPS_LIMIT, Math.min(MAX_SNAPSHOT_FPS_LIMIT, Math.floor(value)));
}

function setSnapshotFpsLimit(fpsLimit: number) {
  const fps = clampSnapshotFpsLimit(fpsLimit);
  snapshotMinMs = 1000 / fps;
}

function toWorldSnapshot(world: World | null): HeatWorldSnapshot | null {
  if (!world) return null;
  return {
    w: world.w,
    h: world.h,
    cells: world.cells,
    materials: world.materials,
    units: world.units,
  };
}

function createSnapshot(): SimulationSnapshot {
  return {
    world: toWorldSnapshot(simulation.world),
    tick: simulation.tick,
    simTimeSec: simulation.simTimeSec,
    running: simulation.running,
    runtimeRows: simulation.getRuntimeRows(),
  };
}

function post(data: WorkerResponse) {
  self.postMessage(data);
}

function emitSnapshot(force = false) {
  const now = performance.now();
  if (!force && now - lastSnapshotTs < snapshotMinMs) return;
  lastSnapshotTs = now;
  dirty = false;
  post({ type: 'snapshot', snapshot: createSnapshot() });
}

function respondOk(requestId: number, value?: unknown) {
  post({ type: 'ok', requestId, value });
}

function respondError(requestId: number, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  post({ type: 'error', requestId, message });
}

function markDirtyAndFlush() {
  dirty = true;
  emitSnapshot(true);
}

function handleRequest(msg: WorkerRequest) {
  try {
    switch (msg.type) {
      case 'init':
        simulation = new HeatSimulation(msg.config);
        lastLoopTs = performance.now();
        dirty = true;
        respondOk(msg.requestId, true);
        emitSnapshot(true);
        return;
      case 'setConfig':
        simulation.setConfig(msg.config);
        respondOk(msg.requestId, true);
        return;
      case 'setSnapshotFpsLimit':
        setSnapshotFpsLimit(msg.fpsLimit);
        respondOk(msg.requestId, true);
        return;
      case 'setup':
        simulation.setup();
        respondOk(msg.requestId, true);
        markDirtyAndFlush();
        return;
      case 'resetTemperatureAndTime':
        simulation.resetTemperatureAndTime();
        respondOk(msg.requestId, true);
        markDirtyAndFlush();
        return;
      case 'toggleRun':
        simulation.toggleRun();
        respondOk(msg.requestId, simulation.running);
        markDirtyAndFlush();
        return;
      case 'stepOnce': {
        const changed = simulation.stepOnce();
        respondOk(msg.requestId, changed);
        if (changed || !simulation.running) {
          markDirtyAndFlush();
        }
        return;
      }
      case 'applyMaterialTool': {
        const picked = simulation.applyMaterialTool(msg.index, msg.tool, msg.selectedMaterialId);
        respondOk(msg.requestId, picked);
        if (msg.tool !== 'pick') {
          markDirtyAndFlush();
        }
        return;
      }
      case 'applyUnitTool': {
        const picked = simulation.applyUnitTool(msg.index, msg.tool, msg.selectedUnitId);
        respondOk(msg.requestId, picked);
        if (msg.tool !== 'pick') {
          markDirtyAndFlush();
        }
        return;
      }
      case 'upsertMaterial': {
        const ok = simulation.upsertMaterial(msg.material);
        respondOk(msg.requestId, ok);
        if (ok) markDirtyAndFlush();
        return;
      }
      case 'removeMaterial': {
        const ok = simulation.removeMaterial(msg.id, msg.fallbackId ?? 'air');
        respondOk(msg.requestId, ok);
        if (ok) markDirtyAndFlush();
        return;
      }
      case 'addUnit': {
        const ok = simulation.addUnit(msg.unit);
        respondOk(msg.requestId, ok);
        if (ok) markDirtyAndFlush();
        return;
      }
      case 'updateUnit': {
        const ok = simulation.updateUnit(msg.unit);
        respondOk(msg.requestId, ok);
        if (ok) markDirtyAndFlush();
        return;
      }
      case 'removeUnit': {
        const ok = simulation.removeUnit(msg.id);
        respondOk(msg.requestId, ok);
        if (ok) markDirtyAndFlush();
        return;
      }
      case 'exportSetup': {
        respondOk(msg.requestId, simulation.exportSetup());
        return;
      }
      case 'importSetup': {
        const ok = simulation.importSetup(msg.setup);
        respondOk(msg.requestId, ok);
        if (ok) markDirtyAndFlush();
        return;
      }
      case 'exportResults': {
        const payload = simulation.exportResults(msg.name);
        respondOk(msg.requestId, payload);
        if (payload?.pausedForExport) {
          markDirtyAndFlush();
        }
        return;
      }
    }
  } catch (error) {
    respondError(msg.requestId, error);
  }
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  handleRequest(event.data);
};

function loop() {
  const now = performance.now();
  const dtMs = now - lastLoopTs;
  lastLoopTs = now;

  const loopBudgetMs = Math.max(1, snapshotMinMs);
  const changed = simulation.advanceFrame(dtMs, loopBudgetMs);
  const now2 = performance.now();
  if (changed) {
    dirty = true;
    emitSnapshot(false);
  } else if (dirty && !simulation.running) {
    emitSnapshot(false);
  }
  const now3 = performance.now();

  if (PERF_LOG) {
    console.log(
      `between loops: ${dtMs.toFixed(2)}ms. advance frame: ${(now2 - now).toFixed(2)}. emit?: ${(now3 - now2).toFixed(2)}`,
    );
  }

  setTimeout(loop, simulation.running ? 0 : IDLE_LOOP_MS);
}

setTimeout(loop, LOOP_MS);
