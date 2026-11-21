#!/usr/bin/env node
// Сверка JS-модели логики с Z80 на модели CPC, процедура за процедурой.
// На входе в процедуру, у которой есть JS (src/model/*.js, массив procs), запоминаются регистры; Z80 исполняет её до
// возврата, при этом запоминаются прежние значения всех байтов, что он меняет (кроме прерываний). После возврата JS
// исполняется на снимке входа: память = прежние значения, но то, что поменяло прерывание (джойстик, счётчик кадров),
// JS видит уже новым — как его, скорее всего, прочёл и Z80. Сравниваются:
//   * память: всё, что записал Z80 вне прерываний и вне вызовов платформы, против записей JS (по итоговым значениям);
//   * регистры из списка out и SP после возврата (снятие аргументов со стека вызываемой процедурой);
//   * вызовы платформы (src/model/platform.js: вывод, звук) — имя и аргументы по порядку.
// Свойства процедуры: out, pop — см. выше; screen: true — записи в экраны (страницы 1 и 3) не сверять (вывод внутри
// самой процедуры); loop: true — отрезок от входа до следующего прихода на тот же адрес с тем же SP (главный цикл).
//   node tools/cpc/oracle.js [--god] [--area N] [--frames N] [--from F] [--seed S] [--only имя,имя] [--show N]
//                            [--poke 'кадр:адрес=знач,...;...'] [--press 'кадр:клавиша,...;...' (4 кадра)]
// Отладка: DBG=имя — вход процедуры; DBGT=имя — пошаговый след внутри; DBGW=адрес — записи по адресу.
'use strict';
const path = require('path');
const CPC = require('./cpc6128.js');
const ROOT = path.resolve(__dirname, '../..');
const model = require(path.join(ROOT, 'src/model/index.js'));
const PLAT = require(path.join(ROOT, 'src/model/platform.js'));
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
const GOD = process.argv.includes('--god');   // без гибели: 3F1Bh := 0 перед каждым обновлением (охват дальних строк)
const AREA = +arg('area', 0), FRAMES = +arg('frames', 3000), FROM = +arg('from', 120), SHOW = +arg('show', 3);
let seed = +arg('seed', 7);
const POKE = arg('poke', '').split(';').filter(Boolean).map((x) => { const [f, l] = x.split(':');
  return [+f, l.split(',').map((y) => y.split('=').map((z) => parseInt(z, 16)))]; });
const PRESS = arg('press', '').split(';').filter(Boolean).map((x) => { const [f, k] = x.split(':'); return [+f, k.split(',')]; });
const I80 = process.argv.includes('--i80');   // ещё и код i8080 (build/logic.rom) на том же снимке
const ONLY = arg('only', '') ? new Set(arg('only', '').split(',')) : null;
const DBG = process.env.DBG, DBGT = process.env.DBGT, DBGW = process.env.DBGW ? parseInt(process.env.DBGW, 16) : -1;
const hx = (v, n = 2) => (v ?? 0).toString(16).padStart(n, '0');

const procs = new Map();
for (const p of model.procs) if (!ONLY || ONLY.has(p.name)) procs.set(p.at, p);
const plats = new Map(PLAT.entries.map((e) => [e.at, e]));
const platByName = new Map(PLAT.entries.map((e) => [e.name, e]));

const m = new CPC(path.join(ROOT, 'ref/cpc/xevious.dsk'));
m.boot('disc.bin');
const isScreen = (p) => (p >= 0x4000 && p < 0x8000) || (p >= 0xc000 && p < 0x10000);

function platArgs(spec, get) { return spec.args.map((k) => hx(get(k), k.length > 1 && k !== 'b0' && k !== 'b2' ? 4 : 2)).join(','); }
function z80Get(s) {
  const w = (a) => m.peek(a & 0xffff) | (m.peek((a + 1) & 0xffff) << 8);
  return (k) => ({ a: s.a, b: s.b, c: s.c, d: s.d, e: s.e, h: s.h, l: s.l, bc: (s.b << 8) | s.c, de: (s.d << 8) | s.e,
    hl: (s.h << 8) | s.l, ix: s.ix, iy: s.iy, s0: w(s.sp + 2), s1: w(s.sp + 4), s2: w(s.sp + 6), b0: m.peek((s.sp + 2) & 0xffff),
    b2: m.peek((s.sp + 4) & 0xffff) })[k];
}

