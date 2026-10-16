// Comportamiento de cada skill. Los números de alcance, recarga y lanzamiento
// están en data.ts; aquí, el daño y lo que hace cada una.

import { clampArena, FIGHTER_R, type SkillDef } from "./data";
import { angleDiff, dist2, segDist2 } from "./math";
import type { Aim, Fighter, Proj, World } from "./world";

type SkillFn = (w: World, f: Fighter, aim: Aim, s: SkillDef) => void;
/** Se llama cada paso mientras se lanza; devuelve false para cortar la canalización. */
type ChannelFn = (w: World, f: Fighter, aim: Aim, dt: number) => boolean;

/** Proyectil de daño simple. */
const shot = (dmg: number, extra?: (w: World, t: Fighter, p: Proj) => void) => (w: World, t: Fighter, p: Proj) => {
  if (w.damage(p.owner, t, dmg, { from: [p.x, p.y] })) extra?.(w, t, p);
};

/** Explosión en área contra enemigos (y el orbe). */
function blast(w: World, f: Fighter, x: number, y: number, r: number, dmg: number | ((e: Fighter) => number), extra?: (e: Fighter) => void) {
  for (const e of w.enemiesIn(f.team, x, y, r)) if (w.damage(f, e, typeof dmg === "number" ? dmg : dmg(e), { from: [x, y] })) extra?.(e);
  if (w.orb && dist2(w.orb.x, w.orb.y, x, y) < (r + 9) ** 2) w.hitOrb(f, typeof dmg === "number" ? dmg : 15);
  w.blastProps(x, y, r, typeof dmg === "number" ? dmg : 15, f);
}

const angle = (a: Aim) => Math.atan2(a.dy, a.dx);

/** Enemigos en un cono delante del robot. */
function coneTargets(w: World, f: Fighter, range: number, arc: number) {
  return w.fighters.filter((e) => {
    if (e.team === f.team || !w.targetable(e)) return false;
    const dx = e.x - f.x, dy = e.y - f.y;
    return dx * dx + dy * dy <= (range + FIGHTER_R) ** 2 && Math.abs(angleDiff(f.face, Math.atan2(dy, dx))) <= arc / 2 + 0.1;
  });
}

