// Servidor de Robattle Arena.
//  - Sirve el cliente (Bun empaqueta el TypeScript a partir del HTML).
//  - Salas por código de 4 letras para jugar en red local (1v1 / 2v2, bots en los huecos).
//  - Ejecuta la simulación de cada combate y manda instantáneas a 30 Hz.
//
//   bun run dev     (recarga en caliente)
//   bun run start

import { networkInterfaces } from "node:os";
import type { ServerWebSocket } from "bun";
import index from "./src/client/index.html";
import { ARENAS, CHAMPS, CHAMP_IDS, type ChampId, type Difficulty } from "./src/shared/data";
import type { ClientMsg, SeatInfo, ServerMsg } from "./src/shared/protocol";
import { DT, World, type FighterSpec } from "./src/shared/world";

const PORT = Number(process.env.PORT ?? 3000);
const SNAP_EVERY = 2; // ticks a 60 Hz -> 30 instantáneas/s

interface Client {
  id: number;
  ws: ServerWebSocket<{ id: number }>;
  name: string;
  room: Room | null;
}

interface Room {
  code: string;
  host: number;
  clients: Map<number, Client>;
  seats: SeatInfo[][];
  size: 1 | 2;
  wins: number;
  arena: number;
  world: World | null;
  /** id de cliente -> id de robot en la partida */
  fighterOf: Map<number, number>;
  loop: ReturnType<typeof setInterval> | null;
  endAt: number;
}

const clients = new Map<number, Client>();
const rooms = new Map<string, Room>();
let nextId = 1;

function lanUrls() {
  const out: string[] = [];
  for (const [name, list] of Object.entries(networkInterfaces())) {
    if (/^(docker|br-|veth|virbr)/.test(name)) continue;
    for (const a of list ?? []) if (a.family === "IPv4" && !a.internal) out.push(`http://${a.address}:${PORT}`);
  }
  return out;
}

const send = (c: Client, m: ServerMsg) => c.ws.send(JSON.stringify(m));
const topic = (r: Room) => `room:${r.code}`;
const publish = (r: Room, m: ServerMsg) => server.publish(topic(r), JSON.stringify(m));
const randChamp = () => CHAMP_IDS[Math.floor(Math.random() * CHAMP_IDS.length)]!;
const emptySeat = (diff: Difficulty = 1): SeatInfo => ({ owner: 0, name: "", champ: randChamp(), ready: false, diff });

function roomState(r: Room): ServerMsg {
  return { t: "room", code: r.code, host: r.host, seats: r.seats, size: r.size, wins: r.wins, arena: r.arena, inGame: !!r.world };
}

function newCode() {
  const L = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  let code: string;
  do code = Array.from({ length: 4 }, () => L[Math.floor(Math.random() * L.length)]).join("");
  while (rooms.has(code));
  return code;
}

function seatOf(r: Room, id: number) {
  for (let t = 0; t < 2; t++) for (let s = 0; s < 2; s++) if (r.seats[t]![s]!.owner === id) return { t, s };
  return null;
}

function freeSeat(r: Room) {
  const humans = [0, 1].map((t) => r.seats[t]!.slice(0, r.size).filter((s) => s.owner > 0).length);
  const order = humans[0]! <= humans[1]! ? [0, 1] : [1, 0];
  for (const t of order) for (let s = 0; s < r.size; s++) if (r.seats[t]![s]!.owner === 0) return { t, s };
  return null;
}

function joinRoom(c: Client, r: Room) {
  leaveRoom(c);
  let seat = freeSeat(r);
  if (!seat && r.size === 1) {
    r.size = 2;
    seat = freeSeat(r);
  }
  if (!seat) return send(c, { t: "err", msg: "La sala está llena (máximo 4)." });
  c.room = r;
  r.clients.set(c.id, c);
  const s = r.seats[seat.t]![seat.s]!;
  Object.assign(s, { owner: c.id, name: c.name, ready: false });
  c.ws.subscribe(topic(r));
  publish(r, roomState(r));
}

