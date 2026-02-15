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
                />

                <q-select
                  v-model="selectedMaterialId"
                  :options="materialOptions"
                  label="Selected material"
                  dense
                  outlined
                  emit-value
                  map-options
                />

                <div class="text-caption text-grey-7 q-mt-xs">
                  Paint = maluj dragem • Pick = klikem vybereš materiál z buňky • Fill = vyplní
                  souvislou oblast stejného materiálu
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
                    @click="openAdd()"
                  />
                </div>

                <q-list bordered class="q-mt-sm">
                  <q-item
                    v-for="m in materialsList"
                    :key="m.id"
                    clickable
                    v-ripple
                    @click="selectedMaterialId = m.id"
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
                        cap={{ m.cap }} • k={{ m.k }}
                        <span v-if="m.emitTemp != null">
                          • emit={{ m.emitTemp }}°C @ {{ m.emitStrength }}</span
                        >
                      </q-item-label>
                    </q-item-section>

                    <q-item-section side>
                      <q-btn flat dense icon="edit" @click.stop="openEdit(m.id)" />
                      <q-btn
                        flat
                        dense
                        icon="delete"
                        color="negative"
                        :disable="m.id === 'air'"
                        @click.stop="removeMaterial(m.id)"
                      />
                    </q-item-section>
                  </q-item>
                </q-list>

                <div class="text-caption text-grey-7 q-mt-sm">
                  Pozn.: smazání materiálu nahradí jeho buňky za <b>air</b>.
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
                />

                <q-btn-toggle
                  v-model="unitPaintTool"
                  spread
                  unelevated
                  class="q-mt-sm"
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
                    clickable
                    v-ripple
                    @click="selectedUnitId = u.id"
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
                      <q-btn flat dense icon="edit" @click.stop="openEditUnit(u.id)" />
                      <q-btn
                        flat
                        dense
                        icon="delete"
                        color="negative"
                        :disable="u.id === SHARED_UNIT_ID"
                        @click.stop="removeUnit(u.id)"
                      />
                    </q-item-section>
                  </q-item>
                </q-list>

                <div class="text-caption text-grey-7 q-mt-sm">
                  Tip: přepni View na <b>Units</b>, a pak maluj přiřazení buněk k bytům / shared.
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
                  Paint on grid • View: {{ viewModeLabel }}
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
                <div class="text-caption text-grey-7">Temperature scale (°C)</div>
                <div class="text-caption">
                  <b>{{ minT.toFixed(1) }}</b> → <b>{{ maxT.toFixed(1) }}</b>
                </div>
              </div>

              <div class="temp-legend-bar" />

              <div class="row justify-between q-mt-xs">
                <div class="text-caption text-grey-7">{{ minT.toFixed(1) }}°C</div>
                <div class="text-caption text-grey-7">{{ ((minT + maxT) / 2).toFixed(1) }}°C</div>
                <div class="text-caption text-grey-7">{{ maxT.toFixed(1) }}°C</div>
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
            <div class="col-6">
              <q-input
                v-model.number="matForm.emitTemp"
                type="number"
                label="emitTemp (°C) - empty = none"
                dense
                outlined
                clearable
              />
            </div>
            <div class="col-6">
              <q-input
                v-model.number="matForm.emitStrength"
                type="number"
                label="emitStrength"
                dense
                outlined
              />
            </div>
          </div>

          <div class="text-caption text-grey-7">
            Tip: Heater = emitTemp 50–70, emitStrength 1–4 • AC = emitTemp 16–20
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
            hint="Např. A, B, C, A1..."
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
import { computed, onBeforeUnmount, onMounted, reactive, ref, markRaw } from 'vue';
import {
  createWorld,
  defaultMaterials,
  deleteMaterial,
  getMinMaxT,
  nToXy,
  stepWorld,
  xyToN,
  type Material,
  type World,
} from 'src/sim/heatWorld';

