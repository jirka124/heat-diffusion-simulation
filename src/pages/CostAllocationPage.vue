<template>
  <q-page class="q-pa-md">
    <div class="row q-col-gutter-md">
      <div class="col-12 col-lg-6">
        <q-card>
          <q-card-section>
            <div class="text-h6">Cost Allocation Input</div>
            <div class="text-caption text-grey-7">
              Import simulation results and define pricing inputs.
            </div>
          </q-card-section>

          <q-separator />

          <q-card-section class="q-gutter-md">
            <div>
              <q-btn
                unelevated
                color="primary"
                label="Import results JSON"
                @click="openImportDialog"
              />
              <input
                ref="importInputEl"
                type="file"
                accept=".json,application/json"
                style="display: none"
                @change="onResultsFileSelected"
              />
              <div class="text-caption text-grey-7 q-mt-xs">
                {{ importedFileName ? `Loaded file: ${importedFileName}` : 'No file loaded yet.' }}
              </div>
            </div>

            <q-separator />

            <div class="text-subtitle2">Pricing</div>
            <q-btn-toggle
              v-model="pricingMode"
              spread
              unelevated
              :options="[
                { label: 'Total price', value: 'total' },
                { label: 'Price per J', value: 'perJ' },
              ]"
            />
            <q-input
              v-if="pricingMode === 'total'"
              v-model="totalPriceInput"
              dense
              outlined
              clearable
              label="Total price"
              hint="This value is used as final total cost."
            />
            <q-input
              v-else
              v-model="pricePerJInput"
              dense
              outlined
              clearable
              label="Price per J"
              hint="Final total cost = pricePerJ * totalHouseHeatingEnergyJ."
            />

            <div class="text-caption text-grey-7">
              Effective total cost:
              <b>{{ effectiveTotalCostLabel }}</b>
              <span v-if="effectiveTotalCostSource">({{ effectiveTotalCostSource }})</span>
            </div>

            <q-separator />

            <div class="text-subtitle2">Optional IDs</div>
            <q-input
              v-model="sharedUnitId"
              dense
              outlined
              clearable
              label="SHARED unit ID (optional)"
            />
            <q-input
              v-model="outsideTargetId"
              dense
              outlined
              clearable
              label="OUTSIDE target ID (optional)"
            />

            <q-separator />

            <div class="text-subtitle2">Allocation method</div>
            <q-btn-toggle
              v-model="allocationMethod"
              spread
              unelevated
              :options="[
                { label: 'Fair flow model', value: 'fair' },
                { label: 'Practice (base + variable)', value: 'practical' },
              ]"
            />
            <q-input
              v-if="allocationMethod === 'practical'"
              v-model="practicalBaseSharePctInput"
              dense
              outlined
              clearable
              label="Base component [%]"
              hint="Recommended 40-60 % (current Czech billing practice)."
            />
            <div v-if="allocationMethod === 'practical'" class="text-caption text-grey-7">
              Variable component:
              <b>{{ practicalVariableShareLabel }}</b>
            </div>
          </q-card-section>
        </q-card>
      </div>

      <div class="col-12 col-lg-6">
        <q-card>
          <q-card-section>
            <div class="text-h6">Loaded Result Summary</div>
          </q-card-section>
          <q-separator />
          <q-card-section v-if="resultData">
            <div class="q-gutter-xs">
              <div>Name: <b>{{ resultData.name }}</b></div>
              <div>Simulation length: <b>{{ formatNumber(resultData.simulationLengthSec) }} s</b></div>
              <div>Tick: <b>{{ formatNumber(resultData.tick) }}</b></div>
              <div>Ended: <b>{{ resultData.ended ? 'yes' : 'no' }}</b></div>
              <div>
                Total house heating:
                <b>{{ formatNumber(resultData.totalHouseHeatingEnergyJ) }} J</b>
              </div>
              <div>Units: <b>{{ resultData.units.length }}</b></div>
            </div>

            <q-markup-table dense flat bordered class="q-mt-md">
              <thead>
                <tr>
                  <th class="text-left">ID</th>
                  <th class="text-left">Name</th>
                  <th class="text-right">Comfort avg</th>
                  <th class="text-right">Energy [J]</th>
                  <th class="text-right">Cells</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="u in resultData.units" :key="u.id">
                  <td>{{ u.id }}</td>
                  <td>{{ u.name }}</td>
                  <td class="text-right">
                    {{ u.avgComfortScore == null ? '-' : formatNumber(u.avgComfortScore) }}
                  </td>
                  <td class="text-right">{{ formatNumber(u.totalEnergyProducedJ) }}</td>
                  <td class="text-right">{{ formatNumber(u.areaCells) }}</td>
                </tr>
              </tbody>
            </q-markup-table>
          </q-card-section>
          <q-card-section v-else>
            <div class="text-grey-7">Import a results file to see summary.</div>
          </q-card-section>
        </q-card>

        <q-card class="q-mt-md">
          <q-card-section>
            <div class="row items-center justify-between">
              <div>
                <div class="text-h6">Allocation Output</div>
                <div class="text-caption text-grey-7">
                  Selected method: <b>{{ allocationMethodLabel }}</b>. Includes payment happiness
                  score and export for comparisons.
                </div>
              </div>
              <q-btn
                unelevated
                color="primary"
                label="Export allocation"
                :disable="!canExportCombinedAllocation"
                @click="exportAllocationResults"
              />
            </div>
          </q-card-section>
          <q-separator />
          <q-card-section v-if="allocationRows.length > 0">
            <div class="text-caption text-grey-7 q-mb-sm">
              Base sum: <b>{{ formatNumber(allocationMeta.baseTotalJ) }} J</b> |
              Billable sum:
              <b>{{ formatNumber(allocationMeta.billableTotalJ) }} J</b>
            </div>
            <div v-if="allocationMethod === 'fair'" class="text-caption text-grey-7 q-mb-md">
              Formula: <b>Base = Produced + Neighbor transfer</b>,
              <b>Billable = Base + Outside adj + Shared</b>.
              Neighbor transfer is positive when unit received net heat from other units, negative
              when it sent net heat to them.
            </div>
            <div v-else class="text-caption text-grey-7 q-mb-md">
              Formula: <b>Billable = Base component + Variable component</b>. Base component is
              distributed by area; variable component uses corrected measured consumption
              (producedJ x position coefficient) and then applies 70%-200% per-area limits.
            </div>
            <q-markup-table v-if="allocationMethod === 'fair'" dense flat bordered>
              <thead>
                <tr>
                  <th class="text-left">Unit</th>
                  <th class="text-right">
                    Produced [J]
                    <q-icon name="help_outline" size="14px" class="q-ml-xs text-grey-6">
                      <q-tooltip>Directly produced heating energy from the simulation export.</q-tooltip>
                    </q-icon>
                  </th>
                  <th class="text-right">
                    Neighbor transfer [J]
                    <q-icon name="help_outline" size="14px" class="q-ml-xs text-grey-6">
                      <q-tooltip>Net unit-to-unit transfer: received minus sent.</q-tooltip>
                    </q-icon>
                  </th>
                  <th class="text-right">Base [J]</th>
                  <th class="text-right">Outside adj [J]</th>
                  <th class="text-right">Shared [J]</th>
                  <th class="text-right">Billable [J]</th>
                  <th class="text-right">Share [%]</th>
                  <th class="text-right">Comfort</th>
                  <th class="text-right">Pay happiness</th>
                  <th class="text-right">Cost</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in allocationRows" :key="row.id">
                  <td>{{ row.name }} ({{ row.id }})</td>
                  <td class="text-right">{{ formatNumber(row.producedJ) }}</td>
                  <td class="text-right">{{ formatSignedNumber(row.neighborTransferJ) }}</td>
                  <td class="text-right">{{ formatNumber(row.baseCostJ) }}</td>
                  <td class="text-right">{{ formatSignedNumber(row.outsideAdjustmentJ) }}</td>
                  <td class="text-right">{{ formatNumber(row.sharedCostJ) }}</td>
                  <td class="text-right">{{ formatNumber(row.billableJ) }}</td>
                  <td class="text-right">{{ formatPercent(row.shareRatio) }}</td>
                  <td class="text-right">
                    {{ row.comfortScore == null ? '-' : formatNumber(row.comfortScore) }}
                  </td>
                  <td class="text-right">{{ formatNumber(row.paymentHappinessScore) }}</td>
                  <td class="text-right"><b>{{ formatNumber(row.finalCost) }}</b></td>
                </tr>
              </tbody>
            </q-markup-table>
            <q-markup-table v-else dense flat bordered>
              <thead>
                <tr>
                  <th class="text-left">Unit</th>
                  <th class="text-right">Area [cells]</th>
                  <th class="text-right">Produced [J]</th>
                  <th class="text-right">Position coef</th>
                  <th class="text-right">Corrected cons. [J]</th>
                  <th class="text-right">Base part [J]</th>
                  <th class="text-right">Variable part [J]</th>
                  <th class="text-right">Billable [J]</th>
                  <th class="text-right">Share [%]</th>
                  <th class="text-right">Comfort</th>
                  <th class="text-right">Pay happiness</th>
                  <th class="text-right">Cost</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in allocationRows" :key="row.id">
                  <td>{{ row.name }} ({{ row.id }})</td>
                  <td class="text-right">{{ formatNumber(row.areaCells) }}</td>
                  <td class="text-right">{{ formatNumber(row.producedJ) }}</td>
                  <td class="text-right">
                    {{ row.positionCoefficient == null ? '-' : formatNumber(row.positionCoefficient) }}
                  </td>
                  <td class="text-right">
                    {{ row.correctedConsumptionJ == null ? '-' : formatNumber(row.correctedConsumptionJ) }}
                  </td>
                  <td class="text-right">{{ formatNumber(row.baseCostJ) }}</td>
                  <td class="text-right">{{ formatNumber(row.sharedCostJ) }}</td>
                  <td class="text-right">{{ formatNumber(row.billableJ) }}</td>
                  <td class="text-right">{{ formatPercent(row.shareRatio) }}</td>
                  <td class="text-right">
                    {{ row.comfortScore == null ? '-' : formatNumber(row.comfortScore) }}
                  </td>
                  <td class="text-right">{{ formatNumber(row.paymentHappinessScore) }}</td>
                  <td class="text-right"><b>{{ formatNumber(row.finalCost) }}</b></td>
                </tr>
              </tbody>
            </q-markup-table>
          </q-card-section>
          <q-card-section v-else>
            <div class="allocation-placeholder">
              <span v-if="!resultData">Import results to compute allocation.</span>
              <span
                v-else-if="allocationMethod === 'practical' && practicalBaseShareRatio == null"
              >
                Enter valid base component percentage.
              </span>
              <span v-else-if="effectiveTotalCost == null">
                Enter valid pricing input to compute allocation.
              </span>
              <span v-else>No payable units detected.</span>
            </div>
          </q-card-section>
        </q-card>

        <q-card class="q-mt-md" v-if="comparisonRows.length > 0">
          <q-card-section>
            <div class="text-h6">Fair vs Practice Comparison</div>
            <div class="text-caption text-grey-7">
              The same imported simulation priced by two methods.
            </div>
          </q-card-section>
          <q-separator />
          <q-card-section>
            <q-markup-table dense flat bordered>
              <thead>
                <tr>
                  <th class="text-left">Method</th>
                  <th class="text-right">Avg pay happiness</th>
                  <th class="text-right">Min pay happiness</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Fair flow model</td>
                  <td class="text-right">{{ formatNumber(avgHappiness(fairAllocationRows)) }}</td>
                  <td class="text-right">{{ formatNumber(minHappiness(fairAllocationRows)) }}</td>
                </tr>
                <tr>
                  <td>Practice (base + variable)</td>
                  <td class="text-right">{{ formatNumber(avgHappiness(practicalAllocationRows)) }}</td>
                  <td class="text-right">{{ formatNumber(minHappiness(practicalAllocationRows)) }}</td>
                </tr>
              </tbody>
            </q-markup-table>

            <q-markup-table dense flat bordered class="q-mt-md">
              <thead>
                <tr>
                  <th class="text-left">Unit</th>
                  <th class="text-right">Fair cost</th>
                  <th class="text-right">Practice cost</th>
                  <th class="text-right">Delta (Practice - Fair)</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in comparisonRows" :key="`cmp-${row.id}`">
                  <td>{{ row.name }} ({{ row.id }})</td>
                  <td class="text-right">{{ formatNumber(row.fairCost) }}</td>
                  <td class="text-right">{{ formatNumber(row.practicalCost) }}</td>
                  <td class="text-right">{{ formatSignedNumber(row.practicalCost - row.fairCost) }}</td>
                </tr>
              </tbody>
            </q-markup-table>
          </q-card-section>
        </q-card>
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { OUTSIDE_TARGET_ID, SHARED_UNIT_ID } from 'src/sim/heatWorld';
import type { SimulationResultsExport } from 'src/sim/heatSimulation';
import {
  computeFairAllocation,
  computePracticalAllocation,
} from 'src/pages/cost-allocation/allocationAlgorithms';
import type {
  AllocationMethod,
  AllocationRow,
} from 'src/pages/cost-allocation/allocationTypes';
import { emptyAllocationComputation } from 'src/pages/cost-allocation/allocationTypes';