/** Obús en parábola: aviso en el suelo y explosión al caer. */
function lob(w: World, f: Fighter, x: number, y: number, r: number, delay: number, dmg: number) {
  w.zone(f, {
    kind: "lob", x, y, r, delay, dur: 0.1,
    onArm: (w, z) => {
      w.fx("boom", z.x, z.y, z.r, 0);
      w.sfx("boom");
      blast(w, f, z.x, z.y, z.r, dmg);
    },
  });
}

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
    w.proj(f, { kind: "bullet", dx: a.dx, dy: a.dy, speed: 430, range: s.range, dmg: 12, onHit: shot(12) });
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
        } else if (w.damage(p.owner, t, 11, { from: [p.x, p.y] })) w.heal(p.owner, p.owner, 5, true);
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
    const dmg = 10 + f.bonus;
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
  // ================================================================ Sawkuwa
  twinslash(w, f, a, s) {
    f.combo = (f.combo + 1) % 2;
    f.comboT = 1;
    w.fx("slash2", f.x, f.y, angle(a), f.combo);
    w.sfx("swing");
    w.melee(f, s.range, 1.7, 12);
  },
  crescent(w, f, a, s) {
    w.sfx("crescent");
    w.proj(f, { kind: "wave", dx: a.dx, dy: a.dy, speed: 300, range: s.range, r: 7, dmg: 18, pierce: true, onHit: shot(18, (w, t) => w.slowFor(t, 0.25, 1)) });
  },
  phase(w, f, a, s) {
    w.sfx("dash");
    f.invuln = 0.24;
    w.fx("afterimage", f.x, f.y, angle(a), 0);
    w.dash(f, a.dx, a.dy, s.range, 0.22, {
      touch: (e) => {
        w.damage(f, e, 8, { melee: true, pure: true });
        w.fx("slash2", e.x, e.y, angle(a), 0);
        return false;
      },
    });
  },
  deflect(w, f) {
    f.deflect = 1;
    w.sfx("shield");
  },
  pincer(w, f, a, s) {
    w.fx("slash2", f.x, f.y, angle(a), 2);
    w.sfx("swing");
    const t = coneTargets(w, f, s.range, 1.2).sort((p, q) => dist2(p.x, p.y, f.x, f.y) - dist2(q.x, q.y, f.x, f.y))[0];
    if (!t || !w.damage(f, t, 12, { melee: true })) return;
    // por encima de la cabeza: aterriza al otro lado
    const dx = f.x - t.x, dy = f.y - t.y, d = Math.hypot(dx, dy) || 1;
    w.stun(t, 0.6);
    w.knock(t, dx, dy, d * 2 + 18, 0.3);
    w.sfx("slam");
  },
  whirl(w, f, _a, s) {
    f.spin = 1.6;
    w.sfx("frenzy");
    w.zone(f, {
      kind: "whirl", x: f.x, y: f.y, r: s.size, delay: 0, dur: 1.6, tickEvery: 0.2, follow: f,
      onTick: (w, z) => {
        if (f.spin <= 0) return;
        w.sfx("swing");
        for (const e of w.enemiesIn(z.team, z.x, z.y, z.r)) w.damage(f, e, 8, { melee: true });
        if (w.orb && dist2(w.orb.x, w.orb.y, z.x, z.y) < (z.r + 9) ** 2) w.hitOrb(f, 7);
      },
    });
  },

  // ================================================================ Tanker
  minigun(w, f, a, s) {
    const an = angle(a) + (w.rng.next() - 0.5) * 0.16;
    w.fx("muzzle", f.x + a.dx * 10, f.y + a.dy * 10 - 5, an, 0);
    w.sfx("minigun");
    w.proj(f, { kind: "pellet", dx: Math.cos(an), dy: Math.sin(an), speed: 380, range: s.range, r: 2, dmg: 5, onHit: shot(5) });
  },
  mortar(w, f, a, s) {
    w.sfx("cannon");
    w.fx("muzzle", f.x, f.y - 10, -Math.PI / 2, 1);
    lob(w, f, a.tx, a.ty, s.size, 0.9, 26);
  },
  treads(w, f, a, s) {
    w.sfx("treads");
    w.dash(f, a.dx, a.dy, s.range, 0.38, {
      touch: (e) => {
        // aparta hacia el lado
        const side = (e.x - f.x) * -a.dy + (e.y - f.y) * a.dx >= 0 ? 1 : -1;
        if (w.damage(f, e, 6, { melee: true })) w.knock(e, -a.dy * side + a.dx * 0.4, a.dx * side + a.dy * 0.4, 34);
        return false;
      },
    });
  },
  armor(w, f) {
    w.addShield(f, 40, 3);
    w.fx("sap", f.x, f.y, 0, 0);
    w.sfx("armor");
  },
  cannonball(w, f, a, s) {
    w.sfx("cannon");
    w.fx("shake", f.x, f.y, 2, 0);
    w.proj(f, {
      kind: "ball", dx: a.dx, dy: a.dy, speed: 320, range: s.range, r: 5, dmg: 14,
      onHit: shot(14, (w, t, p) => {
        w.knock(t, p.vx, p.vy, 75, 0.3, () => {
          // empotrado
          w.damage(f, t, 10, { pure: true });
          w.stun(t, 1.2);
          w.fx("boom", t.x, t.y, 14, 0);
          w.fx("shake", t.x, t.y, 5, 0);
          w.sfx("slam");
          w.popup(t.x, t.y - 34, "¡EMPOTRADO!", "#ff8a2b");
        });
      }),
    });
  },
  barrage(w, f, a, s) {
    w.sfx("cannon");
    for (let i = 0; i < 6; i++) {
      const an = w.rng.next() * Math.PI * 2, d = Math.sqrt(w.rng.next()) * (s.size - 14);
      const [x, y] = clampArena(a.tx + Math.cos(an) * d, a.ty + Math.sin(an) * d * 0.8, 6);
      lob(w, f, x, y, 18, 0.6 + i * 0.22, 18);
    }
  },

  // ================================================================ Vladbot
  batbite(w, f, a, s) {
    w.sfx("bat");
    w.proj(f, { kind: "bat", dx: a.dx, dy: a.dy, speed: 280, range: s.range, r: 4, dmg: 10, onHit: shot(10, (w, _t, p) => w.heal(p.owner, p.owner, 3, true)) });
  },
  drain() {
    // todo el efecto va en la canalización (CHANNELS.drain)
  },
  mist(w, f) {
    f.mist = 1;
    f.invuln = 1;
    f.haste = 1;
    f.hasteK = 0.6;
    w.fx("mist", f.x, f.y, 0, 0);
    w.sfx("stealth");
  },
  swarm(w, f, a, s) {
    w.sfx("bat");
    const base = angle(a);
    for (let i = -2; i <= 2; i++) {
      const an = base + i * 0.17;
      w.proj(f, {
        kind: "bat", dx: Math.cos(an), dy: Math.sin(an), speed: 260 + Math.abs(i) * 15, range: s.range, r: 3, dmg: 6,
        onHit: shot(6, (w, t, p) => {
          w.slowFor(t, 0.25, 1);
          w.heal(p.owner, p.owner, 2, true);
        }),
      });
    }
  },
  hypno(w, f, a, s) {
    w.fx("hypno", f.x, f.y, angle(a), s.range);
    w.sfx("hypno");
    for (const e of coneTargets(w, f, s.range, 1.2)) w.fearFor(e, f, 1.3);
  },
  bloodmoon(w, f, a, s) {
    w.sfx("bloodmoon");
    w.zone(f, {
      kind: "bloodmoon", x: a.tx, y: a.ty, r: s.size, delay: 0.3, dur: 3.5, tickEvery: 0.25,
      onTick: (w, z) => {
        for (const e of w.enemiesIn(z.team, z.x, z.y, z.r)) {
          if (w.damage(f, e, 2, { pure: true })) w.heal(f, f, 2, true);
          w.slowFor(e, 0.2, 0.3);
          if (w.rng.next() < 0.5) w.fx("drain", e.x, e.y, f.x, f.y);
        }
      },
    });
  },

  // ================================================================ Nexus
  zap(w, f, a, s) {
    w.sfx("zap");
    w.proj(f, { kind: "zap", dx: a.dx, dy: a.dy, speed: 650, range: s.range, r: 3, dmg: 8, onHit: shot(8) });
  },
  turret(w, f, a) {
    for (const z of w.zones) if (z.kind === "turret" && z.owner === f) z.dead = true;
    w.sfx("throw");
    w.zone(f, {
      kind: "turret", x: a.tx, y: a.ty, r: 150, delay: 0.3, dur: 6, tickEvery: 0.7,
      onTick: (w, z) => {
        let best: Fighter | null = null, bd = z.r * z.r;
        for (const e of w.fighters) {
          if (e.team === z.team || !w.targetable(e) || e.stealth > 0) continue;
          const d = dist2(e.x, e.y, z.x, z.y);
          if (d < bd && w.clearLine(z.x, z.y, e.x, e.y)) {
            bd = d;
            best = e;
          }
        }
        if (!best) return;
        const dx = best.x - z.x, dy = best.y - z.y, l = Math.hypot(dx, dy) || 1;
        z.a = Math.atan2(dy, dx);
        w.sfx("zap");
        w.proj(f, { kind: "zap", dx: dx / l, dy: dy / l, speed: 500, range: z.r + 10, r: 3, dmg: 5, from: [z.x + (dx / l) * 6, z.y + (dy / l) * 6], onHit: shot(5) });
      },
    });
  },
  jet(w, f, a, s) {
    w.sfx("dash");
    w.fx("afterimage", f.x, f.y, angle(a), 1);
    w.dash(f, a.dx, a.dy, s.range, 0.25, {
      end: () => {
        f.haste = 1.5;
        f.hasteK = 0.25;
      },
    });
  },
  dome(w, f, _a, s) {
    w.sfx("dome");
    w.zone(f, { kind: "dome", x: f.x, y: f.y, r: s.size, delay: 0, dur: 3, dome: true });
  },
  chain(w, f, a, s) {
    w.sfx("chain");
    // primer objetivo: el enemigo más cerca de la línea de mira
    let first: Fighter | null = null, bd = Infinity;
    const x2 = f.x + a.dx * s.range, y2 = f.y + a.dy * s.range;
    for (const e of w.fighters) {
      if (e.team === f.team || !w.targetable(e)) continue;
      const d = segDist2(e.x, e.y, f.x, f.y, x2, y2);
      if (d < 18 * 18 && d < bd && w.clearLine(f.x, f.y, e.x, e.y)) {
        bd = d;
        first = e;
      }
    }
    if (!first) {
      w.fx("bolt", f.x, f.y - 6, x2, y2 - 6);
      return;
    }
    w.fx("bolt", f.x, f.y - 6, first.x, first.y - 6);
    if (w.damage(f, first, 14, { from: [f.x, f.y] })) w.slowFor(first, 0.3, 1.2);
    const next = w.fighters.find((e) => e !== first && e.team !== f.team && w.targetable(e) && dist2(e.x, e.y, first!.x, first!.y) < 85 * 85);
    if (next) {
      w.fx("bolt", first.x, first.y - 6, next.x, next.y - 6);
      if (w.damage(f, next, 10, { from: [first.x, first.y] })) w.slowFor(next, 0.3, 1.2);
    }
  },
  singularity(w, f, a, s) {
    w.sfx("singularity");
    w.zone(f, {
      kind: "singularity", x: a.tx, y: a.ty, r: s.size, delay: 0.3, dur: 2.2, tickEvery: 0,
      onTick: (w, z) => {
        for (const e of w.enemiesIn(z.team, z.x, z.y, z.r)) {
          if (e.motion) continue;
          const dx = z.x - e.x, dy = z.y - e.y, d = Math.hypot(dx, dy);
          if (d < 3) continue;
          const pull = Math.min(d, 48 * DT_PULL);
          w.moveTo(e, e.x + (dx / d) * pull, e.y + (dy / d) * pull, true);
          w.slowFor(e, 0.3, 0.2);
        }
      },
      onEnd: (w, z) => {
        w.fx("boom", z.x, z.y, 40, 2);
        w.fx("shake", z.x, z.y, 6, 0);
        w.sfx("boom");
        blast(w, f, z.x, z.y, 40, 24);
      },
    });
  },

  // ================================================================ Shinobot
  shuriken(w, f, a, s) {
    w.sfx("throw");
    w.proj(f, { kind: "shuriken", dx: a.dx, dy: a.dy, speed: 360, range: s.range, r: 3, dmg: 9, onHit: shot(9) });
  },
  kunais(w, f, a, s) {
    w.sfx("throw");
    const base = angle(a);
    for (const off of [-0.18, 0, 0.18]) {
      const an = base + off;
      w.proj(f, { kind: "kunai", dx: Math.cos(an), dy: Math.sin(an), speed: 420, range: s.range, r: 3, dmg: 9, onHit: shot(9) });
    }
  },
  kawarimi(w, f, a, s) {
    w.fx("log", f.x, f.y, 0, 0);
    const [x, y] = clampArena(f.x + a.dx * s.range, f.y + a.dy * s.range, 8);
    f.x = x;
    f.y = y;
    w.pushOutPillars(f);
    f.invuln = Math.max(f.invuln, 0.15);
    w.fx("teleport", f.x, f.y, 2, 0);
    w.sfx("teleport");
  },
  mark(w, f, a, s) {
    w.sfx("throw");
    w.proj(f, {
      kind: "kunai", dx: a.dx, dy: a.dy, speed: 440, range: s.range, r: 3, dmg: 10,
      onHit: shot(10, (w, t, p) => {
        w.root(t, 0.6);
        const o = p.owner;
        if (o.dead || o.motion) return;
        const dx = t.x - o.x, dy = t.y - o.y, d = Math.hypot(dx, dy) || 1;
        w.fx("teleport", o.x, o.y, 2, 0);
        const [x, y] = clampArena(t.x + (dx / d) * 15, t.y + (dy / d) * 15, 8);
        o.x = x;
        o.y = y;
        w.pushOutPillars(o);
        o.face = Math.atan2(t.y - o.y, t.x - o.x);
        o.cast = null;
        w.fx("teleport", o.x, o.y, 2, 0);
        w.sfx("teleport");
      }),
    });
  },
  smoke(w, f, _a, s) {
    w.sfx("smoke");
    w.zone(f, {
      kind: "smoke", x: f.x, y: f.y, r: s.size, delay: 0, dur: 3.5, tickEvery: 0.1,
      onTick: (w, z) => {
        for (const t of w.alliesIn(z.team, z.x, z.y, z.r)) t.stealth = Math.max(t.stealth, 0.25);
        for (const e of w.enemiesIn(z.team, z.x, z.y, z.r)) w.slowFor(e, 0.3, 0.25);
      },
    });
  },
  shadowdance(w, f, _a, s) {
    f.invuln = 1.05;
    f.lock = 1.05;
    w.sfx("frenzy");
    let last: Fighter | null = null;
    w.zone(f, {
      kind: "dance", x: f.x, y: f.y, r: s.range, delay: 0, dur: 1, tickEvery: 0.25, follow: f,
      onTick: (w) => {
        const list = w.fighters.filter((e) => e.team !== f.team && !e.dead && !e.motion?.air && dist2(e.x, e.y, f.x, f.y) < s.range * s.range);
        if (!list.length) return;
        const t = list.find((e) => e !== last) ?? list[0]!;
        last = t;
        const an = w.rng.next() * Math.PI * 2;
        w.fx("afterimage", f.x, f.y, an, 2);
        const [x, y] = clampArena(t.x + Math.cos(an) * 14, t.y + Math.sin(an) * 12, 8);
        f.x = x;
        f.y = y;
        f.face = Math.atan2(t.y - y, t.x - x);
        w.fx("slash2", t.x, t.y, f.face, 2);
        w.sfx("claw");
        w.damage(f, t, 13, { melee: true, pure: true });
      },
    });
  },
};

