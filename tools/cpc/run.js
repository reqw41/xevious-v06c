#!/usr/bin/env node
// Прогон Xevious на модели CPC 6128 без окна.
//   node tools/cpc/run.js [--frames N] [--hold "с-по:КЛАВИША+КЛАВИША,..."] [--shots "кадр,..."]
//        [--every N --from F] [--out каталог] [--dump "кадр,..."] [--log]
// Снимки — PNG полного растра 384x312 (точки MODE 1); --dump — 128 КБ ОЗУ + состояние в .bin/.json.
'use strict';
const fs = require('fs');
const path = require('path');
const CPC = require('./cpc6128.js');
const png = require('./png.js');
const ROOT = path.resolve(__dirname, '../..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
const flag = (k) => process.argv.includes('--' + k);
const FRAMES = +arg('frames', 600);
const OUT = arg('out', path.join(ROOT, 'ref/cpc/jsnaps'));
const shots = new Set((arg('shots', '') || '').split(',').filter(Boolean).map(Number));
const dumps = new Set((arg('dump', '') || '').split(',').filter(Boolean).map(Number));
const EVERY = +arg('every', 0), FROM = +arg('from', 0);
const holds = (arg('hold', '') || '').split(',').filter(Boolean).map((s) => {
  const [r, k] = s.split(':'); const [a, b] = r.split('-').map(Number); return { a, b, keys: k.split('+') };
});
fs.mkdirSync(OUT, { recursive: true });
const m = new CPC(path.join(ROOT, 'ref/cpc/xevious.dsk'));
const unknown = new Set();
m.onUnknownCall = (pc) => { if (!unknown.has(pc)) { unknown.add(pc); console.log('неизвестный вызов прошивки', pc.toString(16)); } };
if (flag('log')) m.onCas = (op, name, f, hl) => console.log('кадр', m.frames, op, name, f ? `len=${f.data.length}` : 'НЕТ', hl !== undefined ? 'в ' + hl.toString(16) + ' cfg C' + m.cfg : '');
m.boot('disc.bin');
const t0 = Date.now();
m.onFrame = (f) => {
  const down = [];
  for (const h of holds) if (f >= h.a && f < h.b) down.push(...h.keys);
  m.keysOnly(down);
  // снимок прошлого кадра (m.last) — он уже целиком выведен
  if (shots.has(f) || (EVERY && f >= FROM && (f - FROM) % EVERY === 0)) {
    fs.writeFileSync(path.join(OUT, `f${String(f).padStart(5, '0')}.png`), png(CPC.FB_W, CPC.FB_H, m.last));
  }
  if (dumps.has(f)) {
    fs.writeFileSync(path.join(OUT, `f${f}.ram`), m.ram);
    fs.writeFileSync(path.join(OUT, `f${f}.json`), JSON.stringify({ pc: m.pc, cfg: m.cfg, mode: m.mode, pens: [...m.pens], crtc: [...m.crtc] }));
  }
};
m.runFrames(FRAMES);
console.log(`кадров ${m.frames}, ${((Date.now() - t0) / 1000).toFixed(1)} с, pc=${m.pc.toString(16)} cfg=C${m.cfg} crtc R1=${m.crtc[1]} R4=${m.crtc[4]} R6=${m.crtc[6]} R7=${m.crtc[7]} R12/13=${m.crtc[12].toString(16)}/${m.crtc[13].toString(16)}`);
