// Comportamiento de cada skill. Los números de alcance, recarga y lanzamiento
// están en data.ts; aquí, el daño y lo que hace cada una.

import { FIGHTER_R, type SkillDef } from "./data";
import { dist2, segDist2 } from "./math";
import type { Aim, Fighter, Proj, World } from "./world";

type SkillFn = (w: World, f: Fighter, aim: Aim, s: SkillDef) => void;

/** Proyectil de daño simple. */
const shot = (dmg: number, extra?: (w: World, t: Fighter, p: Proj) => void) => (w: World, t: Fighter, p: Proj) => {
  if (w.damage(p.owner, t, dmg, { from: [p.x, p.y] })) extra?.(w, t, p);
};

/** Explosión en área contra enemigos (y el orbe). */
function blast(w: World, f: Fighter, x: number, y: number, r: number, dmg: number | ((e: Fighter) => number), extra?: (e: Fighter) => void) {
  for (const e of w.enemiesIn(f.team, x, y, r)) if (w.damage(f, e, typeof dmg === "number" ? dmg : dmg(e), { from: [x, y] })) extra?.(e);
  if (w.orb && dist2(w.orb.x, w.orb.y, x, y) < (r + 9) ** 2) w.hitOrb(f, typeof dmg === "number" ? dmg : 15);
}

const angle = (a: Aim) => Math.atan2(a.dy, a.dx);

