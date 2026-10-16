// Simulación de un combate de arena (1v1 / 2v2) por rondas. Se ejecuta en el
// cliente (solitario y sofá) o en el servidor (LAN). No toca el DOM.

import {
  ARENAS, ARENA_RX, ARENA_RY, CAPSULE_AT, CAPSULE_HEAL, CAPSULE_POS, CHAMPS, CRATE_HP, CRATE_R, ENERGY_MAX, ENERGY_PER_DMG, ENERGY_REGEN, FIGHTER_R,
  LAYOUTS, LEVERS, LEVER_CD, LEVER_FIRST, LEVER_HOLD, ORB_AT, ORB_ENERGY, ORB_HEAL, ORB_HP, ROUND_COUNTDOWN, ROUND_END_PAUSE, SLOTS, SLOT_BIT, SPAWNS, SPAWNS_2V2,
  STORM_AT, STORM_DPS, STORM_MIN, STORM_TIME,
  clampArena, type ArenaDef, type ChampDef, type ChampId, type Difficulty, type Layout, type Pillar, type SkillDef, type Slot,
} from "./data";
import { angleDiff, clamp, dist2, Rng, segDist2 } from "./math";
import { NO_INPUT, PROJ_KINDS, PROP_KINDS, ST, ZONE_KINDS, type Ev, type FSnap, type Input, type Phase, type Snap } from "./protocol";
import { botThink, type Bot } from "./ai";
import { CHANNELS, SKILLS } from "./skills";
import { TRAPS } from "./traps";

export const DT = 1 / 60;

export interface Motion {
  vx: number;
  vy: number;
  t: number;
  total: number;
  /** salto: ignora pilares y no se le puede tocar */
  air: boolean;
  /** empujón (no lo controla quien lo sufre) */
  knock: boolean;
  /** altura máxima del arco (salto) */
  h: number;
  hit: Set<number>;
  /** empujón que choca contra un muro o pilar */
  slam?: () => void;
  /** al tocar a un enemigo; devuelve true para frenar */
  touch?: (e: Fighter) => boolean;
  end?: () => void;
}

export interface Fighter {
  id: number;
  name: string;
  champ: ChampId;
  def: ChampDef;
  team: number;
  slot: number;
  human: boolean;
  x: number;
  y: number;
  z: number;
  face: number;
  vx: number;
  vy: number;
  moving: boolean;
  hp: number;
  maxHp: number;
  energy: number;
  dead: boolean;
  cds: Record<Slot, number>;
  cast: { slot: Slot; t: number; total: number } | null;
  input: Input;
  prevB: number;
  buffer: Slot | null;
  bufferT: number;
  // estados: segundos restantes
  stun: number;
  root: number;
  silence: number;
  sleep: number;
  slow: number;
  slowK: number;
  haste: number;
  hasteK: number;
  invuln: number;
  stealth: number;
  counter: number;
  /** miedo: huye de (fearX, fearY) sin poder actuar */
  fear: number;
  fearX: number;
  fearY: number;
  /** guardia que devuelve proyectiles de frente */
  deflect: number;
  /** forma de niebla: intocable y sin poder atacar */
  mist: number;
  /** torbellino: gira sin poder usar otras skills */
  spin: number;
  /** ocupado (definitivas con varios golpes): ni se mueve ni actúa */
  lock: number;
  /** canalización en curso (Drenar) */
  chan: { t: number; target: Fighter | null };
  block: number;
  shield: number;
  shieldT: number;
  hots: { hps: number; t: number; src: Fighter; acc: number }[];
  stormAcc: number;
  motion: Motion | null;
  /** daño extra para el siguiente golpe básico */
  bonus: number;
  combo: number;
  comboT: number;
  flash: number;
  lastHitBy: Fighter | null;
  /** cargando una skill de "carga al soltar" */
  charge: { slot: Slot; t: number; max: number } | null;
  /** potencia de la última carga soltada (0..1): la lee la skill */
  chargeK: number;
  /** carga ya ganada para la próxima (0..1) */
  preCharge: number;
  /** calor 0..100; a 100 se bloquea el básico `overheat` segundos */
  heat: number;
  overheat: number;
  /** segundos sin disparar (el calor baja pasado un momento) */
  heatIdle: number;
  /** segundos seguidos disparando (cadencia que acelera) */
  ramp: number;
  /** cargas que le quedan a las skills con `charges` */
  ammo: Partial<Record<Slot, number>>;
  ammoLock: number;
  /** daño potenciado: +dmgUpK durante dmgUp segundos */
  dmgUp: number;
  dmgUpK: number;
  /** marcado por `markBy`: sus golpes le hacen +30% */
  markT: number;
  markBy: Fighter | null;
  /** anclado: no se mueve ni se le puede empujar */
  anchor: number;
  /** ventana de Atrapada perfecta */
  catchBuff: number;
  /** skill "mantenida" (visor) y cuánto lleva mantenida */
  hold: Slot | null;
  holdT: number;
  /** cegado: apunta con desvío y menos alcance */
  blind: number;
  /** quemaduras (daño por segundo) */
  burns: { dps: number; t: number; src: Fighter | null; acc: number }[];
  /** reduce el daño recibido un guardK y lo acumula en `absorbed` */
  guard: number;
  guardK: number;
  absorbed: number;
  /** va más lento por su propia arma (lanzallamas) */
  selfSlow: number;
  /** refracción: los proyectiles le atraviesan */
  refract: number;
  /** imán absorbente: los proyectiles enemigos que le tocan dan escudo en vez de daño */
  absorbT: number;
  /** mareo: controles invertidos */
  daze: number;
  /** polaridad magnética (+1 / -1) puesta por polBy */
  pol: number;
  polT: number;
  polBy: Fighter | null;
  /** lleva a alguien agarrado (Golemax) / está agarrado por alguien */
  carry: { e: Fighter; t: number } | null;
  heldBy: Fighter | null;
  /** imparable: ni le aturden ni le empujan */
  unstop: number;
  /** botones que se han pulsado este paso (flanco) */
  pressed: number;
  /** bomba pegada: explota al acabar; si el portador toca a un aliado suyo, salta */
  sticky: { t: number; src: Fighter; boom: (w: World, at: Fighter) => void } | null;
  stats: { dmg: number; heal: number; kos: number };
  bot: Bot | null;
}

export interface Proj {
  id: number;
  owner: Fighter;
  team: number;
  kind: (typeof PROJ_KINDS)[number];
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  dist: number;
  /** daño contra el orbe */
  orbDmg: number;
  /** también choca con aliados (curaciones) */
  allies: boolean;
  pierce: boolean;
  hit: Set<number>;
  onHit: (w: World, t: Fighter, p: Proj) => void;
  onEnd?: (w: World, p: Proj) => void;
  /** vuelve al dueño al agotar el alcance o chocar (bumerán); onCatch si lo atrapa */
  ret?: { back: boolean; t: number; onCatch?: (w: World, p: Proj) => void };
  /** rebotes que le quedan en columnas, objetos y borde */
  bounces: number;
  /** atraviesa objetos (barricadas, cajas), cúpulas y muros de fuego */
  ghost: boolean;
  /** robots que arrastra consigo (gran bumerán) */
  carry: Fighter[];
  /** mecha: explota (onEnd) al acabarse aunque siga rodando */
  fuse: number;
  /** frenado por segundo (granadas que ruedan) */
  fric: number;
  /** al chocar contra columna, objeto o borde (antes de onEnd) */
  onWall?: (w: World, p: Proj) => void;
  dead: boolean;
}

export interface Zone {
  id: number;
  owner: Fighter;
  team: number;
  kind: (typeof ZONE_KINDS)[number];
  x: number;
  y: number;
  r: number;
  a: number;
  len: number;
  /** tiempo hasta que se activa (aviso) */
  delay: number;
  /** duración una vez activa */
  dur: number;
  t: number;
  armed: boolean;
  tickEvery: number;
  tickT: number;
  /** bloquea proyectiles enemigos (muro) */
  wall: boolean;
  hit: Set<number>;
  onArm?: (w: World, z: Zone) => void;
  onTick?: (w: World, z: Zone) => void;
  onEnd?: (w: World, z: Zone) => void;
  /** sigue a un robot */
  follow?: Fighter;
  /** cúpula: frena los proyectiles enemigos que intentan entrar */
  dome: boolean;
  dead: boolean;
}

/**
 * Objeto con vida (cajas, y más adelante barricadas, espejos, barriles...).
 * Lo dañan proyectiles, golpes y explosiones de cualquier equipo. Si `len` > 0
 * es una cápsula (segmento de largo `len` orientado según `a`) de grosor `r`.
 */
export interface Prop {
  id: number;
  kind: (typeof PROP_KINDS)[number];
  owner: Fighter | null;
  /** -1 = neutral */
  team: number;
  x: number;
  y: number;
  r: number;
  a: number;
  len: number;
  hp: number;
  maxHp: number;
  /** segundos que le quedan (Infinity = hasta romperse) */
  t: number;
  /** frena a los robots */
  solid: boolean;
  /** para los proyectiles */
  stopsProj: boolean;
  /** espejo: refleja proyectiles y rayos (de cualquiera) */
  reflect?: boolean;
  onBreak?: (w: World, p: Prop) => void;
  dead: boolean;
}

