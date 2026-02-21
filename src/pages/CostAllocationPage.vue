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
                  Includes payment happiness score and export for comparisons.
                </div>
              </div>
              <q-btn
                unelevated
                color="primary"
                label="Export allocation"
                :disable="allocationRows.length === 0 || !resultData"
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
            <div class="text-caption text-grey-7 q-mb-md">
              Formula: <b>Base = Produced + Neighbor transfer</b>,
              <b>Billable = Base + Outside adj + Shared</b>.
              Neighbor transfer is positive when unit received net heat from other units, negative
              when it sent net heat to them.
            </div>
            <q-markup-table dense flat bordered>
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
          </q-card-section>
          <q-card-section v-else>
            <div class="allocation-placeholder">
              <span v-if="!resultData">Import results to compute allocation.</span>
              <span v-else-if="effectiveTotalCost == null">
                Enter valid pricing input to compute allocation.
              </span>
              <span v-else>No payable units detected.</span>
            </div>
          </q-card-section>
        </q-card>
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { OUTSIDE_TARGET_ID, SHARED_UNIT_ID } from 'src/sim/heatWorld';
import type { SimulationResultsExport, UnitResultExport } from 'src/sim/heatSimulation';

const importInputEl = ref<HTMLInputElement | null>(null);
const importedFileName = ref('');
const resultData = ref<SimulationResultsExport | null>(null);

const pricingMode = ref<'total' | 'perJ'>('total');
const totalPriceInput = ref('');
const pricePerJInput = ref('');

const sharedUnitId = ref(SHARED_UNIT_ID);
const outsideTargetId = ref(OUTSIDE_TARGET_ID);

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

type AllocationRow = {
  id: string;
  name: string;
  producedJ: number;
  comfortScore: number | null;
  neighborTransferJ: number;
  baseCostJ: number;
  outsideAdjustmentJ: number;
  sharedCostJ: number;
  rawBillableJ: number;
  billableJ: number;
  shareRatio: number;
  selfPayCost: number;
  paymentHappinessScore: number;
  finalCost: number;
};

const SHARED_FLOW_TILT = 0.5;
const SHARED_WEIGHT_MIN = 0.5;
const SHARED_WEIGHT_MAX = 1.5;

function parseOptionalId(v: string): string | null {
  const t = v.trim();
  return t ? t : null;
}

function flowOutTo(from: UnitResultExport, targetId: string | null): number {
  if (!targetId) return 0;
  const raw = from.netHeatFlowTotalJByTarget[targetId] ?? 0;
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, raw);
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function scorePaymentHappiness(finalCost: number, selfPayCost: number) {
  if (selfPayCost <= 1e-9) return finalCost <= 1e-9 ? 100 : 0;
  const relDiff = Math.abs(finalCost - selfPayCost) / selfPayCost;
  return clamp(100 * (1 - relDiff), 0, 100);
}

