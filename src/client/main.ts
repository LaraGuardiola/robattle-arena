// Flujo del juego: menús, sala (local o LAN), partida y HUD.
// En local (solitario / sofá con varios mandos) la simulación corre aquí; en
// LAN corre en el servidor y aquí sólo se interpola y se dibuja.

import {
  ARENAS, CAPSULE_AT, CHAMPS, CHAMP_IDS, DIFF_NAMES, KEY_LABEL, ORB_AT, PAD_LABEL, SLOTS, STORM_AT, TEAM_NAMES,
  type ChampId, type Difficulty, type Slot,
} from "../shared/data";
import { angleDiff } from "../shared/math";
import { NO_INPUT, PR_STRIDE, ST, type Ev, type FSnap, type Input, type SeatInfo, type ServerMsg, type Snap } from "../shared/protocol";
import { DT, World, type FighterSpec } from "../shared/world";
import { audioRunning, initAudio, playMusic, setVolume, sfx, suspendAudio } from "./audio";
import { initInput, mousePos, readDevice, takePause, type Device } from "./input";
import { Net } from "./net";
import { initPad, onPadConnect, onPadPress, padIsPS, padsRaw, rumble, setManualPads } from "./pad";
import { Renderer, type LocalView } from "./renderer";
import { persist, save } from "./save";
import { iconURL, robotURL } from "./sprites";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// ================================================================ estado
interface LocalSeat { dev: string | null; champ: ChampId; ready: boolean; diff: Difficulty }
interface LocalPlayer { id: number; dev: Device; devKey: string; tag: string; hp: number; ax: number; ay: number }

const randChamp = () => CHAMP_IDS[Math.floor(Math.random() * CHAMP_IDS.length)]!;
const lobby = {
  teams: [0, 1].map(() => [0, 1].map((): LocalSeat => ({ dev: null, champ: randChamp(), ready: false, diff: save.diff }))),
};
let lobbyKind: "local" | "lan" = "local";
/** campeón que se muestra en la ficha de la sala */
let detailChamp: ChampId = "beetlix";

let mode: "local" | "mp" | null = null;
let world: World | null = null;
let net: Net | null = null;
let renderer: Renderer | null = null;
let locals: LocalPlayer[] = [];
let paused = false;
let raf = 0;
let acc = 0;
let lastT = 0;
let lastSnap: Snap | null = null;
let resultsShown = false;
let room: Extract<ServerMsg, { t: "room" }> | null = null;
let myFighter = 0;
let snapBuf: { t: number; s: Snap }[] = [];
let lastSend = 0;
let bannerT = 0;

// ================================================================ pantallas
const screens = ["title", "lobby", "mp", "champs", "options"] as const;
type Screen = (typeof screens)[number];
let current: Screen = "title";

function show(s: Screen) {
  current = s;
  $("menus").classList.remove("hidden");
  $("game").classList.add("hidden");
  for (const k of screens) $(`scr-${k}`).classList.toggle("hidden", k !== s);
  setManualPads(s === "lobby" && lobbyKind === "local");
  if (s === "title") renderTitle();
  if (s === "lobby") renderLobby();
  if (s === "champs") renderChamps();
  if (s === "options") renderOptions();
  if (s === "mp") renderMp();
  if (mode === null) playMusic(s === "lobby" ? "lobby" : "menu");
}

function toast(msg: string) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout((t as unknown as { _h: number })._h);
  (t as unknown as { _h: number })._h = window.setTimeout(() => t.classList.remove("show"), 2200);
}

function renderTitle() {
  $("title-bots").innerHTML = CHAMP_IDS.map((c, i) => `<img src="${robotURL(c, 4, i >= 3)}" alt="">`).join("");
  const st = save.stats;
  $("title-foot").innerHTML = st.games ? `<span>Partidas: ${st.games}</span><span>Victorias: ${st.wins}</span>` : `<span>Un battle arena de robots · 1v1 y 2v2</span>`;
}

// ================================================================ fichas de campeón
const isPadDev = (dev: string | null | undefined) => !!dev && dev.startsWith("pad");
function keyLabel(slot: Slot, pad: boolean) {
  return pad ? PAD_LABEL[slot][padIsPS() ? 1 : 0] : KEY_LABEL[slot];
}

function champHTML(id: ChampId, pad = false) {
  const c = CHAMPS[id];
  const sk = SLOTS.map((sl) => {
    const s = c.skills[sl];
    const cd = s.ult ? "Necesita la barra de energía llena" : sl === "r2" ? "Básico · mantener" : `Recarga ${s.cd} s${s.cast ? ` · lanzamiento ${s.cast} s` : ""}`;
    return `<div class="sk${s.ult ? " ult" : ""}"><img src="${iconURL(s.icon, 3)}" alt=""><div><div class="nm"><b>${keyLabel(sl, pad)}</b>${esc(s.name)}</div><div class="tx">${esc(s.desc)}</div><div class="cd">${cd}</div></div></div>`;
  }).join("");
  return `<div class="champ-head"><img src="${robotURL(id, 4)}" alt=""><div><div class="nm">${c.name} <span class="role">· ${c.role}</span></div><div class="ds">${esc(c.desc)}</div><div class="stats">Vida ${c.hp} · Velocidad ${c.speed}</div></div></div><div class="skills">${sk}</div>`;
}

let champTab: ChampId = "beetlix";
function renderChamps() {
  $("champ-tabs").innerHTML = CHAMP_IDS.map((c) => `<button class="btn ${c === champTab ? "on sel" : ""}" data-champ="${c}">${CHAMPS[c].name}</button>`).join("");
  $("champ-detail").innerHTML = champHTML(champTab, padsRaw().length > 0);
  for (const b of $("champ-tabs").querySelectorAll<HTMLElement>("[data-champ]"))
    b.onclick = () => {
      champTab = b.dataset.champ as ChampId;
      sfx("select");
      renderChamps();
    };
}

