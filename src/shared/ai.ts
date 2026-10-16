// IA de los bots: se mueven a su distancia favorita, esquivan proyectiles,
// apuntan con anticipación y usan cada skill según su pista (SkillDef.ai).

import { ARENA_RX, ARENA_RY, CAPSULE_HEAL, SLOT_BIT, type Difficulty, type Slot } from "./data";
import { dist2 } from "./math";
import type { Fighter, World } from "./world";

export interface Bot {
  diff: Difficulty;
  think: number;
  strafe: number;
  strafeT: number;
  target: Fighter | null;
  aimErr: number;
  reactT: number;
  wantB: number;
  holdT: number;
  ax?: number;
  ay?: number;
  dodge?: [number, number];
}

const REACT = [0.32, 0.2, 0.1];
const AIM_ERR = [0.3, 0.14, 0.05];
const DODGE = [0.1, 0.35, 0.6];
const SKILL_USE = [0.35, 0.7, 1];
/** velocidad media de proyectil para anticipar */
const LEAD_SPEED: Record<string, number> = { revolver: 430, snipe: 950, fireball: 270, seed: 340, hook: 420, disable: 400, pollen: 230, shells: 330 };

export function botThink(w: World, f: Fighter, dt: number) {
  const b = f.bot!;
  const R = w.rng;
  b.think -= dt;
  b.strafeT -= dt;
  if (b.strafeT <= 0) {
    b.strafe = R.next() < 0.5 ? -1 : 1;
    b.strafeT = R.range(0.8, 2.4);
  }

  // ---- objetivo
  const enemies = w.fighters.filter((e) => e.team !== f.team && !e.dead && (e.stealth <= 0 || dist2(e.x, e.y, f.x, f.y) < 30 * 30));
  const allies = w.fighters.filter((a) => a.team === f.team && !a.dead);
  if (!enemies.length) {
    f.input = { mx: -f.x / 200, my: -f.y / 200, ax: f.input.ax, ay: f.input.ay, b: 0 };
    return;
  }
  if (!b.target || b.target.dead || !enemies.includes(b.target) || b.think <= 0) {
    let best = enemies[0]!, bs = Infinity;
    for (const e of enemies) {
      const s = Math.hypot(e.x - f.x, e.y - f.y) - (1 - e.hp / e.maxHp) * 90;
      if (s < bs) {
        bs = s;
        best = e;
      }
    }
    b.target = best;
  }
  const t = b.target;
  const dx = t.x - f.x, dy = t.y - f.y, dist = Math.hypot(dx, dy) || 1;

  // ---- decisión (cada cierto tiempo de reacción)
  if (b.think <= 0) {
    b.think = REACT[b.diff]! * R.range(0.8, 1.3);
    b.aimErr = R.range(-1, 1) * AIM_ERR[b.diff]!;
    decide(w, f, t, dist, allies, enemies);
    // esquiva
    b.dodge = undefined;
    if (R.next() < DODGE[b.diff]!)
      for (const p of w.projs) {
        if (p.team === f.team) continue;
        const rx = f.x - p.x, ry = f.y - p.y, sp = Math.hypot(p.vx, p.vy) || 1;
        const along = (rx * p.vx + ry * p.vy) / sp;
        if (along < 0 || along > 150) continue;
        const across = (rx * p.vy - ry * p.vx) / sp;
        if (Math.abs(across) > 16) continue;
        const s = across >= 0 ? 1 : -1;
        b.dodge = [(p.vy / sp) * s, (-p.vx / sp) * s];
        break;
      }
  }

  // ---- movimiento
  const prefer = f.def.prefer;
  const ux = dx / dist, uy = dy / dist;
  let mx = 0, my = 0;
  const melee = prefer < 40;
  if (melee) {
    mx += ux;
    my += uy;
    if (dist < 14) {
      mx = -uy * b.strafe;
      my = ux * b.strafe;
    }
  } else {
    // contra cuerpo a cuerpo: alejarse manda; si no, mantener la distancia y moverse de lado
    const chased = t.def.prefer < 40 && dist < 110;
    const k = (dist - prefer) / (chased ? 30 : 60);
    mx += ux * Math.max(-1, Math.min(1, k));
    my += uy * Math.max(-1, Math.min(1, k));
    const side = chased ? 0.45 : 0.8;
    mx += -uy * b.strafe * side;
    my += ux * b.strafe * side;
    // si no hay línea de tiro, rodea el pilar
    if (!w.clearLine(f.x, f.y, t.x, t.y)) {
      mx += -uy * b.strafe * 1.2;
      my += ux * b.strafe * 1.2;
    }
  }
  // reparación cercana si va mal de vida
  const cap = w.caps.find((c) => c.on);
  if (cap && f.hp < f.maxHp - CAPSULE_HEAL * 0.8 && dist2(cap.x, cap.y, f.x, f.y) < dist * dist * 1.4) {
    const cx = cap.x - f.x, cy = cap.y - f.y, cl = Math.hypot(cx, cy) || 1;
    mx = cx / cl * 1.5;
    my = cy / cl * 1.5;
  }
  if (b.dodge) {
    mx = mx * 0.3 + b.dodge[0] * 1.6;
    my = my * 0.3 + b.dodge[1] * 1.6;
  }
  // bordes de la arena y muerte súbita
  const edge = Math.hypot(f.x / (ARENA_RX * w.storm), f.y / (ARENA_RY * w.storm));
  if (edge > 0.82) {
    const k = (edge - 0.82) * 6;
    mx -= (f.x / ARENA_RX) * k;
    my -= (f.y / ARENA_RY) * k;
  }
  const ml = Math.hypot(mx, my);
  if (ml > 1) {
    mx /= ml;
    my /= ml;
  }

  // ---- mira (anticipación + error)
  let ax = b.ax ?? t.x, ay = b.ay ?? t.y;
  if (b.ax === undefined) {
    const sp = LEAD_SPEED[f.def.skills.r2.id] ?? 0;
    const lead = sp ? dist / sp : 0;
    ax = t.x + t.vx * lead;
    ay = t.y + t.vy * lead;
  }
  const ang = Math.atan2(ay - f.y, ax - f.x) + b.aimErr;
  const ad = Math.hypot(ax - f.x, ay - f.y);
  f.input = { mx, my, ax: Math.cos(ang) * ad, ay: Math.sin(ang) * ad, b: b.wantB };
}

