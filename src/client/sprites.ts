// Caché de sprites como canvas (normal, volteado y destello blanco).

import { ICONS, PROJ_ART, ROBOT_ART, type Art } from "./art";
import { artPixels, flashPixels, rigPixels, type Pixels } from "./pixels";

export type Sprite = HTMLCanvasElement;
const cache = new Map<string, Sprite>();

function toCanvas(p: Pixels, flip = false, scale = 1): Sprite {
  const c = document.createElement("canvas");
  c.width = p.w * scale;
  c.height = p.h * scale;
  const g = c.getContext("2d")!;
  const img = new ImageData(new Uint8ClampedArray(p.data), p.w, p.h);
  if (scale === 1 && !flip) {
    g.putImageData(img, 0, 0);
    return c;
  }
  const tmp = document.createElement("canvas");
  tmp.width = p.w;
  tmp.height = p.h;
  tmp.getContext("2d")!.putImageData(img, 0, 0);
  g.imageSmoothingEnabled = false;
  if (flip) {
    g.translate(c.width, 0);
    g.scale(-1, 1);
  }
  g.drawImage(tmp, 0, 0, c.width, c.height);
  return c;
}

function cached(key: string, make: () => Sprite) {
  let s = cache.get(key);
  if (!s) cache.set(key, (s = make()));
  return s;
}

export function robotSprite(robot: string, pose: number, flip: boolean, flash = false) {
  return cached(`r:${robot}:${pose}:${flip}:${flash}`, () => {
    const p = rigPixels(ROBOT_ART[robot] ?? ROBOT_ART.beetlix!, pose);
    return toCanvas(flash ? flashPixels(p) : p, flip);
  });
}

/** Silueta de un color (robots invisibles vistos por su equipo, sombras de KO...). */
export function robotTint(robot: string, pose: number, flip: boolean, color: string) {
  return cached(`rt:${robot}:${pose}:${flip}:${color}`, () => {
    const p = rigPixels(ROBOT_ART[robot] ?? ROBOT_ART.beetlix!, pose);
    const n = parseInt(color.slice(1), 16);
    const d = new Uint8ClampedArray(p.data);
    for (let i = 0; i < d.length; i += 4) if (d[i + 3]) d.set([(n >> 16) & 255, (n >> 8) & 255, n & 255], i);
    return toCanvas({ w: p.w, h: p.h, data: d }, flip);
  });
}

export function artSprite(key: string, art: Art) {
  return cached(`a:${key}`, () => toCanvas(artPixels(art)));
}
export const projSprite = (name: string) => artSprite(`p:${name}`, PROJ_ART[name] ?? PROJ_ART.bullet!);
export const iconSprite = (name: string) => artSprite(`i:${name}`, ICONS[name] ?? ICONS.medal!);

/** Icono como data URL a escala entera (para <img> en el DOM). */
const urlCache = new Map<string, string>();
export function iconURL(id: string, scale = 3): string {
  const key = `${id}:${scale}`;
  let u = urlCache.get(key);
  if (!u) {
    const art = ICONS[id] ?? ICONS.medal!;
    u = toCanvas(artPixels(art), false, scale).toDataURL();
    urlCache.set(key, u);
  }
  return u;
}

/** Retrato del robot (cuerpo + piernas quietas) como data URL. */
export function robotURL(robot: string, scale = 4, flip = false): string {
  const key = `robot:${robot}:${scale}:${flip}`;
  let u = urlCache.get(key);
  if (!u) {
    u = toCanvas(rigPixels(ROBOT_ART[robot]!, 0), flip, scale).toDataURL();
    urlCache.set(key, u);
  }
  return u;
}
