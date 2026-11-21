#!/usr/bin/env node
'use strict';
/**
 * Неуязвимая версия для CPC: образ диска игры -> build/xevious_god.dsk (данные игры — только build/).
 * Пять отметок попадания по кораблю (после проверки столкновения 17E3h: 22DCh, 212Dh, 24EAh, 2AEDh, 2C3Dh пишут
 * счётчик гибели 3F1Bh) пишут в 3F34h — этот байт игра не трогает. Подбор флага (проверка 386Bh) и прочее — как было.
 *   node tools/cpc/godpatch.js [образ.dsk] [выход.dsk]
 */
const fs = require('fs');
const path = require('path');
const { readDsk } = require('./dsk.js');
const ROOT = path.resolve(__dirname, '../..');
const IN = process.argv[2] || path.join(ROOT, 'ref/cpc/xevious.dsk');
const OUT = process.argv[3] || path.join(ROOT, 'build/xevious_god.dsk');
const img = fs.readFileSync(IN);
const f = readDsk(null, img)['disc.bin'];
if (!f || f.load !== 0x100) throw new Error('disc.bin (загрузка с 0100h) не найден');
// адрес в памяти -> байт образа (через окна секторов; заголовок AMSDOS — 128 Б)
const at = (a) => { const o = a - f.load + 128, s = f.secs[o >> 9]; return [s, o & 511]; };
const get = (a) => { const [s, i] = at(a); return s[i]; };
const put = (a, v) => { const [s, i] = at(a); s[i] = v; };
// [адрес операнда 3F1Bh, ожидаемые байты перед ним]
const SITES = [[0x22e3, [0x28, 0x09, 0x21]], [0x2131, [0xcd, 0xe3, 0x17, 0x21]], [0x24ee, [0xcd, 0xe3, 0x17, 0x32]], [0x2af2, [0x17, 0xe1, 0x32]], [0x2c41, [0xcd, 0xe3, 0x17, 0x32]]];
for (const [a, pre] of SITES) {
  const got = [...pre.map((_, k) => get(a - pre.length + k)), get(a), get(a + 1)];
  const want = [...pre, 0x1b, 0x3f];
  if (got.join() !== want.join()) throw new Error(`${a.toString(16)}: не те байты (${got.map((x) => x.toString(16)).join(' ')})`);
  put(a, 0x34);
}
const chk = readDsk(null, img)['disc.bin'];
let diff = 0; for (let i = 0; i < f.data.length; i++) if (chk.data[i] !== f.data[i]) diff++;
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, img);
console.log(`${OUT}: изменено байт disc.bin ${diff} (5 мест попадания)`);
