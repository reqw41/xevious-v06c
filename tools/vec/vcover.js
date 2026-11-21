#!/usr/bin/env node
'use strict';
/**
 * Покрытие образа Вектора (поиск мёртвого кода и неиспользуемых данных): прогоны на модели — без гибели через все
 * зоны и обычный со смертями, случайное управление. Итог — build/cov/vcover.json: такты по адресам команд,
 * вызовы draw_img по картинке и сдвигу.   node tools/vec/vcover.js [кадров без гибели] [кадров обычных]
 */
const path = require('path');
const fs = require('fs');
const { Machine } = require('./machine');
const { godPatch } = require('./god');
const ROOT = path.resolve(__dirname, '../..');
const L = JSON.parse(fs.readFileSync(path.join(ROOT, 'build/xevious.json'), 'utf8'));
const NG = +(process.argv[2] || 200000), NN = +(process.argv[3] || 40000);
const prof = new Float64Array(0x10000), img = {};
function run(frames, god, seed) {
  let s = seed;
  const rnd = () => { s = (s * 1103515245 + 12345) >>> 0; return s / 4294967296; };
  const K = [['LEFT', 'SPACE'], ['RIGHT', 'M'], ['UP', 'SPACE', 'M'], ['DOWN', 'M'], ['SPACE', 'M'], ['LEFT'], ['RIGHT'], ['UP'], ['DOWN'], []];
  let sc = '100-110 +JA.FIRE1\n', f = 200;
  while (f < frames) { const k = K[(rnd() * K.length) | 0], n = 5 + ((rnd() * 30) | 0); if (k.length) sc += `${f}-${f + n} ${k.map((x) => '+' + x).join(' ')}\n`; f += n + 1; }
  const m = new Machine();
  m.loadROM(path.join(ROOT, 'build/xevious.rom'));
  if (god && godPatch(m, L) !== 4) throw new Error('неуязвимость: не 4 места');
  m.profile = true; m.loadScenario(sc);
  m.addBreak(L.draw_img, (mm) => { const r = mm.ram(), hl = (mm.cpu.h() << 8) | mm.cpu.l(), v = (r[L.qx] >> 1) & 1; const k = hl.toString(16) + ':' + v; img[k] = (img[k] || 0) + 1; return false; });
  m.runFrames(frames);
  for (let a = 0; a < 0x10000; a++) prof[a] += m.prof[a];
  const r = m.ram();
  console.log(`${god ? 'без гибели' : 'обычный'} ${frames} кадров: зона ${r[0x3e5a] + 1}, жизни ${r[0x3d39]}`);
}
run(NG, true, 5);
run(NN, false, 11);
run(NN, false, 23);
const hit = {};
for (let a = 0; a < 0x10000; a++) if (prof[a]) hit[a] = prof[a];
fs.writeFileSync(path.join(ROOT, 'build/cov/vcover.json'), JSON.stringify({ hit, img }));
console.log(`адресов с исполнением ${Object.keys(hit).length}`);