// ================================================================ opciones
const CONTROLS = `
  <b>Teclado + ratón</b><br />
  WASD — moverse · ratón — apuntar<br />
  Clic izquierdo — ataque básico (mantener) · clic derecho — skill secundaria<br />
  ESPACIO — movilidad · Q / E — skills · R (o F) — definitiva<br />
  ESC / P — pausa<br /><br />
  <b>Mando</b><br />
  Stick izquierdo — moverse · stick derecho — apuntar (cuanto más lo empujas, más lejos)<br />
  RT / R2 — ataque básico (mantener) · LT / L2 — skill secundaria<br />
  A ✕ — movilidad · X ▢ / Y △ — skills · B ○ (o RB) — definitiva · Start — pausa<br /><br />
  <b>Reglas</b><br />
  Gana la ronda el equipo que deje al otro fuera de combate. A los ${CAPSULE_AT} s salen cápsulas de reparación,
  a los ${ORB_AT} s el Orbe Medalla (rómpelo para curar y cargar energía) y a los ${STORM_AT} s empieza la muerte súbita.
  La energía se carga haciendo daño o curando y se conserva entre rondas.`;

function renderOptions() {
  $<HTMLInputElement>("opt-name").value = save.name;
  $<HTMLInputElement>("opt-vol").value = String(save.vol);
  $<HTMLInputElement>("opt-mute").checked = save.muted;
  $<HTMLInputElement>("opt-dmg").checked = save.dmgNums;
  $<HTMLInputElement>("opt-shake").checked = save.shake;
  $<HTMLInputElement>("opt-assist").checked = save.assist;
  $("opt-keys").innerHTML = CONTROLS;
}
function bindOptions() {
  $<HTMLInputElement>("opt-name").oninput = (e) => {
    save.name = (e.target as HTMLInputElement).value.trim().slice(0, 12);
    persist();
  };
  $<HTMLInputElement>("opt-vol").oninput = (e) => {
    save.vol = +(e.target as HTMLInputElement).value;
    setVolume(save.vol, save.muted);
    persist();
  };
  const check = (id: string, k: "muted" | "dmgNums" | "shake" | "assist") =>
    ($<HTMLInputElement>(id).onchange = (e) => {
      save[k] = (e.target as HTMLInputElement).checked;
      setVolume(save.vol, save.muted);
      persist();
    });
  check("opt-mute", "muted");
  check("opt-dmg", "dmgNums");
  check("opt-shake", "shake");
  check("opt-assist", "assist");
}

// ================================================================ sala
function devName(dev: string) {
  return dev === "kb" ? "Teclado + ratón" : `Mando ${+dev.slice(3) + 1}`;
}
function humanTags() {
  // P1, P2... por orden de asiento
  const tags = new Map<string, string>();
  let n = 1;
  for (const team of lobby.teams) for (let s = 0; s < save.size; s++) {
    const d = team[s]!.dev;
    if (d) tags.set(d, `P${n++}`);
  }
  return tags;
}

interface SeatView {
  champ: ChampId;
  who: string;
  human: boolean;
  ready: boolean;
  me: boolean;
  diff: Difficulty;
  /** se pueden cambiar campeón y dificultad del bot */
  edit: boolean;
  /** botón para sentarse en este hueco */
  sit: boolean;
}

function seatHTML(team: number, slot: number, s: SeatView) {
  const c = CHAMPS[s.champ];
  const st = s.human ? (s.ready ? `<span class="st ok">¡LISTO!</span>` : `<span class="st">eligiendo…</span>`) : `<span class="st">CPU</span>`;
  let ctl = "";
  if (!s.human && (s.edit || s.sit)) {
    ctl = `<div class="seat-ctl">`;
    if (s.edit)
      ctl += `<button class="mini" data-act="prev" title="Campeón anterior">◀</button><button class="mini" data-act="next" title="Campeón siguiente">▶</button>` +
        `<button class="mini" data-act="rand" title="Campeón al azar">🎲</button><button class="mini diff d${s.diff}" data-act="diff" title="Dificultad">${DIFF_NAMES[s.diff]}</button>`;
    if (s.sit) ctl += `<button class="mini sit" data-act="sit">Sentarme aquí</button>`;
    ctl += `</div>`;
  }
  return `<div class="seat ${s.human ? "human" : "empty"} ${s.me ? "me" : ""}" data-team="${team}" data-slot="${slot}">
    <img src="${robotURL(s.champ, 4, team === 1)}" alt="">
    <div><div class="nm">${c.name}</div><div class="role">${c.role}</div><div class="who">${esc(s.who)}</div></div>${st}${ctl}</div>`;
}

