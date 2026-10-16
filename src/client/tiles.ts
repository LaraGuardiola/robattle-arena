// Suelo de la arena con las temáticas de Robattle Survivors, horneado una vez
// en un canvas: suelo, muro del fondo con su cara, borde y gradas con público.
//
// Las temáticas temáticas comparten la misma forma (biomas 0 = base, 1 = caminos y
// manchas, 2 = plazas en baldosa); cambia cómo se pinta cada bioma.
//   0 Parque Robattle   hierba · tierra · hormigón
//   1 Desguace Oxidado  tierra sucia · charcos de aceite · chapas oxidadas
//   2 Fábrica Omega     acero · franjas de peligro · rejillas con neón
//   3 Ciudad Neón       aceras · asfalto mojado con reflejos · plazas de neón
//   4 Núcleo Medalla    vacío estrellado · nebulosas · plataformas doradas

import { hash2 } from "../shared/math";
import { ARENA_RX, ARENA_RY } from "../shared/data";
import { hexRgb } from "./pixels";

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.5);

type RGB = [number, number, number];
const P = (...c: string[]) => c.map(hexRgb);
type Put = (x: number, y: number, c: RGB) => void;

function vnoise(x: number, y: number, seed: number) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x: number, y: number, seed: number) =>
  vnoise(x, y, seed) * 0.6 + vnoise(x * 2.1, y * 2.1, seed + 7) * 0.28 + vnoise(x * 4.3, y * 4.3, seed + 13) * 0.12;

type Biome = 0 | 1 | 2;
function biomeAt(x: number, y: number, seed: number): Biome {
  const n = fbm(x / 170, y / 170, seed);
  const b = BAYER[(y & 3) * 4 + (x & 3)]! * 0.05;
  if (n + b > 0.68) return 2;
  const path = Math.abs(fbm(x / 110, y / 110, seed + 99) - 0.5);
  if (path + b * 0.5 < 0.035) return 1;
  if (n - b < 0.3) return 1;
  return 0;
}

const pick = (pal: RGB[], n: number, cuts: number[]) => {
  let i = 0;
  while (i < cuts.length && n >= cuts[i]!) i++;
  return pal[i]!;
};

/** Baldosas de 16px con junta oscura y bisel claro. */
function tile(wx: number, wy: number, s: number, pal: RGB[], line: RGB, hi: RGB): RGB {
  const tx = wx & 15, ty = wy & 15;
  if (tx === 0 || ty === 0) return line;
  if (tx === 1 || ty === 1) return hi;
  return pick(pal, hash2(wx >> 4, wy >> 4, s + 11), [0.3, 0.75]);
}

interface Theme {
  base(b: Biome, wx: number, wy: number, bay: number, s: number): RGB;
  edge: RGB;
  deco(put: Put, b: Biome, h: number, h2: number, px: number, py: number, tx: number, ty: number): void;
}