// машина для JS на снимке входа: что Z80 прочёл до своей записи (fr), иначе прежние значения (orig), иначе живая
// память; запись — в свою карту. fr нужен для байтов, что меняет прерывание посреди процедуры (джойстик 3D42h).
function jsMachine(c) {
  const s = c.s0, map = c.map, w = new Map(), plat = [], rw = new Map(), fxq = c.fx.slice(), ins = c.ins.slice();
  const P = (a) => map[(a >> 14) & 3] + (a & 0x3fff);
  const at = (p) => (rw.has(p) ? rw.get(p) : c.fr.has(p) ? c.fr.get(p) : c.orig.has(p) ? c.orig.get(p) : m.ram[p]);
  const rd = (a) => at(P(a & 0xffff));
  const mm = {
    r: { a: s.a, b: s.b, c: s.c, d: s.d, e: s.e, h: s.h, l: s.l, ix: s.ix, iy: s.iy, sp: s.sp, i: s.i },
    rd, rd16: (a) => rd(a) | (rd(a + 1) << 8),
    wr: (a, v) => { w.set(P(a & 0xffff), v & 0xff); rw.set(P(a & 0xffff), v & 0xff); },
    wr16: (a, v) => { mm.wr(a, v); mm.wr(a + 1, v >> 8); },
    // страница памяти CPC напрямую (банк карты 6 и т.п.): адрес — внутри окна 16 КБ
    rdP: (pg, a) => at(pg * 0x4000 + (a & 0x3fff)),
    wrP: (pg, a, v) => { w.set(pg * 0x4000 + (a & 0x3fff), v & 0xff); rw.set(pg * 0x4000 + (a & 0x3fff), v & 0xff); },
    arg: (i) => rd((s.sp + 2 + i) & 0xffff),                // байт стекового аргумента (после адреса возврата)
    arg16: (i) => rd((s.sp + 2 + i) & 0xffff) | (rd((s.sp + 3 + i) & 0xffff) << 8),
    plat: (name, a) => {
      const e = platByName.get(name); if (!e) throw new Error('нет входа платформы ' + name);
      plat.push(`${name}(${platArgs(e, (k) => { if (!(k in a)) throw new Error(`${name}: нет аргумента ${k}`); return a[k]; })})`);
      if (e.fx) {          // записи и регистры Z80 внутри этого вызова платформы — JS видит их итог
        const k = fxq.findIndex((f) => f.name === name);
        if (k < 0) throw new Error(`${name}: у Z80 такого вызова нет`);
        const f = fxq.splice(k, 1)[0];
        for (const [p, v] of f.w) rw.set(p, v);   // читать — новое; сверка — только свои записи (w)
        return f.out;
      }
      if (e.ret) return e.ret(mm, a);
    },
    inp: () => { if (!ins.length) throw new Error('IN: у Z80 чтений порта больше нет'); return ins.shift(); },
    _w: w, _plat: plat,
  };
  return mm;
}

// адреса только CPC: регистр I (конфигурация памяти) в операндах — на Векторе его нет
const CPC_ONLY = new Set([0x1ea1, 0x1eed, 0x1f21]);
let L80 = null;
if (I80) { const { Logic80 } = require('./run80.js'); L80 = new Logic80(path.join(ROOT, 'build/logic.rom'), PLAT); }

