#!/usr/bin/env node
'use strict';
// node tools/snd/compare.js — все артефакты только в build/snd/compare/.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ROOT, OUT, SONGS, FX, captureSong, captureFX } = require('./capture');
const { RATE, writeWav } = require('./audio');
const { renderAY } = require('./ay');
const { captureVI, renderVI } = require('./vi53');
const save = (name, obj) => fs.writeFileSync(path.join(OUT, name), JSON.stringify(obj));
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function stats(cap) {
  let noise = 0, envelope = 0, envelopeWrites = 0;
  const levels = new Set();
  for (const f of cap.frames) {
    const r = f.renderR || f.r;
    envelopeWrites += f.writes.filter(([reg]) => reg === 13).length;
    for (let ch = 0; ch < 3; ch++) {
      const v = r[8 + ch];
      if (v & 16) envelope++;
      if ((v & 31) && !(r[7] & (8 << ch))) noise++;
      if (v & 15) levels.add(v & 15);
    }
  }
  return { noiseChannelFrames: noise, envelopeChannelFrames: envelope, envelopeWrites,
    fixedLevels: [...levels].sort((a, b) => a - b) };
}

function leadingVI(states) { return states.findIndex(row => row.some(x => x !== 0)); }
function leadingAY(cap) {
  return cap.frames.findIndex(f => (f.renderR || f.r).slice(8, 11).some(v => v & 31));
}

function pair(spec, isFX) {
  const ay = isFX ? captureFX(spec) : captureSong(spec);
  const n = ay.frames.length;
  // Дополнительные кадры нужны только для определения/компенсации префикса захвата vecsound.js.
  const tail = isFX ? 25 : 0;
  const vi = captureVI(spec, n + tail + 4);
  const shift = leadingVI(vi.states) - leadingAY(ay);
  if (shift < 0 || shift > 3) throw new Error(`Неожиданный префикс синхронизации: ${shift}`);
  vi.alignment = { shiftFrames: shift, shiftSeconds: shift / 50,
    reason: 'Общий сдвиг первого звучащего кадра; задержки отдельных каналов сохранены' };
  const a = renderAY(ay, tail);
  const v = renderVI(vi, shift).subarray(0, a.length);
  const id = isFX ? `fx${spec.n}` : spec.id;
  save(`${id}_registers.json`, ay);
  save(`${id}_ports.json`, vi);
  const last = vi.states.slice(shift, shift + n).findLastIndex(row => row.some(x => x));
  const item = { id, name: spec.name, address: spec.address, effect: spec.n,
    frames: n, seconds: n / 50, loopFrames: ay.loopFrames, alignmentFrames: shift,
    viLastSoundFrame: last, renderTailFrames: tail, stats: stats(ay), seriesCheck: vi.seriesCheck };
  if (!isFX) {
    writeWav(path.join(OUT, `${id}_ay.wav`), [a]);
    writeWav(path.join(OUT, `${id}_vi53.wav`), [v]);
    writeWav(path.join(OUT, `${id}_both.wav`), [a, v]);
  }
  console.log(`${id}: ${n} кадров (${(n / 50).toFixed(2)} с), сдвиг ВИ53 ${shift}, ` +
    `шум ${item.stats.noiseChannelFrames}, огибающая ${item.stats.envelopeChannelFrames}`);
  return { a, v, item };
}

function main() {
  if (process.argv.length > 2) throw new Error('node tools/snd/compare.js (без аргументов)');
  fs.mkdirSync(OUT, { recursive: true });
  const songs = SONGS.map(s => pair(s, false).item);
  const effects = FX.map(s => pair(s, true));
  // Каждому эффекту — отдельная секция длиной max(1 с, длина + 0,5 с), затем следующий номер.
  let length = 0;
  const timeline = effects.map(e => {
    const size = Math.round(Math.max(1, e.item.seconds + .5) * RATE);
    const row = { ...e.item, startsAt: length / RATE, slotSeconds: size / RATE };
    length += size;
    return row;
  });
  const left = new Float32Array(length), right = new Float32Array(length);
  for (let i = 0; i < effects.length; i++) {
    const at = Math.round(timeline[i].startsAt * RATE);
    left.set(effects[i].a, at); right.set(effects[i].v, at);
  }
  writeWav(path.join(OUT, 'fx_both.wav'), [left, right]);
  const manifest = { format: { rate: RATE, bits: 16, stereo: 'AY слева, ВИ53 справа', hz: 50 },
    sources: ['ref/cpc/xevious.dsk', 'build/xevious.rom', 'build/xevious.json', 'build/gen/vec_sound.inc']
      .map(file => ({ file, sha256: sha(path.join(ROOT, file)) })),
    songs, effects: timeline, effectsSeconds: length / RATE };
  save('manifest.json', manifest);
  fs.writeFileSync(path.join(OUT, 'LIST.md'), list(manifest));
}