function renderLobby() {
  const lan = lobbyKind === "lan";
  const size = lan ? room!.size : save.size;
  const wins = lan ? room!.wins : save.wins;
  const arena = lan ? room!.arena : save.arena;
  const host = !lan || room!.host === net?.id;
  $("lobby-title").innerHTML = lan ? `Sala <span class="code">${room!.code}</span>` : "Sala local";
  $("opt-size").textContent = `Modo: ${size}v${size}`;
  $("opt-wins").textContent = `Rondas para ganar: ${wins}`;
  $("opt-arena").textContent = `Arena: ${ARENAS[arena]!.name}`;
  $("opt-diff").textContent = `Bots: ${DIFF_NAMES[lan ? (room!.seats.flat().find((s) => s.owner === 0) ?? room!.seats[0]![0]!).diff : save.diff]}`;
  for (const id of ["opt-size", "opt-wins", "opt-arena", "opt-diff"]) $<HTMLButtonElement>(id).disabled = !host;

  if (lan) {
    const r = room!;
    $("lobby-hint").innerHTML = `Comparte el código <b class="code">${r.code}</b>. Los huecos libres los ocupan bots${host ? ": elige su campeón y dificultad con sus botones" : "; el anfitrión elige su campeón, el modo y empieza"}.`;
    for (const t of [0, 1])
      $(`slots${t}`).innerHTML = r.seats[t]!.slice(0, size).map((s: SeatInfo, i) =>
        seatHTML(t, i, {
          champ: s.champ, who: s.owner > 0 ? s.name : `Bot · ${DIFF_NAMES[s.diff]}`, human: s.owner > 0, ready: s.ready, me: s.owner === net?.id,
          diff: s.diff, edit: host, sit: s.owner === 0,
        })).join("");
    const mine = r.seats.flat().find((s) => s.owner === net?.id);
    $("lobby-kb").classList.add("hidden");
    $("lobby-ready").classList.remove("hidden");
    $("lobby-ready").textContent = mine?.ready ? "No estoy listo" : "¡Listo!";
    $("lobby-start").classList.toggle("hidden", !host);
    if (mine) detailChamp = mine.champ;
  } else {
    const tags = humanTags();
    $("lobby-hint").innerHTML = `Pulsa <b>A / ✕</b> en un mando o <b>Intro</b> en el teclado para unirte · <b>←→</b> campeón · <b>↑↓</b> equipo · <b>A / Intro</b> listo · <b>Start</b> empezar. Los huecos vacíos son bots.`;
    for (const t of [0, 1])
      $(`slots${t}`).innerHTML = lobby.teams[t]!.slice(0, size).map((s, i) =>
        seatHTML(t, i, {
          champ: s.champ, who: s.dev ? `${tags.get(s.dev)} · ${devName(s.dev)}` : `Bot · ${DIFF_NAMES[s.diff]}`, human: !!s.dev, ready: s.ready, me: s.dev === "kb",
          diff: s.diff, edit: true, sit: !s.dev && !findSeat("kb"),
        })).join("");
    const kb = findSeat("kb");
    $("lobby-kb").classList.remove("hidden");
    $("lobby-kb").textContent = kb ? "Salir (teclado)" : "Unirse con teclado";
    $("lobby-ready").classList.toggle("hidden", !kb);
    $("lobby-ready").textContent = kb && kb.seat.ready ? "No estoy listo" : "¡Listo!";
    $("lobby-start").classList.remove("hidden");
  }
  // selector de campeón para el teclado / este cliente
  const picker = (lan || findSeat("kb"))
    ? `<div class="row" id="champ-pick">${CHAMP_IDS.map((c) => `<button class="btn ${c === detailChamp ? "on" : "ghost"}" data-pick="${c}">${CHAMPS[c].name}</button>`).join("")}</div>`
    : "";
  $("lobby-detail").innerHTML = picker + champHTML(detailChamp, !lan && !findSeat("kb") && padsRaw().length > 0);
  for (const b of $("lobby-detail").querySelectorAll<HTMLElement>("[data-pick]")) b.onclick = () => pickChamp(b.dataset.pick as ChampId);
  for (const b of document.querySelectorAll<HTMLElement>("#teams .seat")) {
    const team = +b.dataset.team!, slot = +b.dataset.slot!;
    b.onclick = () => clickSeat(team, slot);
    for (const btn of b.querySelectorAll<HTMLElement>("[data-act]"))
      btn.onclick = (e) => {
        e.stopPropagation();
        seatAction(team, slot, btn.dataset.act!);
      };
  }
}

function findSeat(dev: string) {
  for (let t = 0; t < 2; t++)
    for (let s = 0; s < save.size; s++) if (lobby.teams[t]![s]!.dev === dev) return { team: t, slot: s, seat: lobby.teams[t]![s]! };
  return null;
}

function pickChamp(c: ChampId) {
  sfx("select");
  detailChamp = c;
  if (lobbyKind === "lan") net?.send({ t: "champ", champ: c });
  else {
    const kb = findSeat("kb");
    if (kb) {
      kb.seat.champ = c;
      save.champs.kb = c;
      persist();
    }
    renderLobby();
  }
}

/** Pulsar un hueco enseña la ficha de su campeón. */
function clickSeat(team: number, slot: number) {
  const champ = lobbyKind === "lan" ? room!.seats[team]![slot]!.champ : lobby.teams[team]![slot]!.champ;
  if (champ !== detailChamp) {
    detailChamp = champ;
    sfx("click");
    renderLobby();
  }
}

/** Botones de un hueco de bot: campeón, dificultad o sentarse en él. */
function seatAction(team: number, slot: number, act: string) {
  const cur = lobbyKind === "lan" ? room!.seats[team]![slot]! : lobby.teams[team]![slot]!;
  const step = (d: number) => CHAMP_IDS[(CHAMP_IDS.indexOf(cur.champ) + d + CHAMP_IDS.length) % CHAMP_IDS.length]!;
  let champ: ChampId | null = null, diff: Difficulty | null = null;
  if (act === "prev") champ = step(-1);
  else if (act === "next") champ = step(1);
  else if (act === "rand") {
    const others = CHAMP_IDS.filter((c) => c !== cur.champ);
    champ = others[Math.floor(Math.random() * others.length)]!;
  } else if (act === "diff") diff = ((cur.diff + 1) % 3) as Difficulty;
  sfx("select");
  if (lobbyKind === "lan") {
    if (act === "sit") net?.send({ t: "seat", team, slot });
    else net?.send({ t: "bot", team, slot, ...(champ ? { champ } : {}), ...(diff !== null ? { diff } : {}) });
    if (champ) detailChamp = champ;
    return;
  }
  const s = cur as LocalSeat;
  if (act === "sit") return joinLocal("kb", team, slot);
  if (champ) s.champ = detailChamp = champ;
  if (diff !== null) s.diff = diff;
  renderLobby();
}