const importInputEl = ref<HTMLInputElement | null>(null);
const importedFileName = ref('');
const resultData = ref<SimulationResultsExport | null>(null);

const pricingMode = ref<'total' | 'perJ'>('total');
const totalPriceInput = ref('');
const pricePerJInput = ref('');

const sharedUnitId = ref(SHARED_UNIT_ID);
const outsideTargetId = ref(OUTSIDE_TARGET_ID);
const allocationMethod = ref<AllocationMethod>('fair');
const practicalBaseSharePctInput = ref('40');

function parseFiniteNumber(v: string): number | null {
  const trimmed = v.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/\s+/g, '').replace(',', '.');
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

const totalPrice = computed(() => parseFiniteNumber(totalPriceInput.value));
const pricePerJ = computed(() => parseFiniteNumber(pricePerJInput.value));

const effectiveTotalCost = computed<number | null>(() => {
  if (totalPrice.value != null) return totalPrice.value;
  if (pricePerJ.value != null && resultData.value) {
    return pricePerJ.value * resultData.value.totalHouseHeatingEnergyJ;
  }
  return null;
});

const effectiveTotalCostSource = computed(() => {
  if (totalPrice.value != null) return 'from total price';
  if (pricePerJ.value != null && resultData.value)
    return 'pricePerJ * totalHouseHeatingEnergyJ';
  return '';
});

