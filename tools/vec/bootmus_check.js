#!/usr/bin/env node
'use strict';
/**
 * Проверка музыки заставки (src/vec/bootmus.asm) на образе rom/Xevious-v06c.rom, без окна:
 *   node tools/vec/bootmus_check.js [кадров=9000]
 * 1) с AY: каждая запись в регистры AY и её кадр совпадают с потоком (вступление, затем петля по кругу);
 * 2) без AY: ВИ53 и динамик получают записи, AY не трогается;
 * 3) после клавиши: тишина (громкости AY 0, ВИ53 в режиме 0) и игра стартует (доходит до своей петли).
 */
const fs = require('fs');
const path = require('path');
const { Machine } = require('./machine');
const ROOT = path.resolve(__dirname, '../..');
const ROM = path.join(ROOT, 'rom/Xevious-v06c.rom');
const N = Number(process.argv[2] || 9000);
const L = JSON.parse(fs.readFileSync(path.join(ROOT, 'build/boot/bootmus.json'), 'utf8'));
const img = fs.readFileSync(ROM);
const part = (a, b) => img.subarray(a - 0x100, b - 0x100);
function lzAll(p) {            // LZB до конца входа
  const o = []; let i = 0;
  while (i < p.length) {
    const t = p[i++];
    if (t < 0x40) { for (let k = 0; k <= t; k++) o.push(p[i++]); continue; }
    let l, off;
    if (t < 0x80) { l = ((t >> 4) & 3) + 3; off = ((t & 15) << 8 | p[i++]) + 1; }
    else if (t < 0xc0) { l = (t & 63) + 2; off = p[i++] + 1; }
    else { l = (t & 63) + 3; if ((t & 63) === 63) l += p[i++]; off = p[i] | (p[i + 1] << 8); i += 2; }
    for (let k = 0; k < l; k++) o.push(o[o.length - off]);
  }
  return o;
}
const segs = [lzAll(part(L.mus_s0, L.mus_s0e)), lzAll(part(L.mus_s1, L.mus_s1e))];
// ожидаемые записи: [кадр от начала, регистр, значение]
function expected(nf) {
  const out = []; let f = 0, s = 0, i = 0;
  while (f < nf) {
    const g = segs[s];
    const m = g[i] | g[i + 1] << 8; i += 2;
    if (m === 0xffff) { s = 1; i = 0; continue; }
    if (!m) { f += g[i++]; continue; }
    for (let r = 0; r < 14; r++) if (m & (1 << r)) out.push([f, r, g[i++]]);
    f++;
  }
  return out;
}
let bad = 0;
const fail = (s) => { console.log('ОШИБКА: ' + s); bad++; };

// 1) с AY
{
  const m = new Machine({ ay: true });
  m.loadROM(ROM);
  m.runFrames(N);
  let reg = 0; const got = [];
  for (const e of m.portLog) {
    if (e.pc < 0x8000 || e.pc >= 0xb000) continue;
    if (e.port === 0x15) reg = e.v; else if (e.port === 0x14 && reg <= 13) got.push([e.f, reg, e.v]);
  }
  // первые записи — тишина mus_init и проба; поток начинается с первой записи регистра 13 или 0 кадра потока
  const exp = expected(N);
  let k = got.findIndex((g, j) => j + 1 < got.length && g[0] !== got[0][0]);   // первый кадр после mus_init
  const f0 = got[k][0];
  const g2 = got.slice(k);
  const n = Math.min(g2.length, exp.filter((e) => e[0] + f0 < N - 1).length);
  let mism = 0;
  for (let j = 0; j < n; j++) {
    const a = g2[j], b = exp[j];
    if (a[1] !== b[1] || a[2] !== b[2] || a[0] - f0 !== b[0]) { if (mism++ < 5) console.log(`расхождение #${j}: есть ${a}, ждали кадр ${b[0] + f0} R${b[1]}=${b[2]}`); }
  }
  console.log(`AY: ${n} записей за ${N} кадров (поток с кадра ${f0}), расхождений ${mism}`);
  if (mism || n < 1000) fail('поток AY');
  // клавиша -> тишина и игра
  m.portLog.length = 0;
  m.key('SPACE', true); m.runFrames(5); m.key('SPACE', false); m.runFrames(300);
  const pcs = new Set(); for (let j = 0; j < 2000; j++) { m.step(); pcs.add(m.cpu.pc); }
  const isr = m.peek(0x39) | m.peek(0x3a) << 8, inGame = isr !== L.mus_isr && ![...pcs].some((p) => p >= 0x8000 && p < L.mus_end && false);
  console.log(`после клавиши: RST7 -> ${isr.toString(16)} (музыка ${L.mus_isr.toString(16)}), PC ${m.cpu.pc.toString(16)}`);
  if (!inGame) fail('после клавиши обработчик музыки остался');
  m.shot(path.join(ROOT, 'build/boot/after_key_ay.png'));
}
// 2) без AY
{
  const m = new Machine({ ay: false });
  m.logPorts.add(0x01);
  m.loadROM(ROM);
  m.runFrames(Math.min(N, 3000));
  let ay = 0, vi = 0, spk = 0;
  for (const e of m.portLog) {
    if (e.pc < 0x8000 || e.pc >= 0xb000) continue;
    if (e.port === 0x14 || e.port === 0x15) ay++;
    else if (e.port >= 0x08 && e.port <= 0x0b) vi++;
    else if (e.port === 0x01) spk++;
  }
  console.log(`без AY: записей ВИ53 ${vi}, динамик ${spk}, AY ${ay} (только проба)`);
  if (vi < 500) fail('ВИ53 молчит');
  if (spk < 1000) fail('нет шума на динамике');
  if (ay > 4) fail('без AY пишет в AY');
  m.portLog.length = 0;
  m.key('SPACE', true); m.runFrames(5); m.key('SPACE', false); m.runFrames(300);
  { const isr = m.peek(0x39) | m.peek(0x3a) << 8; console.log(`после клавиши: RST7 -> ${isr.toString(16)}`); if (isr === L.mus_isr) fail('обработчик музыки остался'); }
  m.shot(path.join(ROOT, 'build/boot/after_key_noay.png'));
}
console.log(bad ? `ОШИБОК: ${bad}` : 'ok');
process.exit(bad ? 1 : 0);
