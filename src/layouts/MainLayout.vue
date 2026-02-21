<template>
  <q-layout view="lHh Lpr lFf">
    <q-header elevated>
      <q-toolbar>
        <q-btn flat dense round icon="menu" aria-label="Menu" @click="toggleLeftDrawer" />

        <q-toolbar-title>Heat Diffusion</q-toolbar-title>
      </q-toolbar>
    </q-header>

    <q-drawer v-model="leftDrawerOpen" show-if-above bordered>
      <q-list>
        <q-item-label header>Navigation</q-item-label>

        <q-item
          v-for="item in navItems"
          :key="item.to"
          clickable
          :to="item.to"
          exact
          active-class="bg-primary text-white"
          v-ripple
        >
          <q-item-section avatar>
            <q-icon :name="item.icon" />
          </q-item-section>
          <q-item-section>
            <q-item-label>{{ item.label }}</q-item-label>
            <q-item-label caption>{{ item.caption }}</q-item-label>
          </q-item-section>
        </q-item>
      </q-list>
    </q-drawer>

    <q-page-container>
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const navItems = [
  {
    label: 'Home',
    caption: 'Overview and quick access',
    icon: 'home',
    to: '/',
  },
  {
    label: 'Heat Simulation',
    caption: 'Build and run experiment',
    icon: 'device_thermostat',
    to: '/heat',
  },
  {
    label: 'Cost Allocation',
    caption: 'Compute fair cost split',
    icon: 'calculate',
    to: '/costs',
  },
  {
    label: 'Comparison',
    caption: 'Compare multiple allocations',
    icon: 'insights',
    to: '/compare',
  },
];

const leftDrawerOpen = ref(false);

function toggleLeftDrawer() {
  leftDrawerOpen.value = !leftDrawerOpen.value;
}
</script>
