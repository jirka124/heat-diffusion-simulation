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
            <div class="text-h6">Allocation Output</div>
            <div class="text-caption text-grey-7">
              Placeholder for future cost allocation results.
            </div>
          </q-card-section>
          <q-separator />
          <q-card-section>
            <div class="allocation-placeholder">
              Output panel reserved for the allocation algorithm.
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
import type { SimulationResultsExport } from 'src/sim/heatSimulation';

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

function formatNumber(value: number) {
  return new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 4 }).format(value);
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
