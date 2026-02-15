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

  // how strongly the cell is driven toward emitTemp per second
  // (0 = off, typical 0.5..5 depending on dt and stability you want)
  emitStrength: number;
};

export type Cell = {
  T: number;
  materialId: string;
  unitId: string | null; // apartment
};

export type World = {
  w: number;
  h: number;
  cells: Cell[];
  materials: Record<string, Material>;
  _dQ: Float64Array;
};

export type Vec2 = { x: number; y: number };

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

export function defaultMaterials(): Record<string, Material> {
  const air: Material = {
    id: 'air',
    name: 'Air',
    cap: 40,
    k: 1.0,
    color: '#2D3A4A',
    emitTemp: null,
    emitStrength: 0,
  };

  const brick: Material = {
    id: 'brick',
    name: 'Brick wall',
    cap: 400,
    k: 0.25,
    color: '#7B4E2B',
    emitTemp: null,
    emitStrength: 0,
  };

  const concrete: Material = {
    id: 'concrete',
    name: 'Concrete',
    cap: 650,
    k: 0.45,
    color: '#6E7076',
    emitTemp: null,
    emitStrength: 0,
  };

  const insulation: Material = {
    id: 'eps',
    name: 'Insulation (EPS)',
    cap: 90,
    k: 0.03,
    color: '#D8D3A8',
    emitTemp: null,
    emitStrength: 0,
  };

  const windowMat: Material = {
    id: 'window',
    name: 'Window',
    cap: 120,
    k: 1.6,
    color: '#7FB3D5',
    emitTemp: null,
    emitStrength: 0,
  };

  // Heater/AC as materials (targets)
  const heater: Material = {
    id: 'heater',
    name: 'Heater',
    cap: 120,
    k: 1.2,
    color: '#C0392B',
    emitTemp: 55, // target temperature
    emitStrength: 2.0, // drive strength
  };

  const ac: Material = {
    id: 'ac',
    name: 'AC',
    cap: 120,
    k: 1.2,
    color: '#1F7AE0',
    emitTemp: 16,
    emitStrength: 2.0,
  };

  // Outside boundary as a "material" is optional; you can just paint it on edges.
  const outside: Material = {
    id: 'outside',
    name: 'Outside',
    cap: 999999, // huge so it behaves almost fixed
    k: 1.0,
    color: '#0B1B2B',
    emitTemp: 0, // behaves like fixed outside temperature
    emitStrength: 5.0,
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
  defaultMaterialId?: string; // usually "air"
}): World {
  const materials = opts.materials ?? defaultMaterials();
  const defaultId = opts.defaultMaterialId ?? 'air';
  if (!materials[defaultId]) throw new Error(`Missing default material: ${defaultId}`);

  const n = opts.w * opts.h;
  const cells: Cell[] = new Array(n);

  for (let i = 0; i < n; i++) {
    cells[i] = {
      T: opts.initTemp,
      materialId: defaultId,
      unitId: null,
    };
  }

  return { w: opts.w, h: opts.h, cells, materials, _dQ: new Float64Array(n) };
}

/**
 * One simulation step:
 * 1) diffuse energy between neighbors4 using per-edge conductance derived from materials k
 * 2) update temperature using per-cell cap
 * 3) apply material emitters (heater/AC/outside) as relaxation toward emitTemp
 */
export function stepWorld(world: World, dt: number) {
  const { w, h, cells, materials } = world;
  const n = w * h;

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

  // apply emitters (heater / AC / outside)
  // relaxation: T += (emitTemp - T) * (1 - exp(-strength*dt))
  for (let i = 0; i < n; i++) {
    const c = cells[i];
    const m = materials[c.materialId];
    if (!m || m.emitTemp == null || m.emitStrength <= 0) continue;

    const k = 1 - Math.exp(-m.emitStrength * dt); // stable blending factor
    c.T = c.T + (m.emitTemp - c.T) * k;
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
