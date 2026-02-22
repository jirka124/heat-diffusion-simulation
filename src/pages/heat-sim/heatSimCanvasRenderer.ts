import type { HeatWorldSnapshot } from 'src/sim/heatWorkerProtocol';

export type HeatSimViewMode = 'infra' | 'temp' | 'combo' | 'units';

export type RenderHeatWorldOptions = {
  viewMode: HeatSimViewMode;
  comboAlpha: number;
  autoScale: boolean;
  minT: number;
  maxT: number;
};

export type RenderHeatWorldResult = {
  minT: number;
  maxT: number;
};

type RGB = readonly [number, number, number];

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function heatColor(t01: number): RGB {
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

function hexToRgb(hex: string): RGB {
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

function ensureImageData(
  current: ImageData | null,
  w: number,
  h: number,
  ctx: CanvasRenderingContext2D,
) {
  if (!current || current.width !== w || current.height !== h) {
    return ctx.createImageData(w, h);
  }
  return current;
}

export function getMinMaxSnapshot(snapshot: HeatWorldSnapshot) {
  let min = Infinity;
  let max = -Infinity;
  for (const c of snapshot.cells) {
    if (c.T < min) min = c.T;
    if (c.T > max) max = c.T;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1 };
  if (min === max) return { min, max: min + 1e-9 };
  return { min, max };
}

export class HeatSimCanvasRenderer {
  private imgData: ImageData | null = null;

  render(
    ctx: CanvasRenderingContext2D,
    snapshot: HeatWorldSnapshot,
    options: RenderHeatWorldOptions,
  ): RenderHeatWorldResult {
    const { w, h, cells, materials, units } = snapshot;

    let mn = options.minT;
    let mx = options.maxT;
    if ((options.viewMode === 'temp' || options.viewMode === 'combo') && options.autoScale) {
      const mm = getMinMaxSnapshot(snapshot);
      mn = mm.min;
      mx = mm.max;
    }

    const denom = mx - mn || 1e-9;
    const alpha = Math.round((options.comboAlpha / 100) * 255);
    this.imgData = ensureImageData(this.imgData, w, h, ctx);
    const img = this.imgData;

    const materialRgbById: Record<string, RGB> = {};
    for (const m of Object.values(materials)) {
      materialRgbById[m.id] = hexToRgb(m.color);
    }

    const unitRgbById: Record<string, RGB> = {};
    for (const u of Object.values(units)) {
      unitRgbById[u.id] = hexToRgb(u.color);
    }

    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      if (!c) continue;

      const matRgb = materialRgbById[c.materialId] ?? ([80, 80, 80] as const);
      const [br, bg, bb] = matRgb;

      let r = br;
      let g = bg;
      let b = bb;

      if (options.viewMode === 'temp' || options.viewMode === 'combo') {
        const [tr, tg, tb] = heatColor((c.T - mn) / denom);
        if (options.viewMode === 'temp') {
          r = tr;
          g = tg;
          b = tb;
        } else {
          r = Math.round((tr * alpha + br * (255 - alpha)) / 255);
          g = Math.round((tg * alpha + bg * (255 - alpha)) / 255);
          b = Math.round((tb * alpha + bb * (255 - alpha)) / 255);
        }
      } else if (options.viewMode === 'units' && c.unitId) {
        const [ur, ug, ub] = unitRgbById[c.unitId] ?? ([120, 120, 120] as const);
        r = Math.round((ur * alpha + br * (255 - alpha)) / 255);
        g = Math.round((ug * alpha + bg * (255 - alpha)) / 255);
        b = Math.round((ub * alpha + bb * (255 - alpha)) / 255);
      }

      const p = i * 4;
      img.data[p + 0] = r;
      img.data[p + 1] = g;
      img.data[p + 2] = b;
      img.data[p + 3] = 255;
    }

    ctx.putImageData(img, 0, 0);
    return { minT: mn, maxT: mx };
  }
}
