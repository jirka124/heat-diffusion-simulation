type StepWorldProfilePhase =
  | 'optimiseAndReset'
  | 'prepareBuffers'
  | 'conductionHorizontal'
  | 'conductionVertical'
  | 'applyDiffusion'
  | 'preEmitterControl'
  | 'applyFixedEmitters'
  | 'buildEmitterRequests'
  | 'computePowerScales'
  | 'applyUnitEmitters'
  | 'postEmitterMetrics'
  | 'postEmitterState';

type PhaseStats = {
  totalMs: number;
  maxMs: number;
};

export type StepWorldProfilingOptions = {
  enabled: boolean;
  reportEverySteps: number;
  logToConsole: boolean;
};

export type StepWorldProfilingReport = {
  steps: number;
  totalMs: number;
  avgStepMs: number;
  maxStepMs: number;
  approxTicksPerSec: number;
  avgEmitterRequests: number;
  maxEmitterRequests: number;
  phases: Record<
    StepWorldProfilePhase,
    {
      totalMs: number;
      avgMs: number;
      maxMs: number;
      sharePct: number;
    }
  >;
};

export type StepWorldPhaseTotals = Record<StepWorldProfilePhase, PhaseStats>;

const STEP_WORLD_PHASES: StepWorldProfilePhase[] = [
  'optimiseAndReset',
  'prepareBuffers',
  'conductionHorizontal',
  'conductionVertical',
  'applyDiffusion',
  'preEmitterControl',
  'applyFixedEmitters',
  'buildEmitterRequests',
  'computePowerScales',
  'applyUnitEmitters',
  'postEmitterMetrics',
  'postEmitterState',
];

// Allocates zeroed per-phase accumulator map.
function createPhaseStats(): StepWorldPhaseTotals {
  const out = {} as StepWorldPhaseTotals;
  for (let i = 0; i < STEP_WORLD_PHASES.length; i++) {
    const phase = STEP_WORLD_PHASES[i];
    if (!phase) continue;
    out[phase] = { totalMs: 0, maxMs: 0 };
  }
  return out;
}

const stepWorldProfiling = {
  options: {
    enabled: false,
    reportEverySteps: 500,
    logToConsole: true,
  } as StepWorldProfilingOptions,
  windowSteps: 0,
  windowTotalMs: 0,
  windowMaxStepMs: 0,
  windowEmitterRequestsSum: 0,
  windowEmitterRequestsMax: 0,
  windowPhases: createPhaseStats(),
  lastReport: null as StepWorldProfilingReport | null,
};

// Clears current rolling profiling window.
function resetStepWorldProfilingWindow() {
  stepWorldProfiling.windowSteps = 0;
  stepWorldProfiling.windowTotalMs = 0;
  stepWorldProfiling.windowMaxStepMs = 0;
  stepWorldProfiling.windowEmitterRequestsSum = 0;
  stepWorldProfiling.windowEmitterRequestsMax = 0;
  stepWorldProfiling.windowPhases = createPhaseStats();
}

// Updates global profiling behavior.
export function configureStepWorldProfiling(
  options: Partial<StepWorldProfilingOptions> = {},
): StepWorldProfilingOptions {
  if (typeof options.enabled === 'boolean') {
    const nextEnabled = options.enabled;
    const prevEnabled = stepWorldProfiling.options.enabled;
    stepWorldProfiling.options.enabled = nextEnabled;
    if (nextEnabled && !prevEnabled) {
      resetStepWorldProfilingWindow();
      stepWorldProfiling.lastReport = null;
    }
  }

  if (typeof options.reportEverySteps === 'number' && Number.isFinite(options.reportEverySteps)) {
    stepWorldProfiling.options.reportEverySteps = Math.max(1, Math.floor(options.reportEverySteps));
  }

  if (typeof options.logToConsole === 'boolean') {
    stepWorldProfiling.options.logToConsole = options.logToConsole;
  }

  return { ...stepWorldProfiling.options };
}

// Resets collected profiling state.
export function resetStepWorldProfiling() {
  resetStepWorldProfilingWindow();
  stepWorldProfiling.lastReport = null;
}

// Returns latest completed profiling report.
export function getStepWorldProfilingReport() {
  return stepWorldProfiling.lastReport;
}

