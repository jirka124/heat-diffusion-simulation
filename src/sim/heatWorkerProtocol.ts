import type {
  Cell,
  Material,
  Unit,
} from 'src/sim/heatWorld';
import type {
  ExportSimulationSetup,
  MaterialTool,
  RuntimeUnitRow,
  SimulationConfig,
  UnitTool,
} from 'src/sim/heatSimulation';

export type HeatWorldSnapshot = {
  w: number;
  h: number;
  cells: Cell[];
  materials: Record<string, Material>;
  units: Record<string, Unit>;
};

export type SimulationSnapshot = {
  world: HeatWorldSnapshot | null;
  tick: number;
  simTimeSec: number;
  running: boolean;
  runtimeRows: RuntimeUnitRow[];
};

export type WorkerRequest =
  | {
      requestId: number;
      type: 'init';
      config: Partial<SimulationConfig>;
    }
  | {
      requestId: number;
      type: 'setConfig';
      config: Partial<SimulationConfig>;
    }
  | {
      requestId: number;
      type: 'setup';
    }
  | {
      requestId: number;
      type: 'resetTemperatureAndTime';
    }
  | {
      requestId: number;
      type: 'toggleRun';
    }
  | {
      requestId: number;
      type: 'stepOnce';
    }
  | {
      requestId: number;
      type: 'applyMaterialTool';
      index: number;
      tool: MaterialTool;
      selectedMaterialId: string;
    }
  | {
      requestId: number;
      type: 'applyUnitTool';
      index: number;
      tool: UnitTool;
      selectedUnitId: string;
    }
  | {
      requestId: number;
      type: 'upsertMaterial';
      material: Material;
    }
  | {
      requestId: number;
      type: 'removeMaterial';
      id: string;
      fallbackId?: string;
    }
  | {
      requestId: number;
      type: 'addUnit';
      unit: Unit;
    }
  | {
      requestId: number;
      type: 'updateUnit';
      unit: Unit;
    }
  | {
      requestId: number;
      type: 'removeUnit';
      id: string;
    }
  | {
      requestId: number;
      type: 'exportSetup';
    }
  | {
      requestId: number;
      type: 'importSetup';
      setup: ExportSimulationSetup;
    }
  | {
      requestId: number;
      type: 'exportResults';
      name: string;
    };

export type WorkerResponse =
  | {
      type: 'snapshot';
      snapshot: SimulationSnapshot;
    }
  | {
      type: 'ok';
      requestId: number;
      value?: unknown;
    }
  | {
      type: 'error';
      requestId: number;
      message: string;
    };
