// Mando (API Gamepad, mapeo estándar Xbox/PlayStation) en los menús.
//
// En menús y ventanas: stick / cruceta / LB-RB = mover el foco · A = aceptar · B = volver.
// En partida cada mando lo lee input.ts por separado; aquí sólo Start = pausa.
// La sala local (lobby.ts) lee los mandos por su cuenta para los asientos.

let pauseFlag = false;
const triggerPause = () => (pauseFlag = true);
export function takePadPause() {
  const v = pauseFlag;
  pauseFlag = false;
  return v;
}

const B = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, Select: 8, Start: 9, Up: 12, Down: 13, Left: 14, Right: 15 };
const DEAD = 0.25;

let prev: boolean[] = [];
let focused: HTMLElement | null = null;
let lastLayer: HTMLElement | null = null;
let repeatAt = 0;
let heldDir = "";
/** tras abrirse una ventana: el stick no navega hasta soltarlo y A espera un poco */
let stickLock = false;
let acceptAt = 0;
let connected = false;
let onConnect: ((name: string) => void) | null = null;
/** pantallas que gestionan los mandos por su cuenta (la sala local) */
let manual = false;
export const setManualPads = (v: boolean) => (manual = v);

/** Estado crudo de cada mando (para el modo sofá). */
export function padsRaw() {
  return pads().map((p) => ({
    index: p.index,
    id: p.id,
    buttons: p.buttons.map((b) => b.pressed || b.value > 0.5),
    axes: [...p.axes],
  }));
}
let onPress: (() => void) | null = null;

const FOCUSABLE = "button:not(:disabled), .rcard, input";

function pads() {
  return (navigator.getGamepads?.() ?? []).filter((p): p is Gamepad => !!p && p.connected);
}

const visible = (el: HTMLElement) => !el.classList.contains("hidden") && el.offsetParent !== null;
const $ = (id: string) => document.getElementById(id)!;

/** Capa de interfaz activa (la que recibe la navegación) o null si se está jugando. */
function activeLayer(): HTMLElement | null {
  if (!$("game").classList.contains("hidden")) {
    for (const id of ["results", "pause"]) {
      const el = $(id);
      if (!el.classList.contains("hidden")) return el;
    }
    return null;
  }
  return document.querySelector<HTMLElement>("#menus .screen:not(.hidden)");
}

/** Vibración (de un mando concreto o de todos). */
export function rumble(ms: number, strong: number, weak = strong, index = -1) {
  for (const p of pads()) {
    if (index >= 0 && p.index !== index) continue;
    const act = (p as Gamepad & { vibrationActuator?: { playEffect: (t: string, o: object) => Promise<unknown> } }).vibrationActuator;
    act?.playEffect("dual-rumble", { duration: ms, strongMagnitude: strong, weakMagnitude: weak }).catch(() => {});
  }
}

export function onPadConnect(fn: (name: string) => void) {
  onConnect = fn;
}

export function onPadPress(fn: () => void) {
  onPress = fn;
}

export const padConnected = () => connected;

/** ¿Mando de PlayStation? (para mostrar ✕ △ L1 R1 en vez de A Y LB RB) */
export function padIsPS() {
  const id = pads()[0]?.id ?? "";
  return /054c|dualsense|dualshock|playstation|^wireless controller/i.test(id);
}

function setFocus(el: HTMLElement | null) {
  focused?.classList.remove("padfocus");
  focused = el;
  if (!el) return;
  el.classList.add("padfocus");
  el.scrollIntoView({ block: "nearest", inline: "nearest" });
  if (el.tagName === "INPUT" && (el as HTMLInputElement).type === "text") el.focus();
  else if (document.activeElement instanceof HTMLElement && document.activeElement.tagName === "INPUT") document.activeElement.blur();
}

