#!/usr/bin/env node
'use strict';
/**
 * Спрайты для Вектора из build/gen/sprites.json (tools/cpc/sprites.js) -> build/gen/vec_sprites.inc (только build/).
 * Картинка ставится в точку px = 8 + 2·(X & FEh) + dx: px mod 8 = 4·((X >> 1) & 1) + dx mod 8, поэтому у каждой
 * картинки две сдвинутые копии (вариант v = (X >> 1) & 1): столбец = (X >> 2) + cofs, строки с Y + dy.
 *   IMG_n:  db dy, h ; dw вариант0, вариант1
 *   вариант: db cofs, nb ; затем nb столбцов × h строк × [маска (1 — оставить экран), C, E] (по столбцам)
 * Таблицы: SPR_IDX — draw_sprite (адрес 8000h..9FFFh: ((s0 − 8000h) >> 7)·2 + чётность X), GLY_IDX — draw_glyph
 * ((s0 − 9800h) >> 5)·2 + чётность), Z23C_IDX — draw_z23c (картинка ABxx/BAxx), GND_LIST — draw_ground (поиск),
 * FIX_<имя> — dw для чётного и нечётного X процедур с одной картинкой.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const S = JSON.parse(fs.readFileSync(path.join(ROOT, 'build/gen/sprites.json'), 'utf8'));
const imgs = new Map();         // ключ картинки -> метка
let out = '; спрайты Вектора (tools/vecsprites.js) — из данных игры, не править\n';
let body = '';
const variants = [];
const H = (v) => '0x' + (v & 0xff).toString(16).padStart(2, '0');
// Память (замер покрытия tools/vec/vcover.js, 280 тыс. кадров через все зоны): буквы надписей draw_glyph
// 9C00h–9D80h не выводятся (надписи — своим шрифтом); у этих картинок второй сдвиг ни разу не понадобился —
// хранится один (если понадобится — встанет на 4 точки левее)
const NOGLYPH = (k) => /^draw_glyph:9[cd]/.test(k);
// один сдвиг: второй за 280 тыс. кадров (tools/vec/vcover.js, без гибели до зоны 8) не понадобился или редок (до 40 раз)
const ONEVAR = new Set(['draw_sprite:9080:0', 'draw_sprite:9100:0', 'draw_ground:9a00:0', 'draw_z23a:0:0', 'draw_z23b:0:0',
  'draw_sprite:8500:1', 'draw_sprite:8700:0', 'draw_sprite:8700:1', 'draw_sprite:9100:1', 'draw_z23c:8580:0', 'draw_z23c:85c0:0']);
function img(k) {
  const v = S[k];
  if (!v || NOGLYPH(k) || k === 'draw_sprite:8500:1') return '0';
  const key = v.dx + '|' + v.dy + '|' + v.px.join('/');
  if (imgs.has(key)) return imgs.get(key);
  const lab = `IMG_${imgs.size}`;
  imgs.set(key, lab);
  const one = ONEVAR.has(k);
  body += `${lab}:\tdb\t${H(v.dy)},${v.h}\n\tdw\t${lab}_0,${lab}_${one ? 0 : 1}\t; ${k} ${v.w}×${v.h}\n`;
  for (const vv of one ? [0] : [0, 1]) {
    const base = 8 + 4 * vv + v.dx, cofs = Math.floor(base / 8), sh = ((base % 8) + 8) % 8;
    const nb = Math.ceil((sh + v.w) / 8);
    const bytes = [];
    const pixr = v.px.map((row) => {
      const pix = new Array(nb * 8).fill(-1);
      for (let i = 0; i < v.w; i++) { const ch = row[i]; if (ch !== '.' && ch !== '?') pix[sh + i] = (+ch) ^ 3; }
      return pix;
    });
    if (v.h > 16 || v.dy < 0 || v.dy > 6 || v.dx < 0 || v.dx > 6 || v.w > 24) throw new Error(`${k}: нарушены границы static_prepare`);
    for (let b = 0; b < nb; b++) for (const pix of pixr) {
      let mk = 0, c = 0, e = 0;
      for (let q = 0; q < 8; q++) {
        const p = pix[b * 8 + q], bit = 0x80 >> q;
        if (p < 0) mk |= bit; else { if (p & 2) c |= bit; if (p & 1) e |= bit; }
      }
      bytes.push(mk, c, e);
    }
    const name = `${lab}_${vv}`;
    variants.push({ name, bytes: Buffer.from([cofs & 255, nb, ...bytes]) });
    body += `; variant ${name}\n`;

  }
  return lab;
}
const tab = (name, n, f) => { out += `${name}:\n`; for (let i = 0; i < n; i += 8) out += '\tdw\t' + Array.from({ length: Math.min(8, n - i) }, (_, j) => f(i + j)).join(',') + '\n'; };
const hx = (v) => v.toString(16);
// индексы — номер картинки + 1 байтом (0 — нет), адреса — IMG_TAB
const tabb = (name, n, f) => { out += `${name}:\n`; for (let i = 0; i < n; i += 16) out += '\tdb\t' + Array.from({ length: Math.min(16, n - i) }, (_, j) => { const l = f(i + j); return l === '0' ? '0' : String(+l.slice(4) + 1); }).join(',') + '\n'; };
tabb('SPR_IDX', 128, (i) => img(`draw_sprite:${hx(0x8000 + (i >> 1) * 0x80)}:${i & 1}`));
tabb('GLY_IDX', 90, (i) => img(`draw_glyph:${hx(0x9800 + (i >> 1) * 0x20)}:${i & 1}`));
// Existing dispatcher maps source 8580h/85C0h to slots 40..43.
tabb('Z23C_IDX', 64, (i) => i >= 40 && i <= 43 ? img(`draw_z23c:${i < 42 ? '8580' : '85c0'}:${i & 1}`) : '0');
out += 'GND_LIST:\n';
for (const s of [0x8700, 0x8780, 0x9a00]) for (const p of [0, 1]) out += `\tdw\t${hx(s)}h\n\tdb\t${p}\n\tdw\t${img(`draw_ground:${hx(s)}:${p}`)}\n`;
out += '\tdw\t0\n';
for (const n of ['draw_shot', 'draw_bullet', 'draw_bomb', 'draw_spark', 'draw_z23a', 'draw_z23b', 'draw_z48'])
  out += `FIX_${n}:\tdw\t${img(`${n}:0:0`)},${img(`${n}:0:1`)}\n`;
out += 'IMG_TAB:\n' + Array.from({ length: imgs.size }, (_, i) => `\tdw\tIMG_${i}\n`).join('');
const staticImage = img('draw_sprite:8600:0');
body = body.replace(`${staticImage}:`, `STATIC_MIN_IMG:\n${staticImage}:`);
out = out.replace(/\b([0-9a-f]+)h\b/g, (m, d) => '0x' + d);
// A variant is a byte string with its own cofs/width header. Substrings are safe
// aliases too: draw_img reads exactly that header and h*nb*3 following bytes.
const kept = [];
for (const v of [...variants].sort((a,b) => b.bytes.length-a.bytes.length)) {
  const owner = kept.find(k => k.bytes.indexOf(v.bytes) >= 0);
  const asm = owner ? `${v.name} equ ${owner.name}+${owner.bytes.indexOf(v.bytes)}\n`
    : `${v.name}:\n` + Array.from({length:Math.ceil(v.bytes.length/24)}, (_,i) => '\tdb\t'+[...v.bytes.subarray(i*24,i*24+24)].map(H).join(',')+'\n').join('');
  if (!owner) kept.push(v);
  body = body.replace(`; variant ${v.name}\n`, asm);
}
fs.writeFileSync(path.join(ROOT, 'build/gen/vec_sprites.inc'), out + body + 'SPR_END:\n');
// развёрнутые циклы по строкам (16 повторов, вход по высоте) — src/vec/sprites.asm
// Последнее изменение экранного младшего адреса не читается вызывающим кодом.
// У второй плоскости не читается и HL: следующий столбец берётся после первой.
const rep = (lab, ops, last = ops) => `${lab}:\n` + Array.from({ length: 16 }, (_, i) =>
  (i === 15 ? last : ops).map((o) => `\t${o}\n`).join('')).join('') + `${lab}_END:\tret\n`;
fs.writeFileSync(path.join(ROOT, 'build/gen/vec_unroll.inc'), '; развёрнутые циклы спрайтов (tools/vecsprites.js)\n' +
  rep('UNR_DC', ['ld\ta,(de)', 'ld\t(bc),a', 'inc\tbc', 'and\t(hl)', 'inc\thl', 'or\t(hl)', 'inc\thl', 'inc\thl', 'ld\t(de),a', 'dec\te'],
    ['ld\ta,(de)', 'ld\t(bc),a', 'inc\tbc', 'and\t(hl)', 'inc\thl', 'or\t(hl)', 'inc\thl', 'inc\thl', 'ld\t(de),a']) +
  rep('UNR_DE', ['ld\ta,(de)', 'ld\t(bc),a', 'inc\tbc', 'and\t(hl)', 'inc\thl', 'inc\thl', 'or\t(hl)', 'inc\thl', 'ld\t(de),a', 'dec\te'],
    ['ld\ta,(de)', 'ld\t(bc),a', 'inc\tbc', 'and\t(hl)', 'inc\thl', 'inc\thl', 'or\t(hl)', 'ld\t(de),a']) +
  // Редкий вывод в фон: компактные циклы освобождают код для удержания цели.
  'UNR_GC:\n\tld\ta,(di_h)\n\tld\tb,a\nUNR_GC_LOOP:\n' +
  '\tld\ta,(de)\n\tand\t(hl)\n\tinc\thl\n\tor\t(hl)\n\tinc\thl\n\tinc\thl\n\tld\t(de),a\n\tdec\te\n\tdec\tb\n\tjp\tnz,UNR_GC_LOOP\nUNR_GC_END:\tret\n' +
  'UNR_GE:\n\tld\ta,(di_h)\n\tld\tb,a\nUNR_GE_LOOP:\n' +
  '\tld\ta,(de)\n\tand\t(hl)\n\tinc\thl\n\tinc\thl\n\tor\t(hl)\n\tinc\thl\n\tld\t(de),a\n\tdec\te\n\tdec\tb\n\tjp\tnz,UNR_GE_LOOP\nUNR_GE_END:\tret\n' +
  rep('UNR_ER', ['ld\ta,(de)', 'ld\t(hl),a', 'inc\tde', 'dec\tl'],
    ['ld\ta,(de)', 'ld\t(hl),a', 'inc\tde']) +
  // входы по высоте h: UNR_ENT + 4h — DC, DE (с сохранением фона)
  'UNR_ENT:\n\tdw\tUNR_DC_END,UNR_DE_END\n' + Array.from({ length: 16 }, (_, i) => {
    const h = i + 1;
    return `\tdw\tUNR_DC+${(16 - h) * 10},UNR_DE+${(16 - h) * 10}\n`;
  }).join(''));
// Compact shared top-line renderer. All map tile IDs must have a TILEMAP entry.
const topBody = ` ld l,a
 ld h,TILEMAP_AT >> 8
 ld a,(hl)
 rrca
 rrca
 ld c,a
 and 0x3f
 add a,TILES_AT >> 8
 ld h,a
 ld a,c
 and 0xc0
 or b
 ld l,a
 ld a,(hl)
 ld (de),a
 inc l
 inc d
 ld a,(hl)
 ld (de),a
 inc l
 ld a,d
 add a,0x1f
 ld d,a
 ld a,(hl)
 ld (de),a
 inc l
 inc d
 ld a,(hl)
 ld (de),a
`;
fs.writeFileSync(path.join(ROOT, 'build/gen/vec_topl.inc'), `
TOPL_SET:
 ld (TOPL_RUN.src+1),hl
 ret
TOPL:
 call TOPL_SET
TOPL_RUN:
.src: ld hl,0
` + Array.from({length:14}, (_,i) => ` ld d,SCR_C+${1+2*i}\n call TOPL_ONE\n`).join('') +
` ld d,SCR_C+29
 ld a,(hl)
` + topBody + ` ret
TOPL_ONE:
 ld a,(hl)
 inc hl
 push hl
` + topBody + ` pop hl
 ret
`);
console.log(`картинок ${imgs.size}`);