const allocationComputation = computed(() => {
  const data = resultData.value;
  const totalCost = effectiveTotalCost.value;
  if (!data || totalCost == null) {
    return {
      rows: [] as AllocationRow[],
      meta: { baseTotalJ: 0, billableTotalJ: 0 },
    };
  }

  const configuredSharedId = parseOptionalId(sharedUnitId.value);
  const configuredOutsideId = parseOptionalId(outsideTargetId.value);
  const sharedUnit = configuredSharedId
    ? data.units.find((u) => u.id === configuredSharedId) ?? null
    : null;

  const payerUnits = data.units.filter((u) => u.id !== sharedUnit?.id);
  if (payerUnits.length === 0) {
    return {
      rows: [] as AllocationRow[],
      meta: { baseTotalJ: 0, billableTotalJ: 0 },
    };
  }

  const n = payerUnits.length;
  const rowMap = new Map<string, AllocationRow>();
  for (const unit of payerUnits) {
    rowMap.set(unit.id, {
      id: unit.id,
      name: unit.name,
      producedJ: unit.totalEnergyProducedJ,
      comfortScore: unit.avgComfortScore,
      neighborTransferJ: 0,
      baseCostJ: unit.totalEnergyProducedJ,
      outsideAdjustmentJ: 0,
      sharedCostJ: 0,
      rawBillableJ: 0,
      billableJ: 0,
      shareRatio: 0,
      selfPayCost: 0,
      paymentHappinessScore: 0,
      finalCost: 0,
    });
  }

  for (const from of payerUnits) {
    for (const to of payerUnits) {
      if (from.id === to.id) continue;
      const sent = flowOutTo(from, to.id);
      if (sent <= 0) continue;
      const sender = rowMap.get(from.id);
      const receiver = rowMap.get(to.id);
      if (!sender || !receiver) continue;
      sender.neighborTransferJ -= sent;
      receiver.neighborTransferJ += sent;
      sender.baseCostJ -= sent;
      receiver.baseCostJ += sent;
    }
  }

  if (configuredOutsideId) {
    const losses = new Map<string, number>();
    for (const unit of payerUnits) {
      losses.set(unit.id, flowOutTo(unit, configuredOutsideId));
    }

    for (const unit of payerUnits) {
      const loss = losses.get(unit.id) ?? 0;
      const row = rowMap.get(unit.id);
      if (!row) continue;
      if (n > 1) {
        row.outsideAdjustmentJ -= 0.2 * loss;
        let gain = 0;
        for (const other of payerUnits) {
          if (other.id === unit.id) continue;
          gain += (0.2 * (losses.get(other.id) ?? 0)) / (n - 1);
        }
        row.outsideAdjustmentJ += gain;
      }
    }
  }

  if (sharedUnit) {
    const sharedBase = Math.max(0, sharedUnit.totalEnergyProducedJ);
    const weightParts = payerUnits.map((u) => {
      const toUnit = flowOutTo(sharedUnit, u.id);
      const fromUnit = flowOutTo(u, sharedUnit.id);
      const tiltRaw = toUnit - fromUnit;
      const denom = Math.max(sharedBase, 1);
      const weight = clamp(
        1 + SHARED_FLOW_TILT * (tiltRaw / denom),
        SHARED_WEIGHT_MIN,
        SHARED_WEIGHT_MAX,
      );
      return { id: u.id, weight };
    });

    const weightSum = weightParts.reduce((sum, p) => sum + p.weight, 0);
    if (weightSum > 0 && sharedBase > 0) {
      for (const p of weightParts) {
        const row = rowMap.get(p.id);
        if (!row) continue;
        row.sharedCostJ = (sharedBase * p.weight) / weightSum;
      }
    }
  }

  const rows = Array.from(rowMap.values()).map((row) => {
    row.rawBillableJ = row.baseCostJ + row.outsideAdjustmentJ + row.sharedCostJ;
    row.billableJ = Math.max(0, row.rawBillableJ);
    return row;
  });

  const baseTotalJ = rows.reduce((sum, r) => sum + r.rawBillableJ, 0);
  const billableTotalJ = rows.reduce((sum, r) => sum + r.billableJ, 0);
  const producedTotalJ = rows.reduce((sum, r) => sum + r.producedJ, 0);

  if (billableTotalJ > 0) {
    for (const row of rows) {
      row.shareRatio = row.billableJ / billableTotalJ;
      row.finalCost = totalCost * row.shareRatio;
    }
  } else {
    for (const row of rows) {
      row.shareRatio = 1 / rows.length;
      row.finalCost = totalCost / rows.length;
    }
  }

  if (producedTotalJ > 0) {
    for (const row of rows) {
      row.selfPayCost = totalCost * (row.producedJ / producedTotalJ);
      row.paymentHappinessScore = scorePaymentHappiness(row.finalCost, row.selfPayCost);
    }
  } else {
    for (const row of rows) {
      row.selfPayCost = totalCost / rows.length;
      row.paymentHappinessScore = scorePaymentHappiness(row.finalCost, row.selfPayCost);
    }
  }

  rows.sort((a, b) => b.finalCost - a.finalCost);
  return { rows, meta: { baseTotalJ, billableTotalJ } };
});

const allocationRows = computed(() => allocationComputation.value.rows);
const allocationMeta = computed(() => allocationComputation.value.meta);

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
  if (!resultData.value || allocationRows.value.length === 0) return;

  const payload = {
    version: 1,
    name: resultData.value.name,
    generatedAt: new Date().toISOString(),
    effectiveTotalCost: effectiveTotalCost.value,
    units: allocationRows.value.map((row) => ({
      id: row.id,
      name: row.name,
      share: row.shareRatio,
      cost: row.finalCost,
      comfortScore: row.comfortScore,
      paymentHappinessScore: row.paymentHappinessScore,
    })),
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
