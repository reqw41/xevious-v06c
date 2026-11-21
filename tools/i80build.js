#!/usr/bin/env node
'use strict';
/**
 * Сборка логики i8080 для сверки (docs/I8080.md):
 *   build/gen/cpc_tables.inc — таблицы-константы из disc.bin по списку src/i80/tables.txt (адрес длина [имя]);
 *                               метка T_<АДРЕС>, данные оригинала — только в build/
 *   build/gen/plat_stub.inc  — заглушки входов платформы plat_<имя>: ret (src/model/platform.js)
 *   build/logic.rom / .json / .lst — src/i80/logic.asm
 *   node tools/i80build.js
 */
const fs = require('fs');
const path = require('path');
const { build } = require('./vec/asm.js');
const ROOT = path.resolve(__dirname, '..');
const GEN = path.join(ROOT, 'build/gen');
fs.mkdirSync(GEN, { recursive: true });

const bin = fs.readFileSync(path.join(ROOT, 'ref/cpc/files/disc.bin'));   // с 0100h
const H = (v, n = 4) => v.toString(16).toUpperCase().padStart(n, '0');
let tabs = '; таблицы CPC из disc.bin (tools/i80build.js) — не править\n';
for (const line of fs.readFileSync(path.join(ROOT, 'src/i80/tables.txt'), 'utf8').split('\n')) {
  const t = line.replace(/;.*/, '').trim();
  if (!t) continue;
  const [a, n] = t.split(/\s+/), at = parseInt(a, 16), len = parseInt(n, 10);
  const b = [...bin.subarray(at - 0x100, at - 0x100 + len)];
  tabs += `T_${H(at)}:\n`;
  for (let i = 0; i < b.length; i += 16) tabs += `\tdb\t${b.slice(i, i + 16).map((v) => '0x' + H(v, 2)).join(',')}\n`;
}
fs.writeFileSync(path.join(GEN, 'cpc_tables.inc'), tabs);

// наложение карты (банк 6, 6000h..7FFFh): значимые клетки (не 40h) по строкам — OVL_IDX (129 смещений),
// OVL_ENT (пары столбец, код). Флаги и база Андора вычисляются кодом (src/i80/map.asm)
{
  const O = fs.readFileSync(path.join(ROOT, 'ref/cpc/unz/xevlevel.dat')).subarray(0x2000, 0x4000);
  const idx = [], ent = [];
  for (let r = 0; r < 128; r++) {
    idx.push(ent.length);
    for (let c = 0; c < 64; c++) if (O[r * 64 + c] !== 0x40) ent.push(c, O[r * 64 + c]);
  }
  idx.push(ent.length);
  if (ent.length > 255) throw new Error('наложение: больше 255 байт');
  const db = (a) => a.reduce((t, v, i) => t + (i % 16 ? ',' : '\n\tdb\t') + '0x' + H(v, 2), '');
  fs.writeFileSync(path.join(GEN, 'ovl.inc'), `; наложение карты (tools/i80build.js) — не править\nOVL_IDX:${db(idx)}\nOVL_ENT:${db(ent)}\n`);
}

const PLAT = require(path.join(ROOT, 'src/model/platform.js'));
let stub = '; заглушки платформы для сверки (tools/i80build.js): стенд перехватывает вход по адресу\n';
for (const e of PLAT.entries) stub += `plat_${e.name}:\tret\n`;
fs.writeFileSync(path.join(GEN, 'plat_stub.inc'), stub);

const out = path.join(ROOT, 'build/logic.rom');
const { img, labels, list } = build(path.join(ROOT, 'src/i80/logic.asm'), { base: 0x100 });
fs.writeFileSync(out, img);
fs.writeFileSync(out.replace(/\.rom$/, '.json'), JSON.stringify(labels, null, 1));
fs.writeFileSync(out.replace(/\.rom$/, '.lst'), list + '\n');
const procs = Object.keys(labels).filter((k) => k.startsWith('p_'));
console.log(`logic.rom: ${img.length} Б, процедур ${procs.length}`);