function check80(c, s) {
  const key = c.p.name + ' i80';
  const st = stat.get(key) || { n: 0, bad: 0, shown: 0 }; stat.set(key, st); st.n++;
  const at = (p) => (c.fr.has(p) ? c.fr.get(p) : c.orig.has(p) ? c.orig.get(p) : m.ram[p]);
  let r, diffs = [];
  try { r = L80.run(c, at, c.fx.slice(), c.ins.slice(), platArgs); } catch (e) { diffs.push('i80: ' + e.stack.split('\n').slice(0, 3).join(' | ')); }
  if (r) {
    if (r.err) diffs.push('i80: ' + r.err);
    const keys = new Set([...c.zw.keys(), ...r.w.keys()]);
    for (const p of [...keys].sort((x, y) => x - y)) {
      if ((c.p.screen && isScreen(p)) || CPC_ONLY.has(p)) continue;
      const o = c.orig.has(p) ? c.orig.get(p) : m.ram[p];
      const z = c.zw.has(p) ? c.zw.get(p) : o, j = r.w.has(p) ? r.w.get(p) : o;
      if (z !== j) diffs.push(`[${hx(p, 5)}] z80 ${hx(z)} i80 ${hx(j)} (было ${hx(o)})`);
    }
    for (const k of c.p.out || []) {
      const zv = k.length === 2 ? (s[k[0]] << 8) | s[k[1]] : s[k], jv = k.length === 2 ? (r.regs[k[0]] << 8) | r.regs[k[1]] : r.regs[k];
      if (zv !== jv) diffs.push(`${k}: z80 ${hx(zv)} i80 ${hx(jv)}`);
    }
    if (!c.p.loop) {
      const popped = s.sp - c.sp - 2;
      if (popped !== r.popped) diffs.push(`снято со стека z80 ${popped}, i80 ${r.popped}`);
    }
    const zp = c.zp.join(' '), jp = r.plat.join(' ');
    if (zp !== jp) diffs.push(`платформа\n    z80: ${zp}\n    i80: ${jp}`);
  }
  if (diffs.length) {
    st.bad++; fails++;
    if (st.shown++ < SHOW) console.log(`\n✗ ${key} кадр ${m.frames} вход ${JSON.stringify(c.inRegs)}\n  ` + diffs.slice(0, 14).join('\n  '));
  }
}

const stat = new Map();     // имя -> {n, bad, shown}
const checks = [];          // активные сверки
const quiet = [];           // кадры прерываний и платформы {ret, sp, isr}
let fails = 0;
// для сверки c «громко» — когда над её глубиной нет кадров платформы/прерываний; прерывание над ней — чужие записи
const loudFor = (c) => quiet.length === c.qd;
const isrAbove = (c) => { for (let i = c.qd; i < quiet.length; i++) if (quiet[i].isr) return true; return false; };

const WSET = process.env.WSET ? new Map() : null;
const PLATLOG = process.env.PLATLOG ? new Map() : null;  // учёт ресурсов: вызовы платформы (имя и аргументы) -> сколько раз   // отладка: какие адреса пишет логика (кроме экрана)
function finish(c, s) {
  if (WSET) for (const p of c.zw.keys()) if (!(c.p.screen && isScreen(p))) { if (!WSET.has(p)) WSET.set(p, new Set()); WSET.get(p).add(c.p.name); }
  const st = stat.get(c.p.name) || { n: 0, bad: 0, shown: 0 }; stat.set(c.p.name, st); st.n++;
  const js = jsMachine(c);
  if (DBG && c.p.name === DBG) console.log(`вход ${c.p.name} кадр ${m.frames} ${JSON.stringify(c.inRegs)}`);
  let out = {}, err = null;
  try { out = c.p.fn(js) || {}; } catch (e) { err = e.stack.split('\n').slice(0, 3).join(' | '); }
  const diffs = [];
  if (err) diffs.push('JS: ' + err);
  const keys = new Set([...c.zw.keys(), ...js._w.keys()]);
  for (const p of [...keys].sort((x, y) => x - y)) {
    if (c.p.screen && isScreen(p)) continue;
    const o = c.orig.has(p) ? c.orig.get(p) : m.ram[p];
    const z = c.zw.has(p) ? c.zw.get(p) : o;
    const j = js._w.has(p) ? js._w.get(p) : o;
    if (z !== j) diffs.push(`[${hx(p, 5)}] z80 ${hx(z)} js ${hx(j)} (было ${hx(o)})`);
  }
  for (const k of c.p.out || []) {
    const zv = k.length === 2 ? (s[k[0]] << 8) | s[k[1]] : s[k];
    if (zv !== out[k]) diffs.push(`${k}: z80 ${hx(zv)} js ${out[k] === undefined ? '—' : hx(out[k])}`);
  }
  if (!c.p.loop) {
    const popped = s.sp - c.sp - 2, want = c.p.pop || 0;
    if (popped !== want) diffs.push(`снято со стека z80 ${popped}, ожидалось ${want}`);
  }
  const zp = c.zp.join(' '), jp = js._plat.join(' ');
  if (zp !== jp) diffs.push(`платформа\n    z80: ${zp}\n    js:  ${jp}`);
  if (L80 && L80.procs.has(c.p.name)) check80(c, s);
  if (diffs.length) {
    st.bad++; fails++;
    if (st.shown++ < SHOW) console.log(`\n✗ ${c.p.name} кадр ${m.frames} вход ${JSON.stringify(c.inRegs)}\n  ` + diffs.slice(0, 14).join('\n  '));
  }
}

