#!/usr/bin/env node
// asm.js — ассемблер нативных модулей A2 (docs/NATIVE_PLAN.md).
//
// Синтаксис Z80 (Zilog), но ТОЛЬКО команды i8080: ld/push/pop/ex de,hl/
// ex (sp),hl/алу/inc/dec/add hl,rr/сдвиги A/jp/call/ret/rst/in/out/di/ei/
// halt/nop.  Любая команда Z80 сверх этого (ix/iy, jr, djnz, cb, ed, exx…) —
// ошибка сборки: модуль по построению идёт на i8080.
//
// Директивы: `org выр` (участков может быть несколько), `ИМЯ equ выр` /
// `ИМЯ = выр`, `db` (числа и "строки"), `dw`, `ds n[,заполнитель]`,
// `assert выр[, "текст"]`, `include "файл"`.  Метки `имя:`; локальные `.имя`
// привязаны к последней глобальной.  Числа: 0x1F, 1Fh, $1F, %101, 'A'.
// `$` — адрес текущей команды.  Операции: + - * / % & | ^ ~ << >> ( ).
//
//   node tools/native/asm.js src/native/x.asm [out.json] [-D ИМЯ=выр ...]
//   -> {chunks:[{org, hex}], labels:{}}; листинг рядом (.lst)
'use strict';
const fs = require('fs'), path = require('path');

const R8 = { b: 0, c: 1, d: 2, e: 3, h: 4, l: 5, '(hl)': 6, a: 7 };
const RP = { bc: 0, de: 1, hl: 2, sp: 3 };
const RP2 = { bc: 0, de: 1, hl: 2, af: 3 };
const CC = { nz: 0, z: 1, nc: 2, c: 3, po: 4, pe: 5, p: 6, m: 7 };
const ALU = { add: 0, adc: 1, sub: 2, sbc: 3, and: 4, xor: 5, or: 6, cp: 7 };
const ONE = { rlca: 0x07, rrca: 0x0F, rla: 0x17, rra: 0x1F, daa: 0x27, cpl: 0x2F, scf: 0x37, ccf: 0x3F,
  ret: 0xC9, di: 0xF3, ei: 0xFB, halt: 0x76, nop: 0x00 };

class AsmError extends Error {}

function splitArgs(s) {
  const out = []; let cur = '', q = null, depth = 0;
  for (const ch of s) {
    if (q) { cur += ch; if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim() !== '') out.push(cur.trim());
  return out;
}

function stripComment(line) {
  let q = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === q) q = null; continue; }
    if (ch === '"') { q = ch; continue; }
    if (ch === "'" && line[i + 2] === "'") { i += 2; continue; }
    if (ch === ';') return line.slice(0, i);
  }
  return line;
}

