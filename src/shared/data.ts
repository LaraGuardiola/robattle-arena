// Datos de equilibrio de Robattle Arena: arena, rondas y campeones.
// Todos los números que importan para el balance viven aquí; el
// comportamiento de cada skill está en skills.ts.

// ================================================================ arena
/** Semiejes de la elipse jugable (px de mundo). */
export const ARENA_RX = 290;
export const ARENA_RY = 165;
export const FIGHTER_R = 6;

export interface Pillar { x: number; y: number; r: number }
export const PILLARS: Pillar[] = [
  { x: -115, y: -78, r: 11 },
  { x: 115, y: -78, r: 11 },
  { x: -115, y: 78, r: 11 },
  { x: 115, y: 78, r: 11 },
];

/** Puntos de salida por equipo (1v1 usa el primero). */
export const SPAWNS: [number, number][][] = [
  [[-235, 0], [-225, 45]],
  [[235, 0], [225, -45]],
];
export const SPAWNS_2V2: [number, number][][] = [
  [[-235, -38], [-235, 38]],
  [[235, -38], [235, 38]],
];

// ================================================================ rondas
export const ROUND_COUNTDOWN = 3;
export const ROUND_END_PAUSE = 3;
/** Cápsulas de reparación en los lados de arriba y abajo. */
export const CAPSULE_AT = 18;
export const CAPSULE_HEAL = 25;
export const CAPSULE_POS: [number, number][] = [[0, -128], [0, 128]];
/** Orbe central: quien lo rompe cura y carga energía a su equipo. */
export const ORB_AT = 40;
export const ORB_HP = 60;
export const ORB_HEAL = 20;
export const ORB_ENERGY = 25;
/** Muerte súbita: la arena se cierra. */
export const STORM_AT = 80;
export const STORM_TIME = 30;
export const STORM_MIN = 0.32;
export const STORM_DPS = 7;

export const ENERGY_MAX = 100;
/** energía por punto de daño hecho / curado */
export const ENERGY_PER_DMG = 0.55;
export const ENERGY_REGEN = 1.2;

export const TEAM_COLORS = ["#3fd7ff", "#ff5f6d"];
export const TEAM_DARK = ["#1a6f90", "#90202e"];
export const TEAM_NAMES = ["Azul", "Rojo"];

// ================================================================ skills
export type Slot = "r2" | "l2" | "a" | "x" | "y" | "b";
export const SLOTS: Slot[] = ["r2", "l2", "a", "x", "y", "b"];
export const SLOT_BIT: Record<Slot, number> = { r2: 1, l2: 2, a: 4, x: 8, y: 16, b: 32 };
export const KEY_LABEL: Record<Slot, string> = { r2: "LMB", l2: "RMB", a: "ESP", x: "Q", y: "E", b: "R" };
export const PAD_LABEL: Record<Slot, [string, string]> = {
  r2: ["RT", "R2"], l2: ["LT", "L2"], a: ["A", "✕"], x: ["X", "▢"], y: ["Y", "△"], b: ["B", "○"],
};

/** Cómo apunta la skill (para el indicador en el suelo y la IA). */
export type AimKind = "line" | "cone" | "ground" | "self" | "dash" | "ally";
/** Pista para la IA: cuándo usarla. */
export type AiUse = "poke" | "melee" | "gap" | "escape" | "defend" | "heal" | "cc" | "zone" | "ult";

export interface SkillDef {
  id: string;
  name: string;
  desc: string;
  icon: string;
  cd: number;
  /** tiempo de lanzamiento (s); durante él el robot va más lento */
  cast: number;
  /** multiplicador de velocidad mientras lanza (0 = quieto) */
  castMove: number;
  range: number;
  aim: AimKind;
  /** ancho del indicador (línea) o radio (suelo / cono) */
  size: number;
  ai: AiUse;
  /** cuesta toda la energía */
  ult?: boolean;
}

