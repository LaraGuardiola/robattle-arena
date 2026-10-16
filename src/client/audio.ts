// Sonido 100% sintetizado con Web Audio: efectos chiptune y una música en
// bucle con secuenciador anticipado. Sin ficheros de audio.

let ac: AudioContext | null = null;
let master: GainNode;
let sfxBus: GainNode;
let musicBus: GainNode;
let noiseBuf: AudioBuffer;
let volume = 0.7;
let muted = false;

export function initAudio() {
  if (ac) {
    if (ac.state === "suspended") ac.resume();
    return;
  }
  ac = new AudioContext();
  master = ac.createGain();
  master.gain.value = muted ? 0 : volume;
  master.connect(ac.destination);
  sfxBus = ac.createGain();
  sfxBus.gain.value = 0.5;
  sfxBus.connect(master);
  musicBus = ac.createGain();
  musicBus.gain.value = 0.22;
  musicBus.connect(master);
  noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

export const audioRunning = () => ac?.state === "running";

/** Detiene / reanuda todo el audio (app en segundo plano, pestaña oculta). */
let wasRunning = false;
export function suspendAudio(on: boolean) {
  if (!ac) return;
  if (on) {
    wasRunning = ac.state === "running";
    ac.suspend();
  } else if (wasRunning) ac.resume();
}

export function setVolume(v: number, m: boolean) {
  volume = v;
  muted = m;
  if (master && ac) master.gain.setTargetAtTime(m ? 0 : v, ac.currentTime, 0.05);
}

function tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, at = 0, bus = sfxBus) {
  if (!ac) return;
  const t = ac.currentTime + at;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(bus);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, vol: number, freq: number, at = 0, bus = sfxBus, q = 1) {
  if (!ac) return;
  const t = ac.currentTime + at;
  const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noiseBuf;
  f.type = "lowpass";
  f.frequency.setValueAtTime(freq, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(60, freq / 6), t + dur);
  f.Q.value = q;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f).connect(g).connect(bus);
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + 0.02);
}

const last = new Map<string, number>();
let voices = 0;

