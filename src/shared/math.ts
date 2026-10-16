// Utilidades matemáticas y RNG determinista (compartido cliente/servidor).

export const TAU = Math.PI * 2;

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const dist2 = (ax: number, ay: number, bx: number, by: number) => {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
};
export const angleDiff = (a: number, b: number) => {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};

/** Distancia de un punto a un segmento al cuadrado. */
export function segDist2(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1, dy = y2 - y1;
  const l = dx * dx + dy * dy || 1;
  const t = clamp(((px - x1) * dx + (py - y1) * dy) / l, 0, 1);
  return dist2(px, py, x1 + dx * t, y1 + dy * t);
}

/** mulberry32: rápido y reproducible. */
export class Rng {
  s: number;
  constructor(seed: number) {
    this.s = seed >>> 0 || 1;
  }
  next() {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number) {
    return a + (b - a) * this.next();
  }
  int(a: number, b: number) {
    return Math.floor(this.range(a, b + 1));
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)]!;
  }
  chance(p: number) {
    return this.next() < p;
  }
  weighted<T extends string>(w: Partial<Record<T, number>>): T {
    let total = 0;
    for (const k in w) total += w[k] ?? 0;
    let r = this.next() * total;
    for (const k in w) {
      r -= w[k] ?? 0;
      if (r <= 0) return k;
    }
    return Object.keys(w)[0] as T;
  }
}

/** Hash entero 2D -> [0,1) (para el terreno). */
export function hash2(x: number, y: number, seed = 0) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