m.onWrite = (a, p, v) => {
  if (p === DBGW) console.log(`  w ${hx(p, 4)}=${hx(v)} pc ${hx(m.cpu.get_pc(), 4)} кадр ${m.frames} checks ${checks.map((c) => c.p.name)} quiet ${quiet.length}`);
  if (!checks.length) return;
  if (!isScreen(p)) {                       // записи внутри fx-вызова платформы (не в прерывании поверх него)
    for (let i = quiet.length - 1; i >= 0 && !quiet[i].isr; i--) if (quiet[i].fx) { quiet[i].fx.w.set(p, v & 0xff); break; }
  }
  for (const c of checks) {
    if (isrAbove(c)) continue;
    if (!c.orig.has(p)) c.orig.set(p, m.ram[p]);
    if (loudFor(c) && !(a < c.sp && a >= c.sp - 0x100)) c.zw.set(p, v & 0xff);    // стек ниже входа — рабочая область
  }
};

m.onRead = (a, p, v) => {
  if (!checks.length) return;
  for (const c of checks) if (loudFor(c) && !c.orig.has(p) && !c.fr.has(p)) c.fr.set(p, v);
};

// чтения портов (клавиатура в прерывании) — вход для JS по порядку: m.inp()
const in0 = m._in.bind(m);
m._in = (port) => { const v = in0(port); for (const c of checks) if (loudFor(c)) c.ins.push(v); return v; };

const step0 = m.step.bind(m);
let on = false;
m.step = function () {
  const cpu = m.cpu;
  const intr = m.intPending && cpu.get_iff1();
  const pc = cpu.get_pc();
  // конец отрезка главного цикла: пришли снова на его адрес с тем же SP
  if (!intr && checks.length) {
    const c = checks[checks.length - 1];
    if (loudFor(c) && c.p.loop && pc === c.p.at && cpu.get_sp() === c.sp && c.started) { checks.pop(); finish(c, cpu.getState()); }
  }
  if (on && pc === 0x3aaf) {                              // подстановки — до начала обновления, не посреди него
    if (GOD) m.ram[0x3f1b] = 0;                           // без гибели
    if (LIVES) m.ram[0x3d39] = 3;                         // жизни не кончаются (до последних 600 кадров)
  }
  const hot = on && !intr && (pc < 0x4000 ? plats.has(pc) || procs.has(pc) : plats.has(pc) && plats.get(pc).hi);
  if (hot) {
    const s0 = cpu.getState();
    const pe = plats.get(pc);
    const loud = pe ? checks.filter(loudFor) : [];
    if (PLATLOG && pe) { const k = `${pe.name}(${platArgs(pe, z80Get(s0))})`; PLATLOG.set(k, (PLATLOG.get(k) || 0) + 1); }
    if (loud.length) {
      const str = `${pe.name}(${platArgs(pe, z80Get(s0))})`;
      for (const c of loud) c.zp.push(str);
    }
    if (pe && checks.length) {
      let fx = null;
      if (pe.fx && loud.length) { fx = { name: pe.name, w: new Map(), out: null }; for (const c of loud) c.fx.push(fx); }
      quiet.push({ ret: m.peek(s0.sp) | (m.peek(s0.sp + 1) << 8), sp: s0.sp, fx });
    }
    const p = procs.get(pc);
    // этап прерывания (isr: true) сверяется и внутри прерывания поверх чего угодно
    const can = p && (p.isr || !quiet.length);
    if (can && !checks.some((c) => c.p === p && c.sp === s0.sp)) {
      checks.push({ p, s0, map: m.map.slice(), sp: s0.sp, qd: quiet.length, ins: [], ret: p.loop ? -1 : m.peek(s0.sp) | (m.peek(s0.sp + 1) << 8),
        zw: new Map(), orig: new Map(), fr: new Map(), zp: [], fx: [], started: false,
        inRegs: { a: hx(s0.a), l: hx(s0.l), h: hx(s0.h), sp: hx(s0.sp, 4),
          s: [2, 4, 6].map((i) => hx(m.peek(s0.sp + i) | (m.peek(s0.sp + i + 1) << 8), 4)).join(' ') } });
    }
  }
  if (intr && checks.length) quiet.push({ ret: pc, sp: cpu.get_sp() - 1, isr: true });   // после RETI SP = прежний
  if (DBGT && checks.some((c) => c.p.name === DBGT)) { const t = cpu.getState(); console.log(`   ${hx(pc, 4)} a ${hx(t.a)} c ${hx(t.c)} hl ${hx((t.h << 8) | t.l, 4)} sp ${hx(t.sp, 4)}`); }
  const cyc = step0();
  if (!checks.length && !quiet.length) return cyc;
  for (const c of checks) c.started = true;
  const s = { pc: cpu.get_pc(), sp: cpu.get_sp() };
  while (quiet.length) {
    const q = quiet[quiet.length - 1];
    if ((s.pc === q.ret && s.sp > q.sp) || s.sp > q.sp + 0x40) {
      quiet.pop();
      if (q.fx) { const t = cpu.getState(); q.fx.out = { a: t.a, f: t.f, b: t.b, c: t.c, d: t.d, e: t.e, h: t.h, l: t.l }; }
    } else break;
  }
  while (checks.length) {
    const c = checks[checks.length - 1];
    if (!c.p.loop && s.pc === c.ret && s.sp > c.sp) { checks.pop(); finish(c, cpu.getState()); } else break;
  }
  return cyc;
};