export interface Lever {
  x: number;
  y: number;
  /** segundos que alguien lleva encima */
  prog: number;
  by: Fighter | null;
}

export interface Aim {
  dx: number;
  dy: number;
  /** distancia a la mira, limitada al alcance */
  dist: number;
  tx: number;
  ty: number;
}

export interface FighterSpec {
  id: number;
  name: string;
  champ: ChampId;
  team: number;
  human: boolean;
  diff?: Difficulty;
}

export interface WorldOpts {
  seed: number;
  /** rondas para ganar */
  wins: number;
  arena: number;
  /** índice en ARENAS[arena].layouts (-1 = al azar) */
  layout?: number;
}

const DMG_POPUP = 0, HEAL_POPUP = 1, SHIELD_POPUP = 2, TEXT_POPUP = 3;

export class World {
  rng: Rng;
  fighters: Fighter[] = [];
  projs: Proj[] = [];
  zones: Zone[] = [];
  events: Ev[] = [];
  phase: Phase = "count";
  pt = ROUND_COUNTDOWN;
  round = 1;
  score: [number, number] = [0, 0];
  winner = -1;
  wins: number;
  arena: number;
  arenaDef: ArenaDef;
  layout: Layout;
  pillars: Pillar[] = [];
  props: Prop[] = [];
  levers: Lever[] = [];
  /** recarga compartida de las palancas */
  leverCd = 0;
  /** objeto contra el que ha chocado el último proyectil (wallNormal) */
  hitProp: Prop | null = null;
  risen = false;
  orb: { x: number; y: number; hp: number; last: number } | null = null;
  orbDone = false;
  caps: { x: number; y: number; on: boolean }[] = [];
  capsDone = false;
  storm = 1;
  tick = 0;
  /** cámara lenta al acabar una ronda */
  timeScale = 1;
  nextId = 1;

  constructor(opts: WorldOpts, specs: FighterSpec[]) {
    this.rng = new Rng(opts.seed);
    this.wins = opts.wins;
    this.arena = opts.arena;
    this.arenaDef = ARENAS[opts.arena] ?? ARENAS[0]!;
    const ids = this.arenaDef.layouts;
    const li = opts.layout ?? 0;
    this.layout = LAYOUTS[ids[li < 0 || li >= ids.length ? this.rng.int(0, ids.length - 1) : li]!]!;
    const perTeam = [0, 0];
    for (const s of specs) {
      const def = CHAMPS[s.champ];
      const slot = perTeam[s.team]!++;
      const f: Fighter = {
        id: s.id, name: s.name, champ: s.champ, def, team: s.team, slot, human: s.human,
        x: 0, y: 0, z: 0, face: s.team ? Math.PI : 0, vx: 0, vy: 0, moving: false,
        hp: def.hp, maxHp: def.hp, energy: 0, dead: false,
        cds: { r2: 0, l2: 0, a: 0, x: 0, y: 0, b: 0 }, cast: null,
        input: { ...NO_INPUT, ax: s.team ? -1 : 1 }, prevB: 0, buffer: null, bufferT: 0,
        stun: 0, root: 0, silence: 0, sleep: 0, slow: 0, slowK: 0, haste: 0, hasteK: 0, invuln: 0, stealth: 0, counter: 0, block: 0,
        fear: 0, fearX: 0, fearY: 0, deflect: 0, mist: 0, spin: 0, lock: 0, chan: { t: 0, target: null },
        shield: 0, shieldT: 0, hots: [], stormAcc: 0, motion: null, bonus: 0, combo: 0, comboT: 0, flash: 0, lastHitBy: null,
        charge: null, chargeK: 0, preCharge: 0, heat: 0, overheat: 0, heatIdle: 0, ramp: 0, ammo: {}, ammoLock: 0,
        dmgUp: 0, dmgUpK: 0, markT: 0, markBy: null, anchor: 0, catchBuff: 0,
        hold: null, holdT: 0, blind: 0, burns: [], guard: 0, guardK: 0, absorbed: 0, selfSlow: 0, sticky: null,
        refract: 0, daze: 0, pol: 0, polT: 0, polBy: null, carry: null, heldBy: null, unstop: 0, pressed: 0, absorbT: 0,
        stats: { dmg: 0, heal: 0, kos: 0 },
        bot: s.human ? null : { diff: s.diff ?? 1, think: 0, strafe: this.rng.next() < 0.5 ? 1 : -1, strafeT: 0, target: null, aimErr: 0, reactT: 0, wantB: 0, holdT: 0 },
      };
      this.fighters.push(f);
    }
    this.resetRound();
  }

  /** ¿partida terminada? (método para que TS no estreche `phase`) */
  winnerDone() {
    return this.phase === "over";
  }

  get teamSize() {
    return Math.max(...[0, 1].map((t) => this.fighters.filter((f) => f.team === t).length));
  }

  // ============================================================ rondas
  resetRound() {
    const spawns = this.teamSize > 1 ? SPAWNS_2V2 : SPAWNS;
    for (const f of this.fighters) {
      const [x, y] = spawns[f.team]![f.slot] ?? spawns[f.team]![0]!;
      Object.assign(f, {
        x, y, z: 0, vx: 0, vy: 0, hp: f.maxHp, dead: false, cast: null, buffer: null, motion: null,
        stun: 0, root: 0, silence: 0, sleep: 0, slow: 0, haste: 0, invuln: 0, stealth: 0, counter: 0, block: 0,
        fear: 0, deflect: 0, mist: 0, spin: 0, lock: 0,
        shield: 0, shieldT: 0, hots: [], bonus: 0, combo: 0, flash: 0, lastHitBy: null, face: f.team ? Math.PI : 0,
        charge: null, chargeK: 0, preCharge: 0, heat: 0, overheat: 0, heatIdle: 0, ramp: 0, ammoLock: 0,
        dmgUp: 0, markT: 0, markBy: null, anchor: 0, catchBuff: 0,
        hold: null, holdT: 0, blind: 0, burns: [], guard: 0, absorbed: 0, selfSlow: 0, sticky: null,
        refract: 0, daze: 0, pol: 0, polT: 0, polBy: null, carry: null, heldBy: null, unstop: 0, absorbT: 0,
      });
      // la energía se conserva entre rondas (como en Battlerite), las recargas no
      for (const s of SLOTS) {
        f.cds[s] = 0;
        const n = f.def.skills[s].charges;
        if (n) f.ammo[s] = n;
      }
    }
    this.projs = [];
    this.zones = [];
    this.pillars = this.layout.pillars.map((p) => ({ ...p }));
    this.props = [];
    for (const [x, y] of this.layout.crates ?? [])
      this.addProp(null, { kind: "crate", x, y, r: CRATE_R, hp: CRATE_HP, onBreak: (w, p) => {
        w.fx("crate", p.x, p.y, 0, 0);
        w.sfx("crate");
      } });
    this.levers = LEVERS.map(([x, y]) => ({ x, y, prog: 0, by: null }));
    this.leverCd = 0;
    this.risen = false;
    this.orb = null;
    this.orbDone = false;
    this.caps = [];
    this.capsDone = false;
    this.storm = 1;
    this.phase = "count";
    this.pt = ROUND_COUNTDOWN;
    this.timeScale = 1;
    this.ev("t", `RONDA ${this.round}`, "#ffd23f");
    this.sfx("round");
  }

  setInput(id: number, i: Input) {
    const f = this.fighters.find((f) => f.id === id);
    if (!f) return;
    const n = (v: unknown, lim: number) => (typeof v === "number" && Number.isFinite(v) ? clamp(v, -lim, lim) : 0);
    f.input = { mx: n(i.mx, 1), my: n(i.my, 1), ax: n(i.ax, 2000), ay: n(i.ay, 2000), b: (i.b | 0) & 63 };
  }

  /** Quita a un jugador que se ha ido (LAN): pasa a ser un bot. */
  dropHuman(id: number) {
    const f = this.fighters.find((f) => f.id === id);
    if (f && f.human) {
      f.human = false;
      f.bot = { diff: 1, think: 0, strafe: 1, strafeT: 0, target: null, aimErr: 0, reactT: 0, wantB: 0, holdT: 0 };
    }
  }

  step(dt: number) {
    this.tick++;
    if (this.phase === "over") return;
    const sdt = dt * this.timeScale;

    if (this.phase === "count") {
      this.pt -= dt;
      for (const f of this.fighters) {
        if (f.bot) botThink(this, f, dt);
        this.updateFace(f);
      }
      const n = Math.ceil(this.pt);
      if (Math.ceil(this.pt + dt) !== n && n > 0) this.sfx("tick");
      if (this.pt <= 0) {
        this.phase = "fight";
        this.pt = 0;
        this.ev("t", "¡ROBATTLE!", "#ff5f6d");
        this.sfx("go");
      }
      return;
    }

    if (this.phase === "fight") {
      this.pt += sdt;
      this.roundEvents(sdt);
    }
    if (this.phase === "end") {
      this.pt -= dt;
      this.timeScale = Math.min(1, this.timeScale + dt * 0.6);
      if (this.pt <= 0) {
        if (this.winner >= 0) {
          this.phase = "over";
          return;
        }
        this.round++;
        this.resetRound();
        return;
      }
    }

    for (const f of this.fighters) {
      if (f.dead) continue;
      if (f.bot && this.phase === "fight") botThink(this, f, sdt);
      this.updateFighter(f, sdt);
    }
    this.separate();
    this.updateProjs(sdt);
    this.updateZones(sdt);
    this.updateProps(sdt);
    if (this.phase === "fight") this.checkRoundEnd();
  }

