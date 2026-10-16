// Datos de equilibrio de Robattle Arena: arena, rondas y campeones.
// Todos los números que importan para el balance viven aquí; el
// comportamiento de cada skill está en skills.ts.

// ================================================================ arena
/** Semiejes de la elipse jugable (px de mundo). */
export const ARENA_RX = 290;
export const ARENA_RY = 165;
export const FIGHTER_R = 6;

/** Mete un punto dentro de la elipse de la arena (con margen). */
export function clampArena(x: number, y: number, m: number): [number, number] {
  const rx = ARENA_RX - m, ry = ARENA_RY - m;
  const d = Math.hypot(x / rx, y / ry);
  if (d <= 1) return [x, y];
  return [x / d, y / d];
}

export interface Pillar { x: number; y: number; r: number }

/**
 * Disposición de columnas de una arena. Todas son simétricas respecto a x = 0
 * (un equipo por lado). `crates`: cajas rompibles; `rise`: columnas que suben
 * del suelo a mitad de ronda.
 */
export interface Layout {
  name: string;
  pillars: Pillar[];
  crates?: [number, number][];
  rise?: { at: number; pillars: Pillar[] };
}
const sym = (x: number, y: number, r: number): Pillar[] => (x ? [{ x: -x, y, r }, { x, y, r }] : [{ x, y, r }]);
export const LAYOUTS: Record<string, Layout> = {
  classic: { name: "Clásico", pillars: [...sym(115, -78, 11), ...sym(115, 78, 11)] },
  diamond: { name: "Rombo", pillars: [...sym(0, -95, 13), ...sym(0, 95, 13), ...sym(150, 0, 11)] },
  halls: { name: "Pasillos", pillars: [...sym(70, -55, 9), ...sym(70, 0, 9), ...sym(70, 55, 9)] },
  crown: {
    name: "Corona",
    pillars: [0, 60, 120, 180, 240, 300].map((d) => ({ x: Math.round(Math.cos((d * Math.PI) / 180) * 90), y: Math.round(Math.sin((d * Math.PI) / 180) * 80), r: 8 })),
  },
  scrap: { name: "Desguace", pillars: [...sym(110, -70, 11), ...sym(110, 70, 11)], crates: [[-40, -110], [40, -110], [-40, 110], [40, 110], [-175, 0], [175, 0]] },
  core: { name: "Núcleo", pillars: [], rise: { at: 30, pillars: sym(80, 0, 11) } },
};
export type LayoutId = keyof typeof LAYOUTS;
export const CRATE_HP = 40;
export const CRATE_R = 8;

/** Palancas: una por lado. Activan la trampa de la arena (daña a todos por igual). */
export const LEVERS: [number, number][] = [[-178, 108], [178, 108]];
/** segundos de ronda antes de que se puedan usar */
export const LEVER_FIRST = 10;
/** recarga compartida tras activar cualquiera */
export const LEVER_CD = 25;
/** segundos encima para activarla (también se activa golpeándola) */
export const LEVER_HOLD = 1;
export type TrapKind = "geyser" | "press" | "laser" | "magnet" | "pulse";

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
  /** se carga mientras se mantiene y se dispara al soltar (s de carga máxima y velocidad al cargar) */
  charge?: { max: number; move: number };
  /** cargas: la recarga repone una cada vez */
  charges?: number;
  /** movilidad hacia atrás (contraria a la mira): la IA apunta al enemigo para huir */
  back?: boolean;
}

