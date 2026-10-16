// Dibuja una instantánea (Snap) en un canvas de baja resolución que luego se
// escala a múltiplos enteros: el píxel queda limpio a cualquier tamaño.

import { ARENAS, ARENA_RX, ARENA_RY, CHAMPS, SLOTS, TEAM_COLORS, type SkillDef } from "../shared/data";
import { TAU } from "../shared/math";
import { LV_STRIDE, PP_STRIDE, PROJ_KINDS, PROP_KINDS, PR_STRIDE, ST, ZONE_KINDS, ZN_STRIDE, type Ev, type FSnap, type Snap } from "../shared/protocol";
import { CAPSULE_ART } from "./art";
import { artSprite, projSprite, robotSprite, robotTint } from "./sprites";
import { bakeArena, bakePillar } from "./tiles";

interface Particle { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; c: string; s: number; g?: number }
interface Popup { x: number; y: number; v: number | string; kind: number; col?: string; t: number }
interface Fx { kind: string; x: number; y: number; a: number; b: number; t: number; max: number }

/** Jugador local: se le dibuja la mira. */
export interface LocalView { id: number; ax: number; ay: number; tag: string }

const DIGITS = ["111101101101111", "010110010010111", "111001111100111", "111001111001111", "101101111001001",
  "111100111001111", "111100111101111", "111001010010010", "111101111101111", "111101111001111"];
const POP_COLORS = ["#ffffff", "#5fe08a", "#7fe3ff"];
const RING_COLORS = ["#3fd7ff", "#ffd23f", "#ff9ed2", "#5fe08a", "#b06aff"];