// ---------------------------------------------------------------- 0 parque
const PARK = {
  grass: P("#3b7340", "#457f45", "#4f8c4a", "#5d9a50"),
  tuft: hexRgb("#2f5f36"), tuftHi: hexRgb("#78b45e"),
  dirt: P("#7f6141", "#8c6c48", "#99784f"),
  pebble: hexRgb("#b5a58a"), pebbleSh: hexRgb("#5f4a33"),
  conc: P("#8b90a0", "#959aaa", "#a0a5b4"), concLine: hexRgb("#6e7383"), concHi: hexRgb("#b4b8c6"),
  bolt: hexRgb("#5a5f70"),
  flowers: P("#f4f4ff", "#ffd23f", "#ff7b8b"),
};
const park: Theme = {
  edge: hexRgb("#2c5532"),
  base(b, wx, wy, bay, s) {
    if (b === 0) return pick(PARK.grass, fbm(wx / 14, wy / 14, s + 3) + bay * 0.18, [0.38, 0.52, 0.66]);
    if (b === 1) return pick(PARK.dirt, fbm(wx / 9, wy / 9, s + 5) + bay * 0.2, [0.42, 0.6]);
    return tile(wx, wy, s, PARK.conc, PARK.concLine, PARK.concHi);
  },
  deco(put, b, h, h2, px, py, tx, ty) {
    if (b === 0) {
      if (h < 0.35) {
        for (const [dx, dy, c] of [[0, 0, 0], [-1, 0, 0], [1, 0, 0], [-1, -1, 1], [1, -2, 1], [0, -1, 1]] as const)
          put(px + dx, py + dy, c ? PARK.tuftHi : PARK.tuft);
      } else if (h < 0.42) {
        const fc = PARK.flowers[h2 < 0.4 ? 0 : h2 < 0.7 ? 1 : 2]!;
        for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) put(px + dx!, py + dy!, fc);
        put(px, py, PARK.flowers[1]!);
      }
    } else if (b === 1 && h < 0.3) {
      put(px, py, PARK.pebble);
      put(px + 1, py, PARK.pebble);
      put(px, py + 1, PARK.pebbleSh);
      put(px + 1, py + 1, PARK.pebbleSh);
    } else if (b === 2 && h < 0.18) {
      const bx = tx * 16 + 3, by = ty * 16 + 3;
      put(bx, by, PARK.bolt);
      put(bx + 1, by, PARK.concHi);
      put(bx, by + 1, PARK.concHi);
      put(bx + 1, by + 1, PARK.bolt);
    }
  },
};

// ---------------------------------------------------------------- 1 desguace
const SCRAP = {
  dirt: P("#564a44", "#605248", "#6b5b4e", "#76654f"),
  oil: P("#1d1828", "#241e31", "#2c253b"),
  sheen: P("#5a4a8a", "#3a6a8a", "#7a5a6a"),
  rust: P("#7a3f22", "#8a4a2a", "#9a5632"),
  seam: hexRgb("#4a2414"), rustHi: hexRgb("#b06a3e"), rivet: hexRgb("#c88a58"),
  metal: hexRgb("#8f97b0"), metalSh: hexRgb("#4a4f66"), tire: hexRgb("#1a1a20"), tireHi: hexRgb("#3a3a44"),
};
const scrap: Theme = {
  edge: hexRgb("#2e241e"),
  base(b, wx, wy, bay, s) {
    if (b === 0) return pick(SCRAP.dirt, fbm(wx / 11, wy / 11, s + 3) + bay * 0.2, [0.4, 0.52, 0.64]);
    if (b === 1) {
      // aceite con brillos tornasolados
      const n = fbm(wx / 20, wy / 7, s + 8);
      if (n > 0.62 && n < 0.64) return SCRAP.sheen[(((wx >> 3) + (wy >> 2)) % 3 + 3) % 3]!;
      return pick(SCRAP.oil, fbm(wx / 12, wy / 12, s + 5) + bay * 0.15, [0.45, 0.6]);
    }
    const c = tile(wx, wy, s, SCRAP.rust, SCRAP.seam, SCRAP.rustHi);
    const tx = wx & 15, ty = wy & 15;
    if ((tx === 3 || tx === 13) && (ty === 3 || ty === 13)) return SCRAP.rivet;
    // manchas de óxido más oscuras
    return fbm(wx / 6, wy / 6, s + 17) > 0.7 ? SCRAP.seam : c;
  },
  deco(put, b, h, h2, px, py) {
    if (b === 0) {
      if (h < 0.22) {
        // tuerca
        put(px, py, SCRAP.metal);
        put(px + 1, py, SCRAP.metal);
        put(px, py + 1, SCRAP.metalSh);
        put(px + 1, py + 1, SCRAP.metalSh);
      } else if (h < 0.3) {
        // engranaje pequeño
        for (const [dx, dy] of [[0, -2], [-2, 0], [2, 0], [0, 2], [-1, -1], [1, -1], [-1, 1], [1, 1]]) put(px + dx!, py + dy!, SCRAP.metal);
        put(px + 1, py + 1, SCRAP.metalSh);
      } else if (h < 0.33 && h2 < 0.5) {
        // neumático
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -3; dx <= 3; dx++) {
            const d = (dx * dx) / 9 + (dy * dy) / 4;
            if (d <= 1.1 && d > 0.3) put(px + dx, py + dy, dy < 0 ? SCRAP.tireHi : SCRAP.tire);
          }
      }
    }
  },
};

