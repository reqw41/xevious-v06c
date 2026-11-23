'use strict';
// Реальный i8080-проигрыватель существующего образа -> журнал OUT -> модель ВИ53 vector06js.
const fs = require('fs');
const path = require('path');
const { Machine } = require('../vec/machine');
const { ROOT } = require('./capture');
const { clocked } = require('./audio');

function captureVI(spec, frames, options = {}) {
  const romPath = options.rom || path.join(ROOT, 'build/xevious.rom');
  const labelsPath = options.labels || path.join(ROOT, 'build/xevious.json');
  const symbols = JSON.parse(fs.readFileSync(labelsPath, 'utf8'));
  const rom = fs.readFileSync(romPath);
  const m = new Machine({ ay: false });
  m.loadROM(rom); m.profile = false;
  const sym = name => {
    if (!Number.isInteger(symbols[name])) throw new Error(`Нет метки ${name}`);
    return symbols[name];
  };
  // Только стенд вызовов в свободной нижней памяти. Код/серии звука в ROM не меняются.
  m.setRam([0xc3, 0x40, 0], 0x40); // ожидание следующего шага
  function call(name, args = {}) {
    m.write(0x3bee, 0x40); m.write(0x3bef, 0);
    m.setRegs({ pc: sym(name), sp: 0x3bee, iff: 0, ...args });
    const result = m.runUntil({ pc: 0x40, frames: 2 });
    if (result.reason !== 'pc') throw new Error(`Вектор: ${name} не вернулась`);
  }
  m.write(sym('SND_MODE'), 1);
  if (spec.n) call('plat_sfx', { d: spec.ch, e: spec.note, h: 15, l: spec.n });
  else if (spec.address === 0x4800) call('snd_game');
  else call('plat_music_start', { h: spec.address >> 8, l: spec.address & 255 });
  m.portLog.length = 0;
  const base = m.cycles;
  const states = [];
  // 60000 тактов 3 МГц = ровно 50 Гц для синхронной пары с CPC.
  // Исполняются snd_frame из образа и ожидание; игровые заявки и фоновая логика исключены.
  for (let f = 0; f < frames; f++) {
    if (f) m.runUntil({ cycles: base + f * 60000, frames: 2 });
    call('snd_frame');
    states.push([0, 1, 2].map(ch => m.read16(sym('snd_rec0') + 14 * ch + 12)));
  }
  const ports = m.portLog.map(p => ({ frame: Math.floor((p.c - base) / 60000),
    cycle: p.c - base, pc: p.pc, port: p.port, value: p.v }));
  const result = { hz: 50, frames, cpuClock: 3000000, clock: 1500000, ports, states,
    source: path.relative(ROOT, romPath), labels: path.relative(ROOT, labelsPath) };
  // Независимо раскодируем двоичные серии, включая бит 6, петли и общий генератор шума.
  result.seriesCheck = checkSeries(m, symbols, spec, states);
  return result;
}

function checkSeries(m, symbols, spec, actual) {
  const names = spec.n ? [null, null, null] : spec.vector;
  const streams = [0, 1, 2].map(ch => ({ ptr: spec.n ? (ch === spec.ch ? symbols[`SND_FX${spec.n}`] : 0) :
    (names[ch] ? symbols[names[ch]] : 0), left: 0, flags: 0, value: 0 }));
  let rnd = 0x5a, gaps = 0, loops = 0;
  for (let f = 0; f < actual.length; f++) for (let ch = 0; ch < 3; ch++) {
    const s = streams[ch];
    if (s.ptr && s.left === 0) {
      if (s.flags & 0x40) {
        s.flags = 0; s.value = 0; s.left = 1; gaps++;
      } else {
        let guard = 0;
        while (s.ptr && m.read(s.ptr) === 0) {
          s.ptr = m.read16(s.ptr + 1);
          if (s.ptr) loops++;
          if (++guard > 20) throw new Error('Зацикленная пустая серия ВИ53');
        }
        if (s.ptr) {
          const b = m.read(s.ptr);
          s.left = b & 63; s.flags = b & 0xc0; s.value = m.read16(s.ptr + 1); s.ptr += 3;
          if (!s.left) throw new Error('Пустая серия ВИ53');
        }
      }
    }
    let value = s.ptr ? s.value : 0;
    if (s.ptr && (s.flags & 0x80)) {
      rnd = (5 * rnd + 1) & 255;
      value = value < 256 ? (((rnd & 15) | 1) << 8) | rnd : value ^ rnd;
    }
    if (actual[f][ch] !== value) throw new Error(`Серия/ROM расходятся: кадр ${f}, канал ${ch}, ${actual[f][ch]} != ${value}`);
    if (s.left) s.left--;
  }
  return { frames: actual.length, channelComparisons: actual.length * 3, gaps, loops, errors: 0 };
}

function renderVI(cap, shiftFrames = 0) {
  const timer = new Machine({ ay: false }).timer;
  for (let ch = 0; ch < 3; ch++) timer.Write(3, 0x30 | (ch << 6));
  let at = 0;
  const shift = shiftFrames * 60000;
  // При сдвиге сначала воспроизводим исходные такты, затем отбрасываем только префикс.
  const pcm = clocked(1500000, cap.frames / cap.hz, tick => {
    while (at < cap.ports.length && cap.ports[at].cycle <= tick * 2) {
      const p = cap.ports[at++];
      timer.Write(~p.port & 3, p.value);
    }
    return timer.counters.reduce((sum, c) => sum + c.Count(1), 0) / 3;
  });
  return shift ? pcm.subarray(Math.round(shift / cap.cpuClock * 44100)) : pcm;
}
module.exports = { captureVI, checkSeries, renderVI };