  roundEvents(dt: number) {
    const t = this.pt;
    if (!this.capsDone && t >= CAPSULE_AT) {
      this.capsDone = true;
      this.caps = CAPSULE_POS.map(([x, y]) => ({ x, y, on: true }));
      this.ev("t", "¡CÁPSULAS DE REPARACIÓN!", "#5fe08a");
      this.sfx("spawn");
    }
    if (!this.orbDone && t >= ORB_AT) {
      this.orbDone = true;
      this.orb = { x: 0, y: 0, hp: ORB_HP, last: -1 };
      this.ev("t", "¡ORBE MEDALLA!", "#ffd23f");
      this.sfx("spawn");
    }
    if (t >= STORM_AT) {
      if (this.storm === 1) {
        this.ev("t", "¡MUERTE SÚBITA!", "#b06aff");
        this.sfx("storm");
      }
      this.storm = Math.max(STORM_MIN, 1 - ((t - STORM_AT) / STORM_TIME) * (1 - STORM_MIN));
      const dps = STORM_DPS * (1 + (t - STORM_AT) / 25);
      for (const f of this.fighters) {
        if (f.dead) continue;
        const d = Math.hypot(f.x / (ARENA_RX * this.storm), f.y / (ARENA_RY * this.storm));
        if (d > 1) {
          f.stormAcc += dps * dt;
          if (f.stormAcc >= 2) {
            const n = Math.floor(f.stormAcc);
            f.stormAcc -= n;
            this.damage(null, f, n, { pure: true });
          }
        }
      }
    }
    const rise = this.layout.rise;
    if (rise && !this.risen && t >= rise.at - 1.5) {
      this.risen = true;
      this.ev("t", "¡SUBEN LAS COLUMNAS!", "#ffd23f");
      for (const p of rise.pillars)
        this.zone(this.fighters[0]!, {
          kind: "rise", x: p.x, y: p.y, r: p.r, delay: 1.5, dur: 0.1, team: -1,
          onArm: (w) => {
            w.pillars.push({ ...p });
            for (const f of w.fighters) if (!f.dead) w.pushOutPillars(f);
            w.fx("boom", p.x, p.y, p.r + 6, 1);
            w.fx("shake", p.x, p.y, 4, 0);
            w.sfx("slam");
          },
        });
    }
    this.updateLevers(dt);
    for (const c of this.caps) {
      if (!c.on) continue;
      const f = this.fighters.find((f) => !f.dead && dist2(f.x, f.y, c.x, c.y) < 12 * 12);
      if (f) {
        c.on = false;
        this.heal(f, f, CAPSULE_HEAL);
        this.fx("pickup", c.x, c.y, 0, 0);
        this.sfx("heal");
      }
    }
  }

  // ============================================================ palancas
  leversReady() {
    return this.phase === "fight" && this.pt >= LEVER_FIRST && this.leverCd <= 0;
  }

  updateLevers(dt: number) {
    if (this.leverCd > 0) this.leverCd -= dt;
    const ready = this.leversReady();
    for (const l of this.levers) {
      const on = ready ? this.fighters.find((f) => !f.dead && !f.motion?.air && dist2(f.x, f.y, l.x, l.y) < 11 * 11) : undefined;
      if (on) {
        if (l.by !== on) l.prog = Math.max(0, l.prog - 0.3);
        l.by = on;
        l.prog += dt;
        if (l.prog >= LEVER_HOLD) this.pullLever(l, on);
      } else {
        l.prog = Math.max(0, l.prog - dt * 2);
        if (!l.prog) l.by = null;
      }
    }
  }

  /** Golpe (proyectil, cuerpo a cuerpo o explosión) que puede activar una palanca. */
  hitLever(x: number, y: number, r: number, by: Fighter) {
    if (!this.leversReady()) return false;
    const l = this.levers.find((l) => dist2(l.x, l.y - 4, x, y) < (r + 5) ** 2);
    if (!l) return false;
    this.pullLever(l, by);
    return true;
  }

  pullLever(l: Lever, by: Fighter) {
    if (!this.leversReady()) return;
    this.leverCd = LEVER_CD;
    for (const q of this.levers) {
      q.prog = 0;
      q.by = null;
    }
    this.ev("t", this.arenaDef.trapName, "#ff8a2b");
    this.fx("lever", l.x, l.y, by.team, 0);
    this.sfx("lever");
    TRAPS[this.arenaDef.trap](this, by);
  }

  checkRoundEnd() {
    const alive = [0, 1].map((t) => this.fighters.some((f) => f.team === t && !f.dead));
    if (alive[0] && alive[1]) return;
    let win = alive[0] ? 0 : alive[1] ? 1 : -1;
    if (win < 0) {
      // los dos a la vez: gana quien tenga más vida total al caer (empate improbable -> azul)
      win = 0;
    }
    this.score[win]!++;
    this.phase = "end";
    this.pt = ROUND_END_PAUSE;
    this.timeScale = 0.3;
    this.projs = [];
    if (this.score[win]! >= this.wins) {
      this.winner = win;
      this.ev("t", win === 0 ? "¡GANA EL EQUIPO AZUL!" : "¡GANA EL EQUIPO ROJO!", win === 0 ? "#3fd7ff" : "#ff5f6d");
      this.sfx("victory");
    } else {
      this.ev("t", `RONDA PARA ${win === 0 ? "AZUL" : "ROJO"}`, win === 0 ? "#3fd7ff" : "#ff5f6d");
      this.sfx("roundwin");
    }
  }

  // ============================================================ robots
  updateFace(f: Fighter) {
    const { ax, ay } = f.input;
    if (ax || ay) f.face = Math.atan2(ay, ax);
  }

  aimOf(f: Fighter, s: SkillDef): Aim {
    let { ax, ay } = f.input;
    let d = Math.hypot(ax, ay);
    if (d < 0.001) {
      ax = Math.cos(f.face);
      ay = Math.sin(f.face);
      d = 1;
    }
    let dx = ax / d, dy = ay / d;
    let range = s.range;
    if (f.blind > 0) {
      // cegado: desvío aleatorio y un 30% menos de alcance
      const an = Math.atan2(dy, dx) + (this.rng.next() - 0.5) * 0.7;
      dx = Math.cos(an);
      dy = Math.sin(an);
      range *= 0.7;
    }
    const dist = range ? Math.min(d, range) : 0;
    let tx = f.x + dx * dist, ty = f.y + dy * dist;
    [tx, ty] = clampArena(tx, ty, 4);
    return { dx, dy, dist, tx, ty };
  }

  canAct(f: Fighter) {
    return !f.dead && f.stun <= 0 && f.sleep <= 0 && f.fear <= 0 && f.lock <= 0 && f.mist <= 0 && f.spin <= 0 && !f.motion && !f.heldBy;
  }

  canUse(f: Fighter, slot: Slot) {
    const s = f.def.skills[slot];
    if (s.hold) return false;
    if (s.charges) {
      if (!f.ammo[slot] || f.ammoLock > 0) return false;
    } else if (f.cds[slot] > 0) return false;
    if (s.ult && f.energy < ENERGY_MAX) return false;
    if (slot === "r2" && f.overheat > 0) return false;
    if (slot !== "r2" && f.anchor > 0) return false;
    if (slot !== "r2" && f.silence > 0) return false;
    if ((s.aim === "dash" || s.id === "blink" || s.id === "meteor" || s.id === "glint" || s.id === "titanfist") && f.root > 0) return false;
    return true;
  }