const effectiveTotalCostLabel = computed(() =>
  effectiveTotalCost.value == null ? '-' : formatNumber(effectiveTotalCost.value),
);

function parseOptionalId(v: string): string | null {
  const t = v.trim();
  return t ? t : null;
}

function parsePercentRatio(v: string): number | null {
  const n = parseFiniteNumber(v);
  if (n == null) return null;
  if (n > 100) return null;
  return n / 100;
}

const practicalBaseShareRatio = computed(() => parsePercentRatio(practicalBaseSharePctInput.value));
const practicalVariableShareLabel = computed(() => {
  const base = practicalBaseShareRatio.value;
  if (base == null) return '-';
  return `${((1 - base) * 100).toFixed(2)} %`;
});

const allocationMethodLabel = computed(() =>
  allocationMethod.value === 'fair' ? 'Fair flow model' : 'Practice (base + variable)',
);

const fairAllocationComputation = computed(() => {
  const data = resultData.value;
  const totalCost = effectiveTotalCost.value;
  if (!data || totalCost == null) return emptyAllocationComputation();

  const configuredSharedId = parseOptionalId(sharedUnitId.value);
  const configuredOutsideId = parseOptionalId(outsideTargetId.value);
  return computeFairAllocation({
    data,
    totalCost,
    sharedUnitId: configuredSharedId,
    outsideTargetId: configuredOutsideId,
  });
});

