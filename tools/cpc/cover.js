#!/usr/bin/env node
// Покрытие кода Xevious CPC на модели cpc6128.js: какие адреса исполнялись (начала команд и байты команд),
// какие читались/писались как данные. Сценарии — разные прогоны, итог объединяется.
//   node tools/cpc/cover.js [--frames N] [--seed S] [--out build/cov] [--god]
// Выход: exec.map (профиль Fuse 0xADDR,COUNT — для sna2ctl -m), code.txt / data.txt (диапазоны), summary.json.
'use strict';
const fs = require('fs');
const path = require('path');
const CPC = require('./cpc6128.js');
const ROOT = path.resolve(__dirname, '../..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
const OUT = arg('out', path.join(ROOT, 'build/cov'));
fs.mkdirSync(OUT, { recursive: true });

const execN = new Float64Array(0x10000);     // начала команд (адрес Z80, страница 0 — основная)
const exec4 = new Float64Array(0x10000);     // начала команд в странице 4 (звуковой драйвер xeviosnd.bin, окно 4000h)
const code = new Uint8Array(0x10000);        // байты команд
const rd = new Uint8Array(0x10000), wr = new Uint8Array(0x10000);
const other = new Map();                     // PC вне страницы 0 (окно 4000h+ в иной конфигурации и т.п.)

// линейный конгруэнтный генератор — повторяемо
let seed = +arg('seed', 1);
const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };

function attach(m) {
  let pc = -1, next = -1;
  const step0 = m.step.bind(m);
  m.step = function () {
    pc = m.cpu.get_pc(); next = pc;
    const page = m.map[pc >> 14] >> 14;
    if (pc < 0x4000 && page === 0) execN[pc]++;
    else if (page === 4 && (pc >> 14) === 1) exec4[pc]++;
    if (!(pc < 0x4000 && page === 0) && !(page === 4 && (pc >> 14) === 1)) { const k = `C${m.cfg}:${pc.toString(16)}`; other.set(k, (other.get(k) || 0) + 1); }
    const c = step0();
    pc = -1;
    return c;
  };
  m.onRead = (a, p) => {
    if (p >= 0x10000) return;                 // расширенная память — не код disc.bin
    if (pc >= 0 && a === next && a - pc < 4) { code[p] = 1; next++; return; }
    rd[p] = 1;
  };
  m.onWrite = (a, p) => { if (p < 0x10000) wr[p] = 1; };
}

// сценарий: случайная игра; огонь на титуле; иногда пауза и выбор бонуса
function scenario(name, frames, plan) {
  const m = new CPC(path.join(ROOT, 'ref/cpc/xevious.dsk'));
  m.boot('disc.bin');
  attach(m);
  let hold = [], until = 0;
  m.onFrame = (f) => { const k = plan(f, m); if (k) m.keysOnly(k); };
  const t0 = Date.now();
  m.runFrames(frames);
  console.log(`${name}: ${frames} кадров, ${((Date.now() - t0) / 1000).toFixed(0)} с`);
}

const F = +arg('frames', 20000);
// 1. титул без ввода (заставка, таблица рекордов, демо, если есть)
scenario('титул', 4000, () => []);
// 2. выбор бонуса 1/2/3 и старт
scenario('бонус', 1500, (f) => f >= 300 && f < 310 ? ['1'] : f >= 400 && f < 410 ? ['2'] : f >= 500 && f < 510 ? ['3']
  : f >= 600 && f < 610 ? ['J_FIRE1'] : f >= 900 && f < 905 ? ['P'] : f >= 1000 && f < 1005 ? ['P'] : []);
