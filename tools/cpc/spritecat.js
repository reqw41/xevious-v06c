#!/usr/bin/env node
// Каталог того, что рисуют процедуры главного цикла (3AAFh–3C76h): на каждом вызове примитива вывода
// после возврата вырезается область экрана вокруг (X=A, Y=L) из памяти по таблицам строк A300h/A400h.
// Итог — листы build/cov/sprites/<процедура>.png (по уникальным картинкам) и index.txt.
//   node tools/cpc/spritecat.js [--areas 0,1,...] [--frames N]
'use strict';
const fs = require('fs');
const path = require('path');
const CPC = require('./cpc6128.js');
const png = require('./png.js');
const ROOT = path.resolve(__dirname, '../..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
const AREAS = arg('areas', '0,1,2,3,4,5,6,7').split(',').map(Number), FRAMES = +arg('frames', 5000);
const OUT = path.join(ROOT, 'build/cov/sprites');
fs.mkdirSync(OUT, { recursive: true });
// примитивы вывода (вход: A = X в парах точек, L = Y)
const PRIM = new Set([0x0cab, 0x0efd, 0x0eae, 0x1219, 0x13df, 0x1354, 0x0850, 0x0904, 0x0a30, 0x09b5, 0x0a92, 0x1334]);
const PAL = [[0, 0, 0], [255, 255, 128], [0, 128, 255], [0, 160, 0]];   // перья 0..3 условно
const W = 16, H = 32;          // байт × строк вокруг точки
const cat = new Map();          // 'рутина/примитив' -> Map(hash -> {img, n, x, y})

function crop(m, x, y) {
  const img = new Uint8Array(W * 4 * H);
  for (let r = 0; r < H; r++) {
    const yy = (y - 4 + r) & 0xff;
    const base = m.peek(0xa300 + yy) | (m.peek(0xa400 + yy) << 8);
    for (let b = 0; b < W; b++) {
      const v = m.peek((base + (x >> 1) - 2 + b) & 0xffff);
      for (let i = 0; i < 4; i++) img[r * W * 4 + b * 4 + i] = ((v >> (7 - i)) & 1) | (((v >> (3 - i)) & 1) << 1);
    }
  }
  return img;
}

for (const area of AREAS) {
  const m = new CPC(path.join(ROOT, 'ref/cpc/xevious.dsk'));
  m.boot('disc.bin');
  const stack = [];   // {t, ret, sp, site, prim?, x, y}
  const step0 = m.step.bind(m);
  m.step = function () {
    const cpu = m.cpu, pc = cpu.get_pc(), sp = cpu.getState().sp;
    const intr = m.intPending && cpu.get_iff1();
    const op = m.peek(pc), s0 = cpu.getState();
    const c = step0();
    const s = cpu.getState(), npc = s.pc, nsp = s.sp;
    if (nsp === ((sp - 2) & 0xffff)) {
      let ret = -1;
      if (intr) ret = pc;
      else if ((op === 0xcd || (op & 0xc7) === 0xc4) && npc !== pc + 3) ret = pc + 3;
      if (ret >= 0) { stack.push({ t: intr ? -1 : npc, ret, sp, site: pc, x: s0.a, y: s0.l }); return c; }
    }
    while (stack.length) {
      const f = stack[stack.length - 1];
      if ((npc === f.ret && nsp >= f.sp) || nsp > f.sp + 0x40) {
        stack.pop();
        if (PRIM.has(f.t) && m.frames > 300) {
          const top = stack.find((g) => g.site >= 0x3aaf && g.site < 0x3c80);
          const key = `${top ? top.t.toString(16).padStart(4, '0') : 'xxxx'}_${f.t.toString(16).padStart(4, '0')}`;
          const img = crop(m, f.x, f.y);
          let h = 0; for (const v of img) h = (h * 31 + v) >>> 0;
          if (!cat.has(key)) cat.set(key, new Map());
          const e = cat.get(key);
          if (e.has(h)) e.get(h).n++; else if (e.size < 40) e.set(h, { img, n: 1, x: f.x, y: f.y, area });
        }
      } else break;
    }
    return c;
  };
  let cur = [], left = 0, seed = 11 + area;
  const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
  const KEYS = [['J_LEFT', 'J_FIRE1'], ['J_RIGHT', 'J_FIRE2'], ['J_UP', 'J_FIRE1', 'J_FIRE2'], ['J_DOWN', 'J_FIRE2'],
    ['J_FIRE1', 'J_FIRE2'], ['J_LEFT'], ['J_RIGHT'], []];
  m.onFrame = (f) => {
    if (f === 100) m.ram[0x3e5a] = area;
    if (f >= 100 && f < 110) { m.keysOnly(['J_FIRE1']); return; }
    m.ram[0x3d39] = 3;
    if (--left <= 0) { cur = KEYS[(rnd() * KEYS.length) | 0]; left = 5 + ((rnd() * 30) | 0); }
    m.keysOnly(cur);
  };
  m.runFrames(FRAMES);
  console.log(`зона ${area + 1}: ${cat.size} пар процедура/примитив`);
}

let idx = '';
const S = 3, PW = W * 4 * S, PH = H * S, COLS = 10;
for (const [key, e] of [...cat.entries()].sort()) {
  const list = [...e.values()].sort((a, b) => b.n - a.n);
  const rows = Math.ceil(list.length / COLS), w = COLS * (PW + 4), h = rows * (PH + 4);
  const rgb = new Uint8Array(w * h * 3).fill(64);
  list.forEach((it, i) => {
    const ox = (i % COLS) * (PW + 4), oy = Math.floor(i / COLS) * (PH + 4);
    for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
      const c = PAL[it.img[Math.floor(y / S) * W * 4 + Math.floor(x / S)]];
      const o = ((oy + y) * w + ox + x) * 3; rgb[o] = c[0]; rgb[o + 1] = c[1]; rgb[o + 2] = c[2];
    }
  });
  fs.writeFileSync(path.join(OUT, key + '.png'), png(w, h, rgb));
  idx += `${key} картинок ${list.length} вызовов ${list.reduce((s, v) => s + v.n, 0)} зоны ${[...new Set(list.map((v) => v.area + 1))].join(',')}\n`;
}
fs.writeFileSync(path.join(OUT, 'index.txt'), idx);
console.log(idx);