const SFX: Record<string, () => void> = {
  shoot: () => tone("square", 880, 440, 0.06, 0.08),
  slash: () => noise(0.12, 0.25, 6000, 0, sfxBus, 4),
  laser: () => tone("sawtooth", 1400, 200, 0.22, 0.09),
  cannon: () => tone("square", 160, 60, 0.15, 0.2),
  mine: () => tone("triangle", 600, 900, 0.05, 0.1),
  missile: () => noise(0.2, 0.15, 2500),
  emp: () => tone("sine", 200, 1200, 0.25, 0.18),
  boom: () => noise(0.35, 0.35, 1800),
  hit: () => noise(0.05, 0.12, 4000),
  die: () => noise(0.12, 0.18, 2500),
  gem: () => tone("square", 1200 + Math.random() * 300, 1800, 0.05, 0.05),
  coin: () => {
    tone("square", 988, 988, 0.06, 0.07);
    tone("square", 1319, 1319, 0.12, 0.07, 0.06);
  },
  heal: () => [523, 659, 784].forEach((f, i) => tone("triangle", f, f, 0.12, 0.15, i * 0.06)),
  chest: () => [392, 523, 659, 784, 1047].forEach((f, i) => tone("square", f, f, 0.1, 0.09, i * 0.07)),
  levelup: () => [523, 659, 784, 1047].forEach((f, i) => tone("square", f, f * 1.01, 0.1, 0.1, i * 0.07)),
  medal: () => [659, 784, 988, 1319].forEach((f, i) => tone("triangle", f, f, 0.18, 0.18, i * 0.09)),
  hurt: () => tone("square", 220, 90, 0.18, 0.2),
  down: () => tone("sawtooth", 400, 40, 0.8, 0.25),
  revive: () => [392, 523, 784].forEach((f, i) => tone("triangle", f, f, 0.15, 0.2, i * 0.08)),
  medaforce: () => {
    tone("sawtooth", 100, 1600, 0.6, 0.18);
    noise(0.8, 0.3, 5000, 0.1);
  },
  boss: () => [0, 0.35, 0.7].forEach((at) => tone("square", 110, 105, 0.25, 0.25, at)),
  bossdie: () => {
    noise(1.2, 0.5, 3000);
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone("square", f, f, 0.15, 0.12, 0.3 + i * 0.1));
  },
  charge: () => tone("sawtooth", 80, 300, 0.6, 0.15),
  wave: () => [0, 0.2].forEach((at) => tone("square", 330, 320, 0.15, 0.15, at)),
  click: () => tone("square", 660, 660, 0.04, 0.08),
  flame: () => noise(0.18, 0.12, 1400, 0, sfxBus, 2),
  drill: () => tone("sawtooth", 140, 90, 0.12, 0.12),
  boomerang: () => tone("triangle", 500, 900, 0.15, 0.08),
  arcane: () => tone("sine", 900, 1600, 0.12, 0.08),
  zap: () => {
    tone("sawtooth", 1800, 400, 0.08, 0.08);
    noise(0.06, 0.1, 8000);
  },
  barrier: () => tone("sine", 1200, 300, 0.25, 0.14),
  bubble: () => tone("sine", 300, 700, 0.12, 0.12),
  teleport: () => tone("sine", 200, 2000, 0.3, 0.12),
  evo: () => [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone("square", f, f, 0.14, 0.1, i * 0.06)),
  phase: () => {
    tone("sawtooth", 80, 50, 0.7, 0.3);
    noise(0.6, 0.3, 1200);
  },
  thorns: () => noise(0.1, 0.12, 900, 0, sfxBus, 3),
  intro: () => {
    // golpe de tambor + acorde menor que sube
    tone("sine", 120, 40, 0.5, 0.6);
    noise(0.5, 0.3, 2000);
    [220, 262, 330, 440].forEach((f, i) => tone("sawtooth", f, f, 0.5, 0.08, 0.25 + i * 0.12));
  },
  victory: () => {
    const m = [523, 523, 523, 659, 784, 0, 659, 784, 1047];
    m.forEach((f, i) => f && tone("square", f, f, i === m.length - 1 ? 0.9 : 0.16, 0.12, i * 0.16));
    [262, 330, 392, 523].forEach((f) => tone("triangle", f, f, 1.2, 0.08, m.length * 0.16 - 0.1));
  },
  defeat: () => [392, 370, 349, 330, 262].forEach((f, i) => tone("triangle", f, f * 0.98, i === 4 ? 1 : 0.3, 0.16, i * 0.3)),
  timestop: () => {
    tone("sine", 1600, 100, 0.8, 0.2);
    tone("triangle", 800, 50, 0.8, 0.15, 0.05);
  },
  select: () => tone("square", 880, 1320, 0.08, 0.08),

  // ---- arena
  round: () => [0, 0.12].forEach((at) => tone("square", 523, 523, 0.1, 0.12, at)),
  tick: () => tone("square", 660, 660, 0.08, 0.12),
  go: () => {
    tone("sawtooth", 220, 880, 0.35, 0.16);
    noise(0.4, 0.25, 4000, 0.05);
  },
  spawn: () => [784, 988, 1175].forEach((f, i) => tone("triangle", f, f, 0.12, 0.12, i * 0.07)),
  storm: () => {
    tone("sawtooth", 60, 40, 1.2, 0.25);
    noise(1.2, 0.2, 800);
  },
  roundwin: () => [523, 659, 784].forEach((f, i) => tone("square", f, f, 0.14, 0.1, i * 0.1)),
  ko: () => {
    noise(0.5, 0.4, 2500);
    tone("sawtooth", 400, 50, 0.6, 0.2);
  },
  melee: () => noise(0.07, 0.22, 3000, 0, sfxBus, 2),
  orbhit: () => tone("triangle", 1400, 1200, 0.06, 0.08),
  orbbreak: () => [1047, 1319, 1568, 2093].forEach((f, i) => tone("square", f, f, 0.1, 0.09, i * 0.05)),
  counter: () => {
    tone("square", 1200, 1800, 0.1, 0.12);
    noise(0.15, 0.2, 6000);
  },
  block: () => tone("square", 1600, 900, 0.07, 0.12),
  swing: () => noise(0.09, 0.16, 5000, 0, sfxBus, 3),
  quake: () => {
    tone("sine", 90, 40, 0.4, 0.5);
    noise(0.35, 0.3, 900);
  },
  dash: () => noise(0.2, 0.18, 3000, 0, sfxBus, 1.5),
  shield: () => tone("sine", 600, 1200, 0.18, 0.12),
  warcry: () => {
    tone("sawtooth", 180, 120, 0.35, 0.18);
    tone("square", 240, 160, 0.35, 0.1);
  },
  leap: () => tone("triangle", 300, 900, 0.25, 0.12),
  slam: () => {
    tone("sine", 120, 30, 0.5, 0.6);
    noise(0.5, 0.4, 1500);
  },
  snipe: () => {
    tone("square", 1800, 200, 0.18, 0.12);
    noise(0.12, 0.25, 7000);
  },
  throw: () => tone("triangle", 400, 700, 0.1, 0.08),
  trap: () => {
    tone("square", 900, 300, 0.08, 0.14);
    noise(0.08, 0.2, 5000);
  },
  shotgun: () => noise(0.16, 0.3, 3500),
  fireball: () => noise(0.18, 0.14, 1800, 0, sfxBus, 2),
  firewall: () => noise(0.6, 0.2, 1200, 0, sfxBus, 2),
  ray: () => {
    tone("sawtooth", 200, 1600, 0.2, 0.14);
    tone("sawtooth", 1600, 100, 0.5, 0.14, 0.2);
    noise(0.6, 0.3, 4000, 0.15);
  },
  seed: () => tone("triangle", 700, 1100, 0.07, 0.07),
  garden: () => [523, 659, 784, 1047].forEach((f, i) => tone("triangle", f, f * 1.01, 0.3, 0.1, i * 0.08)),
  claw: () => noise(0.06, 0.18, 7000, 0, sfxBus, 4),
  crit: () => tone("square", 1500, 2200, 0.08, 0.12),
  hook: () => tone("sawtooth", 300, 120, 0.15, 0.12),
  stealth: () => tone("sine", 1200, 200, 0.4, 0.1),
  crescent: () => {
    tone("sine", 600, 1800, 0.18, 0.12);
    noise(0.2, 0.15, 7000, 0, sfxBus, 4);
  },
  minigun: () => {
    tone("square", 300, 150, 0.04, 0.06);
    noise(0.04, 0.12, 4000);
  },
  treads: () => {
    tone("sawtooth", 70, 110, 0.4, 0.15);
    noise(0.4, 0.15, 900);
  },
  armor: () => [330, 440, 660].forEach((f, i) => tone("square", f, f, 0.08, 0.1, i * 0.05)),
  bat: () => tone("triangle", 1800, 900, 0.08, 0.06),
  hypno: () => [0, 0.1, 0.2].forEach((at, i) => tone("sine", 500 + i * 150, 300 + i * 150, 0.2, 0.1, at)),
  bloodmoon: () => {
    tone("sawtooth", 110, 55, 1, 0.18);
    [220, 262, 311].forEach((f, i) => tone("triangle", f, f, 0.6, 0.08, 0.2 + i * 0.12));
  },
  dome: () => tone("sine", 300, 1500, 0.35, 0.14),
  chain: () => {
    tone("sawtooth", 2400, 300, 0.15, 0.1);
    noise(0.15, 0.2, 9000);
  },
  singularity: () => {
    tone("sine", 900, 40, 1.2, 0.25);
    noise(1, 0.15, 600);
  },
  smoke: () => noise(0.5, 0.25, 1200, 0, sfxBus, 1),
  frenzy: () => {
    noise(0.3, 0.25, 6000, 0, sfxBus, 3);
    tone("sawtooth", 600, 1500, 0.25, 0.1);
  },
  // ---- tanda 1
  bow: () => {
    tone("triangle", 220, 660, 0.08, 0.12);
    noise(0.06, 0.12, 6000);
  },
  overheat: () => {
    noise(0.8, 0.25, 2000, 0, sfxBus, 1);
    tone("square", 900, 300, 0.3, 0.1);
  },
  ricochet: () => tone("square", 2200, 1400, 0.06, 0.08),
  catch: () => [880, 1320].forEach((f, i) => tone("square", f, f, 0.06, 0.08, i * 0.05)),
  // ---- palancas y trampas
  lever: () => {
    tone("square", 200, 140, 0.08, 0.16);
    [440, 0, 440, 0, 440].forEach((f, i) => f && tone("square", f, f, 0.12, 0.1, 0.12 + i * 0.12));
  },
  geyser: () => noise(0.6, 0.3, 2500, 0, sfxBus, 1),
  lasergrid: () => tone("sawtooth", 1800, 600, 1.4, 0.08),
  crate: () => {
    noise(0.25, 0.3, 1800);
    tone("square", 160, 60, 0.15, 0.12);
  },
};