function joinLocal(dev: string, team = -1, slot = -1) {
  if (findSeat(dev)) return;
  if (team < 0) {
    // primer hueco libre, alternando equipos (P1 azul, P2 rojo...)
    const humans = [0, 1].map((t) => lobby.teams[t]!.slice(0, save.size).filter((s) => s.dev).length);
    const order = humans[0]! <= humans[1]! ? [0, 1] : [1, 0];
    for (const t of order) {
      const i = lobby.teams[t]!.slice(0, save.size).findIndex((s) => !s.dev);
      if (i >= 0) {
        team = t;
        slot = i;
        break;
      }
    }
    if (team < 0) {
      toast("No quedan huecos libres");
      return;
    }
  }
  const s = lobby.teams[team]![slot]!;
  s.dev = dev;
  s.ready = false;
  if (save.champs[dev]) s.champ = save.champs[dev]!;
  detailChamp = s.champ;
  sfx("select");
  renderLobby();
}

function leaveLocal(dev: string) {
  const f = findSeat(dev);
  if (!f) return;
  f.seat.dev = null;
  f.seat.ready = false;
  sfx("click");
  renderLobby();
}

function moveTeam(dev: string) {
  const f = findSeat(dev);
  if (!f) return;
  const other = 1 - f.team;
  const i = lobby.teams[other]!.slice(0, save.size).findIndex((s) => !s.dev);
  if (i < 0) return toast("El otro equipo está lleno");
  const dst = lobby.teams[other]![i]!;
  dst.dev = dev;
  dst.champ = f.seat.champ;
  dst.ready = f.seat.ready;
  f.seat.dev = null;
  f.seat.ready = false;
  f.seat.champ = randChamp();
  sfx("select");
  renderLobby();
}

function cycleChamp(dev: string, dir: number) {
  const f = findSeat(dev);
  if (!f || f.seat.ready) return;
  const i = CHAMP_IDS.indexOf(f.seat.champ);
  f.seat.champ = CHAMP_IDS[(i + dir + CHAMP_IDS.length) % CHAMP_IDS.length]!;
  save.champs[dev] = f.seat.champ;
  persist();
  detailChamp = f.seat.champ;
  sfx("select");
  renderLobby();
}

function toggleReady(dev: string) {
  const f = findSeat(dev);
  if (!f) return;
  f.seat.ready = !f.seat.ready;
  sfx(f.seat.ready ? "roundwin" : "click");
  renderLobby();
}

function canStartLocal() {
  const seats = lobby.teams.flatMap((t) => t.slice(0, save.size));
  const humans = seats.filter((s) => s.dev);
  if (!humans.length) return "Únete con un mando o el teclado";
  if (humans.some((s) => !s.ready)) return "Falta que alguien diga que está listo";
  return "";
}

/** Mandos en la sala local: cada uno controla su asiento. */
const padPrev = new Map<number, boolean[]>();
const padDirPrev = new Map<number, string>();
function lobbyPads() {
  for (const p of padsRaw()) {
    const before = padPrev.get(p.index) ?? [];
    padPrev.set(p.index, p.buttons);
    const down = (b: number) => !!p.buttons[b] && !before[b];
    const ax = p.axes[0] ?? 0, ay = p.axes[1] ?? 0;
    let d = "";
    if (p.buttons[14] || ax < -0.6) d = "L";
    else if (p.buttons[15] || ax > 0.6) d = "R";
    else if (p.buttons[12] || ay < -0.6) d = "U";
    else if (p.buttons[13] || ay > 0.6) d = "D";
    const nd = d !== padDirPrev.get(p.index) ? d : "";
    padDirPrev.set(p.index, d);
    const dev = `pad${p.index}`;
    const seat = findSeat(dev);
    if (!seat) {
      if (down(0)) joinLocal(dev);
      else if (down(1)) show("title");
      continue;
    }
    if (nd === "L") cycleChamp(dev, -1);
    if (nd === "R") cycleChamp(dev, 1);
    if (nd === "U" || nd === "D" || down(4) || down(5)) if (!seat.seat.ready) moveTeam(dev);
    if (down(0)) toggleReady(dev);
    if (down(1)) seat.seat.ready ? toggleReady(dev) : leaveLocal(dev);
    if (down(2)) $("opt-size").click();
    if (down(9)) startLocal();
  }
}

function lobbyKey(e: KeyboardEvent) {
  if (current !== "lobby" || lobbyKind !== "local" || mode) return;
  if ((e.target as HTMLElement)?.tagName === "INPUT" || e.repeat) return;
  const kb = findSeat("kb");
  switch (e.code) {
    case "Enter":
    case "NumpadEnter":
      if (!kb) joinLocal("kb");
      else if (kb.seat.ready && !canStartLocal()) startLocal();
      else toggleReady("kb");
      break;
    case "Escape":
      if (kb) kb.seat.ready ? toggleReady("kb") : leaveLocal("kb");
      else show("title");
      break;
    case "ArrowLeft": case "KeyA": cycleChamp("kb", -1); break;
    case "ArrowRight": case "KeyD": cycleChamp("kb", 1); break;
    case "ArrowUp": case "ArrowDown": case "KeyW": case "KeyS": if (kb && !kb.seat.ready) moveTeam("kb"); break;
    default: return;
  }
  e.preventDefault();
}

