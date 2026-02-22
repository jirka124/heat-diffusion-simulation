<template>
  <q-page class="q-pa-md">
    <div class="row q-col-gutter-md">
      <!-- LEFT PANEL -->
      <div class="col-12 col-md-4">
        <q-card>
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

                  <q-separator class="q-my-sm" />
                  <div class="text-subtitle2 q-mb-sm">Outside temperature source</div>
                  <q-btn-toggle
                    v-model="cfg.outsideTempMode"
                    spread
                    unelevated
                    class="q-mb-sm"
                    :options="[
                      { label: 'Constant', value: 'constant' },
                      { label: 'Series', value: 'series' },
                    ]"
                  />

                  <q-input
                    v-if="cfg.outsideTempMode === 'constant'"
                    v-model.number="cfg.outsideTempConst"
                    type="number"
                    label="Outside constant (C)"
                    dense
                    outlined
                  />

                  <div v-else>
                    <q-input
                      v-model="outsideSeriesInput"
                      type="textarea"
                      dense
                      outlined
                      rows="5"
                      input-style="max-height: 160px; overflow-y: auto;"
                      label="Outside series (JSON array)"
                    />
                    <q-file
                      class="q-mt-sm"
                      :model-value="null"
                      dense
                      outlined
                      clearable
                      accept=".json,application/json"
                      label="Load series from JSON file"
                      @update:model-value="onOutsideSeriesFileSelected"
                    />
                    <div
                      class="text-caption q-mt-xs"
                      :class="outsideSeriesInvalid ? 'text-negative' : 'text-grey-7'"
                    >
                      <span v-if="outsideSeriesInvalid"
                        >Invalid format. Use JSON array (e.g. [0,-1,2]).</span
                      >
                      <span v-else
                        >Loaded values: <b>{{ cfg.outsideTempSeries.length }}</b> (1 value = 1 hour,
                        loops after end).</span
                      >
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
                  <div class="text-caption text-grey-7 q-mb-sm">
                    House heating:
                    <b>{{ formatPowerSI(houseHeatingPowerW) }}</b>
                    now | total
                    <b>{{ formatEnergySI(houseHeatingTotalJ) }}</b>
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
                        <q-item-label v-if="r.comfortTick != null" caption>
                          Comfort:
                          <b>{{ r.comfortTick.toFixed(0) }}/100</b>
                          <span class="text-grey-6">
                            (avg {{ (r.comfortAvg ?? 0).toFixed(0) }}/100)
                          </span>
                        </q-item-label>
                        <q-item-label
                          v-if="r.heaters > 0 || (r.emitterEnergyTotalJ ?? 0) > 0"
                          caption
                        >
                          Heating energy:
                          <b>{{ formatPowerSI(r.emitterPowerTickW ?? 0) }}</b>
                          now |
                          <b>{{ formatEnergySI(r.emitterEnergyTickJ ?? 0) }}</b>
                          / tick | total
                          <b>{{ formatEnergySI(r.emitterEnergyTotalJ ?? 0) }}</b>
                        </q-item-label>
                        <q-item-label v-if="r.heatFlows.length > 0" caption>
                          Flows (+out | -in)
                          <div class="flow-list">
                            <div
                              v-for="f in r.heatFlows"
                              :key="`${r.id}-${f.targetId}`"
                              class="flow-row"
                            >
                              <span
                                class="mat-swatch flow-swatch"
                                :style="{ background: flowTargetColor(f.targetId) }"
                              />
                              <span class="flow-name">{{ f.targetName }}</span>
                              <span
                                class="flow-val"
                                :style="{ color: flowDirectionColor(f.tick) }"
                                >{{ formatEnergySI(f.tick) }}</span
                              >
                              <span
                                class="flow-val"
                                :style="{ color: flowDirectionColor(f.total) }"
                                >{{ formatEnergySI(f.total) }}</span
                              >
                            </div>
                          </div>
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

                  <q-toggle
                    v-model="showZoneDebug"
                    label="Zone debug (connected parts)"
                    class="q-mt-sm"
                  />
                  <q-list v-if="showZoneDebug" bordered separator class="q-mt-sm">
                    <q-item v-for="u in unitZoneDebugRows" :key="`zone-debug-${u.id}`">
                      <q-item-section avatar>
                        <div class="mat-swatch" :style="{ background: u.color }" />
                      </q-item-section>
                      <q-item-section>
                        <q-item-label>
                          {{ u.name }}
                          <span class="text-caption text-grey-7">({{ u.id }})</span>
                        </q-item-label>
                        <q-item-label caption>
                          Zones: <b>{{ u.zoneCount }}</b> - Cells: <b>{{ u.cells }}</b> - Heaters:
                          <b>{{ u.heaters }}</b>
                        </q-item-label>
                        <q-item-label v-if="u.zones.length > 0" caption>
                          <div class="zone-debug-list">
                            <div
                              v-for="z in u.zones"
                              :key="`${u.id}-z-${z.index}`"
                              class="zone-debug-row"
                            >
                              <span>Z{{ z.index + 1 }}</span>
                              <span>cells {{ z.cells }}</span>
                              <span>heaters {{ z.heaters }}</span>
                              <span>avg {{ z.avgT.toFixed(1) }} C</span>
                              <span>min {{ z.minT.toFixed(1) }} C</span>
                              <span>max {{ z.maxT.toFixed(1) }} C</span>
                            </div>
                          </div>
                        </q-item-label>
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
                  <div class="col-6">
                    <q-btn
                      class="full-width"
                      unelevated
                      color="teal"
                      label="Export setup"
                      @click="exportSetupFile()"
                    />
                  </div>
                  <div class="col-6">
                    <q-btn
                      class="full-width"
                      unelevated
                      color="indigo"
                      label="Import setup"
                      :disable="locked || running"
                      @click="openImportSetupDialog()"
                    />
                    <input
                      ref="importSetupInputEl"
                      type="file"
                      accept=".json,application/json"
                      style="display: none"
                      @change="onImportSetupSelected"
                    />
                  </div>
                </div>

                <div v-if="tick > 0" class="row q-col-gutter-sm q-mt-sm">
                  <div class="col-8">
                    <q-input
                      v-model="resultsExportName"
                      dense
                      outlined
                      label="Results export name"
                    />
                  </div>
                  <div class="col-4">
                    <q-btn
                      class="full-width full-height"
                      unelevated
                      color="deep-orange"
                      label="Export results"
                      @click="exportResultsFile()"
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
                        rho={{ m.rho }} kg/m3 - cp={{ m.cp }} J/(kg*K) - lambda={{ m.lambda }} W/(m*K)
                        <span v-if="m.emitTemp != null"> - emit={{ m.emitTemp }} C</span>
                        <span v-if="m.emitPowerW != null"> @{{ m.emitPowerW }} W</span>
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
                        :disable="locked || m.id === 'air' || m.id === 'outside'"
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
            <div class="col-4">
              <q-input
                v-model.number="matForm.rho"
                type="number"
                label="rho (kg/m3)"
                dense
                outlined
              />
            </div>
            <div class="col-4">
              <q-input
                v-model.number="matForm.cp"
                type="number"
                label="cp (J/kg*K)"
                dense
                outlined
              />
            </div>
            <div class="col-4">
              <q-input
                v-model.number="matForm.lambda"
                type="number"
                label="lambda (W/m*K)"
                dense
                outlined
              />
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
            <div class="col-12">
              <q-input
                v-model.number="matForm.emitPowerW"
                type="number"
                label="emitPower (W) - empty = 0"
                dense
                outlined
                clearable
                min="0"
              />
            </div>
          </div>

          <div class="text-caption text-grey-7">
            Tip: Heater = emitTemp 50-70 + emitPower 500-2000 W, AC = emitTemp 16-20
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
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import {
  OUTSIDE_TARGET_ID,
  SHARED_UNIT_ID,
  type Material,
  type Unit,
  type UnitParams,
} from 'src/sim/heatWorld';
import { createDefaultSimulationConfig } from 'src/sim/heatSimulation';
import type { ExportSimulationSetup, SimulationConfig } from 'src/sim/heatSimulation';
import { HeatSimulationWorkerClient } from 'src/sim/heatSimulationWorkerClient';
import type { RuntimeUnitRow } from 'src/sim/heatSimulation';
import type { HeatWorldSnapshot, SimulationSnapshot } from 'src/sim/heatWorkerProtocol';
import {
  HeatSimCanvasRenderer,
  getMinMaxSnapshot,
  type HeatSimViewMode,
} from 'src/pages/heat-sim/heatSimCanvasRenderer';
import {
  clamp,
  fmtHm,
  fmtHmsFromSec,
  fmtRange,
  fmtSimTime,
  formatEnergySI,
  formatPowerSI,
  normalizeMaterialId,
  normalizeUnitId,
  normRange,
} from 'src/pages/heat-sim/heatSimUtils';