// 3. случайная игра, клавиатура и джойстик
{
  let cur = [], left = 0;
  const KEYS = [['J_LEFT'], ['J_RIGHT'], ['J_UP'], ['J_DOWN'], ['J_FIRE1'], ['J_FIRE2'], ['J_LEFT', 'J_FIRE1'],
    ['J_RIGHT', 'J_FIRE2'], ['J_UP', 'J_FIRE1', 'J_FIRE2'], ['CTRL'], ['SHIFT'], ['LEFT', 'CTRL'], ['RIGHT', 'SHIFT'], ['UP'], ['DOWN'], []];
  scenario('игра', F, (f) => {
    if (f % 700 === 650) return ['J_FIRE1'];          // старт после конца игры
    if (--left <= 0) { cur = KEYS[(rnd() * KEYS.length) | 0]; left = 5 + ((rnd() * 40) | 0); }
    return cur;
  });
}

// 4. каждая зона: старт с зоны n (3E5Ah), бесконечные жизни (3D39h = 3), в конце — без них: конец игры, рекорды
const AF = +arg('area-frames', 9000);
for (let n = 0; n < 8; n++) {
  let cur = [], left = 0;
  const KEYS = [['J_LEFT', 'J_FIRE1'], ['J_RIGHT', 'J_FIRE2'], ['J_UP', 'J_FIRE1', 'J_FIRE2'], ['J_DOWN', 'J_FIRE2'],
    ['J_FIRE1', 'J_FIRE2'], ['J_LEFT'], ['J_RIGHT'], ['J_UP'], ['J_DOWN'], []];
  scenario(`зона ${n + 1}`, AF, (f, m) => {
    if (f === 100) m.ram[0x3e5a] = n;
    if (f >= 100 && f < 110) return ['J_FIRE1'];
    if (f < AF - 2500) m.ram[0x3d39] = 3;
    if (f % 1500 === 1400 && f < AF - 2500) {        // к концу карты: переход в следующую зону (26F1h)
      const xo = m.ram[0x3e58];
      m.ram[0x3e53] = 0x40; m.ram[0x3e54] = 0x40;
      m.ram[0x3e55] = (0x40 + xo) & 0xff; m.ram[0x3e56] = 0x40 + ((0x40 + xo) >> 8);
    }
    if (--left <= 0) { cur = KEYS[(rnd() * KEYS.length) | 0]; left = 5 + ((rnd() * 30) | 0); }
    return cur;
  });
}

// ---- вывод
const lo = 0x0100, hi = 0x3f35;
let map = '';
for (let a = lo; a < hi; a++) if (execN[a]) map += `0x${a.toString(16).padStart(4, '0')},${execN[a]}\n`;
fs.writeFileSync(path.join(OUT, 'exec.map'), map);
let map4 = '';
for (let a = 0x4000; a < 0x4d00; a++) if (exec4[a]) map4 += `0x${a.toString(16)},${exec4[a]}\n`;
fs.writeFileSync(path.join(OUT, 'exec_snd.map'), map4);
const ranges = (arr) => {
  const r = []; let s = -1;
  for (let a = lo; a <= hi; a++) {
    const on = a < hi && arr(a);
    if (on && s < 0) s = a; else if (!on && s >= 0) { r.push([s, a]); s = -1; }
  }
  return r;
};
const fmt = (r) => r.map(([s, e]) => `${s.toString(16).padStart(4, '0')}-${(e - 1).toString(16).padStart(4, '0')} ${e - s}`).join('\n') + '\n';
const cr = ranges((a) => code[a]), dr = ranges((a) => !code[a] && (rd[a] || wr[a]));
fs.writeFileSync(path.join(OUT, 'code.txt'), fmt(cr));
fs.writeFileSync(path.join(OUT, 'data.txt'), fmt(dr));
let nc = 0, nd = 0, nw = 0, nn = 0;
for (let a = lo; a < hi; a++) { if (code[a]) nc++; else if (rd[a] || wr[a]) nd++; else nn++; if (wr[a] && !code[a]) nw++; }
const sum = { range: '0100-3F34', bytes: hi - lo, code: nc, data: nd, written: nw, untouched: nn,
  other_pc: [...other.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30) };
fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(sum, null, 1));
console.log(`код ${nc} Б, данные ${nd} Б (пишутся ${nw}), не тронуто ${nn} Б из ${hi - lo}; PC вне стр.0: ${other.size} адресов`);