const canvasEl = ref<HTMLCanvasElement | null>(null);
const viewportEl = ref<HTMLDivElement | null>(null);
const contentEl = ref<HTMLDivElement | null>(null);
let imgData: ImageData | null = null;

const tab = ref<'sim' | 'edit' | 'mats'>('sim');

const cfg = reactive({
  w: 140,
  h: 90,
  initTemp: 18,
  dt: 1,
  simTicksPerSec: 200,
  renderFpsLimit: 12,
});

const world = ref<World | null>(null);

const tick = ref(0);
const running = ref(false);
const rafId = ref<number | null>(null);

let lastTs = 0;
let simAccMs = 0;
const simTimeSec = ref(0);
const fps = ref(0); // měřený FPS (render)

let needsRender = false;
let forcedRender = false; // render ASAP
let lastRenderTs = 0; // timestamp posledního renderu
let fpsFrames = 0;
let fpsLastTs = 0;

const autoScale = ref(true);
const minT = ref(0);
const maxT = ref(60);
let mmCounter = 0;

type ViewMode = 'infra' | 'temp' | 'combo' | 'units';
const viewMode = ref<ViewMode>('combo');
const comboAlpha = ref(20); // 0..100

const scale = ref(6); // zoom faktor
const minScale = 1;
const maxScale = 30;

// volitelně: jemnější zoom
const zoomStep = 1.12; // 12% per wheel tick (feel good)
const spaceDown = ref(false);

let panning = false;
let panStart = { x: 0, y: 0, sl: 0, st: 0 };

type UnitDef = { id: string; name: string; color: string };

const SHARED_UNIT_ID = 'shared';

const units = reactive<UnitDef[]>([
  { id: SHARED_UNIT_ID, name: 'Shared space', color: '#9E9E9E' },
  { id: 'A', name: 'Unit A', color: '#8E44AD' },
  { id: 'B', name: 'Unit B', color: '#27AE60' },
]);

const selectedUnitId = ref<UnitDef['id']>(SHARED_UNIT_ID);

type UnitPaintTool = 'assign' | 'pick' | 'fill' | 'clear';
const unitPaintTool = ref<UnitPaintTool>('assign');

const viewModeLabel = computed(() => {
  if (viewMode.value === 'infra') return 'Infrastructure';
  if (viewMode.value === 'temp') return 'Temperature';
  if (viewMode.value === 'combo') return 'Combo';
  return 'Units';
});

// --- editor state ---
type PaintTool = 'paint' | 'pick' | 'fill';
const paintTool = ref<PaintTool>('paint');

const selectedMaterialId = ref('air');

const materialOptions = computed(() => {
  if (!world.value) return [];
  return Object.values(world.value.materials).map((m) => ({
    label: `${m.name} (${m.id})`,
    value: m.id,
  }));
});

const materialsList = computed(() => {
  if (!world.value) return [];
  return Object.values(world.value.materials).sort((a, b) => a.name.localeCompare(b.name));
});

const simTimeLabel = computed(() => fmtSimTime(simTimeSec.value));

const unitsList = computed(() => units.slice());

const unitOptions = computed(() =>
  units.map((u) => ({ label: `${u.name} (${u.id})`, value: u.id })),
);

// --- dialog for materials ---
const matDialog = reactive<{ open: boolean; mode: 'add' | 'edit' }>({
  open: false,
  mode: 'add',
});

const matForm = reactive<{
  id: string;
  name: string;
  cap: number;
  k: number;
  color: string;
  emitTemp: number | null;
  emitStrength: number;
}>({
  id: '',
  name: '',
  cap: 100,
  k: 0.2,
  color: '#888888',
  emitTemp: null,
  emitStrength: 0,
});

const unitDialog = reactive<{ open: boolean; mode: 'add' | 'edit' }>({
  open: false,
  mode: 'add',
});

