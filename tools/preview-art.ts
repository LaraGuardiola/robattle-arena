// Genera art-preview.png con todos los sprites (para revisar el pixel art
// sin abrir el juego).   bun tools/preview-art.ts [salida.png] [escala]
import { deflateSync } from "node:zlib";
import { CAPSULE_ART, ICONS, PROJ_ART, ROBOT_ART } from "../src/client/art";
import { artPixels, rigPixels, type Pixels } from "../src/client/pixels";

const out = process.argv[2] ?? "art-preview.png";
const S = Number(process.argv[3] ?? 4);

const rows: Pixels[][] = [
  Object.values(ROBOT_ART).flatMap((r) => [0, 1, 2].map((i) => rigPixels(r, i))),
  [...Object.values(PROJ_ART), CAPSULE_ART].map((a) => artPixels(a)),
  Object.values(ICONS).map((a) => artPixels(a)),
];

const GAP = 3;
const W = Math.max(...rows.map((r) => r.reduce((a, p) => a + p.w + GAP, GAP)));
const H = rows.reduce((a, r) => a + Math.max(...r.map((p) => p.h)) + GAP, GAP);
const img = new Uint8Array(W * S * H * S * 4);
// fondo tipo hierba para ver el contorno
for (let i = 0; i < img.length; i += 4) img.set([76, 140, 74, 255], i);
let oy = GAP;
for (const r of rows) {
  let ox = GAP;
  for (const p of r) {
    for (let y = 0; y < p.h; y++)
      for (let x = 0; x < p.w; x++) {
        const i = (y * p.w + x) * 4;
        if (!p.data[i + 3]) continue;
        for (let sy = 0; sy < S; sy++)
          for (let sx = 0; sx < S; sx++) {
            const o = (((oy + y) * S + sy) * W * S + (ox + x) * S + sx) * 4;
            img.set([p.data[i]!, p.data[i + 1]!, p.data[i + 2]!, 255], o);
          }
      }
    ox += p.w + GAP;
  }
  oy += Math.max(...r.map((p) => p.h)) + GAP;
}

// ---- PNG mínimo
const crcT = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
const crc = (b: Uint8Array) => {
  let c = -1;
  for (const x of b) c = crcT[(c ^ x) & 255]! ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
const chunk = (type: string, data: Uint8Array) => {
  const b = new Uint8Array(12 + data.length);
  const dv = new DataView(b.buffer);
  dv.setUint32(0, data.length);
  b.set(new TextEncoder().encode(type), 4);
  b.set(data, 8);
  dv.setUint32(8 + data.length, crc(b.subarray(4, 8 + data.length)));
  return b;
};
const w = W * S, h = H * S;
const raw = new Uint8Array((w * 4 + 1) * h);
for (let y = 0; y < h; y++) raw.set(img.subarray(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1);
const ihdr = new Uint8Array(13);
new DataView(ihdr.buffer).setUint32(0, w);
new DataView(ihdr.buffer).setUint32(4, h);
ihdr.set([8, 6, 0, 0, 0], 8);
await Bun.write(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", new Uint8Array())]));
console.log(`${out}: ${w}x${h}`);
