<template>
  <q-page class="q-pa-md">
    <div class="row q-col-gutter-md">
      <!-- LEFT PANEL -->
      <div class="col-12 col-md-4">
        <q-card>
          <q-card-section>
            <div class="text-h6">Heat Diffusion v2</div>
            <div class="text-caption text-grey-7">
              Materials per cell + paint editor + heater/AC as material emitters
            </div>
          </q-card-section>

          <q-separator />

          <q-card-section class="q-gutter-md">
            <q-tabs v-model="tab" dense>
              <q-tab name="sim" label="Simulation" />
              <q-tab name="edit" label="Editor" />
              <q-tab name="mats" label="Materials" />
              <q-tab name="units" label="Units" />
            </q-tabs>

            <q-separator />

            <q-tab-panels v-model="tab" animated>
              <!-- SIM TAB -->
              <q-tab-panel name="sim" class="q-pa-none q-pt-md">
                <div v-if="!locked">
                  <div class="row q-col-gutter-sm">
                    <div class="col-6">
                      <q-input v-model.number="cfg.w" type="number" label="Grid W" dense outlined />
                    </div>
                    <div class="col-6">
                      <q-input v-model.number="cfg.h" type="number" label="Grid H" dense outlined />
                    </div>
                  </div>

                  <q-input
                    v-model.number="cfg.initTemp"
                    type="number"
                    label="Initial Temp"
                    dense
                    outlined
                  />
                  <q-input
                    v-model.number="cfg.dt"
                    type="number"
                    label="dt (time step)"
                    dense
                    outlined
                  />
                  <div class="col-12">
                    <q-input
                      v-model.number="cfg.startDayTimeMin"
                      type="number"
                      label="Day time offset (minutes)"
                      dense
                      outlined
                      :min="0"
                      :max="60 * 24 - 1"
                    />
                  </div>
                  <div class="row q-col-gutter-sm">
                    <div class="col-12">
                      <q-toggle v-model="cfg.endEnabled" label="Auto-stop" />
                    </div>

                    <div class="col-8">
                      <q-input
                        v-model.number="cfg.endValue"
                        type="number"
                        label="End after"
                        dense
                        outlined
                        :disable="!cfg.endEnabled"
                        :min="0.01"
                        step="0.5"
                      />
                    </div>

                    <div class="col-4">
                      <q-select
                        v-model="cfg.endUnit"
                        :options="[
                          { label: 'hours', value: 'h' },
                          { label: 'days', value: 'd' },
                        ]"
                        dense
                        outlined
                        emit-value
                        map-options
                        :disable="!cfg.endEnabled"
                        label="Unit"
                      />
                    </div>

                    <div class="col-12">
                      <div class="text-caption text-grey-7">
                        Limit: <b>{{ endSimSec == null ? 'inf' : fmtSimTime(endSimSec) }}</b>
                      </div>
                    </div>
                  </div>

                  <div class="row q-col-gutter-sm">
                    <div class="col-6">
                      <q-input
                        v-model.number="cfg.simTicksPerSec"
                        type="number"
                        label="Model Speed (tics/sec)"
                        dense
                        outlined
                        :min="0.1"
                        :max="1000"
                      />
                    </div>

                    <div class="col-6">
                      <q-input
                        v-model.number="cfg.renderFpsLimit"
                        type="number"
                        label="Render FPS limit"
                        dense
                        outlined
                        :min="1"
                        :max="60"
                      />
                    </div>
                  </div>
                </div>

                <div v-else>
                  <div class="text-subtitle2">Runtime overview</div>
                  <div class="text-caption text-grey-7 q-mb-sm">
                    Day <b>{{ dayIndex }}</b> - Time <b>{{ dayTimeLabel }}</b>
                    <span v-if="endSimSec != null">
                      - Remaining: <b>{{ fmtSimTime(Math.max(0, endSimSec - simTimeSec)) }}</b>
                    </span>
                  </div>

                  <q-list bordered separator class="q-mt-sm">
                    <q-item v-for="r in runtimeUnitRows" :key="r.id">
                      <q-item-section avatar>
                        <div class="mat-swatch" :style="{ background: r.color }" />
                      </q-item-section>

                      <q-item-section>
                        <q-item-label>
                          {{ r.name }}
                          <span class="text-caption text-grey-7">({{ r.id }})</span>
                        </q-item-label>

                        <q-item-label caption>
                          Target: <b>{{ r.activeRange }}</b>
                          <span v-if="r.kind === 'unit'">
                            - Schedule: {{ r.schedule }} - <b>{{ r.home ? 'HOME' : 'AWAY' }}</b>
                          </span>
                          <span v-else> - Shared </span>

                          <span v-if="r.heaters > 0">
                            - Heaters: <b>{{ r.heaters }}</b></span
                          >
                        </q-item-label>
                      </q-item-section>

                      <q-item-section side>
                        <div class="text-caption text-grey-7" style="text-align: right">
                          Avg T:
                          <b>{{ r.avgT == null ? '--' : r.avgT.toFixed(1) + ' C' }}</b>
                        </div>
                        <div class="text-caption text-grey-7" style="text-align: right">
                          Cells: <b>{{ r.cells }}</b>
                        </div>
                      </q-item-section>
                    </q-item>
                  </q-list>
                </div>

                <div class="row q-col-gutter-sm q-mt-sm">
                  <div class="col-12">
                    <q-btn
                      class="full-width"
                      unelevated
                      color="primary"
                      label="Setup / Reset"
                      @click="setup()"
                    />
                  </div>
                  <div class="col-12">
                    <q-btn
                      class="full-width"
                      unelevated
                      color="grey-8"
                      label="Reset temperature and time"
                      @click="resetTemps()"
                    />
                  </div>
                  <div class="col-6">
                    <q-btn
                      class="full-width"
                      unelevated
                      :color="running ? 'negative' : 'positive'"
                      :label="running ? 'Pause' : 'Start'"
                      @click="toggleRun()"
                    />
                  </div>
                  <div class="col-6">
                    <q-btn
                      class="full-width"
                      unelevated
                      color="secondary"
                      label="Step"
                      @click="stepOnce()"
                    />
                  </div>
                </div>

                <q-separator class="q-my-md" />

                <div class="text-body2">
                  <div>
                    Time: <b>{{ simTimeLabel }}</b>
                  </div>
                  <div>
                    Day: <b>{{ dayIndex }}</b> - Day time: <b>{{ dayTimeLabel }}</b>
                  </div>
                  <div>
                    Tick: <b>{{ tick }}</b>
                  </div>
                  <div>
                    Min/Max T: <b>{{ minT.toFixed(2) }}</b> / <b>{{ maxT.toFixed(2) }}</b>
                  </div>
                  <div>
                    FPS: <b>{{ fps.toFixed(1) }}</b>
                  </div>
                </div>
              </q-tab-panel>

              <!-- EDIT TAB -->
              <q-tab-panel name="edit" class="q-pa-none q-pt-md">
                <div class="text-subtitle2">Paint</div>

                <q-btn-toggle
                  v-model="paintTool"
                  spread
                  unelevated
                  class="q-mb-sm"
                  :options="[
                    { label: 'Paint', value: 'paint' },
                    { label: 'Pick', value: 'pick' },
                    { label: 'Fill', value: 'fill' },
                  ]"
                  :disable="locked"
                />

                <q-select
                  v-model="selectedMaterialId"
                  :options="materialOptions"
                  label="Selected material"
                  dense
                  outlined
                  emit-value
                  map-options
                  :disable="locked"
                />

                <div class="text-caption text-grey-7 q-mt-xs">
                  Paint = drag paint, Pick = click to select material from cell, Fill = fill
                  connected area with same material.
                </div>
              </q-tab-panel>

              <!-- MATERIALS TAB -->
              <q-tab-panel name="mats" class="q-pa-none q-pt-md">
                <div class="row items-center justify-between">
                  <div class="text-subtitle2">Materials</div>
                  <q-btn
                    dense
                    unelevated
                    color="primary"
                    icon="add"
                    label="Add"
                    :disable="locked"
                    @click="openAdd()"
                  />
                </div>

                <q-list bordered class="q-mt-sm">
                  <q-item
                    v-for="m in materialsList"
                    :key="m.id"
                    :clickable="!locked"
                    v-ripple
                    @click="!locked && (selectedMaterialId = m.id)"
                  >
                    <q-item-section avatar>
                      <div class="mat-swatch" :style="{ background: m.color }" />
                    </q-item-section>

                    <q-item-section>
                      <q-item-label>
                        {{ m.name }}
                        <span class="text-caption text-grey-7">({{ m.id }})</span>
                      </q-item-label>
                      <q-item-label caption>
                        cap={{ m.cap }} - k={{ m.k }}
                        <span v-if="m.emitTemp != null"> - emit={{ m.emitTemp }} C @</span>
                      </q-item-label>
                    </q-item-section>

                    <q-item-section side>
                      <q-btn
                        flat
                        dense
                        icon="edit"
                        :disable="locked"
                        @click.stop="openEdit(m.id)"
                      />
                      <q-btn
                        flat
                        dense
                        icon="delete"
                        color="negative"
                        :disable="locked || m.id === 'air'"
                        @click.stop="removeMaterial(m.id)"
                      />
                    </q-item-section>
                  </q-item>
                </q-list>

                <div class="text-caption text-grey-7 q-mt-sm">
                  Note: removing a material replaces its cells with <b>air</b>.
                </div>
              </q-tab-panel>

              <!-- UNITS TAB -->
              <q-tab-panel name="units" class="q-pa-none q-pt-md">
                <div class="row items-center justify-between">
                  <div class="text-subtitle2">Units</div>
                  <q-btn
                    dense
                    unelevated
                    color="primary"
                    icon="add"
                    label="Add"
                    :disable="locked"
                    @click="openAddUnit()"
                  />
                </div>

                <q-select
                  v-model="selectedUnitId"
                  :options="unitOptions"
                  label="Selected unit"
                  dense
                  outlined
                  emit-value
                  map-options
                  class="q-mt-sm"
                  :disable="locked"
                />

                <q-btn-toggle
                  v-model="unitPaintTool"
                  spread
                  unelevated
                  class="q-mt-sm"
                  :disable="locked"
                  :options="[
                    { label: 'Assign', value: 'assign' },
                    { label: 'Pick', value: 'pick' },
                    { label: 'Fill', value: 'fill' },
                    { label: 'Clear', value: 'clear' },
                  ]"
                />

                <q-list bordered class="q-mt-sm">
                  <q-item
                    v-for="u in unitsList"
                    :key="u.id"
                    :clickable="!locked"
                    v-ripple
                    @click="!locked && (selectedUnitId = u.id)"
                  >
                    <q-item-section avatar>
                      <div class="mat-swatch" :style="{ background: u.color }" />
                    </q-item-section>

                    <q-item-section>
                      <q-item-label>
                        {{ u.name }}
                        <span class="text-caption text-grey-7">({{ u.id }})</span>
                      </q-item-label>
                    </q-item-section>

                    <q-item-section side>
                      <q-btn
                        flat
                        dense
                        icon="edit"
                        :disable="locked"
                        @click.stop="openEditUnit(u.id)"
                      />
                      <q-btn
                        flat
                        dense
                        icon="delete"
                        color="negative"
                        :disable="locked || u.id === SHARED_UNIT_ID"
                        @click.stop="removeUnit(u.id)"
                      />
                    </q-item-section>
                  </q-item>
                </q-list>

                <div class="text-caption text-grey-7 q-mt-sm">
                  Tip: switch View to <b>Units</b>, then paint cell assignments for units/shared.
                </div>
              </q-tab-panel>
            </q-tab-panels>
          </q-card-section>
        </q-card>
      </div>

      <!-- RIGHT PANEL -->
      <div class="col-12 col-md-8">
        <q-card>
          <q-card-section>
            <div class="row items-center justify-between q-col-gutter-md">
              <div class="col-auto">
                <div class="text-h6">Canvas</div>
                <div class="text-caption text-grey-7">
                  Paint on grid - View: {{ viewModeLabel }}
                </div>
              </div>

              <div class="col">
                <div class="row items-center justify-end q-gutter-sm">
                  <q-option-group
                    v-model="viewMode"
                    type="radio"
                    inline
                    :options="[
                      { label: 'Infrastructure', value: 'infra' },
                      { label: 'Temperature', value: 'temp' },
                      { label: 'Combo', value: 'combo' },
                      { label: 'Units', value: 'units' },
                    ]"
                  />

                  <q-slider
                    v-if="viewMode === 'combo' || viewMode === 'units'"
                    v-model="comboAlpha"
                    :min="0"
                    :max="100"
                    style="width: 180px"
                    label
                    label-always
                  />

                  <q-toggle v-model="autoScale" label="Color scale" />

                  <div class="text-caption" style="min-width: 48px; text-align: center">
                    {{ scale.toFixed(2) }}x
                  </div>
                </div>
              </div>
            </div>
          </q-card-section>

          <q-separator />

          <q-card-section>
            <div class="row justify-between q-mt-xs">
              <div class="text-caption text-grey-7">Zoom: CTRL+WHEEL</div>
              <div class="text-caption text-grey-7">Move: SPACE+MOUSE DRAG</div>
              <div class="text-caption text-grey-7">Scroll-y: WHEEL</div>
              <div class="text-caption text-grey-7">Scroll-x: SHIFT+WHEEL</div>
            </div>
            <div class="canvas-wrap">
              <div
                ref="viewportEl"
                class="canvas-viewport"
                @wheel="onWheel"
                @pointerdown="onPanDown"
                @pointermove="onPanMove"
                @pointerup="onPanUp"
                @pointerleave="onPanUp"
              >
                <div ref="contentEl" class="canvas-content">
                  <canvas
                    ref="canvasEl"
                    @pointerdown="onPointerDown"
                    @pointermove="onPointerMove"
                    @pointerup="onPointerUp"
                    @pointerleave="onPointerUp"
                  />
                </div>
              </div>
            </div>

            <div class="q-mt-md">
              <div class="row items-center justify-between q-mb-xs">
                <div class="text-caption text-grey-7">Temperature scale (C)</div>
                <div class="text-caption">
                  <b>{{ minT.toFixed(1) }}</b> -> <b>{{ maxT.toFixed(1) }}</b>
                </div>
              </div>

              <div class="temp-legend-bar" />

              <div class="row justify-between q-mt-xs">
                <div class="text-caption text-grey-7">{{ minT.toFixed(1) }} C</div>
                <div class="text-caption text-grey-7">{{ ((minT + maxT) / 2).toFixed(1) }} C</div>
                <div class="text-caption text-grey-7">{{ maxT.toFixed(1) }} C</div>
              </div>
            </div>
          </q-card-section>
        </q-card>
      </div>
    </div>

    <!-- MATERIAL DIALOG -->
    <q-dialog v-model="matDialog.open">
      <q-card style="width: 520px; max-width: 92vw">
        <q-card-section>
          <div class="text-h6">
            {{ matDialog.mode === 'add' ? 'Add material' : 'Edit material' }}
          </div>
        </q-card-section>

        <q-separator />

        <q-card-section class="q-gutter-sm">
          <q-input
            v-model="matForm.id"
            label="ID"
            dense
            outlined
            :disable="matDialog.mode === 'edit'"
          />
          <q-input v-model="matForm.name" label="Name" dense outlined />

          <div class="row q-col-gutter-sm">
            <div class="col-6">
              <q-input v-model.number="matForm.cap" type="number" label="cap" dense outlined />
            </div>
            <div class="col-6">
              <q-input v-model.number="matForm.k" type="number" label="k" dense outlined />
            </div>
          </div>

          <q-input v-model="matForm.color" label="Color" dense outlined>
            <template #append>
              <q-icon name="colorize" class="cursor-pointer">
                <q-popup-proxy cover transition-show="scale" transition-hide="scale">
                  <q-color v-model="matForm.color" format-model="hex" />
                </q-popup-proxy>
              </q-icon>
            </template>
          </q-input>

          <div class="row q-col-gutter-sm">
            <div class="col-12">
              <q-input
                v-model.number="matForm.emitTemp"
                type="number"
                label="emitTemp (C) - empty = none"
                dense
                outlined
                clearable
              />
            </div>
          </div>

          <div class="text-caption text-grey-7">
            Tip: Heater = emitTemp 50-70, AC = emitTemp 16-20
          </div>
        </q-card-section>

        <q-separator />

        <q-card-actions align="right">
          <q-btn flat label="Cancel" v-close-popup />
          <q-btn unelevated color="primary" label="Save" @click="saveMaterial()" />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- UNIT DIALOG -->
    <q-dialog v-model="unitDialog.open">
      <q-card style="width: 520px; max-width: 92vw">
        <q-card-section>
          <div class="text-h6">
            {{ unitDialog.mode === 'add' ? 'Add unit' : 'Edit unit' }}
          </div>
        </q-card-section>

        <q-separator />

        <q-card-section class="q-gutter-sm">
          <q-input
            v-model="unitForm.id"
            label="ID"
            dense
            outlined
            :disable="unitDialog.mode === 'edit'"
            hint="For example: A, B, C, A1..."
          />
          <q-input v-model="unitForm.name" label="Name" dense outlined />

          <q-input v-model="unitForm.color" label="Color" dense outlined>
            <template #append>
              <q-icon name="colorize" class="cursor-pointer">
                <q-popup-proxy cover transition-show="scale" transition-hide="scale">
                  <q-color v-model="unitForm.color" format-model="hex" />
                </q-popup-proxy>
              </q-icon>
            </template>
          </q-input>

          <q-separator class="q-my-sm" />

          <div class="text-subtitle2">Behavior</div>

          <!-- Shared -->
          <div
            v-if="
              unitForm.id === SHARED_UNIT_ID ||
              (unitDialog.mode === 'edit' && unitForm.id === SHARED_UNIT_ID)
            "
          >
            <div class="text-caption text-grey-7 q-mb-xs">
              Shared space: comfy temperature range
            </div>

            <div class="row q-col-gutter-sm">
              <div class="col-6">
                <q-input
                  v-model.number="unitForm.sharedMin"
                  type="number"
                  label="Comfy min (C)"
                  dense
                  outlined
                />
              </div>
              <div class="col-6">
                <q-input
                  v-model.number="unitForm.sharedMax"
                  type="number"
                  label="Comfy max (C)"
                  dense
                  outlined
                />
              </div>
            </div>
          </div>

          <!-- Normal unit -->
          <div v-else>
            <div class="text-caption text-grey-7 q-mb-xs">Home schedule (daily)</div>

            <q-slider
              v-model="unitForm.homeFromMin"
              :min="0"
              :max="1439"
              :step="15"
              label
              label-always
            />
            <div class="text-caption text-grey-7 q-mb-sm">
              Home from: <b>{{ fmtHm(unitForm.homeFromMin) }}</b>
            </div>

            <q-slider
              v-model="unitForm.homeToMin"
              :min="0"
              :max="1439"
              :step="15"
              label
              label-always
            />
            <div class="text-caption text-grey-7 q-mb-sm">
              Home to: <b>{{ fmtHm(unitForm.homeToMin) }}</b>
              <span v-if="unitForm.homeFromMin > unitForm.homeToMin" class="text-grey-6">
                (wraps over midnight)
              </span>
            </div>

            <div class="text-caption text-grey-7 q-mb-xs">When home</div>
            <div class="row q-col-gutter-sm">
              <div class="col-6">
                <q-input
                  v-model.number="unitForm.homeMin"
                  type="number"
                  label="Home min (C)"
                  dense
                  outlined
                />
              </div>
              <div class="col-6">
                <q-input
                  v-model.number="unitForm.homeMax"
                  type="number"
                  label="Home max (C)"
                  dense
                  outlined
                />
              </div>
            </div>

            <div class="text-caption text-grey-7 q-mt-sm q-mb-xs">When away</div>
            <div class="row q-col-gutter-sm">
              <div class="col-6">
                <q-input
                  v-model.number="unitForm.awayMin"
                  type="number"
                  label="Away min (C)"
                  dense
                  outlined
                />
              </div>
              <div class="col-6">
                <q-input
                  v-model.number="unitForm.awayMax"
                  type="number"
                  label="Away max (C)"
                  dense
                  outlined
                />
              </div>
            </div>
          </div>
        </q-card-section>

        <q-separator />

        <q-card-actions align="right">
          <q-btn flat label="Cancel" v-close-popup />
          <q-btn unelevated color="primary" label="Save" @click="saveUnit()" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { computed, markRaw, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import {
  SHARED_UNIT_ID,
  getMinMaxT,
  type Material,
  type TempRange,
  type Unit,
  type UnitParams,
  type World,
} from 'src/sim/heatWorld';
import { HeatSimulation, createDefaultSimulationConfig } from 'src/sim/heatSimulation';

const canvasEl = ref<HTMLCanvasElement | null>(null);
const viewportEl = ref<HTMLDivElement | null>(null);
const contentEl = ref<HTMLDivElement | null>(null);
let imgData: ImageData | null = null;

const tab = ref<'sim' | 'edit' | 'mats' | 'units'>('sim');
const cfg = reactive({
  ...createDefaultSimulationConfig(),
  renderFpsLimit: 12,
});

const simulation = markRaw(new HeatSimulation(cfg));
const world = ref<World | null>(null);
const worldVersion = ref(0);

const tick = ref(0);
const simTimeSec = ref(0);
const running = ref(false);
const locked = computed(() => tick.value > 0);

const rafId = ref<number | null>(null);
const fps = ref(0);

let lastTs = 0;
let needsRender = false;
let forcedRender = false;
let lastRenderTs = 0;
let fpsFrames = 0;
let fpsLastTs = 0;
let mmCounter = 0;

function syncSimulationState() {
  world.value = simulation.world;
  tick.value = simulation.tick;
  simTimeSec.value = simulation.simTimeSec;
  running.value = simulation.running;
}

function applySimulationConfig() {
  simulation.setConfig({
    w: cfg.w,
    h: cfg.h,
    initTemp: cfg.initTemp,
    dt: cfg.dt,
    simTicksPerSec: cfg.simTicksPerSec,
    startDayTimeMin: cfg.startDayTimeMin,
    endEnabled: cfg.endEnabled,
    endValue: cfg.endValue,
    endUnit: cfg.endUnit,
  });
}

function bumpWorld() {
  worldVersion.value += 1;
}

const autoScale = ref(true);
const minT = ref(0);
const maxT = ref(60);

type ViewMode = 'infra' | 'temp' | 'combo' | 'units';
const viewMode = ref<ViewMode>('combo');
const comboAlpha = ref(20);

const scale = ref(6);
const minScale = 1;
const maxScale = 30;
const zoomStep = 1.12;

const spaceDown = ref(false);
let panning = false;
let panStart = { x: 0, y: 0, sl: 0, st: 0 };
let painting = false;
let lastPaintIndex: number | null = null;

type PaintTool = 'paint' | 'pick' | 'fill';
type UnitPaintTool = 'assign' | 'pick' | 'fill' | 'clear';
const paintTool = ref<PaintTool>('paint');
const unitPaintTool = ref<UnitPaintTool>('assign');
const selectedMaterialId = ref('air');
const selectedUnitId = ref<Unit['id']>(SHARED_UNIT_ID);

const unitsList = computed<Unit[]>(() => {
  void worldVersion.value;
  if (!world.value) return [];
  return Object.values(world.value.units);
});

const unitOptions = computed(() =>
  unitsList.value.map((u) => ({ label: `${u.name} (${u.id})`, value: u.id })),
);

const materialOptions = computed(() => {
  void worldVersion.value;
  if (!world.value) return [];
  return Object.values(world.value.materials).map((m) => ({
    label: `${m.name} (${m.id})`,
    value: m.id,
  }));
});

const materialsList = computed(() => {
  void worldVersion.value;
  if (!world.value) return [];
  return Object.values(world.value.materials).sort((a, b) => a.name.localeCompare(b.name));
});

const endSimSec = computed<number | null>(() => {
  if (!cfg.endEnabled) return null;
  const v = Number(cfg.endValue);
  if (!Number.isFinite(v) || v <= 0) return null;
  const mul = cfg.endUnit === 'd' ? 86400 : 3600;
  return v * mul;
});

const simTimeLabel = computed(() => fmtSimTime(simTimeSec.value));
const dayIndex = computed(() => Math.floor(simTimeSec.value / 86400));
const secOfDay = computed(() => {
  const start = (cfg.startDayTimeMin ?? 0) * 60;
  const s = (simTimeSec.value + start) % 86400;
  return s < 0 ? s + 86400 : s;
});
const dayTimeLabel = computed(() => fmtHmsFromSec(secOfDay.value));

const runtimeUnitRows = computed(() => {
  void worldVersion.value;
  void simTimeSec.value;
  return simulation.getRuntimeRows().map((r) => ({
    id: r.id,
    name: r.name,
    color: r.color,
    kind: r.kind,
    schedule: r.schedule ? `${fmtHm(r.schedule.fromMin)}-${fmtHm(r.schedule.toMin)}` : '--',
    home: r.home,
    activeRange: fmtRange(r.activeRange),
    avgT: r.avgT,
    cells: r.cells,
    heaters: r.heaters,
  }));
});

const viewModeLabel = computed(() => {
  if (viewMode.value === 'infra') return 'Infrastructure';
  if (viewMode.value === 'temp') return 'Temperature';
  if (viewMode.value === 'combo') return 'Combo';
  return 'Units';
});

const matDialog = reactive<{ open: boolean; mode: 'add' | 'edit' }>({ open: false, mode: 'add' });
const matForm = reactive({
  id: '',
  name: '',
  cap: 100,
  k: 0.2,
  color: '#888888',
  emitTemp: null as number | null,
});

const unitDialog = reactive<{ open: boolean; mode: 'add' | 'edit' }>({ open: false, mode: 'add' });
const unitForm = reactive({
  id: '',
  name: '',
  color: '#888888',
  sharedMin: 14,
  sharedMax: 22,
  homeFromMin: 22 * 60,
  homeToMin: 6 * 60,
  homeMin: 20,
  homeMax: 22,
  awayMin: 16,
  awayMax: 18,
});

function getUnitById(id: string) {
  return world.value?.units?.[id] ?? null;
}

function onKeyDown(e: KeyboardEvent) {
  if (e.code === 'Space') spaceDown.value = true;
}

function onKeyUp(e: KeyboardEvent) {
  if (e.code === 'Space') spaceDown.value = false;
}

function onPanDown(e: PointerEvent) {
  if (!viewportEl.value || !spaceDown.value) return;
  panning = true;
  panStart = {
    x: e.clientX,
    y: e.clientY,
    sl: viewportEl.value.scrollLeft,
    st: viewportEl.value.scrollTop,
  };
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}

function onPanMove(e: PointerEvent) {
  if (!panning || !viewportEl.value) return;
  const dx = e.clientX - panStart.x;
  const dy = e.clientY - panStart.y;
  viewportEl.value.scrollLeft = panStart.sl - dx;
  viewportEl.value.scrollTop = panStart.st - dy;
}

function onPanUp() {
  panning = false;
}

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

function zoomAt(clientX: number, clientY: number, newScale: number) {
  const vp = viewportEl.value;
  const wld = world.value;
  if (!vp || !wld) return;

  const rect = vp.getBoundingClientRect();
  const oldScale = scale.value;
  newScale = clamp(newScale, minScale, maxScale);
  if (newScale === oldScale) return;

  const mx = clientX - rect.left;
  const my = clientY - rect.top;
  const worldX = (vp.scrollLeft + mx) / oldScale;
  const worldY = (vp.scrollTop + my) / oldScale;

  scale.value = newScale;
  setupCanvasSize();
  requestRender();

  requestAnimationFrame(() => {
    vp.scrollLeft = worldX * newScale - mx;
    vp.scrollTop = worldY * newScale - my;
  });
}

function onWheel(evt: WheelEvent) {
  if (!evt.ctrlKey) return;
  evt.preventDefault();
  const dir = evt.deltaY < 0 ? 1 : -1;
  const factor = dir > 0 ? zoomStep : 1 / zoomStep;
  zoomAt(evt.clientX, evt.clientY, scale.value * factor);
}

function fmtSimTime(secTotal: number) {
  const sec = Math.max(0, Math.floor(secTotal));
  const days = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return days > 0 ? `Day ${days} ${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`;
}

function fmtHm(minOfDay: number) {
  const m = ((Math.floor(minOfDay) % 1440) + 1440) % 1440;
  const hh = String(Math.floor(m / 60)).padStart(2, '0');
  const mm = String(m % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

function fmtHmsFromSec(secOfDayValue: number) {
  const s = ((Math.floor(secOfDayValue) % 86400) + 86400) % 86400;
  const hh = String(Math.floor(s / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function fmtRange(r: TempRange) {
  return `${r.min}-${r.max} C`;
}

function setupCanvasSize() {
  if (!canvasEl.value || !contentEl.value || !world.value) return;
  canvasEl.value.width = world.value.w;
  canvasEl.value.height = world.value.h;
  contentEl.value.style.width = `${world.value.w * scale.value}px`;
  contentEl.value.style.height = `${world.value.h * scale.value}px`;
  canvasEl.value.style.cursor = paintTool.value === 'pick' ? 'crosshair' : 'cell';
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function normRange(min: number, max: number): TempRange {
  const a = Number(min);
  const b = Number(max);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return { min: 0, max: 0 };
  return a <= b ? { min: a, max: b } : { min: b, max: a };
}

function heatColor(t01: number) {
  const x = clamp01(t01);
  if (x < 0.33) {
    const k = x / 0.33;
    return [0, Math.round(255 * k), 255] as const;
  }
  if (x < 0.66) {
    const k = (x - 0.33) / 0.33;
    return [Math.round(255 * k), 255, Math.round(255 * (1 - k))] as const;
  }
  const k = (x - 0.66) / 0.34;
  return [255, Math.round(255 * (1 - k)), 0] as const;
}

function hexToRgb(hex: string): [number, number, number] {
  const s = hex.replace('#', '').trim();
  const full =
    s.length === 3
      ? s
          .split('')
          .map((c) => c + c)
          .join('')
      : s;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function getUnitColor(unitId: string | null): [number, number, number] {
  if (!unitId) return [30, 30, 30];
  const u = getUnitById(unitId);
  if (!u) return [120, 120, 120];
  return hexToRgb(u.color);
}

function ensureImageData(w: number, h: number, ctx: CanvasRenderingContext2D) {
  if (!imgData || imgData.width !== w || imgData.height !== h) {
    imgData = ctx.createImageData(w, h);
  }
  return imgData;
}

function requestRender(force = false) {
  needsRender = true;
  if (force) forcedRender = true;
}

function render() {
  if (!canvasEl.value || !world.value) return;
  const ctx = canvasEl.value.getContext('2d');
  if (!ctx) return;

  const { w, h, cells, materials } = world.value;

  let mn = minT.value;
  let mx = maxT.value;
  if (
    (viewMode.value === 'temp' || viewMode.value === 'combo') &&
    autoScale.value &&
    ++mmCounter % 10 === 0
  ) {
    const mm = getMinMaxT(world.value);
    mn = mm.min;
    mx = mm.max;
    minT.value = mn;
    maxT.value = mx;
  }
  const denom = mx - mn || 1e-9;
  const alpha = Math.round((comboAlpha.value / 100) * 255);
  const img = ensureImageData(w, h, ctx);

  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    const m = materials[c.materialId];
    const [br, bg, bb] = m ? hexToRgb(m.color) : ([80, 80, 80] as const);

    let r = br;
    let g = bg;
    let b = bb;

    if (viewMode.value === 'temp' || viewMode.value === 'combo') {
      const [tr, tg, tb] = heatColor((c.T - mn) / denom);
      if (viewMode.value === 'temp') {
        r = tr;
        g = tg;
        b = tb;
      } else {
        r = Math.round((tr * alpha + br * (255 - alpha)) / 255);
        g = Math.round((tg * alpha + bg * (255 - alpha)) / 255);
        b = Math.round((tb * alpha + bb * (255 - alpha)) / 255);
      }
    } else if (viewMode.value === 'units') {
      if (c.unitId) {
        const [ur, ug, ub] = getUnitColor(c.unitId);
        r = Math.round((ur * alpha + br * (255 - alpha)) / 255);
        g = Math.round((ug * alpha + bg * (255 - alpha)) / 255);
        b = Math.round((ub * alpha + bb * (255 - alpha)) / 255);
      }
    }

    const p = i * 4;
    img.data[p + 0] = r;
    img.data[p + 1] = g;
    img.data[p + 2] = b;
    img.data[p + 3] = 255;
  }

  ctx.putImageData(img, 0, 0);
}

function setup() {
  applySimulationConfig();
  simulation.setup();
  syncSimulationState();

  selectedMaterialId.value = 'air';
  selectedUnitId.value = SHARED_UNIT_ID;

  setupCanvasSize();
  if (world.value) {
    const mm = getMinMaxT(world.value);
    minT.value = mm.min;
    maxT.value = mm.max;
  }

  bumpWorld();
  requestRender(true);
}

function resetTemps() {
  applySimulationConfig();
  simulation.resetTemperatureAndTime();
  syncSimulationState();

  if (world.value) {
    const mm = getMinMaxT(world.value);
    minT.value = mm.min;
    maxT.value = mm.max;
  }

  bumpWorld();
  requestRender(true);
}

function stepOnce() {
  applySimulationConfig();
  const changed = simulation.stepOnce();
  syncSimulationState();

  if (changed) bumpWorld();
  requestRender(true);
}

function loop(ts: number) {
  if (!lastTs) lastTs = ts;
  const dtMs = ts - lastTs;
  lastTs = ts;

  applySimulationConfig();
  const changed = simulation.advanceFrame(dtMs);
  const prevRunning = running.value;
  syncSimulationState();

  if (changed) {
    bumpWorld();
    needsRender = true;
  }
  if (prevRunning && !running.value) {
    needsRender = true;
    forcedRender = true;
  }

  const limit = Math.max(1, Math.min(60, Math.floor(cfg.renderFpsLimit || 12)));
  const interval = 1000 / limit;
  if (needsRender && (forcedRender || ts - lastRenderTs >= interval)) {
    forcedRender = false;
    lastRenderTs = ts;
    render();
    needsRender = false;

    fpsFrames += 1;
    if (!fpsLastTs) fpsLastTs = ts;
    const dt = ts - fpsLastTs;
    if (dt >= 500) {
      fps.value = (fpsFrames * 1000) / dt;
      fpsFrames = 0;
      fpsLastTs = ts;
    }
  }

  rafId.value = requestAnimationFrame(loop);
}

function toggleRun() {
  simulation.toggleRun();
  syncSimulationState();
  if (running.value) requestRender(true);
}

function getCellIndexFromEvent(evt: PointerEvent) {
  if (!canvasEl.value || !world.value) return null;
  const rect = canvasEl.value.getBoundingClientRect();
  const x = Math.floor(((evt.clientX - rect.left) / rect.width) * world.value.w);
  const y = Math.floor(((evt.clientY - rect.top) / rect.height) * world.value.h);
  if (x < 0 || y < 0 || x >= world.value.w || y >= world.value.h) return null;
  return y * world.value.w + x;
}

function applyPaint(i: number) {
  if (!world.value || locked.value) return;

  if (tab.value === 'units') {
    const picked = simulation.applyUnitTool(i, unitPaintTool.value, selectedUnitId.value);
    if (picked) selectedUnitId.value = picked;
  } else {
    const picked = simulation.applyMaterialTool(i, paintTool.value, selectedMaterialId.value);
    if (picked) selectedMaterialId.value = picked;
  }

  bumpWorld();
}

function onPointerDown(evt: PointerEvent) {
  if (!world.value || spaceDown.value || locked.value) return;

  (evt.currentTarget as HTMLCanvasElement).setPointerCapture(evt.pointerId);
  painting = true;

  const i = getCellIndexFromEvent(evt);
  if (i == null) return;

  lastPaintIndex = i;
  applyPaint(i);
  requestRender();
}

function onPointerMove(evt: PointerEvent) {
  if (!painting || !world.value || locked.value) return;
  if (paintTool.value === 'pick') return;

  const i = getCellIndexFromEvent(evt);
  if (i == null || i === lastPaintIndex) return;

  lastPaintIndex = i;
  applyPaint(i);
  requestRender();
}

function onPointerUp() {
  painting = false;
  lastPaintIndex = null;
}

function openAdd() {
  if (locked.value) return;
  matDialog.mode = 'add';
  matForm.id = '';
  matForm.name = '';
  matForm.cap = 150;
  matForm.k = 0.2;
  matForm.color = '#888888';
  matForm.emitTemp = null;
  matDialog.open = true;
}

function openEdit(id: string) {
  if (locked.value || !world.value) return;
  const m = world.value.materials[id];
  if (!m) return;

  matDialog.mode = 'edit';
  matForm.id = m.id;
  matForm.name = m.name;
  matForm.cap = m.cap;
  matForm.k = m.k;
  matForm.color = m.color;
  matForm.emitTemp = m.emitTemp;
  matDialog.open = true;
}

function normalizeId(s: string) {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

function saveMaterial() {
  if (locked.value || !world.value) return;

  const id = matDialog.mode === 'add' ? normalizeId(matForm.id) : matForm.id;
  if (!id) return;

  const material: Material = {
    id,
    name: matForm.name.trim() || id,
    cap: Math.max(1e-9, Number(matForm.cap) || 1),
    k: Math.max(0, Number(matForm.k) || 0),
    color: matForm.color?.trim() || '#888888',
    emitTemp: matForm.emitTemp == null ? null : Number(matForm.emitTemp),
  };

  if (!simulation.upsertMaterial(material)) return;
  selectedMaterialId.value = id;
  matDialog.open = false;
  bumpWorld();
  requestRender();
}

function removeMaterial(id: string) {
  if (locked.value || !world.value || id === 'air') return;
  if (!simulation.removeMaterial(id, 'air')) return;
  if (selectedMaterialId.value === id) selectedMaterialId.value = 'air';
  bumpWorld();
  requestRender();
}

function openAddUnit() {
  if (locked.value) return;

  unitDialog.mode = 'add';
  unitForm.id = '';
  unitForm.name = '';
  unitForm.color = '#888888';
  unitForm.homeFromMin = 800;
  unitForm.homeToMin = 240;
  unitForm.homeMin = 20;
  unitForm.homeMax = 22;
  unitForm.awayMin = 16;
  unitForm.awayMax = 18;
  unitForm.sharedMin = 14;
  unitForm.sharedMax = 22;
  unitDialog.open = true;
}

function openEditUnit(id: string) {
  if (locked.value) return;

  const u = getUnitById(id);
  if (!u) return;

  unitDialog.mode = 'edit';
  unitForm.id = u.id;
  unitForm.name = u.name;
  unitForm.color = u.color;

  if (u.params.kind === 'shared') {
    unitForm.sharedMin = u.params.comfy.min;
    unitForm.sharedMax = u.params.comfy.max;
  } else {
    unitForm.homeFromMin = u.params.homeFromMin;
    unitForm.homeToMin = u.params.homeToMin;
    unitForm.homeMin = u.params.home.min;
    unitForm.homeMax = u.params.home.max;
    unitForm.awayMin = u.params.away.min;
    unitForm.awayMax = u.params.away.max;
  }

  unitDialog.open = true;
}

function normalizeUnitId(s: string) {
  return s
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9_-]/g, '');
}

function saveUnit() {
  if (!world.value || locked.value) return;

  const id = unitDialog.mode === 'add' ? normalizeUnitId(unitForm.id) : unitForm.id;
  if (!id) return;
  if (id === SHARED_UNIT_ID && unitDialog.mode === 'add') return;

  const isShared = id === SHARED_UNIT_ID;
  const params: UnitParams = isShared
    ? { kind: 'shared', comfy: normRange(unitForm.sharedMin, unitForm.sharedMax) }
    : {
        kind: 'unit',
        homeFromMin: clamp(Math.floor(Number(unitForm.homeFromMin) || 0), 0, 1439),
        homeToMin: clamp(Math.floor(Number(unitForm.homeToMin) || 0), 0, 1439),
        home: normRange(unitForm.homeMin, unitForm.homeMax),
        away: normRange(unitForm.awayMin, unitForm.awayMax),
      };

  const unit: Unit = {
    id,
    name: unitForm.name.trim() || id,
    color: unitForm.color?.trim() || '#888888',
    params,
  };

  const ok = unitDialog.mode === 'add' ? simulation.addUnit(unit) : simulation.updateUnit(unit);
  if (!ok) return;

  if (unitDialog.mode === 'add') selectedUnitId.value = id;
  unitDialog.open = false;
  bumpWorld();
  requestRender(true);
}

function removeUnit(id: string) {
  if (!world.value || id === SHARED_UNIT_ID || locked.value) return;
  if (!simulation.removeUnit(id)) return;
  if (selectedUnitId.value === id) selectedUnitId.value = SHARED_UNIT_ID;
  bumpWorld();
  requestRender(true);
}

watch(paintTool, () => {
  setupCanvasSize();
  requestRender();
});
watch(viewMode, () => requestRender());
watch(comboAlpha, () => requestRender());
watch(autoScale, () => requestRender());
watch(scale, () => {
  setupCanvasSize();
  requestRender();
});

onMounted(() => {
  setup();
  rafId.value = requestAnimationFrame(loop);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
});

onBeforeUnmount(() => {
  if (rafId.value != null) cancelAnimationFrame(rafId.value);
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('keyup', onKeyUp);
});
</script>

<style scoped>
.canvas-wrap {
  display: flex;
  justify-content: center;
  align-items: center;
  overflow: auto;
  padding: 8px;
}

.canvas-viewport {
  width: 100%;
  height: 560px; /* nebo min(70vh, 720px) */
  overflow: auto;
  background: rgba(0, 0, 0, 0.18);
  border-radius: 12px;
  position: relative;
  user-select: none;
}

.canvas-content {
  position: relative;
  width: 0px; /* set by JS */
  height: 0px; /* set by JS */
}

.canvas-content canvas {
  display: block;
  width: 100%;
  height: 100%;
  image-rendering: pixelated;
  border-radius: 12px;
}

.mat-swatch {
  width: 18px;
  height: 18px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.25);
}

.temp-legend-bar {
  height: 14px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: linear-gradient(
    to right,
    rgb(0, 0, 255),
    rgb(0, 255, 255),
    rgb(255, 255, 0),
    rgb(255, 0, 0)
  );
}
</style>
