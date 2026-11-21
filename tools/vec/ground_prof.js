#!/usr/bin/env node
'use strict';
// Перепись вывода без изменения команд ROM, растра и обработчиков прерывания.
// node tools/vec/ground_prof.js [--seed 7] [--frames 8000] [--mortal] [--verify]
// Либо lockvec.js --ground-prof file.json (те же входы, что у CPC).
// rawSame: та же картинка и X/Y мира; same: также те же видимые строки/столбцы;
// fullSame: дополнительно полная высота и clip_base=16 в обоих обновлениях.
// Это верхняя оценка: перекрытия, отметки и расходы будущего кеша НЕ исключены.
const fs = require('fs');
const path = require('path');
const { Machine, FRAME_CYCLES } = require('./machine');
const { godPatch } = require('./god');
const ROOT = path.resolve(__dirname, '../..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
function attachGroundProfile(m, L) {
  if (m.peek(L.isr_sound - 1) !== 0xc9) throw new Error('Expected ISR RET before isr_sound');
  const hooks = new Map();
  function hook(pc, fn) {
    if (!Number.isInteger(pc)) throw new Error('Missing label for hook');
    if (!hooks.has(pc)) {
      hooks.set(pc, []);
      m.addBreak(pc, () => { for (const cb of hooks.get(pc)) cb(); return false; });
    }
    hooks.get(pc).push(fn);
  }
  // Такты Вектора: вход в прерывание 16, RET 12. Исключаем всё прерывание,
  // включая JP из 0038h; звук в основном коде в замер draw/erase не попадает.
  let irqStart = 0, irqTicks = 0;
  hook(0x38, () => { irqStart = m.cycles - 16; });
  hook(L.isr_sound - 1, () => { irqTicks += m.cycles + 12 - irqStart; });
  const clock = () => m.cycles - irqTicks;
  const procs = Object.entries(L).filter(([n]) => /^p_[^.]+$/.test(n)).sort((a, b) => a[1] - b[1]);
  function caller(pc) {
    for (let i = procs.length - 1; i >= 0; i--) if (procs[i][1] <= pc) return procs[i][0];
    return 'startup';
  }
  const slots = { p_upd_ground_tiles: 'GI', p_upd_tabobj: 'TK', p_upd_z23: 'ZW', p_upd_z48: 'ZW' };
  const kinds = { 1: 'SPR', 2: 'TILE', 3: 'GND', 4: 'MARK' };
  const queued = new Map(), owners = new Map(), previous = new Map(), stats = {};
  let upd = 0, flush = 0, firstCycle = null, lastCycle = 0, active = null, erase = null;
  let ordinal = new Map();
  hook(L.p_main_loop, () => {
    upd++;
    if (firstCycle === null) firstCycle = m.cycles;
    lastCycle = m.cycles;
  });
  hook(L.flush, () => { flush++; ordinal = new Map(); });
  hook(L.q_push, () => {
    const r = m.regs, source = caller(m.read16(r.sp) - 3), kind = kinds[r.a];
    const slot = slots[source] ? m.peek(L[slots[source]]) : m.read16(r.sp);
    const id0 = `${source}:${slot}:${kind}`, n = ordinal.get(id0) || 0;
    ordinal.set(id0, n + 1);
    const e = { source, kind, id: `${id0}:${n}`, image: r.h << 8 | r.l, x: m.peek(L.qx), y: m.peek(L.qy), draw: 0, unroll: 0, erase: 0, erUnroll: 0 };
    const group = `${source}/${kind}`;
    if (!stats[group]) stats[group] = { queued: 0, draws: 0, visible: 0, rawSame: 0, same: 0, fullSame: 0, draw: 0, unroll: 0, erase: 0, erUnroll: 0, rawSameDraw: 0, rawSameErase: 0, sameDraw: 0, sameErase: 0, fullSameDraw: 0, fullSameErase: 0 };
    e.stat = stats[group]; e.stat.queued++;
    queued.set(m.read16(L.qptr), e);
  });
  // Перехваты возврата учитывают и ранний выход при отсечении всего спрайта.
  const returns = new Set();
  function returning(ra) {
    if (returns.has(ra)) return;
    returns.add(ra);
    hook(ra, () => {
      if (active && m.cpu.sp === active.sp + 2) {
        const e = active.e, s = e.stat;
        e.draw = clock() - active.time;
        e.flush = flush;
        e.sig = [e.image, e.x, e.y, e.col, e.row, e.h, e.nb, e.k].join(':');
        const prev = previous.get(e.id);
        e.rawSame = !!(e.visible && prev && prev.flush === flush - 1 && prev.image === e.image && prev.x === e.x && prev.y === e.y);
        e.same = !!(e.rawSame && prev.sig === e.sig);
        e.fullSame = !!(e.same && e.h === m.peek(e.image + 1) && e.k === 0 && e.clip === 16 && prev.clip === 16);
        s.draws++; s.draw += e.draw; s.unroll += e.unroll;
        if (e.visible) s.visible++;
        if (e.rawSame) { s.rawSame++; s.rawSameDraw += e.draw; }
        if (e.same) { s.same++; s.sameDraw += e.draw; }
        if (e.fullSame) { s.fullSame++; s.fullSameDraw += e.draw; }
        if (m.read16(L.pool_ptr) !== active.pool) owners.set(active.pool, e);
        previous.set(e.id, e);
        active = null;
      }
      if (erase && m.cpu.sp === erase.sp + 2) {
        const e = erase.e;
        if (e) {
          e.erase += clock() - erase.time;
          const s = e.stat;
          s.erase += e.erase; s.erUnroll += e.erUnroll;
          if (e.rawSame) s.rawSameErase += e.erase;
          if (e.same) s.sameErase += e.erase;
          if (e.fullSame) s.fullSameErase += e.erase;
        }
        erase = null;
      }
    });
  }
  hook(L.draw_img, () => {
    const r = m.regs, q = m.read16(r.sp + 2) - 5, e = queued.get(q);
    if (!e || e.image !== (r.h << 8 | r.l) || e.x !== m.peek(L.qx) || e.y !== m.peek(L.qy)) throw new Error('Queue attribution mismatch');
    e.clip = m.peek(L.clip_base);
    active = { e, sp: r.sp, time: clock(), pool: m.read16(L.pool_ptr) };
    returning(m.read16(r.sp));
  });
  hook(L['draw_img.go'], () => {
    const e = active.e;
    e.visible = true;
    for (const [n, l] of [['col', 'di_col'], ['row', 'di_row'], ['h', 'di_h'], ['nb', 'di_nbv'], ['k', 'di_k']]) e[n] = m.peek(L[l]);
  });
  hook(L.erase_rec, () => {
    const r = m.regs, pool = r.h << 8 | r.l;
    erase = { e: owners.get(pool), sp: r.sp, time: clock() };
    owners.delete(pool);
    returning(m.read16(r.sp));
  });
  for (const name of ['draw_img.cc', 'draw_img.ce', 'erase_rec.c1', 'erase_rec.c2']) {
    let t = 0;
    hook(L[name], () => { t = clock(); });
    hook(L[name] + 3, () => {
      if (name.startsWith('draw')) active.e.unroll += clock() - t - 24;
      else if (erase.e) erase.e.erUnroll += clock() - t - 24;
    });
  }
  return () => {
    const span = lastCycle - firstCycle, round = n => +n.toFixed(3);
    const rows = Object.entries(stats).map(([source, s]) => ({ source, ...s, perUpdate: round(s.queued / upd), rawSamePerUpdate: round(s.rawSame / upd), samePerUpdate: round(s.same / upd), fullSamePerUpdate: round(s.fullSame / upd), costPerUpdate: round((s.draw + s.erase) / upd), rawSameCostPerUpdate: round((s.rawSameDraw + s.rawSameErase) / upd), sameCostPerUpdate: round((s.sameDraw + s.sameErase) / upd), fullSameCostPerUpdate: round((s.fullSameDraw + s.fullSameErase) / upd), rawCeilingPercent: round(100 * (s.rawSameDraw + s.rawSameErase) / span), ceilingPercent: round(100 * (s.sameDraw + s.sameErase) / span) })).sort((a, b) => b.costPerUpdate - a.costPerUpdate);
    return { updates: upd, spanCycles: span, cyclesPerUpdate: round(span / Math.max(upd - 1, 1)), framesPerUpdate: round(span / Math.max(upd - 1, 1) / FRAME_CYCLES), rows };
  };
}

function main() {
  const frames = +arg('frames', 8000), seed = +arg('seed', 7);
  const L = JSON.parse(fs.readFileSync(arg('labels', ROOT + '/build/xevious.json')));
  const m = new Machine();
  const setup = machine => {
    machine.loadROM(arg('rom', ROOT + '/build/xevious.rom'));
    if (!process.argv.includes('--mortal')) godPatch(machine, L);
    machine.poke(L.title_skip, 1);
  };
  setup(m);
  let rng = seed;
  const rnd = () => { rng = (rng * 1103515245 + 12345) >>> 0; return rng / 4294967296; };
  const keys = [['LEFT', 'SPACE'], ['RIGHT', 'M'], ['UP', 'SPACE', 'M'], ['DOWN', 'M'], ['SPACE', 'M'], ['LEFT'], ['RIGHT'], ['UP'], ['DOWN'], []];
  let scenario = '100-110 +JA.FIRE1\n';
  for (let f = 200; f < frames;) {
    const k = keys[(rnd() * keys.length) | 0], n = 5 + ((rnd() * 30) | 0);
    if (k.length) scenario += `${f}-${f + n} ${k.map(x => '+' + x).join(' ')}\n`;
    f += n + 1;
  }
  m.loadScenario(scenario);
  const report = attachGroundProfile(m, L);
  m.runFrames(frames);
  let verified;
  if (process.argv.includes('--verify')) {
    const plain = new Machine();
    setup(plain);
    plain.loadScenario(scenario);
    plain.runFrames(frames);
    verified = plain.hash() === m.hash();
    if (!verified) throw new Error('Instrumentation changed machine state');
  }
  console.log(JSON.stringify({ seed, god: !process.argv.includes('--mortal'), frames, verified, ...report() }, null, 2));
}
module.exports = { attachGroundProfile };
if (require.main === module) main();
