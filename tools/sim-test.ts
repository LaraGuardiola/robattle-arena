// Partidas automáticas bot contra bot con cada campeón: comprueba que nada
// peta y da una idea del equilibrio (victorias y duración de las rondas).
//   bun tools/sim-test.ts [partidas por cruce]

import { CHAMP_IDS, type ChampId } from "../src/shared/data";
import { SKILLS } from "../src/shared/skills";
import { DT, World } from "../src/shared/world";

// cuenta cuántas veces se usa cada skill
const used: Record<string, number> = {};
for (const k of Object.keys(SKILLS)) {
  const fn = SKILLS[k]!;
  SKILLS[k] = (...a) => {
    used[k] = (used[k] ?? 0) + 1;
    fn(...a);
  };
}

const N = Number(process.argv[2] ?? 4);
const wins: Record<string, number> = {}, games: Record<string, number> = {};
let rounds = 0, roundTime = 0, maxRound = 0;

function play(a: ChampId[], b: ChampId[], seed: number) {
  const specs = [...a.map((c, i) => ({ id: i + 1, name: c, champ: c, team: 0, human: false, diff: 2 as const })),
    ...b.map((c, i) => ({ id: 10 + i, name: c, champ: c, team: 1, human: false, diff: 2 as const }))];
  const w = new World({ seed, wins: 3, arena: 0 }, specs);
  let rt = 0;
  for (let i = 0; i < 60 * 60 * 15 && !w.winnerDone(); i++) {
    const before = w.round;
    w.step(DT);
    w.snapshot();
    if (w.phase === "fight") rt = w.pt;
    if (w.round !== before || w.winnerDone()) {
      rounds++;
      roundTime += rt;
      maxRound = Math.max(maxRound, rt);
    }
  }
  if (!w.winnerDone()) throw new Error(`partida sin terminar ${a} vs ${b}`);
  return w.winner;
}

let seed = 1;
const t0 = performance.now();
for (const a of CHAMP_IDS)
  for (const b of CHAMP_IDS) {
    if (a === b) continue;
    for (let k = 0; k < N; k++) {
      const win = play([a], [b], seed++);
      const w = win === 0 ? a : b;
      wins[w] = (wins[w] ?? 0) + 1;
      games[a] = (games[a] ?? 0) + 1;
      games[b] = (games[b] ?? 0) + 1;
    }
  }
console.log("1v1 (bots difíciles):");
for (const c of CHAMP_IDS) console.log(`  ${c.padEnd(9)} ${(((wins[c] ?? 0) / games[c]!) * 100).toFixed(0).padStart(3)}% victorias`);
const w2: Record<string, number> = {}, g2: Record<string, number> = {};
for (let k = 0; k < N * 12; k++) {
  const pick = () => CHAMP_IDS[Math.floor(Math.random() * CHAMP_IDS.length)]!;
  const a = [pick(), pick()], b = [pick(), pick()];
  const win = play(a, b, seed++);
  for (const c of [...a, ...b]) g2[c] = (g2[c] ?? 0) + 1;
  for (const c of win === 0 ? a : b) w2[c] = (w2[c] ?? 0) + 1;
}
console.log("2v2 aleatorio:");
for (const c of CHAMP_IDS) console.log(`  ${c.padEnd(9)} ${(((w2[c] ?? 0) / (g2[c] ?? 1)) * 100).toFixed(0).padStart(3)}% victorias`);
const never = Object.keys(SKILLS).filter((k) => !used[k]);
console.log("skills usadas:", Object.entries(used).map(([k, v]) => `${k}:${v}`).join(" "));
if (never.length) console.log("¡NUNCA USADAS!:", never.join(", "));
console.log(`rondas: ${rounds}, media ${(roundTime / rounds).toFixed(1)} s, máx ${maxRound.toFixed(1)} s`);
console.log(`(${((performance.now() - t0) / 1000).toFixed(1)} s de simulación)`);