/** Reproduce un efecto con separación mínima y tope de voces. */
export function sfx(name: string, minGap = 0.045) {
  if (!ac || muted) return;
  const now = ac.currentTime;
  if ((last.get(name) ?? -1) > now - minGap || voices > 24) return;
  last.set(name, now);
  voices++;
  setTimeout(() => voices--, 150);
  SFX[name]?.();
}

// ================================================================ música
// Notación: una letra por semicorchea. Notas = índice en la escala, '.' silencio.
const NOTE = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
// La menor: A C D E G (+ octavas)
/**
 * Una canción son 4 compases de 16 semicorcheas en bucle.
 *  bass   8 notas por compás (corcheas; null = silencio). bass16: semicorcheas con octava alterna.
 *  lead   16 notas por compás (null = silencio).
 *  arp    acorde por compás: arpegio rápido de fondo (opcional).
 *  drums  k bombo · s caja · h charles · . nada
 */
type Song = {
  bpm: number;
  bass: (number | null)[][];
  lead: (number | null)[][];
  drums: string;
  transpose?: number;
  bass16?: boolean;
  arp?: number[][];
  swing?: number;
  leadWave?: OscillatorType;
};
const _ = null;
const BATTLE: Song = {
  bpm: 150,
  bass: [
    [45, 45, 57, 45, 45, 57, 45, 55],
    [41, 41, 53, 41, 41, 53, 41, 52],
    [43, 43, 55, 43, 43, 55, 43, 50],
    [40, 40, 52, 40, 44, 44, 56, 44],
  ],
  lead: [
    [69, _, 72, _, 76, _, 74, 72, _, 69, _, 67, 69, _, _, _],
    [65, _, 69, _, 72, _, 71, 69, _, 67, _, 65, 64, _, _, _],
    [67, _, 71, _, 74, _, 72, 71, _, 74, _, 76, 74, _, 72, _],
    [71, _, 68, _, 64, _, 68, 71, _, 76, _, 74, 71, _, 68, _],
  ],
  drums: "k.h.s.h.k.k.s.hh",
};
const MENU: Song = {
  bpm: 112,
  bass: [
    [45, 52, 57, 52, 45, 52, 57, 52],
    [41, 48, 53, 48, 41, 48, 53, 48],
    [43, 50, 55, 50, 43, 50, 55, 50],
    [40, 47, 52, 47, 44, 47, 52, 56],
  ],
  lead: [
    [76, _, _, 74, 72, _, 69, _, 72, _, 74, _, 76, _, _, _],
    [77, _, _, 76, 74, _, 72, _, 69, _, _, _, 72, _, _, _],
    [74, _, _, 72, 71, _, 67, _, 71, _, 74, _, 79, _, _, _],
    [76, _, 75, _, 76, _, 71, _, 68, _, 71, _, 76, _, _, _],
  ],
  drums: "k...h...s...h...",
};

