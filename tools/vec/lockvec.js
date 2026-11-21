#!/usr/bin/env node
'use strict';
// Образ Вектора (build/xevious.rom) на модели Вектора рядом с CPC: в начале каждого обновления (метка main)
// состояние игры сравнивается с CPC (3AAFh). Как в tools/cpc/lockstep80.js, снаружи — только байты прерывания
// (то, что Z80 прочёл за обновление: ввод, кадры, звук, пауза) и подстановка жизней. Зона 1 (начальное состояние
// образа снято с неё).   node tools/vec/lockvec.js [--god] [--frames N] [--seed S] [--shots u,..] [--marks N]
// --ground-prof file.json: read-only census of ground redraws and their cost.
const path = require('path');
const fs = require('fs');
const CPC = require('../cpc/cpc6128.js');
const OVL = require('../cpc/ovl80.js');
const { Machine } = require('./machine');
const ROOT = path.resolve(__dirname, '../..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
const GOD = process.argv.includes('--god');
const FRAMES = +arg('frames', 3000);
const SHOTS = new Set((arg('shots', '') || '').split(',').filter(Boolean).map(Number));   // обновления: снимки CPC и Вектора в build/shots/
let seed = +arg('seed', 7);
const SCR = arg('scr', '');      // файл: хэш плоскостей экрана Вектора по обновлениям (сверка двух сборок вывода; без верхних 40 и нижних 16 строк поля
                                 // по 16 строк — там обрезка зависит от темпа; SCR_ALL=1 — весь экран)
const scrLog = [];
const regionFile = arg('scr-regions', ''); // отдельно поле y40..223 и полоса y224..255
const regionLog = [];
const replayFile = arg('record-inputs', ''); // для flicker --replay: одинаковая логика вместо разных игр по времени
const replayLog = [];
const MARKS = +arg('marks', 0);   // снимки обновлений с отметками целей (mark_a/b/dead) и двух следующих после них: не больше N
let markHit = 0, markShots = 0; const markNext = new Set();
const hx = (v, n = 2) => v.toString(16).padStart(n, '0');
const ISR = new Set([0x3d3a, 0x3d3b, 0x3d3c, 0x3d3d, 0x3d3f, 0x3f2f]);
for (let a = 0x3d42; a <= 0x3d4c; a++) ISR.add(a);

const L = JSON.parse(fs.readFileSync(arg('labels', path.join(ROOT, 'build/xevious.json')), 'utf8'));
const sm = [];
for (const [k, v] of Object.entries(L)) { const r = /^SM_([0-9A-F]{4})$/i.exec(k); if (r) sm.push([v, parseInt(r[1], 16)]); }
const V = new Machine();
V.loadROM(arg('rom', path.join(ROOT, 'build/xevious.rom')));
for (const k of ['plat_mark_a', 'plat_mark_b', 'plat_mark_dead']) V.addBreak(L[k], () => { markHit++; return false; });
V.poke(L.isr_sound, 0xc9); V.poke(L.isr_input, 0xc9); V.poke(L.title_skip, 1);   // таймер звука ведёт CPC (байты прерывания подставляются), иначе гонка на кадр
const groundProfileFile = arg('ground-prof', '');
const groundProfile = groundProfileFile ? require('./ground_prof').attachGroundProfile(V, L) : null;
const vpeek = (a) => V.memory.bytes[V.memory.tobank(a & 0xffff)];
let vfr = 0;
function vNext() {                                 // до следующего прихода на main
  if (V.cpu.pc === L.main) V.step();
  const r = V.runUntil({ pc: L.main, frames: 100 });
  if (r.reason !== 'pc') throw new Error(`Вектор: нет main за 100 кадров (PC ${hx(V.cpu.pc, 4)})`);
}

const m = new CPC(path.join(ROOT, 'ref/cpc/xevious.dsk'));
m.boot('disc.bin');
const P = (a) => m.map[(a >> 14) & 3] + (a & 0x3fff);
function compare() {
  const d = [];
  // 3C00h–3CE8h и 3F34h–3FFFh игра не трогает: на Векторе там шрифт и данные панели (tools/cpc/initstate.js)
  for (let a = 0x3ce9; a < 0x3f34; a++) if (!ISR.has(a) && vpeek(a) !== m.ram[a]) d.push(`${hx(a, 4)} ${hx(vpeek(a))}≠${hx(m.ram[a])}`);
  for (const [a, c] of sm) if (vpeek(a) !== m.ram[c]) d.push(`SM_${hx(c, 4)} ${hx(vpeek(a))}≠${hx(m.ram[c])}`);
  for (let i = 2; i < 0x20; i++) { const v = m.ram[P(0xb580 + i)]; if (vpeek(L.ROWBUF + i) !== v) d.push(`B5${hx(0x80 + i)} ${hx(vpeek(L.ROWBUF + i))}≠${hx(v)}`); }
  for (let i = 0; i < 0x2000; i++) { const v = m.ram[0x1a000 + i], u = OVL.value(vpeek, L, 0x6000 + i); if (u !== v) d.push(`карта ${hx(0x6000 + i, 4)} ${hx(u)}≠${hx(v)}`); }
  return d;
}

let isrSp = [], reads = new Map(), start = new Map(), started = false, upd = 0, bad = 0, reports = 0, stopAll = false;
m.onRead = (a, p, v) => { if (!isrSp.length && ISR.has(p) && p === a && !reads.has(p)) reads.set(p, v); };
const step0 = m.step.bind(m);
let LIVES = false;
m.step = function () {
  const c = m.cpu;
  const intr = m.intPending && c.get_iff1();
  if (intr) isrSp.push(c.get_sp());
  if (!stopAll && !intr && !isrSp.length && c.get_pc() === 0x3aaf && m.frames > 100) {
    if (started) {
      for (const a of ISR) V.poke(a, reads.has(a) ? reads.get(a) : start.get(a));
      const input = replayFile ? [...ISR, 0x3f1b, 0x3d39].map(a => V.peek(a)) : null;
      vNext();
      if (input) replayLog.push({ input, after: require('./logic_hash').logicHash(V, L) });
      upd++;
      if (SCR) { const h = require('crypto').createHash('md5'); const vs = vpeek(L.vs_cur); for (let a = 0xc000; a < 0x10000; a++) { const y = (vs - (a & 255)) & 255; if (!process.env.SCR_ALL && (y < 40 || (y >= 208 && !process.env.SCR_HUD))) continue; h.update(Buffer.of(vpeek(a))); } scrLog.push(h.digest('hex').slice(0, 12)); if (+process.env.DUMPU === upd) fs.writeFileSync(SCR + '.vs', String(vpeek(L.vs_cur))), fs.writeFileSync(SCR + '.bin', Buffer.from(Array.from({ length: 0x4000 }, (_, i) => vpeek(0xc000 + i)))); }
      if (regionFile) {
        const field = [], band = [], vs = vpeek(L.vs_cur);
        for (let a = 0xc000; a < 0x10000; a++) {
          const y = (vs - (a & 255)) & 255;
          if (y >= 40) (y < 224 ? field : band).push(vpeek(a));
        }
        const hash = b => require('crypto').createHash('md5').update(Buffer.from(b)).digest('hex');
        regionLog.push(`${hash(field)} ${hash(band)}`);
      }
      const d = compare();
      if (MARKS && markShots < MARKS && (markHit || markNext.has(upd))) { if (markHit) { markNext.add(upd + 2); markNext.add(upd + 4); } SHOTS.add(upd); markShots++; }
      markHit = 0;
      if (SHOTS.has(upd)) {
        const dir = path.join(ROOT, 'build/shots'); fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, `u${upd}_cpc.png`), require('../cpc/png.js')(CPC.FB_W, CPC.FB_H, m.last));
        V.shot(path.join(dir, `u${upd}_vec.png`), { scale: 2 });
      }
      if (d.length) {
        bad++;
        if (reports++ < 3) console.log(`✗ обновление ${upd} (кадр CPC ${m.frames}, Вектора ${V.frame}): ${d.length}: ${d.slice(0, 12).join('; ')}`);
        if (bad >= 3) stopAll = true;
      }
    } else {
      vNext();
      const d = compare();
      console.log(`начало: кадр CPC ${m.frames}, Вектора ${V.frame}; расхождений ${d.length}${d.length ? ': ' + d.slice(0, 12).join('; ') : ''}`);
      started = true;
    }
    if (GOD) m.ram[0x3f1b] = 0;
    if (LIVES) m.ram[0x3d39] = 3;
    V.poke(0x3f1b, m.ram[0x3f1b]); V.poke(0x3d39, m.ram[0x3d39]);
    reads = new Map(); start = new Map([...ISR].map((a) => [a, m.ram[a]]));
  }
  const cyc = step0();
  while (isrSp.length && c.get_sp() >= isrSp[isrSp.length - 1]) isrSp.pop();
  return cyc;
};
const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
const KEYS = [['J_LEFT', 'J_FIRE1'], ['J_RIGHT', 'J_FIRE2'], ['J_UP', 'J_FIRE1', 'J_FIRE2'], ['J_DOWN', 'J_FIRE2'],
  ['J_FIRE1', 'J_FIRE2'], ['J_LEFT'], ['J_RIGHT'], ['J_UP'], []];
