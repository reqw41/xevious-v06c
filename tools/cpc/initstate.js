#!/usr/bin/env node
'use strict';
// Начальное состояние игры для образа Вектора: снимок CPC на первом входе в restart_life (3438h) после старта
// игры — переменные 3C00h–3FFFh и самоизменяемые операнды (метки SM_ из build/logic.json).
// Пишет build/gen/init_sm.json (метка -> значение; tools/vecbuild.js впечатывает их в образ), build/gen/init_vars.inc —
// переменные 3CE9h–3F33h, build/gen/init_state.inc — метка конца кода.
//   node tools/cpc/initstate.js
const fs = require('fs');
const path = require('path');
const CPC = require('./cpc6128.js');
const OVL = require('./ovl80.js');
const ROOT = path.resolve(__dirname, '../..');
const L = JSON.parse(fs.readFileSync(path.join(ROOT, 'build/logic.json'), 'utf8'));
const img = fs.readFileSync(path.join(ROOT, 'build/logic.rom'));
const m = new CPC(path.join(ROOT, 'ref/cpc/xevious.dsk'));
m.boot('disc.bin');
let got = null;
const step0 = m.step.bind(m);
m.step = function () {
  if (!got && m.cpu.get_pc() === 0x3438 && !(m.intPending && m.cpu.get_iff1())) got = { ram: m.ram.slice(), f: m.frames };
  return step0();
};
m.onFrame = (f) => { if (f >= 100 && f < 110) m.keysOnly(['J_FIRE1']); else m.keysOnly([]); };
for (let f = 0; f < 400 && !got; f++) m.runFrames(1);
if (!got) throw new Error('restart_life не вызвана за 400 кадров');
const r = got.ram;
const set = OVL.initSet((a) => (a >= 0x100 && a < 0x100 + img.length ? img[a - 0x100] : r[a]), L, (i) => r[0x1a000 + i]);
if (set.length) throw new Error(`наложение на старте изменено: ${set.length} клеток`);
const VARS_LO = 0x3ce9, VARS_HI = 0x3f34;
const hx = (v) => '0x' + v.toString(16).padStart(2, '0');
let s = `; начальное состояние (tools/cpc/initstate.js, кадр CPC ${got.f}) — данные игры, не править\n`;
const sm = {};
for (const [k] of Object.entries(L)) {
  const mm = /^SM_([0-9A-F]{4})$/i.exec(k);
  if (mm) sm[k] = r[parseInt(mm[1], 16)];
}
s += 'INIT_SM_END:\t\t; значения SM_ — в build/gen/init_sm.json, их впечатывает в образ tools/vecbuild.js\n';
// 3C00h–3CE8h (остатки загрузчика CPC) и 3F34h–3FFFh (нули) игра не трогает — там шрифт и код Вектора (VARS_LO, VARS_HI)
let v = `; переменные игры (tools/cpc/initstate.js) — данные игры, не править\n`;
v += `\torg\t0x${VARS_LO.toString(16)}\nINIT_VARS:\n`;
for (let a = VARS_LO; a < VARS_HI; a += 16) v += '\tdb\t' + [...r.subarray(a, Math.min(a + 16, VARS_HI))].map(hx).join(',') + '\n';
v += 'INIT_VARS_END:\n';
fs.mkdirSync(path.join(ROOT, 'build/gen'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'build/gen/init_state.inc'), s);
fs.writeFileSync(path.join(ROOT, 'build/gen/init_vars.inc'), v);
fs.writeFileSync(path.join(ROOT, 'build/gen/init_sm.json'), JSON.stringify(sm, null, 1));
console.log(`начальное состояние: кадр ${got.f}, SM ${Object.keys(sm).length}`);
