// cpc6128.js — модель Amstrad CPC 6128 без окна для эталонных прогонов Xevious (Easter Egg, 2026).
//
// Z80: vendor/Z80.js (MIT, правка INI/IND из aticatac-v06c). ОЗУ 128 КБ, все 8 конфигураций gate array (C0..C7).
// ПЗУ нет: прошивка заменена перехватом вызовов BC77/BC83/BC7A (чтение файлов прямо из DSK) и пустыми
// KL-вызовами, которыми игра готовит машину. Игра потом ставит свой обработчик прерываний и прошивку не зовёт.
// CRTC считается по строкам: VCC/VLC/R4/R5/R7/R9, адрес из R12/R13 на начало кадра (работают и разрывы кадра).
// Строка = 256 тактов (64 мкс), команды округляются до 4 тактов. Прерывания gate array: счётчик R52
// по HSYNC (52 строки), синхронизация с VSYNC через 2 строки, подтверждение сбрасывает бит 5.
// Изображение: каждая строка выводится в начале своего времени с текущими цветами — так видны растры.
'use strict';
const Z80 = require('./vendor/Z80.js');
const { readDsk } = require('./dsk.js');

const T_LINE = 256;
const FB_W = 384, FB_H = 312;        // кадр монитора в точках MODE 1 (полный растр; поле игры обрезать)

// аппаратные цвета 0..31 -> уровни R,G,B (0/1/2)
const HWRGB = [
  [1,1,1],[1,1,1],[0,2,1],[2,2,1],[0,0,1],[2,0,1],[0,1,1],[2,1,1],
  [2,0,1],[2,2,1],[2,2,0],[2,2,2],[2,0,0],[2,0,2],[2,1,0],[2,1,2],
  [0,0,1],[0,2,1],[0,2,0],[0,2,2],[0,0,0],[0,0,2],[0,1,0],[0,1,2],
  [1,0,1],[1,2,1],[1,2,0],[1,2,2],[1,0,0],[1,0,2],[1,1,0],[1,1,2]];
const LV = [0, 128, 255];

// конфигурации ОЗУ: страница для окон 0x0000/0x4000/0x8000/0xC000
const CFG = [[0,1,2,3],[0,1,2,7],[4,5,6,7],[0,3,2,7],[0,4,2,3],[0,5,2,3],[0,6,2,3],[0,7,2,3]];

// матрица клавиатуры: имя -> [строка, бит]
const KEYS = {
  UP: [0, 0], RIGHT: [0, 1], DOWN: [0, 2], ENTER: [0, 6], LEFT: [1, 0], COPY: [1, 1],
  SHIFT: [2, 5], CTRL: [2, 7], RETURN: [2, 2], P: [3, 3], SPACE: [5, 7], ESC: [8, 2],
  '1': [8, 0], '2': [8, 1], '3': [7, 1],
  J_UP: [9, 0], J_DOWN: [9, 1], J_LEFT: [9, 2], J_RIGHT: [9, 3], J_FIRE1: [9, 4], J_FIRE2: [9, 5],
};

// перехваты прошивки
const T_CAS_IN_OPEN = 0xbc77, T_CAS_IN_CLOSE = 0xbc7a, T_CAS_IN_DIRECT = 0xbc83;
const T_NOP = [0xbcc8, 0xbccb, 0xbcce, 0xbcd1, 0xbcd7, 0xbcda, 0xbcdd];

