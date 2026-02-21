<template>
  <q-page class="q-pa-md index-page">
    <div class="text-h4 q-mb-sm">Heat Diffusion Toolset</div>
    <div class="text-subtitle2 text-grey-7 q-mb-lg">
      Pick where you want to continue.
    </div>

    <div class="row q-col-gutter-md">
      <div v-for="item in entries" :key="item.to" class="col-12 col-md-4">
        <q-card class="nav-card cursor-pointer" clickable v-ripple @click="goTo(item.to)">
          <q-card-section class="row items-center q-gutter-sm">
            <q-icon :name="item.icon" size="28px" color="primary" />
            <div class="text-h6">{{ item.title }}</div>
          </q-card-section>
          <q-card-section class="text-body2 text-grey-7">
            {{ item.caption }}
          </q-card-section>
          <q-separator />
          <q-card-actions align="right">
            <q-btn flat color="primary" label="Open" :to="item.to" />
          </q-card-actions>
        </q-card>
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();

const entries = [
  {
    title: 'Heat Simulation',
    caption: 'Create and run thermal simulation experiments.',
    icon: 'device_thermostat',
    to: '/heat',
  },
  {
    title: 'Cost Allocation',
    caption: 'Compute cost split from exported simulation results.',
    icon: 'calculate',
    to: '/costs',
  },
  {
    title: 'Comparison',
    caption: 'Compare multiple allocation outputs side-by-side.',
    icon: 'insights',
    to: '/compare',
  },
];

function goTo(to: string) {
  void router.push(to);
}
</script>

<style scoped>
.index-page {
  max-width: 1200px;
  margin: 0 auto;
}

.nav-card {
  height: 100%;
  transition: transform 0.14s ease, box-shadow 0.14s ease;
}

.nav-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 22px rgba(0, 0, 0, 0.16);
}
</style>
