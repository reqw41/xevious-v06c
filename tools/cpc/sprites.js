#!/usr/bin/env node
'use strict';
// Картинки, которые игра выводит, — снятые родными процедурами CPC (данные игры -> только build/gen).
// Процедура запускается на очищенном участке экрана дважды: фон перо 0 и перо 3. Точка, совпавшая в обоих
// прогонах с фоном, — прозрачная; совпавшая между прогонами — непрозрачная, её перо.
// Выход: build/gen/sprites.json — { "имя:картинка": { w, h, dx, dy, px: [строки 'пер0..3' или '.'] } }
//   node tools/cpc/sprites.js
const fs = require('fs');
const path = require('path');
const CPC = require('./cpc6128.js');
const ROOT = path.resolve(__dirname, '../..');
const PLAT = require(path.join(ROOT, 'src/model/platform.js'));
const byName = new Map(PLAT.entries.map((e) => [e.name, e]));
const m = new CPC(path.join(ROOT, 'ref/cpc/xevious.dsk'));
m.boot('disc.bin');
m.onFrame = (f) => m.keysOnly(f >= 100 && f < 110 ? ['J_FIRE1'] : []);
m.runFrames(160);
while (m.cpu.get_pc() !== 0x3aaf) m.step();          // память — как во время игры
const saved = m.ram.slice(), st0 = m.cpu.getState();

const X = 0x40, CAM = m.peek(0x3e4c), Y = (CAM + 0x60) & 0xff;
const line = (y) => (m.peek(0xa300 + (y & 0xff)) | (m.peek(0xa400 + (y & 0xff)) << 8));
const W = 8, H = 40, X0 = (X >> 1) - 2, Y0 = Y - 12;   // участок: 8 байтов CPC (32 точки) × 40 строк
function fill(v) { for (let r = 0; r < H; r++) for (let b = 0; b < W; b++) m.poke(line(Y0 + r) + X0 + b, v); }
function grab() {
  const px = [];
  for (let r = 0; r < H; r++) {
    const row = [];
    for (let b = 0; b < W; b++) {
      const v = m.peek(line(Y0 + r) + X0 + b);
      for (let k = 0; k < 4; k++) row.push(((v >> (7 - k)) & 1) | (((v >> (3 - k)) & 1) << 1));
    }
    px.push(row);
  }
  return px;
}
const TRAP = 0x0000;
function call(at, a, l, words, bg) {
  m.ram.set(saved);
  fill(bg);
  const s = { ...st0, a, l, h: 0, iff1: 0, iff2: 0, halted: false };
  let sp = 0xbf00;
  for (let i = words.length - 1; i >= 0; i--) { sp -= 2; m.poke(sp, words[i] & 0xff); m.poke(sp + 1, words[i] >> 8); }
  sp -= 2; m.poke(sp, TRAP & 0xff); m.poke(sp + 1, TRAP >> 8);
  s.sp = sp; s.pc = at;
  m.cpu.setState(s);
  for (let n = 0; n < 200000; n++) { if (m.cpu.get_pc() === TRAP) return grab(); m.step(); }
  throw new Error(`процедура ${at.toString(16)} не вернулась`);
}
function render(name, a, l, words) {
  const e = byName.get(name);
  const p0 = call(e.at, a, l, words, 0x00), p3 = call(e.at, a, l, words, 0xff);
  let x0 = 99, x1 = -1, y0 = 99, y1 = -1;
  const px = p0.map((row, r) => row.map((v, c) => {
    if (v === 0 && p3[r][c] === 3) return -1;
    if (v !== p3[r][c]) return -2;                  // зависит от фона (не маска): отметим
    if (c < x0) x0 = c; if (c > x1) x1 = c; if (r < y0) y0 = r; if (r > y1) y1 = r;
    return v;
  }));
  if (x1 < 0) return null;
  const rows = [];
  for (let r = y0; r <= y1; r++) rows.push(px[r].slice(x0, x1 + 1).map((v) => (v === -1 ? '.' : v === -2 ? '?' : String(v))).join(''));
  // dx — сдвиг левого края от X (в точках), dy — от Y (в строках)
  return { w: x1 - x0 + 1, h: y1 - y0 + 1, dx: x0 - 8, dy: y0 - 12, px: rows };
}
const out = {};
const BUF = 0xb080;
const jobs = [];
for (const s of [0x8080, 0x8100, 0x8200, 0x8280, 0x8300, 0x8380, 0x8400, 0x8480, 0x8500, 0x8600, 0x8700, 0x8780,
  0x8880, 0x8900, 0x8a00, 0x8b00, 0x8c00, 0x8d00, 0x9080, 0x9100, 0x9200, 0x9300, 0x9380, 0x9900, 0x9a80])
  jobs.push(['draw_sprite', s, [s, BUF]]);
for (const s of [0x8700, 0x8780, 0x9a00]) jobs.push(['draw_ground', s, [s]]);
for (let s = 0x9c00; s <= 0x9d80; s += 0x20) jobs.push(['draw_glyph', s, [s, BUF]]);
jobs.push(['draw_glyph', 0x9880, [0x9880, BUF]], ['draw_glyph', 0x98a0, [0x98a0, BUF]]);
for (const n of ['draw_shot', 'draw_bullet', 'draw_bomb', 'draw_spark', 'draw_z23a', 'draw_z23b', 'draw_z48']) jobs.push([n, 0, [BUF]]);
for (const s of [0x8580, 0x85c0]) jobs.push(['draw_z23c', s, [BUF, s]]);
let bad = 0;
for (const [n, s, w] of jobs) {
  for (const par of [0, 1]) {
    let r;
    try { r = render(n, X + par, Y, w); } catch (e) { console.log(`${n} ${s.toString(16)}: ${e.message}`); bad++; continue; }
    out[`${n}:${s.toString(16)}:${par}`] = r;
    if (r && r.px.some((row) => row.includes('?'))) console.log(`${n} ${s.toString(16)}/${par}: точки, зависящие от фона`);
  }
}
fs.writeFileSync(path.join(ROOT, 'build/gen/sprites.json'), JSON.stringify(out));
const sz = Object.entries(out).filter(([k, v]) => v && k.endsWith(':0')).map(([k, v]) => `${k.split(':').slice(0, 2).join(':')} ${v.w}×${v.h}${v.dx || v.dy ? ` (${v.dx},${v.dy})` : ''}`);
console.log(`картинок ${Object.keys(out).length}, пустых ${Object.values(out).filter((v) => !v).length}, ошибок ${bad}\n` + sz.join('; '));
