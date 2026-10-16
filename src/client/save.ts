// Guardado local (localStorage): ajustes y última configuración de la sala.

import type { ChampId, Difficulty } from "../shared/data";

export interface SaveData {
  name: string;
  vol: number;
  muted: boolean;
  dmgNums: boolean;
  shake: boolean;
  assist: boolean;
  size: 1 | 2;
  wins: number;
  arena: number;
  diff: Difficulty;
  /** último campeón elegido por cada dispositivo ("kb", "pad0"...) */
  champs: Record<string, ChampId>;
  stats: { games: number; wins: number };
}

const KEY = "robattle-arena-v1";
const DEFAULTS: SaveData = {
  name: "", vol: 0.7, muted: false, dmgNums: true, shake: true, assist: true,
  size: 1, wins: 3, arena: 0, diff: 1, champs: {}, stats: { games: 0, wins: 0 },
};

function load(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULTS };
}

export const save = load();
export function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {}
}
