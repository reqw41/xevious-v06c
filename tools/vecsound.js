#!/usr/bin/env node
'use strict';
/**
 * Звук для ВИ53 Вектора из звука CPC (docs/SOUND.md): модель CPC играет игру (без управления и без гибели),
 * каждый кадр снимаются регистры AY; эффекты 1–6 запускаются вызовом sfx игры (17C2h). Покадровое состояние
 * канала (период, громкость, тон/шум) -> серии [кадров, делитель ВИ53] -> build/gen/vec_sound.inc (только build/:
 * это данные игры).
 *   node tools/vecsound.js [--vol N]     N — порог громкости AY, ниже — тишина (по умолчанию 5)
 * Делитель: тон AY = 1 МГц / (16·P), ВИ53 = 1,5 МГц / N -> N = 24·P. Шум (с тоном или без) — флаг: проигрыватель
 * подмешивает случайный делитель.
 * Серия: db n (1..63; бит 7 — шум, бит 6 — после серии ещё кадр тишины), dw N (0 — тишина); конец — db 0, dw адрес
 * продолжения (петля) или 0. Мелодии: 4B00h (заставка жизни), 4800h (фон, канал A), 4C00h (конец игры — вторая модель
 * доходит до ввода имени).
 */
const path = require('path');
const fs = require('fs');
const CPC = require('./cpc/cpc6128.js');
const ROOT = path.resolve(__dirname, '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
const VOL = +arg('vol', 5);

const m = new CPC(path.join(ROOT, 'ref/cpc/xevious.dsk'));
m.boot('disc.bin');
const B4 = (a) => m.ram[0x10000 + (a - 0x4000)];
const SFXPTR = [0x42d7, 0x4277, 0x421a];
const FXARGS = { 1: [1, 0x43], 2: [1, 0x40], 3: [2, 0x30], 4: [2, 0x40], 5: [2, 0x48], 6: [0, 0x40] };
const FX0 = 1000, FXSTEP = 90;
const frames = [], events = [];
let fxNext = 1, fxAt = FX0;
const step0 = m.step.bind(m);
m.step = function () {
  const c = m.cpu, pc = c.get_pc();
  if (pc === 0x3aaf && fxNext <= 6 && m.frames >= fxAt) {
    const st = c.getState(), sp = (st.sp - 2) & 0xffff, P = (a) => m.map[(a >> 14) & 3] + (a & 0x3fff);
    m.ram[P(sp)] = 0xaf; m.ram[P(sp + 1)] = 0x3a;
    const [d, e] = FXARGS[fxNext];
    c.setState({ ...st, sp, pc: 0x17c2, d, e, h: 0x0f, l: fxNext });
    events.push({ f: m.frames, kind: 'sfx', ch: d, n: fxNext });
    fxNext++; fxAt = m.frames + FXSTEP;
    return step0();
  }
  if (pc === 0x4707) { const s = c.getState(); events.push({ f: m.frames, kind: 'song', at: (s.d << 8) | s.e }); }
  return step0();
};
m.onFrame = (f) => {
  frames.push({ r: [...m.psgRegs.subarray(0, 14)], sfx: SFXPTR.map((a) => B4(a) | (B4(a + 1) << 8)) });
  m.ram[0x3f1b] = 0;                                         // без гибели
  m.keysOnly(f >= 100 && f < 110 ? ['J_FIRE1'] : []);
};
m.runFrames(FX0 + 7 * FXSTEP);

// мелодия конца игры 4C00h (ввод имени): вторая модель — без управления до конца игры, очки 099999 (место в таблице)
const go = new CPC(path.join(ROOT, 'ref/cpc/xevious.dsk'));
go.boot('disc.bin');
let goF = -1;
const goRegs = [];
const gstep0 = go.step.bind(go);
go.step = function () {
  if (goF < 0 && go.cpu.get_pc() === 0x4707) { const s = go.cpu.getState(); if (((s.d << 8) | s.e) === 0x4c00) goF = go.frames; }
  return gstep0();
};
go.onFrame = (f) => {
  go.keysOnly(f >= 100 && f < 110 ? ['J_FIRE1'] : []);
  if (goF < 0 && f > 300) { go.poke(0x3f24, 0x09); go.poke(0x3f25, 0x99); go.poke(0x3f26, 0x99); }
  if (goF >= 0) goRegs.push({ r: [...go.psgRegs.subarray(0, 14)] });
};
while (goF < 0 || goRegs.length < 700) { go.runFrames(50); if (go.frames > 8000) throw new Error('4C00h не прозвучала'); }

// состояние канала в кадре -> [шум?, делитель] (делитель 0 — тишина)
function chan(fr, ch) {
  const r = fr.r, tone = !(r[7] & (1 << ch)), noise = !(r[7] & (8 << ch)), vol = r[8 + ch] & 0x1f;
  const loud = (vol & 0x10) ? true : vol >= VOL;
  if (!loud || (!tone && !noise)) return [0, 0];
  if (!tone) return [1, 1];                                   // только шум
  const p = ((r[2 * ch + 1] & 15) << 8) | r[2 * ch];
  return [noise ? 1 : 0, Math.max(2, Math.min(0xffff, 24 * p))];
}
function runs(list) {                                        // покадровые [шум, делитель] -> серии
  const out = [];
  for (const [nz, d] of list) {
    const l = out[out.length - 1];
    if (l && !l.gap && l.nz === nz && l.d === d && l.n < 63) l.n++;
    else if (l && !l.gap && d === 0 && l.d !== 0) l.gap = 1;  // звук и один кадр тишины — одной серией
    else out.push({ nz, d, n: 1 });
  }
  return out;
}
// петля: с какого кадра s и с каким периодом p покадровые ключи повторяются до конца записи
function loopOf(key, len, pmin) {
  for (let s = 0; s < 40; s++) for (let p = pmin; p * 2 + s < len; p++) {
    let ok = true;
    for (let i = s; i + p < len; i++) if (key(i) !== key(i + p)) { ok = false; break; }
    if (ok) return [s, p];
  }
  throw new Error('петля не найдена');
}
const songs = events.filter((e) => e.kind === 'song');
const S = {};
const gs = songs.find((e) => e.at === 0x4b00);
for (let ch = 0; ch < 3; ch++) S[`SND_START_${'ABC'[ch]}`] = { runs: runs(frames.slice(gs.f, gs.f + 300).map((fr) => chan(fr, ch))) };
// фоновая петля 4800h — канал A: вступление и петля (период — по повтору кадров)
const gg = songs.find((e) => e.at === 0x4800 && e.f > gs.f);
const ga = frames.slice(gg.f, FX0 - 10).map((fr) => chan(fr, 0));
const [s0, per] = loopOf((i) => ga[i].join(','), ga.length, 16);
S.SND_GAME_A = { runs: runs(ga.slice(0, s0)), loop: runs(ga.slice(s0, s0 + per)), per, s0 };
// конец игры 4C00h: три канала, общая петля
const gk = goRegs.map((fr) => [0, 1, 2].map((ch) => chan(fr, ch)));
const [o0, oper] = loopOf((i) => gk[i].join('|'), gk.length, 32);
for (let ch = 0; ch < 3; ch++) { const l = gk.map((x) => x[ch]); S[`SND_OVER_${'ABC'[ch]}`] = { runs: runs(l.slice(0, o0)), loop: runs(l.slice(o0, o0 + oper)), per: oper, s0: o0 }; }
for (const e of events.filter((x) => x.kind === 'sfx')) {
  const l = [];
  for (let f = e.f; f < frames.length; f++) { if (f > e.f + 1 && frames[f].sfx[e.ch] === 0) break; l.push(chan(frames[f], e.ch)); }
  S[`SND_FX${e.n}`] = { runs: runs(l), ch: e.ch };
}
let inc = '; звук ВИ53 из звука CPC (tools/vecsound.js) — данные игры, не править\n', total = 0;
const H = (v, n = 2) => '0x' + v.toString(16).padStart(n, '0');
for (const [name, s] of Object.entries(S)) {
  inc += `${name}:\n`;
  const emit = (rs) => { for (const r of rs) { inc += `\tdb\t${H(r.n | (r.nz ? 0x80 : 0) | (r.gap ? 0x40 : 0))}\n\tdw\t${H(r.d, 4)}\n`; total += 3; } };
  emit(s.runs);
  if (s.loop) { inc += `${name}_L:\n`; emit(s.loop); inc += `\tdb\t0\n\tdw\t${name}_L\n`; total += 3; } else { inc += '\tdb\t0\n\tdw\t0\n'; total += 3; }
  console.log(`${name}: серий ${s.runs.length + (s.loop ? s.loop.length : 0)}${s.loop ? ` (петля ${s.per} кадров с ${s.s0})` : ''}`);
}
inc += 'SND_FX_TAB:\n' + [1, 2, 3, 4, 5, 6].map((n) => `\tdw\tSND_FX${n}\n`).join('');
total += 12;
fs.mkdirSync(path.join(ROOT, 'build/gen'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'build/gen/vec_sound.inc'), inc);
console.log(`звук: ${total} Б (порог громкости ${VOL})`);