const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
const KEYS = [['J_LEFT', 'J_FIRE1'], ['J_RIGHT', 'J_FIRE2'], ['J_UP', 'J_FIRE1', 'J_FIRE2'], ['J_DOWN', 'J_FIRE2'],
  ['J_FIRE1', 'J_FIRE2'], ['J_LEFT'], ['J_RIGHT'], ['J_UP'], []];
let cur = [], left = 0, LIVES = false;
m.onFrame = (f) => {
  if (f === 100) m.ram[0x3e5a] = AREA;
  if (f >= 100 && f < 110) { m.keysOnly(['J_FIRE1']); return; }
  for (const [pf, l] of POKE) if (pf === f) for (const [a, v] of l) m.ram[a] = v;
  LIVES = f < FRAMES - 600 && !POKE.length;
  on = f >= FROM;
  if (--left <= 0) { cur = KEYS[(rnd() * KEYS.length) | 0]; left = 5 + ((rnd() * 30) | 0); }
  const pr = PRESS.find(([pf]) => f >= pf && f < pf + 4);
  m.keysOnly(pr ? cur.concat(pr[1]) : cur);
};
const t0 = Date.now();
m.runFrames(FRAMES);
console.log(`\nочки ${[0, 1, 2].map((i) => hx(m.ram[0x3f24 + i])).join('')}, жизни ${m.ram[0x3d39]}, зона ${m.ram[0x3e5a] + 1}`);
console.log(`зона ${AREA + 1}, кадры ${FROM}..${FRAMES}, ${((Date.now() - t0) / 1000).toFixed(0)} с`);
for (const [n, st] of [...stat.entries()].sort()) console.log(`${st.bad ? '✗' : '✓'} ${n.padEnd(20)} вызовов ${st.n}${st.bad ? `, расхождений ${st.bad}` : ''}`);
const never = [...procs.values()].filter((p) => !stat.has(p.name)).map((p) => p.name);
if (L80) {
  const no80 = [...procs.values()].filter((p) => !L80.procs.has(p.name)).map((p) => p.name);
  console.log(`i80: процедур ${L80.procs.size} из ${procs.size}` + (no80.length ? `; нет: ${no80.join(', ')}` : ''));
  for (const n of L80.procs.keys()) if (!procs.has([...procs.values()].find((p) => p.name === n)?.at)) console.log(`i80: p_${n} — нет такой процедуры в модели`);
}
if (never.length) console.log('не вызывались: ' + never.join(', '));
if (WSET) require('fs').writeFileSync(process.env.WSET, [...WSET.entries()].sort((a, b) => a[0] - b[0])
  .map(([p, n]) => `${hx(p, 5)} ${[...n].join(',')}`).join('\n') + '\n');
if (PLATLOG) require('fs').writeFileSync(process.env.PLATLOG, [...PLATLOG.entries()].map(([k, n]) => `${n}\t${k}`).join('\n') + '\n');
process.exit(fails ? 1 : 0);