const DT_PULL = 1 / 60;

/** Skills canalizadas: efecto en cada paso del lanzamiento. */
export const CHANNELS: Record<string, ChannelFn> = {
  drain(w, f, a, dt) {
    const s = f.def.skills.l2;
    const ch = f.chan;
    if (!ch.target) {
      // fija como objetivo al enemigo más cercano a la línea de mira
      let bd = Infinity;
      const x2 = f.x + a.dx * s.range, y2 = f.y + a.dy * s.range;
      for (const e of w.fighters) {
        if (e.team === f.team || !w.targetable(e)) continue;
        const d = segDist2(e.x, e.y, f.x, f.y, x2, y2);
        if (d < 22 * 22 && d < bd) {
          bd = d;
          ch.target = e;
        }
      }
      if (!ch.target) return f.cast!.t < 0.25; // un momento para engancharlo
    }
    const t = ch.target;
    if (t.dead || !w.targetable(t) || dist2(t.x, t.y, f.x, f.y) > (s.range + 25) ** 2 || !w.clearLine(f.x, f.y, t.x, t.y)) return false;
    f.face = Math.atan2(t.y - f.y, t.x - f.x);
    ch.t -= dt;
    if (ch.t <= 0) {
      ch.t += 0.2;
      if (w.damage(f, t, 4, { from: [f.x, f.y] })) w.heal(f, f, 4, true);
      w.fx("drain", t.x, t.y, f.x, f.y);
    }
    return true;
  },
};
