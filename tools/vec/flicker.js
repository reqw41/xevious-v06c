#!/usr/bin/env node
'use strict';
/**
 * Мерцание по лучу: модель с растром ({beam: true}) играет случайно; в конце каждого flush — снимок плоскостей экрана
 * (C000h/E000h, всё нарисовано). Каждый кадр растра сравнивается с двумя снимками — последним до начала кадра и
 * первым после: точка, одинаковая в обоих снимках, но другая на растре, — луч застал спрайт стёртым или
 * недорисованным (мерцание). Полоса панели не считается; края поля (по 16 строк: новая верхняя строка, уход строки
 * в полосу) считаются отдельно.
 *   node tools/vec/flicker.js [--frames N] [--seed S] [--calib] [--shots N] [--json FILE] [--rom FILE --labels FILE]
 *   --replay FILE: входы lockvec --record-inputs; хэш логики сверяется на каждом
 *   обновлении. Так сравниваются одни и те же объекты, а не разные исходы игры
 *   после сдвига темпа относительно случайного покадрового ввода.
 * Разбивка целей: только непрозрачные биты спрайтов, присутствующих в обоих снимках.
 * static — дополнительно одинаковые картинка, адрес, сдвиг и отсечение. Категории
 * могут пересекаться; клетки считаются уникально внутри каждой категории.
 * Итог: доля кадров с мерцанием, точек на кадр, число «мерцаний» (клеток 8×8 с ошибкой); --shots — N худших кадров
 * в build/flicker/ (растр | снимок, красным — ошибочные точки).
 */
