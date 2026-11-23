#!/usr/bin/env node
'use strict';
// Проверки синтеза по эталонным формам/частотам и независимая проверка готовых артефактов.
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ROOT, OUT, SONGS, FX } = require('./capture');
const { AY, LEVEL } = require('./ay');
const { Machine } = require('../vec/machine');
const { checkSeries } = require('./vi53');
const { RATE } = require('./audio');
const json = name => JSON.parse(fs.readFileSync(path.join(OUT, name), 'utf8'));

function chips() {
  let forms = 0;
  // Все 16 форм, включая повторённые крайние ступени треугольника и удержание.
  for (let shape = 0; shape < 16; shape++) {
    const ay = new AY();
    ay.write(11, 1); ay.write(13, shape);
    for (let step = 0; step < 64; step++) {
      const rising = !!(shape & 4), pos = step % 16, pass = Math.floor(step / 16);
      let expected;
      if (!(shape & 8)) expected = pass ? 0 : rising ? pos : 15 - pos;
      else if ((shape & 1) && pass) expected = (rising !== !!(shape & 2)) ? 15 : 0;
      else {
        const up = rising !== (!!(shape & 2) && !!(pass & 1));
        expected = up ? pos : 15 - pos;
      }
      assert.equal(ay.envStep ^ ay.attack, expected, `Форма ${shape}, шаг ${step}`);
      ay.tick(); ay.tick();
    }
    ay.write(13, shape);
    assert.equal(ay.envStep ^ ay.attack, shape & 4 ? 0 : 15, 'Повторный R13 должен перезапустить форму');
    forms++;
  }
  const ay = new AY();
  ay.write(0, 60); ay.write(7, 62); ay.write(8, 15);
  let rising = 0, previous = ay.output();
  for (let t = 0; t < 125000; t++) {
    ay.tick(); const value = ay.output();
    if (value > previous) rising++;
    previous = value;
  }
  assert(Math.abs(rising - 1000000 / (16 * 60)) < 1, 'Частота AY 1 МГц / (16·60)');
  for (let mix = 0; mix < 64; mix++) for (let tone = 0; tone < 2; tone++) for (let noise = 0; noise < 2; noise++) {
    ay.r[7] = mix; ay.tone[0] = tone; ay.lfsr = noise;
    const enabled = !!((mix & 1) || tone) && !!((mix & 8) || noise);
    assert.equal(ay.output(), enabled ? 1 / 3 : 0, 'Логика микшера R7');
  }
  for (let v = 0; v < 16; v++) {
    ay.write(7, 63); ay.write(8, v);
    assert.equal(ay.output(), LEVEL[v] / 3);
    if (v) assert(LEVEL[v] > LEVEL[v - 1]);
  }
  const noise = new AY(), seen = new Set();
  for (let i = 0; i < 131071; i++) {
    assert(!seen.has(noise.lfsr), 'Преждевременная петля 17-битного шума');
    seen.add(noise.lfsr); noise.tick(); noise.tick();
  }
  assert.equal(noise.lfsr, 1);
  const timer = new Machine().timer;
  timer.Write(3, 0x36); timer.Write(0, 1500 & 255); timer.Write(0, 1500 >> 8);
  rising = 0; previous = timer.counters[0].out;
  for (let i = 0; i < 1500000; i++) {
    const value = timer.counters[0].Count(1);
    if (value > previous) rising++;
    previous = value;
  }
  assert(Math.abs(rising - 1000) <= 1, 'ВИ53 1,5 МГц / 1500 = 1 кГц');
  return { envelopeForms: forms, mixerCases: 256, noisePeriod: seen.size,
    ayPitch: '1 МГц / (16·60)', viPitch: '1,5 МГц / 1500' };
}

function wav(name, channels, frames) {
  const b = fs.readFileSync(path.join(OUT, name));
  assert.equal(b.toString('ascii', 0, 4), 'RIFF');
  assert.equal(b.toString('ascii', 8, 16), 'WAVEfmt ');
  assert.equal(b.readUInt16LE(20), 1);
  assert.equal(b.readUInt16LE(22), channels);
  assert.equal(b.readUInt32LE(24), RATE);
  assert.equal(b.readUInt16LE(34), 16);
  assert.equal(b.length, 44 + frames * channels * 2);
  assert.equal(b.readUInt32LE(4), b.length - 8);
  assert.equal(b.readUInt32LE(40), b.length - 44);
  const result = Array.from({ length: channels }, () => new Int16Array(frames));
  for (let i = 0; i < frames; i++) for (let ch = 0; ch < channels; ch++) {
    const s = b.readInt16LE(44 + 2 * (i * channels + ch));
    assert(Math.abs(s) < 32767, 'Клиппинг WAV');
    result[ch][i] = s;
  }
  assert(result.every(c => c.some(s => Math.abs(s) > 100)), `Пустой канал ${name}`);
  return result;
}

function portStates(cap) {
  const channels = Array.from({ length: 3 }, () => ({ value: 0, low: null, mode: 0 }));
  let at = 0;
  for (let f = 0; f < cap.frames; f++) {
    while (at < cap.ports.length && cap.ports[at].frame <= f) {
      const p = cap.ports[at++];
      assert(p.port >= 8 && p.port <= 11);
      if (p.port === 8) {
        const ch = channels[p.value >> 6];
        assert(ch, 'Некорректный счётчик');
        assert.equal((p.value >> 4) & 3, 3, 'Ожидается LSB/MSB');
        ch.mode = (p.value >> 1) & 7; ch.low = null;
        assert(ch.mode === 0 || ch.mode === 3);
      } else {
        const ch = channels[11 - p.port];
        if (ch.low === null) ch.low = p.value;
        else { ch.value = ch.low | (p.value << 8); ch.low = null; }
      }
    }
    assert.deepEqual(channels.map(c => c.mode === 0 ? 0 : c.value), cap.states[f], `Порты/делители, кадр ${f}`);
  }
  assert(channels.every(c => c.low === null), 'Оборванная пара байтов ВИ53');
}