function leaveRoom(c: Client) {
  const r = c.room;
  if (!r) return;
  c.room = null;
  r.clients.delete(c.id);
  c.ws.unsubscribe(topic(r));
  const seat = seatOf(r, c.id);
  if (seat) Object.assign(r.seats[seat.t]![seat.s]!, { owner: 0, name: "", ready: false });
  const fid = r.fighterOf.get(c.id);
  if (fid && r.world) r.world.dropHuman(fid);
  if (!r.clients.size) {
    stopGame(r);
    rooms.delete(r.code);
    return;
  }
  if (r.host === c.id) r.host = r.clients.keys().next().value!;
  publish(r, roomState(r));
}

function startGame(r: Room) {
  const seed = (Math.random() * 2 ** 31) | 0;
  const specs: FighterSpec[] = [];
  r.fighterOf.clear();
  for (let t = 0; t < 2; t++)
    for (let s = 0; s < r.size; s++) {
      const seat = r.seats[t]![s]!;
      const id = t * 2 + s + 1;
      const human = seat.owner > 0;
      specs.push({ id, name: human ? seat.name : `CPU ${CHAMPS[seat.champ].name}`, champ: seat.champ, team: t, human, diff: seat.diff });
      if (human) r.fighterOf.set(seat.owner, id);
    }
  const w = new World({ seed, wins: r.wins, arena: r.arena }, specs);
  r.world = w;
  r.endAt = 0;
  for (const c of r.clients.values()) send(c, { t: "start", you: r.fighterOf.get(c.id) ?? 0 });
  publish(r, roomState(r));

  let last = performance.now(), acc = 0;
  if (r.loop) clearInterval(r.loop);
  r.loop = setInterval(() => {
    const now = performance.now();
    acc += Math.min(0.25, (now - last) / 1000);
    last = now;
    while (acc >= DT) {
      acc -= DT;
      w.step(DT);
      if (w.tick % SNAP_EVERY === 0) publish(r, { t: "snap", s: w.snapshot() });
    }
    if (w.winnerDone() && !r.endAt) r.endAt = now + 1500;
    if (r.endAt && now > r.endAt) {
      publish(r, { t: "snap", s: w.snapshot() });
      stopGame(r);
      for (const row of r.seats) for (const s of row) s.ready = false;
      publish(r, roomState(r));
    }
  }, 1000 / 60);
}

function stopGame(r: Room) {
  if (r.loop) clearInterval(r.loop);
  r.loop = null;
  r.world = null;
}