export type ChampId = "beetlix" | "coltron" | "merlix" | "florak" | "nekobot";

export interface ChampDef {
  id: ChampId;
  name: string;
  role: string;
  desc: string;
  hp: number;
  speed: number;
  /** distancia a la que le gusta pelear (IA) */
  prefer: number;
  color: string;
  skills: Record<Slot, SkillDef>;
}

const S = (d: Omit<SkillDef, "castMove" | "size"> & { castMove?: number; size?: number }): SkillDef => ({ castMove: 0.45, size: 4, ...d });

export const CHAMPS: Record<ChampId, ChampDef> = {
  // ------------------------------------------------------------ cuerpo a cuerpo
  beetlix: {
    id: "beetlix",
    name: "Beetlix",
    role: "Luchador",
    desc: "Escarabajo blindado. Aguanta en primera línea, bloquea balas con su escudo y cae del cielo para aturdir.",
    hp: 185,
    speed: 58,
    prefer: 18,
    color: "#ffc928",
    skills: {
      r2: S({ id: "horn", name: "Cuernazo", desc: "Golpe en arco delante de ti: 12 de daño. Cada tercer golpe seguido hace +8.", icon: "blade", cd: 0.5, cast: 0.14, castMove: 0.6, range: 24, aim: "cone", size: 24, ai: "melee" }),
      l2: S({ id: "quake", name: "Golpe sísmico", desc: "Cargas y golpeas el suelo: cono de 20 de daño que ralentiza un 40% durante 1,5 s.", icon: "quake", cd: 5, cast: 0.5, castMove: 0.3, range: 46, aim: "cone", size: 46, ai: "melee" }),
      a: S({ id: "charge", name: "Embestida", desc: "Cargas hacia delante. El primer enemigo recibe 10 de daño y sale despedido.", icon: "legs", cd: 9, cast: 0, range: 95, aim: "dash", size: 8, ai: "gap" }),
      x: S({ id: "shield", name: "Caparazón", desc: "1,2 s bloqueando todo lo que te llega de frente. Si bloqueas algo, tu siguiente Cuernazo hace +12.", icon: "blindaje", cd: 10, cast: 0, range: 0, aim: "self", ai: "defend" }),
      y: S({ id: "warcry", name: "Grito de guerra", desc: "Onda a tu alrededor: 8 de daño, ralentiza un 50% 1,5 s y te da 18 de escudo.", icon: "shout", cd: 12, cast: 0.15, range: 52, aim: "self", size: 52, ai: "cc" }),
      b: S({ id: "meteor", name: "Meteoro escarabajo", desc: "DEFINITIVA. Saltas a la zona marcada: al caer, 28 de daño y aturdes 1,2 s.", icon: "meteorb", cd: 1, cast: 0.1, range: 150, aim: "ground", size: 44, ai: "ult", ult: true }),
    },
  },
  // ------------------------------------------------------------ tirador
  coltron: {
    id: "coltron",
    name: "Coltron",
    role: "Tirador",
    desc: "Pistolero del desierto. Mucho daño a distancia; si lo pillan cerca, salta y pone trampas.",
    hp: 175,
    speed: 60,
    prefer: 170,
    color: "#c0392b",
    skills: {
      r2: S({ id: "revolver", name: "Revólver", desc: "Disparo rápido de 11 de daño. Mantén para seguir disparando.", icon: "revolver", cd: 0.5, cast: 0.15, castMove: 0.7, range: 235, aim: "line", size: 3, ai: "poke" }),
      l2: S({ id: "snipe", name: "Tiro certero", desc: "Apuntas 0,9 s y disparas una bala muy rápida: 26 de daño (+8 si está lejos).", icon: "laser", cd: 5, cast: 0.9, castMove: 0.25, range: 340, aim: "line", size: 4, ai: "poke" }),
      a: S({ id: "vault", name: "Salto de pólvora", desc: "Saltas por encima de todo hacia donde apuntas. Nadie te puede tocar en el aire.", icon: "boot", cd: 9, cast: 0, range: 105, aim: "dash", size: 8, ai: "escape" }),
      x: S({ id: "trap", name: "Cepo", desc: "Lanzas un cepo al suelo. Quien lo pise recibe 10 de daño y queda inmovilizado 1,4 s.", icon: "mines", cd: 10, cast: 0.2, range: 120, aim: "ground", size: 10, ai: "zone" }),
      y: S({ id: "disable", name: "Disparo aturdidor", desc: "Bala corta: 8 de daño, empuja y silencia 1,2 s (no puede usar skills).", icon: "shotgun", cd: 10, cast: 0.15, range: 125, aim: "line", size: 5, ai: "cc" }),
      b: S({ id: "shells", name: "Ráfaga explosiva", desc: "DEFINITIVA. Tres balas explosivas en abanico: 22 de daño cada explosión.", icon: "cannon", cd: 1, cast: 0.35, castMove: 0.2, range: 240, aim: "cone", size: 30, ai: "ult", ult: true }),
    },
  },
  // ------------------------------------------------------------ mago
  merlix: {
    id: "merlix",
    name: "Merlix",
    role: "Mago",
    desc: "Hechicero de fuego. Controla la zona con tormentas y muros; su rayo definitivo arrasa en línea.",
    hp: 165,
    speed: 60,
    prefer: 150,
    color: "#6a4cc8",
    skills: {
      r2: S({ id: "fireball", name: "Bola de fuego", desc: "Proyectil lento de 14 de daño. Mantén para seguir lanzando.", icon: "flamer", cd: 0.62, cast: 0.28, castMove: 0.6, range: 220, aim: "line", size: 5, ai: "poke" }),
      l2: S({ id: "firestorm", name: "Tormenta ígnea", desc: "Marca una zona que estalla a los 0,6 s: 20 de daño (+10 en el centro).", icon: "storm", cd: 4, cast: 0.25, range: 175, aim: "ground", size: 26, ai: "zone" }),
      a: S({ id: "blink", name: "Vuelo ardiente", desc: "Te teletransportas al punto marcado dejando una llamarada de 8 de daño.", icon: "staff", cd: 10, cast: 0.15, castMove: 0, range: 115, aim: "ground", size: 8, ai: "escape" }),
      x: S({ id: "firewall", name: "Muro de fuego", desc: "Levantas un muro 3 s que frena las balas enemigas y quema (y ralentiza) al cruzarlo.", icon: "barrier", cd: 13, cast: 0.2, range: 130, aim: "ground", size: 36, ai: "defend" }),
      y: S({ id: "fist", name: "Puño fundido", desc: "Explosión corta delante de ti: 12 de daño y empuja lejos.", icon: "fist", cd: 8, cast: 0.12, range: 52, aim: "cone", size: 52, ai: "escape" }),
      b: S({ id: "ray", name: "Rayo infernal", desc: "DEFINITIVA. Canalizas 0,6 s y disparas un rayo enorme: 40 de daño en línea.", icon: "laser", cd: 1, cast: 0.6, castMove: 0, range: 280, aim: "line", size: 12, ai: "ult", ult: true }),
    },
  },
  // ------------------------------------------------------------ soporte
  florak: {
    id: "florak",
    name: "Florak",
    role: "Soporte",
    desc: "Druida de madera. Cura, protege con savia y duerme a los enemigos. En 2v2 es oro.",
    hp: 175,
    speed: 61,
    prefer: 165,
    color: "#5fd06a",
    skills: {
      r2: S({ id: "seed", name: "Semilla", desc: "Proyectil rápido: 11 de daño a enemigos (y te cura 4) o 11 de curación a aliados.", icon: "thorns", cd: 0.55, cast: 0.2, castMove: 0.65, range: 205, aim: "line", size: 4, ai: "poke" }),
      l2: S({ id: "bloom", name: "Flor sanadora", desc: "Una flor brota en el punto marcado y a los 0,5 s cura 30 a los aliados cercanos (tú incluido).", icon: "heal", cd: 5, cast: 0.3, range: 145, aim: "ground", size: 30, ai: "heal" }),
      a: S({ id: "roll", name: "Raíz rodante", desc: "Ruedas rápido hacia donde apuntas.", icon: "log", cd: 7, cast: 0, range: 75, aim: "dash", size: 8, ai: "escape" }),
      x: S({ id: "sap", name: "Burbuja de savia", desc: "Escudo de 30 durante 3 s para el aliado más cercano al punto marcado (o para ti).", icon: "bubble", cd: 12, cast: 0.1, range: 170, aim: "ally", size: 14, ai: "defend" }),
      y: S({ id: "pollen", name: "Polen somnífero", desc: "Nube que duerme al enemigo 2 s. Se despierta si recibe daño.", icon: "sleep", cd: 12, cast: 0.25, range: 175, aim: "line", size: 7, ai: "cc" }),
      b: S({ id: "garden", name: "Jardín ancestral", desc: "DEFINITIVA. Un jardín de 4 s: los aliados se curan 14/s y los enemigos van un 35% más lentos.", icon: "flower", cd: 1, cast: 0.3, range: 110, aim: "ground", size: 56, ai: "ult", ult: true }),
    },
  },
  // ------------------------------------------------------------ asesina
  nekobot: {
    id: "nekobot",
    name: "Nekobot",
    role: "Asesina",
    desc: "Gata robot rapidísima. Se vuelve invisible, atrapa con su garfio y castiga a los despistados.",
    hp: 175,
    speed: 64,
    prefer: 16,
    color: "#ff9ed2",
    skills: {
      r2: S({ id: "claw", name: "Zarpazo", desc: "Arañazo rápido de 11 de daño. Mantén para encadenar.", icon: "scythe", cd: 0.33, cast: 0.1, castMove: 0.75, range: 22, aim: "cone", size: 22, ai: "melee" }),
      l2: S({ id: "hook", name: "Garfio", desc: "Lanzas un garfio: 12 de daño y atrae al enemigo hacia ti.", icon: "hook", cd: 7, cast: 0.25, range: 165, aim: "line", size: 4, ai: "gap" }),
      a: S({ id: "pounce", name: "Salto felino", desc: "Saltas lejos; al caer haces 10 de daño alrededor.", icon: "legs", cd: 8, cast: 0, range: 115, aim: "dash", size: 8, ai: "gap" }),
      x: S({ id: "stealth", name: "Sigilo", desc: "Invisible 2,5 s y un 30% más rápida. Tu siguiente Zarpazo hace +20.", icon: "eye", cd: 14, cast: 0, range: 0, aim: "self", ai: "gap" }),
      y: S({ id: "counter", name: "Siete vidas", desc: "0,8 s en guardia: si te golpean, no recibes daño y aturdes 1 s al atacante.", icon: "paw", cd: 11, cast: 0, range: 0, aim: "self", ai: "defend" }),
      b: S({ id: "frenzy", name: "Frenesí", desc: "DEFINITIVA. Atraviesas a los enemigos en línea: 34 de daño y ralentiza un 60% 1,5 s.", icon: "claws", cd: 1, cast: 0.1, range: 150, aim: "dash", size: 10, ai: "ult", ult: true }),
    },
  },
};
export const CHAMP_IDS = Object.keys(CHAMPS) as ChampId[];

export type Difficulty = 0 | 1 | 2;
export const DIFF_NAMES = ["Fácil", "Normal", "Difícil"];

/** Arenas: temática de suelo (tiles.ts) y música. */
export const ARENAS = [
  { name: "Parque Robattle", theme: 0, track: "park" },
  { name: "Fábrica Omega", theme: 2, track: "factory" },
  { name: "Ciudad Neón", theme: 3, track: "neon" },
];