class CPC6128 {
  constructor(dskPath) {
    this.ram = new Uint8Array(0x20000);
    this.map = [0, 0x4000, 0x8000, 0xc000];   // смещение страницы для каждого окна
    this.cfg = 0;
    this.keyMatrix = new Uint8Array(16).fill(0xff);
    this.psgReg = 0; this.psgBus = 0; this.psgCtl = 0; this.kbRow = 0;
    this.psgRegs = new Uint8Array(16); this.psgLog = null;
    this.crtcReg = 0; this.crtc = new Uint8Array(18);
    this.pens = new Uint8Array(17).fill(0x14); this.pen = 0; this.mode = 1;
    // CRTC
    this.vcc = 0; this.vlc = 0; this.adj = -1; this.ma = 0; this.vsync = 0; this.dispOn = true;
    this.r52 = 0; this.sinceVs = -1; this.intPending = false;
    // время
    this.t = 0; this.total = 0; this.frames = 0;
    // изображение
    this.fb = new Uint8Array(FB_W * FB_H * 3); this.last = new Uint8Array(FB_W * FB_H * 3); this.monLine = 0;
    this.lineLog = null;                      // массив по строкам кадра: [vcc, vlc, ma, mode, pens...] (для разбора растров)
    this.onWrite = null; this.onRead = null; this.onFrame = null; this.onUnknownCall = null;
    this.files = dskPath ? readDsk(dskPath) : {};
    this.casFile = null;
    const self = this;
    this.cpu = new Z80({
      mem_read: (a) => { const p = self.map[a >> 14] + (a & 0x3fff); const v = self.ram[p]; if (self.onRead) self.onRead(a, p, v); return v; },
      mem_write: (a, v) => { const p = self.map[a >> 14] + (a & 0x3fff); if (self.onWrite) self.onWrite(a, p, v); self.ram[p] = v & 0xff; },
      io_read: (p) => self._in(p & 0xffff),
      io_write: (p, v) => self._out(p & 0xffff, v & 0xff),
    });
    // CRTC как после прошивки
    [63, 40, 46, 0x8e, 38, 0, 25, 30, 0, 7, 0, 0, 0x30, 0].forEach((v, i) => { this.crtc[i] = v; });
  }

  // запуск файла как после RUN"имя: загрузка, стек BASIC, обработчик прерываний прошивки = EI/RET
  boot(name) {
    const f = this._file(name); if (!f) throw new Error('нет файла ' + name);
    this.ram.set(f.data, f.load);
    this.ram[0x38] = 0xc3; this.ram[0x39] = 0x41; this.ram[0x3a] = 0xb9;
    this.ram[0xb941] = 0xfb; this.ram[0xb942] = 0xc9;
    for (const a of [T_CAS_IN_OPEN, T_CAS_IN_CLOSE, T_CAS_IN_DIRECT, ...T_NOP]) this.ram[a] = 0xc9;
    const s = this.cpu.getState();
    s.pc = f.entry; s.sp = 0xbff8; s.imode = 1; s.iff1 = 1; s.iff2 = 1;
    this.cpu.setState(s);
  }

  _file(name) { return this.files[name.toLowerCase()]; }
  peek(a) { return this.ram[this.map[a >> 14] + (a & 0x3fff)]; }
  poke(a, v) { this.ram[this.map[a >> 14] + (a & 0x3fff)] = v & 0xff; }
  peekPage(n, a) { return this.ram[n * 0x4000 + (a & 0x3fff)]; }
  get pc() { return this.cpu.get_pc(); }

  _setCfg(c) { this.cfg = c & 7; this.map = CFG[this.cfg].map((p) => p * 0x4000); }

  _in(p) {
    const hi = p >> 8;
    if ((p & 0x0800) === 0) {
      if (hi === 0xf4) return (this.psgCtl === 1 && this.psgReg === 14) ? this.keyMatrix[this.kbRow] : 0xff;
      if (hi === 0xf5) return 0x1e | (this.vsync > 0 ? 1 : 0);
      if (hi === 0xf6) return this.kbRow;
    }
    if (hi === 0xbf && this.crtcReg >= 12 && this.crtcReg <= 17) return this.crtc[this.crtcReg];
    return 0xff;
  }

  _out(p, v) {
    const hi = p >> 8;
    if ((p & 0xc000) === 0x4000) {             // gate array (7Fxx)
      const top = v & 0xc0;
      if (top === 0x00) this.pen = v & 0x1f;
      else if (top === 0x40) this.pens[(this.pen & 0x10) ? 16 : (this.pen & 15)] = v & 0x1f;
      else if (top === 0x80) { this.mode = v & 3; if (v & 0x10) this.r52 = 0; }
      else this._setCfg(v);
      return;
    }
    if ((p & 0x4000) === 0) {                  // CRTC (BCxx/BDxx)
      if ((hi & 3) === 0) this.crtcReg = v & 0x1f;
      else if ((hi & 3) === 1 && this.crtcReg < 18) this.crtc[this.crtcReg] = v;
      return;
    }
    if ((p & 0x0800) === 0) {                  // PPI
      if (hi === 0xf4) { this.psgBus = v; if (this.psgCtl === 3) this.psgReg = v & 15; return; }
      if (hi === 0xf6) {
        this.kbRow = v & 0x0f; this.psgCtl = (v >> 6) & 3;
        if (this.psgCtl === 3) this.psgReg = this.psgBus & 15;
        else if (this.psgCtl === 2 && this.psgReg < 14) {
          this.psgRegs[this.psgReg] = this.psgBus;
          if (this.psgLog) this.psgLog.push([this.total, this.psgReg, this.psgBus]);
        }
        return;
      }
      if (hi === 0xf7 && !(v & 0x80)) {
        const bit = (v >> 1) & 7;
        let c = (this.psgCtl << 6) | this.kbRow;
        c = (v & 1) ? c | (1 << bit) : c & ~(1 << bit);
        this.kbRow = c & 15; this.psgCtl = (c >> 6) & 3;
      }
    }
  }

