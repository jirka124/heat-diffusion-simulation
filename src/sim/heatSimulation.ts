import {
  OUTSIDE_TARGET_ID,
  SHARED_UNIT_ID,
  createWorld,
  defaultMaterials,
  defaultUnits,
  deleteMaterial,
  stepWorld,
  type Material,
  type TempRange,
  type Unit,
  type World,
} from 'src/sim/heatWorld';

export type EndUnit = 'h' | 'd';
export type OutsideTempMode = 'constant' | 'series';

export type SimulationConfig = {
  w: number;
  h: number;
  initTemp: number;
  dt: number;
  simTicksPerSec: number;
  startDayTimeMin: number;
  endEnabled: boolean;
  endValue: number;
  endUnit: EndUnit;
  outsideTempMode: OutsideTempMode;
  outsideTempConst: number;
  outsideTempSeries: number[];
};

export type MaterialTool = 'paint' | 'pick' | 'fill';
export type UnitTool = 'assign' | 'pick' | 'fill' | 'clear';

export type RuntimeUnitRow = {
  id: string;
  name: string;
  color: string;
  kind: Unit['params']['kind'];
  schedule: { fromMin: number; toMin: number } | null;
  home: boolean | null;
  activeRange: TempRange;
  avgT: number | null;
  cells: number;
  heaters: number;
  comfortTick: number | null;
  comfortAvg: number | null;
  emitterPowerTickW: number | null;
  emitterEnergyTickJ: number | null;
  emitterEnergyTotalJ: number | null;
  emitterEnergyTotalKWh: number | null;
  heatFlows: Array<{
    targetId: string;
    targetName: string;
    tick: number;
    total: number;
  }>;
};

export type UnitResultExport = {
  id: string;
  name: string;
  avgComfortScore: number | null;
  totalEnergyProducedJ: number;
  areaCells: number;
  netHeatFlowTotalJByTarget: Record<string, number>;
};

export type SimulationResultsExport = {
  version: 1;
  name: string;
  tick: number;
  simulationLengthSec: number;
  ended: boolean;
  pausedForExport: boolean;
  totalHouseHeatingEnergyJ: number;
  units: UnitResultExport[];
};

export type ExportCell = {
  materialId: string;
  unitId: string | null;
};

export type ExportUnit = Omit<Unit, 'runtime'>;

export type ExportSimulationSetup = {
  version: 1;
  config: SimulationConfig;
  materials: Record<string, Material>;
  units: Record<string, ExportUnit>;
  cells: ExportCell[];
};

