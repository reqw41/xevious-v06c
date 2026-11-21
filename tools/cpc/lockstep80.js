#!/usr/bin/env node
'use strict';
// Логика i8080 (build/logic.rom) в отдельном прогоне рядом с CPC: своя память, свой главный цикл (p_main_loop),
// платформа — заглушки. Снаружи даётся только то, что на Векторе даст прерывание (ввод, счётчик кадров, звук,
// пауза): значения, которые Z80 прочёл за обновление. После каждого обновления состояние сравнивается с CPC:
// переменные 3C00h–3FFFh, самоизменяемые операнды, буфер строки, наложение карты.
//   node tools/cpc/lockstep80.js [--god] [--area N] [--frames N] [--from F] [--seed S]
const path = require('path');
const fs = require('fs');
const CPC = require('./cpc6128.js');
const { core } = require('./run80.js');
const ROOT = path.resolve(__dirname, '../..');
const PLAT = require(path.join(ROOT, 'src/model/platform.js'));
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
const GOD = process.argv.includes('--god');
const AREA = +arg('area', 0), FRAMES = +arg('frames', 3000), FROM = +arg('from', 120);
let seed = +arg('seed', 7);
const hx = (v, n = 2) => v.toString(16).padStart(n, '0');

// байты прерывания: звук 3D3Ah..3D3Ch, кадры 3D3Dh, тонкая прокрутка кадра 3D3Fh, ввод 3D42h..3D4Ch, пауза 3F2Fh
const ISR = new Set([0x3d3a, 0x3d3b, 0x3d3c, 0x3d3d, 0x3d3f, 0x3f2f]);
for (let a = 0x3d42; a <= 0x3d4c; a++) ISR.add(a);

// ---- i8080 -------------------------------------------------------------------------------------------
const img = fs.readFileSync(path.join(ROOT, 'build/logic.rom'));
const L = JSON.parse(fs.readFileSync(path.join(ROOT, 'build/logic.json'), 'utf8'));
const mem = new Uint8Array(0x10000);
mem.set(img, 0x100);
const sm = [];                                   // [адрес i8080, адрес CPC]
for (const [k, v] of Object.entries(L)) {
  let r = /^SM_([0-9A-F]{4})$/i.exec(k); if (r) sm.push([v, parseInt(r[1], 16)]);
  r = /^SM2_([0-9A-F]{4})$/i.exec(k); if (r) { sm.push([v, parseInt(r[1], 16)]); sm.push([v + 1, parseInt(r[1], 16) + 1]); }
}
const plats = new Map();
for (const e of PLAT.entries) if (L['plat_' + e.name] !== undefined) plats.set(L['plat_' + e.name], e);
const MAGIC = 0xfff0;
const CPU = core();
const cpu = new CPU({ read: (a) => mem[a & 0xffff], write: (a, v) => { mem[a & 0xffff] = v & 0xff; } },
  { input: () => 0xff, output() {}, interrupt() {} });
function runMain() {
  let sp = L.STACK_TOP - 2;
  mem[sp] = MAGIC & 0xff; mem[sp + 1] = MAGIC >> 8;
  cpu.sp = sp; cpu.pc = L.p_main_loop;
  for (let n = 0; ; n++) {
    const pc = cpu.pc;
    if (pc === MAGIC) return null;
    if (n > 2e6) return 'обновление не кончилось за 2 млн команд';
    if (pc === L.hook_mapw && process.env.DBGMAP) console.log(`  i80 карта ${hx((cpu.d() << 8) | cpu.e(), 4)} := ${hx(cpu.a())} (обн. ${upd})`);
    if (pc === L.hook_mapw) { cpu.pc = mem[cpu.sp] | (mem[cpu.sp + 1] << 8); cpu.sp += 2; continue; }
    const e = plats.get(pc);
    if (e) {
      if (e.fx) return `вызов ${e.name} (fx) — в отдельном прогоне не поддержан`;
      let words = 0;
      for (const k of e.args) { const r = /^[sb](\d)$/.exec(k); if (r) words = Math.max(words, k[0] === 's' ? +r[1] + 1 : (+r[1] >> 1) + 1); }
      cpu.pc = mem[cpu.sp] | (mem[cpu.sp + 1] << 8);
      cpu.sp = (cpu.sp + 2 + (e.pop !== undefined ? e.pop : 2 * words)) & 0xffff;
      continue;
    }
    cpu.instruction();
  }
}
const OVL = require('./ovl80.js');
const ovl80 = (a) => OVL.value((x) => mem[x], L, a);

// ---- CPC ---------------------------------------------------------------------------------------------
const m = new CPC(path.join(ROOT, 'ref/cpc/xevious.dsk'));
m.boot('disc.bin');
const P = (a) => m.map[(a >> 14) & 3] + (a & 0x3fff);
if (process.env.DBGMAP) m.onWrite = (a, p, v) => { if (p >= 0x1a000 && p < 0x1c000) console.log(`  Z80 карта ${hx(p - 0x1a000 + 0x6000, 4)} := ${hx(v)} (кадр ${m.frames}, PC ${hx(m.cpu.get_pc(), 4)})`); };

