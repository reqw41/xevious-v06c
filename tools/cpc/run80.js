'use strict';
// Исполнение процедуры i8080 (build/logic.rom) на снимке входа сверки oracle.js (docs/I8080.md).
// Память i8080 — плоские 64 КБ: код и таблицы из образа; состояние игры читается из снимка CPC через перевод адресов:
//   3C00h–3FFFh            — те же адреса CPC (переменные);
//   SM_xxxx                — самоизменяемый операнд CPC по адресу xxxx (1 байт; SM2_xxxx — 2 байта);
//   MAP .. +1FFFh          — слой тайлов карты: банк 6 CPC, окно 4000h–5FFFh (наложение 6000h–7FFFh вычисляется
//                            кодом: список OVL_SET собирается по снимку (tools/cpc/ovl80.js), записи игры в карту —
//                            через hook_mapw);
//   ROWBUF .. +1Fh         — B580h–B59Fh CPC;
//   SCRATCH .. SCRATCH_END — свои рабочие байты i8080 (не состояние; на входе нули);
//   стек — ниже STACK_TOP.
// Записи i8080 переводятся обратно в физические адреса CPC и сравниваются с Z80 так же, как у JS.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const OVL = require('./ovl80.js');
const ROOT = path.resolve(__dirname, '../..');
const VENDOR = path.join(ROOT, 'tools/vendor/vector06js');
const MAGIC = 0xfff0;          // адрес возврата из процедуры — конец прогона

let I8080 = null;
function core() {
  if (I8080) return I8080;
  const g = { console, Math, Array, Object, Number, Error, alert: (s) => { throw new Error(String(s)); } };
  g.window = g;
  const ctx = vm.createContext(g);
  vm.runInContext(fs.readFileSync(path.join(VENDOR, 'i8080.js'), 'utf8'), ctx, { filename: 'i8080.js' });
  return (I8080 = vm.runInContext('I8080', ctx));
}

class Logic80 {
  constructor(romPath, platform) {
    this.img = fs.readFileSync(romPath);
    this.L = JSON.parse(fs.readFileSync(romPath.replace(/\.rom$/, '.json'), 'utf8'));
    const L = this.L, need = (k) => { if (L[k] === undefined) throw new Error(`logic.json: нет метки ${k}`); return L[k]; };
    this.MAP = need('MAP'); this.ROWBUF = need('ROWBUF'); this.STACK_TOP = need('STACK_TOP');
    this.SCR0 = need('SCRATCH'); this.SCR1 = need('SCRATCH_END');
    this.OF0 = need('OVL_SET'); this.OF1 = need('OVL_SET_END'); this.HOOK = need('hook_mapw');
    this.sm = new Map();         // адрес i8080 -> адрес CPC (стр. 0)
    for (const [k, v] of Object.entries(L)) {
      let m = /^SM_([0-9A-F]{4})$/i.exec(k);
      if (m) this.sm.set(v, parseInt(m[1], 16));
      m = /^SM2_([0-9A-F]{4})$/i.exec(k);
      if (m) { this.sm.set(v, parseInt(m[1], 16)); this.sm.set(v + 1, parseInt(m[1], 16) + 1); }
    }
    this.smInv = new Map([...this.sm.entries()].map(([a, b]) => [b, a]));
    this.procs = new Map();      // имя процедуры модели -> адрес
    for (const [k, v] of Object.entries(L)) if (k.startsWith('p_') && !k.includes('.')) this.procs.set(k.slice(2), v);
    this.plats = new Map();      // адрес заглушки -> вход платформы
    for (const e of platform.entries) if (L['plat_' + e.name] !== undefined) this.plats.set(L['plat_' + e.name], e);
  }

  // адрес i8080 -> физический адрес CPC (или -1 — не состояние); P — перевод логического адреса CPC на входе
  toCpc(a, P) {
    if (this.sm.has(a)) return this.sm.get(a);
    if (a >= 0x3c00 && a < 0x4000) return a;
    if (a >= this.MAP && a < this.MAP + 0x2000) return 6 * 0x4000 + (a - this.MAP);
    if (a >= this.ROWBUF && a < this.ROWBUF + 0x20) return P(0xb580 + a - this.ROWBUF);
    return -1;
  }
  // обратно (для записей платформы fx)
  fromCpc(p, P) {
    if (this.smInv.has(p)) return this.smInv.get(p);
    if (p >= 0x3c00 && p < 0x4000) return p;
    if (p >= 0x18000 && p < 0x1a000) return this.MAP + p - 0x18000;
    for (let i = 0; i < 0x20; i++) if (P(0xb580 + i) === p) return this.ROWBUF + i;
    return -1;
  }