let cur = [], left = 0;
m.onFrame = (f) => {
  if (f < 100) { m.keysOnly([]); return; }
  if (f < 110) { m.keysOnly(['J_FIRE1']); return; }
  LIVES = f < FRAMES - 600;
  if (--left <= 0) { cur = KEYS[(rnd() * KEYS.length) | 0]; left = 5 + ((rnd() * 30) | 0); }
  m.keysOnly(cur);
};
const t0 = Date.now();
m.runFrames(FRAMES);
console.log(`зона 1${GOD ? ' (без гибели)' : ''}: обновлений ${upd}, с расхождениями ${bad}; Вектор: кадров ${V.frame}, ` +
  `${(V.frame / Math.max(upd, 1)).toFixed(2)} кадра на обновление (CPC ${(m.frames / Math.max(upd, 1)).toFixed(2)}); ${((Date.now() - t0) / 1000).toFixed(0)} с`);
if (SCR) fs.writeFileSync(SCR, scrLog.join('\n') + '\n');
if (regionFile) fs.writeFileSync(regionFile, regionLog.join('\n') + '\n');
if (replayFile) fs.writeFileSync(replayFile, JSON.stringify({ seed: +arg('seed', 7), god: GOD, differences: bad, addresses: [...ISR, 0x3f1b, 0x3d39], updates: replayLog }) + '\n');
if (groundProfile) fs.writeFileSync(groundProfileFile, JSON.stringify(groundProfile(), null, 2) + '\n');
process.exit(bad ? 1 : 0);
