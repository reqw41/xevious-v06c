#!/usr/bin/env node
'use strict';
/**
 * Прогон образа на стенде с записью результатов в папку (для ворот детерминизма и сверок).
 *   node tools/vec/run.js (--rom F [--edd F] | --fdd F) [--frames N] [--scenario S] [--out DIR]
 *        [--hash-every K] [--shot-at a,b,..] [--shot-every K] [--profile] [--kvaz hw|loose] [--no-ay]
 * В DIR:
 *   frames.txt   кадр, такты с начала, PC, sha256 состояния (каждые K кадров и последний)
 *   ports.txt    журнал ВИ53/AY: кадр такт_в_кадре PC порт значение расшифровка
 *   profile.txt  (с --profile) адрес, такты, % — первые 200
 *   shot_NNNNNN.png  снимки поля после кадра NNNNNN
 *   final.json   регистры, такты, кадры, прерывания, ошибки ВГ93, хэш
 */
const fs = require('fs');
const path = require('path');
const { Machine, hx } = require('./machine');

function parse(argv) {
  const o = { frames: 100, hashEvery: 50, shotAt: [], shotEvery: 0, profile: false, kvaz: 'hw', ay: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], v = () => argv[++i];
    switch (a) {
      case '--rom': o.rom = v(); break;
      case '--edd': o.edd = v(); break;
      case '--fdd': o.fdd = v(); break;
      case '--frames': o.frames = +v(); break;
      case '--scenario': o.scenario = v(); break;
      case '--out': o.out = v(); break;
      case '--hash-every': o.hashEvery = +v(); break;
      case '--shot-at': o.shotAt = v().split(',').map(Number); break;
      case '--shot-every': o.shotEvery = +v(); break;
      case '--profile': o.profile = true; break;
      case '--kvaz': o.kvaz = v(); break;
      case '--no-ay': o.ay = false; break;
      default: throw new Error(`run.js: непонятный ключ ${a}`);
    }
  }
  if (!o.rom === !o.fdd) throw new Error('run.js: нужен ровно один из --rom/--fdd');
  return o;
}

function main() {
  const o = parse(process.argv.slice(2));
  const out = o.out || path.join(__dirname, '../../build/run');
  fs.mkdirSync(out, { recursive: true });
  const m = new Machine({ kvaz: o.kvaz, ay: o.ay });
  let bootFrames = 0;
  if (o.rom) m.loadROM(o.rom, { edd: o.edd || null });
  else bootFrames = m.bootFDD(o.fdd);
  if (o.scenario) m.loadScenario(o.scenario);
  m.profile = o.profile;
  const lines = [], shots = new Set(o.shotAt);
  const t0 = Date.now();
  let stop = null;
  for (let f = 0; f < o.frames; f++) {
    const r = m.runFrame();
    if (r.reason !== 'frame') { stop = r; break; }
    if ((o.hashEvery && m.frame % o.hashEvery === 0) || f === o.frames - 1) {
      lines.push(`${m.frame} ${m.cycles} ${hx(m.cpu.pc)} ${m.hash()}`);
    }
    if (shots.has(m.frame - 1) || (o.shotEvery && (m.frame - 1) % o.shotEvery === 0)) {
      m.shot(path.join(out, `shot_${String(m.frame - 1).padStart(6, '0')}.png`));
    }
  }
  const ms = Date.now() - t0;
  fs.writeFileSync(path.join(out, 'frames.txt'), lines.join('\n') + '\n');
  fs.writeFileSync(path.join(out, 'ports.txt'), m.portLogText());
  if (o.profile) {
    const tot = m.cycles || 1;
    fs.writeFileSync(path.join(out, 'profile.txt'), m.profileTop(200).map((e) =>
      `${e.pc === 'INT' ? 'INT ' : hx(e.pc)} ${e.t} ${(100 * e.t / tot).toFixed(3)}`).join('\n') + '\n');
  }
  const fin = { frames: m.frame, cycles: m.cycles, ints: m.ints, bootFrames, regs: m.regs, kvazPort: m.kvazPort,
    fddErrors: m.fddErrors, kvazLooseHits: m.kvazLooseHits, stop, hash: m.hash() };
  fs.writeFileSync(path.join(out, 'final.json'), JSON.stringify(fin, null, 1) + '\n');
  process.stderr.write(`run.js: ${m.frame} кадров за ${ms} мс (${(m.frame * 1000 / Math.max(ms, 1)).toFixed(0)} кадр/с), ` +
    `PC=${hx(m.cpu.pc)}${stop ? ' останов ' + stop.reason : ''} -> ${out}\n`);
}

main();
