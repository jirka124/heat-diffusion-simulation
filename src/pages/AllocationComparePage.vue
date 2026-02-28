<template>
  <q-page class="q-pa-md">
    <div class="row q-col-gutter-md">
      <div class="col-12">
        <q-card>
          <q-card-section class="row items-center justify-between q-col-gutter-sm">
            <div class="col">
              <div class="text-h6">Allocation Comparison</div>
              <div class="text-caption text-grey-7">
                Compare multiple exported allocation results side-by-side.
              </div>
            </div>
            <div class="col-auto row q-gutter-sm">
              <q-btn unelevated color="primary" label="Import files" @click="openImportDialog" />
              <q-btn
                flat
                color="negative"
                label="Clear all"
                :disable="experiments.length === 0"
                @click="clearAll"
              />
            </div>
          </q-card-section>
          <q-separator />
          <q-card-section class="text-caption text-grey-7">
            <b>How to read:</b> each imported file is one source experiment (E1, E2, ...). For
            combined exports, the page creates one row per method (Fair/Practice).
          </q-card-section>
          <input
            ref="importInputEl"
            type="file"
            accept=".json,application/json"
            multiple
            style="display: none"
            @change="onFilesSelected"
          />
        </q-card>
      </div>

      <div class="col-12" v-if="experiments.length > 0">
        <q-card>
          <q-card-section class="row items-center justify-between q-col-gutter-md">
            <div class="col">
              <div class="text-subtitle1">Experiments</div>
            </div>
            <div class="col-auto" style="min-width: 300px; width: 100%; max-width: 420px">
              <q-btn-toggle
                v-model="metricMode"
                spread
                unelevated
                :options="[
                  { label: 'Cost', value: 'cost' },
                  { label: 'Share', value: 'share' },
                  { label: 'Comfort', value: 'comfort' },
                  { label: 'Pay happiness', value: 'happiness' },
                ]"
              />
            </div>
          </q-card-section>
          <q-separator />
          <q-card-section>
            <div class="row q-col-gutter-sm">
              <div v-for="exp in experiments" :key="exp.id" class="col-12 col-md-6 col-lg-4">
                <q-card flat bordered class="experiment-card">
                  <q-card-section class="q-pa-sm">
                    <div class="row items-center justify-between no-wrap">
                      <div class="row items-center no-wrap">
                        <q-badge :style="{ background: exp.color }" class="q-mr-sm">
                          {{ exp.label }}
                        </q-badge>
                        <div class="text-weight-medium ellipsis">{{ exp.payload.name }}</div>
                      </div>
                      <q-btn
                        flat
                        dense
                        color="negative"
                        icon="delete"
                        @click="removeExperiment(exp.id)"
                      />
                    </div>
                    <div class="text-caption q-mt-xs">
                      Source: <b>{{ exp.sourceLabel }}</b> | Method: <b>{{ exp.methodLabel }}</b>
                    </div>
                    <div class="text-caption text-grey-7 q-mt-xs ellipsis">{{ exp.fileName }}</div>
                    <div class="text-caption q-mt-sm">
                      Units: <b>{{ exp.payload.units.length }}</b> |
                      Total cost: <b>{{ formatNumber(exp.payload.effectiveTotalCost ?? 0) }}</b>
                    </div>
                  </q-card-section>
                </q-card>
              </div>
            </div>
          </q-card-section>
        </q-card>
      </div>

      <div class="col-12" v-if="experiments.length > 0">
        <q-card>
          <q-card-section>
            <div class="text-subtitle1">Summary Ranking</div>
          </q-card-section>
          <q-separator />
          <q-card-section>
            <q-markup-table dense flat bordered>
              <thead>
                <tr>
                  <th class="text-left">Experiment</th>
                  <th class="text-left">Source</th>
                  <th class="text-left">Method</th>
                  <th class="text-left">Name</th>
                  <th class="text-right">Units</th>
                  <th class="text-right">Total cost</th>
                  <th class="text-right">Avg comfort</th>
                  <th class="text-right">Avg pay happiness</th>
                  <th class="text-right">Min pay happiness</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="exp in rankedExperiments" :key="`rank-${exp.id}`">
                  <td>
                    <q-badge :style="{ background: exp.color }">{{ exp.label }}</q-badge>
                  </td>
                  <td>{{ exp.sourceLabel }}</td>
                  <td>{{ exp.methodLabel }}</td>
                  <td>{{ exp.payload.name }}</td>
                  <td class="text-right">{{ exp.payload.units.length }}</td>
                  <td class="text-right">{{ formatNumber(exp.payload.effectiveTotalCost ?? 0) }}</td>
                  <td class="text-right">{{ formatMaybe(avgComfort(exp.payload.units)) }}</td>
                  <td class="text-right">{{ formatNumber(avgHappiness(exp.payload.units)) }}</td>
                  <td class="text-right">{{ formatNumber(minHappiness(exp.payload.units)) }}</td>
                </tr>
              </tbody>
            </q-markup-table>
          </q-card-section>
        </q-card>
      </div>

      <div class="col-12" v-if="experiments.length > 0">
        <q-card>
          <q-card-section>
            <div class="text-subtitle1">
              Per-Unit Comparison (metric:
              <b>{{ metricLabelTitle }}</b
              >)
            </div>
            <div class="text-caption text-grey-7">
              Rows are experiments (E1, E2, ...). Columns are units. Bar width is normalized per
              unit column.
            </div>
          </q-card-section>
          <q-separator />
          <q-card-section>
            <div class="table-wrap">
              <q-markup-table dense flat bordered>
                <thead>
                  <tr>
                  <th class="text-left">Experiment</th>
                  <th class="text-left">Method</th>
                  <th class="text-left">Name</th>
                  <th v-for="unitId in allUnitIds" :key="`head-${unitId}`" class="text-right">
                    {{ unitNameById(unitId) }} ({{ unitId }})
                  </th>
                </tr>
                </thead>
                <tbody>
                  <tr v-for="exp in experiments" :key="`detail-${exp.id}`">
                    <td>
                      <q-badge :style="{ background: exp.color }">{{ exp.label }}</q-badge>
                    </td>
                    <td>{{ exp.methodLabel }}</td>
                    <td>{{ exp.payload.name }}</td>
                    <td
                      v-for="unitId in allUnitIds"
                      :key="`cell-${exp.id}-${unitId}`"
                      class="text-right"
                    >
                      <template v-if="unitMetric(exp.payload.units, unitId) != null">
                        <div>{{ metricValueLabel(unitMetric(exp.payload.units, unitId) ?? 0) }}</div>
                        <div class="bar-track q-mt-xs">
                          <div
                            class="bar-fill"
                            :style="{
                              width: `${barWidthForUnit(unitId, unitMetric(exp.payload.units, unitId) ?? 0)}%`,
                            }"
                          />
                        </div>
                      </template>
                      <template v-else>-</template>
                    </td>
                  </tr>
                </tbody>
              </q-markup-table>
            </div>
          </q-card-section>
        </q-card>
      </div>

      <div class="col-12" v-else>
        <q-card>
          <q-card-section>
            <div class="empty-state">Import at least one allocation export to start comparison.</div>
          </q-card-section>
        </q-card>
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