function list(m) {
  const rows = m.songs.map(s => `| ${s.id} | ${s.name} (${s.address.toString(16).toUpperCase()}h) | ${s.loopFrames} | ${s.seconds.toFixed(2)} с | [AY](${s.id}_ay.wav) · [ВИ53](${s.id}_vi53.wav) · [пара](${s.id}_both.wav) |`).join('\n');
  const fxrows = m.effects.map(s => `| ${s.effect} | ${s.name} | ${s.startsAt.toFixed(2)} с | ${s.frames} / ${s.seconds.toFixed(2)} с | ${s.stats.noiseChannelFrames} | ${s.stats.envelopeChannelFrames} |`).join('\n');
  return `# CPC Xevious: AY ↔ ВИ53, локальное сравнение

Все WAV: PCM 16 бит, 44 100 Гц. В стереопарах **слева AY CPC, справа ВИ53 Вектора**.
В монофайлах — те же отсчёты соответствующего канала. Частота шагов обоих проигрывателей — 50 Гц.

| Файлы | Мелодия CPC | Петля, кадров | Два прохода | Прослушивание |
|---|---|---:|---:|---|
${rows}

Других музыкальных модулей в xeviosnd.bin нет: 4900h — банк эффектов, а ввод имени использует 4C00h.

## Что различается

- **Фон:** AY меняет громкость 9 → 8 → 7 внутри каждой ноты. ВИ53 сохраняет высоту и ритм,
  но играет одинаковой громкостью: звук заметно ровнее и резче.
- **Заставка жизни:** AY записан целиком, два раза по 336 кадров. В ROM Вектора поток конечный,
  записаны только 300 кадров (6,00 с); затем правая сторона молчит. В игре в этот момент включается
  фон, здесь он не подмешан к отдельной заставке. Порог громкости 5 убирает тихие части затуханий,
  соотношение громкостей трёх голосов теряется. Правая сторона не зациклена искусственно.
- **Конец игры / ввод имени:** двухпроходная петля 256 кадров. Ноты с затуханием у AY превращаются
  в короткие прямоугольные импульсы одинаковой громкости и паузы у ВИ53.
- **Шум:** присутствует у AY в эффекте 3. Вектор исполняет свой генератор x := 5x + 1, меняя делитель
  лишь раз в кадр: вместо настоящего широкополосного шума слышен меняющийся тон.
- **Огибающая:** в этих трёх изолированных мелодиях нет кадров с включённой аппаратной огибающей;
  она используется в эффектах (точные счётчики ниже). На ВИ53 её форма и управление амплитудой исчезают.
  Даже повторная запись того же R13 перезапускает огибающую; синтез AY это учитывает.
- Ограничение делителя ВИ53 65535 и порог громкости уже заложены в ROM; конвертация заново не выполнялась.

## Эффекты 1–6

[fx_both.wav](fx_both.wav), ${m.effectsSeconds.toFixed(2)} с: эффекты в порядке номеров, с паузами.
Фоновая музыка исключена; значения канала эффекта взяты из настоящего at_sfx_play.

| № | Эффект | Начало в файле | Длина AY, кадров / секунд | Канало-кадров шума | Канало-кадров огибающей |
|---:|---|---:|---:|---:|---:|
${fxrows}

## Метод и воспроизведение

<code>node tools/snd/compare.js</code> — заново создать весь набор; <code>node tools/snd/check.js</code> — проверить.
Одиночный захват: <code>node tools/snd/capture.js --song 4800</code> (также 4b00, 4c00).

AY: оригинальный драйвер загружен в банк 4 модели CPC; at_init 4707h, затем только at_play 400Ah.
Границы двух проходов определяются переходами линкера Arkos, не случайным совпадением регистров.
Эффекты: at_sfx_init 476Bh, at_sfx_play 477Fh с игровыми каналом/нотой/громкостью; запись до конца эффекта.
В JSON сохранены R0–R13 и фактические записи регистров, включая R13; renderR у эффектов глушит соседние каналы.

ВИ53: неизменные код и серии существующего build/xevious.rom, i8080-модель tools/vec/machine.js.
Заявки ставят plat_music_start / plat_sfx; шаг snd_frame выполняется раз в 60000 тактов процессора 3 МГц.
Журнал портов 08h–0Bh повторно проигрывается моделью ВИ53 vector06js с частотой 1,5 МГц.
Это изолированный запуск проигрывателя ROM, без игры, ISR и переходов между мелодиями.
Все выходные делители побайтно проверяются независимым декодером серий (бит 6, петли, общий PRNG).

Для фона и конца игры убран общий начальный пустой кадр, возникший при исходном покадровом захвате
vecsound.js; сдвиги сохранены в manifest.json. Высота, паузы, шум и задержки OUT отдельных каналов сохранены.
Записи AY действуют с начала кадра; портовый журнал ВИ53 имеет точность инструкции модели.
Номинальные 50 Гц выбраны для синхронизации, вместо аппаратных ~50,08 Гц Вектора.

Модель AY написана отдельно: 1 МГц, 12-битные периоды тона, 17-битный LFSR,
все 16 форм огибающей, микшер R7, приближённая логарифмическая шкала громкости из локального AY vector06js.
Таймеры/формы сверены с [исходником MAME](https://github.com/mamedev/mame/blob/master/src/devices/sound/ay8910.cpp).
Это цифровой рендер, без аналоговых трактов конкретных компьютеров; шкала громкости приближённая.
Усиление одинаковое, автоматической нормализации отдельных файлов нет. Четырёхкратная промежуточная частота,
FIR 18 кГц перед переходом к 44,1 кГц, одинаковое удаление DC (20 Гц); клиппинг запрещён проверкой.

Исходные регистры, журналы портов, счётчики проверок и SHA256 входов — в *_registers.json,
*_ports.json и manifest.json рядом с WAV. Все данные оригинала остаются только здесь, в игнорируемом build/.
`;
}

if (require.main === module) main();
module.exports = { stats };
