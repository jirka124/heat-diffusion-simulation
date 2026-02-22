import { SHARED_UNIT_ID, type Material, type Unit } from 'src/sim/heatWorld.types';

// Returns built-in unit presets used for new simulations.
export function defaultUnits(): Record<string, Unit> {
  const shared: Unit = {
    id: SHARED_UNIT_ID,
    name: 'Shared space',
    color: '#9E9E9E',
    params: { kind: 'shared', comfy: { min: 14, max: 22 } },
  };

  const a: Unit = {
    id: 'A',
    name: 'Unit A',
    color: '#8E44AD',
    params: {
      kind: 'unit',
      homeFromMin: 22 * 60,
      homeToMin: 6 * 60,
      home: { min: 20, max: 22 },
      away: { min: 16, max: 18 },
    },
  };

  const b: Unit = {
    id: 'B',
    name: 'Unit B',
    color: '#27AE60',
    params: {
      kind: 'unit',
      homeFromMin: 16 * 60,
      homeToMin: 8 * 60,
      home: { min: 20, max: 22 },
      away: { min: 15, max: 17 },
    },
  };

  return {
    [shared.id]: shared,
    [a.id]: a,
    [b.id]: b,
  };
}

// Returns built-in material presets used for new simulations.
export function defaultMaterials(): Record<string, Material> {
  const air: Material = {
    id: 'air',
    name: 'Air',
    rho: 1.225,
    cp: 1005,
    // Effective conductivity for coarse grid (includes unresolved mixing).
    lambda: 2.5,
    color: '#2D3A4A',
    emitTemp: null,
    emitPowerW: null,
  };

  const brick: Material = {
    id: 'brick',
    name: 'Brick wall',
    rho: 1800,
    cp: 840,
    lambda: 0.72,
    color: '#7B4E2B',
    emitTemp: null,
    emitPowerW: null,
  };

  const concrete: Material = {
    id: 'concrete',
    name: 'Concrete',
    rho: 2300,
    cp: 880,
    lambda: 1.7,
    color: '#6E7076',
    emitTemp: null,
    emitPowerW: null,
  };

  const insulation: Material = {
    id: 'eps',
    name: 'Insulation (EPS)',
    rho: 20,
    cp: 1300,
    lambda: 0.035,
    color: '#D8D3A8',
    emitTemp: null,
    emitPowerW: null,
  };

  const windowMat: Material = {
    id: 'window',
    name: 'Window',
    rho: 2500,
    cp: 750,
    lambda: 1.0,
    color: '#7FB3D5',
    emitTemp: null,
    emitPowerW: null,
  };

  const heater: Material = {
    id: 'heater',
    name: 'Heater',
    // Device-like effective thermal mass, not full-cell steel.
    rho: 40,
    cp: 500,
    lambda: 3.0,
    color: '#C0392B',
    emitTemp: 55,
    emitPowerW: 1200,
  };

  const ac: Material = {
    id: 'ac',
    name: 'AC',
    rho: 35,
    cp: 900,
    lambda: 3.0,
    color: '#1F7AE0',
    emitTemp: 16,
    emitPowerW: 900,
  };

  const outside: Material = {
    id: 'outside',
    name: 'Outside',
    rho: 1e9,
    cp: 1000,
    lambda: 0.3,
    color: '#0B1B2B',
    emitTemp: 0,
    emitPowerW: 0,
  };

  return {
    air,
    brick,
    concrete,
    eps: insulation,
    window: windowMat,
    heater,
    ac,
    outside,
  };
}
