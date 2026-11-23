#!/usr/bin/env node
'use strict';
// Отдельный режим «одна мелодия» стенда CPC: только at_init / at_play, без запуска игры.
// Существующий tools/cpc/sndcap.js не меняется: все новые инструменты — в tools/snd/.
const fs = require('fs');
const path = require('path');
const CPC = require('../cpc/cpc6128');
const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(ROOT, 'build/snd/compare');
const SONGS = [
  { id: '01_game', name: 'Фоновая музыка', address: 0x4800, vector: ['SND_GAME_A'] },
  { id: '02_start', name: 'Заставка жизни', address: 0x4b00, vector: ['SND_START_A', 'SND_START_B', 'SND_START_C'] },
  { id: '03_over', name: 'Конец игры / ввод имени', address: 0x4c00, vector: ['SND_OVER_A', 'SND_OVER_B', 'SND_OVER_C'] },
];
const FX = [
  { n: 1, ch: 1, note: 0x43, name: 'Сброс бомбы' },
  { n: 2, ch: 1, note: 0x40, name: 'Выстрел' },
  { n: 3, ch: 2, note: 0x30, name: 'Взрыв / гибель' },
  { n: 4, ch: 2, note: 0x40, name: 'Воздушный враг' },
  { n: 5, ch: 2, note: 0x48, name: 'Особый объект' },
  { n: 6, ch: 0, note: 0x40, name: 'Дополнительная жизнь' },
];
const SFXPTR = [0x42d7, 0x4277, 0x421a];

class Player {
  constructor(dsk = path.join(ROOT, 'ref/cpc/xevious.dsk')) {
    this.m = new CPC(dsk);
    const f = this.m.files['xeviosnd.bin'];
    if (!f || f.load !== 0x4000) throw new Error('Нет драйвера xeviosnd.bin по адресу 4000h');
    this.m.ram.set(f.data, 0x10000);
    this.m._setCfg(4);
    this.m.psgLog = [];
    this.links = [];
    this.frame = -1;
  }
  word(a) { return this.m.peek(a) | (this.m.peek(a + 1) << 8); }
  call(pc, args = {}) {
    const m = this.m, sp = 0xbffe;
    m.poke(sp, 0); m.poke(sp + 1, 1); // RET -> 0100h, вне драйвера
    m.cpu.setState({ ...m.cpu.getState(), ...args, pc, sp, iff1: 0, iff2: 0 });
    for (let i = 0; i < 20000; i++) {
      if (m.pc === 0x100) return;
      if (m.pc === 0x4019) {
        const at = this.word(0x401a);
        // Бит 0 записи линкера — переход к адресу продолжения.
        if (m.peek(at) & 1) this.links.push({ frame: this.frame, at, target: this.word(at + 1) });
      }
      // Только инструкции драйвера; CRTC, ISR и игровой код не исполняются.
      m.cpu.run_instruction();
    }
    throw new Error(`CPC: процедура ${pc.toString(16)} не вернулась`);
  }
  init(address) {
    this.call(0x4707, { d: address >> 8, e: address & 255 });
    this.call(0x476b, { d: 0x49, e: 0 });
    this.call(0x4772);
    this.m.psgLog.length = 0;
  }
  step() {
    this.frame++;
    this.m.psgLog.length = 0;
    this.call(0x400a);
    return {
      r: [...this.m.psgRegs.subarray(0, 14)],
      writes: this.m.psgLog.map(([, reg, value]) => [reg, value]),
    };
  }
}

function captureSong(song, { dsk, loops = 2 } = {}) {
  const p = new Player(dsk);
  p.init(song.address);
  const frames = [];
  while (frames.length < 20000) {
    const f = p.step();
    if (p.links.length >= loops) {
      const first = p.links[0], last = p.links[loops - 1];
      const period = first.frame; // эти модули возвращаются к первому паттерну
      if (!period || last.frame !== period * loops || p.links.some(l => l.target !== first.target)) {
        throw new Error('Неожиданная структура петли Arkos');
      }
      // Кадр с переходом уже относится к следующему проходу и в WAV не входит.
      return { ...song, hz: 50, loops, loopFrames: period, links: p.links, frames };
    }
    frames.push(f);
  }
  throw new Error('CPC: за 20000 кадров не найден конец петли');
}

function captureFX(fx, { dsk } = {}) {
  const p = new Player(dsk);
  p.init(0x4800);
  p.call(0x477f, { a: fx.ch, b: 0, c: 0, d: 0, e: fx.note, h: 15, l: fx.n });
  const frames = [];
  while (frames.length < 400) {
    const f = p.step();
    if (p.word(SFXPTR[fx.ch]) === 0) {
      return { ...fx, hz: 50, frames }; // следующий кадр — уже музыка под эффектом
    }
    // Сырой снимок сохраняется; для изолированного прослушивания глушим остальные каналы.
    f.renderR = [...f.r];
    for (let ch = 0; ch < 3; ch++) if (ch !== fx.ch) {
      f.renderR[8 + ch] = 0;
      f.renderR[7] |= (1 << ch) | (8 << ch);
    }
    frames.push(f);
  }
  throw new Error(`CPC: эффект ${fx.n} не закончился`);
}

if (require.main === module) {
  const arg = process.argv.indexOf('--song');
  const song = SONGS.find(s => s.id === process.argv[arg + 1] ||
    s.address === parseInt(process.argv[arg + 1], 16));
  if (arg < 0 || !song) throw new Error('node tools/snd/capture.js --song 4800|4b00|4c00');
  const cap = captureSong(song);
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, `${song.id}_registers.json`), JSON.stringify(cap));
  console.log(`${song.name}: ${cap.frames.length} кадров, петля ${cap.loopFrames}`);
}
module.exports = { ROOT, OUT, SONGS, FX, Player, captureSong, captureFX };