// ---- stage 1: el tema de siempre; su jefe, la versión acelerada
const S1 = BATTLE;
const S1_BOSS: Song = { ...BATTLE, bpm: 170, transpose: -3, bass16: true, drums: "kkhsk.hskkhsk.ss" };

// ---- stage 2: desguace, funk metálico con swing (Re dórico)
const S2: Song = {
  bpm: 124,
  swing: 0.22,
  bass: [
    [38, _, 38, 50, _, 38, 48, 50],
    [36, _, 36, 48, _, 36, 46, 48],
    [34, _, 34, 46, _, 34, 45, 46],
    [33, _, 33, 45, 40, _, 43, 45],
  ],
  lead: [
    [62, _, 65, _, 67, _, 65, 62, _, 60, 62, _, _, _, 69, _],
    [67, _, 64, _, 65, _, 64, 60, _, 58, 60, _, _, _, _, _],
    [58, _, 62, _, 65, _, 67, _, 69, _, 67, 65, _, 62, _, _],
    [57, _, _, _, 61, _, 64, _, 67, _, _, _, 69, _, 70, _],
  ],
  drums: "k..hs.hkk.hhs.h.",
};
// jefe del desguace: pesado y frigio (Mi)
const S2_BOSS: Song = {
  bpm: 166,
  bass16: true,
  bass: [
    [40, 40, 52, 40, 41, 40, 52, 40],
    [40, 40, 52, 40, 43, 40, 52, 41],
    [36, 36, 48, 36, 38, 36, 48, 38],
    [41, 41, 53, 41, 40, 40, 52, 40],
  ],
  lead: [
    [64, _, 65, _, 64, _, 71, _, 70, _, 67, _, 65, _, 64, _],
    [64, _, 65, _, 67, _, 70, _, 72, _, 71, _, 70, _, 67, _],
    [76, _, _, 75, _, _, 72, _, 71, _, _, 70, _, _, 67, _],
    [65, _, 64, _, 65, _, 67, _, 64, _, _, _, 76, _, 77, _],
  ],
  drums: "kkhskkhskkhsk.ss",
  leadWave: "sawtooth",
};