export function createDefaultSimulationConfig(): SimulationConfig {
  return {
    w: 140,
    h: 90,
    initTemp: 18,
    dt: 1,
    simTicksPerSec: 200,
    startDayTimeMin: 0,
    endEnabled: true,
    endValue: 30,
    endUnit: 'h',
    outsideTempMode: 'constant',
    outsideTempConst: 0,
    outsideTempSeries: [0, -1, -2, -2, -1, -2, -1, 0, 1, 4, 8, 10, 10, 11],
  };
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

function cloneUnitForExport(unit: Unit): ExportUnit {
  return {
    id: unit.id,
    name: unit.name,
    color: unit.color,
    params: unit.params,
  };
}

export class HeatSimulation {
  private worldRef: World | null = null;
  private cfg: SimulationConfig;
  private tickRef = 0;
  private simTimeSecRef = 0;
  private runningRef = false;
  private simAccMs = 0;

  constructor(initialConfig?: Partial<SimulationConfig>) {
    this.cfg = { ...createDefaultSimulationConfig(), ...initialConfig };
  }

  get world() {
    return this.worldRef;
  }

  get tick() {
    return this.tickRef;
  }

  get simTimeSec() {
    return this.simTimeSecRef;
  }

  get running() {
    return this.runningRef;
  }

  get locked() {
    return this.tickRef > 0;
  }

  setConfig(next: Partial<SimulationConfig>) {
    this.cfg = { ...this.cfg, ...next };
    this.syncOutsideEmitTemp();
  }

  get endSimSec(): number | null {
    if (!this.cfg.endEnabled) return null;
    const v = Number(this.cfg.endValue);
    if (!Number.isFinite(v) || v <= 0) return null;
    const mul = this.cfg.endUnit === 'd' ? 86400 : 3600;
    return v * mul;
  }

  get secOfDay() {
    const start = (this.cfg.startDayTimeMin ?? 0) * 60;
    const s = (this.simTimeSecRef + start) % 86400;
    return s < 0 ? s + 86400 : s;
  }

  get dayIndex() {
    return Math.floor(this.simTimeSecRef / 86400);
  }

  setup() {
    const w = Math.max(10, Math.min(500, Math.floor(this.cfg.w)));
    const h = Math.max(10, Math.min(500, Math.floor(this.cfg.h)));

    this.worldRef = createWorld({
      w,
      h,
      initTemp: this.cfg.initTemp,
      materials: defaultMaterials(),
      units: defaultUnits(),
      defaultMaterialId: 'air',
      defaultUnitId: null,
    });

    this.tickRef = 0;
    this.simTimeSecRef = 0;
    this.runningRef = false;
    this.simAccMs = 0;
    this.syncOutsideEmitTemp();
  }

  resetTemperatureAndTime() {
    if (!this.worldRef) return;
    for (const c of this.worldRef.cells) {
      c.T = this.cfg.initTemp;
      c.tempEmitting = false;
    }
    this.tickRef = 0;
    this.simTimeSecRef = 0;
    this.runningRef = false;
    this.simAccMs = 0;
    this.worldRef.resetOptimisation();
    this.syncOutsideEmitTemp();
  }

  toggleRun() {
    this.runningRef = !this.runningRef;
  }

  stepOnce() {
    if (!this.worldRef) return false;
    if (!this.canStep()) {
      this.enforceEndLimit();
      return false;
    }

    this.syncOutsideEmitTemp();
    stepWorld(this.worldRef, this.cfg.dt, this.secOfDay);
    this.tickRef += 1;
    this.simTimeSecRef += this.cfg.dt;
    this.enforceEndLimit();
    return true;
  }

  private getOutsideEmitTemp() {
    if (this.cfg.outsideTempMode === 'series' && this.cfg.outsideTempSeries.length > 0) {
      const idx = Math.floor(this.simTimeSecRef / 3600) % this.cfg.outsideTempSeries.length;
      return this.cfg.outsideTempSeries[idx] ?? this.cfg.outsideTempConst;
    }
    return this.cfg.outsideTempConst;
  }

  private syncOutsideEmitTemp() {
    if (!this.worldRef) return;
    const outside = this.worldRef.materials.outside;
    if (!outside) return;
    outside.emitTemp = this.getOutsideEmitTemp();
  }

  advanceFrame(frameMs: number, maxWorkMs = 10000) {
    if (!this.worldRef || !this.runningRef) return false;
    if (frameMs <= 0) return false;

    this.simAccMs += frameMs;
    const target = Math.max(1, this.cfg.simTicksPerSec);
    const stepMs = 1000 / target;
    if (this.simAccMs < stepMs) return false;

    const workBudgetMs = Math.max(0, maxWorkMs);
    const start = performance.now();

    let changed = false;
    while (this.simAccMs >= stepMs) {
      if (workBudgetMs > 0 && performance.now() - start >= workBudgetMs) break;
      const stepped = this.stepOnce();
      if (!stepped) {
        this.simAccMs = 0;
        break;
      }
      this.simAccMs -= stepMs;
      if (this.simAccMs < 0) this.simAccMs = 0;
      changed = true;
    }

    return changed;
  }

  applyMaterialTool(index: number, tool: MaterialTool, selectedMaterialId: string): string | null {
    if (!this.worldRef || this.locked) return null;
    const cells = this.worldRef.cells;
    const c = cells[index];
    if (!c) return null;

    if (tool === 'paint') {
      if (c.materialId !== selectedMaterialId) {
        c.materialId = selectedMaterialId;
        this.worldRef.resetOptimisation();
      }
      return null;
    }

    if (tool === 'pick') {
      return c.materialId;
    }

    this.floodFillMaterial(index, c.materialId, selectedMaterialId);
    return null;
  }

  applyUnitTool(index: number, tool: UnitTool, selectedUnitId: string): string | null {
    if (!this.worldRef || this.locked) return null;
    const cells = this.worldRef.cells;
    const c = cells[index];
    if (!c) return null;

    if (tool === 'assign') {
      if (c.unitId !== selectedUnitId) {
        c.unitId = selectedUnitId;
        this.worldRef.resetOptimisation();
      }
      return null;
    }

    if (tool === 'clear') {
      if (c.unitId != null) {
        c.unitId = null;
        this.worldRef.resetOptimisation();
      }
      return null;
    }

    if (tool === 'pick') {
      return c.unitId ?? SHARED_UNIT_ID;
    }

    this.floodFillUnit(index, selectedUnitId);
    return null;
  }

  upsertMaterial(material: Material) {
    if (!this.worldRef || this.locked) return false;
    this.worldRef.materials[material.id] = material;
    this.worldRef.resetOptimisation();
    return true;
  }

  removeMaterial(id: string, fallbackId = 'air') {
    if (!this.worldRef || this.locked) return false;
    if (id === 'air' || id === 'outside') return false;
    deleteMaterial(this.worldRef, id, fallbackId);
    this.worldRef.resetOptimisation();
    return true;
  }

  addUnit(unit: Unit) {
    if (!this.worldRef || this.locked) return false;
    if (this.worldRef.units[unit.id]) return false;
    if (unit.id === SHARED_UNIT_ID) return false;
    this.worldRef.units[unit.id] = unit;
    this.worldRef.resetOptimisation();
    return true;
  }

  updateUnit(unit: Unit) {
    if (!this.worldRef || this.locked) return false;
    if (!this.worldRef.units[unit.id]) return false;
    this.worldRef.units[unit.id] = unit;
    this.worldRef.resetOptimisation();
    return true;
  }

  removeUnit(id: string) {
    if (!this.worldRef || this.locked) return false;
    if (id === SHARED_UNIT_ID) return false;

    delete this.worldRef.units[id];
    for (const c of this.worldRef.cells) {
      if (c.unitId === id) c.unitId = null;
    }
    this.worldRef.resetOptimisation();
    return true;
  }

  exportSetup(): ExportSimulationSetup | null {
    if (!this.worldRef) return null;

    const config: SimulationConfig = {
      ...this.cfg,
      // World shape must match exported cell array even if user edited cfg.w/h
      // but did not press Setup yet.
      w: this.worldRef.w,
      h: this.worldRef.h,
      outsideTempSeries: [...this.cfg.outsideTempSeries],
    };

    return {
      version: 1,
      config,
      materials: Object.fromEntries(
        Object.entries(this.worldRef.materials).map(([id, m]) => [id, { ...m }]),
      ),
      units: Object.fromEntries(
        Object.entries(this.worldRef.units).map(([id, unit]) => [id, cloneUnitForExport(unit)]),
      ),
      cells: this.worldRef.cells.map((c) => ({
        materialId: c.materialId,
        unitId: c.unitId,
      })),
    };
  }

  importSetup(setup: ExportSimulationSetup) {
    if (this.locked || this.runningRef) return false;
    if (!setup || setup.version !== 1) return false;

    const nextCfg: SimulationConfig = {
      ...createDefaultSimulationConfig(),
      ...setup.config,
      outsideTempSeries: [...(setup.config?.outsideTempSeries ?? [])],
    };
    const w = Math.max(10, Math.min(500, Math.floor(nextCfg.w)));
    const h = Math.max(10, Math.min(500, Math.floor(nextCfg.h)));

    if (!setup.cells || setup.cells.length !== w * h) return false;
    if (!setup.materials?.air || !setup.materials?.outside) return false;
    if (!setup.units?.[SHARED_UNIT_ID]) return false;

    const materials: Record<string, Material> = Object.fromEntries(
      Object.entries(setup.materials).map(([id, m]) => [id, { ...m }]),
    );
    const units: Record<string, Unit> = Object.fromEntries(
      Object.entries(setup.units).map(([id, unit]) => [id, cloneUnitForExport(unit)]),
    );

    const world = createWorld({
      w,
      h,
      initTemp: nextCfg.initTemp,
      materials,
      units,
      defaultMaterialId: 'air',
      defaultUnitId: null,
    });

    for (const [i, src] of setup.cells.entries()) {
      if (!materials[src.materialId]) return false;
      if (src.unitId != null && !units[src.unitId]) return false;
      const dst = world.cells[i];
      if (!dst) return false;
      dst.materialId = src.materialId;
      dst.unitId = src.unitId;
      dst.T = nextCfg.initTemp;
      dst.tempEmitting = false;
    }

    this.cfg = nextCfg;
    this.worldRef = world;
    this.tickRef = 0;
    this.simTimeSecRef = 0;
    this.runningRef = false;
    this.simAccMs = 0;
    this.worldRef.resetOptimisation();
    this.syncOutsideEmitTemp();
    return true;
  }

  getRuntimeRows(): RuntimeUnitRow[] {
    if (!this.worldRef) return [];

    const secOfDay = this.secOfDay;
    return Object.values(this.worldRef.units)
      .slice()
      .sort((a, b) => {
        if (a.id === SHARED_UNIT_ID) return -1;
        if (b.id === SHARED_UNIT_ID) return 1;
        return a.id.localeCompare(b.id);
      })
      .map((u) => ({
        ...(() => {
          const rt = u.runtime;
          const targetIds = new Set<string>();
          if (rt) {
            Object.keys(rt.heatFlowTick).forEach((id) => targetIds.add(id));
            Object.keys(rt.heatFlowTotal).forEach((id) => targetIds.add(id));
          }

          const heatFlows = Array.from(targetIds)
            .map((targetId) => {
              const targetName =
                targetId === OUTSIDE_TARGET_ID
                  ? 'Outside'
                  : (this.worldRef?.units[targetId]?.name ?? targetId);
              return {
                targetId,
                targetName,
                tick: rt?.heatFlowTick[targetId] ?? 0,
                total: rt?.heatFlowTotal[targetId] ?? 0,
              };
            })
            .filter((x) => Math.abs(x.tick) > 1e-12 || Math.abs(x.total) > 1e-12)
            .sort((a, b) => a.targetName.localeCompare(b.targetName));

          return { heatFlows };
        })(),
        id: u.id,
        name: u.name,
        color: u.color,
        kind: u.params.kind,
        schedule:
          u.params.kind === 'unit'
            ? { fromMin: u.params.homeFromMin, toMin: u.params.homeToMin }
            : null,
        home: u.params.kind === 'unit' ? isHomeNow(u, secOfDay) : null,
        activeRange: getActiveRange(u, secOfDay),
        avgT: u.runtime ? u.runtime.avgTemp : null,
        cells: u.runtime ? u.runtime.allCells.length : 0,
        heaters: u.runtime ? u.runtime.heaterCells.length : 0,
        comfortTick: u.runtime ? u.runtime.comfortTickScore : null,
        comfortAvg: u.runtime ? u.runtime.comfortAvgScore : null,
        emitterPowerTickW: u.runtime ? u.runtime.emitterPowerTickW : null,
        emitterEnergyTickJ: u.runtime ? u.runtime.emitterEnergyTickJ : null,
        emitterEnergyTotalJ: u.runtime ? u.runtime.emitterEnergyTotalJ : null,
        emitterEnergyTotalKWh: u.runtime ? u.runtime.emitterEnergyTotalJ / 3_600_000 : null,
      }));
  }

  private canStep() {
    const lim = this.endSimSec;
    if (lim == null) return true;
    return this.simTimeSecRef < lim;
  }

  private enforceEndLimit() {
    const lim = this.endSimSec;
    if (lim == null) return;
    if (this.simTimeSecRef < lim) return;
    this.simTimeSecRef = lim;
    this.runningRef = false;
  }

  exportResults(name: string): SimulationResultsExport | null {
    if (!this.worldRef || this.tickRef <= 0) return null;

    const pausedForExport = this.runningRef;
    if (pausedForExport) {
      this.runningRef = false;
      this.simAccMs = 0;
    }

    const rows = this.getRuntimeRows();
    const units: UnitResultExport[] = rows.map((row) => {
      const netHeatFlowTotalJByTarget: Record<string, number> = {};

      for (const flow of row.heatFlows) {
        netHeatFlowTotalJByTarget[flow.targetId] = flow.total;
      }

      return {
        id: row.id,
        name: row.name,
        avgComfortScore: row.comfortAvg ?? null,
        totalEnergyProducedJ: row.emitterEnergyTotalJ ?? 0,
        areaCells: row.cells,
        netHeatFlowTotalJByTarget,
      };
    });

    return {
      version: 1,
      name: name.trim() || 'simulation-results',
      tick: this.tickRef,
      simulationLengthSec: this.simTimeSecRef,
      ended: this.endSimSec != null ? this.simTimeSecRef >= this.endSimSec : false,
      pausedForExport,
      totalHouseHeatingEnergyJ: units.reduce((sum, u) => sum + u.totalEnergyProducedJ, 0),
      units,
    };
  }

  private floodFillMaterial(startIndex: number, fromId: string, toId: string) {
    if (!this.worldRef || fromId === toId) return;

    const { w, h, cells } = this.worldRef;
    const visited = new Uint8Array(w * h);
    const stack: number[] = [startIndex];

    while (stack.length) {
      const n = stack.pop();
      if (n == null) continue;
      if (visited[n]) continue;
      visited[n] = 1;

      if (cells[n].materialId !== fromId) continue;
      cells[n].materialId = toId;

      const x = n % w;
      const y = (n / w) | 0;

      if (x > 0) stack.push(n - 1);
      if (x < w - 1) stack.push(n + 1);
      if (y > 0) stack.push(n - w);
      if (y < h - 1) stack.push(n + w);
    }

    this.worldRef.resetOptimisation();
  }

  private floodFillUnit(startIndex: number, toUnitId: string | null) {
    if (!this.worldRef) return;

    const { w, h, cells } = this.worldRef;
    const fromMat = cells[startIndex].materialId;
    const fromUnit = cells[startIndex].unitId;
    if (fromUnit === toUnitId) return;

    const visited = new Uint8Array(w * h);
    const stack: number[] = [startIndex];

    while (stack.length) {
      const n = stack.pop();
      if (n == null) continue;
      if (visited[n]) continue;
      visited[n] = 1;

      const c = cells[n];
      if (c.materialId !== fromMat) continue;
      if (c.unitId !== fromUnit) continue;

      c.unitId = toUnitId;

      const x = n % w;
      const y = (n / w) | 0;

      if (x > 0) stack.push(n - 1);
      if (x < w - 1) stack.push(n + 1);
      if (y > 0) stack.push(n - w);
      if (y < h - 1) stack.push(n + w);
    }

    this.worldRef.resetOptimisation();
  }
}