const unitForm = reactive<{ id: string; name: string; color: string }>({
  id: '',
  name: '',
  color: '#888888',
});

function getUnitById(id: string) {
  return units.find((u) => u.id === id) || null;
}

function onKeyDown(e: KeyboardEvent) {
  if (e.code === 'Space') spaceDown.value = true;
}
function onKeyUp(e: KeyboardEvent) {
  if (e.code === 'Space') spaceDown.value = false;
}

function onPanDown(e: PointerEvent) {
  if (!viewportEl.value) return;

  // panuj jen když držíš space
  if (!spaceDown.value) return;

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

/**
 * Zoom around mouse position inside viewport:
 * keeps the point under cursor stable.
 */
function zoomAt(clientX: number, clientY: number, newScale: number) {
  const vp = viewportEl.value;
  const wld = world.value;
  if (!vp || !wld) return;

  const rect = vp.getBoundingClientRect();
  const oldScale = scale.value;

  newScale = clamp(newScale, minScale, maxScale);
  if (newScale === oldScale) return;

  // mouse in viewport coords
  const mx = clientX - rect.left;
  const my = clientY - rect.top;

  // content coords under mouse (scaled pixels)
  const contentX = vp.scrollLeft + mx;
  const contentY = vp.scrollTop + my;

  // convert to world coords (unscaled pixels)
  const worldX = contentX / oldScale;
  const worldY = contentY / oldScale;

  // apply new scale
  scale.value = newScale;
  setupCanvasSize();
  requestRender();

  // after layout updates, restore scroll so the same world point stays under cursor
  requestAnimationFrame(() => {
    const newContentX = worldX * newScale;
    const newContentY = worldY * newScale;
    vp.scrollLeft = newContentX - mx;
    vp.scrollTop = newContentY - my;
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

  // "Day 12 03:05:09" / "03:05:09"
  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return days > 0 ? `Day ${days} ${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`;
}

// --- canvas sizing ---
function setupCanvasSize() {
  if (!canvasEl.value || !contentEl.value || !world.value) return;

  canvasEl.value.width = world.value.w;
  canvasEl.value.height = world.value.h;

  contentEl.value.style.width = `${world.value.w * scale.value}px`;
  contentEl.value.style.height = `${world.value.h * scale.value}px`;
  canvasEl.value.style.cursor = paintTool.value === 'pick' ? 'crosshair' : 'cell';
}

// --- color helpers ---
function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

// temperature colormap: blue -> cyan -> yellow -> red
function heatColor(t01: number) {
  const x = clamp01(t01);

  if (x < 0.33) {
    const k = x / 0.33;
    return [0, Math.round(255 * k), 255];
  }
  if (x < 0.66) {
    const k = (x - 0.33) / 0.33;
    return [Math.round(255 * k), 255, Math.round(255 * (1 - k))];
  }
  const k = (x - 0.66) / 0.34;
  return [255, Math.round(255 * (1 - k)), 0];
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
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return [r, g, b];
}

function getUnitColor(unitId: string | null): [number, number, number] {
  if (!unitId) return [30, 30, 30]; // unassigned
  const u = getUnitById(unitId);
  if (!u) return [120, 120, 120];
  return hexToRgb(u.color);
}

// --- rendering ---
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

  // compute min/max for temp view
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

  const img = ensureImageData(w, h, ctx);

  const alpha = Math.round((comboAlpha.value / 100) * 255);

  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    const m = materials[c.materialId];

    // base infrastructure
    const [br, bg, bb] = m ? hexToRgb(m.color) : ([80, 80, 80] as const);

    let r = br,
      g = bg,
      b = bb;

    if (viewMode.value === 'infra') {
      // just infra
      r = br;
      g = bg;
      b = bb;
    } else if (viewMode.value === 'temp') {
      // just temp
      const t01 = (c.T - mn) / denom;
      const [tr, tg, tb] = heatColor(t01);
      r = tr;
      g = tg;
      b = tb;
    } else if (viewMode.value === 'combo') {
      // temp over infra
      const t01 = (c.T - mn) / denom;
      const [tr, tg, tb] = heatColor(t01);
      r = Math.round((tr * alpha + br * (255 - alpha)) / 255);
      g = Math.round((tg * alpha + bg * (255 - alpha)) / 255);
      b = Math.round((tb * alpha + bb * (255 - alpha)) / 255);
    } else if (viewMode.value === 'units') {
      // units over infra (same alpha slider)
      const [ur, ug, ub] = getUnitColor(c.unitId);

      // Pokud unitId není, overlay nedávej (nech infra)
      // (alternativně můžeš i pro null vracet šedou barvu)
      if (c.unitId) {
        r = Math.round((ur * alpha + br * (255 - alpha)) / 255);
        g = Math.round((ug * alpha + bg * (255 - alpha)) / 255);
        b = Math.round((ub * alpha + bb * (255 - alpha)) / 255);
      } else {
        r = br;
        g = bg;
        b = bb;
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

// --- simulation control ---
function setup() {
  const w = Math.max(10, Math.min(500, Math.floor(cfg.w)));
  const h = Math.max(10, Math.min(500, Math.floor(cfg.h)));

  const mats = defaultMaterials();
  const wld = createWorld({
    w,
    h,
    initTemp: cfg.initTemp,
    materials: mats,
    defaultMaterialId: 'air',
  });
  wld.cells = markRaw(wld.cells);
  world.value = reactive(wld) as World;

  selectedMaterialId.value = 'air';

  tick.value = 0;
  simTimeSec.value = 0;
  setupCanvasSize();

  const mm = getMinMaxT(world.value);
  minT.value = mm.min;
  maxT.value = mm.max;

  requestRender(true);
}

function resetTemps() {
  if (!world.value) return;
  for (const c of world.value.cells) c.T = cfg.initTemp;
  tick.value = 0;
  simTimeSec.value = 0;
  requestRender(true);
}

function stepOnce() {
  if (!world.value) return;
  stepWorld(world.value, cfg.dt);
  tick.value++;
  simTimeSec.value += cfg.dt;
  requestRender(true);
}

function loop(ts: number) {
  if (!world.value) return;

  if (!lastTs) lastTs = ts;
  const dtMs = ts - lastTs;
  lastTs = ts;

  if (running.value) {
    simAccMs += dtMs;

    const target = Math.max(1, cfg.simTicksPerSec);
    const stepMs = 1000 / target;

    if (simAccMs >= stepMs) {
      stepWorld(world.value, cfg.dt);
      tick.value += 1;
      simTimeSec.value += cfg.dt;
      needsRender = true;

      simAccMs = 0;
    }
  }

  const limit = Math.max(1, Math.min(60, Math.floor(cfg.renderFpsLimit || 12)));
  const interval = 1000 / limit;

  if (needsRender && (forcedRender || ts - lastRenderTs >= interval)) {
    forcedRender = false;
    lastRenderTs = ts;

    render();
    needsRender = false;

    fpsFrames++;
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
  running.value = !running.value;
  if (running.value) {
    needsRender = true;
    forcedRender = true;
  }
}

// --- painting helpers ---
function getCellIndexFromEvent(evt: PointerEvent) {
  if (!canvasEl.value || !world.value) return null;
  const rect = canvasEl.value.getBoundingClientRect();
  const x = Math.floor(((evt.clientX - rect.left) / rect.width) * world.value.w);
  const y = Math.floor(((evt.clientY - rect.top) / rect.height) * world.value.h);
  if (x < 0 || y < 0 || x >= world.value.w || y >= world.value.h) return null;
  return y * world.value.w + x;
}

let painting = false;
let lastPaintIndex: number | null = null;

function applyPaint(i: number) {
  if (!world.value) return;

  // pokud jsi v units tabu, maluješ unitId
  if (tab.value === 'units') {
    applyUnitPaint(i);
    return;
  }

  // jinak default: material paint
  const c = world.value.cells[i];

  if (paintTool.value === 'paint') {
    if (c.materialId !== selectedMaterialId.value) {
      c.materialId = selectedMaterialId.value;
    }
    return;
  }

  if (paintTool.value === 'pick') {
    selectedMaterialId.value = c.materialId;
    return;
  }

  if (paintTool.value === 'fill') {
    floodFill(i, c.materialId, selectedMaterialId.value);
    return;
  }
}

function applyUnitPaint(i: number) {
  if (!world.value) return;
  const c = world.value.cells[i];

  if (unitPaintTool.value === 'assign') {
    if (c.unitId !== selectedUnitId.value) c.unitId = selectedUnitId.value;
    return;
  }

  if (unitPaintTool.value === 'clear') {
    if (c.unitId != null) c.unitId = null;
    return;
  }

  if (unitPaintTool.value === 'pick') {
    selectedUnitId.value = c.unitId ?? SHARED_UNIT_ID;
    return;
  }

  if (unitPaintTool.value === 'fill') {
    const to = selectedUnitId.value;
    floodFillUnit(i, to);
    return;
  }
}

function floodFill(startIndex: number, fromId: string, toId: string) {
  if (!world.value) return;
  if (fromId === toId) return;

  const { w, h, cells } = world.value;
  const visited = new Uint8Array(w * h);
  const stack: number[] = [startIndex];

  while (stack.length) {
    const n = stack.pop()!;
    if (visited[n]) continue;
    visited[n] = 1;

    if (cells[n].materialId !== fromId) continue;
    cells[n].materialId = toId;

    const { x, y } = nToXy(n, w);

    // neighbors4
    if (x > 0) stack.push(xyToN({ x: x - 1, y }, w));
    if (x < w - 1) stack.push(xyToN({ x: x + 1, y }, w));
    if (y > 0) stack.push(xyToN({ x, y: y - 1 }, w));
    if (y < h - 1) stack.push(xyToN({ x, y: y + 1 }, w));
  }
}

function floodFillUnit(startIndex: number, toUnitId: string | null) {
  if (!world.value) return;

  const { w, h, cells } = world.value;

  const fromMat = cells[startIndex].materialId;
  const fromUnit = cells[startIndex].unitId;

  // když filluješ na stejný unitId, nemá to smysl
  if (fromUnit === toUnitId) return;

  const visited = new Uint8Array(w * h);
  const stack: number[] = [startIndex];

  while (stack.length) {
    const n = stack.pop()!;
    if (visited[n]) continue;
    visited[n] = 1;

    const c = cells[n];

    // BARIÉRY:
    // 1) jiný materiál => stop
    if (c.materialId !== fromMat) continue;

    // 2) jiný unitId (než start) => stop
    //    => nepřejedeš do jiné jednotky ani do "nepatřící" oblasti
    if (c.unitId !== fromUnit) continue;

    // teď už víme, že jsme ve stejné místnosti/oblasti => přepiš unitId
    c.unitId = toUnitId;

    const x = n % w;
    const y = (n / w) | 0;

    // neighbors4
    if (x > 0) stack.push(n - 1);
    if (x < w - 1) stack.push(n + 1);
    if (y > 0) stack.push(n - w);
    if (y < h - 1) stack.push(n + w);
  }
}

function onPointerDown(evt: PointerEvent) {
  if (!world.value) return;
  if (spaceDown.value) return;

  (evt.currentTarget as HTMLCanvasElement).setPointerCapture(evt.pointerId);
  painting = true;

  const i = getCellIndexFromEvent(evt);
  if (i == null) return;

  lastPaintIndex = i;
  applyPaint(i);
  requestRender();
}

function onPointerMove(evt: PointerEvent) {
  if (!painting || !world.value) return;

  // pick tool should not "drag pick" in a noisy way
  if (paintTool.value === 'pick') return;

  const i = getCellIndexFromEvent(evt);
  if (i == null) return;
  if (i === lastPaintIndex) return;

  lastPaintIndex = i;
  applyPaint(i);
  requestRender();
}

function onPointerUp() {
  painting = false;
  lastPaintIndex = null;
}

// --- materials CRUD ---
function openAdd() {
  matDialog.mode = 'add';
  matForm.id = '';
  matForm.name = '';
  matForm.cap = 150;
  matForm.k = 0.2;
  matForm.color = '#888888';
  matForm.emitTemp = null;
  matForm.emitStrength = 0;
  matDialog.open = true;
}

function openEdit(id: string) {
  if (!world.value) return;
  const m = world.value.materials[id];
  if (!m) return;

  matDialog.mode = 'edit';
  matForm.id = m.id;
  matForm.name = m.name;
  matForm.cap = m.cap;
  matForm.k = m.k;
  matForm.color = m.color;
  matForm.emitTemp = m.emitTemp;
  matForm.emitStrength = m.emitStrength;
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
  if (!world.value) return;

  const id = matDialog.mode === 'add' ? normalizeId(matForm.id) : matForm.id;
  if (!id) return;

  const m: Material = {
    id,
    name: matForm.name.trim() || id,
    cap: Math.max(1e-9, Number(matForm.cap) || 1),
    k: Math.max(0, Number(matForm.k) || 0),
    color: matForm.color?.trim() || '#888888',
    emitTemp: matForm.emitTemp == null ? null : Number(matForm.emitTemp),
    emitStrength: Math.max(0, Number(matForm.emitStrength) || 0),
  };

  world.value.materials[id] = m;
  selectedMaterialId.value = id;

  matDialog.open = false;
  requestRender();
}

function removeMaterial(id: string) {
  if (!world.value) return;
  if (id === 'air') return;

  deleteMaterial(world.value, id, 'air');
  if (selectedMaterialId.value === id) selectedMaterialId.value = 'air';
  requestRender();
}

// UNIT CRUD
function openAddUnit() {
  unitDialog.mode = 'add';
  unitForm.id = '';
  unitForm.name = '';
  unitForm.color = '#888888';
  unitDialog.open = true;
}

function openEditUnit(id: string) {
  const u = getUnitById(id);
  if (!u) return;
  unitDialog.mode = 'edit';
  unitForm.id = u.id;
  unitForm.name = u.name;
  unitForm.color = u.color;
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
  const id = unitDialog.mode === 'add' ? normalizeUnitId(unitForm.id) : unitForm.id;
  if (!id) return;

  if (id === SHARED_UNIT_ID && unitDialog.mode === 'add') return; // shared reserved

  const name = unitForm.name.trim() || id;
  const color = unitForm.color?.trim() || '#888888';

  if (unitDialog.mode === 'add') {
    if (getUnitById(id)) return;
    units.push({ id, name, color });
    selectedUnitId.value = id;
  } else {
    const u = getUnitById(id);
    if (!u) return;
    u.name = name;
    u.color = color;
  }

  unitDialog.open = false;
  requestRender();
}

function removeUnit(id: string) {
  if (!world.value) return;
  if (id === SHARED_UNIT_ID) return;

  const idx = units.findIndex((u) => u.id === id);
  if (idx >= 0) units.splice(idx, 1);

  // replace in cells
  for (const c of world.value.cells) {
    if (c.unitId === id) c.unitId = null;
  }

  if (selectedUnitId.value === id) selectedUnitId.value = SHARED_UNIT_ID;
  requestRender(true);
}

// react to tool changes (cursor)
import { watch } from 'vue';
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

// lifecycle
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
  width: 0px; /* nastaví se JS */
  height: 0px; /* nastaví se JS */
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