// ---- stage 3: fábrica, synthwave en Do menor con arpegio
const CHORDS_3 = [[48, 51, 55], [44, 48, 51], [51, 55, 58], [46, 50, 53]];
const S3: Song = {
  bpm: 116,
  arp: CHORDS_3,
  bass: [
    [36, _, 36, _, 36, _, 36, 48],
    [32, _, 32, _, 32, _, 32, 44],
    [39, _, 39, _, 39, _, 39, 51],
    [34, _, 34, _, 34, _, 46, 34],
  ],
  lead: [
    [67, _, _, _, 70, _, _, 68, 67, _, _, _, 63, _, _, _],
    [68, _, _, _, 67, _, _, 63, 60, _, _, _, _, _, _, _],
    [70, _, _, _, 72, _, _, 70, 75, _, _, _, 74, _, 72, _],
    [70, _, _, _, _, _, 74, _, 72, _, _, _, _, _, _, _],
  ],
  drums: "k...s...k.k.s..h",
};
// jefe final: lo mismo pero desatado
const S3_BOSS: Song = {
  bpm: 178,
  arp: CHORDS_3,
  bass16: true,
  bass: [
    [36, 36, 48, 36, 36, 36, 48, 36],
    [32, 32, 44, 32, 32, 32, 44, 32],
    [39, 39, 51, 39, 39, 39, 51, 39],
    [34, 34, 46, 34, 35, 35, 47, 35],
  ],
  lead: [
    [72, _, 75, _, 79, _, 77, 75, 74, _, 75, _, 72, _, _, _],
    [68, _, 72, _, 75, _, 74, 72, 70, _, 68, _, 67, _, _, _],
    [70, _, 74, _, 77, _, 75, 74, 72, _, 74, _, 75, _, 77, _],
    [79, _, _, _, 78, _, _, _, 79, _, 82, _, 84, _, _, _],
  ],
  drums: "kkhskhhskkhsk.sh",
  leadWave: "sawtooth",
};

