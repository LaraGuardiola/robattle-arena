// Entrada en partida. Cada jugador local tiene un dispositivo:
//   teclado + ratón  WASD mover · ratón apuntar · clic izq. (R2) · clic der. (L2) · ESPACIO · Q · E · R
//   mando            stick izq. mover · stick der. apuntar · RT / LT · A · X · Y · B (RB = definitiva también)
// Devuelve un Input con la mira relativa al robot (ver protocol.ts).

import { SLOT_BIT } from "../shared/data";
import type { Input } from "../shared/protocol";
import { padsRaw, takePadPause } from "./pad";

export type Device = { kind: "kb" } | { kind: "pad"; index: number };

const keys = new Set<string>();
const mouse = { x: 0, y: 0, l: false, r: false, moved: false };
let pausePressed = false;

const PB = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, Start: 9, Up: 12, Down: 13, Left: 14, Right: 15 };

export function initInput() {
  window.addEventListener("keydown", (e) => {
    if ((e.target as HTMLElement)?.tagName === "INPUT") return;
    keys.add(e.code);
    if ((e.code === "Escape" || e.code === "KeyP") && !e.repeat) pausePressed = true;
    if (e.code === "Space" || e.code.startsWith("Arrow") || e.code === "Tab") e.preventDefault();
  });
  window.addEventListener("keyup", (e) => keys.delete(e.code));
  window.addEventListener("blur", () => {
    keys.clear();
    mouse.l = mouse.r = false;
  });
  window.addEventListener("pointermove", (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    mouse.moved = true;
  });
  const game = document.getElementById("game")!;
  game.addEventListener("pointerdown", (e) => {
    if ((e.target as HTMLElement).closest("button")) return;
    if (e.button === 0) mouse.l = true;
    if (e.button === 2) mouse.r = true;
  });
  window.addEventListener("pointerup", (e) => {
    if (e.button === 0) mouse.l = false;
    if (e.button === 2) mouse.r = false;
  });
  game.addEventListener("contextmenu", (e) => e.preventDefault());
}

export const mousePos = () => mouse;

export function takePause() {
  const v = takePadPause() || pausePressed;
  pausePressed = false;
  return v;
}

/** Mira persistente de cada mando (el stick derecho suelto mantiene la última). */
const padAim = new Map<number, { x: number; y: number; t: number }>();

/**
 * Lee un dispositivo. `toWorld` convierte el ratón a mundo; `me` es la posición
 * del robot; `assist` corrige la mira del mando hacia un enemigo cercano.
 */
export function readDevice(
  dev: Device,
  me: { x: number; y: number },
  toWorld: (sx: number, sy: number) => [number, number],
  assist?: (ax: number, ay: number) => [number, number],
): Input {
  if (dev.kind === "kb") {
    let mx = 0, my = 0;
    if (keys.has("KeyA") || keys.has("ArrowLeft")) mx -= 1;
    if (keys.has("KeyD") || keys.has("ArrowRight")) mx += 1;
    if (keys.has("KeyW") || keys.has("ArrowUp")) my -= 1;
    if (keys.has("KeyS") || keys.has("ArrowDown")) my += 1;
    const l = Math.hypot(mx, my);
    if (l > 1) {
      mx /= l;
      my /= l;
    }
    const [wx, wy] = toWorld(mouse.x, mouse.y);
    let b = 0;
    if (mouse.l) b |= SLOT_BIT.r2;
    if (mouse.r) b |= SLOT_BIT.l2;
    if (keys.has("Space") || keys.has("ShiftLeft")) b |= SLOT_BIT.a;
    if (keys.has("KeyQ")) b |= SLOT_BIT.x;
    if (keys.has("KeyE")) b |= SLOT_BIT.y;
    if (keys.has("KeyR") || keys.has("KeyF")) b |= SLOT_BIT.b;
    return { mx, my, ax: wx - me.x, ay: wy - me.y, b };
  }

  const p = padsRaw().find((q) => q.index === dev.index);
  if (!p) return { mx: 0, my: 0, ax: 1, ay: 0, b: 0 };
  const btn = (i: number) => !!p.buttons[i];
  let mx = 0, my = 0;
  const lx = p.axes[0] ?? 0, ly = p.axes[1] ?? 0;
  if (Math.hypot(lx, ly) > 0.22) {
    mx = lx;
    my = ly;
  }
  if (btn(PB.Left)) mx -= 1;
  if (btn(PB.Right)) mx += 1;
  if (btn(PB.Up)) my -= 1;
  if (btn(PB.Down)) my += 1;
  const ml = Math.hypot(mx, my);
  if (ml > 1) {
    mx /= ml;
    my /= ml;
  }
  // stick derecho: dirección y distancia (para las skills al suelo)
  const rx = p.axes[2] ?? 0, ry = p.axes[3] ?? 0, rm = Math.hypot(rx, ry);
  let aim = padAim.get(dev.index) ?? { x: 1, y: 0, t: 0 };
  const now = performance.now();
  if (rm > 0.3) {
    const k = Math.min(1, (rm - 0.3) / 0.6);
    const dist = 45 + k * 170;
    aim = { x: (rx / rm) * dist, y: (ry / rm) * dist, t: now };
  } else if (ml > 0.3 && now - aim.t > 900) {
    // sin tocar el stick derecho un rato: se apunta hacia donde se camina
    aim = { x: (mx / ml) * 110, y: (my / ml) * 110, t: aim.t };
  }
  padAim.set(dev.index, aim);
  let [ax, ay] = [aim.x, aim.y];
  if (assist) [ax, ay] = assist(ax, ay);
  let b = 0;
  if (btn(PB.RT)) b |= SLOT_BIT.r2;
  if (btn(PB.LT) || btn(PB.LB)) b |= SLOT_BIT.l2;
  if (btn(PB.A)) b |= SLOT_BIT.a;
  if (btn(PB.X)) b |= SLOT_BIT.x;
  if (btn(PB.Y)) b |= SLOT_BIT.y;
  if (btn(PB.B) || btn(PB.RB)) b |= SLOT_BIT.b;
  return { mx, my, ax, ay, b };
}