const canvasEl = ref<HTMLCanvasElement | null>(null);
const viewportEl = ref<HTMLDivElement | null>(null);
const contentEl = ref<HTMLDivElement | null>(null);
const importSetupInputEl = ref<HTMLInputElement | null>(null);
const canvasRenderer = new HeatSimCanvasRenderer();

const tab = ref<'sim' | 'edit' | 'mats' | 'units'>('sim');
const cfg = reactive({
  ...createDefaultSimulationConfig(),
  renderFpsLimit: 12,
});
const resultsExportName = ref('heat-sim-results');
const outsideSeriesInput = ref('');
const outsideSeriesInvalid = ref(false);

let simulationClient: HeatSimulationWorkerClient | null = null;
const world = ref<HeatWorldSnapshot | null>(null);
const runtimeRowsRaw = ref<RuntimeUnitRow[]>([]);
const worldVersion = ref(0);
const showZoneDebug = ref(false);

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

function applySnapshot(snapshot: SimulationSnapshot) {
  const prevW = world.value?.w ?? null;
  const prevH = world.value?.h ?? null;

  world.value = snapshot.world;
  runtimeRowsRaw.value = snapshot.runtimeRows;
  tick.value = snapshot.tick;
  simTimeSec.value = snapshot.simTimeSec;
  running.value = snapshot.running;

  if (world.value && (world.value.w !== prevW || world.value.h !== prevH)) {
    setupCanvasSize();
    const mm = getMinMaxSnapshot(world.value);
    minT.value = mm.min;
    maxT.value = mm.max;
  }

  bumpWorld();
  requestRender();
}

