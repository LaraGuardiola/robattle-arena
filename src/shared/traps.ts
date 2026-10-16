// Trampas de las palancas: cada arena tiene la suya. Dañan a todos por igual
// (no distinguen equipos): la gracia es activarlas cuando el rival está en mala
// posición. Todas avisan en el suelo antes de hacer nada.

import { ARENA_RX, ARENA_RY, FIGHTER_R, clampArena, type TrapKind } from "./data";
import { dist2 } from "./math";
import type { Fighter, World, Zone } from "./world";

const STEP = 1 / 60;
/** Mitad de la arena del equipo rival de `team` (signo de x). */
const rivalSide = (team: number) => (team === 0 ? 1 : -1);
const alive = (w: World) => w.fighters.filter((f) => !f.dead);

export const TRAPS: Record<TrapKind, (w: World, by: Fighter) => void> = {
  // ---------------------------------------------------------------- Parque
  geyser(w, by) {
    const side = rivalSide(by.team);
    const spots: [number, number][] = [];
    for (const e of alive(w)) if (e.team !== by.team && e.x * side > -30) spots.push(clampArena(e.x + e.vx * 0.5, e.y + e.vy * 0.5, 20));
    for (let tries = 0; spots.length < 5 && tries < 40; tries++) {
      const p = clampArena(side * w.rng.range(30, 250), w.rng.range(-130, 130), 20);
      if (spots.every(([x, y]) => dist2(x, y, p[0], p[1]) > 45 * 45)) spots.push(p);
    }
    for (const [x, y] of spots.slice(0, 5))
      w.zone(by, {
        kind: "geyser", x, y, r: 18, delay: 1, dur: 0.5, team: -1,
        onArm: (w, z) => {
          w.fx("geyser", z.x, z.y, z.r, 0);
          w.sfx("geyser");
          for (const e of alive(w))
            if (dist2(e.x, e.y, z.x, z.y) < (z.r + FIGHTER_R) ** 2) {
              w.damage(null, e, 8, { from: [z.x, z.y] });
              w.launchUp(e, 0.8, 30);
            }
        },
      });
  },

  // ---------------------------------------------------------------- Fábrica
  press(w, by) {
    w.zone(by, {
      kind: "press", x: 0, y: 0, r: 25, len: ARENA_RY * 2, delay: 1.2, dur: 0.45, team: -1,
      onArm: (w, z) => {
        w.fx("shake", 0, 0, 8, 0);
        w.sfx("slam");
        w.sfx("boom");
        for (let y = -140; y <= 140; y += 35) w.fx("boom", 0, y, 14, 1);
        for (const e of alive(w))
          if (Math.abs(e.x) < z.r + FIGHTER_R) {
            if (w.damage(null, e, 35, { from: [e.x, e.y - 40] })) w.stun(e, 1);
          }
        for (const p of w.props) if (Math.abs(p.x) < z.r + p.r) w.hurtProp(p, 35);
      },
    });
  },

  // ---------------------------------------------------------------- Neón
  laser(w, by) {
    const dir = by.team === 0 ? 1 : -1;
    for (const y of [-80, 0, 80])
      w.zone(by, {
        kind: "laser", x: 0, y, r: 8, a: dir > 0 ? 0 : Math.PI, len: ARENA_RX * 2, delay: 1, dur: 1.5, tickEvery: 0, team: -1,
        onArm: (w) => w.sfx("lasergrid"),
        onTick: (w, z) => {
          const front = -dir * ARENA_RX + dir * ARENA_RX * 2 * (z.t / z.dur);
          for (const e of alive(w)) {
            if (z.hit.has(e.id) || Math.abs(e.y - z.y) > z.r + FIGHTER_R - 2 || Math.abs(e.x - front) > 22) continue;
            z.hit.add(e.id);
            if (w.damage(null, e, 20, { from: [front - dir * 10, z.y] })) w.slowFor(e, 0.4, 1.5);
          }
        },
      });
  },

  // ---------------------------------------------------------------- Desguace
  magnet(w, by) {
    const side = rivalSide(by.team);
    w.zone(by, {
      kind: "magnet", x: side * 130, y: w.rng.range(-50, 50), r: 95, delay: 1, dur: 3, tickEvery: 0, team: -1,
      onArm: (w) => w.sfx("singularity"),
      onTick: (w, z) => {
        // persigue despacio al enemigo más cercano de quien la activó
        let tgt: Fighter | null = null, bd = Infinity;
        for (const e of alive(w))
          if (e.team !== by.team) {
            const d = dist2(e.x, e.y, z.x, z.y);
            if (d < bd) [bd, tgt] = [d, e];
          }
        if (tgt) {
          const dx = tgt.x - z.x, dy = tgt.y - z.y, d = Math.hypot(dx, dy);
          if (d > 2) [z.x, z.y] = clampArena(z.x + (dx / d) * 34 * STEP, z.y + (dy / d) * 34 * STEP, 20);
        }
        for (const e of alive(w)) {
          if (e.motion) continue;
          const dx = z.x - e.x, dy = z.y - e.y, d = Math.hypot(dx, dy);
          if (d < 3 || d > z.r) continue;
          const pull = Math.min(d, 30 * (1 - (d / z.r) * 0.5) * STEP);
          w.moveTo(e, e.x + (dx / d) * pull, e.y + (dy / d) * pull, true);
        }
        // también tuerce los proyectiles (de todos)
        for (const p of w.projs) {
          const dx = z.x - p.x, dy = z.y - p.y, d = Math.hypot(dx, dy);
          if (d < 4 || d > 70) continue;
          const sp = Math.hypot(p.vx, p.vy);
          p.vx += (dx / d) * 500 * STEP;
          p.vy += (dy / d) * 500 * STEP;
          const k = sp / (Math.hypot(p.vx, p.vy) || 1);
          p.vx *= k;
          p.vy *= k;
        }
      },
      onEnd: (w, z) => {
        w.fx("boom", z.x, z.y, 25, 1);
        w.fx("scrap", z.x, z.y, 0, 0);
        w.fx("shake", z.x, z.y, 6, 0);
        w.sfx("slam");
        for (const e of alive(w)) if (dist2(e.x, e.y, z.x, z.y) < (25 + FIGHTER_R) ** 2) w.damage(null, e, 25, { from: [z.x, z.y] });
        w.blastProps(z.x, z.y, 25, 25, null);
      },
    });
  },

  // ---------------------------------------------------------------- Núcleo
  pulse(w, by) {
    w.zone(by, {
      kind: "pulse", x: 0, y: 0, r: 0, delay: 1, dur: 1.6, tickEvery: 0, team: -1,
      onArm: (w) => {
        w.sfx("boom");
        w.fx("ring", 0, 0, 30, 1);
      },
      onTick: (w, z) => {
        const k = (z.t / z.dur) * 1.05;
        z.r = k * ARENA_RX;
        for (const e of alive(w)) {
          if (z.hit.has(e.id)) continue;
          if (Math.abs(Math.hypot(e.x / ARENA_RX, e.y / ARENA_RY) - k) > 0.04) continue;
          z.hit.add(e.id);
          // detrás de una columna, a salvo
          if (w.clearLine(0, 0, e.x, e.y, 0)) w.damage(null, e, 18, { from: [0, 0] });
          else w.popup(e.x, e.y - 22, "¡A CUBIERTO!", "#7fe3ff");
        }
      },
    });
  },
};