// ---------------------------------------------------------------- 2 fábrica
const FACT = {
  steel: P("#2c3040", "#313648", "#363c50"),
  seam: hexRgb("#1d2029"), steelHi: hexRgb("#444b62"),
  hazY: hexRgb("#d8a820"), hazK: hexRgb("#26262c"),
  grate: hexRgb("#171a24"), grateLine: hexRgb("#2a3042"),
  neon: P("#3fd7ff", "#ff3b9e", "#b06aff"),
  bolt: hexRgb("#5a6078"),
};
const factory: Theme = {
  edge: hexRgb("#101219"),
  base(b, wx, wy, _bay, s) {
    if (b === 0) return tile(wx, wy, s, FACT.steel, FACT.seam, FACT.steelHi);
    if (b === 1) return ((wx + wy) >> 3) & 1 ? FACT.hazY : FACT.hazK;
    if ((wx & 3) === 0 || (wy & 3) === 0) return FACT.grateLine;
    return FACT.grate;
  },
  deco(put, b, h, h2, px, py, tx, ty) {
    if (b === 0 && h < 0.2) {
      const bx = tx * 16 + 3, by = ty * 16 + 3;
      put(bx, by, FACT.bolt);
      put(bx + 9, by, FACT.bolt);
      put(bx, by + 9, FACT.bolt);
      put(bx + 9, by + 9, FACT.bolt);
    } else if (b === 2 && h < 0.4) {
      // luz de neón (línea corta que brilla)
      const c = FACT.neon[h2 < 0.5 ? 0 : h2 < 0.8 ? 1 : 2]!;
      const len = 3 + Math.floor(h2 * 6);
      for (let i = 0; i < len; i++) put(px - 3 + i, py, c);
    }
  },
};

// ---------------------------------------------------------------- 3 ciudad neón
const NEON = {
  walk: P("#2a2838", "#2f2c40", "#34314a"),
  seam: hexRgb("#1c1a28"), walkHi: hexRgb("#3e3a56"),
  road: P("#141220", "#181624", "#1c1a29"),
  refl: P("#ff3b9e", "#3fd7ff", "#7a2060", "#1a5a70"),
  plaza: hexRgb("#1f1a2e"), line: hexRgb("#ff3b9e"), glow: hexRgb("#5a1a4a"),
  dot: P("#3fd7ff", "#ff3b9e", "#ffd23f"),
  hole: hexRgb("#0f0d16"), holeHi: hexRgb("#4a4660"),
};
const neon: Theme = {
  edge: hexRgb("#0b0a12"),
  base(b, wx, wy, bay, s) {
    if (b === 0) return tile(wx, wy, s, NEON.walk, NEON.seam, NEON.walkHi);
    if (b === 1) {
      // asfalto mojado con reflejos de neón en vertical
      const n = fbm(wx / 30, wy / 6, s + 31) + bay * 0.05;
      if (n > 0.68) return NEON.refl[hash2(wx >> 3, wy >> 4, s) < 0.5 ? 0 : 1]!;
      if (n > 0.6) return NEON.refl[hash2(wx >> 3, wy >> 4, s) < 0.5 ? 2 : 3]!;
      return pick(NEON.road, fbm(wx / 10, wy / 10, s + 5) + bay * 0.15, [0.45, 0.6]);
    }
    const tx = wx & 15, ty = wy & 15;
    if (tx === 0 || ty === 0) return NEON.line;
    if (tx === 1 || ty === 1 || tx === 15 || ty === 15) return NEON.glow;
    return NEON.plaza;
  },
  deco(put, b, h, h2, px, py, tx, ty) {
    if (b === 0 && h < 0.06) {
      // alcantarilla
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -3; dx <= 3; dx++) if ((dx * dx) / 9 + (dy * dy) / 4 <= 1) put(px + dx, py + dy, dy === -2 ? NEON.holeHi : NEON.hole);
    } else if (b === 0 && h < 0.2) {
      put(px, py, NEON.dot[Math.floor(h2 * 3)]!);
    } else if (b === 2 && h < 0.5) {
      put(tx * 16 + 8, ty * 16 + 8, NEON.dot[Math.floor(h2 * 3)]!);
    }
  },
};