  updateFighter(f: Fighter, dt: number) {
    // ---- estados
    const dec = (k: "stun" | "root" | "silence" | "sleep" | "slow" | "haste" | "invuln" | "stealth" | "counter" | "block" | "fear" | "deflect" | "mist" | "spin" | "lock"
      | "overheat" | "ammoLock" | "dmgUp" | "markT" | "anchor" | "catchBuff" | "blind" | "guard" | "selfSlow"
      | "refract" | "daze" | "polT" | "unstop" | "absorbT") => {
      if (f[k] > 0) f[k] = Math.max(0, f[k] - dt);
    };
    dec("stun"); dec("root"); dec("silence"); dec("sleep"); dec("slow"); dec("haste");
    dec("invuln"); dec("stealth"); dec("counter"); dec("block");
    dec("fear"); dec("deflect"); dec("mist"); dec("spin"); dec("lock");
    dec("overheat"); dec("ammoLock"); dec("dmgUp"); dec("markT"); dec("anchor"); dec("catchBuff");
    dec("blind"); dec("guard"); dec("selfSlow"); dec("refract"); dec("daze"); dec("polT"); dec("unstop"); dec("absorbT");
    if (f.polT <= 0) f.pol = 0;
    // agarrado: va encima de quien le lleva
    if (f.heldBy) {
      const g = f.heldBy;
      if (g.dead || g.carry?.e !== f) f.heldBy = null;
      else {
        f.x = g.x + Math.cos(g.face) * 4;
        f.y = g.y + 1;
        f.z = 20;
        f.cast = null;
        f.charge = null;
        f.moving = false;
        return;
      }
    }
    if (f.carry) {
      f.carry.t -= dt;
      const e = f.carry.e;
      if (e.dead || e.heldBy !== f) f.carry = null;
      else if (f.carry.t <= 0) this.throwHeld(f);
    }
    for (const b of f.burns) {
      b.acc += b.dps * Math.min(dt, b.t);
      b.t -= dt;
      if (b.acc >= 2 || (b.t <= 0 && b.acc >= 1)) {
        const n = Math.floor(b.acc);
        b.acc -= n;
        this.damage(b.src, f, n, { dot: true });
        if (f.dead) return;
      }
    }
    f.burns = f.burns.filter((b) => b.t > 0);
    if (f.sticky) {
      const st = f.sticky;
      st.t -= dt;
      // salta a otro robot del mismo equipo que lo toque
      const other = this.fighters.find((o) => o !== f && !o.dead && o.team === f.team && !o.sticky && dist2(o.x, o.y, f.x, f.y) < 14 * 14);
      if (other && st.t > 0.2) {
        f.sticky = null;
        other.sticky = st;
        this.popup(other.x, other.y - 30, "¡SALTA!", "#ff8a2b");
      } else if (st.t <= 0 || f.dead) {
        f.sticky = null;
        st.boom(this, f);
      }
    }
    if (f.def.heat) {
      f.heatIdle += dt;
      // sobrecalentado: el arma se enfría del todo mientras dura el bloqueo
      if (f.overheat > 0) f.heat = (100 * f.overheat) / 1.5;
      else if (f.heatIdle > 0.35) {
        f.heat = Math.max(0, f.heat - 32 * dt);
        f.ramp = 0;
      }
    }
    if (f.shieldT > 0) {
      f.shieldT -= dt;
      if (f.shieldT <= 0) f.shield = 0;
    }
    if (f.comboT > 0) {
      f.comboT -= dt;
      if (f.comboT <= 0) f.combo = 0;
    }
    if (f.flash > 0) f.flash -= dt;
    for (const h of f.hots) {
      const amt = h.hps * Math.min(dt, h.t);
      h.t -= dt;
      h.acc += amt;
      if (h.acc >= 1 || h.t <= 0) {
        this.heal(h.src, f, h.acc, true);
        h.acc = 0;
      }
    }
    f.hots = f.hots.filter((h) => h.t > 0);
    for (const s of SLOTS) {
      if (f.cds[s] <= 0) continue;
      f.cds[s] = Math.max(0, f.cds[s] - dt);
      // las skills con cargas reponen una cada recarga
      const n = f.def.skills[s].charges;
      if (n && f.cds[s] <= 0 && (f.ammo[s] ?? 0) < n) {
        f.ammo[s] = (f.ammo[s] ?? 0) + 1;
        if (f.ammo[s]! < n) f.cds[s] = f.def.skills[s].cd;
      }
    }
    if (this.phase === "fight") f.energy = Math.min(ENERGY_MAX, f.energy + ENERGY_REGEN * dt);

    this.updateFace(f);

    // ---- movimiento forzado (cargas, saltos, empujones)
    const m = f.motion;
    if (m) {
      f.charge = null;
      const k = Math.min(dt, m.t);
      m.t -= dt;
      const nx = f.x + m.vx * k, ny = f.y + m.vy * k;
      const blocked = this.moveTo(f, nx, ny, !m.air);
      f.z = m.air ? Math.sin(Math.PI * (1 - Math.max(0, m.t) / m.total)) * m.h : 0;
      if (m.touch)
        for (const e of this.fighters)
          if (e.team !== f.team && !e.dead && !m.hit.has(e.id) && e.motion?.air !== true && dist2(e.x, e.y, f.x, f.y) < (FIGHTER_R * 2 + 3) ** 2) {
            m.hit.add(e.id);
            if (m.touch(e)) m.t = 0;
          }
      if (blocked && !m.air) {
        if (m.knock && m.slam && m.t > 0.02) {
          const slam = m.slam;
          m.slam = undefined;
          slam();
        }
        m.t = 0;
      }
      f.vx = m.vx;
      f.vy = m.vy;
      f.moving = true;
      if (m.t <= 0) {
        f.motion = null;
        f.z = 0;
        if (m.air) this.pushOutPillars(f);
        m.end?.();
      }
      return;
    }

    // ---- lanzamiento en curso
    if (f.cast) {
      if (f.stun > 0 || f.sleep > 0 || f.fear > 0) f.cast = null;
      else {
        f.cast.t += dt;
        const cs = f.def.skills[f.cast.slot];
        const ch = CHANNELS[cs.id];
        if (cs.holdCast && f.cast.t > 0.25 && !(f.input.b & SLOT_BIT[f.cast.slot])) f.cast = null;
        else if (ch && !ch(this, f, this.aimOf(f, cs), dt)) f.cast = null;
        if (f.cast && f.cast.t >= f.cast.total) {
          const slot = f.cast.slot;
          f.cast = null;
          this.fire(f, slot);
        }
      }
    }

    // ---- skill mantenida (visor): activa mientras el botón esté pulsado
    f.hold = null;
    for (const sl of SLOTS)
      if (f.def.skills[sl].hold && f.input.b & SLOT_BIT[sl] && this.canAct(f) && this.phase === "fight" && !(sl !== "r2" && f.silence > 0)) f.hold = sl;
    f.holdT = f.hold ? f.holdT + dt : 0;

    // ---- carga al soltar (arco): se dispara al soltar el botón
    if (f.charge) {
      const c = f.charge;
      if (!this.canAct(f) || this.phase !== "fight" || (c.slot !== "r2" && f.silence > 0)) f.charge = null;
      else {
        c.t = Math.min(c.max, c.t + dt);
        if (!(f.input.b & SLOT_BIT[c.slot])) {
          f.chargeK = c.t / c.max;
          f.charge = null;
          this.fire(f, c.slot);
        }
      }
    }

    // ---- elegir skill (botones mantenidos + un pequeño búfer para toques cortos)
    const b = f.input.b, pressed = b & ~f.prevB;
    f.prevB = b;
    f.pressed = pressed;
    // agarre: volver a pulsar L2 lanza (los bots lanzan al rato)
    if (f.carry && ((pressed & SLOT_BIT.l2 && f.carry.t < 1.4) || (f.bot && f.carry.t < 1))) this.throwHeld(f);
    for (const s of SLOTS)
      if (s !== "r2" && s !== "l2" && pressed & SLOT_BIT[s]) {
        f.buffer = s;
        f.bufferT = 0.35;
      }
    if (f.bufferT > 0) {
      f.bufferT -= dt;
      if (f.bufferT <= 0) f.buffer = null;
    }
    if (this.phase === "fight" && !f.cast && !f.charge && this.canAct(f)) {
      const order: Slot[] = ["b", "a", "x", "y", "l2", "r2"];
      let use: Slot | null = null;
      if (f.buffer && this.canUse(f, f.buffer)) use = f.buffer;
      else for (const s of order) if (b & SLOT_BIT[s] && this.canUse(f, s)) { use = s; break; }
      if (use) this.startCast(f, use);
    }

    // ---- caminar
    let sp = f.def.speed;
    if (f.stun > 0 || f.sleep > 0 || f.root > 0 || f.lock > 0 || this.phase !== "fight") sp = 0;
    if (f.slow > 0) sp *= 1 - f.slowK;
    if (f.haste > 0) sp *= 1 + f.hasteK;
    if (f.cast) sp *= f.def.skills[f.cast.slot].castMove;
    if (f.charge) sp *= f.def.skills[f.charge.slot].charge!.move;
    if (f.anchor > 0 || f.hold) sp = 0;
    if (f.selfSlow > 0) sp *= 0.85;
    if (f.block > 0) sp *= 0.5;
    if (f.spin > 0) sp *= 0.75;
    let { mx, my } = f.input;
    if (f.daze > 0) {
      mx = -mx;
      my = -my;
    }
    if (f.fear > 0) {
      // huye de quien le ha asustado
      mx = f.x - f.fearX;
      my = f.y - f.fearY;
      const fl = Math.hypot(mx, my) || 1;
      mx /= fl;
      my /= fl;
      sp *= 0.85;
    }
    const l = Math.hypot(mx, my);
    if (l > 1) {
      mx /= l;
      my /= l;
    }
    f.vx = mx * sp;
    f.vy = my * sp;
    f.moving = sp > 0 && l > 0.1;
    if (f.moving) this.moveTo(f, f.x + f.vx * dt, f.y + f.vy * dt, true);
  }

  startCast(f: Fighter, slot: Slot) {
    const s = f.def.skills[slot];
    if (f.buffer === slot) f.buffer = null;
    if (s.charges) {
      f.ammo[slot] = (f.ammo[slot] ?? 1) - 1;
      f.ammoLock = 0.3;
      if (f.cds[slot] <= 0) f.cds[slot] = s.cd;
    } else f.cds[slot] = s.cd;
    if (s.ult) f.energy = 0;
    if (s.id !== "stealth") f.stealth = 0;
    f.chan = { t: 0, target: null };
    if (s.charge) {
      f.charge = { slot, t: f.preCharge * s.charge.max, max: s.charge.max };
      f.preCharge = 0;
    } else if (s.cast > 0) {
      f.cast = { slot, t: 0, total: s.cast };
      if (s.cast >= 0.3) this.sfx("charge");
    } else this.fire(f, slot);
  }