  /**
   * c — сверка (s0, map, sp), at(p) — чтение снимка CPC по физическому адресу, fx — записи платформ fx,
   * ins — чтения портов. Итог: { w: Map(физ. CPC -> знач), plat: [], regs, popped, err }.
   */
  run(c, at, fxq, ins, platArgs) {
    const CPU = core(), self = this, map = c.map;
    const P = (a) => map[(a >> 14) & 3] + (a & 0x3fff);
    const w = new Map(), rv = new Map(), plat = [], errs = [];   // w — свои записи (сверка), rv — всё для чтения
    const img = this.img, base = 0x100, top = this.STACK_TOP;
    const stack = new Map(), hw = new Map();   // hw — записи в карту через hook_mapw (физ. CPC)
    const mem = {
      read(a) {
        a &= 0xffff;
        if (rv.has(a)) return rv.get(a);
        if (a < top && a >= top - 0x200) return stack.has(a) ? stack.get(a) : 0;
        const p = self.toCpc(a, P);
        if (p >= 0) return at(p);
        if (a >= base && a < base + img.length) return img[a - base];
        return 0;
      },
      write(a, v) {
        a &= 0xffff;
        if (a < top && a >= top - 0x200) { stack.set(a, v & 0xff); return; }
        if (a >= base && a < base + img.length && !(a >= self.SCR0 && a < self.SCR1) && !(a >= self.OF0 && a < self.OF1)
            && self.toCpc(a, P) < 0) {
          errs.push(`запись в код/таблицу ${a.toString(16)}`);
        }
        w.set(a, v & 0xff); rv.set(a, v & 0xff);
      },
    };
    // изменённые клетки наложения — из снимка
    { let k = this.OF0;
      const set = OVL.initSet((x) => mem.read(x), this.L, (i) => at(0x1a000 + i));
      if (set.length * 3 > this.OF1 - this.OF0) errs.push(`наложение: изменённых клеток ${set.length}, мест меньше`);
      for (const [x, v] of set.slice(0, (this.OF1 - this.OF0) / 3)) { rv.set(k++, x & 0xff); rv.set(k++, x >> 8); rv.set(k++, v); }
      while (k < this.OF1) rv.set(k++, 0); }
    const io = { input: () => { if (!ins.length) { errs.push('IN: чтений порта больше нет'); return 0xff; } return ins.shift(); },
      output() {}, interrupt() {} };
    const cpu = new CPU(mem, io);
    const s = c.s0;
    cpu.set_a(s.a); cpu.set_b(s.b); cpu.set_c(s.c); cpu.set_d(s.d); cpu.set_e(s.e); cpu.set_h(s.h); cpu.set_l(s.l);
    cpu.retrieve_flags(s.f || 0);
    // стек: адрес возврата MAGIC и 32 байта аргументов Z80
    const sp0 = top - 0x40;
    stack.set(sp0, MAGIC & 0xff); stack.set(sp0 + 1, MAGIC >> 8);
    for (let i = 2; i < 0x22; i++) stack.set(sp0 + i, at(P(s.sp + i)));
    cpu.sp = sp0; cpu.pc = this.procs.get(c.p.name);
    const w16 = (a) => mem.read(a) | (mem.read(a + 1) << 8);
    let n = 0;
    for (;;) {
      const pc = cpu.pc;
      if (pc === MAGIC) break;
      if (++n > 3e5) { errs.push('не вернулась за 300 тыс. команд'); break; }
      if (pc === this.HOOK) {                       // запись игры в карту: A -> окно DE (банк 6)
        const de = (cpu.d() << 8) | cpu.e();
        if (de < 0x4000 || de >= 0x8000) errs.push(`hook_mapw: адрес ${de.toString(16)}`);
        else hw.set(6 * 0x4000 + de - 0x4000, cpu.a());
        cpu.pc = w16(cpu.sp); cpu.sp = (cpu.sp + 2) & 0xffff;
        continue;
      }
      const e = this.plats.get(pc);
      if (e) {
        const sp = cpu.sp, R = { a: cpu.a(), b: cpu.b(), c: cpu.c(), d: cpu.d(), e: cpu.e(), h: cpu.h(), l: cpu.l() };
        const get = (k) => {
          const r = e.v80 && e.v80[k] ? e.v80[k] : k;
          if (r.length === 1) return R[r];
          if (r === 'bc' || r === 'de' || r === 'hl') return (R[r[0]] << 8) | R[r[1]];
          if (r[0] === 's') return w16(sp + 2 + 2 * +r[1]);
          if (r[0] === 'b') return mem.read(sp + 2 + +r[1]);
          throw new Error(`${e.name}: аргумент ${k}`);
        };
        plat.push(`${e.name}(${platArgs(e, get)})`);
        let words = 0;
        for (const k of e.args) { const m = /^[sb](\d)$/.exec(k); if (m) words = Math.max(words, k[0] === 's' ? +m[1] + 1 : (+m[1] >> 1) + 1); }
        if (e.fx) {
          const k = fxq.findIndex((f) => f.name === e.name);
          if (k < 0) errs.push(`${e.name}: у Z80 такого вызова нет`);
          else {
            const f = fxq.splice(k, 1)[0];
            for (const [p, v] of f.w) { const a = this.fromCpc(p, P); if (a >= 0) rv.set(a, v); }
            if (f.out) for (const r of ['a', 'b', 'c', 'd', 'e', 'h', 'l']) cpu['set_' + r](f.out[r]);
          }
        }
        cpu.pc = w16(sp); cpu.sp = (sp + 2 + (e.pop !== undefined ? e.pop : 2 * words)) & 0xffff;   // pop — байты, если не целые слова
        continue;
      }
      cpu.instruction();
    }
    // свои записи -> CPC; рабочие байты и стек не сравниваются
    const out = new Map();
    for (const [a, v] of w) {
      if ((a >= this.SCR0 && a < this.SCR1) || (a >= this.OF0 && a < this.OF1)) continue;
      const p = this.toCpc(a, P);
      if (p < 0) { errs.push(`запись мимо состояния ${a.toString(16)}`); continue; }
      out.set(p, v);
    }
    for (const [p, v] of hw) out.set(p, v);
    return { w: out, plat, regs: { a: cpu.a(), b: cpu.b(), c: cpu.c(), d: cpu.d(), e: cpu.e(), h: cpu.h(), l: cpu.l() },
      popped: cpu.sp - sp0 - 2, err: errs.length ? errs.slice(0, 5).join('; ') : null };
  }
}

module.exports = { Logic80, core };
