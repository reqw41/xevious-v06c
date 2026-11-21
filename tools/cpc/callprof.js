#!/usr/bin/env node
// Профиль вызовов Xevious CPC на модели cpc6128.js — опора для разметки по смыслу.
// Для каждой вызываемой процедуры (CALL/RST/прерывание): число вызовов, команды (своё и с вложенными),
// записи в экран (банки 1 и 3), куда пишет и откуда читает (корзины по 256 Б), кто вызывает, кого вызывает.
//   node tools/cpc/callprof.js [--area N] [--frames N] [--from F] [--out build/cov/callprof.txt] [--json путь]
'use strict';
const fs = require('fs');
const path = require('path');
const CPC = require('./cpc6128.js');
const ROOT = path.resolve(__dirname, '../..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
const AREA = +arg('area', 0), FRAMES = +arg('frames', 6000), FROM = +arg('from', 300);
const OUT = arg('out', path.join(ROOT, 'build/cov/callprof.txt'));

const m = new CPC(path.join(ROOT, 'ref/cpc/xevious.dsk'));
m.boot('disc.bin');

const R = new Map();    // ключ: адрес (стр.0) или 'S'+адрес (драйвер звука)
const rec = (k) => {
  let r = R.get(k);
  if (!r) R.set(k, r = { k, n: 0, self: 0, incl: 0, scr: 0, wr: new Map(), rd: new Map(), from: new Map(), to: new Map() });
  return r;
};
const stack = [];       // { r, ret, sp, i0 }
let on = false, ins = 0, curPc = 0;
const keyOf = (pc) => ((m.map[pc >> 14] >> 14) === 4 && (pc >> 14) === 1 ? 'S' : '') + pc.toString(16).padStart(4, '0');
const top = () => stack.length ? stack[stack.length - 1].r : rec('top');
const bump = (map, k) => map.set(k, (map.get(k) || 0) + 1);

m.onWrite = (a, p) => {
  if (!on) return;
  const r = top();
  if ((p >= 0x4000 && p < 0x8000) || (p >= 0xc000 && p < 0x10000)) r.scr++;
  else bump(r.wr, p >= 0x10000 ? 'B' + (p >> 14) + ':' + (a >> 8).toString(16) : p >> 8);
};
m.onRead = (a, p) => {
  if (!on || a === curPc) return;
  if (p < 0x10000 && !((p >= 0x4000 && p < 0x8000) || (p >= 0xc000 && p < 0x10000))) bump(top().rd, p >> 8);
  else if (p >= 0x10000) bump(top().rd, 'B' + (p >> 14) + ':' + ((a >> 8).toString(16)));
};

const LEN3 = (op) => op === 0xcd || (op & 0xc7) === 0xc4;
const step0 = m.step.bind(m);
m.step = function () {
  const cpu = m.cpu, pc = cpu.get_pc(), sp = cpu.getState().sp;
  const intr = m.intPending && cpu.get_iff1();
  const op = m.peek(pc);
  curPc = pc;
  const c = step0();
  if (!on) return c;
  ins++;
  const s = cpu.getState(), npc = s.pc, nsp = s.sp;
  const r0 = top(); r0.self++;
  if (nsp === ((sp - 2) & 0xffff)) {
    let ret = -1;
    if (intr) ret = pc;
    else if (LEN3(op) && npc !== pc + 3) ret = pc + 3;
    else if ((op & 0xc7) === 0xc7 && npc === (op & 0x38)) ret = pc + 1;
    if (ret >= 0) {
      const r = rec(intr ? 'int' : keyOf(npc));
      r.n++;
      bump(r.from, intr ? 'int' : keyOf(pc));
      bump(r0.to, r.k);
      stack.push({ r, ret, sp, i0: ins });
      return c;
    }
  }
  // возврат: снять кадры, чей адрес возврата совпал (или стек ушёл выше)
  while (stack.length) {
    const f = stack[stack.length - 1];
    if ((npc === f.ret && nsp >= f.sp) || nsp > f.sp + 0x40) { stack.pop(); f.r.incl += ins - f.i0; } else break;
  }
  return c;
};

let cur = [], left = 0, seed = 7;
const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
const KEYS = [['J_LEFT', 'J_FIRE1'], ['J_RIGHT', 'J_FIRE2'], ['J_UP', 'J_FIRE1', 'J_FIRE2'], ['J_DOWN', 'J_FIRE2'],
  ['J_FIRE1', 'J_FIRE2'], ['J_LEFT'], ['J_RIGHT'], ['J_UP'], []];
m.onFrame = (f) => {
  if (f === 100) m.ram[0x3e5a] = AREA;
  if (f >= 100 && f < 110) { m.keysOnly(['J_FIRE1']); return; }
  m.ram[0x3d39] = 3;
  on = f >= FROM;
  if (--left <= 0) { cur = KEYS[(rnd() * KEYS.length) | 0]; left = 5 + ((rnd() * 30) | 0); }
  m.keysOnly(cur);
};
m.runFrames(FRAMES);

const fr = FRAMES - FROM;
const hex = (k) => typeof k === 'number' ? k.toString(16).padStart(2, '0') : k;
const topN = (map, n) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
const rows = [...R.values()].filter((r) => r.k !== 'top').sort((a, b) => b.incl - a.incl);
let s = `# профиль вызовов: зона ${AREA + 1}, кадры ${FROM}..${FRAMES} (${fr}), команд всего ${ins}\n` +
  `# адрес  вызовов/кадр  команд с вложенными/кадр  свои/кадр  экран/кадр | пишет(стр.256) | читает | кто зовёт | кого зовёт\n`;
for (const r of rows) {
  s += `${r.k.padEnd(6)} ${(r.n / fr).toFixed(2).padStart(7)} ${(r.incl / fr).toFixed(0).padStart(8)} ${(r.self / fr).toFixed(0).padStart(7)} ${(r.scr / fr).toFixed(0).padStart(6)}` +
    ` | w ${topN(r.wr, 4).map(([k]) => hex(k)).join(',')} | r ${topN(r.rd, 5).map(([k]) => hex(k)).join(',')}` +
    ` | ${topN(r.from, 4).map(([k, v]) => k).join(',')} | ${topN(r.to, 8).map(([k]) => k).join(',')}\n`;
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, s);
console.log(`${rows.length} процедур -> ${path.relative(ROOT, OUT)}`);
