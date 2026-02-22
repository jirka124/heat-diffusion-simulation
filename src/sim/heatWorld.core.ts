import { defaultMaterials, defaultUnits } from 'src/sim/heatWorld.defaults';
import type { Cell, Material, Unit, Vec2, World } from 'src/sim/heatWorld.types';

// Converts x/y to flat cell index.
export function xyToN(pos: Vec2, w: number) {
  return pos.y * w + pos.x;
}

// Converts flat cell index to x/y.
export function nToXy(n: number, w: number): Vec2 {
  return { x: n % w, y: Math.floor(n / w) };
}

// Returns true when point is inside simulation grid bounds.
export function inBounds(pos: Vec2, w: number, h: number) {
  return pos.x >= 0 && pos.x < w && pos.y >= 0 && pos.y < h;
}

// Grid cell edge length in meters.
export const CELL_SIZE_M = 0.25;
// Effective slab depth in meters used to convert 2D grid to 3D volume.
export const SLAB_DEPTH_M = 2.7;

// Allocates and initializes a simulation world with optional custom presets.
export function createWorld(opts: {
  w: number;
  h: number;
  initTemp: number;
  materials?: Record<string, Material>;
  units?: Record<string, Unit>;
  defaultMaterialId?: string;
  defaultUnitId?: string | null;
}): World {
  const materials = opts.materials ?? defaultMaterials();
  const defaultMaterialId = opts.defaultMaterialId ?? 'air';
  if (!materials[defaultMaterialId]) {
    throw new Error(`Missing default material: ${defaultMaterialId}`);
  }

  const units = opts.units ?? defaultUnits();
  const defaultUnitId = opts.defaultUnitId ?? null;
  if (defaultUnitId !== null && !units[defaultUnitId]) {
    throw new Error(`Missing default unit: ${defaultUnitId}`);
  }

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
    _tempByCell: new Float64Array(n),
    _unitIdByCell: new Array(n).fill(null),
    _dQ: new Float64Array(n),
    _cellCapJPerK: new Float64Array(n),
    _edgeConductanceRightWPerK: new Float64Array(n),
    _edgeConductanceDownWPerK: new Float64Array(n),
    _unitEmitterCells: [],
    _fixedEmitterCells: [],
    _fixedEmitterEmitTemp: [],
    _boundaryTargetByDir: new Array(n * 4).fill(null),
    resetOptimisation() {
      this.__OPTIMISED = false;
    },
  };
}