function bindLobby() {
  $("opt-size").onclick = () => {
    if (lobbyKind === "lan") return net?.send({ t: "mode", size: room!.size === 1 ? 2 : 1, wins: room!.wins, arena: room!.arena });
    save.size = save.size === 1 ? 2 : 1;
    // al pasar a 1v1, quien estuviera en el segundo hueco sube al primero si está libre
    if (save.size === 1)
      for (const t of lobby.teams) if (!t[0]!.dev && t[1]!.dev) [t[0], t[1]] = [t[1]!, t[0]!];
    for (const t of lobby.teams) if (save.size === 1) t[1]!.dev = null;
    persist();
    sfx("select");
    renderLobby();
  };
  $("opt-wins").onclick = () => {
    const next = (w: number) => (w >= 4 ? 1 : w + 1);
    if (lobbyKind === "lan") return net?.send({ t: "mode", size: room!.size, wins: next(room!.wins), arena: room!.arena });
    save.wins = next(save.wins);
    persist();
    sfx("select");
    renderLobby();
  };
  $("opt-arena").onclick = () => {
    if (lobbyKind === "lan") return net?.send({ t: "mode", size: room!.size, wins: room!.wins, arena: (room!.arena + 1) % ARENAS.length });
    save.arena = (save.arena + 1) % ARENAS.length;
    persist();
    sfx("select");
    renderLobby();
  };
  $("opt-diff").onclick = () => {
    if (lobbyKind === "lan") {
      const d = (((room!.seats.flat().find((s) => s.owner === 0) ?? room!.seats[0]![0]!).diff + 1) % 3) as Difficulty;
      for (const t of [0, 1]) for (const s of [0, 1]) net?.send({ t: "bot", team: t, slot: s, diff: d });
      return;
    }
    save.diff = ((save.diff + 1) % 3) as Difficulty;
    for (const t of lobby.teams) for (const st of t) st.diff = save.diff;
    persist();
    sfx("select");
    renderLobby();
  };
  $("lobby-kb").onclick = () => (findSeat("kb") ? leaveLocal("kb") : joinLocal("kb"));
  $("lobby-ready").onclick = () => {
    if (lobbyKind === "lan") {
      const mine = room!.seats.flat().find((s) => s.owner === net?.id);
      net?.send({ t: "ready", v: !mine?.ready });
    } else toggleReady("kb");
  };
  $("lobby-start").onclick = () => (lobbyKind === "lan" ? net?.send({ t: "start" }) : startLocal());
  $("lobby-back").onclick = () => {
    if (lobbyKind === "lan") {
      net?.send({ t: "leave" });
      show("mp");
    } else show("title");
  };
  window.addEventListener("keydown", lobbyKey);
}

// ================================================================ partida local
function startLocal() {
  const why = canStartLocal();
  if (why) return toast(why);
  const specs: FighterSpec[] = [];
  locals = [];
  const tags = humanTags();
  for (let t = 0; t < 2; t++)
    for (let s = 0; s < save.size; s++) {
      const seat = lobby.teams[t]![s]!;
      const id = t * 2 + s + 1;
      const tag = seat.dev ? tags.get(seat.dev)! : "";
      const name = seat.dev ? (seat.dev === "kb" && save.name ? save.name : tag) : `CPU ${CHAMPS[seat.champ].name}`;
      specs.push({ id, name, champ: seat.champ, team: t, human: !!seat.dev, diff: seat.diff });
      if (seat.dev) {
        const dev: Device = seat.dev === "kb" ? { kind: "kb" } : { kind: "pad", index: +seat.dev.slice(3) };
        locals.push({ id, dev, devKey: seat.dev, tag: locals.length || tags.size > 1 ? tag : "", hp: 0, ax: t ? -1 : 1, ay: 0 });
      }
    }
  const seed = (Math.random() * 2 ** 31) | 0;
  world = new World({ seed, wins: save.wins, arena: save.arena }, specs);
  // ?full: los humanos empiezan con la energía llena (para probar definitivas)
  if (new URLSearchParams(location.search).has("full")) for (const f of world.fighters) if (f.human) f.energy = 100;
  mode = "local";
  beginGame(seed, save.arena);
}

function beginGame(seed: number, arena: number) {
  $("menus").classList.add("hidden");
  $("game").classList.remove("hidden");
  $("results").classList.add("hidden");
  $("pause").classList.add("hidden");
  setManualPads(false);
  renderer = new Renderer($<HTMLCanvasElement>("view"), seed);
  renderer.showDamage = save.dmgNums;
  renderer.shakeOn = save.shake;
  renderer.setArena(arena);
  paused = false;
  resultsShown = false;
  lastSnap = null;
  snapBuf = [];
  acc = 0;
  hudBuilt = "";
  playMusic(ARENAS[arena]!.track);
  cancelAnimationFrame(raf);
  lastT = performance.now();
  raf = requestAnimationFrame(frame);
}

function quitGame() {
  cancelAnimationFrame(raf);
  world = null;
  renderer = null;
  const wasMp = mode === "mp";
  mode = null;
  if (wasMp && room) {
    lobbyKind = "lan";
    show("lobby");
  } else show(wasMp ? "mp" : "title");
}

// ================================================================ bucle
function enemyAssist(me: FSnap, s: Snap) {
  return (ax: number, ay: number): [number, number] => {
    if (!save.assist) return [ax, ay];
    const a = Math.atan2(ay, ax);
    let best: FSnap | null = null, bd = 0.2;
    for (const e of s.f) {
      if (e.team === me.team || e.st & (ST.dead | ST.stealth)) continue;
      const dx = e.x - me.x, dy = e.y - me.y, d = Math.hypot(dx, dy);
      if (d > 320) continue;
      const diff = Math.abs(angleDiff(a, Math.atan2(dy, dx)));
      if (diff < bd) {
        bd = diff;
        best = e;
      }
    }
    return best ? [best.x - me.x, best.y - me.y] : [ax, ay];
  };
}

function readLocal(lp: LocalPlayer, s: Snap | null): Input {
  const me = s?.f.find((f) => f.id === lp.id);
  if (!me || !renderer) return NO_INPUT;
  const i = readDevice(lp.dev, me, (x, y) => renderer!.toWorld(x, y), lp.dev.kind === "pad" ? enemyAssist(me, s!) : undefined);
  lp.ax = i.ax;
  lp.ay = i.ay;
  return i;
}