export type ChampId = "beetlix" | "coltron" | "merlix" | "florak" | "nekobot" | "sawkuwa" | "tanker" | "vladbot" | "nexus" | "shinobot"
  | "arquibot" | "gatlinga" | "boomera";

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
  /** usa calor: el básico lo sube y a 100 se bloquea un rato */
  heat?: boolean;
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
    hp: 180,
    speed: 61,
    prefer: 170,
    color: "#c0392b",
    skills: {
      r2: S({ id: "revolver", name: "Revólver", desc: "Disparo rápido de 12 de daño. Mantén para seguir disparando.", icon: "revolver", cd: 0.5, cast: 0.15, castMove: 0.7, range: 235, aim: "line", size: 3, ai: "poke" }),
      l2: S({ id: "snipe", name: "Tiro certero", desc: "Apuntas 0,9 s y disparas una bala muy rápida: 26 de daño (+8 si está lejos).", icon: "laser", cd: 4, cast: 0.9, castMove: 0.25, range: 340, aim: "line", size: 4, ai: "poke" }),
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
    hp: 185,
    speed: 61,
    prefer: 165,
    color: "#5fd06a",
    skills: {
      r2: S({ id: "seed", name: "Semilla", desc: "Proyectil rápido: 11 de daño a enemigos (y te cura 5) o 11 de curación a aliados.", icon: "thorns", cd: 0.55, cast: 0.2, castMove: 0.65, range: 205, aim: "line", size: 4, ai: "poke" }),
      l2: S({ id: "bloom", name: "Flor sanadora", desc: "Una flor brota en el punto marcado y a los 0,5 s cura 30 a los aliados cercanos (tú incluido).", icon: "heal", cd: 4.5, cast: 0.3, range: 145, aim: "ground", size: 30, ai: "heal" }),
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
      r2: S({ id: "claw", name: "Zarpazo", desc: "Arañazo rápido de 10 de daño. Mantén para encadenar.", icon: "scythe", cd: 0.33, cast: 0.1, castMove: 0.75, range: 22, aim: "cone", size: 22, ai: "melee" }),
      l2: S({ id: "hook", name: "Garfio", desc: "Lanzas un garfio: 12 de daño y atrae al enemigo hacia ti.", icon: "hook", cd: 7, cast: 0.25, range: 165, aim: "line", size: 4, ai: "gap" }),
      a: S({ id: "pounce", name: "Salto felino", desc: "Saltas lejos; al caer haces 10 de daño alrededor.", icon: "legs", cd: 8, cast: 0, range: 115, aim: "dash", size: 8, ai: "gap" }),
      x: S({ id: "stealth", name: "Sigilo", desc: "Invisible 2,5 s y un 30% más rápida. Tu siguiente Zarpazo hace +20.", icon: "eye", cd: 14, cast: 0, range: 0, aim: "self", ai: "gap" }),
      y: S({ id: "counter", name: "Siete vidas", desc: "0,8 s en guardia: si te golpean, no recibes daño y aturdes 1 s al atacante.", icon: "paw", cd: 11, cast: 0, range: 0, aim: "self", ai: "defend" }),
      b: S({ id: "frenzy", name: "Frenesí", desc: "DEFINITIVA. Atraviesas a los enemigos en línea: 34 de daño y ralentiza un 60% 1,5 s.", icon: "claws", cd: 1, cast: 0.1, range: 150, aim: "dash", size: 10, ai: "ult", ult: true }),
    },
  },
  // ------------------------------------------------------------ espadachín
  sawkuwa: {
    id: "sawkuwa",
    name: "Sawkuwa",
    role: "Espadachín",
    desc: "Ciervo volante con espada de energía. Duelista que devuelve las balas y lanza a los enemigos por encima de su cabeza.",
    hp: 185,
    speed: 63,
    prefer: 20,
    color: "#8a7bff",
    skills: {
      r2: S({ id: "twinslash", name: "Tajo doble", desc: "Corte rápido en arco: 12 de daño. Alterna los dos filos: mantén para encadenar.", icon: "blade", cd: 0.42, cast: 0.1, castMove: 0.7, range: 25, aim: "cone", size: 25, ai: "melee" }),
      l2: S({ id: "crescent", name: "Corte lunar", desc: "Lanzas una onda creciente que atraviesa a todos: 18 de daño y ralentiza un 25% 1 s.", icon: "crescent", cd: 5, cast: 0.3, castMove: 0.4, range: 200, aim: "line", size: 10, ai: "poke" }),
      a: S({ id: "phase", name: "Paso fantasma", desc: "Te deslizas atravesando enemigos (8 de daño a cada uno). No te pueden tocar mientras.", icon: "ghost", cd: 8, cast: 0, range: 90, aim: "dash", size: 8, ai: "gap" }),
      x: S({ id: "deflect", name: "Guardia espejo", desc: "1 s en guardia: los proyectiles que te lleguen de frente vuelven contra quien los lanzó.", icon: "deflect", cd: 11, cast: 0, range: 0, aim: "self", ai: "defend" }),
      y: S({ id: "pincer", name: "Pinza", desc: "Atrapas al enemigo de delante y lo lanzas a tu espalda: 12 de daño y lo aturdes 0,6 s.", icon: "pincer", cd: 9, cast: 0.15, range: 32, aim: "cone", size: 32, ai: "melee" }),
      b: S({ id: "whirl", name: "Mil cortes", desc: "DEFINITIVA. Giras 1,6 s como un torbellino de espadas: 8 de daño cada 0,2 s a tu alrededor.", icon: "whirl", cd: 1, cast: 0, range: 34, aim: "self", size: 34, ai: "ult", ult: true }),
    },
  },
  // ------------------------------------------------------------ artillero
  tanker: {
    id: "tanker",
    name: "Tanker",
    role: "Artillero",
    desc: "Tanque lento y durísimo. Bombardea de lejos y empotra a sus enemigos contra los muros.",
    hp: 215,
    speed: 55,
    prefer: 125,
    color: "#5fd06a",
    skills: {
      r2: S({ id: "minigun", name: "Ametralladora", desc: "Ráfaga de balas cortas: 5 de daño cada una, con algo de dispersión. Mantén para no parar.", icon: "minigun", cd: 0.2, cast: 0.05, castMove: 0.55, range: 165, aim: "line", size: 2, ai: "poke" }),
      l2: S({ id: "mortar", name: "Obús", desc: "Disparo en parábola al punto marcado: cae a los 0,9 s y hace 26 de daño en área.", icon: "cannon", cd: 6, cast: 0.35, castMove: 0.3, range: 260, aim: "ground", size: 24, ai: "zone" }),
      a: S({ id: "treads", name: "Orugas turbo", desc: "Acelerón que arrolla: 6 de daño y aparta a los enemigos que pillas.", icon: "tread", cd: 9, cast: 0, range: 85, aim: "dash", size: 10, ai: "escape" }),
      x: S({ id: "armor", name: "Blindaje reactivo", desc: "Escudo de 40 durante 3 s.", icon: "armor", cd: 12, cast: 0, range: 0, aim: "self", ai: "defend" }),
      y: S({ id: "cannonball", name: "Bala de cañón", desc: "Bala pesada: 14 de daño y empuja lejos. Si lo empotras contra un muro o un pilar: +10 y aturdido 1,2 s.", icon: "ball", cd: 10, cast: 0.3, castMove: 0.3, range: 175, aim: "line", size: 6, ai: "cc" }),
      b: S({ id: "barrage", name: "Bombardeo", desc: "DEFINITIVA. Seis obuses llueven sobre la zona marcada: 18 de daño cada uno.", icon: "missile", cd: 1, cast: 0.3, castMove: 0.2, range: 240, aim: "ground", size: 48, ai: "ult", ult: true }),
    },
  },
  // ------------------------------------------------------------ vampiro
  vladbot: {
    id: "vladbot",
    name: "Vladbot",
    role: "Vampiro",
    desc: "Conde de la noche. Vive de la vida que roba: drena, se vuelve niebla y aterroriza con la mirada.",
    hp: 155,
    speed: 61,
    prefer: 95,
    color: "#c02a4a",
    skills: {
      r2: S({ id: "batbite", name: "Murciélago", desc: "Lanzas un murciélago: 10 de daño y te cura 3.", icon: "bat1", cd: 0.55, cast: 0.2, castMove: 0.65, range: 175, aim: "line", size: 4, ai: "poke" }),
      l2: S({ id: "drain", name: "Drenar", desc: "Canalizas 1,2 s un hilo de sangre al enemigo apuntado: 4 de daño cada 0,2 s y te curas lo mismo.", icon: "vampiro", cd: 6, cast: 1.2, castMove: 0.35, range: 130, aim: "line", size: 3, ai: "poke" }),
      a: S({ id: "mist", name: "Forma de niebla", desc: "1 s convertido en niebla: nadie te puede tocar y vas un 60% más rápido, pero no atacas.", icon: "mist", cd: 11, cast: 0, range: 0, aim: "self", ai: "escape" }),
      x: S({ id: "swarm", name: "Enjambre", desc: "Cinco murciélagos en abanico: 6 de daño cada uno, ralentizan un 25% y te curan 2.", icon: "bats", cd: 9, cast: 0.15, range: 150, aim: "cone", size: 30, ai: "cc" }),
      y: S({ id: "hypno", name: "Mirada hipnótica", desc: "Los enemigos delante de ti huyen aterrados durante 1,3 s.", icon: "hypno", cd: 12, cast: 0.25, range: 75, aim: "cone", size: 75, ai: "cc" }),
      b: S({ id: "bloodmoon", name: "Luna de sangre", desc: "DEFINITIVA. Zona de 3,5 s: los enemigos dentro pierden 8 de vida por segundo y tú te la quedas.", icon: "moon", cd: 1, cast: 0.3, range: 140, aim: "ground", size: 58, ai: "ult", ult: true }),
    },
  },
  // ------------------------------------------------------------ tecnomante
  nexus: {
    id: "nexus",
    name: "Nexus",
    role: "Tecnomante",
    desc: "Ingeniera de drones. Controla el campo con torretas, cúpulas que frenan las balas y una singularidad que lo atrae todo.",
    hp: 160,
    speed: 60,
    prefer: 160,
    color: "#3fd7ff",
    skills: {
      r2: S({ id: "zap", name: "Descarga", desc: "Rayo de energía muy rápido: 8 de daño.", icon: "zapper", cd: 0.45, cast: 0.15, castMove: 0.65, range: 210, aim: "line", size: 2, ai: "poke" }),
      l2: S({ id: "turret", name: "Torreta", desc: "Despliegas una torreta 6 s que dispara sola al enemigo más cercano (5 de daño). Sólo una a la vez.", icon: "turret", cd: 11, cast: 0.25, range: 120, aim: "ground", size: 10, ai: "zone" }),
      a: S({ id: "jet", name: "Propulsores", desc: "Impulso rápido hacia donde apuntas y vas un 25% más rápida durante 1,5 s.", icon: "jet", cd: 8, cast: 0, range: 95, aim: "dash", size: 8, ai: "escape" }),
      x: S({ id: "dome", name: "Cúpula de energía", desc: "Cúpula de 3 s a tu alrededor: ningún proyectil enemigo puede entrar.", icon: "dome", cd: 14, cast: 0.1, range: 0, aim: "self", size: 36, ai: "defend" }),
      y: S({ id: "chain", name: "Rayo en cadena", desc: "Descarga que salta entre enemigos: 14 de daño al primero, 10 al siguiente, y ralentiza un 30%.", icon: "chain", cd: 9, cast: 0.2, range: 145, aim: "line", size: 4, ai: "cc" }),
      b: S({ id: "singularity", name: "Singularidad", desc: "DEFINITIVA. Un agujero negro atrae a los enemigos 2,2 s y luego estalla: 24 de daño.", icon: "blackhole", cd: 1, cast: 0.3, range: 175, aim: "ground", size: 55, ai: "ult", ult: true }),
    },
  },
  // ------------------------------------------------------------ ninja
  shinobot: {
    id: "shinobot",
    name: "Shinobot",
    role: "Ninja",
    desc: "Sombra metálica. Hostiga con shurikens, aparece a la espalda de su presa y desaparece entre humo.",
    hp: 155,
    speed: 63,
    prefer: 110,
    color: "#ff3b4e",
    skills: {
      r2: S({ id: "shuriken", name: "Shuriken", desc: "Estrella giratoria: 9 de daño. Mantén para seguir lanzando.", icon: "shuriken", cd: 0.42, cast: 0.12, castMove: 0.75, range: 200, aim: "line", size: 4, ai: "poke" }),
      l2: S({ id: "kunais", name: "Abanico de kunais", desc: "Tres kunais en abanico: 9 de daño cada uno.", icon: "kunai", cd: 4, cast: 0.3, castMove: 0.4, range: 190, aim: "cone", size: 24, ai: "poke" }),
      a: S({ id: "kawarimi", name: "Sustitución", desc: "Desapareces y reapareces un poco más allá; en tu lugar queda un tronco.", icon: "twins", cd: 9, cast: 0, range: 90, aim: "dash", size: 8, ai: "escape" }),
      x: S({ id: "mark", name: "Kunai marcado", desc: "Kunai: 10 de daño, inmoviliza 0,6 s y te teletransporta a la espalda del enemigo.", icon: "mark", cd: 10, cast: 0.2, range: 180, aim: "line", size: 4, ai: "gap" }),
      y: S({ id: "smoke", name: "Bomba de humo", desc: "Nube de 3,5 s: los aliados dentro son invisibles y los enemigos van un 30% más lentos.", icon: "smoke", cd: 13, cast: 0, range: 0, aim: "self", size: 40, ai: "defend" }),
      b: S({ id: "shadowdance", name: "Danza de las sombras", desc: "DEFINITIVA. Saltas de enemigo en enemigo 1 s: 4 tajos de 13 de daño apareciendo a su espalda. Intocable.", icon: "shadow", cd: 1, cast: 0.1, range: 160, aim: "self", size: 160, ai: "ult", ult: true }),
    },
  },
  // ------------------------------------------------------------ arquera
  arquibot: {
    id: "arquibot",
    name: "Arquibot",
    role: "Arquera",
    desc: "Cervatilla de madera y cobre con un arco de energía. Tensa para dar en el blanco de lejos y clava a sus presas contra las columnas.",
    hp: 170,
    speed: 60,
    prefer: 185,
    color: "#c87a3a",
    skills: {
      r2: S({ id: "arrow", name: "Flecha cargada", desc: "Mantén para tensar el arco (vas a la mitad de velocidad) y suelta: de 7 a 21 de daño según la carga (1 s). Tensada del todo, atraviesa al primer enemigo.", icon: "bow", cd: 0.25, cast: 0, range: 290, aim: "line", size: 3, ai: "poke", charge: { max: 1, move: 0.5 } }),
      l2: S({ id: "rain", name: "Lluvia de flechas", desc: "Marca una zona que a los 0,5 s recibe 1,5 s de flechas: 4 de daño cada 0,25 s y frena un 20%.", icon: "rain", cd: 8, cast: 0.3, range: 220, aim: "ground", size: 34, ai: "zone" }),
      a: S({ id: "flip", name: "Voltereta", desc: "Saltas hacia atrás (lejos de donde apuntas), intocable en el aire. Tu siguiente flecha empieza medio tensada.", icon: "flip", cd: 8, cast: 0, range: 90, aim: "dash", size: 8, ai: "escape", back: true }),
      x: S({ id: "pin", name: "Flecha clavadora", desc: "Flecha rápida de 10 de daño. Si el enemigo está a menos de 30 px de una columna o del borde, queda clavado 1,6 s; si no, va un 40% más lento 1,2 s.", icon: "pin", cd: 10, cast: 0.25, range: 230, aim: "line", size: 4, ai: "cc" }),
      y: S({ id: "hawk", name: "Ojo de halcón", desc: "4 s: haces un 20% más de daño y revelas a los invisibles a 160 px.", icon: "hawk", cd: 14, cast: 0, range: 0, aim: "self", size: 160, ai: "defend" }),
      b: S({ id: "stormarrow", name: "Flecha de tormenta", desc: "DEFINITIVA. Tensas 0,7 s y sueltas una flecha enorme que cruza la arena atravesando enemigos: 22 de daño +1 por cada 10 px recorridos (máx. 45).", icon: "stormarrow", cd: 1, cast: 0.7, castMove: 0.2, range: 560, aim: "line", size: 14, ai: "ult", ult: true }),
    },
  },
  // ------------------------------------------------------------ ametralladora
  gatlinga: {
    id: "gatlinga",
    name: "Gatlinga",
    role: "Ametralladora",
    desc: "Robot rechoncho con una rotativa en el brazo. Cuanto más dispara, más rápido va... hasta que se sobrecalienta. Despliega barricadas y se ancla como una torreta.",
    hp: 180,
    speed: 58,
    prefer: 140,
    color: "#6b7a3a",
    heat: true,
    skills: {
      r2: S({ id: "rotary", name: "Rotativa", desc: "Ráfaga que acelera cuanto más mantienes (de 0,28 a 0,1 s entre balas): 5 de daño por bala. Cada bala sube 4 de calor; a 100 el arma se bloquea 1,5 s mientras se enfría.", icon: "gatling", cd: 0.28, cast: 0, castMove: 0.6, range: 175, aim: "line", size: 2, ai: "poke" }),
      l2: S({ id: "steam", name: "Purga de vapor", desc: "Cono corto de vapor: 6 de daño +1 por cada 4 de calor, empuja un poco y vacía el calor (también si estabas sobrecalentada).", icon: "steam", cd: 6, cast: 0.2, range: 60, aim: "cone", size: 60, ai: "melee" }),
      a: S({ id: "recoil", name: "Retroceso", desc: "Disparas al suelo y sales despedida hacia atrás (contra la mira). Delante dejas un cono de 8 de daño.", icon: "recoil", cd: 9, cast: 0, range: 85, aim: "dash", size: 8, ai: "escape", back: true }),
      x: S({ id: "barricade", name: "Barricada", desc: "Despliegas un muro de chapa perpendicular a la mira (60 de vida, 8 s) que frena robots y balas de los dos equipos.", icon: "barricade", cd: 14, cast: 0.3, range: 70, aim: "ground", size: 20, ai: "defend" }),
      y: S({ id: "tracer", name: "Bala trazadora", desc: "Bala rápida: 6 de daño y marca 4 s. Tus golpes al marcado hacen +30% y, mientras dure, tu calor sube la mitad.", icon: "tracer", cd: 10, cast: 0.15, range: 230, aim: "line", size: 3, ai: "cc" }),
      b: S({ id: "turretmode", name: "Modo torreta", desc: "DEFINITIVA. Te anclas 3 s (ni te mueves ni te pueden empujar): cadencia máxima sin calor y balas de 7 que atraviesan barricadas, cajas y cúpulas.", icon: "turretmode", cd: 1, cast: 0, range: 190, aim: "line", size: 4, ai: "ult", ult: true }),
    },
  },
  // ------------------------------------------------------------ bumeranes
  boomera: {
    id: "boomera",
    name: "Boomera",
    role: "Lanzadora",
    desc: "Robot ágil con dos bumeranes de acero. Todo lo que lanza vuelve... y si lo atrapa, se lo vuelve a lanzar a la cara.",
    hp: 170,
    speed: 63,
    prefer: 140,
    color: "#2ec4b6",
    skills: {
      r2: S({ id: "boomerang", name: "Bumerán", desc: "Bumerán de ida y vuelta: 8 de daño a la ida y 8 a la vuelta. Si lo atrapas, puedes lanzar el siguiente al momento.", icon: "boomerang", cd: 1.4, cast: 0.15, castMove: 0.7, range: 170, aim: "line", size: 4, ai: "poke" }),
      l2: S({ id: "chakram", name: "Chakram", desc: "Disco que rebota 3 veces en columnas, cajas y bordes: 12 de daño por impacto (tras cada rebote puede volver a golpear).", icon: "chakram", cd: 5, cast: 0.25, range: 260, aim: "line", size: 4, ai: "poke" }),
      a: S({ id: "slide", name: "Deslizamiento", desc: "Te deslizas un poco hacia donde apuntas. Tiene 2 cargas.", icon: "slide", cd: 6, cast: 0, range: 60, aim: "dash", size: 8, ai: "escape", charges: 2 }),
      x: S({ id: "bigboomer", name: "Gran bumerán", desc: "Bumerán enorme y lento que arrastra a los enemigos que golpea a la ida (los suelta al girar): 10 de daño a la ida y 10 a la vuelta.", icon: "bigboomer", cd: 11, cast: 0.35, range: 180, aim: "line", size: 8, ai: "cc" }),
      y: S({ id: "perfectcatch", name: "Atrapada perfecta", desc: "Tus bumeranes en vuelo vuelven al instante y, durante 2 s, cada uno que atrapes te cura 8 y te quita 2 s de todas las recargas.", icon: "catch", cd: 8, cast: 0, range: 0, aim: "self", ai: "defend" }),
      b: S({ id: "blades", name: "Huracán de cuchillas", desc: "DEFINITIVA. Seis bumeranes giran 3 s a tu alrededor abriéndose en espiral (de 20 a 80 px): 9 de daño en cada pasada.", icon: "blades", cd: 1, cast: 0, range: 80, aim: "self", size: 80, ai: "ult", ult: true }),
    },
  },
};
export const CHAMP_IDS = Object.keys(CHAMPS) as ChampId[];