// ---------------------------------------------------------------- 4 núcleo medalla
const CORE = {
  void: P("#0b0918", "#0e0b1f", "#120e28"),
  star: P("#ffffff", "#9fd0ff", "#ffd23f"),
  neb: P("#22104a", "#2e1560", "#3e1a78"),
  gold: P("#3a2f10", "#44370f", "#4a3c14"),
  goldLine: hexRgb("#ffd23f"), goldHi: hexRgb("#c08a10"),
};
const core: Theme = {
  edge: hexRgb("#05040c"),
  base(b, wx, wy, bay, s) {
    if (b === 2) return tile(wx, wy, s, CORE.gold, CORE.goldHi, CORE.goldLine);
    const st = hash2(wx, wy, s + 77);
    if (st < 0.004) return CORE.star[Math.floor(st * 750)]!;
    if (b === 1) return pick(CORE.neb, fbm(wx / 26, wy / 26, s + 9) + bay * 0.2, [0.42, 0.58]);
    return pick(CORE.void, fbm(wx / 40, wy / 40, s + 4) + bay * 0.1, [0.45, 0.6]);
  },
  deco(put, b, h, h2, px, py, tx, ty) {
    if (b !== 2 && h < 0.05) {
      // estrella grande en cruz
      const c = CORE.star[Math.floor(h2 * 3)]!;
      for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) put(px + dx!, py + dy!, c);
    } else if (b === 2 && h < 0.25) {
      // medalla grabada en la plataforma
      const cx = tx * 16 + 8, cy = ty * 16 + 8;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (Math.abs(dx) + Math.abs(dy) === 2) put(cx + dx, cy + dy, CORE.goldLine);
    }
  },
};

const THEMES: Theme[] = [park, scrap, factory, neon, core];


/** Colores del muro y de las gradas por temática. */
interface WallStyle { face: RGB[]; cap: RGB; capHi: RGB; stripe: RGB; seat: RGB[]; crowd: RGB[] }
const W = (face: string[], cap: string, capHi: string, stripe: string, seat: string[]): WallStyle => ({
  face: P(...face), cap: hexRgb(cap), capHi: hexRgb(capHi), stripe: hexRgb(stripe), seat: P(...seat),
  crowd: P("#ff5f6d", "#4fb4ff", "#ffd23f", "#5fe08a", "#ff9ed2", "#c9cfdc", "#b06aff", "#ff8a2b"),
});
const WALLS: WallStyle[] = [
  W(["#6e7383", "#7b8090", "#878c9c"], "#a0a5b4", "#c8ccd8", "#3fa046", ["#2a2a3c", "#24243a"]),
  W(["#6b4a35", "#7a5640", "#86604a"], "#9a5632", "#c88a58", "#d8a820", ["#2a221e", "#231c18"]),
  W(["#2c3040", "#363c50", "#40465c"], "#5a6078", "#8a90a8", "#d8a820", ["#16181f", "#121419"]),
  W(["#24203a", "#2c2846", "#342f52"], "#3e3a56", "#6a6490", "#ff3b9e", ["#100e18", "#0c0b13"]),
  W(["#2a2010", "#3a2f10", "#44370f"], "#c08a10", "#ffd23f", "#b06aff", ["#08060f", "#05040c"]),
];