function frame(t: number) {
  raf = requestAnimationFrame(frame);
  const dt = Math.min(0.1, (t - lastT) / 1000);
  lastT = t;
  if (!renderer) return;
  if (takePause() && mode === "local" && !resultsShown) togglePause();

  let snap: Snap | null = null;
  if (mode === "local" && world) {
    if (!paused) {
      for (const lp of locals) world.setInput(lp.id, readLocal(lp, lastSnap));
      acc += dt;
      while (acc >= DT) {
        world.step(DT);
        acc -= DT;
      }
    }
    snap = world.snapshot();
    handleEvents(snap.ev, snap);
  } else if (mode === "mp") {
    snap = interpSnap(t);
    if (snap && net) {
      const lp = locals[0];
      if (lp) {
        const i = readLocal(lp, snap);
        if (t - lastSend > 33) {
          lastSend = t;
          net.send({ t: "in", i });
        }
      }
    }
  }
  if (!snap) return;
  lastSnap = snap;
  const views: LocalView[] = locals.map((l) => ({ id: l.id, ax: l.ax, ay: l.ay, tag: l.tag }));
  renderer.draw(snap, views, dt, t / 1000);
  updateHud(snap, dt);
  if (snap.phase === "over" && !resultsShown) {
    resultsShown = true;
    setTimeout(() => showResults(snap!), 900);
  }
}

function togglePause() {
  paused = !paused;
  $("pause").classList.toggle("hidden", !paused);
  $("pause-keys").innerHTML = CONTROLS;
  suspendAudio(false);
}

function handleEvents(evs: Ev[], s: Snap) {
  renderer?.onEvents(evs);
  for (const e of evs) {
    if (e[0] === "s") sfx(e[1] as string, 0.03);
    else if (e[0] === "t") banner(e[1] as string, e[2] as string);
    else if (e[0] === "k") {
      const lp = locals.find((l) => l.id === e[1]);
      if (lp && lp.dev.kind === "pad") rumble(500, 1, 1, lp.dev.index);
    }
  }
  // vibración al recibir daño
  for (const lp of locals) {
    const f = s.f.find((q) => q.id === lp.id);
    if (!f) continue;
    if (f.hp < lp.hp && lp.dev.kind === "pad") rumble(120, Math.min(1, (lp.hp - f.hp) / 25), 0.3, lp.dev.index);
    lp.hp = f.hp;
  }
}

function banner(text: string, col: string) {
  const b = $("banner");
  b.textContent = text;
  b.style.color = col;
  b.classList.remove("show");
  void b.offsetWidth;
  b.classList.add("show");
  bannerT = 1.6;
}

// ---- LAN: interpolación entre instantáneas
const INTERP_DELAY = 70;
function interpSnap(now: number): Snap | null {
  if (!snapBuf.length) return null;
  const target = now - INTERP_DELAY;
  while (snapBuf.length > 2 && snapBuf[1]!.t <= target) snapBuf.shift();
  const a = snapBuf[0]!, b = snapBuf[1];
  if (!b || target <= a.t) return a.s;
  const k = Math.min(1, (target - a.t) / (b.t - a.t || 1));
  const s: Snap = { ...b.s, ev: [] };
  s.f = b.s.f.map((fb) => {
    const fa = a.s.f.find((q) => q.id === fb.id);
    if (!fa || Math.hypot(fb.x - fa.x, fb.y - fa.y) > 80) return fb;
    return { ...fb, x: fa.x + (fb.x - fa.x) * k, y: fa.y + (fb.y - fa.y) * k, z: fa.z + (fb.z - fa.z) * k };
  });
  const pr = b.s.pr.slice();
  for (let i = 0; i < pr.length; i += PR_STRIDE) {
    for (let j = 0; j < a.s.pr.length; j += PR_STRIDE)
      if (a.s.pr[j] === pr[i]) {
        pr[i + 2] = a.s.pr[j + 2]! + (pr[i + 2]! - a.s.pr[j + 2]!) * k;
        pr[i + 3] = a.s.pr[j + 3]! + (pr[i + 3]! - a.s.pr[j + 3]!) * k;
        break;
      }
  }
  s.pr = pr;
  return s;
}

// ================================================================ HUD
let hudBuilt = "";
const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

function buildHud(s: Snap) {
  for (const t of [0, 1])
    $(`team${t}`).innerHTML = s.f.filter((f) => f.team === t).map((f) =>
      `<div class="tf t${t}" id="tf${f.id}"><img src="${robotURL(f.champ, 2, t === 1)}" alt=""><div class="nm">${esc(f.name)}</div><div class="bar t${t}"><div class="hp"></div><div class="sh"></div></div><div class="bar en"><div></div></div></div>`).join("");
  const small = locals.length > 2;
  $("bars").innerHTML = locals.map((lp) => {
    const f = s.f.find((q) => q.id === lp.id)!;
    const c = CHAMPS[f.champ];
    const pad = lp.dev.kind === "pad";
    const sk = SLOTS.map((sl) => `<div class="s ${c.skills[sl].ult ? "ult" : ""}" id="sk${lp.id}${sl}"><img src="${iconURL(c.skills[sl].icon, 3)}" alt=""><div class="cd"></div><div class="n"></div><span class="k">${keyLabel(sl, pad)}</span></div>`).join("");
    return `<div class="pb t${f.team} ${small ? "small" : ""}" id="pb${lp.id}"><div class="top"><img src="${robotURL(f.champ, 2)}" alt=""><div class="col"><div class="nm">${esc(c.name)} <small>${esc(lp.tag || f.name)}</small></div><div class="bar t${f.team}"><div class="hp"></div><div class="sh"></div><span></span></div><div class="bar en"><div></div></div></div></div><div class="sks">${sk}</div></div>`;
  }).join("");
  hudBuilt = s.f.map((f) => f.id + f.champ).join() + locals.length;
}