const path = require('path');
const fs = require('fs');
const { Machine } = require('./machine');
const ROOT = path.resolve(__dirname, '../..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
const FRAMES = +arg('frames', 3000), SHOTS = +arg('shots', 0), CALIB = process.argv.includes('--calib');
let seed = +arg('seed', 7);
const initialSeed = seed;
const replay = arg('replay', '') ? JSON.parse(fs.readFileSync(arg('replay', ''))) : null;
if (replay && replay.differences) throw new Error('Replay содержит расхождения с CPC');
const L = JSON.parse(fs.readFileSync(arg('labels', path.join(ROOT, 'build/xevious.json')), 'utf8'));
const X0 = +arg('x0', 32), Y0 = +arg('y0', 16), FH = 224;     // поле в растре: с точки X0 (по 2 на точку), со строки Y0

const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
const K = [['LEFT', 'SPACE'], ['RIGHT', 'M'], ['UP', 'SPACE', 'M'], ['DOWN', 'M'], ['SPACE', 'M'], ['LEFT'], ['RIGHT'], ['UP'], ['DOWN'], []];
let sc = '100-110 +JA.FIRE1\n', f = 200;
while (!CALIB && f < FRAMES) { const k = K[(rnd() * K.length) | 0], n = 5 + ((rnd() * 30) | 0); if (k.length) sc += `${f}-${f + n} ${k.map((x) => '+' + x).join(' ')}\n`; f += n + 1; }
const m = new Machine({ beam: true });
m.loadROM(arg('rom', path.join(ROOT, 'build/xevious.rom')));
m.profile = false;
m.loadScenario(sc);
if (!CALIB && !replay) m.poke(L['p_death_seq.livd'], 0); // без конца игры
let replayIndex = 0, replayDone = false;
if (replay) {
  m.poke(L.isr_sound, 0xc9); m.poke(L.isr_input, 0xc9); m.poke(L.title_skip, 1);
  m.addBreak(L.main, () => {
    if (replayIndex && require('./logic_hash').logicHash(m, L) !== replay.updates[replayIndex - 1].after) throw new Error(`Replay: логика разошлась на обновлении ${replayIndex}`);
    if (replayIndex === replay.updates.length) { replayDone = true; return true; }
    const row = replay.updates[replayIndex++];
    replay.addresses.forEach((a, i) => m.poke(a, row.input[i]));
    return false;
  });
}
const spriteTrace = require('./sprite_trace').attachSpriteTrace(m, L);

const mem = () => m.memory.bytes;
const planes = () => { const b = mem(), t = m.memory.tobank.bind(m.memory), out = new Uint8Array(0x4000); for (let a = 0; a < 0x4000; a++) out[a] = b[t(0xc000 + a)]; return out; };
// цвет точки (2 бита: C, E) снимка при прокрутке sc
const pix = (P, sc, x, y) => { const row = (sc - y) & 0xff, col = x >> 3, bit = 0x80 >> (x & 7); return (P[col * 256 + row] & bit ? 2 : 0) | (P[0x2000 + col * 256 + row] & bit ? 1 : 0); };
// растр -> цвета 2 бита (по палитре кадра)
function beamField() {
  const map = new Map();
  for (let i = 0; i < 4; i++) { const [r, g, b] = m.palRGB(i); map.set(r | (g << 8) | (b << 16), i); }
  const out = new Uint8Array(256 * FH);
  for (let y = 0; y < FH; y++) for (let x = 0; x < 256; x++) {
    const v = map.get(m.bmp[(Y0 + y) * 576 + X0 + 2 * x] & 0xffffff);
    out[y * 256 + x] = v === undefined ? 0xff : v;
  }
  return out;
}

let snapPrev = null, snapSeq = 0;
const pend = [];                                       // кадры растра, ждущие следующего снимка
let firstInFrame = null;                               // первый снимок, сделанный во время текущего кадра
// снимок — на выходе из flush (он кончается переходом в msg_flip: надписи рисуются последними): по адресу возврата
const snap = () => { snapSeq++; const s = { planes: planes(), sprites: spriteTrace() }; for (const p of pend) if (!p.next) p.next = s; settle(); if (!firstInFrame) firstInFrame = s; snapPrev = s; };
let retAt = -1;
m.addBreak(L.msg_flip, () => {
  const sp = m.cpu.sp, ra = m.read(sp) | (m.read(sp + 1) << 8);
  if (retAt !== ra) { if (retAt >= 0) m.delBreak(retAt); retAt = ra; m.addBreak(ra, () => { snap(); return false; }); }
  return false;
});
const EDGE = 16;
const stat = { edge: 0, frames: 0, bad: 0, px: 0, cells: 0, quiet: 0, quietBad: 0, worst: [] };
const targets = Object.fromEntries(['tabobj', 'tabobjStatic', 'z23', 'z23Static', 'ground', 'groundStatic'].map(k => [k, { frames: 0, bad: 0, px: 0, cells: 0, stablePixels: 0 }]));
function settle() {
  while (pend.length && pend[0].next) {
    const p = pend.shift(), A = p.prev.planes, B = p.next.planes;
    const names = Object.keys(targets), tags = new Uint8Array(0x10000);
    for (const s of p.prev.sprites) {
      const group = { p_upd_tabobj: 'tabobj', p_upd_z23: 'z23', p_upd_ground_tiles: 'ground' }[s.source];
      if (!group) continue;
      const next = p.next.sprites.find(t => t.id === s.id);
      if (!next) continue;
      for (const [a, bits] of s.bits) {
        const both = bits & (next.bits.get(a) || 0);
        const tag = (1 << names.indexOf(group)) | (s.sig === next.sig ? 1 << names.indexOf(group + 'Static') : 0);
        for (let bit = 0; bit < 8; bit++) if (both & (0x80 >> bit)) tags[a * 8 + bit] |= tag;
      }
    }
    const counts = Object.fromEntries(Object.keys(targets).map(k => [k, { px: 0, cells: new Set(), stablePixels: 0 }]));
    let px = 0, edge = 0; const cells = new Set(), badMask = [];
    for (let y = 0; y < FH; y++) for (let x = 0; x < 256; x++) {
      const a = pix(A, p.sc, x, y), b = pix(B, p.sc, x, y), v = p.beam[y * 256 + x];
      if (y >= EDGE && y < FH - EDGE && a === b) {
        const addr = (x >> 3) * 256 + ((p.sc - y) & 255), tag = tags[addr * 8 + (x & 7)];
        for (let i = 0; tag && i < names.length; i++) if (tag & (1 << i)) {
          const k = names[i];
          counts[k].stablePixels++;
          if (v !== a) { counts[k].px++; counts[k].cells.add((y >> 3) * 32 + (x >> 3)); }
        }
      }
      if (a === b && v !== a) {
        if (y < EDGE || y >= FH - EDGE) { edge++; continue; }      // края: верхняя строка и уход в полосу — не спрайты
        px++; cells.add((y >> 3) * 32 + (x >> 3)); badMask.push(y * 256 + x);
      }
    }
    stat.frames++; stat.px += px; stat.cells += cells.size; if (cells.size) stat.bad++; if (edge) stat.edge++;
    for (const k of Object.keys(targets)) {
      const t = targets[k], c = counts[k];
      if (c.stablePixels) t.frames++;
      if (c.px) t.bad++;
      t.px += c.px; t.cells += c.cells.size; t.stablePixels += c.stablePixels;
    }
    if (SHOTS && cells.size) { stat.worst.push({ f: p.f, n: cells.size, beam: p.beam, A, sc: p.sc, badMask }); stat.worst.sort((u, v) => v.n - u.n); stat.worst.length = Math.min(stat.worst.length, SHOTS); }
  }
}
for (let fr = 0; fr < FRAMES; fr++) {
  const s0 = snapSeq, prev = snapPrev;
  firstInFrame = null;
  m.runFrames(1);
  if (replayDone) break;
  if ((replay ? replayIndex < 2 : fr < 260) || !prev) continue; // до игры
  const sc = m.io.PA & 0xff, beam = beamField();
  if (CALIB) { if (snapSeq > s0) continue; let d = 0; const P = planes(); for (let y = 0; y < FH; y++) for (let x = 0; x < 256; x++) if (pix(P, sc, x, y) !== beam[y * 256 + x]) d++; console.log(fr, 'кадр без flush, расхождений', d); if (fr > 400) break; continue; }
  // кадр без снимков во время него: сравнить с последним снимком и следующим
  // «до» — последний снимок до начала кадра, «после» — первый снимок во время кадра или после него
  pend.push({ f: fr, prev, next: firstInFrame, beam, sc });
  settle();
}
settle();
const pc = (a, b) => (100 * a / Math.max(b, 1)).toFixed(1);
console.log(`кадров ${stat.frames}: с мерцанием ${stat.bad} (${pc(stat.bad, stat.frames)}%), точек на кадр ${(stat.px / Math.max(stat.frames, 1)).toFixed(1)}, ` +
  `клеток 8×8 на кадр ${(stat.cells / Math.max(stat.frames, 1)).toFixed(2)} (на кадр с мерцанием ${(stat.cells / Math.max(stat.bad, 1)).toFixed(1)}); ` +
  `отдельно — кадров с ошибками на краях поля (по ${EDGE} строк сверху и снизу): ${stat.edge} (${pc(stat.edge, stat.frames)}%)`);
for (const [k, t] of Object.entries(targets)) console.log(`${k}: кадров присутствия ${t.frames}, с мерцанием ${t.bad}; точек ${t.px} (${pc(t.px, stat.px)}% общего), клеток ${t.cells} (${pc(t.cells, stat.cells)}% общего), ошибочных точек цели ${pc(t.px, t.stablePixels)}%`);
if (replay) console.log(`replay: проверено обновлений ${replayIndex}, завершён ${replayDone}, расхождений логики 0`);
if (arg('json', '')) fs.writeFileSync(arg('json', ''), JSON.stringify({ seed: replay ? replay.seed : initialSeed, frames: FRAMES, replay: replay ? { updates: replayIndex, complete: replayDone, god: replay.god } : undefined, stat: { ...stat, worst: undefined }, targets }, null, 2) + '\n');
if (replay && !replayDone) throw new Error('Replay не завершён: увеличьте --frames');
if (SHOTS) {
  const dir = path.join(ROOT, 'build/flicker'); fs.mkdirSync(dir, { recursive: true });
  const { encodePNG } = require('./machine');
  for (const w of stat.worst) {
    const W = 512, rgb = Buffer.alloc(W * FH * 3), pal = [0, 1, 2, 3].map((i) => m.palRGB(i)), bad = new Set(w.badMask);
    for (let y = 0; y < FH; y++) for (let x = 0; x < 256; x++) {
      const put = (xx, c) => { const o = (y * W + xx) * 3; rgb[o] = c[0]; rgb[o + 1] = c[1]; rgb[o + 2] = c[2]; };
      const i = y * 256 + x;
      put(x, bad.has(i) ? [255, 0, 0] : pal[w.beam[i] & 3]);
      put(256 + x, pal[pix(w.A, w.sc, x, y)]);
    }
    fs.writeFileSync(path.join(dir, `f${w.f}_${w.n}.png`), encodePNG(W, FH, rgb));
  }
}