  keyDown(n) { const k = KEYS[n]; if (!k) throw new Error('клавиша ' + n); this.keyMatrix[k[0]] &= ~(1 << k[1]); }
  keyUp(n) { const k = KEYS[n]; this.keyMatrix[k[0]] |= (1 << k[1]); }
  keysOnly(names) { this.keyMatrix.fill(0xff); for (const n of names) this.keyDown(n); }

  // ---- перехват прошивки
  _trap(pc) {
    if (this.ram[pc] !== 0xc9 || this.cfg === 2) return false;   // адреса BCxx — в странице 2
    const s = this.cpu.getState();
    const ok = () => { s.flags.C = 1; s.flags.Z = 0; };
    if (pc === T_CAS_IN_OPEN) {
      let name = ''; const hl = (s.h << 8) | s.l;
      for (let i = 0; i < s.b; i++) name += String.fromCharCode(this.peek((hl + i) & 0xffff) & 0x7f);
      const f = this._file(name.trim());
      if (!f) { s.flags.C = 0; s.flags.Z = 0; this.casFile = null; }
      else {
        this.casFile = f; ok();
        s.a = f.type; s.b = f.data.length >> 8; s.c = f.data.length & 0xff;
        s.d = f.load >> 8; s.e = f.load & 0xff;
      }
      if (this.onCas) this.onCas('open', name, f);
    } else if (pc === T_CAS_IN_DIRECT) {
      const f = this.casFile; const hl = (s.h << 8) | s.l;
      if (!f) { s.flags.C = 0; } else {
        for (let i = 0; i < f.data.length; i++) this.poke((hl + i) & 0xffff, f.data[i]);
        ok(); s.h = f.entry >> 8; s.l = f.entry & 0xff;
        if (this.onCas) this.onCas('direct', f.name, f, hl);
      }
    } else if (pc === T_CAS_IN_CLOSE) { this.casFile = null; ok(); }
    else if (T_NOP.includes(pc)) { ok(); }
    else return false;
    // RET
    const lo = this.peek(s.sp), hi = this.peek((s.sp + 1) & 0xffff);
    s.sp = (s.sp + 2) & 0xffff; s.pc = lo | (hi << 8);
    this.cpu.setState(s);
    return true;
  }

  // одна команда (или подача прерывания); возвращает такты
  step() {
    const cpu = this.cpu;
    if (this.intPending && cpu.get_iff1()) {
      this.intPending = false; this.r52 &= 0x1f;
      cpu.interrupt(false, 0xff);
      this._tick(20); return 20;
    }
    const pc = cpu.get_pc();
    if (pc >= 0xb900 && pc < 0xbe00) {
      if (this._trap(pc)) { this._tick(40); return 40; }
      if (this.onUnknownCall && pc !== 0xb942 && this.ram[pc] === 0xc9) this.onUnknownCall(pc);
    }
    let c = cpu.run_instruction();
    c = (c + 3) & ~3;
    this._tick(c);
    return c;
  }

  _tick(c) {
    this.total += c; this.t += c;
    while (this.t >= T_LINE) { this.t -= T_LINE; this._line(); }
  }

