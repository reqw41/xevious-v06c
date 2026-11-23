#!/usr/bin/env node
'use strict';
// Независимый эталон панели из неизменного ROM, а не HUD_REC или изменяемого шрифта в RAM.
// node tools/vec/hudcheck.js [--god] [--seed 5] [--frames 120000] [--rom FILE --labels FILE]
// --legacy-god воспроизводит прежнюю порчу HUD_FONT; --trace HEX показывает последние записи по адресу.
// Без --god гибель сохраняется, жизни бесконечны (как F1+F3 на титуле).
const fs = require('fs');
const path = require('path');
const { Machine, hx } = require('./machine');
const { godPatch } = require('./god');
const ROOT = path.resolve(__dirname, '../..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
const frames = +arg('frames', 120000), initialSeed = +arg('seed', 5);
const rom = fs.readFileSync(arg('rom', path.join(ROOT, 'build/xevious.rom')));
const L = JSON.parse(fs.readFileSync(arg('labels', path.join(ROOT, 'build/xevious.json'))));
const m = new Machine();
m.loadROM(rom); m.profile = false; m.logPorts.clear();
if (process.argv.includes('--god') || process.argv.includes('--legacy-god')) {
  const n = godPatch(m, L);
  if (n !== 4) throw new Error(`godPatch: ${n} правок вместо 4`);
  if (process.argv.includes('--legacy-god')) {
    // Старый godPatch адресовал все четыре STA в первый байт HUD_FONT.
    for (let a = 0x100; a < 0x3c00; a++) {
      if (m.peek(a) === 0x32 && m.peek(a + 1) === 0x37 && m.peek(a + 2) === 0) {
        m.poke(a + 1, 0x34); m.poke(a + 2, 0x3f);
      }
    }
  }
} else {
  // Гибель и рестарт настоящие; NOP вместо DEC жизней позволяет пройти несколько зон.
  m.poke(L['p_death_seq.livd'], 0);
}
m.poke(L.title_skip, 1);
let seed = initialSeed;
const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
const keys = [['LEFT', 'SPACE', 'M'], ['RIGHT', 'SPACE', 'M'], ['SPACE', 'M'], ['UP', 'SPACE', 'M'], ['DOWN', 'SPACE'], ['SPACE', 'M']];
let scenario = '', f = 50;
while (f < frames) {
  const k = keys[(rnd() * keys.length) | 0], n = 10 + ((rnd() * 40) | 0);
  scenario += `${f}-${f + n} ${k.map(x => '+' + x).join(' ')}\n`; f += n + 1;
}
m.loadScenario(scenario);
const trace = [];
if (arg('trace', '')) m.watch(parseInt(arg('trace', ''), 16), (_, e) => {
  trace.push({ frame: m.frame, pc: hx(e.pc), value: hx(e.v, 2), vs: m.peek(L.vs_cur), cam: m.peek(L.CAM_Y) });
  if (trace.length > 24) trace.shift();
});
const byte = a => rom[a - 0x100];
const glyph = c => Array.from({ length: 7 }, (_, r) => byte(
  (typeof c === 'string' ? L.LETTERS + (c.charCodeAt(0) - 65) * 7 : L.HUD_FONT + c * 7) + r));
function expected() {
  const chars = Array(30).fill(10);
  for (let i = 0; i < Math.min(5, Math.max(0, m.peek(0x3d39) - 1)); i++) chars[3 + i] = 11;
  const LAB = new Set();                       // подписи — плоскость C (буквы, «1» в 1UP, знак рекорда 12)
  for (const [at, word] of [[0, [1, "U", "P"]], [16, [12]], [24, [...'AREA']]]) word.forEach((c, i) => { chars[at + i] = c; LAB.add(at + i); });
  for (const [addr, at] of [[0x3f24, 9], [0x3f21, 17]]) {
    for (let i = 0; i < 3; i++) { const b = m.peek(addr + i); chars[at + 2 * i] = b >> 4; chars[at + 2 * i + 1] = b & 15; }
  }
  const area = m.peek(0x3e5a) + 1;
  chars[28] = Math.floor(area / 10); chars[29] = area % 10;
  return chars.map((c, i) => {
    const rows = glyph(c), empty = Array(7).fill(0);
    return i >= 3 && i < 8 ? [c === 11 ? Array.from({ length: 7 }, (_, r) => byte(L.HUD_SHIPC + r)) : empty, rows]
      : LAB.has(i) ? [rows, empty] : [empty, rows];
  });
}
let checks = 0, draws = 0, updates = 0, failure = null, display = null, deaths = 0;
const zones = new Set(), scrolls = new Set(), returns = new Map();
// Фактический выход CALL по адресу возврата И глубине стека: прерывания могут вклиниваться в вывод.
function afterReturn(cb) {
  const sp = m.cpu.sp, ra = m.read(sp) | m.read(sp + 1) << 8;
  if (!returns.has(ra)) {
    returns.set(ra, []);
    m.addBreak(ra, () => {
      const queue = returns.get(ra);
      for (let i = queue.length - 1; i >= 0; i--) if (queue[i].sp === m.cpu.sp) queue.splice(i, 1)[0].cb();
      return !!failure;
    });
  }
  returns.get(ra).push({ sp: (sp + 2) & 0xffff, cb });
}
function check(stage) {
  if (!display || !m.peek(L.dnl_on)) return;
  checks++;
  const vs = m.peek(L.vs_cur);
  for (let i = 0; i < 30; i++) for (let p = 0; p < 2; p++) for (let r = 0; r < 8; r++) {
    const addr = (0xc000 + p * 0x2000 + (i + 1) * 256) | ((vs - L.HUD_Y - r) & 255);
    const want = r === 7 ? 0 : display[i][p][r], got = m.peek(addr);
    if (want !== got) {
      failure = { stage, frame: m.frame, updates, draws, area: m.peek(0x3e5a) + 1, vs, col: i + 1, row: r,
        addr: hx(addr), want: hx(want, 2), got: hx(got, 2), font0: hx(m.peek(L.HUD_FONT), 2), romFont0: hx(byte(L.HUD_FONT), 2),
        state: Object.fromEntries(['hud_req', 'hud_vs', 'lb_pend', 'su_now', 'band_n'].map(k => [k, m.peek(L[k])])) };
      return;
    }
  }
}
m.addBreak(L.hud_draw, () => {
  if (m.peek(L.hud_req) && m.peek(L.dnl_on)) {
    const image = expected();
    afterReturn(() => { display = image; draws++; zones.add(m.peek(0x3e5a) + 1); scrolls.add(m.peek(L.vs_cur)); });
  }
  return false;
});
// При lb_pend вывод ещё не закончен: vs_cur уже новый, а панель пока при hud_vs.
// Такое обновление проверяется после lb_out; обычное — после полного flush из wait_vsync.
m.addBreak(L.plat_wait_vsync, () => { updates++; afterReturn(() => { if (!m.peek(L.lb_pend)) { display = expected(); check('update'); } }); return false; });
m.addBreak(L.lb_out, () => { afterReturn(() => check('lb_out')); return false; });
m.addBreak(L.p_restart_life, () => { deaths++; display = null; return false; });
const result = m.runFrames(frames);
const summary = { seed: initialSeed, mode: process.argv.includes('--legacy-god') ? 'legacy-god' : process.argv.includes('--god') ? 'god' : 'death',
  frames: m.frame, updates, draws, checks, deaths: Math.max(0, deaths - 1), zones: [...zones], scrolls: scrolls.size, errors: failure ? 1 : 0 };
console.log(JSON.stringify({ ...summary, failure, ...(trace.length ? { trace } : {}) }));
if (!failure && (result.reason !== 'frame' || !draws || !checks)) throw new Error('hudcheck: прогон не проверил панель');
process.exitCode = failure ? 1 : 0;