const practicalAllocationComputation = computed(() => {
  const data = resultData.value;
  const totalCost = effectiveTotalCost.value;
  const baseShareRatio = practicalBaseShareRatio.value;
  if (!data || totalCost == null || baseShareRatio == null) return emptyAllocationComputation();

  const configuredSharedId = parseOptionalId(sharedUnitId.value);
  const configuredOutsideId = parseOptionalId(outsideTargetId.value);
  return computePracticalAllocation({
    data,
    totalCost,
    sharedUnitId: configuredSharedId,
    outsideTargetId: configuredOutsideId,
    practicalBaseShareRatio: baseShareRatio,
  });
});

const allocationComputation = computed(() =>
  allocationMethod.value === 'fair'
    ? fairAllocationComputation.value
    : practicalAllocationComputation.value,
);

const allocationRows = computed(() => allocationComputation.value.rows);
const allocationMeta = computed(() => allocationComputation.value.meta);
const fairAllocationRows = computed(() => fairAllocationComputation.value.rows);
const practicalAllocationRows = computed(() => practicalAllocationComputation.value.rows);
const canExportCombinedAllocation = computed(
  () =>
    !!resultData.value &&
    effectiveTotalCost.value != null &&
    fairAllocationRows.value.length > 0 &&
    practicalAllocationRows.value.length > 0,
);

