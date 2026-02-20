import type { Material, Unit } from 'src/sim/heatWorld';
import type {
  MaterialTool,
  SimulationConfig,
  UnitTool,
} from 'src/sim/heatSimulation';
import type {
  SimulationSnapshot,
  WorkerRequest,
  WorkerResponse,
} from 'src/sim/heatWorkerProtocol';

type WorkerRequestBody = WorkerRequest extends infer Request
  ? Request extends { requestId: number }
    ? Omit<Request, 'requestId'>
    : never
  : never;

type PendingResolver = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
};

export class HeatSimulationWorkerClient {
  private worker: Worker;
  private nextRequestId = 1;
  private pending = new Map<number, PendingResolver>();

  constructor(onSnapshot: (snapshot: SimulationSnapshot) => void) {
    this.worker = new Worker(new URL('./heatSimulation.worker.ts', import.meta.url), {
      type: 'module',
    });

    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data;
      if (msg.type === 'snapshot') {
        onSnapshot(msg.snapshot);
        return;
      }

      const entry = this.pending.get(msg.requestId);
      if (!entry) return;
      this.pending.delete(msg.requestId);

      if (msg.type === 'ok') {
        entry.resolve(msg.value);
      } else {
        entry.reject(new Error(msg.message));
      }
    };
  }

  private request<T>(message: WorkerRequest): Promise<T> {
    const { requestId } = message;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(requestId, {
        resolve: (value: unknown) => resolve(value as T),
        reject,
      });
      this.worker.postMessage(message);
    });
  }

  private withRequestId(message: WorkerRequestBody): Promise<unknown> {
    const requestId = this.nextRequestId++;
    return this.request({
      requestId,
      ...message,
    } as WorkerRequest);
  }

  init(config: Partial<SimulationConfig>) {
    return this.withRequestId({ type: 'init', config }) as Promise<boolean>;
  }

  setConfig(config: Partial<SimulationConfig>) {
    return this.withRequestId({ type: 'setConfig', config }) as Promise<boolean>;
  }

  setup() {
    return this.withRequestId({ type: 'setup' }) as Promise<boolean>;
  }

  resetTemperatureAndTime() {
    return this.withRequestId({ type: 'resetTemperatureAndTime' }) as Promise<boolean>;
  }

  toggleRun() {
    return this.withRequestId({ type: 'toggleRun' }) as Promise<boolean>;
  }

  stepOnce() {
    return this.withRequestId({ type: 'stepOnce' }) as Promise<boolean>;
  }

  applyMaterialTool(index: number, tool: MaterialTool, selectedMaterialId: string) {
    return this.withRequestId({
      type: 'applyMaterialTool',
      index,
      tool,
      selectedMaterialId,
    }) as Promise<string | null>;
  }

  applyUnitTool(index: number, tool: UnitTool, selectedUnitId: string) {
    return this.withRequestId({
      type: 'applyUnitTool',
      index,
      tool,
      selectedUnitId,
    }) as Promise<string | null>;
  }

  upsertMaterial(material: Material) {
    return this.withRequestId({ type: 'upsertMaterial', material }) as Promise<boolean>;
  }

  removeMaterial(id: string, fallbackId = 'air') {
    return this.withRequestId({ type: 'removeMaterial', id, fallbackId }) as Promise<boolean>;
  }

  addUnit(unit: Unit) {
    return this.withRequestId({ type: 'addUnit', unit }) as Promise<boolean>;
  }

  updateUnit(unit: Unit) {
    return this.withRequestId({ type: 'updateUnit', unit }) as Promise<boolean>;
  }

  removeUnit(id: string) {
    return this.withRequestId({ type: 'removeUnit', id }) as Promise<boolean>;
  }

  terminate() {
    this.worker.terminate();

    for (const entry of this.pending.values()) {
      entry.reject(new Error('Worker terminated'));
    }
    this.pending.clear();
  }
}