// ---- stage 4: ciudad neón, electro en Fa menor
const CHORDS_4 = [[53, 56, 60], [49, 53, 56], [56, 60, 63], [51, 55, 58]];
const S4: Song = {
  bpm: 132,
  arp: CHORDS_4,
  bass: [
    [41, _, 53, _, 41, _, 53, _],
    [37, _, 49, _, 37, _, 49, _],
    [44, _, 56, _, 44, _, 56, _],
    [39, _, 51, _, 39, _, 51, _],
  ],
  lead: [
    [72, _, _, 75, _, _, 77, _, 75, _, 72, _, 70, _, 72, _],
    [73, _, _, 72, _, _, 68, _, _, _, 65, _, _, _, _, _],
    [68, _, _, 72, _, _, 75, _, 77, _, 75, _, 72, _, 75, _],
    [74, _, _, _, 75, _, _, _, 79, _, _, _, _, _, _, _],
  ],
  drums: "k.h.s.h.k.h.s.hh",
};
const S4_BOSS: Song = {
  bpm: 174,
  arp: CHORDS_4,
  bass16: true,
  bass: S4.bass,
  lead: [
    [77, _, 77, _, 80, _, 77, _, 84, _, 82, _, 80, _, 77, _],
    [73, _, 73, _, 77, _, 73, _, 80, _, 77, _, 73, _, 72, _],
    [75, _, 75, _, 79, _, 75, _, 82, _, 80, _, 79, _, 75, _],
    [79, _, _, _, 80, _, _, _, 82, _, 84, _, 86, _, _, _],
  ],
  drums: "kkhskhhskkhsk.ss",
  leadWave: "sawtooth",
};

