export type Material = {
  id: string;
  name: string;

  // Thermal properties in SI:
  // rho: density [kg/m^3]
  // cp: specific heat capacity [J/(kg*K)]
  // lambda: thermal conductivity [W/(m*K)]
  rho: number;
  cp: number;
  lambda: number;

  // Editor / infrastructure color (hex like "#AABBCC").
  color: string;

  // Optional emitter (heater/AC as material).
  // If set, cell may be actively driven toward emitTemp.
  emitTemp: number | null;
  // Electric power draw while emitter is active [W = J/s].
  emitPowerW: number | null;
};

export type Cell = {
  T: number;
  materialId: string;
  unitId: string | null;
  // Per-cell runtime switch for material emitters.
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

export type UnitZoneRuntime = {
  allCells: number[];
  heaterCells: number[];
  // Total heat capacity of all zone cells [J/K].
  totalCapJPerK: number;
  avgTemp: number;
};

export type UnitRuntime = {
  allCells: number[];
  heaterCells: number[];
  // Total heat capacity of non-emitter cells in this unit [J/K].
  totalCapJPerK: number;
  avgTemp: number;
  comfyRange: TempRange;
  // Connected components inside this unit (no cross-unit bridging).
  zones: UnitZoneRuntime[];
  // cellIndex -> zone index in `zones`.
  zoneIndexByCell: Record<number, number>;
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

  // SoA cache: current temperature per cell [C], indexed by cell index.
  _tempByCell: Float64Array;
  // SoA cache: unit assignment per cell (null = no unit), indexed by cell index.
  _unitIdByCell: (string | null)[];
  // SoA cache: accumulated heat delta for current step [J] per cell.
  _dQ: Float64Array;
  // SoA cache: cell heat capacity [J/K] per cell (PerK = "per kelvin").
  _cellCapJPerK: Float64Array;
  // SoA cache: conductance between i and i+1 neighbors [W/K] (right edge per cell).
  _edgeConductanceRightWPerK: Float64Array;
  // SoA cache: conductance between i and i+w neighbors [W/K] (down edge per cell).
  _edgeConductanceDownWPerK: Float64Array;
  // Index list of emitter cells controlled by unit comfort logic.
  _unitEmitterCells: number[];
  // Index list of emitters not attached to valid units (infrastructure emitters).
  _fixedEmitterCells: number[];
  // Emit temperatures paired with _fixedEmitterCells [C].
  _fixedEmitterEmitTemp: number[];
  // Flattened directional boundary map: [cellIndex * 4 + dir], dir: 0=L,1=R,2=U,3=D.
  _boundaryTargetByDir: (string | null)[];

  // Marks cached SoA structures as stale after topology/material changes.
  resetOptimisation: () => void;
};

export type Vec2 = { x: number; y: number };

export const SHARED_UNIT_ID = 'SHARED';
export const OUTSIDE_TARGET_ID = 'OUTSIDE';
