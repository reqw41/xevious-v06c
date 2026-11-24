#!/usr/bin/env node
'use strict';
/**
 * Сборка образа Вектора build/xevious.rom (src/vec/game.asm):
 *   1) tools/i80build.js — таблицы CPC, наложение, логика для стендов;
 *   2) tools/vecdata.py — палитра, тайлы, карта (build/gen/vec_*.inc);
 *   3) tools/cpc/initstate.js — начальное состояние (build/gen/init_state.inc);
 *   4) заглушки входов платформы, которых нет в src/vec/*.asm (build/gen/plat_vec_stub.inc): снимают аргументы;
 *   5) сборка.
 *   node tools/vecbuild.js [--fast] [--splash16]   (--fast — только шаги 4–5; --splash16 — 16-цветная заставка)
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { build } = require('./vec/asm.js');
const ROOT = path.resolve(__dirname, '..');
const run = (cmd, args) => execFileSync(cmd, args, { cwd: ROOT, stdio: 'inherit' });
if (!process.argv.includes('--fast')) {
  run('node', ['tools/i80build.js']);
  run('python3', ['tools/vecdata.py']);
  run('node', ['tools/cpc/initstate.js']);
  run('node', ['tools/cpc/sprites.js']);
  run('node', ['tools/vecsprites.js']);
  run('node', ['tools/vecsound.js']);
  // заставка загрузчика: по умолчанию загрузочный экран CPC (4 цвета); --splash16 — своя 16-цветная (tools/vecsplash.py)
  if (process.argv.includes('--splash16') && fs.existsSync(path.join(ROOT, 'ref/splash/xevious_splash.png'))) run('python3', ['tools/vecsplash.py']);
  else fs.rmSync(path.join(ROOT, 'build/gen/splash.bin'), { force: true });
  run('node', ['tools/vectitle.js']);
  run('node', ['tools/vecmusic.js']);   // музыка заставки (ref/music, не в git; нет — без музыки)
}
run('node', ['tools/vecmsg.js']);
const PLAT = require(path.join(ROOT, 'src/model/platform.js'));
const have = new Set();
for (const f of fs.readdirSync(path.join(ROOT, 'src/vec'))) {
  if (!f.endsWith('.asm')) continue;
  for (const m of fs.readFileSync(path.join(ROOT, 'src/vec', f), 'utf8').matchAll(/^plat_(\w+):/gm)) have.add(m[1]);
}
let stub = '; заглушки платформы Вектора: одинаковые тела имеют общий адрес\n';
const todo = [], groups = new Map();
for (const e of PLAT.entries) {
  if (have.has(e.name)) continue;
  todo.push(e.name);
  let words = 0;
  for (const k of e.args) { const m = /^[sb](\d)$/.exec(k); if (m) words = Math.max(words, k[0] === 's' ? +m[1] + 1 : (+m[1] >> 1) + 1); }
  const bytes = e.pop !== undefined ? e.pop : 2 * words;
  const body = !bytes ? '\tret\n' : '\tpop\thl\n' + '\tpop\tde\n'.repeat(bytes >> 1) + (bytes & 1 ? '\tinc\tsp\n' : '') + '\tjp\t(hl)\n';
  if (!groups.has(body)) groups.set(body, []);
  groups.get(body).push(e.name);
}
for (const [body, names] of groups) stub += names.map(n => 'plat_' + n + ':\n').join('') + body;
fs.writeFileSync(path.join(ROOT, 'build/gen/plat_vec_stub.inc'), stub);
const { img, labels, list } = build(path.join(ROOT, 'src/vec/game.asm'), { base: 0x100 });
// самоизменяемые операнды — как у CPC перед первой жизнью (tools/cpc/initstate.js): прямо в образ
for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(path.join(ROOT, 'build/gen/init_sm.json'), 'utf8')))) {
  if (labels[k] === undefined) throw new Error(`нет метки ${k}`);
  img[labels[k] - 0x100] = v;
}
const out = path.join(ROOT, 'build/xevious.rom');
fs.writeFileSync(out, img);
fs.writeFileSync(out.replace(/\.rom$/, '.json'), JSON.stringify(labels, null, 1));
fs.writeFileSync(out.replace(/\.rom$/, '.lst'), list + '\n');
const H = (v) => v.toString(16).toUpperCase().padStart(4, '0');
console.log(`фон спрайтов: ${labels.POOL_END - labels.POOL} Б; xevious.rom: ${img.length} Б (0100h–${H(0x100 + img.length - 1)}h), код до ${H(labels.msgfast_end || labels.INIT_SM_END)}h; ` +
  `платформа: сделано ${have.size}, заглушек ${todo.length}`);
// релизный образ для эмуляторов (Emu80, vector06js): сжатая игра + заставка, загрузка с 0100h (tools/vecboot.js);
// build/xevious.rom — несжатый образ для стендов
run('node', ['tools/vecboot.js']);