// ---- stage 5: núcleo medalla, calma etérea antes del final (Mi menor)
const CHORDS_5 = [[52, 55, 59], [48, 52, 55], [55, 59, 62], [50, 54, 57]];
const S5: Song = {
  bpm: 96,
  arp: CHORDS_5,
  bass: [
    [40, _, _, _, 40, _, _, _],
    [36, _, _, _, 36, _, _, _],
    [43, _, _, _, 43, _, _, _],
    [38, _, _, _, 38, _, _, _],
  ],
  lead: [
    [76, _, _, _, _, _, _, _, 79, _, _, _, _, _, _, _],
    [72, _, _, _, _, _, _, _, 71, _, _, _, _, _, _, _],
    [74, _, _, _, _, _, _, _, 79, _, _, _, 78, _, _, _],
    [74, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
  ],
  drums: "k.......s.......",
  leadWave: "triangle",
};
// jefe final: épico
const S5_BOSS: Song = {
  bpm: 186,
  arp: CHORDS_5,
  bass16: true,
  bass: [
    [40, 40, 52, 40, 40, 40, 52, 40],
    [36, 36, 48, 36, 36, 36, 48, 36],
    [43, 43, 55, 43, 43, 43, 55, 43],
    [38, 38, 50, 38, 42, 42, 54, 42],
  ],
  lead: [
    [76, _, 79, _, 83, _, 81, 79, 78, _, 79, _, 76, _, _, _],
    [72, _, 76, _, 79, _, 78, 76, 74, _, 72, _, 71, _, _, _],
    [74, _, 78, _, 81, _, 79, 78, 79, _, 81, _, 83, _, 86, _],
    [83, _, _, _, 82, _, _, _, 83, _, 86, _, 88, _, _, _],
  ],
  drums: "kkhskhhskkhskshs",
  leadWave: "sawtooth",
};

// ---- taller: relajado, con swing
const TALLER: Song = {
  bpm: 96,
  swing: 0.3,
  bass: [
    [48, _, 55, _, 52, _, 55, _],
    [45, _, 52, _, 48, _, 52, _],
    [41, _, 48, _, 45, _, 48, _],
    [43, _, 50, _, 47, _, 43, _],
  ],
  lead: [
    [72, _, _, 76, _, _, 79, _, 76, _, _, _, 74, _, 72, _],
    [69, _, _, 72, _, _, 76, _, 74, _, _, _, _, _, _, _],
    [65, _, _, 69, _, _, 72, _, 74, _, 72, _, 69, _, _, _],
    [67, _, _, 71, _, _, 74, _, 71, _, _, _, 67, _, _, _],
  ],
  drums: "k...h.s.k.h.s..h",
  leadWave: "triangle",
};

const TRACKS: Record<string, Song> = {
  menu: MENU,
  lobby: TALLER,
  park: S1_BOSS,
  factory: S3,
  neon: S4,
  scrap: S2,
  core: S2_BOSS,
  results: S5,
};

let song: Song | null = null;
let current: string | null = null;
let step = 0;
let nextT = 0;
let timer: ReturnType<typeof setInterval> | null = null;

/** Cambia de pista (no hace nada si ya está sonando esa). */
export function playMusic(track: string | null) {
  if (track === current && (timer || !track)) return;
  current = track;
  if (timer) clearInterval(timer);
  timer = null;
  song = track ? TRACKS[track] ?? null : null;
  if (!song || !ac) return;
  step = 0;
  nextT = ac.currentTime + 0.1;
  timer = setInterval(schedule, 40);
}

function schedule() {
  if (!ac || !song) return;
  const sixteenth = 60 / song.bpm / 4;
  const tr = song.transpose ?? 0;
  while (nextT < ac.currentTime + 0.15) {
    const s = step % 16;
    const at = nextT - ac.currentTime + (s % 2 ? (song.swing ?? 0) * sixteenth : 0);
    const bar = Math.floor(step / 16) % 4;
    if (song.bass16) {
      const b = song.bass[bar]![s >> 1];
      if (b != null) {
        const f = NOTE(b + tr + (s % 2 ? 12 : 0));
        tone("triangle", f, f, sixteenth * 0.9, 0.45, at, musicBus);
      }
    } else if (s % 2 === 0) {
      const b = song.bass[bar]![s / 2];
      if (b != null) tone("triangle", NOTE(b + tr), NOTE(b + tr), sixteenth * 1.8, 0.5, at, musicBus);
    }
    if (song.arp) {
      const ch = song.arp[bar]!;
      const f = NOTE(ch[s % 3]! + 12 + 12 * (Math.floor(s / 3) % 2) + tr);
      tone("sawtooth", f, f, sixteenth * 0.7, 0.045, at, musicBus);
    }
    const l = song.lead[bar]![s];
    if (l != null) {
      const f = NOTE(l + tr), w = song.leadWave ?? "square";
      tone(w, f, f, sixteenth * 1.6, w === "sawtooth" ? 0.11 : 0.16, at, musicBus);
      tone(w, f * 1.005, f * 1.005, sixteenth * 1.6, 0.06, at + 0.02, musicBus);
    }
    const d = song.drums[s];
    if (d === "k") tone("sine", 150, 40, 0.12, 0.7, at, musicBus);
    else if (d === "s") noise(0.12, 0.35, 3500, at, musicBus);
    else if (d === "h") noise(0.03, 0.15, 9000, at, musicBus);
    nextT += sixteenth;
    step++;
  }
}
