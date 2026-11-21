#!/usr/bin/env node
'use strict';
/**
 * Снятие звука CPC с модели (для разбора драйвера Arkos Tracker 1, src/cpc/snd.ctl, и переноса на ВИ53):
 * игра со случайным управлением, каждый кадр — регистры AY 0..13, запуски эффектов (sfx 17C2h) и мелодий
 * (at_init 4707h). Итог — сводка в консоль и build/snd/cap.json (только build/: это данные игры).
 *   node tools/cpc/sndcap.js [--frames N] [--seed S]
 *   node tools/cpc/sndcap.js --fx      # эффекты 1–6 по очереди (вызов sfx 17C2h, как у игры), без управления;
 *                                       покадрово в build/snd/fx.txt
 * Каналы эффектов: A = 0 -> AY канал A (указатель эффекта 42D7h), 1 -> B (4277h), 2 -> C (421Ah).
 */
const path = require('path');
const fs = require('fs');
const CPC = require('./cpc6128.js');
const ROOT = path.resolve(__dirname, '../..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
const FRAMES = +arg('frames', 12000);
let seed = +arg('seed', 11);
const hx = (v, n = 2) => v.toString(16).padStart(n, '0');

const m = new CPC(path.join(ROOT, 'ref/cpc/xevious.dsk'));
m.boot('disc.bin');
const B4 = (a) => m.ram[0x10000 + (a - 0x4000)];          // банк 4 (драйвер), адрес окна 4000h
const SFXPTR = [0x42d7, 0x4277, 0x421a];

const frames = [], events = [];
const FX = process.argv.includes('--fx');
const FXARGS = { 1: [1, 0x43], 2: [1, 0x40], 3: [2, 0x30], 4: [2, 0x40], 5: [2, 0x48], 6: [0, 0x40] };   // канал D, нота E
let fxNext = 1, fxAt = 700;
const step0 = m.step.bind(m);
m.step = function () {
  const c = m.cpu, pc = c.get_pc();
  if (FX && pc === 0x3aaf && fxNext <= 6 && m.frames >= fxAt) {   // начало главного цикла: вызвать sfx как игра
    const st = c.getState(), sp = (st.sp - 2) & 0xffff;
    const P = (a) => m.map[(a >> 14) & 3] + (a & 0x3fff);
    m.ram[P(sp)] = 0xaf; m.ram[P(sp + 1)] = 0x3a;
    const [d, e] = FXARGS[fxNext];
    c.setState({ ...st, sp, pc: 0x17c2, d, e, h: 0x0f, l: fxNext });
    events.push({ f: m.frames, kind: 'sfx', ch: d, n: fxNext, att: 0x0f, note: e });   // вход 17C2h исполнится в этом же шаге
    fxNext++; fxAt = m.frames + 60;
    return step0();
  }
  if (pc === 0x17c2 || pc === 0x4707) {
    const s = c.getState();
    if (pc === 0x17c2) events.push({ f: m.frames, kind: 'sfx', ch: s.d, n: s.l, att: s.h, note: s.e });
    else events.push({ f: m.frames, kind: 'song', at: (s.d << 8) | s.e });
  }
  return step0();
};
const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
const KEYS = [['J_LEFT', 'J_FIRE1'], ['J_RIGHT', 'J_FIRE2'], ['J_UP', 'J_FIRE1', 'J_FIRE2'], ['J_DOWN', 'J_FIRE2'],
  ['J_FIRE1', 'J_FIRE2'], ['J_LEFT'], ['J_RIGHT'], ['J_UP'], []];
let cur = [], left = 0;
m.onFrame = (f) => {
  if (FX) {   // без управления: только старт игры огнём
    frames.push({ r: [...m.psgRegs.subarray(0, 14)], sfx: SFXPTR.map((a) => B4(a) | (B4(a + 1) << 8)), mode: m.ram[0x3d3a] });
    m.keysOnly(f >= 100 && f < 110 ? ['J_FIRE1'] : []); return;
  }
  frames.push({ r: [...m.psgRegs.subarray(0, 14)], sfx: SFXPTR.map((a) => B4(a) | (B4(a + 1) << 8)), mode: m.ram[0x3d3a] });
  if (f < 100) { m.keysOnly([]); return; }
  if (f < 110) { m.keysOnly(['J_FIRE1']); return; }
  if (--left <= 0) { cur = KEYS[(rnd() * KEYS.length) | 0]; left = 5 + ((rnd() * 30) | 0); }
  m.keysOnly(cur);
};
m.runFrames(FX ? 1100 : FRAMES);
if (FX) {   // покадровая таблица канала каждого эффекта
  let txt = '';
  for (const e of events.filter((x) => x.kind === 'sfx')) {
    txt += `эффект ${e.n} (канал ${'ABC'[e.ch]}, нота ${hx(e.note)}):\n`;
    for (let f = e.f, k = 0; f < frames.length && k < 60; f++, k++) {
      const fr = frames[f], ch = e.ch, r = fr.r;
      if (k > 1 && fr.sfx[ch] === 0) break;
      txt += `  ${String(k).padStart(2)} период ${hx((r[2 * ch + 1] << 8) | r[2 * ch], 3)} громк ${String(r[8 + ch] & 15).padStart(2)}` +
        `${r[7] & (1 << ch) ? ' ----' : ' тон '}${r[7] & (8 << ch) ? '' : ' шум ' + r[6]}\n`;
    }
  }
  fs.mkdirSync(path.join(ROOT, 'build/snd'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'build/snd/fx.txt'), txt);
}

// эффекты: от запуска до обнуления указателя канала
const fx = new Map();
for (const e of events.filter((x) => x.kind === 'sfx')) {
  const ch = e.ch, chan = 'ABC'[ch];
  let n = 0, noise = 0, tone = 0, env = 0, vmax = 0;
  for (let f = e.f; f < frames.length && n < 400; f++, n++) {
    const fr = frames[f];
    if (f > e.f + 1 && fr.sfx[ch] === 0) break;
    const mix = fr.r[7], vol = fr.r[8 + ch];
    if (!(mix & (1 << ch))) tone++;
    if (!(mix & (8 << ch))) noise++;
    if (vol & 0x10) env++;
    vmax = Math.max(vmax, vol & 15);
  }
  const k = `${e.n}`;
  const s = fx.get(k) || { n: e.n, chan, note: e.note, att: e.att, count: 0, len: [] , noise: 0, tone: 0, env: 0, vmax: 0 };
  s.count++; s.len.push(n); s.noise = Math.max(s.noise, noise); s.tone = Math.max(s.tone, tone); s.env = Math.max(s.env, env); s.vmax = Math.max(s.vmax, vmax);
  fx.set(k, s);
}
console.log(`кадров ${frames.length}; эффектов ${events.filter((x) => x.kind === 'sfx').length}`);
for (const s of [...fx.values()].sort((a, b) => a.n - b.n)) {
  const l = s.len.sort((a, b) => a - b);
  console.log(`эффект ${s.n}: канал ${s.chan}, нота ${hx(s.note)}, ослабление ${hx(s.att)}; запусков ${s.count}, ` +
    `длина ${l[0]}..${l[l.length - 1]} кадров; кадров с тоном ${s.tone}, с шумом ${s.noise}, с огибающей ${s.env}, громкость до ${s.vmax}`);
}
// мелодии: от at_init до следующего at_init / смены режима
const songs = events.filter((x) => x.kind === 'song');
for (let i = 0; i < songs.length; i++) {
  const e = songs[i], end = i + 1 < songs.length ? songs[i + 1].f : frames.length;
  let noise = 0, env = 0, used = [0, 0, 0];
  for (let f = e.f; f < end; f++) {
    const r = frames[f].r;
    for (let ch = 0; ch < 3; ch++) { if ((r[8 + ch] & 31) && !(r[7] & (1 << ch))) used[ch]++; if ((r[8 + ch] & 31) && !(r[7] & (8 << ch))) noise++; if (r[8 + ch] & 0x10) env++; }
  }
  console.log(`мелодия ${hx(e.at, 4)}h с кадра ${e.f}: ${end - e.f} кадров (режим ${frames[Math.min(e.f + 2, frames.length - 1)].mode}); ` +
    `тон по каналам A/B/C ${used.join('/')}, кадров с шумом ${noise}, с огибающей ${env}`);
}
// период фоновой мелодии 4800h: первый повтор 14 регистров тона и громкости
const g = songs.find((x) => x.at === 0x4800);
if (g) {
  const end = songs.find((x) => x.f > g.f)?.f ?? frames.length;
  const key = (f) => frames[f].r.slice(0, 6).concat([frames[f].r[8] & 15, frames[f].r[9] & 15, frames[f].r[10] & 15]).join(',');
  for (let p = 8; p < Math.min(2000, (end - g.f) / 2); p++) {
    let ok = true;
    for (let f = g.f + 20; f < g.f + 20 + p && f + p < end; f++) if (key(f) !== key(f + p)) { ok = false; break; }
    if (ok) { console.log(`мелодия 4800h повторяется с периодом ${p} кадров (без эффектов)`); break; }
  }
}
const out = path.join(ROOT, 'build/snd');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'cap.json'), JSON.stringify({ events, frames: frames.map((f) => f.r) }));
