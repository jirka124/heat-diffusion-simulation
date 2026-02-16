// src/sim/heatWorld.ts

export type Material = {
  id: string;
  name: string;

  // thermal properties (relative units are OK)
  cap: number; // heat capacity (m*c) for a cell
  k: number; // conductivity-ish -> used to form edge conductance

  // editor / infrastructure view
  color: string; // hex like "#AABBCC"

  // optional emitter: heater/AC as a "material"
  // If set, each step will relax the cell temperature toward emitTemp.
  // Positive = heating, negative (or just lower target) = cooling.
  emitTemp: number | null;
};

export type Cell = {
  T: number;
  materialId: string;
  unitId: string | null; // apartment
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
  avgTemp: number;
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

  resetOptimisation: () => void;
};

export type Vec2 = { x: number; y: number };

export const SHARED_UNIT_ID = 'SHARED';

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
    cap: 40,
    k: 1.0,
    color: '#2D3A4A',
    emitTemp: null,
  };

  const brick: Material = {
    id: 'brick',
    name: 'Brick wall',
    cap: 400,
    k: 0.25,
    color: '#7B4E2B',
    emitTemp: null,
  };

  const concrete: Material = {
    id: 'concrete',
    name: 'Concrete',
    cap: 650,
    k: 0.45,
    color: '#6E7076',
    emitTemp: null,
  };

  const insulation: Material = {
    id: 'eps',
    name: 'Insulation (EPS)',
    cap: 90,
    k: 0.03,
    color: '#D8D3A8',
    emitTemp: null,
  };

  const windowMat: Material = {
    id: 'window',
    name: 'Window',
    cap: 120,
    k: 1.6,
    color: '#7FB3D5',
    emitTemp: null,
  };

  // Heater/AC as materials (targets)
  const heater: Material = {
    id: 'heater',
    name: 'Heater',
    cap: 120,
    k: 1.2,
    color: '#C0392B',
    emitTemp: 55, // target temperature
  };

  const ac: Material = {
    id: 'ac',
    name: 'AC',
    cap: 120,
    k: 1.2,
    color: '#1F7AE0',
    emitTemp: 16,
  };

  // Outside boundary as a "material" is optional; you can just paint it on edges.
  const outside: Material = {
    id: 'outside',
    name: 'Outside',
    cap: 999999, // huge so it behaves almost fixed
    k: 1.0,
    color: '#0B1B2B',
    emitTemp: 0, // behaves like fixed outside temperature
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
    resetOptimisation() {
      this.__OPTIMISED = false;
    },
  };
}

function optimiseWorld(world: World) {
  if (world.__OPTIMISED) return;

  const units = Object.values(world.units);
  const cells = Object.values(world.cells);

  // generate runtime property of units
  for (let i = 0, len = units.length; i < len; i++) {
    const unit = units[i];
    if (!unit) continue;

    unit.runtime = {
      allCells: [],
      heaterCells: [],
      avgTemp: 0,
    };
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
      if (material?.emitTemp && material?.emitTemp > 0) {
        unit.runtime?.heaterCells.push(cellInd);
      }
    }
  }

  world.__OPTIMISED = true;
}

/**
 * One simulation step:
 * 1) diffuse energy between neighbors4 using per-edge conductance derived from materials k
 * 2) update temperature using per-cell cap
 * 3) apply material emitters (heater/AC/outside) as relaxation toward emitTemp
 */
export function stepWorld(world: World, dt: number) {
  const { w, h, cells, units, materials } = world;
  const n = w * h;

  optimiseWorld(world);

  const dQ = world._dQ;
  if (dQ.length !== n) {
    // kdybys někdy měnil rozměry bez createWorld (jinak netřeba)
    world._dQ = new Float64Array(n);
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

    // conductance between cells derived from both materials
    const g = harmonicMean(mi.k, mj.k);

    // energy transferred this step
    const q = g * (Ti - Tj) * dt;
    dQ[i] -= q;
    dQ[j] += q;
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

    const cap = Math.max(1e-9, m.cap);
    c.T += dQ[i] / cap;
  }

  // hard clamp fixed temps
  for (let i = 0; i < n; i++) {
    const c = cells[i];
    const m = materials[c.materialId];
    if (!m || m.emitTemp == null) continue;
    c.T = m.emitTemp;
  }

  // compute average temperature pre unit
  const unitsArr = Object.values(units);
  for (let i = 0, len = unitsArr.length; i < len; i++) {
    const unit = unitsArr[i];
    if (!unit?.runtime) continue;

    const n = unit.runtime.allCells.length;

    if (n === 0) {
      unit.runtime.avgTemp = 0;
      continue;
    }

    const sum = unit.runtime.allCells.reduce((total, cellInd) => {
      const cell = cells[cellInd];
      return cell ? total + cell.T : total;
    }, 0);

    unit.runtime.avgTemp = sum / n;
  }
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