function avgHappiness(rows: AllocationRow[]) {
  if (rows.length === 0) return 0;
  return rows.reduce((s, r) => s + r.paymentHappinessScore, 0) / rows.length;
}

function minHappiness(rows: AllocationRow[]) {
  if (rows.length === 0) return 0;
  return rows.reduce((min, r) => Math.min(min, r.paymentHappinessScore), Number.POSITIVE_INFINITY);
}

const comparisonRows = computed(() => {
  const fairById = new Map(fairAllocationRows.value.map((r) => [r.id, r]));
  const practicalById = new Map(practicalAllocationRows.value.map((r) => [r.id, r]));
  const ids = Array.from(new Set([...fairById.keys(), ...practicalById.keys()]));
  return ids
    .map((id) => {
      const fair = fairById.get(id);
      const practical = practicalById.get(id);
      return {
        id,
        name: fair?.name ?? practical?.name ?? id,
        fairCost: fair?.finalCost ?? 0,
        practicalCost: practical?.finalCost ?? 0,
      };
    })
    .sort((a, b) => Math.abs(b.practicalCost - b.fairCost) - Math.abs(a.practicalCost - a.fairCost));
});

function formatNumber(value: number) {
  return new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 4 }).format(value);
}

function formatPercent(ratio: number) {
  return `${(ratio * 100).toFixed(2)} %`;
}

function formatSignedNumber(value: number) {
  const v = formatNumber(value);
  return value > 0 ? `+${v}` : v;
}

