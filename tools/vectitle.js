#!/usr/bin/env node
'use strict';
/**
 * Стартовый и загрузочный (xeviload.scr, кадр 30 модели) экраны Вектора из экранов CPC.
 * Стартовый — из экрана CPC перед игрой (логотип, надписи): модель CPC без управления, кадр с
 * мигающей надписью и без неё -> две плоскости Вектора (палитра титула: чёрный, белый, синий, красный; серый CPC —
 * шахматкой белый/чёрный) -> сжатие своим LZ (распаковщик — src/vec/title.asm) -> build/gen/vec_title.inc.
 * Данные игры — только build/.
 *   node tools/vectitle.js [--grey dither|white|blue] [--deep] [--out файл]
 * Экран: строка y (0 — верх) -> строка памяти 255 − y (прокрутка FFh), столбец байта x >> 3; плоскости C000h и
 * E000h подряд — одна область 16 КБ, распаковка прямо в экран.
 * Поток: байт t: t < 80h — t+1 литералов; t >= 80h — повтор: длина (t & 3Fh) + 3, бит 6 — длинная (ещё байт:
 * длина += 64·байт), затем смещение 2 байта (назад от текущего места); 0FFh? нет — конец: байт 80h, смещение 0.
 */
const path = require('path');
const fs = require('fs');
const CPC = require('./cpc/cpc6128.js');
const ROOT = path.resolve(__dirname, '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
const GREY = arg('grey', 'dither'), DEEP = process.argv.includes('--deep');
const OUT = arg('out', path.join(ROOT, 'build/gen/vec_title.inc'));

const m = new CPC(path.join(ROOT, 'ref/cpc/xevious.dsk'));
m.boot('disc.bin');
m.onFrame = () => m.keysOnly([]);
const grab = (f) => { m.runFrames(f - m.frames); return Buffer.from(m.last); };
const on = grab(95), off = grab(700);
// загрузочный экран (xeviload.scr): модель заново, кадр 30 — картинка уже выведена, титула ещё нет
const ml = new CPC(path.join(ROOT, 'ref/cpc/xevious.dsk'));
ml.boot('disc.bin');
ml.onFrame = () => ml.keysOnly([]);
ml.runFrames(30);
const lshot = Buffer.from(ml.last);
const W = CPC.FB_W, X0 = 64, Y0 = 40;      // экран CPC 256 точек — с 64-й точки кадра; по Y — сдвиг 40
// кадр CPC (и, если есть, кадр без мигающей надписи) -> две плоскости по цветам COL; строки, где кадры различаются
function planes(on, off, COL) {
  const plane = [new Uint8Array(0x2000), new Uint8Array(0x2000)];
  let by0 = 255, by1 = 0;
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const i = ((y + Y0) * W + (x + X0)) * 3;
    if (y + Y0 >= CPC.FB_H) continue;
    const k = `${on[i]},${on[i + 1]},${on[i + 2]}`, k2 = off ? `${off[i]},${off[i + 1]},${off[i + 2]}` : k;
    if (k !== k2) { by0 = Math.min(by0, y); by1 = Math.max(by1, y); }
    let c = COL[k];
    if (c === undefined) { if (k === '128,128,128') c = GREY === 'white' ? 1 : GREY === 'blue' ? 2 : ((x + y) & 1 ? 1 : 0); else throw new Error(`цвет ${k}`); }
    const a = (x >> 3) * 256 + (255 - y), bit = 0x80 >> (x & 7);
    if (c & 2) plane[0][a] |= bit;
    if (c & 1) plane[1][a] |= bit;
  }
  return { raw: Buffer.concat([plane[0], plane[1]]), by0, by1 };
}
const COL = { '0,0,0': 0, '255,255,255': 1, '0,128,255': 2, '255,0,0': 3 };
const { raw, by0, by1 } = planes(on, off, COL);