function syncAll() {
  for (let a = 0x3c00; a < 0x4000; a++) mem[a] = m.ram[a];
  for (const [a, c] of sm) mem[a] = m.ram[c];
  for (let i = 0; i < 0x2000; i++) mem[L.MAP + i] = m.ram[0x18000 + i];
  for (let i = 0; i < 0x20; i++) mem[L.ROWBUF + i] = m.ram[P(0xb580 + i)];
  mem.fill(0, L.OVL_SET, L.OVL_SET_END);
  let k = L.OVL_SET;
  for (const [a, v] of OVL.initSet((x) => mem[x], L, (i) => m.ram[0x1a000 + i]).slice(0, (L.OVL_SET_END - L.OVL_SET) / 3)) {
    mem[k++] = a & 0xff; mem[k++] = a >> 8; mem[k++] = v;
  }
}
function compare() {
  const d = [];
  for (let a = 0x3c00; a < 0x4000; a++) if (!ISR.has(a) && mem[a] !== m.ram[a]) d.push(`${hx(a, 4)} ${hx(mem[a])}≠${hx(m.ram[a])}`);
  for (const [a, c] of sm) if (mem[a] !== m.ram[c]) d.push(`SM_${hx(c, 4)} ${hx(mem[a])}≠${hx(m.ram[c])}`);
  for (let i = 2; i < 0x20; i++) { const v = m.ram[P(0xb580 + i)]; if (mem[L.ROWBUF + i] !== v) d.push(`B5${hx(0x80 + i)} ${hx(mem[L.ROWBUF + i])}≠${hx(v)}`); }
  for (let i = 0; i < 0x2000; i++) { const v = m.ram[0x1a000 + i], u = ovl80(0x6000 + i); if (u !== v) d.push(`карта ${hx(0x6000 + i, 4)} ${hx(u)}≠${hx(v)}`); }
  return d;
}

// чтения байтов прерывания вне прерывания за обновление: первое значение
let isrSp = [], reads = new Map(), start = new Map(), started = false, upd = 0, bad = 0, reports = 0;
m.onRead = (a, p, v) => { if (!isrSp.length && ISR.has(p) && p === a && !reads.has(p)) reads.set(p, v); };
const step0 = m.step.bind(m);
let on = false, LIVES = false;
m.step = function () {
  const c = m.cpu;
  const intr = m.intPending && c.get_iff1();
  if (intr) isrSp.push(c.get_sp());
  const pc = c.get_pc();
  if (on && !intr && !isrSp.length && pc === 0x3aaf) {
    if (started) {                                     // i8080 — то же обновление
      for (const a of ISR) mem[a] = reads.has(a) ? reads.get(a) : start.get(a);
      const err = runMain();
      upd++;
      const d = err ? [err] : compare();
      if (d.length) {
        bad++;
        if (reports++ < 5) console.log(`✗ обновление ${upd} (кадр ${m.frames}): ${d.length} расхождений: ${d.slice(0, 12).join('; ')}`);
        syncAll();
      }
      for (const a of ISR) mem[a] = m.ram[a];
    } else { syncAll(); started = true; }
    if (GOD) m.ram[0x3f1b] = 0;
    if (LIVES) m.ram[0x3d39] = 3;
    mem[0x3f1b] = m.ram[0x3f1b]; mem[0x3d39] = m.ram[0x3d39];
    reads = new Map(); start = new Map([...ISR].map((a) => [a, m.ram[a]]));
  }
  const cyc = step0();
  while (isrSp.length && c.get_sp() >= isrSp[isrSp.length - 1]) isrSp.pop();
  return cyc;
};
const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
const KEYS = [['J_LEFT', 'J_FIRE1'], ['J_RIGHT', 'J_FIRE2'], ['J_UP', 'J_FIRE1', 'J_FIRE2'], ['J_DOWN', 'J_FIRE2'],
  ['J_FIRE1', 'J_FIRE2'], ['J_LEFT'], ['J_RIGHT'], ['J_UP'], []];
let cur = [], left = 0;
m.onFrame = (f) => {
  if (f === 100) m.ram[0x3e5a] = AREA;
  if (f >= 100 && f < 110) { m.keysOnly(['J_FIRE1']); return; }
  LIVES = f < FRAMES - 600;
  on = f >= FROM;
  if (--left <= 0) { cur = KEYS[(rnd() * KEYS.length) | 0]; left = 5 + ((rnd() * 30) | 0); }
  m.keysOnly(cur);
};
const t0 = Date.now();
m.runFrames(FRAMES);
console.log(`зона ${AREA + 1}${GOD ? ' (без гибели)' : ''}: обновлений ${upd}, с расхождениями ${bad}; очки ` +
  `${[0, 1, 2].map((i) => hx(m.ram[0x3f24 + i])).join('')}, зона ${m.ram[0x3e5a] + 1}, ${((Date.now() - t0) / 1000).toFixed(0)} с`);
process.exit(bad ? 1 : 0);