export const WALL_H = 22;
export const STANDS = 70;

/** Hornea la arena entera. El canvas empieza en (OX, OY) del mundo. */
export function bakeArena(seed: number, themeIdx: number) {
  const T = THEMES[themeIdx] ?? park, S = WALLS[themeIdx] ?? WALLS[0]!;
  const RX = ARENA_RX, RY = ARENA_RY;
  const ox = -RX - STANDS, oy = -RY - WALL_H - STANDS;
  const w = (RX + STANDS) * 2, h = (RY + STANDS) * 2 + WALL_H;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d")!;
  const img = g.createImageData(w, h);
  const d = img.data;
  const put: Put = (x, y, c) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = (y * w + x) * 4;
    d[i] = c[0];
    d[i + 1] = c[1];
    d[i + 2] = c[2];
    d[i + 3] = 255;
  };
  const dark = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
  const bio = new Uint8Array(w * h);
  const ell = (x: number, y: number) => Math.sqrt((x / RX) ** 2 + (y / RY) ** 2);
  const line = hexRgb("#f4f1ff");

  for (let py = 0; py < h; py++)
    for (let px = 0; px < w; px++) {
      const wx = px + ox, wy = py + oy;
      const e = ell(wx, wy);
      const bay = BAYER[(wy & 3) * 4 + (wx & 3)]!;
      if (e <= 1) {
        const b = biomeAt(wx, wy, seed);
        bio[py * w + px] = b + 1;
        let c = T.base(b, wx, wy, bay, seed);
        // líneas del campo: círculo central y línea media
        const rc = Math.hypot(wx, wy * 1.15);
        if ((rc > 38 && rc < 40) || (Math.abs(wx) < 1 && Math.abs(wy) > 40)) c = mix(c, line, 0.35);
        // sombra del muro del fondo y oscurecido suave del borde
        if (wy < 0 && ell(wx, wy - 10) > 1) c = dark(c, 0.72);
        else if (e > 0.96) c = dark(c, 0.85);
        put(px, py, c);
        continue;
      }
      // cara del muro del fondo: entre el borde y el borde desplazado hacia arriba
      const shifted = ell(wx, wy + WALL_H);
      if (wy < 0 && shifted <= 1) {
        // altura dentro de la cara (0 abajo .. 1 arriba)
        let k = 0;
        while (k < WALL_H && ell(wx, wy + k) > 1) k++;
        const t = k / WALL_H;
        let c = S.face[((wx >> 3) & 1) + (t > 0.5 ? 1 : 0)]!;
        if ((wx & 7) === 0) c = dark(c, 0.8);
        if (k === 5 || k === 6) c = S.stripe;
        if (k <= 1) c = dark(c, 0.6);
        put(px, py, c);
        continue;
      }
      // remate superior del muro y borde delantero
      if ((wy < 0 && shifted <= 1 + 3 / RY) || (wy >= 0 && e <= 1 + 4 / RY)) {
        put(px, py, (wy < 0 ? shifted : e) < 1 + 1.5 / RY ? S.capHi : S.cap);
        continue;
      }
      // gradas con público: filas de asientos que siguen la elipse
      const ed = wy < 0 ? shifted : e;
      const dpx = (ed - 1) * RY;
      const row = Math.floor(dpx / 6), sub = Math.floor(dpx) - row * 6;
      let c = S.seat[row & 1]!;
      if (sub >= 4) c = dark(S.seat[0]!, 0.7);
      else {
        const cell = Math.floor((Math.atan2(wy / RY, wx / RX) + Math.PI) * RX * 0.25);
        const hh = hash2(cell, row, seed + 5);
        const col = Math.floor((Math.atan2(wy / RY, wx / RX) + Math.PI) * RX) % 4;
        if (hh < 0.65 && col < 3) {
          const head = S.crowd[Math.floor(hash2(cell, row, seed + 6) * S.crowd.length)]!;
          // de vez en cuando alguien salta (fila más arriba)
          c = sub < 2 ? dark(head, 0.8) : sub < 4 && col === 1 ? dark(head, 0.45) : c;
        }
      }
      const far = Math.min(1, dpx / STANDS);
      put(px, py, dark(c, 0.85 - far * 0.55));
    }

  // relieve entre biomas y decoración
  for (let py = 1; py < h; py++)
    for (let px = 0; px < w; px++) {
      const b = bio[py * w + px]!, up = bio[(py - 1) * w + px]!;
      if (b > 1 && up === 1) put(px, py, T.edge);
    }
  for (let ty = 0; ty < h / 16; ty++)
    for (let tx = 0; tx < w / 16; tx++) {
      const wx = Math.floor(ox / 16) + tx, wy = Math.floor(oy / 16) + ty;
      const hh = hash2(wx, wy, seed + 21), h2 = hash2(wx, wy, seed + 22);
      const px = tx * 16 + 2 + Math.floor(h2 * 11), py = ty * 16 + 2 + Math.floor(hash2(wx, wy, seed + 23) * 11);
      if (px + ox === 0 && py + oy === 0) continue;
      if (ell(px + ox, py + oy) > 0.95) continue;
      const b = bio[Math.min(h - 1, py) * w + Math.min(w - 1, px)]!;
      if (!b) continue;
      const deco: Put = (x, y, c) => {
        if (x >= 0 && y >= 0 && x < w && y < h && bio[y * w + x]) put(x, y, c);
      };
      T.deco(deco, (b - 1) as Biome, hh, h2, px, py, tx, ty);
    }

  g.putImageData(img, 0, 0);
  return { canvas, ox, oy };
}

