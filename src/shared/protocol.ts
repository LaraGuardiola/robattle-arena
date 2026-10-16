// Mensajes cliente/servidor e instantáneas de la partida (lo que dibuja el cliente).

import type { ChampId, Difficulty } from "./data";

/** Entrada de un jugador: movimiento, punto de mira (relativo al robot) y botones mantenidos. */
export interface Input {
  mx: number;
  my: number;
  ax: number;
  ay: number;
  /** máscara de SLOT_BIT */
  b: number;
}
export const NO_INPUT: Input = { mx: 0, my: 0, ax: 1, ay: 0, b: 0 };

/** Bits de estado en FSnap.st */
export const ST = {
  stun: 1, root: 2, slow: 4, silence: 8, shield: 16, air: 32, stealth: 64, sleep: 128,
  counter: 256, block: 512, haste: 1024, dead: 2048, invuln: 4096, hot: 8192,
  fear: 16384, deflect: 32768, mist: 65536, spin: 131072,
} as const;

export interface FSnap {
  id: number;
  name: string;
  champ: ChampId;
  team: number;
  human: boolean;
  x: number;
  y: number;
  /** altura (saltos) */
  z: number;
  /** ángulo de mira * 100 */
  face: number;
  /** ¿se está moviendo? (animación de piernas) */
  mv: boolean;
  hp: number;
  maxHp: number;
  sh: number;
  en: number;
  /** recarga restante por slot (décimas de segundo) */
  cd: number[];
  /** lanzando: índice de slot y progreso 0..100 */
  cs: number;
  cp: number;
  st: number;
  fl: number;
  /** estadísticas: daño, curación, KOs */
  dm: number;
  hl: number;
  ko: number;
}

/** Proyectil: [id, tipo, x, y, ángulo*100, equipo] */
export const PR_STRIDE = 6;
/** Zona: [id, tipo, x, y, r, ángulo*100, progreso 0..100, equipo, largo] */
export const ZN_STRIDE = 9;

export const PROJ_KINDS = ["bullet", "snipe", "shellx", "fireball", "seed", "seedHeal", "pollen", "hook", "disable", "spark",
  "wave", "pellet", "ball", "bat", "zap", "shuriken", "kunai"] as const;
export const ZONE_KINDS = ["firestorm", "trap", "firewall", "bloom", "garden", "meteor", "puff", "ray",
  "lob", "turret", "dome", "smoke", "bloodmoon", "singularity", "whirl", "dance"] as const;

/**
 * Eventos (efectos y sonidos) del último paso:
 *  ["n", x, y, valor, tipo]           número flotante (0 daño, 1 curación, 2 escudo, 3 texto)
 *  ["s", sonido]                       efecto de sonido
 *  ["f", efecto, x, y, a, b]           efecto visual (ver renderer)
 *  ["k", id]                           robot fuera de combate
 *  ["t", texto, color]                 cartel en el centro
 */
export type Ev = (string | number)[];

export type Phase = "count" | "fight" | "end" | "over";

export interface Snap {
  phase: Phase;
  /** tiempo de la fase (cuenta atrás o tiempo de ronda) */
  pt: number;
  round: number;
  score: [number, number];
  wins: number;
  arena: number;
  f: FSnap[];
  pr: number[];
  zn: number[];
  orb: [number, number, number] | null;
  caps: number[];
  /** tamaño de la arena por la muerte súbita (1 = entera) */
  storm: number;
  winner: number;
  ev: Ev[];
}

// ================================================================ sala
export interface SeatInfo {
  /** 0 = libre; >0 id del cliente humano; <0 bot */
  owner: number;
  name: string;
  champ: ChampId;
  ready: boolean;
  diff: Difficulty;
}

export type ClientMsg =
  | { t: "hello"; name: string }
  | { t: "create" }
  | { t: "join"; code: string }
  | { t: "leave" }
  | { t: "seat"; team: number; slot: number }
  | { t: "champ"; champ: ChampId }
  | { t: "ready"; v: boolean }
  | { t: "bot"; team: number; slot: number; diff?: Difficulty; champ?: ChampId }
  | { t: "mode"; size: 1 | 2; wins: number; arena: number }
  | { t: "start" }
  | { t: "in"; i: Input };

export type ServerMsg =
  | { t: "welcome"; id: number }
  | { t: "room"; code: string; host: number; seats: SeatInfo[][]; size: 1 | 2; wins: number; arena: number; inGame: boolean }
  | { t: "start"; you: number }
  | { t: "snap"; s: Snap }
  | { t: "end" }
  | { t: "left" }
  | { t: "err"; msg: string };
