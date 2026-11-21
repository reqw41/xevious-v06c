#!/usr/bin/env node
'use strict';
/**
 * Проверка прототипа прокрутки (build/proto.rom) на стенде Вектора с растром по лучу.
 *   node tools/proto_check.js [--frames N] [--shots каталог]
 * Печатает: такты шагов от начала кадра (новая строка, спрайты, панель), пропуски обновлений,
 * и где корабль и прицел видны НА РАСТРЕ в каждом кадре (строка поля) — должно быть постоянно.
 */
const fs = require('fs');
const path = require('path');
const { Machine } = require('./vec/machine');
const ROOT = path.resolve(__dirname, '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
const FRAMES = +arg('frames', 300), SHOTS = arg('shots', null);
const L = JSON.parse(fs.readFileSync(path.join(ROOT, 'build/proto.json')));
const m = new Machine({ beam: true, ay: false });
m.loadROM(path.join(ROOT, 'build/proto.rom'));

const marks = {}; let cur = null; const steps = [];
for (const k of ['prb_beg', 'prb_line', 'prb_spr', 'prb_end']) {
  m.addBreak(L[k], () => {
    if (k === 'prb_beg') cur = { frame: m.frame };
    cur[k] = (m.frame - cur.frame) * 59904 + m.frameCycle();
    if (k === 'prb_end') steps.push(cur);
    return false;
  });
}
const rd = (a) => m.peek(a) | (m.peek(a + 1) << 8);

// растр 576×288: поле 256×256 растянуто по X вдвое; ищем строку поля по рисунку спрайта
function rgbAt(x, y) { const p = m.bmp[y * 576 + x]; return [p & 0xff, (p >> 8) & 0xff, (p >> 16) & 0xff].join(','); }
let X0 = null, Y0 = null;
function findOrigin() {   // левый верхний угол поля на растре: первая строка/столбец не цвета бордюра
  const b = rgbAt(0, 0);
  for (let y = 0; y < 288 && Y0 === null; y++) for (let x = 0; x < 576; x++) if (rgbAt(x, y) !== b) { Y0 = y; break; }
}
function spriteRow(col, pat) {  // pat: [смещение по X в точках, 'Y'|'K'] — ищет первую строку растра с этим рисунком
  const col2 = (c) => ({ Y: m.palRGB(1).join(','), K: m.palRGB(0).join(',') })[c];
  for (let y = 0; y < 288; y++) {
    let ok = true;
    for (const [dx, c, dy = 0] of pat) if (y + dy >= 288 || rgbAt(X0 + (col * 8 + dx) * 2, y + dy) !== col2(c)) { ok = false; break; }
    if (ok) return y;
  }
  return -1;
}
const SHIP_PAT = [[6, 'Y'], [7, 'K'], [8, 'K'], [9, 'Y']];                                   // строка 2 корабля
const CROSS_PAT = [[3, 'K'], [4, 'K'], [5, 'K'], [6, 'K'], [9, 'K'], [10, 'K'], [11, 'K'], [12, 'K'],
  [3, 'K', 1], [4, 'Y', 1], [5, 'Y', 1], [10, 'Y', 1], [11, 'Y', 1], [12, 'K', 1]];   // строки 2–3 прицела

const rows = [];
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
for (let f = 0; f < FRAMES; f++) {
  m.runFrame();
  if (!m.peek(L.running)) continue;
  if (X0 === null) {           // поле: 32 точки бордюра слева при 576 (как vector06js: (576-512)/2)
    X0 = (576 - 512) >> 1; findOrigin();
  }
  const col = m.peek(L.ship_col), ccol = m.peek(L.cross_col);
  rows.push({ f, scroll: m.peek(L.scroll), ship: spriteRow(col, SHIP_PAT), cross: spriteRow(ccol, CROSS_PAT) });
  if (SHOTS && f % 50 === 0) m.shotBeam(path.join(SHOTS, `beam_${String(f).padStart(4, '0')}.png`));
}
const tk = (k) => steps.map((s) => s[k] - 44);
const st = (a) => { const s = [...a].sort((x, y) => x - y); return `мин ${s[0]} медиана ${s[s.length >> 1]} макс ${s[s.length - 1]}`; };
console.log(`обновлений ${steps.length}, пропусков ${rd(L.overrun)}, кадров ${rd(L.frames)}`);
console.log('такты от прерывания до: начала шага', st(tk('prb_beg')));
console.log('                        конца новой строки', st(tk('prb_line')));
console.log('                        конца спрайтов', st(tk('prb_spr')));
console.log('                        конца панели', st(tk('prb_end')));
const cnt = (k) => { const h = {}; for (const r of rows) h[r[k]] = (h[r[k]] || 0) + 1; return JSON.stringify(h); };
console.log('строка растра корабля по кадрам (строка: число кадров):', cnt('ship'));
console.log('строка растра прицела:', cnt('cross'));
console.log('начало поля на растре: строка', Y0);