  fire(f: Fighter, slot: Slot) {
    const s = f.def.skills[slot];
    const aim = this.aimOf(f, s);
    f.face = Math.atan2(aim.dy, aim.dx);
    SKILLS[s.id]?.(this, f, aim, s);
  }

  /** Mueve con colisiones; devuelve true si algo lo ha frenado. */
  moveTo(f: Fighter, nx: number, ny: number, pillars: boolean) {
    let blocked = false;
    if (pillars) {
      for (const p of this.pillars) {
        const rr = p.r + FIGHTER_R, dx = nx - p.x, dy = ny - p.y, d2 = dx * dx + dy * dy;
        if (d2 < rr * rr) {
          const d = Math.sqrt(d2) || 1;
          nx = p.x + (dx / d) * rr;
          ny = p.y + (dy / d) * rr;
          blocked = true;
        }
      }
      for (const p of this.props) {
        if (!p.solid || p.dead) continue;
        const [qx, qy] = this.propPoint(p, nx, ny);
        const rr = p.r + FIGHTER_R, dx = nx - qx, dy = ny - qy, d2 = dx * dx + dy * dy;
        if (d2 < rr * rr) {
          const d = Math.sqrt(d2) || 1;
          nx = qx + (dx / d) * rr;
          ny = qy + (dy / d) * rr;
          blocked = true;
        }
      }
    }
    const [cx, cy] = clampArena(nx, ny, FIGHTER_R);
    if (cx !== nx || cy !== ny) blocked = true;
    f.x = cx;
    f.y = cy;
    return blocked;
  }

  pushOutPillars(f: Fighter) {
    this.moveTo(f, f.x, f.y, true);
  }

  /** Los robots no se atraviesan entre sí (empuje suave). */
  separate() {
    const L = this.fighters.filter((f) => !f.dead && !f.motion?.air && !f.heldBy && !f.carry);
    for (let i = 0; i < L.length; i++)
      for (let j = i + 1; j < L.length; j++) {
        const a = L[i]!, b = L[j]!;
        const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy, rr = FIGHTER_R * 2;
        if (d2 < rr * rr && d2 > 0.0001) {
          const d = Math.sqrt(d2), push = (rr - d) / 2;
          this.moveTo(a, a.x - (dx / d) * push, a.y - (dy / d) * push, true);
          this.moveTo(b, b.x + (dx / d) * push, b.y + (dy / d) * push, true);
        }
      }
  }

  // ============================================================ combate
  targetable(t: Fighter) {
    return !t.dead && !(t.motion?.air) && t.invuln <= 0;
  }

  damage(src: Fighter | null, t: Fighter, amt: number, o: { from?: [number, number]; pure?: boolean; melee?: boolean; dot?: boolean } = {}): boolean {
    if (t.dead || amt <= 0) return false;
    if (!o.pure) {
      if (t.motion?.air || t.invuln > 0) return false;
      // contraataque (Siete vidas)
      if (t.counter > 0 && src) {
        t.counter = 0;
        t.invuln = 0.5;
        this.fx("counter", t.x, t.y, 0, 0);
        this.sfx("counter");
        this.popup(t.x, t.y - 20, "¡CONTRA!", "#ff9ed2");
        if (dist2(src.x, src.y, t.x, t.y) < 160 * 160) this.stun(src, 1);
        return false;
      }
      // caparazón: bloquea lo que viene de frente
      if (t.block > 0) {
        const [fx, fy] = o.from ?? (src ? [src.x, src.y] : [t.x, t.y]);
        const a = Math.atan2(fy - t.y, fx - t.x);
        if (Math.abs(angleDiff(t.face, a)) < 1.25) {
          if (!t.bonus) this.popup(t.x, t.y - 20, "¡BLOQUEO!", "#ffd23f");
          t.bonus = 12;
          this.fx("block", t.x + Math.cos(t.face) * 8, t.y + Math.sin(t.face) * 8, t.face, 0);
          this.sfx("block");
          return false;
        }
      }
    }
    if (src && src.dmgUp > 0) amt *= 1 + src.dmgUpK;
    if (src && t.markT > 0 && t.markBy === src) amt *= 1.3;
    if (t.guard > 0) {
      t.absorbed += amt * t.guardK;
      amt *= 1 - t.guardK;
    }
    amt = Math.round(amt);
    let left = amt;
    if (t.shield > 0) {
      const ab = Math.min(t.shield, left);
      t.shield -= ab;
      left -= ab;
      if (t.shield <= 0) t.shieldT = 0;
    }
    t.hp -= left;
    t.flash = 0.12;
    if (t.sleep > 0) t.sleep = 0;
    if (src && src !== t) {
      t.lastHitBy = src;
      src.stats.dmg += amt;
      src.energy = Math.min(ENERGY_MAX, src.energy + amt * ENERGY_PER_DMG);
    }
    if (!o.dot || amt >= 3) this.ev("n", Math.round(t.x), Math.round(t.y - 18), amt, left < amt && !left ? SHIELD_POPUP : DMG_POPUP);
    if (!o.dot) this.sfx(o.melee ? "melee" : "hit");
    if (t.hp <= 0) this.kill(t);
    return true;
  }

  kill(t: Fighter) {
    t.hp = 0;
    t.dead = true;
    t.cast = null;
    t.motion = null;
    const k = t.lastHitBy;
    if (k && k.team !== t.team) k.stats.kos++;
    this.ev("k", t.id);
    this.fx("ko", t.x, t.y, 0, 0);
    this.sfx("ko");
  }

  heal(src: Fighter, t: Fighter, amt: number, quiet = false) {
    if (t.dead || amt <= 0) return;
    const real = Math.min(amt, t.maxHp - t.hp);
    t.hp += real;
    if (src !== t || real > 0) {
      src.stats.heal += real;
      src.energy = Math.min(ENERGY_MAX, src.energy + real * ENERGY_PER_DMG);
    }
    if (real >= 1 && (!quiet || real >= 3)) this.ev("n", Math.round(t.x), Math.round(t.y - 18), Math.round(real), HEAL_POPUP);
  }

  hot(src: Fighter, t: Fighter, hps: number, dur: number) {
    t.hots.push({ hps, t: dur, src, acc: 0 });
  }

  addShield(t: Fighter, amt: number, dur: number) {
    t.shield = Math.max(t.shield, amt);
    t.shieldT = Math.max(t.shieldT, dur);
    this.ev("n", Math.round(t.x), Math.round(t.y - 18), amt, SHIELD_POPUP);
  }

  /** ¿Estamos en el pulso de la música de la arena? (±90 ms) */
  onBeat() {
    if (this.phase !== "fight") return false;
    const k = (this.pt * this.arenaDef.bpm) / 60;
    return Math.abs(k - Math.round(k)) * (60 / this.arenaDef.bpm) < 0.09;
  }

  /**
   * Rayo instantáneo que avanza en pasos de 3 px: rebota `bounces` veces en
   * columnas, objetos y borde (los espejos lo reflejan siempre) y para en el
   * primer enemigo. Devuelve el enemigo alcanzado (o null) y si había rebotado.
   */
  beam(f: Fighter, x: number, y: number, dx: number, dy: number, len: number, bounces: number, fxKind = "beam") {
    let sx = x, sy = y, bounced = false;
    for (let d = 0; d < len; d += 3) {
      x += dx * 3;
      y += dy * 3;
      for (const e of this.fighters)
        if (e.team !== f.team && this.targetable(e) && e.refract <= 0 && dist2(e.x, e.y - 4, x, y) < (FIGHTER_R + 2) ** 2) {
          this.fx(fxKind, sx, sy - 6, x, y - 6);
          return { e, bounced, x, y };
        }
      if (this.orb && dist2(this.orb.x, this.orb.y - 4, x, y) < 81) {
        this.hitOrb(f, 8);
        break;
      }
      const n = this.wallNormal({ x, y, r: 2, ghost: false, orbDmg: 6 } as Proj);
      if (n) {
        if (bounces <= 0 && !this.hitProp?.reflect) break;
        if (!this.hitProp?.reflect) bounces--;
        this.fx(fxKind, sx, sy - 6, x, y - 6);
        x -= dx * 3;
        y -= dy * 3;
        const dot = dx * n[0] + dy * n[1];
        dx -= 2 * dot * n[0];
        dy -= 2 * dot * n[1];
        sx = x;
        sy = y;
        bounced = true;
      }
    }
    this.fx(fxKind, sx, sy - 6, x, y - 6);
    return { e: null, bounced, x, y };
  }

  /** Golemax suelta (lanza) a quien lleva agarrado hacia su mira. */
  throwHeld(f: Fighter) {
    const c = f.carry;
    if (!c) return;
    f.carry = null;
    const e = c.e;
    e.heldBy = null;
    e.z = 0;
    if (e.dead) return;
    this.moveTo(e, f.x, f.y, true);
    let a = this.aimOf(f, f.def.skills.l2);
    if (f.bot) {
      // los bots lo estampan contra la columna más cercana o, si no hay, hacia el borde
      const p = this.pillars.reduce<Pillar | null>((m, q) => (dist2(q.x, q.y, f.x, f.y) < (m ? dist2(m.x, m.y, f.x, f.y) : 130 * 130) ? q : m), null);
      const tx = p ? p.x : f.x * 2, ty = p ? p.y : f.y * 2, l = Math.hypot(tx - f.x, ty - f.y) || 1;
      a = { ...a, dx: (tx - f.x) / l, dy: (ty - f.y) / l };
    }
    this.sfx("swing");
    this.damage(f, e, 14, { from: [f.x, f.y], melee: true });
    this.knock(e, a.dx, a.dy, 120, 0.4, () => {
      this.fx("boom", e.x, e.y - 4, 14, 0);
      this.fx("shake", e.x, e.y, 5, 0);
      this.sfx("slam");
      this.stun(e, 1.2);
    });
  }

