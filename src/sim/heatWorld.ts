// src/sim/heatWorld.ts

export type Cell = {
  T: number; // temperature
  cap: number; // heat capacity (m*c) - bigger => slower change
};

export type World = {
  w: number;
  h: number;
  cells: Cell[];

  // boundary conditions:
  // fixedMask[i] = true -> keep T fixed to fixedTemp[i]
  fixedMask: boolean[];
  fixedTemp: Float64Array;

  // adjacency in grid is implicit (neighbors4),
  // but we keep conductance per cell edge as a single scalar for MVP
  g: number; // conductance
};

export type BoundaryTemps = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

function idx(x: number, y: number, w: number) {
  return y * w + x;
}

export function createWorld(opts: {
  w: number;
  h: number;
  initTemp: number;
  cap: number;
  g: number;
  boundary: BoundaryTemps;
}): World {
  const { w, h, initTemp, cap, g, boundary } = opts;

  const n = w * h;
  const cells: Cell[] = new Array(n);
  const fixedMask: boolean[] = new Array(n).fill(false);
  const fixedTemp = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    cells[i] = { T: initTemp, cap };
    fixedTemp[i] = initTemp;
  }

  // Mark boundaries as fixed (like NetLogo set-edge-temperatures)
  // left/right edges
  for (let y = 0; y < h; y++) {
    const iL = idx(0, y, w);
    fixedMask[iL] = true;
    fixedTemp[iL] = boundary.left;

    const iR = idx(w - 1, y, w);
    fixedMask[iR] = true;
    fixedTemp[iR] = boundary.right;
  }

  // top/bottom edges
  for (let x = 0; x < w; x++) {
    const iT = idx(x, 0, w);
    fixedMask[iT] = true;
    fixedTemp[iT] = boundary.top;

    const iB = idx(x, h - 1, w);
    fixedMask[iB] = true;
    fixedTemp[iB] = boundary.bottom;
  }

  // corners: average like NetLogo (optional but nice)
  fixedTemp[idx(0, 0, w)] = 0.5 * (boundary.left + boundary.top);
  fixedTemp[idx(w - 1, 0, w)] = 0.5 * (boundary.right + boundary.top);
  fixedTemp[idx(0, h - 1, w)] = 0.5 * (boundary.left + boundary.bottom);
  fixedTemp[idx(w - 1, h - 1, w)] = 0.5 * (boundary.right + boundary.bottom);

  // enforce fixed temps immediately
  for (let i = 0; i < n; i++) {
    if (fixedMask[i]) cells[i].T = fixedTemp[i];
  }

  return { w, h, cells, fixedMask, fixedTemp, g };
}

/**
 * One explicit diffusion step using energy flow between neighbors4.
 * dt: time step
 *
 * Update rule:
 * q = g * (Ti - Tj) * dt
 * dQ[i] -= q; dQ[j] += q
 * Ti += dQ[i] / cap_i
 */
export function stepWorld(world: World, dt: number) {
  const { w, h, cells, fixedMask, fixedTemp, g } = world;
  const n = w * h;

  const dQ = new Float64Array(n);

  // helper to process an undirected edge once (i <-> j)
  const flow = (i: number, j: number) => {
    const Ti = cells[i].T;
    const Tj = cells[j].T;
    const q = g * (Ti - Tj) * dt;
    dQ[i] -= q;
    dQ[j] += q;
  };

  // iterate grid edges once:
  // horizontal neighbors (x -> x+1)
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w - 1; x++) {
      const i = row + x;
      flow(i, i + 1);
    }
  }

  // vertical neighbors (y -> y+1)
  for (let y = 0; y < h - 1; y++) {
    const row = y * w;
    const rowBelow = (y + 1) * w;
    for (let x = 0; x < w; x++) {
      const i = row + x;
      flow(i, rowBelow + x);
    }
  }

  // apply temperature updates
  for (let i = 0; i < n; i++) {
    if (fixedMask[i]) continue;
    cells[i].T += dQ[i] / cells[i].cap;
  }

  // enforce boundary temps
  for (let i = 0; i < n; i++) {
    if (fixedMask[i]) cells[i].T = fixedTemp[i];
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