  // начало новой строки развёртки
  _line() {
    const R = this.crtc;
    // GA: HSYNC -> R52
    this.r52++;
    if (this.sinceVs >= 0) {
      this.sinceVs++;
      if (this.sinceVs === 2) { if (this.r52 >= 32) this.intPending = true; this.r52 = 0; this.sinceVs = -1; }
    }
    if (this.r52 >= 52) { this.r52 = 0; this.intPending = true; }
    if (this.vsync > 0) this.vsync--;

    // CRTC: перейти к следующей строке
    if (this.adj >= 0) {
      this.adj++;
      if (this.adj >= R[5]) this._newFrame();
    } else if (this.vlc >= (R[9] & 0x1f)) {
      this.vlc = 0;
      if (this.vcc >= (R[4] & 0x7f)) {
        if (R[5] & 0x1f) this.adj = 0; else this._newFrame();
      } else { this.vcc++; this.ma = (this.ma + R[1]) & 0x3fff; this._rowStart(); }
    } else this.vlc++;

    // вывод строки
    this.monLine++;
    if (this.monLine < FB_H) this._render(this.monLine);
  }

  _newFrame() {
    this.adj = -1; this.vcc = 0; this.vlc = 0;
    this.ma = ((this.crtc[12] << 8) | this.crtc[13]) & 0x3fff;
    this.dispOn = true;
    this._rowStart();
  }

  _rowStart() {
    if (this.vcc === (this.crtc[6] & 0x7f)) this.dispOn = false;   // как CRTC: гаснет на равенстве и до конца кадра
    if (this.vcc === (this.crtc[7] & 0x7f) && this.vlc === 0 && this.vsync === 0) {
      let w = this.crtc[3] >> 4; if (!w) w = 16;
      this.vsync = w; this.sinceVs = 0;
      // новый кадр монитора
      this.last.set(this.fb); this.fb.fill(0); this.monLine = 0; this.frames++;
      if (this.onFrame) this.onFrame(this.frames);
    }
  }

  _render(y) {
    const R = this.crtc, fb = this.fb, row = y * FB_W * 3;
    const disp = this.adj < 0 && this.dispOn && this.vsync === 0;
    const bc = HWRGB[this.pens[16]];
    if (this.lineLog) this.lineLog[y] = [this.vcc, this.vlc, this.ma, this.mode, disp ? 1 : 0, ...this.pens];
    // фон бордюром
    const br = LV[bc[0]], bg = LV[bc[1]], bb = LV[bc[2]];
    for (let o = row; o < row + FB_W * 3; o += 3) { fb[o] = br; fb[o + 1] = bg; fb[o + 2] = bb; }
    if (!disp) return;
    const nb = R[1] * 2, ma = this.ma;
    const x0 = Math.max(0, ((FB_W / 4 - nb) >> 1)) * 4;   // по центру
    const page = (ma & 0x3000) << 2, rl = (this.vlc & 7) << 11;
    const rgb = []; for (let k = 0; k < 16; k++) { const h = HWRGB[this.pens[k]]; rgb.push([LV[h[0]], LV[h[1]], LV[h[2]]]); }
    const mode = this.mode, lim = Math.min(nb, (FB_W - x0) >> 2);
    for (let i = 0; i < lim; i++) {
      const b = this.ram[page | rl | (((ma & 0x3ff) * 2 + i) & 0x7ff)];
      let o = row + (x0 + i * 4) * 3;
      for (let k = 0; k < 4; k++, o += 3) {
        let q;
        if (mode === 1) q = ((b >> (7 - k)) & 1) | (((b >> (3 - k)) & 1) << 1);
        else if (mode === 0) q = k < 2 ? (((b >> 7) & 1) | ((b >> 3) & 1) << 1 | ((b >> 5) & 1) << 2 | ((b >> 1) & 1) << 3)
                                       : (((b >> 6) & 1) | ((b >> 2) & 1) << 1 | ((b >> 4) & 1) << 2 | (b & 1) << 3);
        else q = (b >> (7 - 2 * k)) & 1;            // MODE 2 — грубо, каждая вторая точка
        const c = rgb[q]; fb[o] = c[0]; fb[o + 1] = c[1]; fb[o + 2] = c[2];
      }
    }
  }

  runFrames(n) { const f = this.frames + n; while (this.frames < f) this.step(); }
  runUntilPc(pc, maxT) {
    const lim = this.total + (maxT || 80000 * 500);
    while (this.total < lim) { if (this.cpu.get_pc() === pc) return true; this.step(); }
    return false;
  }
}

CPC6128.KEYS = KEYS; CPC6128.FB_W = FB_W; CPC6128.FB_H = FB_H; CPC6128.HWRGB = HWRGB;
module.exports = CPC6128;