function candidates(layer: HTMLElement) {
  return Array.from(layer.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(visible);
}

function initialFocus(layer: HTMLElement) {
  const list = candidates(layer);
  return list.find((e) => e.classList.contains("sel")) ?? list.find((e) => e.classList.contains("big")) ?? list[0] ?? null;
}

/** Navegación espacial: el elemento más cercano en esa dirección. */
function move(layer: HTMLElement, dx: number, dy: number) {
  const list = candidates(layer);
  if (!focused || !list.includes(focused)) return setFocus(initialFocus(layer));
  const r = focused.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  let best: HTMLElement | null = null, bestScore = Infinity;
  for (const el of list) {
    if (el === focused) continue;
    const q = el.getBoundingClientRect();
    const vx = q.left + q.width / 2 - cx, vy = q.top + q.height / 2 - cy;
    const along = vx * dx + vy * dy;
    if (along <= 4) continue;
    const across = Math.abs(vx * dy - vy * dx);
    const score = along + across * 2.5;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  if (best) setFocus(best);
}

function press(el: HTMLElement) {
  if (el.tagName === "INPUT") {
    const inp = el as HTMLInputElement;
    if (inp.type === "checkbox") {
      inp.checked = !inp.checked;
      inp.dispatchEvent(new Event("change"));
    } else inp.focus();
    return;
  }
  el.click();
}

function adjustRange(el: HTMLElement, dir: number) {
  const inp = el as HTMLInputElement;
  if (inp.tagName !== "INPUT" || inp.type !== "range") return false;
  inp.value = String(Math.min(+inp.max, Math.max(+inp.min, +inp.value + dir * +(inp.step || 1))));
  inp.dispatchEvent(new Event("input"));
  return true;
}

function poll(now: number) {
  requestAnimationFrame(poll);
  const list = pads();
  if (!list.length) return;

  // estado combinado de todos los mandos
  const cur: boolean[] = [];
  let sx = 0, sy = 0;
  for (const p of list) {
    p.buttons.forEach((b, i) => (cur[i] = cur[i] || b.pressed || b.value > 0.5));
    sx += p.axes[0] ?? 0;
    sy += p.axes[1] ?? 0;
  }
  const before = prev;
  prev = cur;
  const down = (i: number) => !!cur[i] && !before[i];
  if (cur.some((v, i) => v && !before[i])) onPress?.();

  const layer = activeLayer();
  if (layer !== lastLayer) {
    lastLayer = layer;
    setFocus(layer ? initialFocus(layer) : null);
    // ventanas que aparecen solas: evitar elegir sin querer mientras se juega
    const auto = layer?.id === "results";
    stickLock = auto;
    acceptAt = auto ? now + 400 : 0;
  }

  // ---- jugando (sin ventanas encima)
  if (!layer) {
    if (down(B.Start)) triggerPause();
    return;
  }
  // la sala local lee cada mando por su cuenta
  if (manual && layer.id === "scr-lobby") {
    if (focused) setFocus(null);
    return;
  }

  // el foco puede haberse quedado en un elemento que ya no existe (cartas nuevas, etc.)
  if (!focused || !focused.isConnected || !layer.contains(focused) || !visible(focused)) {
    // si la interfaz se redibujó y ya marcó un elemento, seguimos desde ahí
    const kept = layer.querySelector<HTMLElement>(".padfocus");
    setFocus(kept && visible(kept) ? kept : initialFocus(layer));
  }

  // ---- navegación: cruceta, bumpers y (si no se está jugando a la vez) el stick
  if (Math.hypot(sx, sy) < 0.3) stickLock = false;
  let dir = "";
  if (cur[B.Left] || cur[B.LB]) dir = "L";
  else if (cur[B.Right] || cur[B.RB]) dir = "R";
  else if (cur[B.Up]) dir = "U";
  else if (cur[B.Down]) dir = "D";
  else if (!stickLock && Math.hypot(sx, sy) > 0.55) dir = Math.abs(sx) > Math.abs(sy) ? (sx < 0 ? "L" : "R") : sy < 0 ? "U" : "D";

  if (dir && (dir !== heldDir || now >= repeatAt)) {
    repeatAt = now + (dir !== heldDir ? 380 : 140);
    const [dx, dy] = { L: [-1, 0], R: [1, 0], U: [0, -1], D: [0, 1] }[dir]!;
    if (!(focused && dy === 0 && adjustRange(focused, dx))) move(layer, dx, dy);
  }
  heldDir = dir;

  if (down(B.A) && focused && now >= acceptAt) press(focused);
  if (down(B.B)) {
    const back = layer.querySelector<HTMLElement>("[data-back]");
    if (back && visible(back)) back.click();
  }
  if (down(B.Start)) {
    if (layer.id === "pause") triggerPause();
    else if (focused) press(focused);
  }
}

/** Botón Atrás del sistema: pausa en partida o el "Volver" de la pantalla.
 *  Devuelve false si no hay nada que cerrar (pantalla de título). */
export function backAction(): boolean {
  const layer = activeLayer();
  if (!layer) {
    triggerPause();
    return true;
  }
  const back = layer.querySelector<HTMLElement>("[data-back]");
  if (back && visible(back)) {
    back.click();
    return true;
  }
  return false;
}

export function initPad() {
  window.addEventListener("gamepadconnected", (e) => {
    connected = true;
    document.body.classList.add("has-pad");
    onConnect?.(e.gamepad.id);
  });
  window.addEventListener("gamepaddisconnected", () => {
    connected = pads().length > 0;
    document.body.classList.toggle("has-pad", connected);
  });
  // si se toca el ratón, el foco del mando se oculta hasta volver a usarlo
  window.addEventListener("pointermove", () => focused?.classList.remove("padfocus"));
  requestAnimationFrame(poll);
}
