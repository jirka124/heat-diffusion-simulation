<template>
  <q-page class="q-pa-md model-page">
    <div class="text-h4 q-mb-sm">Model Overview</div>
    <div class="text-subtitle2 text-grey-7 q-mb-lg">
      A basic description of the full model and guidance for using it.
    </div>

    <q-card flat bordered class="q-mb-md">
      <q-card-section>
        <div class="text-h6 q-mb-sm">WHAT IS IT?</div>
        <p class="q-mb-none">
          This model simulates heat diffusion in a building divided into units and zones. It then
          uses simulation outputs to compute cost allocation across users, so different allocation
          methods can be compared.
        </p>
      </q-card-section>
    </q-card>

    <q-card flat bordered class="q-mb-md">
      <q-card-section>
        <div class="text-h6 q-mb-sm">HOW IT WORKS</div>
        <p class="q-mb-none">
          The simulation core uses discrete time steps, cell material properties, and neighborhood
          interactions to compute temperature evolution. At each step it updates heat transfer,
          source effects, and boundary conditions. Aggregated outputs (for example energy use or
          temperature profiles) are then passed to the selected cost-allocation method.
        </p>
      </q-card-section>
    </q-card>

    <q-card flat bordered class="q-mb-md">
      <q-card-section>
        <div class="text-h6 q-mb-sm">HOW TO USE IT</div>
        <ul class="q-pl-lg q-mb-none">
          <li>
            Open <strong>Heat Simulation</strong>, configure geometry, materials, and units, then
            run the simulation.
          </li>
          <li>In <strong>Cost Allocation</strong>, load simulation output and choose an allocation method.</li>
          <li>In <strong>Comparison</strong>, compare multiple runs and inspect differences between methods.</li>
        </ul>
      </q-card-section>
    </q-card>

    <q-card flat bordered class="q-mb-md">
      <q-card-section>
        <div class="text-h6 q-mb-sm">THINGS TO NOTICE</div>
        <ul class="q-pl-lg q-mb-none">
          <li>How stability and convergence speed change with different materials and time steps.</li>
          <li>How strongly boundary conditions and source placement affect the results.</li>
          <li>Differences in cost allocation across units with similar area but different positions.</li>
        </ul>
      </q-card-section>
    </q-card>

    <q-card flat bordered class="q-mb-md">
      <q-card-section>
        <div class="text-h6 q-mb-sm">THINGS TO TRY</div>
        <ul class="q-pl-lg q-mb-none">
          <li>Compare no-insulation and insulation scenarios under the same outdoor conditions.</li>
          <li>Change simulation duration and time-step size to see impact on final costs.</li>
          <li>Run multiple variants of the same model and compare them in the Comparison tab.</li>
        </ul>
      </q-card-section>
    </q-card>

    <q-card flat bordered class="q-mb-md">
      <q-card-section>
        <div class="text-h6 q-mb-sm">EXTENDING THE MODEL</div>
        <ul class="q-pl-lg q-mb-none">
          <li>Add a more detailed heating-source model (control logic, schedules, efficiency).</li>
          <li>Introduce additional materials or wall layers for more realistic heat transfer.</li>
          <li>Extend allocation algorithms with new metrics and validation checks.</li>
        </ul>
      </q-card-section>
    </q-card>
  </q-page>
</template>

<style scoped>
.model-page {
  max-width: 1100px;
  margin: 0 auto;
}

p {
  line-height: 1.55;
}
</style>
