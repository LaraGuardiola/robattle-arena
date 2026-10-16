// Convierte mapas de caracteres en píxeles RGBA (sin DOM, lo usa también
// tools/preview-art.ts para generar una hoja de previsualización).

import { OUTLINE, type Art, type Pal, type Rig } from "./art";

export interface Pixels {
  w: number;
  h: number;
  data: Uint8ClampedArray;
}

const rgbCache = new Map<string, [number, number, number]>();
export function hexRgb(hex: string): [number, number, number] {
  let c = rgbCache.get(hex);
  if (!c) {
    const n = parseInt(hex.slice(1), 16);
    c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    rgbCache.set(hex, c);
  }
  return c;
}

/** Pinta filas con su paleta y añade un contorno de 1px (8 vecinos). */
export function rowsToPixels(rows: string[], pal: Pal, outline: string | null = OUTLINE): Pixels {
  const pad = outline ? 1 : 0;
  const iw = Math.max(...rows.map((r) => r.length));
  const w = iw + pad * 2, h = rows.length + pad * 2;
  const data = new Uint8ClampedArray(w * h * 4);
  const solid = new Uint8Array(w * h);
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x]!;
      if (ch === ".") continue;
      const col = pal[ch];
      if (!col) continue;
      const [r, g, b] = hexRgb(col);
      const i = (y + pad) * w + (x + pad);
      data.set([r, g, b, 255], i * 4);
      solid[i] = 1;
    }
  });
  if (outline) {
    const [r, g, b] = hexRgb(outline);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (solid[i]) continue;
        let near = false;
        for (let dy = -1; dy <= 1 && !near; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx >= 0 && ny >= 0 && nx < w && ny < h && solid[ny * w + nx]) {
              near = true;
              break;
            }
          }
        if (near) data.set([r, g, b, 255], i * 4);
      }
  }
  return { w, h, data };
}

export const artPixels = (a: Art, over?: Pal) => rowsToPixels(a.rows, { ...a.pal, ...over }, a.outline === undefined ? OUTLINE : a.outline);

/** Cuerpo + una pose de piernas. */
export function rigPixels(r: Rig, pose: number, over?: Pal): Pixels {
  const legs = r.legs[pose % r.legs.length] ?? [];
  return rowsToPixels([...r.body, ...legs], { ...r.pal, ...over });
}

/** Gira el tono de algunos colores de la paleta (variantes de enemigos por stage). */
export function hueShift(pal: Pal, deg: number, keys = "aAh"): Pal {
  if (!deg) return pal;
  const out: Pal = { ...pal };
  for (const k of keys) {
    const c = pal[k];
    if (!c) continue;
    let [r, g, b] = hexRgb(c).map((v) => v / 255) as [number, number, number];
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
    let h = 0;
    const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
    if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (((h * 60 + deg) % 360) + 360) % 360;
    const C = (1 - Math.abs(2 * l - 1)) * Math.max(s, 0.35);
    const X = C * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - C / 2;
    [r, g, b] = h < 60 ? [C, X, 0] : h < 120 ? [X, C, 0] : h < 180 ? [0, C, X] : h < 240 ? [0, X, C] : h < 300 ? [X, 0, C] : [C, 0, X];
    out[k] = "#" + [r, g, b].map((v) => Math.round(Math.min(1, Math.max(0, v + m)) * 255).toString(16).padStart(2, "0")).join("");
  }
  return out;
}

/** Versión blanca (destello al recibir daño). */
export function flashPixels(p: Pixels): Pixels {
  const d = new Uint8ClampedArray(p.data);
  for (let i = 0; i < d.length; i += 4) if (d[i + 3]) d.set([255, 255, 255], i);
  return { w: p.w, h: p.h, data: d };
}
