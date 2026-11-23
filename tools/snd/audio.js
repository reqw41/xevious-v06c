'use strict';
const fs = require('fs');
const RATE = 44100;
const OVERSAMPLE = 4;

// Интегрирование ступенчатого сигнала на частоте чипа в промежуточные 176,4 кГц.
// next(tick) обновляет чип и возвращает его выход для следующего такта.
function clocked(clock, seconds, next) {
  const rate = RATE * OVERSAMPLE, n = Math.round(seconds * rate);
  const pcm = new Float32Array(n);
  const width = clock / rate;
  let tick = 0, at = 0, value = next(0);
  for (let s = 0; s < n; s++) {
    const end = (s + 1) * width;
    let sum = 0;
    while (at < end - 1e-9) {
      const to = Math.min(tick + 1, end);
      sum += value * (to - at);
      at = to;
      if (at >= tick + 1 - 1e-9) value = next(++tick);
    }
    pcm[s] = sum / width;
  }
  return decimate(pcm);
}

function decimate(pcm) {
  // Симметричный sinc / Blackman, 129 taps, срез 18 кГц до понижения частоты.
  // Компенсация групповой задержки сохраняет синхронизацию стереопары.
  const radius = 64, cutoff = 18000 / (RATE * OVERSAMPLE), fir = [];
  let norm = 0;
  for (let k = -radius; k <= radius; k++) {
    const sinc = k === 0 ? 2 * cutoff : Math.sin(2 * Math.PI * cutoff * k) / (Math.PI * k);
    const window = 0.42 + 0.5 * Math.cos(Math.PI * k / radius) + 0.08 * Math.cos(2 * Math.PI * k / radius);
    fir.push(sinc * window); norm += sinc * window;
  }
  const out = new Float32Array(Math.round(pcm.length / OVERSAMPLE));
  const hp = Math.exp(-2 * Math.PI * 20 / RATE);
  let last = 0, dc = 0;
  for (let s = 0; s < out.length; s++) {
    let value = 0;
    for (let k = -radius; k <= radius; k++) {
      const i = s * OVERSAMPLE + k;
      if (i >= 0 && i < pcm.length) value += pcm[i] * fir[k + radius] / norm;
    }
    dc = hp * (dc + value - last); last = value;
    out[s] = dc * 0.8; // одинаковое усиление для обоих чипов, без нормализации по файлу
  }
  return out;
}

function writeWav(file, channels) {
  const n = channels[0].length, count = channels.length;
  if (!channels.every(c => c.length === n)) throw new Error('Разные длины каналов WAV');
  const b = Buffer.alloc(44 + 2 * count * n);
  b.write('RIFF', 0); b.writeUInt32LE(b.length - 8, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(count, 22);
  b.writeUInt32LE(RATE, 24); b.writeUInt32LE(RATE * count * 2, 28);
  b.writeUInt16LE(count * 2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(b.length - 44, 40);
  for (let s = 0; s < n; s++) for (let ch = 0; ch < count; ch++) {
    const x = channels[ch][s];
    if (!Number.isFinite(x) || Math.abs(x) >= 1) throw new Error(`Некорректный PCM / клиппинг: ${x}`);
    b.writeInt16LE(Math.round(x * 32767), 44 + 2 * (s * count + ch));
  }
  fs.writeFileSync(file, b);
}
module.exports = { RATE, clocked, writeWav };
