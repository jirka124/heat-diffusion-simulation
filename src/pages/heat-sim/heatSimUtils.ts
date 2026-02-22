import type { TempRange } from 'src/sim/heatWorld';

export function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

export function fmtSimTime(secTotal: number) {
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

export function fmtHm(minOfDay: number) {
  const m = ((Math.floor(minOfDay) % 1440) + 1440) % 1440;
  const hh = String(Math.floor(m / 60)).padStart(2, '0');
  const mm = String(m % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function fmtHmsFromSec(secOfDayValue: number) {
  const s = ((Math.floor(secOfDayValue) % 86400) + 86400) % 86400;
  const hh = String(Math.floor(s / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export function fmtRange(r: TempRange) {
  return `${r.min}-${r.max} C`;
}

export function normRange(min: number, max: number): TempRange {
  const a = Number(min);
  const b = Number(max);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return { min: 0, max: 0 };
  return a <= b ? { min: a, max: b } : { min: b, max: a };
}

export function formatPowerSI(value: number) {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  const units: Array<{ factor: number; symbol: string }> = [
    { factor: 1e9, symbol: 'GW' },
    { factor: 1e6, symbol: 'MW' },
    { factor: 1e3, symbol: 'kW' },
    { factor: 1, symbol: 'W' },
  ];

  for (const u of units) {
    if (abs >= u.factor) {
      const scaled = abs / u.factor;
      const digits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
      return `${sign}${scaled.toFixed(digits)} ${u.symbol}`;
    }
  }

  return `${sign}${abs.toFixed(2)} W`;
}

export function formatEnergySI(value: number) {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  const units: Array<{ factor: number; symbol: string }> = [
    { factor: 1e9, symbol: 'GJ' },
    { factor: 1e6, symbol: 'MJ' },
    { factor: 1e3, symbol: 'kJ' },
    { factor: 1, symbol: 'J' },
    { factor: 1e-3, symbol: 'mJ' },
    { factor: 1e-6, symbol: 'uJ' },
  ];

  for (const u of units) {
    if (abs >= u.factor) {
      const scaled = abs / u.factor;
      const digits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
      return `${sign}${scaled.toFixed(digits)} ${u.symbol}`;
    }
  }

  return `${value.toExponential(2)} J`;
}

export function normalizeMaterialId(s: string) {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

export function normalizeUnitId(s: string) {
  return s
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9_-]/g, '');
}