function setBar(el: Element | null, f: FSnap) {
  if (!el) return;
  const hp = el.querySelector<HTMLElement>(".hp")!, sh = el.querySelector<HTMLElement>(".sh")!;
  const k = (100 * f.hp) / f.maxHp;
  hp.style.width = `${k}%`;
  sh.style.left = `${k}%`;
  sh.style.width = `${Math.min(100 - k, (100 * f.sh) / f.maxHp)}%`;
  const sp = el.querySelector("span");
  if (sp) sp.textContent = `${f.hp}/${f.maxHp}`;
}

function updateHud(s: Snap, dt: number) {
  const key = s.f.map((f) => f.id + f.champ).join() + locals.length;
  if (key !== hudBuilt) buildHud(s);
  $("score0").textContent = "●".repeat(s.score[0]) + "○".repeat(Math.max(0, s.wins - s.score[0]));
  $("score1").textContent = "●".repeat(s.score[1]) + "○".repeat(Math.max(0, s.wins - s.score[1]));
  $("round").textContent = `R${s.round}`;
  $("clock").textContent = s.phase === "fight" ? fmt(s.pt) : s.phase === "count" ? "Preparados" : "";
  const nx = $("next");
  let txt = "", hot = false;
  if (s.phase === "fight") {
    if (s.pt < CAPSULE_AT) txt = `Cápsulas en ${Math.ceil(CAPSULE_AT - s.pt)} s`;
    else if (s.pt < ORB_AT) txt = `Orbe en ${Math.ceil(ORB_AT - s.pt)} s`;
    else if (s.pt < STORM_AT) txt = `Muerte súbita en ${Math.ceil(STORM_AT - s.pt)} s`;
    else {
      txt = "¡MUERTE SÚBITA!";
      hot = true;
    }
  }
  nx.textContent = txt;
  nx.classList.toggle("hot", hot);
  $("count").textContent = s.phase === "count" && s.pt > 0 ? String(Math.ceil(s.pt)) : "";
  if (bannerT > 0) {
    bannerT -= dt;
    if (bannerT <= 0) $("banner").classList.remove("show");
  }

  for (const f of s.f) {
    const tf = document.getElementById(`tf${f.id}`);
    if (!tf) continue;
    tf.classList.toggle("dead", !!(f.st & ST.dead));
    setBar(tf.querySelector(".bar"), f);
    const en = tf.querySelector<HTMLElement>(".bar.en")!;
    en.firstElementChild!.setAttribute("style", `width:${f.en}%`);
    en.classList.toggle("full", f.en >= 100);
  }
  for (const lp of locals) {
    const f = s.f.find((q) => q.id === lp.id);
    const pb = document.getElementById(`pb${lp.id}`);
    if (!f || !pb) continue;
    pb.classList.toggle("dead", !!(f.st & ST.dead));
    setBar(pb.querySelector(".bar"), f);
    const en = pb.querySelector<HTMLElement>(".bar.en")!;
    en.firstElementChild!.setAttribute("style", `width:${f.en}%`);
    en.classList.toggle("full", f.en >= 100);
    const def = CHAMPS[f.champ];
    const silenced = !!(f.st & (ST.silence | ST.stun | ST.sleep));
    SLOTS.forEach((sl, i) => {
      const el = document.getElementById(`sk${lp.id}${sl}`);
      if (!el) return;
      const sk = def.skills[sl];
      const cd = f.cd[i]! / 10;
      const cdEl = el.children[1] as HTMLElement, n = el.children[2] as HTMLElement;
      if (sk.ult) {
        const ready = f.en >= 100 && cd <= 0;
        el.classList.toggle("ready", ready);
        cdEl.style.height = ready ? "0%" : `${100 - f.en}%`;
        n.textContent = ready ? "" : `${f.en}%`;
      } else {
        cdEl.style.height = cd > 0 ? `${Math.min(100, (cd / sk.cd) * 100)}%` : "0%";
        n.textContent = cd > 0.05 && sk.cd >= 2 ? (cd < 1 ? cd.toFixed(1) : String(Math.ceil(cd))) : "";
      }
      el.classList.toggle("busy", f.cs === i);
      el.classList.toggle("off", silenced && sl !== "r2");
    });
  }
}

// ================================================================ resultados
function showResults(s: Snap) {
  const w = s.winner;
  const myTeams = new Set(locals.map((l) => s.f.find((f) => f.id === l.id)?.team));
  let title = w === 0 ? "¡GANA EL EQUIPO AZUL!" : "¡GANA EL EQUIPO ROJO!";
  if (myTeams.size === 1) {
    const mine = [...myTeams][0];
    title = mine === w ? "¡VICTORIA!" : "DERROTA";
    sfx(mine === w ? "victory" : "defeat");
    if (mode === "local") {
      save.stats.games++;
      if (mine === w) save.stats.wins++;
      persist();
    }
  } else sfx("victory");
  $("res-title").textContent = title;
  $("res-title").style.color = w === 0 ? "var(--t0)" : "var(--t1)";
  $("res-score").innerHTML = `<span class="t0">${TEAM_NAMES[0]} ${s.score[0]}</span> — <span class="t1">${s.score[1]} ${TEAM_NAMES[1]}</span>`;
  const score = (f: FSnap) => f.dm + f.hl * 0.8 + f.ko * 30;
  const mvp = s.f.reduce((m, f) => (score(f) > score(m) ? f : m), s.f[0]!);
  $("res-table").innerHTML = `<tr><th>Robot</th><th>Daño</th><th>Curación</th><th>KOs</th></tr>` +
    [...s.f].sort((a, b) => a.team - b.team || score(b) - score(a)).map((f) =>
      `<tr class="t${f.team}"><td><img src="${robotURL(f.champ, 2)}" alt="">${esc(f.name)}${f === mvp ? ` <span class="mvp">★ MVP</span>` : ""}</td><td>${f.dm}</td><td>${f.hl}</td><td>${f.ko}</td></tr>`).join("");
  const host = mode !== "mp" || room?.host === net?.id;
  $<HTMLButtonElement>("btn-again").disabled = !host;
  $("btn-lobby").textContent = "Volver a la sala";
  $("results").classList.remove("hidden");
  playMusic("results");
}