function mix(a: RGB, b: RGB, k: number): RGB {
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

/** Pilar de piedra/metal con la paleta del muro (canvas, base en la parte de abajo). */
export function bakePillar(themeIdx: number, r: number) {
  const S = WALLS[themeIdx] ?? WALLS[0]!;
  const hgt = 26, w = r * 2 + 3, h = Math.ceil(hgt + r * 1.2 + 4);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  const img = g.createImageData(w, h);
  const put: Put = (x, y, col) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = (y * w + x) * 4;
    img.data.set([col[0], col[1], col[2], 255], i);
  };
  const ry = r * 0.6;
  const outline = hexRgb("#17121f");
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const dx = x - r - 1;
      const topY = ry + 1, botY = ry + 1 + hgt;
      const inTop = (dx / r) ** 2 + ((y - topY) / ry) ** 2 <= 1;
      const inBody = Math.abs(dx) <= r && y >= topY && y <= botY;
      const inBot = (dx / r) ** 2 + ((y - botY) / ry) ** 2 <= 1;
      if (!(inTop || inBody || inBot)) continue;
      let col: RGB;
      if (inTop) col = (dx / r) ** 2 + ((y - topY) / ry) ** 2 > 0.6 ? S.cap : S.capHi;
      else {
        const k = (dx + r) / (2 * r);
        col = S.face[k < 0.3 ? 2 : k < 0.75 ? 1 : 0]!;
        const yy = y - topY;
        if (yy === 6 || yy === 7) col = S.stripe;
        if (k > 0.85) col = [col[0] * 0.7, col[1] * 0.7, col[2] * 0.7];
      }
      put(x, y, col);
    }
  // contorno
  const copy = new Uint8ClampedArray(img.data);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (copy[(y * w + x) * 4 + 3]) continue;
      for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + ax, ny = y + ay;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && copy[(ny * w + nx) * 4 + 3]) {
          put(x, y, outline);
          break;
        }
      }
    }
  g.putImageData(img, 0, 0);
  return c;
}