class Assembler {
  constructor(defs = {}) {
    this.sym = Object.assign({}, defs);
    this.pass = 0;
  }
  full(name) {
    if (name.startsWith('.')) return (this.glob || '') + name;
    return name;
  }
  // ---- выражения ----
  eval(expr) {
    const toks = [];
    const re = /\s*(,|0x[0-9a-fA-F]+|\$[0-9a-fA-F]+|%[01]+|[0-9][0-9a-fA-F]*[hH]\b|[0-9]+|'.'|<<|>>|[A-Za-z_.][A-Za-z0-9_.]*|\$|[-+*/%&|^~()])/y;
    let m, pos = 0;
    const s = expr.trim();
    while (pos < s.length) {
      re.lastIndex = pos; m = re.exec(s);
      if (!m) throw new AsmError(`не разобрать выражение: ${expr}`);
      toks.push(m[1]); pos = re.lastIndex;
      while (pos < s.length && s[pos] === ' ') pos++;
    }
    let i = 0;
    const self = this;
    function atom() {
      const t = toks[i++];
      if (t === 'jrt' && toks[i] === '(') {
        i++; const k = or(); if (toks[i++] !== ',') throw new AsmError(`jrt(к,цель): ${expr}`);
        const tg = or(); if (toks[i++] !== ')') throw new AsmError(`нет ) в ${expr}`);
        const d = tg - self.ipc - 2;
        if (self.pass === 2 && (d < -16 || d > 15)) {
          if (self.collect) self.collect.push(self.ipc); else throw new AsmError(`JRT вне досягаемости: ${d}`);
        }
        return (k << 5) | (d & 0x1F);
      }
      if (t === undefined) throw new AsmError(`обрыв выражения: ${expr}`);
      if (t === '(') { const v = or(); if (toks[i++] !== ')') throw new AsmError(`нет ) в ${expr}`); return v; }
      if (t === '-') return -atom();
      if (t === '+') return atom();
      if (t === '~') return ~atom();
      if (/^0x/i.test(t)) return parseInt(t.slice(2), 16);
      if (/^\$[0-9a-fA-F]+$/.test(t)) return parseInt(t.slice(1), 16);
      if (t === '$') return self.ipc;
      if (/^%/.test(t)) return parseInt(t.slice(1), 2);
      if (/^[0-9][0-9a-fA-F]*[hH]$/.test(t)) return parseInt(t.slice(0, -1), 16);
      if (/^[0-9]+$/.test(t)) return parseInt(t, 10);
      if (/^'.'$/.test(t)) return t.charCodeAt(1);
      const n = self.full(t);
      if (n in self.sym) return self.sym[n];
      if (self.pass === 1) { self.undef = true; return 0; }
      throw new AsmError(`неизвестное имя ${t}`);
    }
    function mul() { let v = atom(); while (['*', '/', '%'].includes(toks[i])) { const o = toks[i++], w = atom(); v = o === '*' ? v * w : o === '/' ? Math.trunc(v / w) : v % w; } return v; }
    function add() { let v = mul(); while (['+', '-'].includes(toks[i])) { const o = toks[i++], w = mul(); v = o === '+' ? v + w : v - w; } return v; }
    function sh() { let v = add(); while (['<<', '>>'].includes(toks[i])) { const o = toks[i++], w = add(); v = o === '<<' ? v << w : v >> w; } return v; }
    function and() { let v = sh(); while (toks[i] === '&') { i++; v &= sh(); } return v; }
    function xor() { let v = and(); while (toks[i] === '^') { i++; v ^= and(); } return v; }
    function or() { let v = xor(); while (toks[i] === '|') { i++; v |= xor(); } return v; }
    const v = or();
    if (i !== toks.length) throw new AsmError(`лишнее в выражении: ${expr}`);
    return v;
  }
  isMem(op) { return /^\(.*\)$/.test(op) && !['(hl)', '(bc)', '(de)', '(sp)'].includes(op.toLowerCase()); }
  inner(op) { return op.slice(1, -1); }
  emit(...bs) { for (const b of bs) { this.cur.bytes.push(b & 0xff); this.pc++; } }
  w16(v) { this.emit(v & 0xff, (v >> 8) & 0xff); }
  imm8(e) {
    const v = this.eval(e);
    if (this.pass === 2 && (v < -128 || v > 255)) {
      if (this.collect && /-\$\+126$/.test(e)) { this.collect.push(this.ipc); return 0; }
      throw new AsmError(`байт вне диапазона: ${e} = ${v}`);
    }
    return v & 0xff;
  }
  imm16(e) { const v = this.eval(e); if (this.pass === 2 && (v < -32768 || v > 0xffff)) throw new AsmError(`слово вне диапазона: ${e} = ${v}`); return v & 0xffff; }