export class Renderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  W = 640;
  H = 360;
  scale = 3;
  camX = 0;
  camY = 0;
  shake = 0;
  flash = 0;
  parts: Particle[] = [];
  pops: Popup[] = [];
  fx: Fx[] = [];
  showDamage = true;
  shakeOn = true;
  arena: { canvas: HTMLCanvasElement; ox: number; oy: number } | null = null;
  arenaIdx = -1;
  /** columnas horneadas por radio */
  pillars = new Map<number, HTMLCanvasElement>();
  theme = 0;
  seed: number;

  constructor(canvas: HTMLCanvasElement, seed: number) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.seed = seed;
    this.resize();
  }

  resize() {
    const vw = window.innerWidth, vh = window.innerHeight;
    // múltiplo entero que deje ver la arena entera a lo ancho (o casi)
    this.scale = Math.max(1, Math.min(Math.round(vh / 340), Math.floor(vw / 600)));
    this.W = Math.ceil(vw / this.scale);
    this.H = Math.ceil(vh / this.scale);
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    this.canvas.style.width = `${this.W * this.scale}px`;
    this.canvas.style.height = `${this.H * this.scale}px`;
    this.ctx.imageSmoothingEnabled = false;
  }

  setArena(idx: number) {
    if (idx === this.arenaIdx) return;
    this.arenaIdx = idx;
    const theme = (ARENAS[idx] ?? ARENAS[0]!).theme;
    this.arena = bakeArena(this.seed, theme);
    this.theme = theme;
    this.pillars.clear();
  }

  /** Pantalla (px CSS) -> mundo. */
  toWorld(sx: number, sy: number): [number, number] {
    return [sx / this.scale + this.camX, sy / this.scale + this.camY];
  }

  // ============================================================ eventos
  onEvents(evs: Ev[]) {
    for (const ev of evs) {
      const n = (i: number) => ev[i] as number;
      switch (ev[0]) {
        case "n":
          if (this.pops.length < 60) this.pops.push({ x: n(1), y: n(2), v: ev[3]!, kind: n(4), col: ev[5] as string | undefined, t: 0 });
          break;
        case "f":
          this.addFx(ev[1] as string, n(2), n(3), n(4), n(5));
          break;
      }
    }
  }

  addFx(kind: string, x: number, y: number, a: number, b: number) {
    const push = (max: number) => this.fx.push({ kind, x, y, a, b, t: 0, max });
    switch (kind) {
      case "slash": case "claw": push(0.16); break;
      case "quake": push(0.35); this.burst(x + Math.cos(a) * b * 0.6, y + Math.sin(a) * b * 0.6, 14, "#8c6c48", 80, 2); this.kick(3); break;
      case "fist": push(0.25); this.burst(x + Math.cos(a) * 20, y + Math.sin(a) * 20, 12, "#ff8a2b", 110); break;
      case "ring": push(0.35); break;
      case "boom":
        push(0.4);
        this.burst(x, y, Math.min(18, 5 + a / 3), b === 1 ? "#ffc928" : "#ffd23f", a * 3);
        if (a >= 20) this.fx.push({ kind: "ring", x, y, a: a * 1.4, b: 1, t: 0, max: 0.3 });
        if (a >= 30) this.kick(4);
        break;
      case "spark": this.burst(x, y, 4, "#fff6c8", 50); break;
      case "muzzle": push(0.07); this.burst(x, y + 6, 2, "#ffd23f", 40); break;
      case "block": push(0.2); this.burst(x, y, 6, "#ffd23f", 70); break;
      case "counter": push(0.4); this.burst(x, y - 6, 14, "#ff9ed2", 90); break;
      case "ko":
        push(0.6);
        this.burst(x, y - 6, 26, "#ff8a2b", 110, 2);
        this.burst(x, y - 6, 12, "#5a6070", 70, 2);
        this.kick(7);
        this.flash = Math.max(this.flash, 0.3);
        break;
      case "pickup": this.sparkle(x, y, "#5fe08a", 14); break;
      case "orbbreak": push(0.5); this.burst(x, y - 6, 30, "#ffd23f", 120, 2); this.flash = Math.max(this.flash, 0.25); this.kick(5); break;
      case "teleport": push(0.35); this.sparkle(x, y, a === 2 ? "#ff9ed2" : "#b06aff", 12); break;
      case "heal": this.sparkle(x, y, "#5fe08a", 6); break;
      case "sap": push(0.35); this.sparkle(x, y, "#7fe3ff", 8); break;
      case "snap": push(0.25); this.burst(x, y, 8, "#c9cfdc", 60); break;
      case "puff": this.burst(x, y, 6, b === 1 ? "#e6a0ff" : "#9aa0b0", 40); break;
      case "shake": this.kick(a); break;
      case "slash2": push(0.16); break;
      case "afterimage": push(0.3); this.sparkle(x, y, b === 1 ? "#3fd7ff" : b === 2 ? "#ff3b4e" : "#8a7bff", 6); break;
      case "deflect": push(0.25); this.burst(x, y, 8, "#7fe3ff", 80); break;
      case "mist": this.burst(x, y - 6, 16, "#c9cfdc", 50, 2); this.burst(x, y - 6, 6, "#c02a4a", 40); break;
      case "hypno": push(0.45); break;
      case "drain": push(0.22); break;
      case "bolt": push(0.2); this.burst(a, b, 5, "#bff6ff", 60); break;
      case "lever": push(0.4); this.sparkle(x, y, "#ffd23f", 12); this.kick(2); break;
      case "geyser": this.burst(x, y, 18, "#7fe3ff", 90, 2); this.burst(x, y, 8, "#ffffff", 60); break;
      case "crate": this.burst(x, y - 6, 18, "#9a5632", 90, 2); this.burst(x, y - 6, 8, "#d8a820", 60); this.kick(2); break;
      case "scrap": this.burst(x, y - 4, 22, "#7d8499", 110, 2); this.burst(x, y - 4, 10, "#ff8a2b", 80); break;
      case "log": push(0.7); this.burst(x, y - 4, 10, "#dfe4ee", 50, 2); break;
    }
  }

  kick(n: number) {
    if (this.shakeOn) this.shake = Math.max(this.shake, n);
  }

  burst(x: number, y: number, n: number, c: string, sp: number, s = 1) {
    if (this.parts.length > 700) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, v = sp * (0.3 + Math.random() * 0.7);
      this.parts.push({ x, y, z: 4, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6, vz: 20 + Math.random() * 60, life: 0.35 + Math.random() * 0.35, max: 0.7, c, s });
    }
  }

  sparkle(x: number, y: number, c: string, n: number) {
    for (let i = 0; i < n && this.parts.length < 700; i++)
      this.parts.push({ x: x + (Math.random() - 0.5) * 14, y: y + (Math.random() - 0.5) * 4, z: Math.random() * 10, vx: 0, vy: 0, vz: 25 + Math.random() * 30, life: 0.7, max: 0.7, c: i % 2 ? c : "#ffffff", s: 1, g: 0 });
  }

  // ============================================================ dibujo
  draw(s: Snap, locals: LocalView[], dt: number, now: number) {
    const ctx = this.ctx;
    this.setArena(s.arena);
    const A = this.arena!;

    // ---- cámara: centro de los robots vivos (los locales pesan más), dentro de la arena
    let fx = 0, fy = 0, wsum = 0;
    for (const f of s.f) {
      if (f.st & ST.dead) continue;
      const k = locals.some((l) => l.id === f.id) ? 2 : 1;
      fx += f.x * k;
      fy += f.y * k;
      wsum += k;
    }
    if (wsum) {
      fx /= wsum;
      fy /= wsum;
    }
    const aw = A.canvas.width, ah = A.canvas.height;
    let tx = fx - this.W / 2, ty = fy - 10 - this.H / 2;
    tx = aw <= this.W ? A.ox + (aw - this.W) / 2 : Math.max(A.ox, Math.min(A.ox + aw - this.W, tx));
    ty = ah <= this.H ? A.oy + (ah - this.H) / 2 : Math.max(A.oy, Math.min(A.oy + ah - this.H, ty));
    this.camX += (tx - this.camX) * Math.min(1, dt * 5);
    this.camY += (ty - this.camY) * Math.min(1, dt * 5);
    let sx = 0, sy = 0;
    if (this.shake > 0) {
      sx = Math.round((Math.random() - 0.5) * this.shake);
      sy = Math.round((Math.random() - 0.5) * this.shake);
      this.shake = Math.max(0, this.shake - dt * 22);
    }
    const cx = Math.round(this.camX) + sx, cy = Math.round(this.camY) + sy;
    const X = (x: number) => Math.round(x - cx), Y = (y: number) => Math.round(y - cy);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#0b0912";
    ctx.fillRect(0, 0, this.W, this.H);
    ctx.drawImage(A.canvas, X(A.ox), Y(A.oy));

    const localTeams = new Set(locals.map((l) => s.f.find((f) => f.id === l.id)?.team));

    // ---- muerte súbita: fuera de la elipse, oscuro y eléctrico
    if (s.storm < 1) {
      const rx = ARENA_RX * s.storm, ry = ARENA_RY * s.storm;
      ctx.save();
      ctx.fillStyle = `rgba(60,10,90,${0.45 + Math.sin(now * 3) * 0.08})`;
      ctx.beginPath();
      ctx.rect(0, 0, this.W, this.H);
      ctx.ellipse(X(0), Y(0), rx, ry, 0, 0, TAU, true);
      ctx.fill("evenodd");
      ctx.restore();
      for (let i = 0; i < 72; i++) {
        const a = (i / 72) * TAU + now * 0.4;
        ctx.fillStyle = (i + Math.floor(now * 10)) % 3 ? "#b06aff" : "#f0e0ff";
        ctx.fillRect(X(Math.cos(a) * rx) - 1, Y(Math.sin(a) * ry) - 1, 2, 2);
      }
    }

    // ---- zonas en el suelo
    this.drawZones(s, X, Y, now, localTeams);

    // ---- cápsulas
    for (let i = 0; i < s.caps.length; i += 2) {
      const x = s.caps[i]!, y = s.caps[i + 1]!;
      const spr = artSprite("capsule", CAPSULE_ART);
      this.disc(X(x), Y(y), 9 + Math.sin(now * 4), "#5fe08a", 0.25);
      this.shadow(X(x), Y(y), 4);
      ctx.drawImage(spr, X(x) - (spr.width >> 1), Y(y) - spr.height - 2 + Math.round(Math.sin(now * 3) * 1.5));
    }

    // ---- miras de los jugadores locales (bajo los robots)
    for (const l of locals) {
      const f = s.f.find((q) => q.id === l.id);
      if (f && !(f.st & ST.dead)) this.drawAim(f, l, X, Y, now);
    }

    // ---- aros de equipo
    for (const f of s.f) {
      if (f.st & ST.dead) continue;
      if (f.st & ST.stealth && !localTeams.has(f.team)) continue;
      const col = TEAM_COLORS[f.team]!;
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(X(f.x), Y(f.y) + 1, 8, 4, 0, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // ---- entidades ordenadas por y
    type D = { y: number; f: () => void };
    const list: D[] = [];
    for (const f of s.f) if (!(f.st & ST.dead)) list.push({ y: f.y, f: () => this.drawFighter(f, X, Y, now, localTeams) });
    for (let i = 0; i < s.pl.length; i += 3) {
      const x = s.pl[i]!, y = s.pl[i + 1]!, r = s.pl[i + 2]!;
      list.push({ y, f: () => this.drawPillar(x, y, r, X, Y) });
    }
    for (let i = 0; i < s.pp.length; i += PP_STRIDE) list.push({ y: s.pp[i + 3]!, f: () => this.drawProp(s.pp, i, X, Y, now) });
    for (let i = 0; i < s.lv.length; i += LV_STRIDE) list.push({ y: s.lv[i + 1]!, f: () => this.drawLever(s.lv, i, X, Y, now) });
    if (s.orb) {
      const [ox, oy, hp] = s.orb;
      list.push({ y: oy, f: () => this.drawOrb(ox, oy, hp, X, Y, now) });
    }
    list.sort((a, b) => a.y - b.y);
    for (const d of list) d.f();

    // ---- el humo tapa a los robots
    for (let i = 0; i < s.zn.length; i += ZN_STRIDE)
      if (ZONE_KINDS[s.zn[i + 1]!] === "smoke") {
        const raw = s.zn[i + 6]!;
        this.drawSmoke(s.zn[i + 2]!, s.zn[i + 3]!, s.zn[i + 4]!, (raw >= 1000 ? raw - 1000 : raw) / 100, X, Y, now, 0.35);
      }

    // ---- trampas que caen desde arriba (por encima de los robots)
    for (let i = 0; i < s.zn.length; i += ZN_STRIDE) {
      const kind = ZONE_KINDS[s.zn[i + 1]!];
      if (kind === "press" || kind === "magnet") {
        const raw = s.zn[i + 6]!;
        this.drawOverhead(kind, s.zn[i + 2]!, s.zn[i + 3]!, s.zn[i + 4]!, raw >= 1000, (raw >= 1000 ? raw - 1000 : raw) / 100, X, Y, now);
      }
    }

    // ---- proyectiles
    for (let i = 0; i < s.pr.length; i += PR_STRIDE) this.drawProj(s.pr, i, X, Y, now);

    // ---- efectos, partículas y números
    this.drawFx(dt, X, Y);
    for (const p of this.parts) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vz -= (p.g ?? 220) * dt;
      if (p.z < 0) {
        p.z = 0;
        p.vz *= -0.3;
        p.vx *= 0.6;
        p.vy *= 0.6;
      }
      p.vx *= 0.96;
      p.vy *= 0.96;
      ctx.globalAlpha = p.g === 0 ? Math.min(1, p.life * 2) : 1;
      ctx.fillStyle = p.c;
      ctx.fillRect(X(p.x), Y(p.y - p.z), p.s, p.s);
    }
    ctx.globalAlpha = 1;
    this.parts = this.parts.filter((p) => p.life > 0);

    // ---- barras sobre las cabezas
    for (const f of s.f) {
      if (f.st & ST.dead) continue;
      if (f.st & ST.stealth && !localTeams.has(f.team)) continue;
      this.drawBars(f, X, Y, locals.find((l) => l.id === f.id)?.tag);
    }

    for (const p of this.pops) {
      p.t += dt;
      const rise = Math.round(Math.min(1, p.t / 0.3) * 9);
      const blink = p.t > 0.65 && Math.floor(p.t * 20) % 2 === 0;
      if (blink) continue;
      if (p.kind === 3) this.label(X(p.x), Y(p.y) - rise, String(p.v), p.col ?? "#fff");
      else if (this.showDamage) this.number(X(p.x), Y(p.y) - rise, p.v as number, POP_COLORS[p.kind]!, (p.v as number) >= 25 ? 2 : 1);
    }
    this.pops = this.pops.filter((p) => p.t < 0.9);

    // ---- destellos
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${this.flash})`;
      ctx.fillRect(0, 0, this.W, this.H);
      this.flash = Math.max(0, this.flash - dt * 1.6);
    }
  }

  // ------------------------------------------------------------ mira
  drawAim(f: FSnap, l: LocalView, X: (n: number) => number, Y: (n: number) => number, now: number) {
    const ctx = this.ctx;
    const def = CHAMPS[f.champ];
    const cs = f.cs >= 0 ? def.skills[SLOTS[f.cs]!] : null;
    const casting = cs && cs.cast >= 0.25 ? cs : null;
    const d = Math.hypot(l.ax, l.ay) || 1;
    const dx = l.ax / d, dy = l.ay / d;
    const s: SkillDef = casting ?? def.skills.r2;
    const col = casting ? "#ffd23f" : TEAM_COLORS[f.team]!;
    const ox = f.x, oy = f.y - 4;
    ctx.globalAlpha = casting ? 0.55 + Math.sin(now * 20) * 0.15 : 0.35;
    ctx.fillStyle = col;
    ctx.strokeStyle = col;
    if (s.aim === "line" || s.aim === "dash") {
      const len = s.range;
      const w = Math.max(1, Math.round(casting ? s.size : 1));
      for (let k = 10; k < len; k += casting ? 2 : 5) ctx.fillRect(X(ox + dx * k) - (w >> 1), Y(oy + dy * k) - (w >> 1), w, w);
      ctx.fillRect(X(ox + dx * len) - 2, Y(oy + dy * len) - 2, 4, 4);
    } else if (s.aim === "cone") {
      const a = Math.atan2(dy, dx), half = s.size >= 40 ? 0.62 : 0.85;
      ctx.beginPath();
      ctx.moveTo(X(ox), Y(oy));
      ctx.arc(X(ox), Y(oy), s.range, a - half, a + half);
      ctx.closePath();
      ctx.globalAlpha *= 0.6;
      ctx.fill();
    } else if (s.aim === "ground" || s.aim === "ally") {
      const dist = Math.min(d, s.range);
      const tx = f.x + dx * dist, ty = f.y + dy * dist;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(X(tx), Y(ty), s.size, s.size * 0.8, 0, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha *= 0.4;
      ctx.fill();
    } else if (s.aim === "self" && casting) {
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(X(f.x), Y(f.y), s.size || 12, (s.size || 12) * 0.8, 0, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // cruz de mira
    const md = Math.min(d, 260);
    const mx = X(f.x + dx * md), my = Y(f.y + dy * md);
    ctx.fillStyle = "#17121f";
    ctx.fillRect(mx - 4, my - 1, 9, 3);
    ctx.fillRect(mx - 1, my - 4, 3, 9);
    ctx.fillStyle = "#fff6c8";
    ctx.fillRect(mx - 3, my, 7, 1);
    ctx.fillRect(mx, my - 3, 1, 7);
  }

  // ------------------------------------------------------------ robots
  drawFighter(f: FSnap, X: (n: number) => number, Y: (n: number) => number, now: number, localTeams: Set<number | undefined>) {
    const ctx = this.ctx;
    const stealth = !!(f.st & ST.stealth);
    if (stealth && !localTeams.has(f.team)) {
      // casi invisible: un brillo de vez en cuando
      if (Math.random() < 0.04) this.parts.push({ x: f.x + (Math.random() - 0.5) * 8, y: f.y, z: 6 + Math.random() * 8, vx: 0, vy: 0, vz: 6, life: 0.3, max: 0.3, c: "#c9cfdc", s: 1, g: 0 });
      return;
    }
    const face = f.face / 100;
    const spinning = !!(f.st & ST.spin);
    const left = spinning ? Math.floor(now * 22) % 2 === 0 : Math.cos(face) < 0;
    const stunned = f.st & (ST.stun | ST.sleep);
    const pose = f.mv && !stunned ? 1 + (Math.floor(now * 8 + f.id) % 2) : 0;
    const px = X(f.x), py = Y(f.y);
    const lift = f.z;
    this.shadow(px, py, lift ? 5 : 7);
    let spr = f.fl ? robotSprite(f.champ, pose, left, true) : robotSprite(f.champ, pose, left);
    if (f.st & ST.invuln && Math.floor(now * 16) % 2) spr = robotTint(f.champ, pose, left, "#fff6c8");
    if (stealth) ctx.globalAlpha = 0.35;
    if (f.st & ST.mist) {
      // niebla: nube rojiza en lugar del robot
      for (let k = 0; k < 6; k++) {
        const an = now * 3 + (k * TAU) / 6;
        this.disc(px + Math.round(Math.cos(an) * 5), py - 7 + Math.round(Math.sin(an) * 3), 5, k % 2 ? "#9aa0b0" : "#c9cfdc", 0.5);
      }
      this.disc(px, py - 7, 4, "#c02a4a", 0.5);
      if (Math.random() < 0.4) this.parts.push({ x: f.x + (Math.random() - 0.5) * 10, y: f.y, z: 4 + Math.random() * 8, vx: 0, vy: 0, vz: 4, life: 0.4, max: 0.4, c: "#c9cfdc", s: 2, g: 0 });
      return;
    }
    // al lanzar, pequeño temblor de carga
    const jit = f.cs >= 0 && f.cp > 30 && CHAMPS[f.champ].skills[SLOTS[f.cs]!].cast >= 0.3 ? Math.round(Math.sin(now * 60)) : 0;
    ctx.drawImage(spr, px - (spr.width >> 1) + jit, py - spr.height + 1 - lift);
    ctx.globalAlpha = 1;
    const top = py - spr.height - lift;

    // ---- estados
    if (f.st & ST.shield) {
      ctx.strokeStyle = `rgba(127,227,255,${0.6 + Math.sin(now * 8) * 0.2})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(px, py - 8 - lift, 11, 12, 0, 0, TAU);
      ctx.stroke();
    }
    if (f.st & ST.deflect) {
      // guardia espejo: arco cian que brilla
      for (const [col, rr, w] of [["#3fd7ff", 12, 2], ["#e6fbff", 13, 1]] as const) {
        ctx.strokeStyle = col;
        ctx.globalAlpha = 0.7 + Math.sin(now * 30) * 0.3;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.arc(px, py - 7, rr, face - 1.2, face + 1.2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    if (f.st & ST.fear) {
      const k = Math.floor(now * 6) % 2;
      this.label(px + (k ? 1 : -1), top - 4, "!", "#b06aff");
      ctx.fillStyle = "#e6d0ff";
      ctx.fillRect(px - 6, top + 2 + k, 1, 1);
      ctx.fillRect(px + 6, top + 3 - k, 1, 1);
    }
    if (f.st & ST.block) {
      ctx.strokeStyle = "#ffd23f";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py - 7, 12, face - 1.1, face + 1.1);
      ctx.stroke();
      ctx.strokeStyle = "#fff6c8";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(px, py - 7, 13, face - 0.9, face + 0.9);
      ctx.stroke();
    }
    if (f.st & ST.counter) {
      ctx.strokeStyle = `rgba(255,158,210,${0.6 + Math.sin(now * 30) * 0.3})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(px, py - 8, 12, 13, 0, 0, TAU);
      ctx.stroke();
    }
    if (f.st & ST.stun) {
      for (let k = 0; k < 3; k++) {
        const a = now * 6 + (k * TAU) / 3;
        ctx.fillStyle = k % 2 ? "#ffd23f" : "#fff6c8";
        ctx.fillRect(px + Math.round(Math.cos(a) * 7) - 1, top - 2 + Math.round(Math.sin(a) * 2), 2, 2);
      }
    }
    if (f.st & ST.sleep) {
      const k = (now * 1.5) % 1;
      this.label(px + 6 + Math.round(k * 4), top - 2 - Math.round(k * 8), "z", "#e6d0ff");
    }
    if (f.st & ST.silence) {
      ctx.fillStyle = "#b06aff";
      for (let k = 0; k < 3; k++) ctx.fillRect(px - 4 + k * 3, top - 4, 2, 2);
    }
    if (f.st & ST.root) {
      ctx.strokeStyle = "#c9cfdc";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(px, py, 7, 3, 0, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = "#7d8499";
      ctx.fillRect(px - 7, py - 1, 2, 2);
      ctx.fillRect(px + 5, py - 1, 2, 2);
    }
    if (f.st & ST.slow && Math.random() < 0.15) this.parts.push({ x: f.x + (Math.random() - 0.5) * 10, y: f.y, z: 10, vx: 0, vy: 0, vz: -10, life: 0.4, max: 0.4, c: "#7fe3ff", s: 1, g: 0 });
    if (f.st & ST.hot && Math.random() < 0.2) this.sparkle(f.x, f.y, "#5fe08a", 1);
    if (f.st & ST.haste && Math.random() < 0.3) this.parts.push({ x: f.x - Math.cos(face) * 6, y: f.y, z: 2, vx: 0, vy: 0, vz: 0, life: 0.25, max: 0.25, c: "#ff9ed2", s: 1, g: 0 });
  }

  drawBars(f: FSnap, X: (n: number) => number, Y: (n: number) => number, tag?: string) {
    const ctx = this.ctx;
    const px = X(f.x), top = Y(f.y) - 22 - f.z;
    const w = 20;
    ctx.fillStyle = "#17121f";
    ctx.fillRect(px - w / 2 - 1, top - 1, w + 2, 6);
    ctx.fillStyle = "#3a3460";
    ctx.fillRect(px - w / 2, top, w, 3);
    const hpw = Math.round((w * f.hp) / f.maxHp);
    ctx.fillStyle = TEAM_COLORS[f.team]!;
    ctx.fillRect(px - w / 2, top, hpw, 3);
    if (f.sh > 0) {
      ctx.fillStyle = "#e6fbff";
      ctx.fillRect(px - w / 2 + hpw, top, Math.min(w - hpw, Math.max(1, Math.round((w * f.sh) / f.maxHp))), 3);
    }
    // energía
    ctx.fillStyle = f.en >= 100 ? "#ffd23f" : "#c08a10";
    ctx.fillRect(px - w / 2, top + 4, Math.round((w * f.en) / 100), 1);
    // lanzamiento
    if (f.cs >= 0) {
      const s = CHAMPS[f.champ].skills[SLOTS[f.cs]!];
      if (s.cast >= 0.25) {
        ctx.fillStyle = "#17121f";
        ctx.fillRect(px - w / 2 - 1, top + 6, w + 2, 3);
        ctx.fillStyle = "#fff6c8";
        ctx.fillRect(px - w / 2, top + 7, Math.round((w * f.cp) / 100), 1);
      }
    }
    if (tag) this.label(px, top - 6, tag, "#ffd23f");
  }

  drawPillar(x: number, y: number, r: number, X: (n: number) => number, Y: (n: number) => number) {
    let spr = this.pillars.get(r);
    if (!spr) this.pillars.set(r, (spr = bakePillar(this.theme, r)));
    this.shadow(X(x), Y(y) + 2, r + 2);
    this.ctx.drawImage(spr, X(x) - (spr.width >> 1), Y(y) + Math.round(r * 0.6) - spr.height + 2);
  }

  // ------------------------------------------------------------ objetos y palancas
  drawProp(pp: number[], i: number, X: (n: number) => number, Y: (n: number) => number, _now: number) {
    const ctx = this.ctx;
    const kind = PROP_KINDS[pp[i + 1]!]!, x = pp[i + 2]!, y = pp[i + 3]!, r = pp[i + 4]!, hp = pp[i + 6]! / 100;
    const px = X(x), py = Y(y);
    if (kind === "crate") {
      // caja de madera: tapa clara, frontal con tablas y grietas según la vida
      const w = r * 2, h = Math.round(r * 1.7), top = py - h - 2;
      this.shadow(px, py + 1, r + 1);
      ctx.fillStyle = "#17121f";
      ctx.fillRect(px - r - 1, top - 4, w + 2, h + 6);
      ctx.fillStyle = "#c88a58";
      ctx.fillRect(px - r, top - 3, w, 4);
      ctx.fillStyle = "#9a5632";
      ctx.fillRect(px - r, top + 1, w, h);
      ctx.fillStyle = "#7a4428";
      for (let k = 3; k < h; k += 4) ctx.fillRect(px - r, top + 1 + k, w, 1);
      ctx.fillStyle = "#d8a820";
      ctx.fillRect(px - r, top + 1, 2, h);
      ctx.fillRect(px + r - 2, top + 1, 2, h);
      ctx.fillStyle = "#17121f";
      if (hp < 0.7) {
        ctx.fillRect(px - 2, top + 3, 1, 4);
        ctx.fillRect(px - 1, top + 6, 1, 3);
      }
      if (hp < 0.4) {
        ctx.fillRect(px + 3, top + 2, 1, 5);
        ctx.fillRect(px + 2, top + 7, 1, 4);
        ctx.fillRect(px - 5, top + 9, 3, 1);
      }
    }
  }

  drawLever(lv: number[], i: number, X: (n: number) => number, Y: (n: number) => number, now: number) {
    const ctx = this.ctx;
    const x = lv[i]!, y = lv[i + 1]!, state = lv[i + 2]!, prog = lv[i + 3]! / 100;
    const px = X(x), py = Y(y);
    const ready = state === 0;
    if (ready) this.disc(px, py, 11 + Math.sin(now * 5), "#ffd23f", 0.14);
    this.shadow(px, py + 1, 6);
    // base
    ctx.fillStyle = "#17121f";
    ctx.fillRect(px - 6, py - 4, 13, 6);
    ctx.fillStyle = "#5a6078";
    ctx.fillRect(px - 5, py - 3, 11, 4);
    ctx.fillStyle = "#8a90a8";
    ctx.fillRect(px - 5, py - 3, 11, 1);
    // palanca: arriba si está lista, abajo si está recargando
    const ang = ready ? -1.2 + prog * 1.4 : 0.9;
    const ex = px + Math.round(Math.cos(ang - Math.PI / 2 + 0.6) * 9), ey = py - 3 + Math.round(Math.sin(ang - Math.PI / 2 + 0.6) * 9);
    ctx.strokeStyle = "#17121f";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(px, py - 3);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.strokeStyle = "#c9cfdc";
    ctx.lineWidth = 1;
    ctx.stroke();
    this.disc(ex, ey, 2.5, "#17121f", 1);
    this.disc(ex, ey, 1.6, ready ? (Math.floor(now * 4) % 2 ? "#ff3b4e" : "#ff8a2b") : "#5a5a6a", 1);
    // luz de estado
    ctx.fillStyle = ready ? "#5fe08a" : state === 1 ? "#ff3b4e" : "#3a3460";
    ctx.fillRect(px + 3, py - 2, 2, 2);
    if (ready && prog > 0) {
      ctx.fillStyle = "#17121f";
      ctx.fillRect(px - 9, py + 4, 18, 3);
      ctx.fillStyle = "#ffd23f";
      ctx.fillRect(px - 8, py + 5, Math.round(16 * prog), 1);
    }
  }

  /** Lo que cae desde arriba: la prensa de la fábrica y el imán de la grúa. */
  drawOverhead(kind: string, x: number, y: number, r: number, armed: boolean, prog: number, X: (n: number) => number, Y: (n: number) => number, now: number) {
    const ctx = this.ctx;
    if (kind === "press") {
      // placa de metal que baja (aviso) y golpea (activa)
      // en el aviso sólo se ve caer al final; al golpear se queda abajo y vuelve a subir
      if (!armed && prog < 0.55) return;
      const drop = armed ? 0 : Math.round(((1 - prog) / 0.45) ** 2 * 200);
      const lift = armed ? Math.round(Math.max(0, prog - 0.5) * 2 * 220) : 0;
      const off = drop + lift;
      const x0 = X(x - r), w = r * 2;
      const y0 = Y(-ARENA_RY) - 30 - off, y1 = Y(ARENA_RY) - 6 - off;
      ctx.globalAlpha = armed ? 1 - Math.max(0, prog - 0.7) * 3 : 1;
      ctx.fillStyle = "#17121f";
      ctx.fillRect(x0 - 1, y0, w + 2, y1 - y0 + 8);
      ctx.fillStyle = "#4a4f66";
      ctx.fillRect(x0, y0, w, y1 - y0 + 6);
      ctx.fillStyle = "#6a7088";
      for (let yy = y0 + 4; yy < y1; yy += 12) ctx.fillRect(x0 + 1, yy, w - 2, 2);
      // franjas de peligro en el borde de abajo
      for (let k = 0; k < w; k += 4) {
        ctx.fillStyle = (k >> 2) % 2 ? "#17121f" : "#ffd23f";
        ctx.fillRect(x0 + k, y1 + 2, 4, 4);
      }
      ctx.globalAlpha = 1;
      return;
    }
    // imán: disco colgando de un cable desde arriba
    const fade = armed ? 1 : prog;
    const hang = 40;
    const px = X(x), py = Y(y) - hang;
    ctx.globalAlpha = fade;
    ctx.fillStyle = "#17121f";
    ctx.fillRect(px - 1, 0, 3, py - 6);
    ctx.fillStyle = "#9aa0b0";
    ctx.fillRect(px, 0, 1, py - 6);
    this.disc(px, py, 13, "#17121f", fade);
    this.disc(px, py, 12, "#7a7068", fade);
    this.disc(px, py - 2, 9, "#9aa0b0", fade);
    const hot = armed && prog > 0.7;
    ctx.fillStyle = hot && Math.floor(now * 12) % 2 ? "#ff3b4e" : "#4fb4ff";
    ctx.fillRect(px - 6, py + 2, 12, 2);
    if (armed && Math.random() < 0.5) {
      const an = Math.random() * TAU;
      this.parts.push({ x: x + Math.cos(an) * r * 0.8, y: y + Math.sin(an) * r * 0.6, z: 2, vx: -Math.cos(an) * 60, vy: -Math.sin(an) * 40, vz: 20, life: 0.4, max: 0.4, c: "#7fe3ff", s: 1, g: 0 });
    }
    ctx.globalAlpha = 1;
  }

  drawOrb(x: number, y: number, hp: number, X: (n: number) => number, Y: (n: number) => number, now: number) {
    const ctx = this.ctx;
    const px = X(x), bob = Math.round(Math.sin(now * 2.5) * 2), py = Y(y) - 14 + bob;
    this.shadow(px, Y(y), 7);
    this.disc(px, py, 11 + Math.sin(now * 5), "#ffd23f", 0.2);
    this.disc(px, py, 8, "#17121f", 1);
    this.disc(px, py, 7, "#c08a10", 1);
    this.disc(px, py, 5, "#ffd23f", 1);
    ctx.fillStyle = "#fff6c8";
    ctx.fillRect(px - 3, py - 4, 2, 2);
    ctx.fillStyle = "#c08a10";
    ctx.fillRect(px - 1, py - 2, 3, 5);
    ctx.fillStyle = "#17121f";
    ctx.fillRect(px - 9, py + 9, 18, 3);
    ctx.fillStyle = "#ffd23f";
    ctx.fillRect(px - 8, py + 10, Math.round((16 * hp) / 60), 1);
  }

  // ------------------------------------------------------------ proyectiles
  drawProj(pr: number[], i: number, X: (n: number) => number, Y: (n: number) => number, now: number) {
    const ctx = this.ctx;
    const kind = PROJ_KINDS[pr[i + 1]!]!, x = pr[i + 2]!, y = pr[i + 3]!, a = pr[i + 4]! / 100, team = pr[i + 5]!;
    const lift = 6;
    // brillo del equipo debajo (para leer de quién es cada bala)
    ctx.fillStyle = TEAM_COLORS[team]!;
    ctx.globalAlpha = 0.35;
    ctx.fillRect(X(x) - 2, Y(y) - 1, 4, 2);
    ctx.globalAlpha = 1;
    if (kind === "zap") {
      // rayo: trazo cian con núcleo blanco
      const x0 = X(x), y0 = Y(y) - lift, x1 = X(x - Math.cos(a) * 9), y1 = Y(y - Math.sin(a) * 9) - lift;
      for (const [col, w] of [["#3fd7ff", 3], ["#ffffff", 1]] as const) {
        ctx.strokeStyle = col;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
      return;
    }
    const spr = projSprite(kind === "bat" ? (Math.floor(now * 12 + x) % 2 ? "bat" : "batUp") : kind);
    if (kind === "ball") this.shadow(X(x), Y(y), 3);
    if (kind === "shuriken") {
      ctx.save();
      ctx.translate(X(x), Y(y) - lift);
      ctx.rotate(now * 22);
      ctx.drawImage(spr, -spr.width / 2, -spr.height / 2);
      ctx.restore();
      return;
    }
    const rot = kind === "snipe" || kind === "hook" || kind === "shellx" || kind === "fireball" || kind === "kunai" || kind === "wave";
    if (rot) {
      ctx.save();
      ctx.translate(X(x), Y(y) - lift);
      ctx.rotate(a);
      ctx.drawImage(spr, -spr.width / 2, -spr.height / 2);
      ctx.restore();
    } else ctx.drawImage(spr, X(x) - (spr.width >> 1), Y(y) - lift - (spr.height >> 1));
    // estelas
    const trail = (c: string, p = 0.6) => {
      if (Math.random() < p) this.parts.push({ x: x - Math.cos(a) * 4, y: y, z: lift, vx: 0, vy: 0, vz: 3, life: 0.25, max: 0.25, c, s: 1, g: 0 });
    };
    if (kind === "fireball") trail(Math.random() < 0.5 ? "#ff8a2b" : "#ffd23f", 0.9);
    else if (kind === "snipe") {
      ctx.strokeStyle = "rgba(255,246,200,0.5)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(X(x), Y(y) - lift);
      ctx.lineTo(X(x - Math.cos(a) * 26), Y(y - Math.sin(a) * 26) - lift);
      ctx.stroke();
    } else if (kind === "hook") {
      ctx.strokeStyle = "#7d8499";
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 1]);
      ctx.beginPath();
      ctx.moveTo(X(x), Y(y) - lift);
      ctx.lineTo(X(x - Math.cos(a) * 30), Y(y - Math.sin(a) * 30) - lift);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (kind === "seed") trail("#9fffb0", 0.4);
    else if (kind === "pollen") trail("#e6a0ff", 0.6);
    else if (kind === "shellx" || kind === "ball") trail("#c9cfdc", 0.8);
    else if (kind === "wave") {
      trail("#7fe3ff", 0.9);
      trail("#e6fbff", 0.5);
    } else if (kind === "bat") trail("#5a2a6a", 0.3);
  }

  // ------------------------------------------------------------ zonas
  drawZones(s: Snap, X: (n: number) => number, Y: (n: number) => number, now: number, localTeams: Set<number | undefined>) {
    const ctx = this.ctx;
    for (let i = 0; i < s.zn.length; i += ZN_STRIDE) {
      const kind = ZONE_KINDS[s.zn[i + 1]!]!, x = s.zn[i + 2]!, y = s.zn[i + 3]!, r = s.zn[i + 4]!, a = s.zn[i + 5]! / 100;
      const raw = s.zn[i + 6]!, armed = raw >= 1000, prog = ((armed ? raw - 1000 : raw) / 100), team = s.zn[i + 7]!, len = s.zn[i + 8]!;
      const px = X(x), py = Y(y);
      const ally = localTeams.has(team);
      switch (kind) {
        case "firestorm":
        case "meteor":
          if (armed) break;
          this.disc(px, py, r, "#ff3b4e", 0.12 + prog * 0.15);
          this.disc(px, py, r * prog, "#ff8a2b", 0.3);
          ctx.strokeStyle = Math.floor(now * (prog > 0.7 ? 16 : 8)) % 2 ? "#ffd23f" : "#ff3b4e";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.ellipse(px, py, r, r * 0.8, 0, 0, TAU);
          ctx.stroke();
          if (kind === "meteor") {
            ctx.fillStyle = "#ff3b4e";
            ctx.fillRect(px - r, py, r * 2, 1);
            ctx.fillRect(px, py - Math.round(r * 0.8), 1, Math.round(r * 1.6));
          }
          break;
        case "trap": {
          ctx.globalAlpha = ally ? 1 : 0.55;
          const blink = !armed && Math.floor(now * 10) % 2;
          ctx.fillStyle = "#17121f";
          ctx.fillRect(px - 5, py - 3, 11, 5);
          ctx.fillStyle = blink ? "#ff3b4e" : "#9aa0b0";
          ctx.fillRect(px - 4, py - 2, 9, 3);
          ctx.fillStyle = "#dfe4ee";
          for (let k = -4; k <= 4; k += 2) ctx.fillRect(px + k, py - 3, 1, 1);
          ctx.fillStyle = "#ff3b4e";
          ctx.fillRect(px, py - 1, 1, 1);
          ctx.globalAlpha = 1;
          break;
        }
        case "firewall": {
          const c = Math.cos(a + Math.PI / 2), sn = Math.sin(a + Math.PI / 2);
          if (!armed) {
            for (let k = -len / 2; k <= len / 2; k += 3) {
              ctx.fillStyle = Math.floor(now * 12) % 2 ? "#ff8a2b" : "#ff3b4e";
              ctx.fillRect(X(x + c * k), Y(y + sn * k), 2, 2);
            }
            break;
          }
          const fade = Math.min(1, (1 - prog) * 6);
          // brasas en la base
          for (let k = -len / 2; k <= len / 2; k += 4) this.disc(X(x + c * k), Y(y + sn * k), 5, "#ff3b4e", 0.35 * fade);
          for (let k = -len / 2; k <= len / 2; k += 4) this.disc(X(x + c * k), Y(y + sn * k), 3, "#ff8a2b", 0.6 * fade);
          // lenguas de fuego
          for (let k = -len / 2; k <= len / 2; k += 5) {
            const fx = x + c * k, fy = y + sn * k;
            const h = Math.round((7 + Math.sin(now * 14 + k) * 3) * fade);
            const ox = Math.round(Math.sin(now * 9 + k * 0.7) * 1.5);
            ctx.fillStyle = "#ff3b4e";
            ctx.fillRect(X(fx) - 2 + ox, Y(fy) - h, 5, h);
            ctx.fillStyle = "#ff8a2b";
            ctx.fillRect(X(fx) - 1 + ox, Y(fy) - h + 2, 3, h - 2);
            ctx.fillStyle = "#ffd23f";
            ctx.fillRect(X(fx) + ox, Y(fy) - h + 4, 1, Math.max(0, h - 5));
            if (Math.random() < 0.08) this.parts.push({ x: fx, y: fy, z: h, vx: 0, vy: 0, vz: 20, life: 0.35, max: 0.35, c: "#ffd23f", s: 1, g: 0 });
          }
          break;
        }
        case "bloom": {
          if (!armed) {
            this.disc(px, py, r, "#5fe08a", 0.1 + prog * 0.12);
            this.disc(px, py, r * prog, "#5fe08a", 0.22);
            ctx.strokeStyle = "#9fffb0";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.ellipse(px, py, r, r * 0.8, 0, 0, TAU);
            ctx.stroke();
          } else this.disc(px, py, r * (1 - prog * 0.5), "#c8ffd8", 0.5 * (1 - prog));
          // flor
          const fh = Math.round(Math.min(1, prog + (armed ? 1 : 0)) * 6);
          ctx.fillStyle = "#2f8a4a";
          ctx.fillRect(px, py - fh, 1, fh);
          ctx.fillStyle = "#ff7bd5";
          ctx.fillRect(px - 1, py - fh - 2, 3, 3);
          ctx.fillStyle = "#ffd23f";
          ctx.fillRect(px, py - fh - 1, 1, 1);
          break;
        }
        case "garden": {
          const fade = armed ? Math.min(1, (1 - prog) * 4) : prog;
          this.disc(px, py, r, "#5fe08a", 0.16 * fade);
          for (let k = 0; k < 28; k++) {
            const an = (k / 28) * TAU + now * 0.3;
            ctx.fillStyle = k % 3 ? "#5fd06a" : "#ff7bd5";
            ctx.globalAlpha = fade;
            ctx.fillRect(X(x + Math.cos(an) * r), Y(y + Math.sin(an) * r * 0.8), 2, 2);
          }
          ctx.globalAlpha = 1;
          if (armed && Math.random() < 0.4) this.sparkle(x + (Math.random() - 0.5) * r * 1.6, y + (Math.random() - 0.5) * r, "#9fffb0", 1);
          break;
        }
        case "puff":
          this.disc(px, py - 4, r * (0.6 + prog * 0.4), "#ff8a2b", 0.45 * (1 - prog));
          break;
        case "lob": {
          if (armed) break;
          this.disc(px, py, r, "#ff8a2b", 0.1 + prog * 0.15);
          this.disc(px, py, r * prog, "#ff3b4e", 0.25);
          ctx.strokeStyle = Math.floor(now * (prog > 0.7 ? 16 : 8)) % 2 ? "#ffd23f" : "#ff8a2b";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.ellipse(px, py, r, r * 0.8, 0, 0, TAU);
          ctx.stroke();
          // el obús cayendo
          const h = Math.round((1 - prog) * 110);
          this.shadow(px, py, 2 + prog * 3);
          ctx.drawImage(projSprite("shell"), px - 3, py - 4 - h);
          if (Math.random() < 0.5) this.parts.push({ x, y: y + 1, z: h + 6, vx: 0, vy: 0, vz: 0, life: 0.2, max: 0.2, c: "#c9cfdc", s: 1, g: 0 });
          break;
        }
        case "turret": {
          if (ally) {
            ctx.globalAlpha = 0.18;
            ctx.strokeStyle = TEAM_COLORS[team]!;
            ctx.setLineDash([2, 4]);
            ctx.beginPath();
            ctx.ellipse(px, py, r, r * 0.8, 0, 0, TAU);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.globalAlpha = 1;
          }
          const lift = armed ? 0 : Math.round((1 - prog) * 30);
          this.shadow(px, py, 5);
          ctx.fillStyle = "#17121f";
          ctx.fillRect(px - 5, py - 5 - lift, 11, 6);
          ctx.fillStyle = "#6b7287";
          ctx.fillRect(px - 4, py - 4 - lift, 9, 4);
          // cabeza giratoria con cañón hacia su objetivo
          const hx = px, hy = py - 9 - lift;
          ctx.strokeStyle = "#17121f";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(hx, hy);
          ctx.lineTo(hx + Math.cos(a) * 7, hy + Math.sin(a) * 5);
          ctx.stroke();
          ctx.strokeStyle = "#c9cfdc";
          ctx.lineWidth = 1;
          ctx.stroke();
          this.disc(hx, hy, 4, "#17121f", 1);
          this.disc(hx, hy, 3, "#c9cfdc", 1);
          ctx.fillStyle = Math.floor(now * 4) % 2 ? "#3fd7ff" : TEAM_COLORS[team]!;
          ctx.fillRect(hx - 1, hy - 1, 2, 2);
          if (armed && prog > 0.85 && Math.floor(now * 10) % 2) {
            ctx.fillStyle = "#ff3b4e";
            ctx.fillRect(hx - 1, hy - 5, 2, 2);
          }
          break;
        }
        case "dome": {
          const fade = Math.min(1, (1 - prog) * 5) * (armed ? 1 : prog);
          const R = r + Math.sin(now * 6) * 0.7;
          this.disc(px, py - 4, R, "#3fd7ff", 0.13 * fade);
          ctx.globalAlpha = 0.8 * fade;
          ctx.strokeStyle = "#bff6ff";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.ellipse(px, py - 4, R, R * 0.8, 0, 0, TAU);
          ctx.stroke();
          // celdas hexagonales que parpadean
          for (let k = 0; k < 18; k++) {
            const an = (k / 18) * TAU, rr = R * (0.45 + (k % 3) * 0.2);
            if ((k + Math.floor(now * 8)) % 4) continue;
            ctx.fillStyle = "#e6fbff";
            ctx.fillRect(px + Math.round(Math.cos(an) * rr), py - 4 + Math.round(Math.sin(an) * rr * 0.8), 2, 1);
          }
          ctx.globalAlpha = 1;
          break;
        }
        case "smoke":
          this.drawSmoke(x, y, r, prog, X, Y, now, 0.45);
          break;
        case "bloodmoon": {
          const fade = armed ? Math.min(1, (1 - prog) * 6) : prog;
          this.disc(px, py, r, "#5a0a20", 0.35 * fade);
          this.disc(px, py, r * (0.75 + Math.sin(now * 4) * 0.05), "#c02a4a", 0.18 * fade);
          ctx.globalAlpha = fade;
          for (let k = 0; k < 30; k++) {
            const an = (k / 30) * TAU - now * 0.5;
            ctx.fillStyle = k % 3 ? "#c02a4a" : "#ff3b4e";
            ctx.fillRect(X(x + Math.cos(an) * r), Y(y + Math.sin(an) * r * 0.8), 2, 2);
          }
          // la luna sobre la zona
          const my = py - 52 + Math.round(Math.sin(now * 2) * 2);
          this.disc(px, my, 9, "#17121f", fade);
          this.disc(px, my, 8, "#c02a4a", fade);
          this.disc(px - 2, my - 2, 4, "#ff5f6d", fade);
          ctx.globalAlpha = 1;
          if (armed && Math.random() < 0.3) this.parts.push({ x: x + (Math.random() - 0.5) * r * 1.6, y: y + (Math.random() - 0.5) * r, z: 0, vx: 0, vy: 0, vz: 18, life: 0.6, max: 0.6, c: "#ff3b4e", s: 1, g: 0 });
          break;
        }
        case "singularity": {
          const k = armed ? 1 : prog;
          this.disc(px, py, r * k, "#3e1a78", 0.25);
          this.disc(px, py, r * 0.55 * k, "#22104a", 0.6);
          this.disc(px, py, 6 * k + Math.sin(now * 12), "#0b0918", 1);
          ctx.strokeStyle = "#b06aff";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.ellipse(px, py, 7 * k, 5.6 * k, 0, 0, TAU);
          ctx.stroke();
          // espiral de partículas hacia el centro
          for (let j = 0; j < 16; j++) {
            const t = (now * 0.8 + j / 16) % 1;
            const an = j * 2.4 + t * 5;
            const rr = r * k * (1 - t);
            ctx.fillStyle = j % 2 ? "#e6d0ff" : "#b06aff";
            ctx.fillRect(px + Math.round(Math.cos(an) * rr), py + Math.round(Math.sin(an) * rr * 0.8), 1, 1);
          }
          break;
        }
        case "whirl": {
          this.disc(px, py - 4, r * 0.95, "#8a7bff", 0.12);
          // estela circular y ocho hojas de energía girando
          ctx.globalAlpha = 0.5;
          ctx.strokeStyle = "#7fe3ff";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.ellipse(px, py - 5, r * 0.9, r * 0.6, 0, now * 18, now * 18 + 4);
          ctx.stroke();
          ctx.globalAlpha = 1;
          for (let j = 0; j < 8; j++) {
            const an = now * 16 + (j * TAU) / 8;
            const rr = r * (j % 2 ? 0.55 : 0.9);
            const bx = px + Math.cos(an) * rr, by = py - 5 + Math.sin(an) * rr * 0.65;
            for (const [col, w] of [["#5140c4", 4], [j % 2 ? "#7fe3ff" : "#e6fbff", 2]] as const) {
              ctx.strokeStyle = col;
              ctx.lineWidth = w;
              ctx.beginPath();
              ctx.moveTo(bx, by);
              ctx.lineTo(bx + Math.cos(an + 1.7) * 10, by + Math.sin(an + 1.7) * 6);
              ctx.stroke();
            }
          }
          if (Math.random() < 0.6) {
            const an = Math.random() * TAU;
            this.parts.push({ x: x + Math.cos(an) * r * 0.9, y: y + Math.sin(an) * r * 0.6, z: 4, vx: -Math.sin(an) * 60, vy: Math.cos(an) * 40, vz: 10, life: 0.3, max: 0.3, c: "#bff6ff", s: 1, g: 0 });
          }
          break;
        }
        // ---- trampas (neutrales: avisan con el mismo lenguaje que las zonas de fuego)
        case "geyser":
        case "rise": {
          const water = kind === "geyser";
          if (!armed) {
            this.disc(px, py, r, water ? "#3fd7ff" : "#ffd23f", 0.12 + prog * 0.15);
            this.disc(px, py, r * prog, water ? "#7fe3ff" : "#ff8a2b", 0.3);
            ctx.strokeStyle = Math.floor(now * (prog > 0.7 ? 16 : 8)) % 2 ? "#ffffff" : water ? "#3fd7ff" : "#ff3b4e";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.ellipse(px, py, r, r * 0.8, 0, 0, TAU);
            ctx.stroke();
            if (Math.random() < 0.3) this.parts.push({ x: x + (Math.random() - 0.5) * r, y, z: 0, vx: 0, vy: 0, vz: 30, life: 0.3, max: 0.3, c: water ? "#bff6ff" : "#c9cfdc", s: 1, g: 0 });
          } else if (water) {
            // columna de agua
            const h = Math.round(Math.sin(Math.min(1, prog * 1.2) * Math.PI) * 46);
            ctx.globalAlpha = 0.75;
            ctx.fillStyle = "#3fd7ff";
            ctx.fillRect(px - 7, py - h, 15, h);
            ctx.fillStyle = "#bff6ff";
            ctx.fillRect(px - 3, py - h, 7, h);
            ctx.globalAlpha = 1;
            this.disc(px, py, r, "#7fe3ff", 0.35 * (1 - prog));
          }
          break;
        }
        case "press": {
          if (armed) break;
          const blink = Math.floor(now * (prog > 0.6 ? 14 : 7)) % 2;
          ctx.globalAlpha = 0.16 + prog * 0.2;
          ctx.fillStyle = "#ff3b4e";
          ctx.fillRect(X(x - r), Y(-ARENA_RY), r * 2, ARENA_RY * 2);
          ctx.globalAlpha = 0.8;
          ctx.fillStyle = blink ? "#ffd23f" : "#ff3b4e";
          ctx.fillRect(X(x - r), Y(-ARENA_RY), 1, ARENA_RY * 2);
          ctx.fillRect(X(x + r), Y(-ARENA_RY), 1, ARENA_RY * 2);
          ctx.globalAlpha = 1;
          break;
        }
        case "laser": {
          const dir = Math.cos(a) >= 0 ? 1 : -1;
          // recortado a la elipse a esa altura
          const half = ARENA_RX * Math.sqrt(Math.max(0, 1 - (y / ARENA_RY) ** 2));
          const x0 = X(-half), x1 = X(half);
          if (!armed) {
            ctx.globalAlpha = 0.2 + prog * 0.3;
            ctx.fillStyle = "#ff3b9e";
            ctx.fillRect(x0, py - r, x1 - x0, r * 2);
            ctx.globalAlpha = 1;
            ctx.fillStyle = Math.floor(now * (prog > 0.6 ? 16 : 8)) % 2 ? "#ffffff" : "#ff3b9e";
            ctx.fillRect(x0, py - r, x1 - x0, 1);
            ctx.fillRect(x0, py + r, x1 - x0, 1);
            // emisor en el muro de salida
            this.disc(dir > 0 ? x0 + 4 : x1 - 4, py - 4, 4, "#ff3b9e", 0.6 + prog * 0.4);
            break;
          }
          // barrido: cabeza brillante y estela que se apaga
          const front = -dir * ARENA_RX + dir * ARENA_RX * 2 * prog;
          if (Math.abs(front) > half + 4) break;
          const fx = X(front), tail = X(Math.max(-half, Math.min(half, front - dir * 70)));
          for (const [col, w, al] of [["#ff3b9e", 7, 0.4], ["#ff7bd5", 3, 0.9], ["#ffffff", 1, 1]] as const) {
            ctx.globalAlpha = al;
            ctx.strokeStyle = col;
            ctx.lineWidth = w;
            ctx.beginPath();
            ctx.moveTo(tail, py - 4);
            ctx.lineTo(fx, py - 4);
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
          this.disc(fx, py - 4, 5, "#ffffff", 0.9);
          if (Math.random() < 0.9) this.burst(front, y + 2, 1, "#ff7bd5", 60);
          break;
        }
        case "magnet": {
          // sombra del imán y radio de atracción
          const hot = armed && prog > 0.7;
          this.disc(px, py, armed ? 25 : 25 * prog, hot ? "#ff3b4e" : "#17121f", hot ? 0.3 : 0.3);
          ctx.strokeStyle = hot && Math.floor(now * 14) % 2 ? "#ffd23f" : "#ff3b4e";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.ellipse(px, py, 25, 20, 0, 0, TAU);
          ctx.stroke();
          if (armed) {
            ctx.globalAlpha = 0.25;
            ctx.strokeStyle = "#4fb4ff";
            ctx.setLineDash([2, 4]);
            ctx.beginPath();
            ctx.ellipse(px, py, r, r * 0.8, 0, now * 2, now * 2 + TAU);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.globalAlpha = 1;
          }
          break;
        }
        case "pulse": {
          if (!armed) {
            // el centro se carga
            this.disc(px, py - 6, 10 + prog * 14, "#ffd23f", 0.15 + prog * 0.25);
            ctx.strokeStyle = Math.floor(now * 14) % 2 ? "#fff6c8" : "#b06aff";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.ellipse(px, py, 14 + prog * 10, (14 + prog * 10) * 0.8, 0, 0, TAU);
            ctx.stroke();
            break;
          }
          const rx = Math.max(1, r), ry = rx * (ARENA_RY / ARENA_RX);
          for (const [col, w, al] of [["#b06aff", 6, 0.35], ["#ffd23f", 2, 0.9], ["#fff6c8", 1, 1]] as const) {
            ctx.globalAlpha = al;
            ctx.strokeStyle = col;
            ctx.lineWidth = w;
            ctx.beginPath();
            ctx.ellipse(px, py, rx, ry, 0, 0, TAU);
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
          break;
        }
        case "ray": {
          const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
          const w = r * (1 - prog * 0.7);
          for (const [col, lw, al] of [["#ff3b4e", w + 6, 0.35], ["#ff8a2b", w, 0.9], ["#fff6c8", Math.max(2, w / 3), 1]] as const) {
            ctx.globalAlpha = al * (1 - prog * 0.6);
            ctx.strokeStyle = col;
            ctx.lineWidth = lw + Math.sin(now * 50) * 1.5;
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(X(x2), Y(y2));
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
          if (Math.random() < 0.8) {
            const k = Math.random();
            this.burst(x + Math.cos(a) * len * k, y + 6 + Math.sin(a) * len * k, 1, "#ffd23f", 40);
          }
          break;
        }
      }
    }
  }

  // ------------------------------------------------------------ efectos
  drawFx(dt: number, X: (n: number) => number, Y: (n: number) => number) {
    const ctx = this.ctx;
    for (const f of this.fx) {
      f.t += dt;
      const k = f.t / f.max;
      const px = X(f.x), py = Y(f.y) - 6;
      switch (f.kind) {
        case "slash":
        case "claw": {
          const claw = f.kind === "claw";
          const sweep = claw ? 1.4 : 1.9;
          const start = f.a - sweep / 2, end = start + sweep * Math.min(1, k * 2.5);
          ctx.globalAlpha = 1 - k;
          ctx.lineCap = "butt";
          for (let j = 0; j < (claw ? 3 : 1); j++) {
            const rr = f.b - 3 - j * 3;
            ctx.strokeStyle = claw ? "#d0569a" : "#c08a10";
            ctx.lineWidth = claw ? 2 : 5;
            ctx.beginPath();
            ctx.arc(px, py, Math.max(2, rr), start, end);
            ctx.stroke();
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(px, py, Math.max(2, rr + 1), start, end);
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
          break;
        }
        case "quake":
        case "fist": {
          const half = f.kind === "quake" ? 0.62 : 0.7;
          ctx.globalAlpha = 0.6 * (1 - k);
          ctx.fillStyle = f.kind === "quake" ? "#c08a10" : "#ff8a2b";
          ctx.beginPath();
          ctx.moveTo(px, py + 6);
          ctx.arc(px, py + 6, f.b * (0.4 + k * 0.6), f.a - half, f.a + half);
          ctx.closePath();
          ctx.fill();
          ctx.globalAlpha = 1;
          break;
        }
        case "ring": {
          ctx.strokeStyle = RING_COLORS[f.b] ?? "#fff";
          ctx.globalAlpha = 1 - k;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.ellipse(px, py + 6, f.a * (0.3 + 0.7 * k), f.a * (0.3 + 0.7 * k) * 0.8, 0, 0, TAU);
          ctx.stroke();
          ctx.globalAlpha = 1;
          break;
        }
        case "boom": {
          const r = f.a * (0.35 + 0.65 * Math.min(1, k * 2.2));
          if (k < 0.55) {
            this.disc(px, py + 6, r, "#ff8a2b", 0.9);
            this.disc(px, py + 6, r * 0.7, "#ffd23f", 1);
            if (k < 0.25) this.disc(px, py + 6, r * 0.4, "#fff6c8", 1);
          } else this.disc(px, py + 6, r, "#5a5a6a", 0.5 * (1 - k));
          break;
        }
        case "muzzle":
          ctx.fillStyle = "#fff6c8";
          ctx.fillRect(X(f.x) - 2, Y(f.y) - 2, 4, 4);
          ctx.fillStyle = "#ffd23f";
          ctx.fillRect(X(f.x + Math.cos(f.a) * 4) - 1, Y(f.y + Math.sin(f.a) * 4) - 1, 3, 3);
          break;
        case "block":
          ctx.strokeStyle = "#fff6c8";
          ctx.globalAlpha = 1 - k;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(X(f.x), Y(f.y) - 6, 4 + k * 6, f.a - 1, f.a + 1);
          ctx.stroke();
          ctx.globalAlpha = 1;
          break;
        case "counter":
        case "sap":
        case "orbbreak":
        case "ko": {
          const col = f.kind === "counter" ? "#ff9ed2" : f.kind === "sap" ? "#7fe3ff" : f.kind === "ko" ? "#ff8a2b" : "#ffd23f";
          ctx.strokeStyle = col;
          ctx.globalAlpha = 1 - k;
          ctx.lineWidth = 2;
          ctx.beginPath();
          const rr = (f.kind === "ko" || f.kind === "orbbreak" ? 40 : 16) * k + 4;
          ctx.ellipse(px, py, rr, rr * 0.8, 0, 0, TAU);
          ctx.stroke();
          ctx.globalAlpha = 1;
          break;
        }
        case "teleport": {
          ctx.globalAlpha = 1 - k;
          ctx.fillStyle = f.a === 2 ? "#ff9ed2" : "#b06aff";
          const w = Math.round(8 * (1 - k));
          ctx.fillRect(px - w, py - 24, w * 2, 30);
          ctx.fillStyle = "#f0e0ff";
          ctx.fillRect(px - (w >> 1), py - 24, w, 30);
          ctx.globalAlpha = 1;
          break;
        }
        case "slash2": {
          const col = f.b === 2 ? "#b06aff" : "#7fe3ff";
          const sweep = 1.8, dir = f.b === 1 ? -1 : 1;
          const start = f.a - (sweep / 2) * dir, end = start + sweep * Math.min(1, k * 2.5) * dir;
          ctx.globalAlpha = 1 - k;
          for (const [c2, w, rr] of [[col, 4, 20], ["#ffffff", 1, 21]] as const) {
            ctx.strokeStyle = c2;
            ctx.lineWidth = w;
            ctx.beginPath();
            ctx.arc(px, py, rr, Math.min(start, end), Math.max(start, end));
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
          break;
        }
        case "afterimage": {
          ctx.globalAlpha = 0.5 * (1 - k);
          ctx.fillStyle = f.b === 1 ? "#3fd7ff" : f.b === 2 ? "#2e3150" : "#8a7bff";
          ctx.fillRect(px - 4, py - 8, 8, 14);
          ctx.globalAlpha = 1;
          break;
        }
        case "deflect":
          ctx.strokeStyle = "#e6fbff";
          ctx.globalAlpha = 1 - k;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(X(f.x), Y(f.y) - 4, 3 + k * 8, f.a - 1, f.a + 1);
          ctx.stroke();
          ctx.globalAlpha = 1;
          break;
        case "hypno": {
          for (let j = 0; j < 3; j++) {
            const kk = (k + j * 0.25) % 1;
            ctx.strokeStyle = j % 2 ? "#e6d0ff" : "#b06aff";
            ctx.globalAlpha = (1 - kk) * (1 - k * 0.5);
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(px, py, f.b * kk + 4, f.a - 0.6, f.a + 0.6);
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
          break;
        }
        case "drain": {
          // hilo de sangre ondulante del enemigo al vampiro
          const x0 = X(f.x), y0 = Y(f.y) - 8, x1 = X(f.a), y1 = Y(f.b) - 8;
          ctx.globalAlpha = 1 - k * 0.6;
          for (const [col, w] of [["#8a1a3a", 3], ["#ff3b4e", 1]] as const) {
            ctx.strokeStyle = col;
            ctx.lineWidth = w;
            ctx.beginPath();
            for (let j = 0; j <= 10; j++) {
              const t = j / 10, wob = Math.sin(t * 9 + f.t * 30) * 2 * (1 - Math.abs(t - 0.5) * 2);
              const xx = x0 + (x1 - x0) * t, yy = y0 + (y1 - y0) * t + wob;
              if (j) ctx.lineTo(xx, yy);
              else ctx.moveTo(xx, yy);
            }
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
          if (Math.random() < 0.5) {
            const t = Math.random();
            this.parts.push({ x: f.x + (f.a - f.x) * t, y: f.y + (f.b - f.y) * t, z: 8, vx: (f.a - f.x) * 1.5, vy: (f.b - f.y) * 1.5, vz: 0, life: 0.2, max: 0.2, c: "#ff3b4e", s: 1, g: 0 });
          }
          break;
        }
        case "bolt": {
          const x0 = X(f.x), y0 = Y(f.y), x1 = X(f.a), y1 = Y(f.b);
          ctx.globalAlpha = 1 - k;
          for (const [col, w] of [["#3fd7ff", 3], ["#ffffff", 1]] as const) {
            ctx.strokeStyle = col;
            ctx.lineWidth = w;
            ctx.beginPath();
            ctx.moveTo(x0, y0);
            for (let j = 1; j < 6; j++) {
              const t = j / 6;
              ctx.lineTo(x0 + (x1 - x0) * t + Math.round((Math.random() - 0.5) * 8), y0 + (y1 - y0) * t + Math.round((Math.random() - 0.5) * 8));
            }
            ctx.lineTo(x1, y1);
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
          break;
        }
        case "log": {
          const spr = projSprite("log");
          ctx.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
          this.shadow(X(f.x), Y(f.y), 5);
          ctx.drawImage(spr, X(f.x) - (spr.width >> 1), Y(f.y) - spr.height);
          ctx.globalAlpha = 1;
          break;
        }
        case "snap":
          ctx.fillStyle = "#dfe4ee";
          ctx.globalAlpha = 1 - k;
          ctx.fillRect(px - 6 + Math.round(k * 4), py, 3, 6);
          ctx.fillRect(px + 4 - Math.round(k * 4), py, 3, 6);
          ctx.globalAlpha = 1;
          break;
      }
    }
    this.fx = this.fx.filter((f) => f.t < f.max);
  }

  drawSmoke(x: number, y: number, r: number, prog: number, X: (n: number) => number, Y: (n: number) => number, now: number, alpha: number) {
    const fade = Math.min(1, (1 - prog) * 5, prog * 30);
    for (let k = 0; k < 9; k++) {
      const an = (k / 9) * TAU + now * 0.25 + k;
      const rr = r * (0.35 + (k % 3) * 0.2);
      this.disc(X(x + Math.cos(an) * rr), Y(y + Math.sin(an) * rr * 0.8) - 6, r * 0.45, k % 2 ? "#7d8499" : "#c9cfdc", alpha * fade);
    }
  }

  // ------------------------------------------------------------ utilidades
  shadow(x: number, y: number, r: number) {
    const ctx = this.ctx;
    ctx.fillStyle = "rgba(10,10,20,0.35)";
    const w = Math.max(2, Math.round(r));
    ctx.fillRect(x - w, y - 1, w * 2, 2);
    ctx.fillRect(x - w + 1, y - 2, w * 2 - 2, 4);
  }

  disc(cx: number, cy: number, r: number, col: string, a: number) {
    const ctx = this.ctx;
    ctx.globalAlpha = a;
    ctx.fillStyle = col;
    const R = Math.round(r);
    for (let dy = -R; dy <= R; dy++) {
      const w = Math.round(Math.sqrt(R * R - dy * dy));
      ctx.fillRect(cx - w, cy + Math.round(dy * 0.8), w * 2, 1);
    }
    ctx.globalAlpha = 1;
  }

  number(x: number, y: number, v: number, col: string, sc: number) {
    const ctx = this.ctx;
    const str = String(Math.round(v));
    const w = str.length * 4 * sc - sc;
    const draw = (color: string, pad: number) => {
      let ox = x - (w >> 1);
      ctx.fillStyle = color;
      for (const ch of str) {
        const g = DIGITS[+ch];
        if (g) for (let i = 0; i < 15; i++) if (g[i] === "1") ctx.fillRect(ox + (i % 3) * sc - pad, y + Math.floor(i / 3) * sc - pad, sc + pad * 2, sc + pad * 2);
        ox += 4 * sc;
      }
    };
    draw("#17121f", 1);
    draw(col, 0);
  }

  label(x: number, y: number, text: string, col: string) {
    const ctx = this.ctx;
    ctx.font = "8px 'Pixelify Sans', monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#17121f";
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) ctx.fillText(text, x + dx!, y + dy!);
    ctx.fillStyle = col;
    ctx.fillText(text, x, y);
  }
}


