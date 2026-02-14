<template>
  <q-page class="q-pa-md">
    <div class="row q-col-gutter-md">
      <!-- LEFT: controls -->
      <div class="col-12 col-md-4">
        <q-card>
          <q-card-section>
            <div class="text-h6">Heat Diffusion (MVP)</div>
            <div class="text-caption text-grey-7">
              Grid + neighbors4 diffusion, fixed boundary temperatures
            </div>
          </q-card-section>

          <q-separator />

          <q-card-section class="q-gutter-md">
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
            <q-input v-model.number="cfg.cap" type="number" label="Capacity (cap)" dense outlined />
            <q-input v-model.number="cfg.g" type="number" label="Conductance (g)" dense outlined />
            <q-input v-model.number="cfg.dt" type="number" label="dt (time step)" dense outlined />

            <div class="text-subtitle2 q-mt-sm">Boundary temperatures</div>
            <div class="row q-col-gutter-sm">
              <div class="col-6">
                <q-input
                  v-model.number="cfg.boundary.left"
                  type="number"
                  label="Left"
                  dense
                  outlined
                />
              </div>
              <div class="col-6">
                <q-input
                  v-model.number="cfg.boundary.right"
                  type="number"
                  label="Right"
                  dense
                  outlined
                />
              </div>
              <div class="col-6">
                <q-input
                  v-model.number="cfg.boundary.top"
                  type="number"
                  label="Top"
                  dense
                  outlined
                />
              </div>
              <div class="col-6">
                <q-input
                  v-model.number="cfg.boundary.bottom"
                  type="number"
                  label="Bottom"
                  dense
                  outlined
                />
              </div>
            </div>

            <div class="row q-col-gutter-sm q-mt-sm">
              <div class="col-12">
                <q-btn
                  class="full-width"
                  unelevated
                  color="primary"
                  label="Setup (reset)"
                  @click="setup()"
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
                Tick: <b>{{ tick }}</b>
              </div>
              <div>
                Min/Max T: <b>{{ minT.toFixed(2) }}</b> / <b>{{ maxT.toFixed(2) }}</b>
              </div>
              <div class="text-caption text-grey-7 q-mt-xs">
                Tip: když to “exploduje”, sniž dt nebo g, nebo zvyš cap.
              </div>
            </div>
          </q-card-section>
        </q-card>
      </div>

      <!-- RIGHT: canvas -->
      <div class="col-12 col-md-8">
        <q-card>
          <q-card-section>
            <div class="row items-center justify-between">
              <div>
                <div class="text-h6">Heatmap</div>
                <div class="text-caption text-grey-7">1 cell = 1 pixel (scaled)</div>
              </div>

              <q-toggle v-model="autoScale" label="Auto scale colors" />
            </div>
          </q-card-section>

          <q-separator />

          <q-card-section>
            <div class="canvas-wrap">
              <canvas ref="canvasEl" />
            </div>
          </q-card-section>
        </q-card>
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { createWorld, getMinMaxT, stepWorld, type World } from 'src/sim/heatWorld';

const canvasEl = ref<HTMLCanvasElement | null>(null);

const cfg = reactive({
  w: 140,
  h: 90,
  initTemp: 10,
  cap: 50, // bigger = slower change
  g: 1.2, // bigger = faster diffusion
  dt: 0.08, // time step
  boundary: {
    left: 80,
    right: 0,
    top: 10,
    bottom: 10,
  },
});

let world: World | null = null;

const tick = ref(0);
const running = ref(false);
const rafId = ref<number | null>(null);

const autoScale = ref(true);
const minT = ref(0);
const maxT = ref(100);

// --- rendering helpers ---
function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

// simple heat colormap: blue -> cyan -> yellow -> red (no libs)
function heatColor(t01: number) {
  // piecewise gradient, returns [r,g,b]
  const x = clamp01(t01);

  // 0..0.33: blue -> cyan
  if (x < 0.33) {
    const k = x / 0.33;
    const r = 0;
    const g = Math.round(255 * k);
    const b = 255;
    return [r, g, b];
  }

  // 0.33..0.66: cyan -> yellow
  if (x < 0.66) {
    const k = (x - 0.33) / 0.33;
    const r = Math.round(255 * k);
    const g = 255;
    const b = Math.round(255 * (1 - k));
    return [r, g, b];
  }

  // 0.66..1: yellow -> red
  const k = (x - 0.66) / 0.34;
  const r = 255;
  const g = Math.round(255 * (1 - k));
  const b = 0;
  return [r, g, b];
}

function setupCanvasSize() {
  if (!canvasEl.value || !world) return;

  // scale up for visibility
  const scale = 6; // change as you like
  canvasEl.value.width = world.w;
  canvasEl.value.height = world.h;

  canvasEl.value.style.width = `${world.w * scale}px`;
  canvasEl.value.style.height = `${world.h * scale}px`;

  canvasEl.value.style.imageRendering = 'pixelated';
  canvasEl.value.style.borderRadius = '12px';
}

function render() {
  if (!canvasEl.value || !world) return;

  const ctx = canvasEl.value.getContext('2d');
  if (!ctx) return;

  const { w, h, cells } = world;
  const img = ctx.createImageData(w, h);

  // determine scaling
  let mn = minT.value;
  let mx = maxT.value;
  if (autoScale.value) {
    const mm = getMinMaxT(world);
    mn = mm.min;
    mx = mm.max;
    minT.value = mn;
    maxT.value = mx;
  }
  const denom = mx - mn || 1e-9;

  for (let i = 0; i < cells.length; i++) {
    const t01 = (cells[i].T - mn) / denom;
    const [r, g, b] = heatColor(t01);

    const p = i * 4;
    img.data[p + 0] = r;
    img.data[p + 1] = g;
    img.data[p + 2] = b;
    img.data[p + 3] = 255;
  }

  ctx.putImageData(img, 0, 0);
}

function setup() {
  // basic guards
  const w = Math.max(10, Math.min(500, Math.floor(cfg.w)));
  const h = Math.max(10, Math.min(500, Math.floor(cfg.h)));

  world = createWorld({
    w,
    h,
    initTemp: cfg.initTemp,
    cap: Math.max(1e-6, cfg.cap),
    g: Math.max(0, cfg.g),
    boundary: { ...cfg.boundary },
  });

  tick.value = 0;
  setupCanvasSize();
  // update min/max right away
  const mm = getMinMaxT(world);
  minT.value = mm.min;
  maxT.value = mm.max;

  render();
}

function stepOnce() {
  if (!world) return;
  stepWorld(world, cfg.dt);
  tick.value++;
  render();
}

function loop() {
  if (!running.value) return;
  stepOnce();
  rafId.value = requestAnimationFrame(loop);
}

function toggleRun() {
  running.value = !running.value;
  if (running.value) {
    rafId.value = requestAnimationFrame(loop);
  } else if (rafId.value != null) {
    cancelAnimationFrame(rafId.value);
    rafId.value = null;
  }
}

onMounted(() => {
  setup();
});

onBeforeUnmount(() => {
  if (rafId.value != null) cancelAnimationFrame(rafId.value);
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
</style>