export const SKILLS: Record<string, SkillFn> = {
  // ================================================================ Beetlix
  horn(w, f, a, s) {
    const third = f.combo % 3 === 2;
    const dmg = 12 + (third ? 8 : 0) + f.bonus;
    w.fx("slash", f.x, f.y, angle(a), s.range + (third ? 6 : 0));
    w.sfx("swing");
    const hits = w.melee(f, s.range, 1.75, dmg);
    if (hits.length) {
      f.combo++;
      f.comboT = 1.4;
      f.bonus = 0;
    } else f.combo = 0;
  },
  quake(w, f, a, s) {
    w.fx("quake", f.x, f.y, angle(a), s.range);
    w.sfx("quake");
    w.melee(f, s.range, 1.25, 20, (e) => w.slowFor(e, 0.4, 1.5));
  },
  charge(w, f, a, s) {
    w.sfx("dash");
    w.dash(f, a.dx, a.dy, s.range, 0.32, {
      touch: (e) => {
        if (w.damage(f, e, 10, { melee: true })) w.knock(e, a.dx, a.dy, 42);
        w.fx("boom", e.x, e.y - 4, 10, 0);
        return true;
      },
    });
  },
  shield(w, f) {
    f.block = 1.2;
    w.sfx("shield");
  },
  warcry(w, f, _a, s) {
    w.fx("ring", f.x, f.y, s.range, 1);
    w.sfx("warcry");
    blast(w, f, f.x, f.y, s.range, 8, (e) => w.slowFor(e, 0.5, 1.5));
    w.addShield(f, 18, 3);
  },
  meteor(w, f, a, s) {
    const dx = a.tx - f.x, dy = a.ty - f.y, d = Math.hypot(dx, dy);
    const dur = 0.7;
    w.zone(f, { kind: "meteor", x: a.tx, y: a.ty, r: s.size, delay: dur, dur: 0.05 });
    w.sfx("leap");
    w.dash(f, d > 1 ? dx : Math.cos(f.face), d > 1 ? dy : Math.sin(f.face), Math.max(d, 0.1), dur, {
      air: true,
      h: 46,
      end: () => {
        w.fx("boom", f.x, f.y, s.size, 1);
        w.fx("shake", f.x, f.y, 7, 0);
        w.sfx("slam");
        blast(w, f, f.x, f.y, s.size, 28, (e) => w.stun(e, 1.2));
      },
    });
  },

  // ================================================================ Coltron
  revolver(w, f, a, s) {
    w.fx("muzzle", f.x + a.dx * 9, f.y + a.dy * 9 - 6, angle(a), 0);
    w.sfx("shoot");
    w.proj(f, { kind: "bullet", dx: a.dx, dy: a.dy, speed: 430, range: s.range, dmg: 11, onHit: shot(11) });
  },
  snipe(w, f, a, s) {
    w.fx("muzzle", f.x + a.dx * 9, f.y + a.dy * 9 - 6, angle(a), 1);
    w.sfx("snipe");
    w.proj(f, {
      kind: "snipe", dx: a.dx, dy: a.dy, speed: 950, range: s.range, r: 3, dmg: 26,
      onHit: (w, t, p) => {
        const far = s.range - p.dist > 200;
        if (w.damage(p.owner, t, far ? 34 : 26, { from: [p.x, p.y] }) && far) w.popup(t.x, t.y - 28, "¡LEJOS!", "#ffd23f");
      },
    });
  },
  vault(w, f, a, s) {
    w.fx("boom", f.x, f.y, 10, 0);
    w.sfx("leap");
    w.dash(f, a.dx, a.dy, s.range, 0.42, { air: true, h: 24 });
  },
  trap(w, f, a) {
    const mine = w.zones.filter((z) => z.kind === "trap" && z.owner === f);
    if (mine.length >= 2) mine[0]!.dead = true;
    w.sfx("throw");
    w.zone(f, {
      kind: "trap", x: a.tx, y: a.ty, r: 9, delay: 0.5, dur: 9,
      onTick: (w, z) => {
        const e = w.enemiesIn(z.team, z.x, z.y, z.r)[0];
        if (!e) return;
        z.dead = true;
        w.damage(z.owner, e, 10, { from: [z.x, z.y] });
        w.root(e, 1.4);
        w.fx("snap", z.x, z.y, 0, 0);
        w.sfx("trap");
      },
    });
  },
  disable(w, f, a, s) {
    w.fx("muzzle", f.x + a.dx * 9, f.y + a.dy * 9 - 6, angle(a), 0);
    w.sfx("shotgun");
    w.proj(f, {
      kind: "disable", dx: a.dx, dy: a.dy, speed: 400, range: s.range, r: 4, dmg: 8,
      onHit: shot(8, (w, t, p) => {
        w.knock(t, p.vx, p.vy, 45);
        w.silence(t, 1.2);
      }),
    });
  },
  shells(w, f, a, s) {
    w.sfx("cannon");
    w.fx("shake", f.x, f.y, 3, 0);
    const base = angle(a);
    for (const off of [-0.26, 0, 0.26]) {
      const an = base + off;
      const boom = (w: World, p: Proj) => {
        w.fx("boom", p.x, p.y, 22, 0);
        w.sfx("boom");
        blast(w, f, p.x, p.y, 22, 22);
      };
      w.proj(f, { kind: "shellx", dx: Math.cos(an), dy: Math.sin(an), speed: 330, range: s.range, r: 4, onHit: (w, _t, p) => boom(w, p), onEnd: boom });
    }
  },

  // ================================================================ Merlix
  fireball(w, f, a, s) {
    w.sfx("fireball");
    w.proj(f, { kind: "fireball", dx: a.dx, dy: a.dy, speed: 270, range: s.range, r: 4, dmg: 14, onHit: shot(14), onEnd: (w, p) => w.fx("puff", p.x, p.y, 0, 0) });
  },
  firestorm(w, f, a, s) {
    w.sfx("throw");
    w.zone(f, {
      kind: "firestorm", x: a.tx, y: a.ty, r: s.size, delay: 0.6, dur: 0.15,
      onArm: (w, z) => {
        w.fx("boom", z.x, z.y, z.r, 0);
        w.sfx("boom");
        blast(w, f, z.x, z.y, z.r, (e) => (dist2(e.x, e.y, z.x, z.y) < 11 * 11 ? 30 : 20));
      },
    });
  },
  blink(w, f, a) {
    const ox = f.x, oy = f.y;
    w.fx("teleport", ox, oy, 0, 0);
    w.zone(f, { kind: "puff", x: ox, y: oy, r: 20, delay: 0, dur: 0.4, onArm: (w, z) => blast(w, f, z.x, z.y, z.r, 8) });
    f.x = a.tx;
    f.y = a.ty;
    w.pushOutPillars(f);
    w.fx("teleport", f.x, f.y, 1, 0);
    w.sfx("teleport");
  },
  firewall(w, f, a, s) {
    w.sfx("firewall");
    w.zone(f, {
      kind: "firewall", x: a.tx, y: a.ty, r: 6, a: angle(a), len: s.size * 2, delay: 0.15, dur: 3, wall: true, tickEvery: 0.25,
      onTick: (w, z) => {
        const c = Math.cos(z.a + Math.PI / 2) * z.len / 2, sn = Math.sin(z.a + Math.PI / 2) * z.len / 2;
        for (const e of w.fighters)
          if (e.team !== z.team && w.targetable(e) && segDist2(e.x, e.y, z.x - c, z.y - sn, z.x + c, z.y + sn) < (FIGHTER_R + 4) ** 2) {
            w.damage(z.owner, e, 4, { from: [z.x, z.y], pure: false });
            w.slowFor(e, 0.3, 0.6);
          }
      },
    });
  },
  fist(w, f, a, s) {
    w.fx("fist", f.x, f.y, angle(a), s.range);
    w.sfx("boom");
    w.melee(f, s.range, 1.4, 12, (e) => w.knock(e, e.x - f.x, e.y - f.y, 65, 0.28));
  },
  ray(w, f, a, s) {
    const an = angle(a), x2 = f.x + a.dx * s.range, y2 = f.y + a.dy * s.range;
    w.zone(f, { kind: "ray", x: f.x, y: f.y - 6, r: s.size, a: an, len: s.range, delay: 0, dur: 0.4 });
    w.fx("shake", f.x, f.y, 6, 0);
    w.sfx("ray");
    for (const e of w.fighters)
      if (e.team !== f.team && w.targetable(e) && segDist2(e.x, e.y, f.x, f.y, x2, y2) < (s.size / 2 + FIGHTER_R) ** 2) w.damage(f, e, 40, { from: [f.x, f.y] });
    if (w.orb && segDist2(w.orb.x, w.orb.y, f.x, f.y, x2, y2) < (s.size / 2 + 9) ** 2) w.hitOrb(f, 40);
  },

  // ================================================================ Florak
  seed(w, f, a, s) {
    w.sfx("seed");
    w.proj(f, {
      kind: "seed", dx: a.dx, dy: a.dy, speed: 340, range: s.range, dmg: 11, allies: true,
      onHit: (w, t, p) => {
        if (t.team === p.team) {
          w.heal(p.owner, t, 11);
          w.fx("heal", t.x, t.y, 0, 0);
        } else if (w.damage(p.owner, t, 11, { from: [p.x, p.y] })) w.heal(p.owner, p.owner, 4, true);
      },
    });
  },
  bloom(w, f, a, s) {
    w.sfx("seed");
    w.zone(f, {
      kind: "bloom", x: a.tx, y: a.ty, r: s.size, delay: 0.5, dur: 0.35,
      onArm: (w, z) => {
        w.sfx("heal");
        for (const t of w.alliesIn(z.team, z.x, z.y, z.r)) {
          w.heal(f, t, 30);
          w.fx("heal", t.x, t.y, 0, 0);
        }
      },
    });
  },
  roll(w, f, a, s) {
    w.sfx("dash");
    w.dash(f, a.dx, a.dy, s.range, 0.26);
  },
  sap(w, f, a, s) {
    let best = f, bd = Infinity;
    for (const t of w.fighters) {
      if (t.team !== f.team || t.dead || dist2(t.x, t.y, f.x, f.y) > (s.range + 10) ** 2) continue;
      const d = dist2(t.x, t.y, a.tx, a.ty);
      if (d < bd) {
        bd = d;
        best = t;
      }
    }
    w.addShield(best, 30, 3);
    w.fx("sap", best.x, best.y, 0, 0);
    w.sfx("shield");
  },
  pollen(w, f, a, s) {
    w.sfx("bubble");
    w.proj(f, { kind: "pollen", dx: a.dx, dy: a.dy, speed: 230, range: s.range, r: 5, onHit: (w, t) => w.sleepFor(t, 2), onEnd: (w, p) => w.fx("puff", p.x, p.y, 1, 0) });
  },
  garden(w, f, a, s) {
    w.sfx("garden");
    w.zone(f, {
      kind: "garden", x: a.tx, y: a.ty, r: s.size, delay: 0.2, dur: 4, tickEvery: 0.25,
      onTick: (w, z) => {
        for (const t of w.alliesIn(z.team, z.x, z.y, z.r)) w.heal(f, t, 14 * 0.25, true);
        for (const e of w.enemiesIn(z.team, z.x, z.y, z.r)) w.slowFor(e, 0.35, 0.4);
      },
    });
  },

  // ================================================================ Nekobot
  claw(w, f, a, s) {
    const dmg = 11 + f.bonus;
    w.fx("claw", f.x, f.y, angle(a), s.range);
    w.sfx("claw");
    if (w.melee(f, s.range, 1.6, dmg).length && f.bonus) {
      f.bonus = 0;
      w.sfx("crit");
    }
  },
  hook(w, f, a, s) {
    w.sfx("throw");
    w.proj(f, {
      kind: "hook", dx: a.dx, dy: a.dy, speed: 420, range: s.range, r: 4, dmg: 12,
      onHit: shot(12, (w, t, p) => {
        const o = p.owner, d = Math.hypot(o.x - t.x, o.y - t.y);
        if (d > 16) w.knock(t, o.x - t.x, o.y - t.y, d - 14, 0.25);
        w.sfx("hook");
      }),
    });
  },
  pounce(w, f, a, s) {
    w.sfx("leap");
    w.dash(f, a.dx, a.dy, s.range, 0.45, {
      air: true,
      h: 26,
      end: () => {
        w.fx("ring", f.x, f.y, 20, 2);
        blast(w, f, f.x, f.y, 20, 10);
      },
    });
  },
  stealth(w, f) {
    f.stealth = 2.5;
    f.haste = 2.5;
    f.hasteK = 0.3;
    f.bonus = 20;
    w.fx("teleport", f.x, f.y, 2, 0);
    w.sfx("stealth");
  },
  counter(w, f) {
    f.counter = 0.8;
    w.sfx("shield");
  },
  frenzy(w, f, a, s) {
    w.sfx("frenzy");
    f.invuln = 0.32;
    w.dash(f, a.dx, a.dy, s.range, 0.3, {
      touch: (e) => {
        if (w.damage(f, e, 34, { melee: true, pure: true })) w.slowFor(e, 0.6, 1.5);
        w.fx("claw", e.x, e.y, Math.atan2(a.dy, a.dx), 16);
        return false;
      },
    });
  },
};