type AllocationUnitExport = {
  id: string;
  name: string;
  share: number;
  cost: number;
  comfortScore: number | null;
  paymentHappinessScore: number;
};

type SimulationResultsLike = {
  version: number;
  name: string;
  totalHouseHeatingEnergyJ: number;
  units: unknown[];
};

type AllocationExport = {
  version: 1;
  name: string;
  generatedAt?: string;
  effectiveTotalCost: number | null;
  units: AllocationUnitExport[];
};

type AllocationMethodId = 'fair' | 'practical' | 'unknown';

type AllocationMethodExport = {
  algorithm: AllocationMethodId;
  label?: string;
  practicalBaseShareRatio?: number | null;
  units: AllocationUnitExport[];
};

type AllocationBundleExport = {
  version: 2;
  name: string;
  generatedAt?: string;
  effectiveTotalCost: number | null;
  methods: {
    fair?: AllocationMethodExport;
    practical?: AllocationMethodExport;
  };
};

type LoadedExperiment = {
  id: string;
  fileName: string;
  payload: AllocationExport;
  label: string;
  color: string;
  sourceLabel: string;
  methodLabel: string;
  algorithm: AllocationMethodId;
};

type MetricMode = 'cost' | 'share' | 'comfort' | 'happiness';

const COLORS = ['#1e88e5', '#43a047', '#fb8c00', '#8e24aa', '#00897b', '#e53935', '#6d4c41'];

const importInputEl = ref<HTMLInputElement | null>(null);
const experiments = ref<LoadedExperiment[]>([]);
const metricMode = ref<MetricMode>('cost');

function formatNumber(v: number) {
  return new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 4 }).format(v);
}

function formatMaybe(v: number | null) {
  return v == null ? '-' : formatNumber(v);
}

function avgComfort(units: AllocationUnitExport[]) {
  const vals = units
    .map((u) => u.comfortScore)
    .filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
  if (vals.length === 0) return null;
  return vals.reduce((s, x) => s + x, 0) / vals.length;
}

function avgHappiness(units: AllocationUnitExport[]) {
  if (units.length === 0) return 0;
  return units.reduce(
    (s, u) => s + (Number.isFinite(u.paymentHappinessScore) ? u.paymentHappinessScore : 0),
    0,
  ) / units.length;
}