function bindGame() {
  $("btn-resume").onclick = () => togglePause();
  $("btn-quit").onclick = () => {
    if (mode === "mp") net?.send({ t: "leave" });
    quitGame();
  };
  $("btn-again").onclick = () => {
    if (mode === "mp") net?.send({ t: "start" });
    else startLocal();
  };
  $("btn-lobby").onclick = () => {
    const wasMp = mode === "mp";
    cancelAnimationFrame(raf);
    world = null;
    renderer = null;
    mode = null;
    lobbyKind = wasMp ? "lan" : "local";
    if (!wasMp) for (const t of lobby.teams) for (const s of t) s.ready = false;
    show(wasMp && room ? "lobby" : wasMp ? "mp" : "lobby");
  };
  $("btn-menu").onclick = () => {
    if (mode === "mp") {
      net?.send({ t: "leave" });
      room = null;
    }
    cancelAnimationFrame(raf);
    world = null;
    renderer = null;
    mode = null;
    show("title");
  };
}

// ================================================================ LAN
function renderMp() {
  $<HTMLInputElement>("mp-name").value = save.name;
  $("mp-err").textContent = "";
  fetch("/api/info").then((r) => r.json()).then((d: { urls: string[] }) => {
    $("mp-hint").innerHTML = d.urls.length ? `Tus amigos pueden entrar desde: <b>${d.urls.join(" · ")}</b>` : "";
  }).catch(() => {});
}

function ensureNet() {
  if (net) return net;
  net = new Net();
  net.onMsg = onServer;
  net.onClose = () => {
    net = null;
    room = null;
    if (mode === "mp") {
      cancelAnimationFrame(raf);
      mode = null;
    }
    show("mp");
    $("mp-err").textContent = "Se ha perdido la conexión con el servidor.";
  };
  const name = $<HTMLInputElement>("mp-name").value.trim() || save.name || "Jugador";
  save.name = name.slice(0, 12);
  persist();
  net.send({ t: "hello", name: save.name });
  return net;
}

function onServer(m: ServerMsg) {
  switch (m.t) {
    case "room":
      room = m;
      if (!mode) {
        lobbyKind = "lan";
        if (current !== "lobby") show("lobby");
        else renderLobby();
      }
      break;
    case "start": {
      myFighter = m.you;
      locals = myFighter ? [{ id: myFighter, dev: padsRaw().length && !mousePos().moved ? { kind: "pad", index: padsRaw()[0]!.index } : { kind: "kb" }, devKey: "", tag: "", hp: 0, ax: 1, ay: 0 }] : [];
      mode = "mp";
      beginGame(room ? room.code.charCodeAt(0) * 997 : 1, room?.arena ?? 0);
      break;
    }
    case "snap":
      if (mode !== "mp") break;
      snapBuf.push({ t: performance.now(), s: m.s });
      if (snapBuf.length > 30) snapBuf.shift();
      handleEvents(m.s.ev, m.s);
      break;
    case "left":
      room = null;
      break;
    case "err":
      $("mp-err").textContent = m.msg;
      toast(m.msg);
      break;
  }
}

function bindMp() {
  $("mp-create").onclick = () => ensureNet().send({ t: "create" });
  $("mp-join").onclick = () => {
    const code = $<HTMLInputElement>("mp-code").value.trim().toUpperCase();
    if (code.length !== 4) return ($("mp-err").textContent = "El código tiene 4 letras.");
    ensureNet().send({ t: "join", code });
  };
}

// ================================================================ arranque
function init() {
  initInput();
  initPad();
  setVolume(save.vol, save.muted);
  bindOptions();
  bindLobby();
  bindGame();
  bindMp();
  for (const b of document.querySelectorAll<HTMLElement>("[data-go]"))
    b.onclick = () => {
      sfx("click");
      const go = b.dataset.go as Screen;
      if (go === "lobby") lobbyKind = "local";
      show(go);
    };
  const unlock = () => {
    initAudio();
    if (audioRunning()) $("sndhint").classList.add("hidden");
    playMusic(mode ? ARENAS[lastSnap?.arena ?? 0]!.track : current === "lobby" ? "lobby" : "menu");
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
  onPadPress(() => {
    initAudio();
    if (!audioRunning()) $("sndhint").classList.remove("hidden");
    else $("sndhint").classList.add("hidden");
  });
  onPadConnect((id) => {
    toast(`Mando conectado: ${id.split("(")[0]!.trim().slice(0, 30)}`);
    if (current === "lobby") renderLobby();
  });
  document.addEventListener("visibilitychange", () => {
    suspendAudio(document.hidden);
    if (document.hidden && mode === "local" && !paused && !resultsShown) togglePause();
  });
  window.addEventListener("resize", () => renderer?.resize());
  // la sala local lee los mandos cada fotograma
  const tick = () => {
    requestAnimationFrame(tick);
    if (current === "lobby" && lobbyKind === "local" && !mode && !$("menus").classList.contains("hidden")) lobbyPads();
  };
  requestAnimationFrame(tick);
  // ?play=merlix,coltron arranca directamente un 1v1 (pruebas)
  const q = new URLSearchParams(location.search).get("play");
  show("title");
  if (q) {
    const [a, b] = q.split(",") as ChampId[];
    lobby.teams[0]![0] = { dev: "kb", champ: CHAMPS[a!] ? a! : "beetlix", ready: true, diff: save.diff };
    if (b && CHAMPS[b]) lobby.teams[1]![0]!.champ = b;
    startLocal();
  }
}

init();
