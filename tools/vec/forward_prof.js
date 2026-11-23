#!/usr/bin/env node
'use strict';
// Read-only census for CODEX_TEMPO step 14. The scheduling estimate assumes
// free snapshots, zero switch cost and instruction-level render preemption.
// It is an optimistic model of this trace, not a playable implementation.
// node tools/vec/forward_prof.js [--seed 7] [--frames 8000] [--mortal] [--json FILE]
const fs = require('fs');
const path = require('path');
const { Machine, FRAME_CYCLES: F } = require('./machine');
const { godPatch } = require('./god');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
const ROOT = path.resolve(__dirname, '../..');
const L = JSON.parse(fs.readFileSync(arg('labels', path.join(ROOT, 'build/xevious.json'))));
const m = new Machine();
m.loadROM(arg('rom', path.join(ROOT, 'build/xevious.rom')));
m.profile = false;
m.poke(L.title_skip, 1);
if (!process.argv.includes('--mortal')) godPatch(m, L);
const frames = +arg('frames', 8000), initialSeed = +arg('seed', 7);
let seed = initialSeed;
const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
const keys = [['LEFT', 'SPACE'], ['RIGHT', 'M'], ['UP', 'SPACE', 'M'], ['DOWN', 'M'], ['SPACE', 'M'], ['LEFT'], ['RIGHT'], ['UP'], ['DOWN'], []];
let scenario = '', f = 200;
while (f < frames) {
  const k = keys[(rnd() * keys.length) | 0], n = 5 + ((rnd() * 30) | 0);
  if (k.length) scenario += `${f}-${f + n} ${k.map(x => '+' + x).join(' ')}\n`;
  f += n + 1;
}
m.loadScenario(scenario);
const queue = { max: 0, normalMax: 0, flushes: 0, full: 0, histogram: {} };
let wait = null, prev = null, render = null, normal = false;
const rows = [];
m.addBreak(L.q_push, () => {
  const n = (m.read16(L.qptr) - L.QUEUE) / 5 + 1;
  if (!Number.isInteger(n) || n < 1 || n > L.QMAX) throw new Error(`Invalid queue size ${n}`);
  queue.max = Math.max(queue.max, n);
  return false;
});
m.addBreak(L.flush, () => {
  const n = (m.read16(L.qptr) - L.QUEUE) / 5;
  queue.flushes++;
  if (n === L.QMAX) queue.full++;
  if (m.frame > 400) {
    queue.normalMax = Math.max(queue.normalMax, n);
    queue.histogram[n] = (queue.histogram[n] || 0) + 1;
  }
  return false;
});
m.addBreak(L.plat_wait_vsync, () => {
  wait = m.cycles;
  const sp = m.cpu.sp, ra = m.read16(sp);
  normal = ra === L.p_main_loop + 3;
  if (!normal) prev = null;
  // A fixed normal-loop return address avoids observing nested life-reset waits.
  if (ra === L.p_main_loop + 3 && !m.breaks.has(ra)) m.addBreak(ra, () => {
    const ready = m.cycles;
    if (render !== null && prev !== null && m.frame > 400) {
      rows.push({ logic: wait - prev, output: ready - render, wait: render - wait });
    }
    prev = ready;
    return false;
  });
  return false;
});
m.addBreak(L['plat_wait_vsync.late'], () => { render = normal ? m.cycles : null; return false; });
m.runFrames(frames);
const mean = a => a.reduce((s, n) => s + n, 0) / Math.max(a.length, 1);
// Output i releases no earlier than two frames after output i-1. During that
// wait we can compute at most logic i+1; output preempts it without any cost.
let time = 0, progress = 0, wasted = 0, serial = 0;
for (let i = 1; i + 1 < rows.length; i++) {
  const output = rows[i - 1].output;
  serial += Math.max(2 * F, output + rows[i].logic);
  const readyAt = time + output + Math.max(0, rows[i].logic - progress);
  const outputAt = Math.max(readyAt, time + 2 * F);
  progress = Math.min(rows[i + 1].logic, outputAt - readyAt);
  wasted += outputAt - readyAt - progress;
  time = outputAt;
}
const sum = rows.map(r => r.logic + r.output + r.wait);
const result = {
  seed: initialSeed, frames, updates: rows.length, queue,
  cycles: { logic: mean(rows.map(r => r.logic)), output: mean(rows.map(r => r.output)),
    outputMax: Math.max(...rows.map(r => r.output)), wait: mean(rows.map(r => r.wait)) },
  framesPerUpdate: { actual: mean(sum) / F, compute: mean(rows.map(r => r.logic + r.output)) / F,
    modelSerial: serial / Math.max(1, rows.length - 2) / F,
    idealOneAhead: time / Math.max(1, rows.length - 2) / F,
    idealIdle: wasted / Math.max(1, rows.length - 2) / F,
    modelGainPercent: 100 * (serial - time) / serial },
  memory: { pool: L.POOL_END - L.POOL, poolAbove840: L.POOL_END - L.POOL - 840,
    queueBytes: L.QUEUE_END - L.QUEUE,
    gaps: { main: 0x3c00 - L.INIT_SM_END, low: 0x3ce9 - L.lo_end,
      high: 0x4000 - L.hi_end, map: L.TILES_AT - L.map_end, tiles: L.TILEMAP_AT - L.hud_end } },
};
console.log(JSON.stringify(result, null, 2));
if (arg('json', '')) fs.writeFileSync(arg('json'), JSON.stringify({ ...result, rows }, null, 2) + '\n');