// Builds report object from current rolling window.
function createStepWorldProfilingReport(): StepWorldProfilingReport | null {
  const steps = stepWorldProfiling.windowSteps;
  if (steps <= 0) return null;

  const totalMs = stepWorldProfiling.windowTotalMs;
  const avgStepMs = totalMs / steps;
  const approxTicksPerSec = avgStepMs > 0 ? 1000 / avgStepMs : 0;

  const phases = {} as StepWorldProfilingReport['phases'];
  for (let i = 0; i < STEP_WORLD_PHASES.length; i++) {
    const phase = STEP_WORLD_PHASES[i];
    if (!phase) continue;
    const cur = stepWorldProfiling.windowPhases[phase];
    phases[phase] = {
      totalMs: cur.totalMs,
      avgMs: cur.totalMs / steps,
      maxMs: cur.maxMs,
      sharePct: totalMs > 0 ? (cur.totalMs / totalMs) * 100 : 0,
    };
  }

  return {
    steps,
    totalMs,
    avgStepMs,
    maxStepMs: stepWorldProfiling.windowMaxStepMs,
    approxTicksPerSec,
    avgEmitterRequests: stepWorldProfiling.windowEmitterRequestsSum / steps,
    maxEmitterRequests: stepWorldProfiling.windowEmitterRequestsMax,
    phases,
  };
}

// Publishes report at configured interval and starts a fresh window.
function maybeFlushStepWorldProfilingReport() {
  const reportEverySteps = stepWorldProfiling.options.reportEverySteps;
  if (stepWorldProfiling.windowSteps < reportEverySteps) return;

  const report = createStepWorldProfilingReport();
  if (!report) return;

  stepWorldProfiling.lastReport = report;

  if (stepWorldProfiling.options.logToConsole) {
    const phaseSummary = STEP_WORLD_PHASES.map((phase) => {
      const p = report.phases[phase];
      return `${phase}=${p.avgMs.toFixed(3)}ms (${p.sharePct.toFixed(1)}%)`;
    }).join(', ');
    console.log(
      `[stepWorld profile] steps=${report.steps}, avg=${report.avgStepMs.toFixed(3)}ms, max=${report.maxStepMs.toFixed(3)}ms, approx=${report.approxTicksPerSec.toFixed(1)} tick/s, emitReq(avg/max)=${report.avgEmitterRequests.toFixed(1)}/${report.maxEmitterRequests}; ${phaseSummary}`,
    );
  }

  resetStepWorldProfilingWindow();
}

// Creates per-step phase tracker (mark function + accumulators).
export function createStepPhaseTracker() {
  const enabled = stepWorldProfiling.options.enabled;
  const stepStartMs = enabled ? performance.now() : 0;
  let phaseStartMs = stepStartMs;
  const phaseTotals = enabled ? createPhaseStats() : null;

  const markPhase = (phase: StepWorldProfilePhase) => {
    if (!phaseTotals) return;
    const now = performance.now();
    const dur = now - phaseStartMs;
    phaseStartMs = now;
    const p = phaseTotals[phase];
    p.totalMs += dur;
    if (dur > p.maxMs) p.maxMs = dur;
  };

  return { stepStartMs, phaseTotals, markPhase };
}

// Pushes one finished step to rolling window and maybe emits report.
export function flushStepProfilingWindow(
  phaseTotals: StepWorldPhaseTotals | null,
  stepStartMs: number,
  emitterRequestsCount: number,
) {
  if (!phaseTotals) return;

  const stepMs = performance.now() - stepStartMs;
  stepWorldProfiling.windowSteps += 1;
  stepWorldProfiling.windowTotalMs += stepMs;
  if (stepMs > stepWorldProfiling.windowMaxStepMs) {
    stepWorldProfiling.windowMaxStepMs = stepMs;
  }
  stepWorldProfiling.windowEmitterRequestsSum += emitterRequestsCount;
  if (emitterRequestsCount > stepWorldProfiling.windowEmitterRequestsMax) {
    stepWorldProfiling.windowEmitterRequestsMax = emitterRequestsCount;
  }

  for (let i = 0; i < STEP_WORLD_PHASES.length; i++) {
    const phase = STEP_WORLD_PHASES[i];
    if (!phase) continue;
    const src = phaseTotals[phase];
    const dst = stepWorldProfiling.windowPhases[phase];
    dst.totalMs += src.totalMs;
    if (src.maxMs > dst.maxMs) dst.maxMs = src.maxMs;
  }

  maybeFlushStepWorldProfilingReport();
}