function getDownloadFileName(prefix: string) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${prefix}-${stamp}.json`;
}

function sanitizeFileNamePart(name: string) {
  const normalized = name.trim().replace(/\s+/g, '-');
  const safe = normalized.replace(/[^a-zA-Z0-9._-]/g, '');
  return safe || 'allocation';
}

function exportAllocationResults() {
  if (!resultData.value || !canExportCombinedAllocation.value) return;

  const unitRowsToExport = (rows: AllocationRow[]) =>
    rows.map((row) => ({
      id: row.id,
      name: row.name,
      share: row.shareRatio,
      cost: row.finalCost,
      comfortScore: row.comfortScore,
      paymentHappinessScore: row.paymentHappinessScore,
    }));

  const payload = {
    version: 2,
    name: resultData.value.name,
    generatedAt: new Date().toISOString(),
    effectiveTotalCost: effectiveTotalCost.value,
    methods: {
      fair: {
        algorithm: 'fair' as const,
        label: 'Fair flow model',
        units: unitRowsToExport(fairAllocationRows.value),
      },
      practical: {
        algorithm: 'practical' as const,
        label: 'Practice (base + variable)',
        practicalBaseShareRatio: practicalBaseShareRatio.value,
        units: unitRowsToExport(practicalAllocationRows.value),
      },
    },
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = getDownloadFileName(`${sanitizeFileNamePart(resultData.value.name)}-allocation`);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function openImportDialog() {
  importInputEl.value?.click();
}

function clearImportInput() {
  if (importInputEl.value) importInputEl.value.value = '';
}

function detectSharedId(data: SimulationResultsExport) {
  if (data.units.some((u) => u.id === SHARED_UNIT_ID)) return SHARED_UNIT_ID;
  const byName = data.units.find((u) => u.name.toLowerCase().includes('shared'));
  return byName?.id ?? SHARED_UNIT_ID;
}

function detectOutsideId(data: SimulationResultsExport) {
  const targetIds = new Set<string>();
  for (const u of data.units) {
    Object.keys(u.netHeatFlowTotalJByTarget).forEach((id) => targetIds.add(id));
  }
  if (targetIds.has(OUTSIDE_TARGET_ID)) return OUTSIDE_TARGET_ID;

  const unitIds = new Set(data.units.map((u) => u.id));
  for (const targetId of targetIds) {
    if (!unitIds.has(targetId)) return targetId;
  }
  return OUTSIDE_TARGET_ID;
}

function isSimulationResultsExport(raw: unknown): raw is SimulationResultsExport {
  if (!raw || typeof raw !== 'object') return false;
  const x = raw as Record<string, unknown>;

  if (x.version !== 1) return false;
  if (typeof x.name !== 'string') return false;
  if (typeof x.tick !== 'number') return false;
  if (typeof x.simulationLengthSec !== 'number') return false;
  if (typeof x.ended !== 'boolean') return false;
  if (typeof x.pausedForExport !== 'boolean') return false;
  if (typeof x.totalHouseHeatingEnergyJ !== 'number') return false;
  if (!Array.isArray(x.units)) return false;

  return x.units.every((u) => {
    if (!u || typeof u !== 'object') return false;
    const unit = u as Record<string, unknown>;
    return (
      typeof unit.id === 'string' &&
      typeof unit.name === 'string' &&
      (typeof unit.avgComfortScore === 'number' || unit.avgComfortScore === null) &&
      typeof unit.totalEnergyProducedJ === 'number' &&
      typeof unit.areaCells === 'number' &&
      !!unit.netHeatFlowTotalJByTarget &&
      typeof unit.netHeatFlowTotalJByTarget === 'object'
    );
  });
}

async function onResultsFileSelected(evt: Event) {
  const input = evt.target as HTMLInputElement | null;
  const file = input?.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const parsedRaw: unknown = JSON.parse(text);

    const payloadCandidate =
      parsedRaw && typeof parsedRaw === 'object'
        ? ((parsedRaw as Record<string, unknown>).results ?? parsedRaw)
        : parsedRaw;

    if (!isSimulationResultsExport(payloadCandidate)) {
      throw new Error('Invalid results format');
    }

    resultData.value = payloadCandidate;
    importedFileName.value = file.name;
    sharedUnitId.value = detectSharedId(payloadCandidate);
    outsideTargetId.value = detectOutsideId(payloadCandidate);
  } catch {
    window.alert('Import failed. Invalid results file format.');
  } finally {
    clearImportInput();
  }
}
</script>

<style scoped>
.allocation-placeholder {
  border: 1px dashed rgba(255, 255, 255, 0.35);
  border-radius: 10px;
  min-height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.7);
}
</style>