// свой LZ: оптимальный разбор (динамика по цене в байтах), окно — всё распакованное (до 16 КБ назад)
function pack(src) {
  const N = src.length, MAXL = 64 * 255 + 66;
  const head = new Map(), cand = new Array(N);
  for (let i = 0; i < N; i++) {                       // кандидаты повторов: лучшие длины по смещениям
    const key = src[i] | (src[i + 1] << 8) | (src[i + 2] << 16), list = head.get(key) || [];
    const c = [];
    if (i > 0) { let l = 0; while (i + l < N && src[i + l] === src[i - 1] && l < MAXL) l++; if (l >= 3) c.push([l, 1]); }
    for (let q = list.length - 1, n = 0; q >= 0 && n < 300; q--, n++) {
      const p = list[q]; let l = 0; while (i + l < N && src[p + l] === src[i + l] && l < MAXL) l++;
      if (l >= 3) c.push([l, i - p]);
    }
    cand[i] = c;
    if (!head.has(key)) head.set(key, []); head.get(key).push(i);
  }
  const cost = new Float64Array(N + 1).fill(Infinity), how = new Array(N + 1);
  cost[N] = 0;
  for (let i = N - 1; i >= 0; i--) {
    for (let n = 1; n <= 128 && i + n <= N; n++) {      // литералы: 1 + n
      const c = 1 + n + cost[i + n]; if (c < cost[i]) { cost[i] = c; how[i] = [0, n]; }
    }
    for (const [L, off] of cand[i]) {                    // повтор: 3 или 4 байта; любая длина от 3 до L
      for (const l of new Set([L, Math.min(L, 66), 3, Math.min(L, 4)])) {
        if (l < 3 || l > L) continue;
        const c = (l - 3 < 64 ? 3 : 4) + cost[i + l]; if (c < cost[i]) { cost[i] = c; how[i] = [1, l, off]; }
      }
    }
  }
  const out = [];
  for (let i = 0; i < N;) {
    const h = how[i];
    if (h[0] === 0) { out.push(h[1] - 1, ...src.subarray(i, i + h[1])); i += h[1]; }
    else { const n = h[1] - 3; if (n < 64) out.push(0x80 | n); else out.push(0xc0 | (n & 63), n >> 6); out.push(h[2] & 255, h[2] >> 8); i += h[1]; }
  }
  out.push(0x80, 0, 0);
  return Buffer.from(out);
}
function unpack(p) {                         // проверка формата
  const o = []; let i = 0;
  for (;;) {
    const t = p[i++];
    if (t < 0x80) { for (let k = 0; k <= t; k++) o.push(p[i++]); continue; }
    let n = (t & 63) + 3; if (t & 0x40) n += 64 * p[i++];
    const off = p[i] | (p[i + 1] << 8); i += 2;
    if (!off) break;
    for (let k = 0; k < n; k++) o.push(o[o.length - off]);
  }
  return Buffer.from(o);
}
// первый байт: экран начинается с нулей — литерал 0, потом повторы
const z = pack(raw);
if (!unpack(z).equals(raw)) throw new Error('LZ: распаковка не совпала');
const db = (lab, a) => `${lab}:\n` + Array.from({ length: Math.ceil(a.length / 16) }, (_, i) => '\tdb\t' + [...a.subarray(i * 16, i * 16 + 16)].join(',') + '\n').join('');
const L = planes(lshot, null, { '0,0,0': 0, '255,255,255': 1, '0,128,255': 2, '128,128,128': 3 });
const LRAW = L.raw.subarray(0, 0x4000 - 3);       // без 3 последних байт (пусто): там лежит конец потока, обнулит код
if (L.raw[0x3ffd] | L.raw[0x3ffe] | L.raw[0x3fff]) throw new Error('загрузочный: конец экрана не пуст');
const zl = pack(LRAW);
if (!unpack(zl).equals(LRAW)) throw new Error('LZ загрузочного: распаковка не совпала');
const pal = (r, g, b) => (r * 7 / 255 | 0) | ((g * 7 / 255 | 0) << 3) | ((b * 3 / 255 | 0) << 6);
const TPAL = [pal(0, 0, 0), pal(255, 255, 255), pal(0, 128, 255), pal(255, 0, 0)];
fs.writeFileSync(OUT, '; стартовый экран (tools/vectitle.js) — данные игры, не править\n' +
  `TITLE_BY0 equ ${by0}\nTITLE_BY1 equ ${by1}\n` + db('TITLE_PAL', Buffer.from(Array.from({ length: 16 }, (_, i) => TPAL[i & 3]))) + db('TITLE_Z', z) +
  db('TLOAD_PAL', Buffer.from(Array.from({ length: 16 }, (_, i) => [pal(0, 0, 0), pal(255, 255, 255), pal(0, 128, 255), pal(128, 128, 128)][i & 3]))));
// загрузочный — в конце экранной памяти, распаковка на месте (в тот же экран, с C000h): запись не должна догнать
// непрочитанное. Отступ от конца — наименьший, при котором после каждой команды потока конец записи <= место чтения.
function inplaceMargin(p, n) {
  for (let m = 0; m < 4096; m++) {
    const S = 0x4000 - p.length - m;
    let i = 0, o = 0, ok = true;
    for (;;) {
      const t = p[i++];
      if (t < 0x80) { if (o > S + i) { ok = false; break; } i += t + 1; o += t + 1; continue; }
      let k = (t & 63) + 3; if (t & 0x40) k += 64 * p[i++];
      const off = p[i] | (p[i + 1] << 8); i += 2;
      if (!off) break;
      o += k;
      if (o > S + i) { ok = false; break; }
    }
    if (ok) return m;
  }
  throw new Error('загрузочный: распаковка на месте не сходится');
}
const lm = inplaceMargin(zl);
const TLOAD_AT = 0xc000 + 0x4000 - zl.length - lm;
fs.writeFileSync(OUT.replace(/vec_title\.inc$/, 'vec_tload.inc'), '; загрузочный экран (tools/vectitle.js) — данные игры, не править; лежит в конце экрана, распаковка на месте\n' +
  `TLOAD_AT equ 0x${TLOAD_AT.toString(16)}\n\torg\tTLOAD_AT\n` + db('TLOAD_Z', zl));
console.log(`титул: ${raw.length} Б -> ${z.length} Б; мигающая надпись — строки ${by0}..${by1}; загрузочный: ${zl.length} Б (с ${TLOAD_AT.toString(16)}h, отступ ${lm})`);
