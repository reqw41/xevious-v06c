#!/usr/bin/env node
'use strict';
/**
 * Музыка заставки загрузчика: дамп регистров AY (14 Б/кадр, 50 Гц) -> поток для src/vec/bootmus.asm.
 *   node tools/vecmusic.js
 * Вход (ref/ не в git): ref/music/splash.pt3 — модуль PT3 (номер позиции петли — байт 66h заголовка);
 * ref/music/splash.ay14 и .ay14.pos — его покадровый дамп и номер позиции на каждый кадр. Дамп снимается плеером
 * Volutar/pt3player (pt3dump из ~/projects/cat-v06c-t11, tools/music/build_pt3dump.sh):
 *   pt3dump ref/music/splash.pt3 ref/music/splash.ay14
 * Нет дампа — нет файла build/gen/bootmus_data.inc, и загрузчик собирается без музыки.
 *
 * Формат кадра (как tools/music/psgpack.py джукбокса scubadive-i8080):
 *   маска 2 Б (биты 0..13 — какие регистры пишутся), следом значения по возрастанию номера;
 *   маска 0 — следом 1 байт: сколько кадров держать без записей; маска FFFFh — граница куска (читать дальше).
 * Регистр 13 пишется каждый раз, когда плеер его выдал (перезапуск огибающей), FFh — «не писать».
 * Периоды пересчитаны с AY Спектрума (1,7734 МГц) на AY Вектора (96/55 МГц); ВИ53-ветка плеера считает от них.
 * Два куска: вступление (до позиции петли) и петля; каждый начинается полным снимком регистров и сжат LZB
 * (tools/vec/lz.js) со смещениями не дальше 2048 — распаковка идёт на ходу в кольцо 4 КБ.
 */
const fs = require('fs');
const path = require('path');
const { pack, unpack } = require('./vec/lz.js');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'build/gen/bootmus_data.inc');
const DUMP = path.join(ROOT, 'ref/music/splash.ay14');
const MAXOFF = 2048;

if (!fs.existsSync(DUMP)) { fs.rmSync(OUT, { force: true }); console.log('музыка заставки: нет ref/music/splash.ay14 — без музыки'); process.exit(0); }
const d = fs.readFileSync(DUMP), pos = fs.readFileSync(DUMP + '.pos');
const loopPos = fs.readFileSync(path.join(ROOT, 'ref/music/splash.pt3'))[0x66];
const n = d.length / 14;
if (pos.length !== n) throw new Error('длина .pos не совпадает с дампом');
let L = 0; while (L < n && pos[L] < loopPos) L++;

function seg(a, b) {
  const k = (96e6 / 55) / 1773400, out = [];
  let prev = new Array(14).fill(-1), hold = 0;
  const flush = () => { while (hold > 0) { const m = Math.min(hold, 255); out.push(0, 0, m); hold -= m; } };
  for (let f = a; f < b; f++) {
    const fr = [...d.subarray(f * 14, f * 14 + 14)];
    for (const lo of [0, 2, 4]) { let p = fr[lo] | (fr[lo + 1] & 15) << 8; if (p) p = Math.max(1, Math.min(0xfff, Math.round(p * k))); fr[lo] = p & 255; fr[lo + 1] = p >> 8; }
    let p = fr[11] | fr[12] << 8; if (p) p = Math.max(1, Math.min(0xffff, Math.round(p * k))); fr[11] = p & 255; fr[12] = p >> 8;
    fr[6] = Math.min(31, Math.round(fr[6] * k));
    let m = 0; const v = [];
    for (let r = 0; r < 14; r++) {
      if (r === 13) { if (fr[13] !== 0xff) { m |= 1 << 13; v.push(fr[13]); } continue; }
      if (fr[r] !== prev[r]) { m |= 1 << r; v.push(fr[r]); prev[r] = fr[r]; }
    }
    if (!m) { hold++; continue; }
    flush(); out.push(m & 255, m >> 8, ...v);
  }
  flush(); out.push(0xff, 0xff);
  return Buffer.from(out);
}
const raw = [seg(0, L), seg(L, n)];
const z = raw.map((r) => pack(r, MAXOFF));
z.forEach((p, i) => { if (!unpack(p, raw[i].length).equals(raw[i])) throw new Error('LZ: распаковка не совпала'); });
// проверка смещений: ни одно не дальше MAXOFF (кольцо 4 КБ держит окно 2 КБ)
for (const p of z) {
  let i = 0, o = 0; const N = p.length;
  while (i < N) {
    const t = p[i++]; let l, off;
    if (t < 0x40) { i += t + 1; o += t + 1; continue; }
    if (t < 0x80) { l = ((t >> 4) & 3) + 3; off = ((t & 15) << 8 | p[i++]) + 1; }
    else if (t < 0xc0) { l = (t & 63) + 2; off = p[i++] + 1; }
    else { l = (t & 63) + 3; if ((t & 63) === 63) l += p[i++]; off = p[i] | p[i + 1] << 8; i += 2; }
    if (off > MAXOFF || off > o) throw new Error(`смещение ${off} при ${o}`);
    o += l;
  }
}
const db = (b) => Array.from({ length: Math.ceil(b.length / 16) }, (_, i) => '\tdb\t' + [...b.subarray(i * 16, i * 16 + 16)].join(',') + '\n').join('');
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `; музыка заставки (tools/vecmusic.js из ref/music/splash.pt3) — не править\n` +
  `mus_s0:\n${db(z[0])}mus_s0e:\nmus_s1:\n${db(z[1])}mus_s1e:\n`);
console.log(`музыка заставки: ${n} кадров (${(n / 50).toFixed(1)} с), петля с кадра ${L} (позиция ${loopPos}); ` +
  `поток ${raw[0].length}+${raw[1].length} Б -> LZ ${z[0].length}+${z[1].length} Б`);
