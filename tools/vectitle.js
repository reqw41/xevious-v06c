#!/usr/bin/env node
'use strict';
/**
 * Стартовый и загрузочный (xeviload.scr, кадр 30 модели) экраны Вектора из экранов CPC.
 * Стартовый — из экрана CPC перед игрой: логотип (кадр CPC -> две плоскости Вектора, палитра титула: чёрный, белый,
 * синий, красный; серый CPC — шахматкой белый/чёрный). Хранится только прямоугольник логотипа (столбцы байтов
 * TL_C0.., строки памяти TL_R0..) по столбцам, плоскость C000h, потом E000h, сжатый LZB (tools/vec/lz.js, длина повтора
 * до 255, конец — повтор со смещением 0); распаковка — src/vec/title_tab.asm. Надписи титула — строки своего шрифта
 * (TT_TXT, мигающая — TT_PRESS), места и цвета как у CPC; проверка: непустые знакоместа совпадают с CPC.
 * Данные игры — только build/.
 *   node tools/vectitle.js [--grey dither|white|blue] [--out файл]
 * Экран: строка y (0 — верх) -> строка памяти 255 − y (прокрутка FFh), столбец байта x >> 3.
 */
const path = require('path');
const fs = require('fs');
const CPC = require('./cpc/cpc6128.js');
const ROOT = path.resolve(__dirname, '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
const GREY = arg('grey', 'dither');
const LZB = require('./vec/lz.js');
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
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const i = ((y + Y0) * W + (x + X0)) * 3;
    if (y + Y0 >= CPC.FB_H) continue;
    const k = `${on[i]},${on[i + 1]},${on[i + 2]}`, k2 = off ? `${off[i]},${off[i + 1]},${off[i + 2]}` : k;
    let c = COL[k];
    if (c === undefined) { if (k === '128,128,128') c = GREY === 'white' ? 1 : GREY === 'blue' ? 2 : ((x + y) & 1 ? 1 : 0); else throw new Error(`цвет ${k}`); }
    const a = (x >> 3) * 256 + (255 - y), bit = 0x80 >> (x & 7);
    if (c & 2) plane[0][a] |= bit;
    if (c & 1) plane[1][a] |= bit;
  }
  return Buffer.concat([plane[0], plane[1]]);
}
const COL = { '0,0,0': 0, '255,255,255': 1, '0,128,255': 2, '255,0,0': 3 };
const raw = planes(on, off, COL);
// «HIGH SCORE» и рекорд под логотипом — вместо таблицы рекордов; рисует игра (src/vec/title_tab.asm tt_hi)
const HI_COL = 7, HI_Y = 94;
// PNG -> [ширина, высота, rgb(x, y)]: 8 бит, палитра или RGB/RGBA, без чересстрочности
function readPng(file) {
  const b = fs.readFileSync(file), zl = require('zlib');
  let i = 8, w, h, ct, pal, idat = [];
  while (i < b.length) {
    const n = b.readUInt32BE(i), t = b.toString('latin1', i + 4, i + 8), d = b.subarray(i + 8, i + 8 + n);
    if (t === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = d[9]; if (d[8] !== 8 || d[12]) throw new Error(`${file}: нужен 8 бит без чересстрочности`); }
    else if (t === 'PLTE') pal = d; else if (t === 'IDAT') idat.push(d);
    i += 12 + n;
  }
  const bpp = { 2: 3, 3: 1, 6: 4 }[ct]; if (!bpp) throw new Error(`${file}: тип цвета ${ct}`);
  const raw = zl.inflateSync(Buffer.concat(idat)), st = w * bpp, px = Buffer.alloc(st * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (st + 1)];
    for (let x = 0; x < st; x++) {
      const a = x >= bpp ? px[y * st + x - bpp] : 0, up = y ? px[(y - 1) * st + x] : 0, c = x >= bpp && y ? px[(y - 1) * st + x - bpp] : 0;
      const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c);
      const v = raw[y * (st + 1) + 1 + x];
      px[y * st + x] = (v + [0, a, up, (a + up) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? up : c][f]) & 255;
    }
  }
  const rgb = (x, y) => { const o = y * st + x * bpp; return ct === 3 ? [...pal.subarray(px[o] * 3, px[o] * 3 + 3)] : [px[o], px[o + 1], px[o + 2]]; };
  return [w, h, rgb];
}
// логотип — всё непустое выше строки LOGO_Y; прямоугольник по байтам столбцов. Есть ref/title/logo.png (рисунок
// пользователя, ширина кратна 8) — логотип из него: по центру, верх непустого — строка LOGO_TOP, цвета — ближайшие
// из палитры титула; иначе — логотип CPC.
const LOGO_Y = 100, LOGO_PNG = path.join(ROOT, 'ref/title/logo.png'), LOGO_TOP = 44;
const pxOf = (r) => (x, y) => { const a = (x >> 3) * 256 + (255 - y), b = 0x80 >> (x & 7); return (r[a] & b ? 2 : 0) | (r[0x2000 + a] & b ? 1 : 0); };
const px = pxOf(raw);
let lraw = raw;
if (fs.existsSync(LOGO_PNG)) {
  const [w, h, rgb] = readPng(LOGO_PNG), RGB = [[0, 0, 0], [255, 255, 255], [0, 128, 255], [255, 0, 0]];
  const near = (c) => RGB.reduce((m, q, i) => { const d = q.reduce((s, v, k) => s + (v - c[k]) ** 2, 0); return d < m[0] ? [d, i] : m; }, [1e9, 0])[1];
  let top = h; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (near(rgb(x, y))) top = Math.min(top, y);
  const ox = (256 - w) >> 1 & ~7, oy = LOGO_TOP - top;
  lraw = Buffer.alloc(0x4000);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = near(rgb(x, y)), a = ((x + ox) >> 3) * 256 + (255 - y - oy), b = 0x80 >> ((x + ox) & 7);
    if (c & 2) lraw[a] |= b; if (c & 1) lraw[0x2000 + a] |= b;
  }
}
const lpx = pxOf(lraw);
let c0 = 31, c1 = 0, y0 = 255, y1 = 0;
for (let y = 0; y < LOGO_Y; y++) for (let x = 0; x < 256; x++) if (lpx(x, y)) { c0 = Math.min(c0, x >> 3); c1 = Math.max(c1, x >> 3); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
const TW = c1 - c0 + 1, TH = y1 - y0 + 1, R0 = 255 - y1, logo = [];
for (const pl of [0, 0x2000]) for (let c = c0; c <= c1; c++) for (let r = R0; r <= 255 - y0; r++) logo.push(lraw[pl + c * 256 + r]);
const LOGO = Buffer.from(logo);
// буфер распаковки — экран справа от логотипа в C000h и слева в E000h (до плоскости E000h логотипа)
const TBUF = 0xc000 + (c1 + 1) * 256;
if (TBUF + LOGO.length > 0xe000 + c0 * 256) throw new Error('логотип: буфер распаковки налезает на логотип');
const z = Buffer.concat([LZB.pack(LOGO, 65535, 255), Buffer.from([0xc0, 0, 0])]);
function unlzb(p) {                          // как lzb_unpack (src/vec/title_tab.asm)
  const o = []; let i = 0;
  for (;;) {
    const t = p[i++]; let l, off;
    if (t < 0x40) { for (let k = 0; k <= t; k++) o.push(p[i++]); continue; }
    if (t < 0x80) { l = ((t >> 4) & 3) + 3; off = ((t & 15) << 8 | p[i++]) + 1; }
    else if (t < 0xc0) { l = (t & 63) + 2; off = p[i++] + 1; }
    else { l = t & 63; if (l === 63) l += p[i++]; l += 3; if (l > 255) throw new Error('длина > 255'); off = p[i] | p[i + 1] << 8; i += 2; if (!off) break; }
    for (let k = 0; k < l; k++) o.push(o[o.length - off]);
  }
  return Buffer.from(o);
}
if (!unlzb(z).equals(LOGO)) throw new Error('LZB: распаковка не совпала');
// надписи: [текст, столбец, y верха, цвет F1 синий / F2 белый]; мигающая — первая
const TEXT = [['PRESS FIRE TO START', 7, 114, 0xf2], ['BONUS LIFE 3', 11, 146, 0xf1], ['20K 70K EVERY 70K', 8, 162, 0xf1],
  ['© 1982 2026 NAMCO LTD.', 6, 186, 0xf2], ['ALL RIGHTS RESERVED', 7, 202, 0xf2]];
const code = (ch) => ch === ' ' ? 'HUD_SP' : ch >= '0' && ch <= '9' ? ch : ch === '©' ? 'CH_CPY' : ch === '.' ? 'CH_DOT' : 'CH_' + ch;
for (const [t, col, y] of TEXT) for (let i = 0; i < t.length; i++) {   // знакоместо непустое у CPC <=> не пробел
  let n = 0; for (let r = -1; r < 8; r++) for (let x = 0; x < 8; x++) if (px((col + i) * 8 + x, y + r)) n++;
  if ((n > 0) !== (t[i] !== ' ')) throw new Error(`надпись «${t}»: знак ${i} не совпал с CPC`);
}
const tstr = ([t, col, y, ink]) => `\tdb\t${col},${255 - y},${ink},${[...t].map(code).join(',')},255\n`;

const db = (lab, a) => `${lab}:\n` + Array.from({ length: Math.ceil(a.length / 16) }, (_, i) => '\tdb\t' + [...a.subarray(i * 16, i * 16 + 16)].join(',') + '\n').join('');
// загрузочный экран CPC -> индексы цветов 256×256 + палитра 16 (заставка загрузчика tools/vecboot.js по умолчанию:
// 4 цвета CPC, серый — настоящим цветом; 16-цветная — только vecbuild.js --splash16)
{
  const C = { '0,0,0': 0, '255,255,255': 1, '0,128,255': 2, '128,128,128': 3 }, idx = Buffer.alloc(65536 + 16);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const i = ((y + Y0) * W + (x + X0)) * 3, k = `${lshot[i]},${lshot[i + 1]},${lshot[i + 2]}`;
    const c = C[k]; if (c === undefined) throw new Error(`цвет ${k}`);
    idx[y * 256 + x] = c;
  }
  const p8 = (r, g, b) => (r * 7 / 255 | 0) | ((g * 7 / 255 | 0) << 3) | ((b * 3 / 255 | 0) << 6);
  [p8(0, 0, 0), p8(255, 255, 255), p8(0, 128, 255), p8(128, 128, 128)].forEach((v, i) => { idx[65536 + i] = v; });
  // «LOADING SOLVALOU» (строки 218–232, ячейки по 8 точек с x=64) -> «SOLVALOU READY» тем же шрифтом:
  // буквы S O L V A U D — из самой надписи, R E Y дорисованы в том же стиле
  const TY = 218, TX = 64, TH = 15, src = 'LOADING SOLVALOU', glyph = {};
  for (let i = 0; i < src.length; i++) if (!glyph[src[i]]) {
    glyph[src[i]] = Array.from({ length: TH }, (_, r) => Array.from({ length: 8 }, (_, c) => idx[(TY + r) * 256 + TX + i * 8 + c] === 2 ? '#' : '.').join(''));
  }
  Object.assign(glyph, {
    R: ['.######.', '#######.', '##...##.', '##...##.', '##...##.', '##...##.', '#######.', '........',
      '######..', '##..##..', '##...##.', '##...##.', '##...##.', '##...##.', '##...##.'],
    E: ['#######.', '#######.', '##......', '##......', '##......', '##......', '######..', '........',
      '######..', '##......', '##......', '##......', '##......', '#######.', '#######.'],
    Y: ['##...##.', '##...##.', '##...##.', '##...##.', '##...##.', '##...##.', '#######.', '........',
      '.#####..', '...##...', '...##...', '...##...', '...##...', '...##...', '...##...'],
  });
  const txt = 'SOLVALOU READY', x0 = (256 - txt.length * 8) >> 1;
  for (let r = 0; r < TH; r++) for (let x = 0; x < 256; x++) if (idx[(TY + r) * 256 + x] === 2) idx[(TY + r) * 256 + x] = 0;
  for (let i = 0; i < txt.length; i++) for (let r = 0; r < TH; r++) for (let c = 0; c < 8; c++) {
    if (glyph[txt[i]][r][c] === '#') idx[(TY + r) * 256 + x0 + i * 8 + c] = 2;
  }
  fs.writeFileSync(path.join(ROOT, 'build/gen/tload_idx.bin'), idx);
}
const pal = (r, g, b) => Math.round(r * 7 / 255) | (Math.round(g * 7 / 255) << 3) | (Math.round(b * 3 / 255) << 6);  // ближайший уровень ЦАП
const TPAL = [pal(0, 0, 0), pal(255, 255, 255), pal(0, 128, 255), pal(255, 0, 0)];
fs.writeFileSync(OUT, '; стартовый экран (tools/vectitle.js) — данные игры, не править\n' +
  `TT_HICOL equ ${HI_COL}\nTT_HIY equ ${HI_Y}\nTL_C0 equ ${c0}\nTL_W equ ${TW}\nTL_H equ ${TH}\nTL_R0 equ ${R0}\n` +
  `TL_BUF equ ${TBUF}\nTL_LEN equ ${LOGO.length}\n` + db('TITLE_PAL', Buffer.from(Array.from({ length: 16 }, (_, i) => TPAL[i & 3]))) +
  db('TITLE_Z', z) + 'TT_PRESS:\n' + tstr(TEXT[0]) + 'TT_TXT:\n' + TEXT.slice(1).map(tstr).join('') + '\tdb\t0\n');
console.log(`титул: логотип ${lraw === raw ? 'CPC' : 'ref/title/logo.png'} ${TW}×${TH} (столбцы ${c0}..${c1}, строки ${y0}..${y1}) ${LOGO.length} Б -> LZB ${z.length} Б; надписей ${TEXT.length}`);