function minHappiness(units: AllocationUnitExport[]) {
  if (units.length === 0) return 0;
  return units.reduce(
    (min, u) =>
      Math.min(min, Number.isFinite(u.paymentHappinessScore) ? u.paymentHappinessScore : 0),
    Number.POSITIVE_INFINITY,
  );
}

function isAllocationExport(raw: unknown): raw is AllocationExport {
  if (!raw || typeof raw !== 'object') return false;
  const x = raw as Record<string, unknown>;
  if (x.version !== 1) return false;
  if (typeof x.name !== 'string') return false;
  if (!(typeof x.effectiveTotalCost === 'number' || x.effectiveTotalCost === null)) return false;
  if (!Array.isArray(x.units)) return false;

  return x.units.every((u) => {
    if (!u || typeof u !== 'object') return false;
    const uu = u as Record<string, unknown>;
    return (
      typeof uu.id === 'string' &&
      typeof uu.name === 'string' &&
      typeof uu.share === 'number' &&
      typeof uu.cost === 'number' &&
      (typeof uu.comfortScore === 'number' || uu.comfortScore === null) &&
      typeof uu.paymentHappinessScore === 'number'
    );
  });
}

function isSimulationResultsLike(raw: unknown): raw is SimulationResultsLike {
  if (!raw || typeof raw !== 'object') return false;
  const x = raw as Record<string, unknown>;
  if (x.version !== 1) return false;
  if (typeof x.name !== 'string') return false;
  if (typeof x.totalHouseHeatingEnergyJ !== 'number') return false;
  if (!Array.isArray(x.units)) return false;
  return true;
}

function isAllocationMethodExport(raw: unknown): raw is AllocationMethodExport {
  if (!raw || typeof raw !== 'object') return false;
  const x = raw as Record<string, unknown>;
  if (!Array.isArray(x.units)) return false;
  if (x.algorithm != null && typeof x.algorithm !== 'string') return false;

  return x.units.every((u) => {
    if (!u || typeof u !== 'object') return false;
    const uu = u as Record<string, unknown>;
    return (
      typeof uu.id === 'string' &&
      typeof uu.name === 'string' &&
      typeof uu.share === 'number' &&
      typeof uu.cost === 'number' &&
      (typeof uu.comfortScore === 'number' || uu.comfortScore === null) &&
      typeof uu.paymentHappinessScore === 'number'
    );
  });
}

function isAllocationBundleExport(raw: unknown): raw is AllocationBundleExport {
  if (!raw || typeof raw !== 'object') return false;
  const x = raw as Record<string, unknown>;
  if (x.version !== 2) return false;
  if (typeof x.name !== 'string') return false;
  if (!(typeof x.effectiveTotalCost === 'number' || x.effectiveTotalCost === null)) return false;
  if (!x.methods || typeof x.methods !== 'object') return false;

  const methods = x.methods as Record<string, unknown>;
  const fair = methods.fair;
  const practical = methods.practical;
  if (!fair && !practical) return false;
  if (fair && !isAllocationMethodExport(fair)) return false;
  if (practical && !isAllocationMethodExport(practical)) return false;
  return true;
}

function methodLabelFor(id: AllocationMethodId) {
  if (id === 'fair') return 'Fair';
  if (id === 'practical') return 'Practice';
  return 'Unknown';
}

function normalizeAllocationPayloads(raw: unknown): Array<{
  payload: AllocationExport;
  algorithm: AllocationMethodId;
  methodLabel: string;
}> {
  if (isAllocationExport(raw)) {
    return [
      {
        payload: raw,
        algorithm: 'unknown',
        methodLabel: 'Legacy',
      },
    ];
  }

  if (isAllocationBundleExport(raw)) {
    const out: Array<{
      payload: AllocationExport;
      algorithm: AllocationMethodId;
      methodLabel: string;
    }> = [];

    const entries: Array<[AllocationMethodId, AllocationMethodExport | undefined]> = [
      ['fair', raw.methods.fair],
      ['practical', raw.methods.practical],
    ];

    for (const [algorithm, method] of entries) {
      if (!method) continue;
      const label = method.label?.trim() || methodLabelFor(algorithm);
      out.push({
        payload: {
          version: 1,
          name: `${raw.name} [${label}]`,
          effectiveTotalCost: raw.effectiveTotalCost,
          units: method.units,
          ...(typeof raw.generatedAt === 'string' ? { generatedAt: raw.generatedAt } : {}),
        },
        algorithm,
        methodLabel: methodLabelFor(algorithm),
      });
    }
    return out;
  }

  return [];
}