export type Difficulty = 0 | 1 | 2;
export const DIFF_NAMES = ["Fácil", "Normal", "Difícil"];

/** Arenas: temática de suelo (tiles.ts), música, trampa de las palancas y disposiciones de columnas. */
export interface ArenaDef { name: string; theme: number; track: string; trap: TrapKind; trapName: string; layouts: LayoutId[] }
export const ARENAS: ArenaDef[] = [
  { name: "Parque Robattle", theme: 0, track: "park", trap: "geyser", trapName: "¡GÉISERES!", layouts: ["classic", "diamond", "halls", "crown"] },
  { name: "Fábrica Omega", theme: 2, track: "factory", trap: "press", trapName: "¡PRENSA HIDRÁULICA!", layouts: ["classic", "halls", "diamond", "crown"] },
  { name: "Ciudad Neón", theme: 3, track: "neon", trap: "laser", trapName: "¡REJILLA LÁSER!", layouts: ["classic", "crown", "diamond", "halls"] },
  { name: "Desguace", theme: 1, track: "scrap", trap: "magnet", trapName: "¡GRÚA ELECTROIMÁN!", layouts: ["scrap", "classic", "halls"] },
  { name: "Núcleo", theme: 4, track: "core", trap: "pulse", trapName: "¡PULSO DE MEDALLA!", layouts: ["core", "diamond", "crown"] },
];
/** Nombre de la disposición elegida en la sala (-1 = al azar). */
export const layoutName = (arena: number, layout: number) => (layout < 0 ? "Al azar" : LAYOUTS[(ARENAS[arena] ?? ARENAS[0]!).layouts[layout] ?? "classic"]!.name);