  insn(mn, args) {
    const a = args.map(x => x.trim()), al = a.map(x => x.toLowerCase().replace(/\s+/g, ''));
    const n = a.length;
    if (al.some(x => /\b(ix|iy|ixh|ixl|iyh|iyl|i|r)\b/.test(x) && !/^'.'$/.test(x))) throw new AsmError(`регистр Z80 в команде: ${mn} ${args.join(', ')}`);
    if (mn in ONE && n === 0) return this.emit(ONE[mn]);
    switch (mn) {
      case 'ld': {
        const [d, s] = al;
        if (n !== 2) break;
        if (d in R8 && s in R8 && !(d === '(hl)' && s === '(hl)')) return this.emit(0x40 | R8[d] << 3 | R8[s]);
        if (d === 'a' && s === '(bc)') return this.emit(0x0A);
        if (d === 'a' && s === '(de)') return this.emit(0x1A);
        if (d === '(bc)' && s === 'a') return this.emit(0x02);
        if (d === '(de)' && s === 'a') return this.emit(0x12);
        if (d === 'sp' && s === 'hl') return this.emit(0xF9);
        if (d === 'a' && this.isMem(a[1])) { this.emit(0x3A); return this.w16(this.imm16(this.inner(a[1]))); }
        if (this.isMem(a[0]) && s === 'a') { this.emit(0x32); return this.w16(this.imm16(this.inner(a[0]))); }
        if (d === 'hl' && this.isMem(a[1])) { this.emit(0x2A); return this.w16(this.imm16(this.inner(a[1]))); }
        if (this.isMem(a[0]) && s === 'hl') { this.emit(0x22); return this.w16(this.imm16(this.inner(a[0]))); }
        if (d in RP && !(s in R8) && !(s in RP) && !this.isMem(a[1])) { this.emit(0x01 | RP[d] << 4); return this.w16(this.imm16(a[1])); }
        if (d in R8 && !(s in R8) && !(s in RP) && !this.isMem(a[1]) && !/^\(/.test(s)) return this.emit(0x06 | R8[d] << 3, this.imm8(a[1]));
        break;
      }
      case 'push': case 'pop':
        if (n === 1 && al[0] in RP2) return this.emit((mn === 'push' ? 0xC5 : 0xC1) | RP2[al[0]] << 4);
        break;
      case 'ex':
        if (al[0] === 'de' && al[1] === 'hl') return this.emit(0xEB);
        if (al[0] === '(sp)' && al[1] === 'hl') return this.emit(0xE3);
        break;
      case 'inc': case 'dec':
        if (n === 1 && al[0] in R8) return this.emit((mn === 'inc' ? 0x04 : 0x05) | R8[al[0]] << 3);
        if (n === 1 && al[0] in RP) return this.emit((mn === 'inc' ? 0x03 : 0x0B) | RP[al[0]] << 4);
        break;
      case 'jp':
        if (n === 1 && al[0] === '(hl)') return this.emit(0xE9);
        if (n === 1) { this.emit(0xC3); return this.w16(this.imm16(a[0])); }
        if (n === 2 && al[0] in CC) { this.emit(0xC2 | CC[al[0]] << 3); return this.w16(this.imm16(a[1])); }
        break;
      case 'call':
        if (n === 1) { this.emit(0xCD); return this.w16(this.imm16(a[0])); }
        if (n === 2 && al[0] in CC) { this.emit(0xC4 | CC[al[0]] << 3); return this.w16(this.imm16(a[1])); }
        break;
      case 'ret':
        if (n === 1 && al[0] in CC) return this.emit(0xC0 | CC[al[0]] << 3);
        break;
      case 'rst': {
        if (n !== 1) break;
        const v = this.eval(a[0]);
        if (v & ~0x38) throw new AsmError(`rst ${a[0]}`);
        return this.emit(0xC7 | v);
      }
      case 'in':
        if (al[0] === 'a' && this.isMem(a[1])) return this.emit(0xDB, this.imm8(this.inner(a[1])));
        break;
      case 'out':
        if (al[1] === 'a' && this.isMem(a[0])) return this.emit(0xD3, this.imm8(this.inner(a[0])));
        break;
      case 'add':
        if (n === 2 && al[0] === 'hl' && al[1] in RP) return this.emit(0x09 | RP[al[1]] << 4);
      // fallthrough
      case 'adc': case 'sub': case 'sbc': case 'and': case 'xor': case 'or': case 'cp': {
        let src;
        if (n === 2 && al[0] === 'a') src = a[1];
        else if (n === 1) src = a[0];
        else break;
        const sl = src.toLowerCase().replace(/\s+/g, '');
        if (sl in R8) return this.emit(0x80 | ALU[mn] << 3 | R8[sl]);
        return this.emit(0xC6 | ALU[mn] << 3, this.imm8(src));
      }
    }
    throw new AsmError(`не команда i8080: ${mn} ${args.join(', ')}`);
  }

  directive(mn, rest, args) {
    switch (mn) {
      case 'org': this.pc = this.eval(rest) & 0xffff; this.cur = { org: this.pc, bytes: [], line: this.lineNo }; this.chunks.push(this.cur); return true;
      case 'db': case 'defb': case 'byte':
        for (const x of args) {
          if (/^".*"$/.test(x)) { for (const ch of x.slice(1, -1)) this.emit(ch.charCodeAt(0)); } else this.emit(this.imm8(x));
        }
        return true;
      case 'dw': case 'defw': case 'word': for (const x of args) this.w16(this.imm16(x)); return true;
      case 'ds': case 'defs': { const k = this.eval(args[0]), f = args[1] ? this.imm8(args[1]) : 0; for (let i = 0; i < k; i++) this.emit(f); return true; }
      case 'assert':
        if (this.pass === 2 && !this.eval(args[0])) throw new AsmError(`assert: ${args[1] ? args[1].replace(/^"|"$/g, '') : args[0]}`);
        return true;
    }
    return false;
  }

  run(file) {
    const lines = [];
    const load = f => {
      for (const [k, raw] of fs.readFileSync(f, 'utf8').split('\n').entries()) {
        const mi = /^\s*include\s+"([^"]+)"/i.exec(raw);
        if (mi) load(path.resolve(path.dirname(f), mi[1]));
        else lines.push({ f, n: k + 1, raw });
      }
    };
    load(file);
    for (this.pass = 1; this.pass <= 2; this.pass++) {
      this.pc = 0; this.chunks = []; this.cur = { org: 0, bytes: [] }; this.glob = '';
      this.list = []; this.starts = [];
      for (const L of lines) {
        this.lineNo = `${path.basename(L.f)}:${L.n}`;
        try {
          let s = stripComment(L.raw).replace(/\s+$/, '');
          let m;
          // ИМЯ equ выр / ИМЯ = выр
          if ((m = /^\s*([A-Za-z_.][A-Za-z0-9_.]*)\s*(?::\s*)?(?:equ\b|=)\s*(.+)$/i.exec(s))) {
            const nm = this.full(m[1]);
            this.undef = false; this.ipc = this.pc;
            const v = this.eval(m[2]);
            if (this.pass === 2 || !this.undef) this.sym[nm] = v;
            continue;
          }
          if ((m = /^\s*([A-Za-z_.][A-Za-z0-9_.]*):(.*)$/.exec(s))) {
            const nm = m[1];
            if (!nm.startsWith('.')) this.glob = nm;
            const fn = this.full(nm);
            if (this.pass === 1 && fn in this.sym && this.sym[fn] !== this.pc) throw new AsmError(`метка ${fn} дважды`);
            this.sym[fn] = this.pc;
            s = m[2];
          }
          s = s.trim();
          if (!s) continue;
          const sp = s.search(/\s/);
          const mn = (sp < 0 ? s : s.slice(0, sp)).toLowerCase();
          const rest = sp < 0 ? '' : s.slice(sp + 1).trim();
          const args = rest ? splitArgs(rest) : [];
          const pc0 = this.pc, n0 = this.cur.bytes.length; this.ipc = pc0;
          if (!this.directive(mn, rest, args)) {
            if (!this.chunks.length) throw new AsmError('команда до первого org');
            this.insn(mn, args);
            if (this.pass === 2) this.starts.push(pc0);
          }
          if (this.pass === 2 && this.cur.bytes.length > n0)
            this.list.push(`${pc0.toString(16).toUpperCase().padStart(4, '0')}  ${this.cur.bytes.slice(n0, n0 + 4).map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ').padEnd(12)} ${L.raw}`);
        } catch (e) {
          if (e instanceof AsmError) throw new AsmError(`${this.lineNo}: ${e.message}\n    ${L.raw.trim()}`);
          throw e;
        }
      }
    }
    // пересечения участков
    const cs = this.chunks.filter(c => c.bytes.length).map(c => [c.org, c.org + c.bytes.length, c.line]).sort((x, y) => x[0] - y[0]);
    for (let i = 1; i < cs.length; i++)
      if (cs[i][0] < cs[i - 1][1]) throw new AsmError(`участки пересекаются: ${cs[i - 1][2]} и ${cs[i][2]} (0x${cs[i][0].toString(16)})`);
    return {
      chunks: this.chunks.filter(c => c.bytes.length).map(c => ({ org: c.org, hex: Buffer.from(c.bytes).toString('hex'), line: c.line })),
      labels: this.sym,
      list: this.list.join('\n'),
      starts: this.starts,
    };
  }
}

function assemble(file, defs = {}, collect = null) { const a = new Assembler(defs); a.collect = collect; return a.run(file); }
module.exports = { assemble, AsmError, Assembler };

if (require.main === module) {
  const argv = process.argv.slice(2), defs = {}, pos = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '-D') { const [k, v] = argv[++i].split('='); defs[k] = new Assembler().eval(v); } else pos.push(argv[i]);
  }
  try {
    const r = assemble(pos[0], defs);
    const out = pos[1] || pos[0].replace(/\.asm$/, '.json');
    fs.writeFileSync(out, JSON.stringify({ chunks: r.chunks, labels: r.labels }, null, 1));
    fs.writeFileSync(out.replace(/\.json$/, '.lst'), r.list + '\n');
    const tot = r.chunks.reduce((s, c) => s + c.hex.length / 2, 0);
    console.log(`${path.basename(pos[0])}: ${r.chunks.length} участков, ${tot} Б -> ${out}`);
  } catch (e) {
    if (e instanceof AsmError) { console.error(e.message); process.exit(1); }
    throw e;
  }
}