// ================================================================ IA
/** ¿Le conviene a `f` activar la trampa ahora? */
export function trapGood(w: World, f: Fighter): boolean {
  const enemies = alive(w).filter((e) => e.team !== f.team);
  const mates = alive(w).filter((a) => a.team === f.team);
  switch (w.arenaDef.trap) {
    case "geyser":
      return enemies.some((e) => e.x * rivalSide(f.team) > 0);
    case "press":
      return enemies.some((e) => Math.abs(e.x) < 40) && mates.every((a) => Math.abs(a.x) > 55);
    case "laser": {
      const band = (y: number, m: number) => [-80, 0, 80].some((b) => Math.abs(y - b) < m);
      return enemies.some((e) => band(e.y, 12)) && mates.every((a) => !band(a.y, 22));
    }
    case "magnet":
      return enemies.some((e) => e.x * rivalSide(f.team) > 0 && mates.every((a) => dist2(a.x, a.y, e.x, e.y) > 110 * 110));
    case "pulse":
      return mates.every((a) => !w.clearLine(0, 0, a.x, a.y, 0)) || enemies.some((e) => e.hp < 22);
  }
}

const AVOID = new Set<Zone["kind"]>(["rain", "napalm", "nuke", "radiation", "flametrail", "heatbomb"]);

/** Dirección para salir de una trampa avisada (o null si no hay peligro). */
export function trapDodge(w: World, f: Fighter): [number, number] | null {
  const away = (x: number, y: number): [number, number] => {
    const dx = f.x - x, dy = f.y - y, d = Math.hypot(dx, dy) || 1;
    return d < 1 ? [-f.x / (Math.hypot(f.x, f.y) || 1), -f.y / (Math.hypot(f.x, f.y) || 1)] : [dx / d, dy / d];
  };
  for (const z of w.zones as Zone[]) {
    // zonas enemigas que hacen daño mientras estás dentro (o van a estallar): salir de debajo
    if (AVOID.has(z.kind) && z.team !== f.team && dist2(f.x, f.y, z.x, z.y) < (z.r + 8) ** 2) return away(z.x, z.y);
    if (z.team !== -1) continue;
    switch (z.kind) {
      case "geyser":
      case "rise":
        if (!z.armed && dist2(f.x, f.y, z.x, z.y) < (z.r + 10) ** 2) return away(z.x, z.y);
        break;
      case "press":
        if (!z.armed && Math.abs(f.x) < z.r + 12) return [f.x >= 0 ? 1 : -1, 0];
        break;
      case "laser":
        if (Math.abs(f.y - z.y) < z.r + 10) return [0, f.y > z.y || (f.y === z.y && f.y < 0) ? 1 : -1];
        break;
      case "magnet":
        if (z.armed && dist2(f.x, f.y, z.x, z.y) < (z.t > z.dur - 1.2 ? 40 : z.r) ** 2) return away(z.x, z.y);
        break;
      case "pulse": {
        // a cubierto detrás de la columna más cercana
        let best: [number, number] | null = null, bd = Infinity;
        for (const p of w.pillars) {
          const l = Math.hypot(p.x, p.y) || 1;
          const sx = p.x + (p.x / l) * (p.r + FIGHTER_R + 3), sy = p.y + (p.y / l) * (p.r + FIGHTER_R + 3);
          const d = dist2(sx, sy, f.x, f.y);
          if (d < bd) [bd, best] = [d, [sx, sy]];
        }
        if (best && bd > 9 && bd < 140 * 140) {
          const dx = best[0] - f.x, dy = best[1] - f.y, d = Math.hypot(dx, dy) || 1;
          return [dx / d, dy / d];
        }
        break;
      }
    }
  }
  return null;
}
