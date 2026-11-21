'use strict';
/**
 * Стенд Вектора-06Ц без окна и без звука (docs/STAND.md).
 *
 * Ядро — vector06js (tools/vendor/vector06js, без правок): i8080 с тактами Вектора, растр 312 строк
 * с прерыванием по тактам, палитра и прокрутка по лучу, ВИ53, AY (регистры), ВГ93, ПЗУ boots.
 * Здесь — свой цикл исполнения (детерминированный, без настенных часов) и обвязка:
 *   - квазидиск с окнами КАК НА ЖЕЛЕЗЕ (Vector-06C.sv MiSTer: ed_ram = ed_reg[5] & ed_win),
 *     по выбору — как в vector06js/Emu80 (окна независимы): {kvaz: 'loose'};
 *   - джойстики «П» (порты 4/5/6/7) и 0Eh/0Fh по RTL MiSTer;
 *   - точки останова, слежение за записью, профиль PC в тактах, журнал портов, сценарий ввода, PNG.
 *
 *   const { Machine } = require('./machine');
 *   const m = new Machine();
 *   m.loadROM('build/x.rom');          // или m.bootFDD('x.fdd')
 *   m.runFrames(100);
 *   m.shot('build/x.png');
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');
const crypto = require('crypto');

const VENDOR = path.join(__dirname, '../vendor/vector06js');
const FRAME_CYCLES = 59904;            // 312 строк × 192 такта
const INT_BUCKET = 0x10000;            // профиль: такты входа в прерывание (RST 7 без PC)

// ---- загрузка ядра vector06js в отдельный контекст (как в стендах Basket, но из своей копии) ----------
let CORE = null;
function core() {
  if (CORE) return CORE;
  const sink = { log() {}, warn() {}, error() {}, debug() {}, info() {} };
  const g = { console: sink, Math, Date, Uint8Array, Uint32Array, Int32Array, Uint8ClampedArray, Float32Array,
    Float64Array, Array, Object, Number, String, Error, Symbol, JSON, alert: (s) => { throw new Error(String(s)); } };
  g.window = g;
  g.document = { createElement: () => ({ getContext: () => null }), getElementById: () => null };
  const ctx = vm.createContext(g);
  for (const f of ['i8080.js', 'memory.js', 'io.js', 'tv.js', 'i8253.js', 'ay.js', 'fd1793.js', 'keyboard.js']) {
    vm.runInContext(fs.readFileSync(path.join(VENDOR, f), 'utf8'), ctx, { filename: f });
  }
  CORE = vm.runInContext('({ I8080, Memory, IO, PixelFiller, I8253, AY, Floppy, Keyboard })', ctx);
  CORE.ctx = g;
  CORE.boot = fs.readFileSync(path.join(VENDOR, 'boots.bin'));
  return CORE;
}

// ---- клавиатура: матрица Вектора (vector06js keyboard.js), имя -> [ряд, бит] ------------------------
const KEYS = {};
[
  [7, ['SPACE', '^', ']', '\\', '[', 'Z', 'Y', 'X']],
  [6, ['W', 'V', 'U', 'T', 'S', 'R', 'Q', 'P']],
  [5, ['O', 'N', 'M', 'L', 'K', 'J', 'I', 'H']],
  [4, ['G', 'F', 'E', 'D', 'C', 'B', 'A', '@']],
  [3, ['/', '.', '=', ',', ';', ':', '9', '8']],
  [2, ['7', '6', '5', '4', '3', '2', '1', '0']],
  [1, ['F5', 'F4', 'F3', 'F2', 'F1', 'AR2', 'STR', 'CTRLBS']],
  [0, ['DOWN', 'RIGHT', 'UP', 'LEFT', 'ZB', 'VK', 'PS', 'TAB']],
].forEach(([row, names]) => names.forEach((n, i) => { KEYS[n] = [row, 0x80 >> i]; }));
const MODS = { SS: 'ss', US: 'us', RUS: 'rus' };
// джойстик: биты как у MiSTer (0 вправо, 1 влево, 2 вниз, 3 вверх, 4 огонь 1, 5 огонь 2)
const JOY = { RIGHT: 0, LEFT: 1, DOWN: 2, UP: 3, FIRE1: 4, FIRE2: 5, FIRE: 4 };
// Vector-06C.sv: joyA_o = ~{joy[5], joy[4], 2'b00, joy[2], joy[3], joy[1], joy[0]}
const joyO = (j) => (~(((j >> 5) & 1) << 7 | ((j >> 4) & 1) << 6 | ((j >> 2) & 1) << 3 | ((j >> 3) & 1) << 2 |
  ((j >> 1) & 1) << 1 | (j & 1))) & 0xff;

const hx = (v, n = 4) => v.toString(16).toUpperCase().padStart(n, '0');

class Machine {
  /**
   * @param {object} o
   *   kvaz: 'hw' (по умолчанию, как плата и MiSTer) | 'loose' (окна независимы, как vector06js/Emu80)
   *   beam: true — рисовать растр каждый кадр (для shotBeam), медленнее
   *   ay:   false — машина без AY (чтение 14h/15h = FFh, записи пропадают; в журнал всё равно пишутся)
   *   fddStrict: true — сектор вне 1..5 при чтении останавливает прогон (как настоящий ВГ93 на 5 секторах)
   *   log:  true — сообщения vector06js (ВГ93) в консоль
   */
  constructor(o = {}) {
    const C = core();
    this.opts = Object.assign({ kvaz: 'hw', beam: false, ay: true, fddStrict: true, log: false }, o);
    if (this.opts.log) C.ctx.console = console;
    this.memory = new C.Memory();
    this.keyboard = new C.Keyboard();
    this.timer = new C.I8253();
    this.ay = new C.AY();
    this.fdc = new (C.Floppy().FD1793)();
    this.io = new C.IO(this.keyboard, this.timer, this.memory, this.ay, this.fdc, { sample: 0 });
    this.cpu = new C.I8080(this.memory, this.io);
    this.bmp = new Uint32Array(576 * 288);
    this.filler = new C.PixelFiller(this.bmp, this.io.Palette, this.io, this.memory.bytes);
    this.filler.reset();
    this.bootRom = C.boot;

    this.palRaw = new Uint8Array(16);     // байты палитры, как их писала программа
    this.joy = [0, 0];                     // А, Б (биты JOY)
    this.joyPort = 0;                      // регистр порта 5 (биты 6:5 — выбор джойстика «П»)
    this.portLog = [];                     // {f, t, c, pc, port, v} — ВИ53 и AY
    this.logPorts = new Set([0x08, 0x09, 0x0a, 0x0b, 0x14, 0x15]);
    this.fddErrors = [];
    this.kvazLooseHits = 0;                // обращения, где окна «как в Emu80» и «как на железе» расходятся
    this.prof = new Float64Array(0x10001);
    this.profile = true;
    this.scenario = null;

    this.breaks = new Map();               // pc -> cb|null
    this.bpFlag = new Uint8Array(0x10000);
    this.watches = new Map();              // физический адрес -> [cb]
    this.wFlag = new Uint8Array(0x50000);
    this._installHooks();
    this.reset();
  }

  // ---- обвязка ядра ----------------------------------------------------------------------------------
  _installHooks() {
    const mem = this.memory, io = this.io, self = this;
    // квазидиск. Порт 10h: б0-1 страница окон, б2-3 страница стека, б4 стек, б5 окно A000-DFFF,
    // б6 расширение до 8000, б7 расширение до FFFF. На железе б6/б7 без б5 ничего не открывают.
    if (this.opts.kvaz === 'hw') {
      mem.bigram_select = function (addr, stackrq) {
        if (this.mode_stack && stackrq) return addr + this.page_stack;
        const m = this.mode_map;
        if (m & 0x20) {
          if ((addr >= 0xa000 && addr <= 0xdfff) || ((m & 0x40) && addr >= 0x8000 && addr <= 0x9fff) ||
            ((m & 0x80) && addr >= 0xe000)) return addr + this.page_map;
        } else if (m && (((m & 0x40) && addr >= 0x8000 && addr <= 0x9fff) || ((m & 0x80) && addr >= 0xe000))) {
          self.kvazLooseHits++;          // здесь vector06js/Emu80 открыли бы окно, а железо — нет
        }
        return addr;
      };
    } else if (this.opts.kvaz !== 'loose') throw new Error(`kvaz: ${this.opts.kvaz}`);
    // слежение за записью (ставится всегда; без слежений — одна проверка флага)
    const write0 = mem.write.bind(mem);
    mem.write = function (addr, w8, stackrq) {
      addr &= 0xffff;
      const ph = this.bigram_select(addr, stackrq);
      if (self.wFlag[ph]) {
        const old = this.bytes[this.tobank(ph)];
        write0(addr, w8, stackrq);
        for (const cb of self.watches.get(ph)) cb(self, { addr, phys: ph, page: (ph >> 16) - 1, v: w8 & 0xff, old, pc: self.curPC, stack: !!stackrq });
        return;
      }
      this.bytes[this.tobank(ph)] = w8;
    };
    // порты: 10h сразу (а не через отложенный commit), журнал ВИ53/AY, джойстики по RTL MiSTer
    const out0 = io.output.bind(io);
    io.output = function (port, w8) {
      port &= 0xff; w8 &= 0xff;
      if (self.logPorts.has(port)) self.portLog.push({ f: self.frame, t: self.frameCycle(), c: self.cycles, pc: self.curPC, port, v: w8 });
      if (port === 0x10) { mem.control_write(w8); return; }
      if (port === 0x05) self.joyPort = w8;
      else if (port === 0x04 && !(w8 & 0x80)) {
        const b = (w8 >> 1) & 7;
        self.joyPort = (w8 & 1) ? (self.joyPort | (1 << b)) : (self.joyPort & ~(1 << b));
      }
      if (!self.opts.ay && (port === 0x14 || port === 0x15)) return;
      out0(port, w8);
    };
    const in0 = io.input.bind(io);
    io.input = function (port) {
      port &= 0xff;
      switch (port) {
        case 0x04: case 0x05: return 0;
        case 0x06: {
          const s = (self.joyPort >> 5) & 3;
          return s === 0 ? joyO(self.joy[0]) & joyO(self.joy[1]) : s === 1 ? joyO(self.joy[0]) : s === 2 ? joyO(self.joy[1]) : 0xff;
        }
        case 0x07: {                       // «ПУ»: {j[3], j[0], j[2], j[1], j[4], j[5], 0, 0}
          const j = self.joy[0] | self.joy[1];
          return ((j >> 3) & 1) << 7 | (j & 1) << 6 | ((j >> 2) & 1) << 5 | ((j >> 1) & 1) << 4 | ((j >> 4) & 1) << 3 | ((j >> 5) & 1) << 2;
        }
        case 0x0e: return joyO(self.joy[0]);
        case 0x0f: return joyO(self.joy[1]);
        case 0x14: case 0x15: if (!self.opts.ay) return 0xff; break;
        default: break;
      }
      return in0(port);
    };
    // палитра: запоминаем сырой байт
    const pal0 = io.commit_palette.bind(io);
    io.commit_palette = function (index) {
      let w8 = this.palettebyte;
      if (w8 === undefined && this.outport === 0x0c) w8 = this.outbyte;
      pal0(index);
      if (w8 !== undefined) self.palRaw[index] = w8;
    };
    // ВГ93: сектор вне 1..5 настоящий контроллер не найдёт (vector06js молча читает соседнюю сторону)
    const fw0 = this.fdc.write.bind(this.fdc);
    this.fdc.write = function (addr, val) {
      if (addr === 0 && ((val >> 4) === 8 || (val >> 4) === 9) && !(this._sector >= 1 && this._sector <= 5)) {
        self.fddErrors.push({ f: self.frame, pc: self.curPC, track: this._track, sector: this._sector });
        if (self.opts.fddStrict) self._stop = { reason: 'fdd-error', pc: self.curPC };
      }
      return fw0(addr, val);
    };
  }

  // ---- сброс и загрузка ------------------------------------------------------------------------------
  /** Состояние «после включения»: ОЗУ и квазидиск нулевые (или мусор: {junk: seed}), ПЗУ отключено. */
  reset({ junk = null } = {}) {
    const b = this.memory.bytes;
    b.fill(0);
    if (junk !== null) { let s = junk >>> 0 || 1; for (let i = 0x10000; i < b.length; i++) { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; b[this.memory.tobank(i)] = s & 0xff; } }
    this.memory.control_write(0);
    this.memory.detach_boot();
    this._cpuReset(0);
    this.frame = 0; this.cycles = 0; this.ints = 0;
    this.prof.fill(0); this.portLog.length = 0; this.fddErrors.length = 0; this.kvazLooseHits = 0;
    return this;
  }
  // БЛК+СБР (vector06js BlkSbr): PC=0, прерывания запрещены, ВИ53 в режим 3, AY сброшен, растр с начала кадра
  _cpuReset(sp) {
    const cpu = this.cpu;
    cpu.pc = 0; cpu.sp = sp; cpu.iff = false; cpu.iff_pending = 0; cpu.last_opcode = 0;
    this.timer.Write(3, 0x36); this.timer.Write(3, 0x76); this.timer.Write(3, 0xb6);
    this.ay.reset();
    this.memory.control_write(0);
    this.filler.reset();
    this.instr_time = 0; this.commit_time = -1; this.commit_time_pal = -1; this.irq = false;
    this._frameOpen = false; this._stop = null; this._skipBp = false;
  }
  _bytes(src) { return Buffer.isBuffer(src) || src instanceof Uint8Array ? src : fs.readFileSync(src); }

  /** ROM-образ как в vector06js: память очищается, образ с addr (0100h для .rom, 0 для .r0m), PC=0, SP=C300h. */
  loadROM(src, { addr = null, edd = null } = {}) {
    const img = this._bytes(src);
    if (addr === null) addr = typeof src === 'string' && /\.(r0m|bin)$/i.test(src) ? 0 : 0x100;
    this.reset();
    for (let i = 0; i < img.length; i++) this.memory.write(addr + i, img[i], false);
    if (edd) this.loadEDD(edd);
    this._cpuReset(0xc300);
    return this;
  }
  /** Образ квазидиска (до 256 КБ): страница N — смещение N*64К. */
  loadEDD(src) {
    const img = this._bytes(src);
    for (let i = 0; i < img.length && i < 0x40000; i++) this.memory.bytes[this.memory.tobank(0x10000 + i)] = img[i];
    return this;
  }
  /** Вставить дискету в дисковод (0..3). */
  insertFDD(src, drive = 0) { this.fdc.loadDsk(drive, String(src), this._bytes(src)); return this; }
  /**
   * Загрузка с дискеты, как на железе: ПЗУ boots v3.0 (БЛК+ВВОД) читает загрузочную часть дискеты в 0080h
   * и ставит JP 0100h в ноль; затем БЛК+СБР (сброс с отключённым ПЗУ) — PC=0.
   * Конец работы ПЗУ — в 0000h стоит C3 00 01 и ПЗУ quiet кадров не трогало ВГ93 (JP ставится до чтения,
   * после чтения ПЗУ ждёт в своём цикле); не позже maxFrames. Возвращает число кадров работы ПЗУ.
   */
  bootFDD(src, { maxFrames = 1500, quiet = 25, junk = null } = {}) {
    this.reset({ junk });
    this.insertFDD(src, 0);
    this.memory.attach_boot(this.bootRom);
    this._cpuReset(0);
    let f = 0, done = false, last = 0;
    const rd = (a) => this.memory.bytes[this.memory.tobank(a)];
    const in1 = this.io.input, out1 = this.io.output, self = this;
    this.io.input = function (p) { if ((p & 0xff) >= 0x18 && (p & 0xff) <= 0x1c) last = self.frame; return in1(p); };
    this.io.output = function (p, v) { if ((p & 0xff) >= 0x18 && (p & 0xff) <= 0x1c) last = self.frame; return out1(p, v); };
    try {
      for (; f < maxFrames; f++) {
        this.runFrame();
        if (rd(0) === 0xc3 && rd(1) === 0x00 && rd(2) === 0x01 && this.frame - last > quiet) { done = true; break; }
      }
    } finally { this.io.input = in1; this.io.output = out1; }
    if (!done) throw new Error(`bootFDD: ПЗУ не загрузило дискету за ${maxFrames} кадров (PC=${hx(this.cpu.pc)})`);
    this.bootFrames = f + 1;
    // БЛК+СБР: ПЗУ отключается, ОЗУ и квазидиск сохраняются
    this.memory.detach_boot();
    this._cpuReset(0);
    this.frame = 0; this.cycles = 0; this.ints = 0; this.prof.fill(0); this.portLog.length = 0;
    return this.bootFrames;
  }

  // ---- исполнение ------------------------------------------------------------------------------------
  /** Такт внутри кадра (0..59903): начало кадра — строка 0 растра, прерывание — такт 44. */
  frameCycle() { return this.filler.raster_line * 192 + (this.filler.raster_pixel >> 2) + 0; }

  // одна команда (с входом в прерывание перед ней, если оно ждёт); true — кончился кадр
  _exec1() {
    const cpu = this.cpu, filler = this.filler;
    if (this.irq && cpu.iff) {              // vector06js Vector06c.checkInterrupt
      this.irq = false;
      if (cpu.last_opcode === 0x76) cpu.pc = (cpu.pc + 1) & 0xffff;
      this.curPC = cpu.pc;
      cpu.execute(0xf3);
      cpu.execute(0xff);
      this.instr_time += 16; this.cycles += 16;
      if (this.profile) this.prof[INT_BUCKET] += 16;
      this.ints++;
      if (this.onInterrupt) this.onInterrupt(this);
    }
    filler.irq = filler.irq && this.irq;
    const pc = cpu.pc;
    if (this.bpFlag[pc] && !this._skipBp) {
      const cb = this.breaks.get(pc);
      if (!cb || cb(this) !== false) { this._stop = { reason: 'break', pc }; this._skipBp = true; return false; }
    }
    this._skipBp = false;
    this.curPC = pc;
    cpu.instruction();
    const t = cpu.vcycles;
    this.instr_time += t; this.cycles += t;
    if (this.profile) this.prof[pc] += t;
    if (cpu.last_opcode === 0xd3) {
      this.commit_time = (this.instr_time - 5) * 4 + 4;
      this.commit_time_pal = this.commit_time - 20;
    }
    const clk = filler.fill(this.instr_time << 2, this.commit_time, this.commit_time_pal, this.opts.beam);
    this.irq = cpu.iff && filler.irq;
    const wrap = this.instr_time - (clk >> 2);
    const step = this.instr_time - wrap;
    for (let g = step / 2; --g >= 0;) this.timer.Count(1);
    this.instr_time = wrap;
    this.commit_time -= clk;
    this.commit_time_pal -= clk;
    return filler.brk;
  }

  _frameStart() {
    if (this._frameOpen) return;
    this._frameOpen = true;
    if (this.scenario) this._applyInput(this.frame);
    if (this.onFrame) this.onFrame(this);
  }
  _frameEnd() { this.filler.reset(); this._frameOpen = false; this.frame++; }

  /**
   * Ровно один кадр растра (312 строк = 59904 такта, прерывание на такте 44 кадра) — или до останова.
   * Возвращает {reason: 'frame'|'break'|'fdd-error'|..., pc}. После останова повторный вызов доигрывает кадр.
   */
  runFrame() {
    this._frameStart();
    for (;;) {
      const end = this._exec1();
      if (this._stop) { const s = this._stop; this._stop = null; if (end) this._frameEnd(); return s; }
      if (end) { this._frameEnd(); return { reason: 'frame', pc: this.cpu.pc }; }
    }
  }
  /** n кадров; останавливается на первом останове. */
  runFrames(n) {
    for (let i = 0; i < n; i++) { const r = this.runFrame(); if (r.reason !== 'frame') return r; }
    return { reason: 'frame', pc: this.cpu.pc };
  }
  /**
   * До условия: {pc} — перед исполнением команды по адресу; {cycles} — пока счётчик тактов не дойдёт до
   * значения (с точностью до команды); {frames} — предел кадров. Возвращает {reason, pc}.
   */
  runUntil({ pc = null, cycles = null, frames = 1e9 } = {}) {
    const f0 = this.frame;
    for (;;) {
      this._frameStart();
      if (pc !== null && this.cpu.pc === pc && !(this.irq && this.cpu.iff)) return { reason: 'pc', pc };
      if (cycles !== null && this.cycles >= cycles) return { reason: 'cycles', pc: this.cpu.pc };
      if (this.frame - f0 >= frames) return { reason: 'frames', pc: this.cpu.pc };
      const end = this._exec1();
      if (this._stop) { const s = this._stop; this._stop = null; if (end) this._frameEnd(); return s; }
      if (end) this._frameEnd();
    }
  }
  /** Одна команда (вход в прерывание считается частью следующей команды). Возвращает такты. */
  step() {
    this._frameStart();
    const c0 = this.cycles;
    this._skipBp = true;
    const end = this._exec1();
    this._stop = null;
    if (end) this._frameEnd();
    return this.cycles - c0;
  }

  // ---- точки останова и слежение ---------------------------------------------------------------------
  /** Останов перед командой по адресу pc. cb(m) -> false — не останавливаться (только обратный вызов). */
  addBreak(pc, cb = null) { this.breaks.set(pc & 0xffff, cb); this.bpFlag[pc & 0xffff] = 1; return this; }
  delBreak(pc) { this.breaks.delete(pc & 0xffff); this.bpFlag[pc & 0xffff] = 0; return this; }
  /** Слежение за записью: addr 0..FFFF в основном ОЗУ (page = -1) или в странице квазидиска 0..3.
   *  cb(m, {addr, phys, page, v, old, pc, stack}); m.stop() внутри — остановить прогон после команды. */
  watch(addr, cb, { page = -1, len = 1 } = {}) {
    for (let i = 0; i < len; i++) {
      const ph = (page < 0 ? 0 : (page + 1) << 16) + ((addr + i) & 0xffff);
      if (!this.watches.has(ph)) this.watches.set(ph, []);
      this.watches.get(ph).push(cb); this.wFlag[ph] = 1;
    }
    return this;
  }
  unwatchAll() { this.watches.clear(); this.wFlag.fill(0); return this; }
  stop(reason = 'stop') { this._stop = { reason, pc: this.cpu.pc }; }

  // ---- память -----------------------------------------------------------------------------------------
  /** Чтение так, как видит процессор (с окнами квазидиска и ПЗУ). */
  read(a, stack = false) { return this.memory.read(a & 0xffff, stack); }
  write(a, v, stack = false) { this.memory.write(a & 0xffff, v & 0xff, stack); }
  read16(a) { return this.read(a) | this.read(a + 1) << 8; }
  /** Физически: page -1 — основное ОЗУ, 0..3 — страница квазидиска. */
  peek(a, page = -1) { return this.memory.bytes[this.memory.tobank((page < 0 ? 0 : (page + 1) << 16) + (a & 0xffff))]; }
  poke(a, v, page = -1) { this.memory.bytes[this.memory.tobank((page < 0 ? 0 : (page + 1) << 16) + (a & 0xffff))] = v & 0xff; }
  /** Линейная копия 64 КБ основного ОЗУ или страницы квазидиска. */
  ram(page = -1) {
    const out = new Uint8Array(0x10000), b = this.memory.bytes, base = page < 0 ? 0 : (page + 1) << 16;
    for (let a = 0; a < 0x10000; a++) out[a] = b[this.memory.tobank(base + a)];
    return out;
  }
  setRam(data, addr = 0, page = -1) { for (let i = 0; i < data.length; i++) this.poke(addr + i, data[i], page); }
  get kvazPort() { return this.memory.cw; }

  // ---- регистры ---------------------------------------------------------------------------------------
  get regs() {
    const c = this.cpu, r = c.regs;
    return { a: r[7], f: c.store_flags(), b: r[0], c: r[1], d: r[2], e: r[3], h: r[4], l: r[5], sp: c.sp, pc: c.pc, iff: c.iff ? 1 : 0 };
  }
  setRegs(o) {
    const c = this.cpu, r = c.regs, idx = { b: 0, c: 1, d: 2, e: 3, h: 4, l: 5, a: 7 };
    for (const [k, v] of Object.entries(o)) {
      if (k in idx) r[idx[k]] = v & 0xff;
      else if (k === 'f') c.retrieve_flags(v);
      else if (k === 'sp') c.sp = v & 0xffff;
      else if (k === 'pc') c.pc = v & 0xffff;
      else if (k === 'iff') { c.iff = !!v; c.iff_pending = 0; }
    }
  }

  // ---- ввод -------------------------------------------------------------------------------------------
  /** Нажать/отпустить: клавиша Вектора (SPACE, UP, VK, A, 1, F1, SS, US, RUS...) или JA.RIGHT/JB.FIRE1. */
  key(name, down) {
    const n = String(name).toUpperCase();
    const j = /^J([AB])\.(\w+)$/.exec(n);
    if (j) {
      if (!(j[2] in JOY)) throw new Error(`джойстик: ${name}`);
      const k = j[1] === 'A' ? 0 : 1, bit = 1 << JOY[j[2]];
      this.joy[k] = down ? this.joy[k] | bit : this.joy[k] & ~bit;
    } else if (n in MODS) this.keyboard[MODS[n]] = !!down;
    else if (n in KEYS) {
      const [row, bit] = KEYS[n];
      if (down) this.keyboard.matrix[row] |= bit; else this.keyboard.matrix[row] &= ~bit;
    } else throw new Error(`клавиша: ${name}`);
  }
  releaseAll() { this.keyboard.matrix.fill(0); this.keyboard.ss = this.keyboard.us = this.keyboard.rus = false; this.joy[0] = this.joy[1] = 0; }
  /**
   * Сценарий ввода по кадрам (текст или путь к файлу). Строки:
   *   N  +KEY [+KEY...] [-KEY...]   — в начале кадра N нажать/отпустить
   *   N-M KEY [KEY...]              — держать в кадрах N..M включительно
   *   # комментарий
   * Кадр — номер кадра стенда (m.frame) с последнего сброса/загрузки.
   */
  loadScenario(src) {
    const text = fs.existsSync(String(src)) ? fs.readFileSync(src, 'utf8') : String(src);
    const ev = new Map();
    const add = (f, k, d) => { if (!ev.has(f)) ev.set(f, []); ev.get(f).push([k, d]); };
    for (const raw of text.split('\n')) {
      const line = raw.replace(/#.*/, '').trim();
      if (!line) continue;
      const [when, ...toks] = line.split(/\s+/);
      const r = /^(\d+)(?:-(\d+))?$/.exec(when);
      if (!r) throw new Error(`сценарий: ${raw}`);
      const a = +r[1];
      for (const t of toks) {
        if (r[2] !== undefined) { const k = t.replace(/^\+/, ''); this.key(k, false); add(a, k, true); add(+r[2] + 1, k, false); }
        else if (t[0] === '+' || t[0] === '-') { this.key(t.slice(1), false); add(a, t.slice(1), t[0] === '+'); }
        else throw new Error(`сценарий: ${raw} (нужно +KEY/-KEY)`);
      }
    }
    this.releaseAll();
    this.scenario = ev;
    return this;
  }
  _applyInput(f) {
    const e = this.scenario.get(f);
    if (e) for (const [k, d] of e) this.key(k, d);
  }

  // ---- экран ------------------------------------------------------------------------------------------
  /** Цвет палитры i как RGB (преобразование vector06js: б0-2 R, б3-5 G, б6-7 B). */
  palRGB(i) { const p = this.io.Palette[i]; return [p & 0xff, (p >> 8) & 0xff, (p >> 16) & 0xff]; }
  /** Индекс цвета точки поля 256×256: x 0..255, y 0..255 сверху (с учётом прокрутки порта 03). */
  pixelIndex(x, y, scroll = this.io.PA) {
    const row = (scroll - y) & 0xff, col = x >> 3, bit = 0x80 >> (x & 7);
    const at = (base) => (this.memory.bytes[this.memory.tobank(base + col * 256 + row)] & bit) ? 1 : 0;
    // как PixelFiller.shiftOutPixels: 8000h -> бит 3, A000h -> 2, C000h -> 1, E000h -> 0
    return at(0x8000) << 3 | at(0xa000) << 2 | at(0xc000) << 1 | at(0xe000);
  }
  /** Индексы цветов поля 256×256 (Uint8Array, строка за строкой). */
  screenIndices() {
    const out = new Uint8Array(256 * 256);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) out[y * 256 + x] = this.pixelIndex(x, y);
    return out;
  }
  /** Снимок поля 256×256 из памяти (4 плоскости + текущая палитра + прокрутка) в PNG. scale — увеличение. */
  shot(file, { scale = 1 } = {}) {
    const idx = this.screenIndices(), pal = [];
    for (let i = 0; i < 16; i++) pal.push(this.palRGB(i));
    const w = 256 * scale, h = 256 * scale, rgb = Buffer.alloc(w * h * 3);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = pal[idx[((y / scale) | 0) * 256 + ((x / scale) | 0)]], o = (y * w + x) * 3;
      rgb[o] = c[0]; rgb[o + 1] = c[1]; rgb[o + 2] = c[2];
    }
    const png = encodePNG(w, h, rgb);
    if (file) fs.writeFileSync(file, png);
    return png;
  }
  /** Снимок растра (576×288 с бордюром, как в окне vector06js) — только при {beam: true}, последний кадр. */
  shotBeam(file) {
    if (!this.opts.beam) throw new Error('shotBeam: нужен new Machine({beam: true})');
    const w = 576, h = 288, rgb = Buffer.alloc(w * h * 3);
    for (let i = 0; i < w * h; i++) { const p = this.bmp[i]; rgb[i * 3] = p & 0xff; rgb[i * 3 + 1] = (p >> 8) & 0xff; rgb[i * 3 + 2] = (p >> 16) & 0xff; }
    const png = encodePNG(w, h, rgb);
    if (file) fs.writeFileSync(file, png);
    return png;
  }

  // ---- профиль, журнал, хэши --------------------------------------------------------------------------
  /** Профиль: [{pc, t}] по убыванию тактов; INT — такты входа в прерывание. */
  profileTop(n = 50) {
    const a = [];
    for (let i = 0; i <= 0x10000; i++) if (this.prof[i]) a.push({ pc: i === INT_BUCKET ? 'INT' : i, t: this.prof[i] });
    return a.sort((x, y) => y.t - x.t).slice(0, n);
  }
  /** Сумма тактов профиля по диапазонам [{name, lo, hi}]. */
  profileRanges(ranges) {
    return ranges.map((r) => { let t = 0; for (let a = r.lo; a <= r.hi; a++) t += this.prof[a]; return { name: r.name, t }; });
  }
  /** Журнал портов строками: кадр такт_в_кадре PC порт значение (+расшифровка AY/ВИ53). */
  portLogText() {
    let ayReg = 0;
    return this.portLog.map((e) => {
      let s = `${e.f} ${e.t} ${hx(e.pc)} ${hx(e.port, 2)} ${hx(e.v, 2)}`;
      if (e.port === 0x15) ayReg = e.v & 15;
      else if (e.port === 0x14) s += ` AY.R${ayReg}`;
      else if (e.port === 0x08) s += ' VI53.CW';
      else if (e.port >= 0x09 && e.port <= 0x0b) s += ` VI53.C${0x0b - e.port}`;
      return s;
    }).join('\n') + (this.portLog.length ? '\n' : '');
  }
  /** sha256 состояния: основное ОЗУ, квазидиск, регистры, такты, порт 10h, палитра. */
  hash({ kvaz = true } = {}) {
    const h = crypto.createHash('sha256');
    h.update(this.ram());
    if (kvaz) for (let p = 0; p < 4; p++) h.update(this.ram(p));
    h.update(JSON.stringify([this.regs, this.cycles, this.memory.cw, Array.from(this.palRaw), this.io.PA]));
    return h.digest('hex');
  }
}

// ---- PNG без зависимостей ------------------------------------------------------------------------------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePNG(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
/** PNG -> {w, h, rgb} (только то, что пишет encodePNG: 8 бит RGB, фильтр 0). */
function decodePNG(buf) {
  let p = 8, w = 0, h = 0; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8), data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); if (data[8] !== 8 || data[9] !== 2) throw new Error('PNG: только RGB8'); }
    if (type === 'IDAT') idat.push(data);
    p += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat)), rgb = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) { if (raw[y * (w * 3 + 1)] !== 0) throw new Error('PNG: фильтр не 0'); raw.copy(rgb, y * w * 3, y * (w * 3 + 1) + 1, (y + 1) * (w * 3 + 1)); }
  return { w, h, rgb };
}

module.exports = { Machine, FRAME_CYCLES, KEYS, JOY, encodePNG, decodePNG, hx };