function onMessage(c: Client, m: ClientMsg) {
  const r = c.room;
  const host = r?.host === c.id;
  switch (m.t) {
    case "hello":
      c.name = String(m.name ?? "").trim().slice(0, 12) || `Jugador ${c.id}`;
      break;
    case "create": {
      const room: Room = {
        code: newCode(), host: c.id, clients: new Map(), seats: [0, 1].map(() => [emptySeat(), emptySeat()]),
        size: 1, wins: 3, arena: 0, world: null, fighterOf: new Map(), loop: null, endAt: 0,
      };
      rooms.set(room.code, room);
      joinRoom(c, room);
      break;
    }
    case "join": {
      const target = rooms.get(String(m.code ?? "").toUpperCase());
      if (!target) return send(c, { t: "err", msg: "No existe ninguna sala con ese código." });
      if (target.world) return send(c, { t: "err", msg: "Esa sala está en pleno combate. Espera a que termine." });
      joinRoom(c, target);
      break;
    }
    case "leave":
      leaveRoom(c);
      send(c, { t: "left" });
      break;
    case "seat":
      if (r && !r.world) {
        const t = m.team === 1 ? 1 : 0, s = m.slot === 1 ? 1 : 0;
        if (s >= r.size) return;
        const dst = r.seats[t]![s]!;
        const cur = seatOf(r, c.id);
        if (dst.owner === 0 && cur) {
          const src = r.seats[cur.t]![cur.s]!;
          Object.assign(dst, { owner: c.id, name: c.name, champ: src.champ, ready: false });
          Object.assign(src, { owner: 0, name: "", ready: false, champ: randChamp() });
        }
        publish(r, roomState(r));
      }
      break;
    case "champ":
      if (r && !r.world && m.champ in CHAMPS) {
        const cur = seatOf(r, c.id);
        if (cur) {
          r.seats[cur.t]![cur.s]!.champ = m.champ as ChampId;
          publish(r, roomState(r));
        }
      }
      break;
    case "ready":
      if (r && !r.world) {
        const cur = seatOf(r, c.id);
        if (cur) r.seats[cur.t]![cur.s]!.ready = !!m.v;
        publish(r, roomState(r));
      }
      break;
    case "bot":
      if (r && host && !r.world) {
        const seat = r.seats[m.team === 1 ? 1 : 0]![m.slot === 1 ? 1 : 0]!;
        if (m.diff === 0 || m.diff === 1 || m.diff === 2) seat.diff = m.diff;
        if (seat.owner === 0 && typeof m.champ === "string" && m.champ in CHAMPS) seat.champ = m.champ as ChampId;
        publish(r, roomState(r));
      }
      break;
    case "mode":
      if (r && host && !r.world) {
        const size = m.size === 2 ? 2 : 1;
        // al bajar a 1v1, los humanos del segundo hueco suben al primero si pueden
        if (size === 1)
          for (const row of r.seats) {
            if (row[1]!.owner > 0 && row[0]!.owner === 0) [row[0], row[1]] = [row[1]!, row[0]!];
          }
        if (size === 1 && r.seats.some((row) => row[1]!.owner > 0)) return send(c, { t: "err", msg: "Hay demasiados jugadores para un 1v1." });
        r.size = size;
        r.wins = Math.max(1, Math.min(5, Number(m.wins) | 0 || 3));
        r.arena = Math.max(0, Math.min(ARENAS.length - 1, Number(m.arena) | 0));
        publish(r, roomState(r));
      }
      break;
    case "start":
      if (r && host) {
        const humans = r.seats.flat().slice(0).filter((s) => s.owner > 0);
        if (humans.some((s) => !s.ready && s.owner !== c.id) && !r.world) return send(c, { t: "err", msg: "Falta que alguien diga que está listo." });
        stopGame(r);
        startGame(r);
      }
      break;
    case "in": {
      const fid = r?.fighterOf.get(c.id);
      if (r?.world && fid && m.i) r.world.setInput(fid, m.i);
      break;
    }
  }
}

const server = Bun.serve({
  port: PORT,
  hostname: "0.0.0.0",
  development: process.env.NODE_ENV !== "production",
  routes: {
    "/": index,
    "/api/info": () => Response.json({ urls: lanUrls() }),
  },
  fetch(req, srv) {
    const url = new URL(req.url);
    if (url.pathname === "/ws") {
      if (srv.upgrade(req, { data: { id: nextId++ } })) return;
      return new Response("Se esperaba WebSocket", { status: 400 });
    }
    return new Response("No encontrado", { status: 404 });
  },
  websocket: {
    data: {} as { id: number },
    open(ws) {
      const c: Client = { id: ws.data.id, ws, name: `Jugador ${ws.data.id}`, room: null };
      clients.set(c.id, c);
      send(c, { t: "welcome", id: c.id });
    },
    message(ws, raw) {
      const c = clients.get(ws.data.id);
      if (!c) return;
      let m: ClientMsg;
      try {
        m = JSON.parse(String(raw));
      } catch {
        return;
      }
      onMessage(c, m);
    },
    close(ws) {
      const c = clients.get(ws.data.id);
      if (!c) return;
      leaveRoom(c);
      clients.delete(c.id);
    },
  },
});

console.log(`\n  ⚔️  ROBATTLE ARENA\n`);
console.log(`  Local:   http://localhost:${PORT}`);
for (const u of lanUrls()) console.log(`  En red:  ${u}   <- compártelo con tus amigos`);
console.log("");