function getRenderFpsLimit() {
  return Math.max(1, Math.min(60, Math.floor(cfg.renderFpsLimit || 12)));
}

function getSimulationConfig(): Partial<SimulationConfig> {
  return {
    w: cfg.w,
    h: cfg.h,
    initTemp: cfg.initTemp,
    dt: cfg.dt,
    simTicksPerSec: cfg.simTicksPerSec,
    startDayTimeMin: cfg.startDayTimeMin,
    endEnabled: cfg.endEnabled,
    endValue: cfg.endValue,
    endUnit: cfg.endUnit,
    outsideTempMode: cfg.outsideTempMode,
    outsideTempConst: cfg.outsideTempConst,
    outsideTempSeries: [...cfg.outsideTempSeries],
  };
}

function parseOutsideSeriesInput(text: string): number[] | null {
  const raw = text.trim();
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;

  const nums = parsed.map((v) => Number(v));
  if (nums.some((v) => !Number.isFinite(v))) return null;
  return nums;
}

async function onOutsideSeriesFileSelected(fileModel: File | readonly File[] | null) {
  const file = Array.isArray(fileModel) ? fileModel[0] : fileModel;
  if (!file) return;
  try {
    outsideSeriesInput.value = await file.text();
  } catch {
    outsideSeriesInvalid.value = true;
  }
}

function bumpWorld() {
  worldVersion.value += 1;
}