function extractAllocationPayloadCandidate(parsed: unknown) {
  if (!parsed || typeof parsed !== 'object') return parsed;
  const x = parsed as Record<string, unknown>;

  const directCandidates = [
    x.allocation,
    x.allocationExport,
    x.costAllocation,
    x.costAllocationExport,
    x.payload,
    parsed,
  ];
  for (const candidate of directCandidates) {
    if (candidate && typeof candidate === 'object') return candidate;
  }
  return parsed;
}

function unitValue(units: AllocationUnitExport[], unitId: string) {
  return units.find((u) => u.id === unitId) ?? null;
}

function metricForUnit(u: AllocationUnitExport) {
  if (metricMode.value === 'cost') return u.cost;
  if (metricMode.value === 'share') return u.share * 100;
  if (metricMode.value === 'comfort') return u.comfortScore ?? 0;
  return u.paymentHappinessScore;
}

function unitMetric(units: AllocationUnitExport[], unitId: string) {
  const u = unitValue(units, unitId);
  return u ? metricForUnit(u) : null;
}

const metricLabelTitle = computed(() => {
  if (metricMode.value === 'cost') return 'Cost';
  if (metricMode.value === 'share') return 'Share';
  if (metricMode.value === 'comfort') return 'Comfort';
  return 'Pay happiness';
});

function metricValueLabel(value: number) {
  if (metricMode.value === 'share') return `${value.toFixed(2)} %`;
  return formatNumber(value);
}

const allUnitIds = computed(() => {
  const set = new Set<string>();
  for (const exp of experiments.value) {
    for (const u of exp.payload.units) set.add(u.id);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
});

function unitNameById(unitId: string) {
  for (const exp of experiments.value) {
    const u = unitValue(exp.payload.units, unitId);
    if (u) return u.name;
  }
  return unitId;
}

const unitMetricMax = computed(() => {
  const map: Record<string, number> = {};
  for (const unitId of allUnitIds.value) {
    let max = 0;
    for (const exp of experiments.value) {
      const v = unitMetric(exp.payload.units, unitId);
      if (v != null) max = Math.max(max, v);
    }
    map[unitId] = max > 0 ? max : 1;
  }
  return map;
});

function barWidthForUnit(unitId: string, value: number) {
  const max = unitMetricMax.value[unitId] ?? 1;
  return Math.max(0, Math.min(100, (value / max) * 100));
}

const rankedExperiments = computed(() =>
  [...experiments.value].sort(
    (a, b) =>
      avgHappiness(b.payload.units) - avgHappiness(a.payload.units) ||
      minHappiness(b.payload.units) - minHappiness(a.payload.units),
  ),
);

function openImportDialog() {
  importInputEl.value?.click();
}

function clearImportInput() {
  if (importInputEl.value) importInputEl.value.value = '';
}

async function onFilesSelected(evt: Event) {
  const input = evt.target as HTMLInputElement | null;
  const files = input?.files;
  if (!files || files.length === 0) return;

  const next: LoadedExperiment[] = [];
  let sourceOffset = experiments.value.length;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!file) continue;
    try {
      const text = await file.text();
      const parsed: unknown = JSON.parse(text);
      const payloadRaw = extractAllocationPayloadCandidate(parsed);

      if (isSimulationResultsLike(payloadRaw)) {
        throw new Error('simulation-results');
      }
      const normalized = normalizeAllocationPayloads(payloadRaw);
      if (normalized.length === 0) throw new Error('Invalid allocation export format');

      const sourceLabel = `E${sourceOffset + 1}`;
      for (const part of normalized) {
        const index = experiments.value.length + next.length;
        next.push({
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          fileName: file.name,
          payload: part.payload,
          label: `R${index + 1}`,
          color: COLORS[index % COLORS.length] ?? '#607d8b',
          sourceLabel,
          methodLabel: part.methodLabel,
          algorithm: part.algorithm,
        });
      }
      sourceOffset++;
    } catch (err) {
      const message =
        err instanceof Error && err.message === 'simulation-results'
          ? `Could not import file: ${file.name}\nThis is a simulation results export. Import it in Cost Allocation page first, then export allocation JSON and import that here.`
          : `Could not import file: ${file.name}`;
      window.alert(message);
    }
  }

  experiments.value = [...experiments.value, ...next];
  clearImportInput();
}

function removeExperiment(id: string) {
  experiments.value = experiments.value.filter((x) => x.id !== id);
  experiments.value = experiments.value.map((x, i) => ({
    ...x,
    label: `R${i + 1}`,
    color: COLORS[i % COLORS.length] ?? '#607d8b',
  }));
}

function clearAll() {
  experiments.value = [];
}
</script>

<style scoped>
.empty-state {
  min-height: 140px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.72);
}

.experiment-card {
  height: 100%;
}

.table-wrap {
  overflow: auto;
}

.bar-track {
  height: 7px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #26a69a, #66bb6a);
}
</style>