/** Elige qué botón mantener y hacia dónde apuntar hasta la próxima decisión. */
function decide(w: World, f: Fighter, t: Fighter, dist: number, allies: Fighter[], enemies: Fighter[]) {
  const b = f.bot!;
  const R = w.rng;
  b.wantB = 0;
  b.ax = b.ay = undefined;
  const clear = w.clearLine(f.x, f.y, t.x, t.y);
  const hpk = f.hp / f.maxHp;
  const closest = enemies.reduce((m, e) => Math.min(m, Math.hypot(e.x - f.x, e.y - f.y)), Infinity);
  const lowAlly = allies.reduce((m, a) => (a.hp / a.maxHp < m.hp / m.maxHp ? a : m), f);
  const lowK = lowAlly.hp / lowAlly.maxHp;
  const threat = w.projs.some((p) => p.team !== f.team && dist2(p.x, p.y, f.x, f.y) < 70 * 70 && (f.x - p.x) * p.vx + (f.y - p.y) * p.vy > 0)
    || enemies.some((e) => e.cast && dist2(e.x, e.y, f.x, f.y) < 60 * 60);
  const predict = (time: number) => [t.x + t.vx * time, t.y + t.vy * time] as const;

  // soporte: la semilla también cura, así que se dispara al aliado herido
  if (f.def.skills.r2.id === "seed" && lowAlly !== f && lowK < 0.75 && w.canUse(f, "r2")
    && dist2(lowAlly.x, lowAlly.y, f.x, f.y) < f.def.skills.r2.range ** 2 * 0.8 && w.clearLine(f.x, f.y, lowAlly.x, lowAlly.y) && R.next() < 0.6) {
    b.wantB = SLOT_BIT.r2;
    b.ax = lowAlly.x + lowAlly.vx * 0.3;
    b.ay = lowAlly.y + lowAlly.vy * 0.3;
    if (lowK < 0.6 && w.canUse(f, "l2")) b.wantB = SLOT_BIT.l2;
    return;
  }
  const order: Slot[] = ["b", "a", "x", "y", "l2", "r2"];
  for (const slot of order) {
    if (!w.canUse(f, slot)) continue;
    const s = f.def.skills[slot];
    if (slot !== "r2" && R.next() > SKILL_USE[b.diff]!) continue;
    let ok = false;
    let aim: readonly [number, number] | null = null;
    switch (s.ai) {
      case "poke":
        // no despiertes a quien está dormido si no hay un aliado que lo aproveche
        ok = dist <= s.range * 0.95 && clear && !(t.sleep > 0.3 && allies.length < 2 && hpk < 0.95);
        break;
      case "melee":
        ok = dist <= s.range + 7;
        break;
      case "gap":
        if (s.id === "stealth") ok = dist > 50 && dist < 170;
        else ok = dist > f.def.prefer + 35 && dist <= s.range + 15 && clear;
        break;
      case "escape":
        if (s.id === "fist") ok = closest < 40;
        else if ((hpk < 0.5 && closest < 75) || (closest < 40 && t.def.prefer < 40)) {
          ok = true;
          // lejos del enemigo, hacia el centro
          const ex = f.x - t.x, ey = f.y - t.y, el = Math.hypot(ex, ey) || 1;
          aim = [f.x + (ex / el) * s.range - f.x * 0.3, f.y + (ey / el) * s.range - f.y * 0.3];
        }
        break;
      case "defend":
        if (s.id === "sap") {
          ok = lowK < 0.7 && closest < 160;
          aim = [lowAlly.x, lowAlly.y];
        } else if (s.id === "firewall") {
          ok = dist < 150 && dist > 50 && hpk < 0.8 && t.def.prefer > 60;
          aim = [(f.x + t.x) / 2, (f.y + t.y) / 2];
        } else ok = threat;
        break;
      case "heal":
        ok = lowK < 0.72;
        aim = [lowAlly.x + lowAlly.vx * 0.5, lowAlly.y + lowAlly.vy * 0.5];
        break;
      case "cc":
        ok = dist <= s.range * 0.9 && (s.aim === "self" || clear);
        if (s.aim !== "self") aim = predict(dist / 300);
        break;
      case "zone":
        ok = dist <= s.range;
        aim = s.id === "trap" ? predict(0.6) : predict(0.65);
        break;
      case "ult":
        if (s.id === "garden") {
          ok = lowK < 0.55 && closest < 140;
          aim = [lowAlly.x, lowAlly.y];
        } else if (s.aim === "ground") {
          ok = dist <= s.range && (t.hp / t.maxHp < 0.7 || R.next() < 0.3);
          aim = predict(0.7);
        } else {
          ok = dist <= s.range * 0.9 && (t.hp / t.maxHp < 0.7 || R.next() < 0.3) && (s.id === "ray" || clear);
          aim = predict(s.cast + dist / 500);
        }
        break;
    }
    if (!ok) continue;
    b.wantB = SLOT_BIT[slot];
    if (aim) {
      b.ax = aim[0];
      b.ay = aim[1];
    }
    // el ataque básico se sigue manteniendo junto a lo demás
    if (slot !== "r2" && f.def.skills.r2.ai === "melee" && dist <= f.def.skills.r2.range + 7) b.wantB |= SLOT_BIT.r2;
    return;
  }
  // nada: si hay orbe libre y nadie cerca, a por él
  if (w.orb && closest > 110 && dist2(w.orb.x, w.orb.y, f.x, f.y) < f.def.skills.r2.range ** 2) {
    b.wantB = SLOT_BIT.r2;
    b.ax = w.orb.x;
    b.ay = w.orb.y;
  }
}