  /** Quema: daño por segundo (no se acumula con la misma fuente; renueva). */
  burn(t: Fighter, src: Fighter | null, dps: number, dur: number) {
    if (t.dead) return;
    const b = t.burns.find((q) => q.src === src);
    if (b) {
      b.t = Math.max(b.t, dur);
      b.dps = Math.max(b.dps, dps);
    } else t.burns.push({ dps, t: dur, src, acc: 0 });
  }

  blindFor(t: Fighter, d: number) {
    if (!this.ccable(t)) return;
    t.blind = Math.max(t.blind, d);
    this.popup(t.x, t.y - 26, "¡CEGADO!", "#fff6c8");
  }

  /** Sube el calor; a 100 se sobrecalienta y bloquea el básico. */
  addHeat(f: Fighter, amt: number) {
    f.heatIdle = 0;
    if (f.overheat > 0) return;
    f.heat = Math.min(100, f.heat + amt);
    if (f.heat >= 100) {
      f.overheat = 1.5;
      f.heat = 100;
      f.ramp = 0;
      this.popup(f.x, f.y - 26, "¡SOBRECALENTADO!", "#ff8a2b");
      this.sfx("overheat");
    }
  }

  /** ¿Hay columna, objeto sólido o borde a menos de `m` px? */
  nearWall(x: number, y: number, m: number) {
    if (Math.hypot(x / (ARENA_RX - m), y / (ARENA_RY - m)) > 1) return true;
    if (this.pillars.some((p) => dist2(p.x, p.y, x, y) < (p.r + m) ** 2)) return true;
    return this.props.some((p) => {
      if (!p.solid || p.dead) return false;
      const [qx, qy] = this.propPoint(p, x, y);
      return dist2(qx, qy, x, y) < (p.r + m) ** 2;
    });
  }

  stun(t: Fighter, d: number) {
    if (!this.ccable(t)) return;
    t.stun = Math.max(t.stun, d);
    t.cast = null;
    this.popup(t.x, t.y - 26, "ATURDIDO", "#ffd23f");
  }
  root(t: Fighter, d: number) {
    if (!this.ccable(t)) return;
    t.root = Math.max(t.root, d);
    this.popup(t.x, t.y - 26, "INMÓVIL", "#c9cfdc");
  }
  silence(t: Fighter, d: number) {
    if (!this.ccable(t)) return;
    t.silence = Math.max(t.silence, d);
    t.cast = null;
    this.popup(t.x, t.y - 26, "SILENCIO", "#b06aff");
  }
  sleepFor(t: Fighter, d: number) {
    if (!this.ccable(t)) return;
    t.sleep = Math.max(t.sleep, d);
    t.cast = null;
    this.popup(t.x, t.y - 26, "Zzz", "#e6d0ff");
  }
  slowFor(t: Fighter, k: number, d: number) {
    if (!this.ccable(t)) return;
    if (t.slow <= 0 || k >= t.slowK) t.slowK = k;
    t.slow = Math.max(t.slow, d);
  }
  ccable(t: Fighter) {
    return !t.dead && t.invuln <= 0 && !t.motion?.air && t.unstop <= 0 && !t.heldBy;
  }

  /** Empuja a un robot (interrumpe lo que esté lanzando). */
  knock(t: Fighter, dx: number, dy: number, dist: number, dur = 0.22, slam?: () => void) {
    if (!this.ccable(t) || t.anchor > 0) return;
    const l = Math.hypot(dx, dy) || 1;
    t.cast = null;
    t.motion = { vx: (dx / l) * (dist / dur), vy: (dy / l) * (dist / dur), t: dur, total: dur, air: false, knock: true, h: 0, hit: new Set(), slam };
  }

  /** Por los aires: sube y baja sin desplazarse; ni actúa ni se le puede tocar. */
  launchUp(t: Fighter, dur: number, h = 26) {
    if (!this.ccable(t)) return;
    t.cast = null;
    t.motion = { vx: 0, vy: 0, t: dur, total: dur, air: true, knock: true, h, hit: new Set() };
    this.popup(t.x, t.y - 26, "¡POR LOS AIRES!", "#7fe3ff");
  }

  fearFor(t: Fighter, src: Fighter, d: number) {
    if (!this.ccable(t)) return;
    t.fear = Math.max(t.fear, d);
    t.fearX = src.x;
    t.fearY = src.y;
    t.cast = null;
    this.popup(t.x, t.y - 26, "¡MIEDO!", "#b06aff");
  }

  /** Movimiento propio (carga, salto, rodar). */
  dash(f: Fighter, dx: number, dy: number, dist: number, dur: number, o: Partial<Pick<Motion, "air" | "h" | "touch" | "end">> = {}) {
    const l = Math.hypot(dx, dy) || 1;
    f.motion = { vx: (dx / l) * (dist / dur), vy: (dy / l) * (dist / dur), t: dur, total: dur, air: !!o.air, knock: false, h: o.h ?? 0, hit: new Set(), touch: o.touch, end: o.end };
  }

  enemiesIn(team: number, x: number, y: number, r: number) {
    return this.fighters.filter((e) => e.team !== team && this.targetable(e) && dist2(e.x, e.y, x, y) < (r + FIGHTER_R) ** 2);
  }
  alliesIn(team: number, x: number, y: number, r: number) {
    return this.fighters.filter((e) => e.team === team && !e.dead && dist2(e.x, e.y, x, y) < (r + FIGHTER_R) ** 2);
  }

  /** Golpe cuerpo a cuerpo en arco. Devuelve los enemigos alcanzados. */
  melee(f: Fighter, range: number, arc: number, dmg: number, onHit?: (e: Fighter) => void) {
    const hits: Fighter[] = [];
    for (const e of this.fighters) {
      if (e.team === f.team || e.dead) continue;
      const dx = e.x - f.x, dy = e.y - f.y;
      if (dx * dx + dy * dy > (range + FIGHTER_R) ** 2) continue;
      if (Math.abs(angleDiff(f.face, Math.atan2(dy, dx))) > arc / 2 + 0.1) continue;
      if (this.damage(f, e, dmg, { melee: true })) {
        hits.push(e);
        onHit?.(e);
      }
    }
    if (this.orb && dist2(this.orb.x, this.orb.y, f.x, f.y) < (range + 9) ** 2 && Math.abs(angleDiff(f.face, Math.atan2(this.orb.y - f.y, this.orb.x - f.x))) < arc / 2 + 0.3)
      this.hitOrb(f, dmg);
    for (const p of this.props) {
      if (p.dead) continue;
      const [qx, qy] = this.propPoint(p, f.x, f.y);
      if (dist2(qx, qy, f.x, f.y) < (range + p.r) ** 2 && Math.abs(angleDiff(f.face, Math.atan2(qy - f.y, qx - f.x))) < arc / 2 + 0.3) this.hurtProp(p, dmg);
    }
    for (const l of this.levers)
      if (dist2(l.x, l.y, f.x, f.y) < (range + 5) ** 2 && Math.abs(angleDiff(f.face, Math.atan2(l.y - f.y, l.x - f.x))) < arc / 2 + 0.3) this.hitLever(l.x, l.y - 4, 1, f);
    return hits;
  }

  // ============================================================ objetos
  addProp(owner: Fighter | null, o: { kind: Prop["kind"]; x: number; y: number; r: number; hp: number; a?: number; len?: number; t?: number; solid?: boolean; stopsProj?: boolean; reflect?: boolean; team?: number; onBreak?: Prop["onBreak"] }) {
    const p: Prop = {
      id: this.nextId++, kind: o.kind, owner, team: o.team ?? owner?.team ?? -1, x: o.x, y: o.y, r: o.r, a: o.a ?? 0, len: o.len ?? 0,
      hp: o.hp, maxHp: o.hp, t: o.t ?? Infinity, solid: o.solid ?? true, stopsProj: o.stopsProj ?? true, reflect: o.reflect, onBreak: o.onBreak, dead: false,
    };
    this.props.push(p);
    if (p.solid) for (const f of this.fighters) if (!f.dead && !f.motion?.air) this.moveTo(f, f.x, f.y, true);
    return p;
  }