function getDownloadFileName(prefix: string) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${prefix}-${stamp}.json`;
}

function sanitizeFileNamePart(name: string) {
  const normalized = name.trim().replace(/\s+/g, '-');
  const safe = normalized.replace(/[^a-zA-Z0-9._-]/g, '');
  return safe || 'export';
}

function parseImportedSetup(raw: unknown): {
  setup: ExportSimulationSetup;
  renderFpsLimit: number | null;
} | null {
  if (!raw || typeof raw !== 'object') return null;

  const payload = raw as Record<string, unknown>;
  const nestedSetup = payload.setup;
  const setup =
    nestedSetup && typeof nestedSetup === 'object'
      ? (nestedSetup as ExportSimulationSetup)
      : (payload as ExportSimulationSetup);

  if (
    setup.version !== 1 ||
    !setup.config ||
    !setup.materials ||
    !setup.units ||
    !Array.isArray(setup.cells)
  ) {
    return null;
  }

  const renderFpsRaw = payload.renderFpsLimit;
  const renderFpsLimit =
    typeof renderFpsRaw === 'number' && Number.isFinite(renderFpsRaw)
      ? Math.max(1, Math.min(60, Math.floor(renderFpsRaw)))
      : null;

  return { setup, renderFpsLimit };
}

function clearImportInput() {
  if (importSetupInputEl.value) importSetupInputEl.value.value = '';
}

function openImportSetupDialog() {
  if (locked.value || running.value) return;
  importSetupInputEl.value?.click();
}

async function exportSetupFile() {
  if (!simulationClient) return;

  const setup = await simulationClient.exportSetup();
  if (!setup) return;

  const payload = {
    ...setup,
    exportedAt: new Date().toISOString(),
    renderFpsLimit: getRenderFpsLimit(),
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = getDownloadFileName('heat-sim-setup');
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function exportResultsFile() {
  if (!simulationClient || tick.value <= 0) return;

  const name = resultsExportName.value.trim() || 'heat-sim-results';
  const payload = await simulationClient.exportResults(name);
  if (!payload) return;

  const fileBase = sanitizeFileNamePart(name);
  const data = {
    ...payload,
    exportedAt: new Date().toISOString(),
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = getDownloadFileName(fileBase);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function onImportSetupSelected(evt: Event) {
  const input = evt.target as HTMLInputElement | null;
  const file = input?.files?.[0];
  if (!file || !simulationClient) return;
  if (locked.value || running.value) {
    clearImportInput();
    return;
  }

  try {
    const text = await file.text();
    const parsed = parseImportedSetup(JSON.parse(text));
    if (!parsed) throw new Error('Invalid setup format');

    const ok = await simulationClient.importSetup(parsed.setup);
    if (!ok) throw new Error('Setup import failed');

    Object.assign(cfg, parsed.setup.config);
    if (parsed.renderFpsLimit != null) {
      cfg.renderFpsLimit = parsed.renderFpsLimit;
    }
    outsideSeriesInput.value = JSON.stringify(cfg.outsideTempSeries);
    outsideSeriesInvalid.value = false;
    selectedMaterialId.value = 'air';
    selectedUnitId.value = SHARED_UNIT_ID;
    requestRender(true);
  } catch {
    window.alert('Import failed. Check file format and ensure simulation is not locked.');
  } finally {
    clearImportInput();
  }
}

const autoScale = ref(true);
const minT = ref(0);
const maxT = ref(60);

type ViewMode = HeatSimViewMode;
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
const houseHeatingPowerW = computed(() =>
  runtimeRowsRaw.value.reduce((sum, r) => sum + (r.emitterPowerTickW ?? 0), 0),
);
const houseHeatingTotalJ = computed(() =>
  runtimeRowsRaw.value.reduce((sum, r) => sum + (r.emitterEnergyTotalJ ?? 0), 0),
);

const runtimeUnitRows = computed(() => {
  void worldVersion.value;
  return runtimeRowsRaw.value.map((r) => ({
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
    comfortTick: r.comfortTick,
    comfortAvg: r.comfortAvg,
    emitterPowerTickW: r.emitterPowerTickW,
    emitterEnergyTickJ: r.emitterEnergyTickJ,
    emitterEnergyTotalJ: r.emitterEnergyTotalJ,
    heatFlows: r.heatFlows,
  }));
});

type ZoneDebugStat = {
  index: number;
  cells: number;
  heaters: number;
  avgT: number;
  minT: number;
  maxT: number;
};

type UnitZoneDebugRow = {
  id: string;
  name: string;
  color: string;
  zoneCount: number;
  cells: number;
  heaters: number;
  zones: ZoneDebugStat[];
};

const unitZoneDebugRows = computed<UnitZoneDebugRow[]>(() => {
  void worldVersion.value;
  if (!showZoneDebug.value || !world.value) return [];

  const snapshot = world.value;
  const { w, h, cells, materials, units } = snapshot;
  const n = w * h;
  const visited = new Uint8Array(n);

  const unitStats: Record<string, UnitZoneDebugRow> = {};
  const stack: number[] = [];

  for (let i = 0; i < n; i++) {
    if (visited[i]) continue;
    const start = cells[i];
    const unitId = start?.unitId;
    if (!start || !unitId || !units[unitId]) continue;

    stack.length = 0;
    stack.push(i);

    let zoneCells = 0;
    let zoneHeaters = 0;
    let sumT = 0;
    let minT = Number.POSITIVE_INFINITY;
    let maxT = Number.NEGATIVE_INFINITY;

    while (stack.length > 0) {
      const idx = stack.pop();
      if (idx == null || visited[idx]) continue;
      const c = cells[idx];
      if (!c || c.unitId !== unitId) continue;
      visited[idx] = 1;

      zoneCells += 1;
      sumT += c.T;
      if (c.T < minT) minT = c.T;
      if (c.T > maxT) maxT = c.T;

      const m = materials[c.materialId];
      if (m?.emitTemp != null && Number.isFinite(m.emitTemp)) {
        zoneHeaters += 1;
      }

      const x = idx % w;
      const y = (idx / w) | 0;
      if (x > 0) stack.push(idx - 1);
      if (x < w - 1) stack.push(idx + 1);
      if (y > 0) stack.push(idx - w);
      if (y < h - 1) stack.push(idx + w);
    }

    if (zoneCells <= 0) continue;

    const unitMeta = units[unitId];
    const row =
      unitStats[unitId] ??
      (unitStats[unitId] = {
        id: unitMeta.id,
        name: unitMeta.name,
        color: unitMeta.color,
        zoneCount: 0,
        cells: 0,
        heaters: 0,
        zones: [],
      });

    row.zoneCount += 1;
    row.cells += zoneCells;
    row.heaters += zoneHeaters;
    row.zones.push({
      index: row.zones.length,
      cells: zoneCells,
      heaters: zoneHeaters,
      avgT: sumT / zoneCells,
      minT,
      maxT,
    });
  }

  const order = runtimeRowsRaw.value.map((r) => r.id);
  const rows = Object.values(unitStats);
  rows.sort((a, b) => {
    const ai = order.indexOf(a.id);
    const bi = order.indexOf(b.id);
    if (ai !== -1 || bi !== -1) {
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    }
    return a.id.localeCompare(b.id);
  });
  rows.forEach((r) => {
    r.zones.sort((a, b) => b.cells - a.cells);
    r.zones.forEach((z, idx) => {
      z.index = idx;
    });
  });
  return rows;
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
  rho: 1000,
  cp: 1000,
  lambda: 0.2,
  color: '#888888',
  emitTemp: null as number | null,
  emitPowerW: null as number | null,
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

function flowTargetColor(targetId: string) {
  if (targetId === OUTSIDE_TARGET_ID) return '#0B1B2B';
  return getUnitById(targetId)?.color ?? '#666666';
}

function flowDirectionColor(flowValue: number) {
  return flowValue > 0 ? '#e81a0c' : '#33cc33';
}

function setupCanvasSize() {
  if (!canvasEl.value || !contentEl.value || !world.value) return;
  canvasEl.value.width = world.value.w;
  canvasEl.value.height = world.value.h;
  contentEl.value.style.width = `${world.value.w * scale.value}px`;
  contentEl.value.style.height = `${world.value.h * scale.value}px`;
  canvasEl.value.style.cursor = paintTool.value === 'pick' ? 'crosshair' : 'cell';
}

function requestRender(force = false) {
  needsRender = true;
  if (force) forcedRender = true;
}

function render() {
  if (!canvasEl.value || !world.value) return;
  const ctx = canvasEl.value.getContext('2d');
  if (!ctx) return;

  const result = canvasRenderer.render(ctx, world.value, {
    viewMode: viewMode.value,
    comboAlpha: comboAlpha.value,
    autoScale: autoScale.value,
    minT: minT.value,
    maxT: maxT.value,
  });
  if (result.minT !== minT.value) minT.value = result.minT;
  if (result.maxT !== maxT.value) maxT.value = result.maxT;
}

async function setup() {
  if (!simulationClient) return;
  await simulationClient.setup();

  selectedMaterialId.value = 'air';
  selectedUnitId.value = SHARED_UNIT_ID;
  requestRender(true);
}

async function resetTemps() {
  if (!simulationClient) return;
  await simulationClient.resetTemperatureAndTime();
  requestRender(true);
}

async function stepOnce() {
  if (!simulationClient) return;
  await simulationClient.stepOnce();
  requestRender(true);
}

function loop(ts: number) {
  if (!lastTs) lastTs = ts;
  lastTs = ts;

  const limit = getRenderFpsLimit();
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

async function toggleRun() {
  if (!simulationClient) return;
  await simulationClient.toggleRun();
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

let paintOpId = 0;

async function applyPaint(i: number) {
  if (!world.value || locked.value || !simulationClient) return;

  const opId = ++paintOpId;
  if (tab.value === 'units') {
    const picked = await simulationClient.applyUnitTool(
      i,
      unitPaintTool.value,
      selectedUnitId.value,
    );
    if (picked && opId === paintOpId) selectedUnitId.value = picked;
  } else {
    const picked = await simulationClient.applyMaterialTool(
      i,
      paintTool.value,
      selectedMaterialId.value,
    );
    if (picked && opId === paintOpId) selectedMaterialId.value = picked;
  }
}

function onPointerDown(evt: PointerEvent) {
  if (!world.value || spaceDown.value || locked.value) return;

  (evt.currentTarget as HTMLCanvasElement).setPointerCapture(evt.pointerId);
  painting = true;

  const i = getCellIndexFromEvent(evt);
  if (i == null) return;

  lastPaintIndex = i;
  void applyPaint(i);
  requestRender();
}

function onPointerMove(evt: PointerEvent) {
  if (!painting || !world.value || locked.value) return;
  if (paintTool.value === 'pick') return;

  const i = getCellIndexFromEvent(evt);
  if (i == null || i === lastPaintIndex) return;

  lastPaintIndex = i;
  void applyPaint(i);
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
  matForm.rho = 1000;
  matForm.cp = 1000;
  matForm.lambda = 0.2;
  matForm.color = '#888888';
  matForm.emitTemp = null;
  matForm.emitPowerW = null;
  matDialog.open = true;
}

function openEdit(id: string) {
  if (locked.value || !world.value) return;
  const m = world.value.materials[id];
  if (!m) return;

  matDialog.mode = 'edit';
  matForm.id = m.id;
  matForm.name = m.name;
  matForm.rho = m.rho;
  matForm.cp = m.cp;
  matForm.lambda = m.lambda;
  matForm.color = m.color;
  matForm.emitTemp = m.emitTemp;
  matForm.emitPowerW = m.emitPowerW ?? null;
  matDialog.open = true;
}

async function saveMaterial() {
  if (locked.value || !world.value || !simulationClient) return;

  const id = matDialog.mode === 'add' ? normalizeMaterialId(matForm.id) : matForm.id;
  if (!id) return;

  const material: Material = {
    id,
    name: matForm.name.trim() || id,
    rho: Math.max(1e-9, Number(matForm.rho) || 1),
    cp: Math.max(1e-9, Number(matForm.cp) || 1),
    lambda: Math.max(0, Number(matForm.lambda) || 0),
    color: matForm.color?.trim() || '#888888',
    emitTemp: matForm.emitTemp == null ? null : Number(matForm.emitTemp),
    emitPowerW: matForm.emitPowerW == null ? null : Math.max(0, Number(matForm.emitPowerW) || 0),
  };

  if (!(await simulationClient.upsertMaterial(material))) return;
  selectedMaterialId.value = id;
  matDialog.open = false;
  requestRender(true);
}

async function removeMaterial(id: string) {
  if (locked.value || !world.value || !simulationClient || id === 'air' || id === 'outside') return;
  if (!(await simulationClient.removeMaterial(id, 'air'))) return;
  if (selectedMaterialId.value === id) selectedMaterialId.value = 'air';
  requestRender(true);
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

async function saveUnit() {
  if (!world.value || locked.value || !simulationClient) return;

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

  const ok =
    unitDialog.mode === 'add'
      ? await simulationClient.addUnit(unit)
      : await simulationClient.updateUnit(unit);
  if (!ok) return;

  if (unitDialog.mode === 'add') selectedUnitId.value = id;
  unitDialog.open = false;
  requestRender(true);
}

async function removeUnit(id: string) {
  if (!world.value || !simulationClient || id === SHARED_UNIT_ID || locked.value) return;
  if (!(await simulationClient.removeUnit(id))) return;
  if (selectedUnitId.value === id) selectedUnitId.value = SHARED_UNIT_ID;
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
watch(outsideSeriesInput, (text) => {
  const parsed = parseOutsideSeriesInput(text);
  outsideSeriesInvalid.value = parsed == null;
  if (parsed) {
    cfg.outsideTempSeries = parsed;
  }
});

watch(
  [
    () => cfg.w,
    () => cfg.h,
    () => cfg.initTemp,
    () => cfg.dt,
    () => cfg.simTicksPerSec,
    () => cfg.startDayTimeMin,
    () => cfg.endEnabled,
    () => cfg.endValue,
    () => cfg.endUnit,
    () => cfg.outsideTempMode,
    () => cfg.outsideTempConst,
    () => cfg.outsideTempSeries.join('|'),
  ],
  () => {
    void simulationClient?.setConfig(getSimulationConfig());
  },
);

watch(
  () => cfg.renderFpsLimit,
  () => {
    void simulationClient?.setSnapshotFpsLimit(getRenderFpsLimit());
  },
);

onMounted(async () => {
  outsideSeriesInput.value = JSON.stringify(cfg.outsideTempSeries);
  simulationClient = new HeatSimulationWorkerClient(applySnapshot);
  await simulationClient.init(getSimulationConfig());
  await simulationClient.setSnapshotFpsLimit(getRenderFpsLimit());
  await setup();
  rafId.value = requestAnimationFrame(loop);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
});

onBeforeUnmount(() => {
  if (rafId.value != null) cancelAnimationFrame(rafId.value);
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('keyup', onKeyUp);
  simulationClient?.terminate();
  simulationClient = null;
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

.flow-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 4px;
}

.flow-row {
  display: grid;
  grid-template-columns: 14px minmax(70px, 1fr) auto auto;
  gap: 8px;
  align-items: center;
}

.flow-swatch {
  width: 14px;
  height: 14px;
  border-radius: 4px;
}

.flow-name {
  font-weight: 500;
}

.flow-val {
  font-variant-numeric: tabular-nums;
  /*color: rgba(255, 255, 255, 0.75);*/
}

.zone-debug-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-top: 4px;
}

.zone-debug-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  font-variant-numeric: tabular-nums;
}
</style>