function main() {
  const report = { chips: chips(), songs: [], effects: [], wavFiles: 10 };
  const manifest = json('manifest.json');
  for (const source of manifest.sources) {
    const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, source.file))).digest('hex');
    assert.equal(hash, source.sha256, `Изменился источник ${source.file}`);
  }
  const symbols = JSON.parse(fs.readFileSync(path.join(ROOT, 'build/xevious.json'), 'utf8'));
  const m = new Machine(); m.loadROM(path.join(ROOT, 'build/xevious.rom'));
  const CPC = require('../cpc/cpc6128');
  const sound = new CPC(path.join(ROOT, 'ref/cpc/xevious.dsk')).files['xeviosnd.bin'].data;
  const modules = [];
  for (let i = 0; i < sound.length - 3; i++) {
    if (Buffer.from(sound.subarray(i, i + 4)).toString('ascii') === 'AT10') modules.push(0x4000 + i);
  }
  assert.deepEqual(modules, [0x4800, 0x4900, 0x4b00, 0x4c00], 'Полный набор модулей CPC');
  for (const spec of [...SONGS, ...FX]) {
    const id = spec.id || `fx${spec.n}`, a = json(`${id}_registers.json`), v = json(`${id}_ports.json`);
    assert.equal(a.frames.length, manifest[spec.n ? 'effects' : 'songs'].find(s => s.id === id).frames);
    portStates(v);
    const check = checkSeries(m, symbols, spec, v.states);
    assert.equal(check.errors, 0);
    if (spec.n) { report.effects.push({ id, frames: a.frames.length, ...check }); continue; }
    assert.equal(a.frames.length, a.loopFrames * 2);
    assert.equal(a.links[1].frame, a.links[0].frame * 2);
    // Связь левой и правой записи: независимая покадровая проверка общей части музыки.
    // У заставки последний (300-й) кадр был снят vecsound.js уже на переходе к фону.
    const common = Math.min(a.frames.length, spec.address === 0x4b00 ? 299 : Infinity);
    for (let f = 0; f < common; f++) for (let ch = 0; ch < 3; ch++) {
      const r = a.frames[f].r, volume = r[8 + ch];
      const expected = ((volume & 16) || volume >= 5) && !(r[7] & (1 << ch)) ?
        Math.min(65535, Math.max(2, 24 * (((r[2 * ch + 1] & 15) << 8) | r[2 * ch]))) : 0;
      assert.equal(v.states[f + v.alignment.shiftFrames][ch], expected,
        `AY/ВИ53 после синхронизации: ${id}, кадр ${f}, канал ${ch}`);
    }
    const n = a.frames.length * RATE / 50;
    const [left, right] = wav(`${id}_both.wav`, 2, n);
    assert.deepEqual(left, wav(`${id}_ay.wav`, 1, n)[0], 'Левый канал должен совпадать с AY');
    assert.deepEqual(right, wav(`${id}_vi53.wav`, 1, n)[0], 'Правый канал должен совпадать с ВИ53');
    if (spec.address === 0x4800) {
      // Высота в готовом PCM: не только расчёт периода, но и весь тракт ресемплинга.
      for (const channel of [left, right]) {
        let crossings = 0;
        const start = Math.round(.03 * RATE), end = Math.round(.10 * RATE);
        for (let i = start + 1; i < end; i++) if (channel[i - 1] <= 0 && channel[i] > 0) crossings++;
        const measured = crossings * RATE / (end - start);
        assert(Math.abs(measured - 1000000 / (16 * 60)) < 20, `Неверная высота в WAV: ${measured}`);
      }
    }
    if (spec.address === 0x4b00) {
      assert(right.subarray(7 * RATE).every(s => Math.abs(s) <= 1), 'После конечного потока заставка ВИ53 должна молчать');
      assert(left.subarray(7 * RATE).some(s => Math.abs(s) > 100), 'Второй проход CPC должен звучать');
    }
    report.songs.push({ id, samples: n, synchronizedChannelFrames: common * 3, ...check });
  }
  const fx = wav('fx_both.wav', 2, Math.round(manifest.effectsSeconds * RATE));
  for (const row of manifest.effects) {
    const from = Math.round(row.startsAt * RATE), to = Math.round((row.startsAt + row.seconds) * RATE);
    assert(fx.every(ch => ch.subarray(from, to).some(x => Math.abs(x) > 100)), `Не звучит эффект ${row.effect}`);
    const end = Math.round((row.startsAt + row.slotSeconds) * RATE);
    assert(fx.every(ch => ch.subarray(end - 100, end).every(x => Math.abs(x) <= 1)), `Нет паузы после эффекта ${row.effect}`);
  }
  fs.writeFileSync(path.join(OUT, 'checks.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`OK: 16 форм огибающей, R7, шум 131071, высота AY/ВИ53; 10 WAV, стереоканалы, 9 журналов портов/серий`);
}
if (require.main === module) main();
module.exports = { chips, portStates };