  /** Punto del objeto más cercano a (x, y): el centro, o el punto del segmento si es alargado. */
  propPoint(p: Prop, x: number, y: number): [number, number] {
    if (!p.len) return [p.x, p.y];
    const c = Math.cos(p.a) * p.len / 2, s = Math.sin(p.a) * p.len / 2;
    const ax = p.x - c, ay = p.y - s, dx = c * 2, dy = s * 2;
    const k = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1);
    return [ax + dx * k, ay + dy * k];
  }

  hurtProp(p: Prop, amt: number) {
    if (p.dead || amt <= 0) return;
    p.hp -= amt;
    this.fx("spark", p.x, p.y - 6, 0, 0);
    if (p.hp <= 0) this.breakProp(p);
  }

  breakProp(p: Prop) {
    if (p.dead) return;
    p.dead = true;
    p.onBreak?.(this, p);
  }

  /** Daño en área a objetos y palancas (explosiones). */
  blastProps(x: number, y: number, r: number, dmg: number, by: Fighter | null) {
    for (const p of this.props) {
      if (p.dead) continue;
      const [qx, qy] = this.propPoint(p, x, y);
      if (dist2(qx, qy, x, y) < (r + p.r) ** 2) this.hurtProp(p, dmg);
    }
    if (by) this.hitLever(x, y, r, by);
  }

  updateProps(dt: number) {
    for (const p of this.props) {
      if (p.dead || p.t === Infinity) continue;
      p.t -= dt;
      if (p.t <= 0) this.breakProp(p);
    }
    this.props = this.props.filter((p) => !p.dead);
  }

  hitOrb(f: Fighter, dmg: number) {
    const o = this.orb;
    if (!o) return;
    o.hp -= dmg;
    o.last = f.team;
    this.ev("n", o.x, o.y - 16, Math.round(dmg), DMG_POPUP);
    this.sfx("orbhit");
    if (o.hp <= 0) {
      this.orb = null;
      for (const a of this.fighters)
        if (a.team === f.team && !a.dead) {
          this.heal(a, a, ORB_HEAL);
          a.energy = Math.min(ENERGY_MAX, a.energy + ORB_ENERGY);
        }
      this.fx("orbbreak", o.x, o.y, f.team, 0);
      this.sfx("orbbreak");
      this.ev("t", `ORBE PARA ${f.team ? "ROJO" : "AZUL"}`, f.team ? "#ff5f6d" : "#3fd7ff");
    }
  }

  // ============================================================ proyectiles
  proj(f: Fighter, o: {
    kind: Proj["kind"]; dx: number; dy: number; speed: number; range: number; r?: number; dmg?: number; allies?: boolean; pierce?: boolean;
    onHit: Proj["onHit"]; onEnd?: Proj["onEnd"]; from?: [number, number];
    ret?: boolean; onCatch?: (w: World, p: Proj) => void; bounces?: number; ghost?: boolean;
    fuse?: number; fric?: number; onWall?: Proj["onWall"];
  }) {
    const [sx, sy] = o.from ?? [f.x + o.dx * 6, f.y + o.dy * 6];
    const p: Proj = {
      id: this.nextId++, owner: f, team: f.team, kind: o.kind, x: sx, y: sy, vx: o.dx * o.speed, vy: o.dy * o.speed, r: o.r ?? 3,
      dist: o.range, orbDmg: o.dmg ?? 0, allies: !!o.allies, pierce: !!o.pierce, hit: new Set(), onHit: o.onHit, onEnd: o.onEnd,
      ret: o.ret ? { back: false, t: 0, onCatch: o.onCatch } : undefined, bounces: o.bounces ?? 0, ghost: !!o.ghost, carry: [],
      fuse: o.fuse ?? 0, fric: o.fric ?? 0, onWall: o.onWall, dead: false,
    };
    this.projs.push(p);
    return p;
  }

  updateProjs(dt: number) {
    for (const p of this.projs) {
      if (p.dead) continue;
      if (p.fric) {
        const k = Math.exp(-p.fric * dt);
        p.vx *= k;
        p.vy *= k;
      }
      if (p.fuse) {
        p.fuse -= dt;
        if (p.fuse <= 0) {
          p.dead = true;
          p.onEnd?.(this, p);
          continue;
        }
      }
      const sp = Math.hypot(p.vx, p.vy);
      const steps = Math.max(1, Math.ceil((sp * dt) / 5));
      const sdt = dt / steps;
      for (let k = 0; k < steps && !p.dead; k++) {
        // bumerán de vuelta: persigue al dueño y, si llega, lo atrapa
        const back = p.ret?.back;
        if (back) {
          const o = p.owner, dx = o.x - p.x, dy = o.y - 4 - p.y, d = Math.hypot(dx, dy);
          p.ret!.t += sdt;
          if (o.dead || p.ret!.t > 3) {
            p.dead = true;
            break;
          }
          if (d < 10) {
            p.dead = true;
            p.ret!.onCatch?.(this, p);
            break;
          }
          p.vx = (dx / d) * sp;
          p.vy = (dy / d) * sp;
        }
        p.x += p.vx * sdt;
        p.y += p.vy * sdt;
        p.dist -= sp * sdt;
        // arrastra a los que ha enganchado (sólo a la ida)
        for (const e of p.carry) if (!e.dead && this.ccable(e) && e.anchor <= 0) this.moveTo(e, p.x, p.y + 4, true);
        // robots
        for (const e of this.fighters) {
          if (e.dead || p.hit.has(e.id) || e === p.owner) continue;
          if (e.team === p.team && !p.allies) continue;
          if (e.motion?.air || (e.refract > 0 && e.team !== p.team)) continue;
          if (dist2(e.x, e.y - 4, p.x, p.y) > (FIGHTER_R + p.r + 1) ** 2) continue;
          if (e.deflect > 0 && e.team !== p.team && Math.abs(angleDiff(e.face, Math.atan2(p.y - e.y, p.x - e.x))) < 1.35) {
            // guardia: el proyectil vuelve contra quien lo lanzó
            p.vx = -p.vx;
            p.vy = -p.vy;
            p.team = e.team;
            p.owner = e;
            p.hit = new Set([e.id]);
            p.carry = [];
            p.dist = Math.max(p.dist, 160);
            this.fx("deflect", p.x, p.y, Math.atan2(p.vy, p.vx), 0);
            this.sfx("block");
            this.popup(e.x, e.y - 22, "¡DEVUELTO!", "#7fe3ff");
            break;
          }
          if (e.absorbT > 0 && e.team !== p.team) {
            p.dead = true;
            e.shield = Math.min(30, e.shield + 6);
            e.shieldT = Math.max(e.shieldT, 3);
            e.energy = Math.min(ENERGY_MAX, e.energy + 5);
            this.fx("sap", e.x, e.y, 0, 0);
            this.sfx("orbhit");
            break;
          }
          p.hit.add(e.id);
          p.onHit(this, e, p);
          if (!p.pierce && !p.ret) {
            p.dead = true;
            break;
          }
        }
        if (p.dead) break;
        if (back) continue; // a la vuelta atraviesa todo lo demás
        // orbe
        if (this.orb && dist2(this.orb.x, this.orb.y - 4, p.x, p.y) < (9 + p.r) ** 2) {
          if (p.orbDmg) this.hitOrb(p.owner, p.orbDmg);
          if (this.turnBack(p)) continue;
          p.dead = true;
          p.onEnd?.(this, p);
          break;
        }
        // columnas, objetos y borde: rebotan; cúpulas, muros de fuego y palancas: frenan
        const n = this.wallNormal(p);
        let stop = false;
        if (!n && !p.ghost && this.hitLever(p.x, p.y, p.r, p.owner)) stop = true;
        if (!n && !stop && !p.ghost)
          for (const z of this.zones)
            if (z.dome && z.armed && z.team !== p.team) {
              const now = dist2(p.x, p.y, z.x, z.y), before = dist2(p.x - p.vx * sdt, p.y - p.vy * sdt, z.x, z.y);
              if (now <= z.r * z.r && before > z.r * z.r) {
                stop = true;
                this.fx("spark", p.x, p.y, 0, 0);
                this.sfx("orbhit");
                break;
              }
            }
        if (!n && !stop && !p.ghost)
          for (const z of this.zones)
            if (z.wall && z.armed && z.team !== p.team) {
              const c = Math.cos(z.a + Math.PI / 2) * z.len / 2, s = Math.sin(z.a + Math.PI / 2) * z.len / 2;
              if (segDist2(p.x, p.y, z.x - c, z.y - s, z.x + c, z.y + s) < (p.r + 3) ** 2) {
                stop = true;
                this.fx("spark", p.x, p.y, 0, 0);
                break;
              }
            }
        if (n && (p.bounces > 0 || this.hitProp?.reflect)) {
          // rebote: refleja la velocidad respecto a la normal y vuelve a poder golpear
          p.x -= p.vx * sdt;
          p.y -= p.vy * sdt;
          const dot = p.vx * n[0] + p.vy * n[1];
          if (dot < 0) {
            p.vx -= 2 * dot * n[0];
            p.vy -= 2 * dot * n[1];
          }
          if (!this.hitProp?.reflect) p.bounces--;
          p.hit.clear();
          this.fx("spark", p.x, p.y, 0, 0);
          this.sfx("ricochet");
          continue;
        }
        if (n || stop || (p.dist <= 0 && !p.fuse)) {
          if (n) p.onWall?.(this, p);
          if (this.turnBack(p)) continue;
          p.dead = true;
          if (p.onEnd) p.onEnd(this, p);
          else this.fx("spark", p.x, p.y, 0, 0);
        }
      }
    }
    this.projs = this.projs.filter((p) => !p.dead);
  }

  /** Bumerán: al chocar o agotar el alcance da la vuelta (suelta lo que arrastra). */
  turnBack(p: Proj) {
    if (!p.ret || p.ret.back) return false;
    p.ret.back = true;
    p.hit.clear();
    p.carry = [];
    return true;
  }

  /** Normal de la superficie con la que choca el proyectil (columna, objeto o borde), o null. */
  wallNormal(p: Proj): [number, number] | null {
    this.hitProp = null;
    const unit = (x: number, y: number): [number, number] => {
      const l = Math.hypot(x, y) || 1;
      return [x / l, y / l];
    };
    for (const q of this.pillars) if (dist2(q.x, q.y, p.x, p.y) < (q.r + p.r - 1) ** 2) return unit(p.x - q.x, p.y - q.y);
    if (!p.ghost)
      for (const q of this.props) {
        if (q.dead || !q.stopsProj) continue;
        const [qx, qy] = this.propPoint(q, p.x, p.y);
        if (dist2(qx, qy, p.x, p.y) < (q.r + p.r) ** 2) {
          this.hitProp = q;
          if (!q.reflect) this.hurtProp(q, p.orbDmg || 6);
          return unit(p.x - qx, p.y - qy);
        }
      }
    if ((p.x / ARENA_RX) ** 2 + (p.y / ARENA_RY) ** 2 > 1.02) return unit(-p.x / ARENA_RX ** 2, -p.y / ARENA_RY ** 2);
    return null;
  }

  // ============================================================ zonas
  zone(f: Fighter, o: {
    kind: Zone["kind"]; x: number; y: number; r: number; delay: number; dur: number; a?: number; len?: number; tickEvery?: number; wall?: boolean;
    dome?: boolean; follow?: Fighter; team?: number; onArm?: Zone["onArm"]; onTick?: Zone["onTick"]; onEnd?: Zone["onEnd"];
  }) {
    const z: Zone = {
      id: this.nextId++, owner: f, team: o.team ?? f.team, kind: o.kind, x: o.x, y: o.y, r: o.r, a: o.a ?? 0, len: o.len ?? 0,
      delay: o.delay, dur: o.dur, t: 0, armed: o.delay <= 0, tickEvery: o.tickEvery ?? 0, tickT: 0, wall: !!o.wall, hit: new Set(),
      onArm: o.onArm, onTick: o.onTick, onEnd: o.onEnd, follow: o.follow, dome: !!o.dome, dead: false,
    };
    this.zones.push(z);
    if (z.armed) z.onArm?.(this, z);
    return z;
  }

  updateZones(dt: number) {
    for (const z of this.zones) {
      z.t += dt;
      if (z.follow) {
        if (z.follow.dead) {
          z.dead = true;
          continue;
        }
        z.x = z.follow.x;
        z.y = z.follow.y;
      }
      if (!z.armed) {
        if (z.t >= z.delay) {
          z.armed = true;
          z.t = 0;
          z.onArm?.(this, z);
        }
        continue;
      }
      if (z.onTick) {
        if (z.tickEvery <= 0) z.onTick(this, z);
        else {
          z.tickT -= dt;
          if (z.tickT <= 0) {
            z.tickT += z.tickEvery;
            z.onTick(this, z);
          }
        }
      }
      if (z.t >= z.dur) {
        z.dead = true;
        z.onEnd?.(this, z);
      }
    }
    this.zones = this.zones.filter((z) => !z.dead);
  }

  // ============================================================ eventos
  ev(...e: Ev) {
    this.events.push(e);
  }
  sfx(name: string) {
    this.events.push(["s", name]);
  }
  fx(kind: string, x: number, y: number, a: number, b: number) {
    this.events.push(["f", kind, Math.round(x), Math.round(y), Math.round(a * 100) / 100, Math.round(b * 100) / 100]);
  }
  popup(x: number, y: number, text: string, col: string) {
    this.events.push(["n", Math.round(x), Math.round(y), text, TEXT_POPUP, col]);
  }

  /** Línea de visión libre de pilares. */
  clearLine(x1: number, y1: number, x2: number, y2: number, pad = 2) {
    return !this.pillars.some((p) => segDist2(p.x, p.y, x1, y1, x2, y2) < (p.r + pad) ** 2)
      && !this.props.some((p) => p.stopsProj && !p.len && segDist2(p.x, p.y, x1, y1, x2, y2) < (p.r + pad) ** 2);
  }

  // ============================================================ instantánea
  snapshot(): Snap {
    const f: FSnap[] = this.fighters.map((a) => {
      let st = 0;
      if (a.stun > 0) st |= ST.stun;
      if (a.root > 0) st |= ST.root;
      if (a.slow > 0) st |= ST.slow;
      if (a.silence > 0) st |= ST.silence;
      if (a.shield > 0) st |= ST.shield;
      if (a.motion?.air) st |= ST.air;
      if (a.stealth > 0) st |= ST.stealth;
      if (a.sleep > 0) st |= ST.sleep;
      if (a.counter > 0) st |= ST.counter;
      if (a.block > 0) st |= ST.block;
      if (a.haste > 0) st |= ST.haste;
      if (a.dead) st |= ST.dead;
      if (a.invuln > 0) st |= ST.invuln;
      if (a.fear > 0) st |= ST.fear;
      if (a.deflect > 0) st |= ST.deflect;
      if (a.mist > 0) st |= ST.mist;
      if (a.spin > 0) st |= ST.spin;
      if (a.hots.length) st |= ST.hot;
      if (a.anchor > 0) st |= ST.anchor;
      if (a.markT > 0) st |= ST.mark;
      if (a.dmgUp > 0) st |= ST.empower;
      if (a.blind > 0) st |= ST.blind;
      if (a.burns.length) st |= ST.burn;
      if (a.hold) st |= ST.scope;
      if (a.guard > 0) st |= ST.guard;
      if (a.sticky) st |= ST.sticky;
      if (a.refract > 0) st |= ST.refract;
      if (a.daze > 0) st |= ST.daze;
      if (a.pol > 0) st |= ST.polP;
      if (a.pol < 0) st |= ST.polM;
      if (a.heldBy) st |= ST.held;
      const cs = a.cast ? SLOTS.indexOf(a.cast.slot) : a.charge ? SLOTS.indexOf(a.charge.slot) : -1;
      const cp = a.cast ? Math.round((a.cast.t / a.cast.total) * 100) : a.charge ? Math.round((a.charge.t / a.charge.max) * 100) : 0;
      const snap: FSnap = {
        id: a.id, name: a.name, champ: a.champ, team: a.team, human: a.human,
        x: Math.round(a.x * 10) / 10, y: Math.round(a.y * 10) / 10, z: Math.round(a.z), face: Math.round(a.face * 100), mv: a.moving,
        hp: Math.ceil(a.hp), maxHp: a.maxHp, sh: Math.ceil(a.shield), en: Math.floor(a.energy),
        cd: SLOTS.map((s) => Math.ceil(a.cds[s] * 10)),
        cs, cp, st, fl: a.flash > 0 ? 1 : 0, dm: a.stats.dmg, hl: Math.round(a.stats.heal), ko: a.stats.kos,
      };
      if (a.def.heat) snap.ht = Math.round(a.heat) + (a.overheat > 0 ? 1000 : 0);
      if (SLOTS.some((sl) => a.def.skills[sl].charges)) snap.am = SLOTS.map((sl) => (a.def.skills[sl].charges ? a.ammo[sl] ?? 0 : -1));
      return snap;
    });
    const pr: number[] = [];
    for (const p of this.projs) pr.push(p.id, PROJ_KINDS.indexOf(p.kind), Math.round(p.x), Math.round(p.y), Math.round(Math.atan2(p.vy, p.vx) * 100), p.team);
    const zn: number[] = [];
    for (const z of this.zones)
      zn.push(z.id, ZONE_KINDS.indexOf(z.kind), Math.round(z.x), Math.round(z.y), Math.round(z.r), Math.round(z.a * 100),
        Math.round(z.armed ? (z.t / z.dur) * 100 : (z.t / z.delay) * 100) + (z.armed ? 1000 : 0), z.team, Math.round(z.len));
    const pl: number[] = [];
    for (const p of this.pillars) pl.push(p.x, p.y, p.r);
    const pp: number[] = [];
    for (const p of this.props)
      pp.push(p.id, PROP_KINDS.indexOf(p.kind), Math.round(p.x), Math.round(p.y), Math.round(p.r), Math.round(p.a * 100),
        Math.max(1, Math.round((p.hp / p.maxHp) * 100)), p.team, Math.round(p.len));
    const lv: number[] = [];
    const ready = this.leversReady();
    for (const l of this.levers) lv.push(l.x, l.y, ready ? 0 : this.phase === "fight" && this.pt >= LEVER_FIRST ? 1 : 2, Math.round((l.prog / LEVER_HOLD) * 100));
    const ev = this.events;
    this.events = [];
    return {
      phase: this.phase, pt: Math.round(this.pt * 100) / 100, round: this.round, score: [...this.score], wins: this.wins, arena: this.arena,
      f, pr, zn, pl, pp, lv, orb: this.orb ? [this.orb.x, this.orb.y, Math.max(0, Math.ceil(this.orb.hp))] : null,
      caps: this.caps.flatMap((c) => (c.on ? [c.x, c.y] : [])),
      storm: Math.round(this.storm * 1000) / 1000, winner: this.winner, ev,
    };
  }
}

export { clampArena };
