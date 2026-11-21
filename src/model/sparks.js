'use strict';
// Сбиваемые снаряды (5 слотов s): состояние 3EEBh+s (1..3 — летит, FEh/FFh — снять), шаг по X 3EF0h+s,
// X 3ED7h+2s+экран, Y 3EE1h+2s+экран; буферы фона 03D3h+4s+2·экран. Летят вниз на 8 за шаг.
const core = require('./core.js');
const V = {
  buf_back: 0x3e51, buf_front: 0x3e52, cam_y: 0x3e4c, cam_neg: 0x3f28, player_hit: 0x3f1b,
  player_x: 0x3d4d, player_y: 0x3d4f, shot_x: 0x3d53, shot_y: 0x3d5b, shot_st: 0x3d63,
  s_st: 0x3eeb, s_dx: 0x3ef0, s_x: 0x3ed7, s_y: 0x3ee1, s_bufs: 0x03d3,
};

// spawn_sparks 1878h (раз в 8 строк, только при переднем экране 1): верх поля, X случайный, шаг −2/0/+2
function spawnSparks(m) {
  if (!m.rd(V.buf_front)) return;
  let s = 0;
  while (m.rd(V.s_st + s)) if (++s === 5) return;
  m.wr(V.s_st + s, m.rd(V.s_st + s) + 1);
  m.wr(V.s_y + 2 * s + 1, m.rd(V.cam_y));
  m.wr(V.s_x + 2 * s + 1, (core.rnd(m, 7) * 16 + 8) & 0xff);
  let v = ((core.rnd(m, 3) - 1) * 2) & 0xff;
  if (v === 4) v = 0;
  m.wr(V.s_dx + s, v);
}

// erase_sparks 2A91h: стереть (s = 4..0), попадание в игрока (3×7), сбит ли выстрелом (+50)
function eraseSparks(m) {
  const b = m.rd(V.buf_back);
  for (let s = 4; s >= 0; s--) {
    const sa = V.s_st + s;
    if (!m.rd(sa)) continue;
    const x = m.rd(V.s_x + 2 * s + b), y = m.rd(V.s_y + 2 * s + b);
    if (m.rd(sa) >= 3) m.plat('restore_2x6', { a: x, l: y, s0: m.rd16(V.s_bufs + 4 * s + 2 * b) });
    if (!m.rd(V.player_hit)) m.wr(V.player_hit, core.hitPlayer(m, x, y, 3, 7, m.rd(V.player_x + b), m.rd(V.player_y + b)));
    for (let i = 0; i < 4; i++) {
      if (m.rd(V.shot_st + i) !== 3 || m.rd(sa) >= 0xfd) continue;
      if (!core.hit16(m, x, y, m.rd(V.shot_x + 2 * i + b), m.rd(V.shot_y + 2 * i + b))) continue;
      m.wr(sa, 0xfe); m.wr(V.shot_st + i, 0xfe);
      m.plat('sfx', { d: 0x02, hl: 0x0f04, e: 0x40 });
      core.addScore(m, 2, 5);
      break;
    }
  }
}

// upd_sparks 2B5Bh: шаг (dX, +8 по Y), уход за края — FEh, вывод
function updSparks(m) {
  const b = m.rd(V.buf_back), f = m.rd(V.buf_front);
  for (let s = 0; s < 5; s++) {
    const sa = V.s_st + s, st = m.rd(sa);
    if (!st) continue;
    if (st >= 0xfe) { m.wr(sa, st + 1); continue; }
    const xf = m.rd(V.s_x + 2 * s + f), yf = m.rd(V.s_y + 2 * s + f);
    if (xf < 2 || xf >= 0x7b || ((m.rd(V.cam_neg) + yf) & 0xff) >= 0xe1) { m.wr(sa, 0xfe); continue; }
    if (st < 3) m.wr(sa, st + 1);
    const x = (m.rd(V.s_dx + s) + xf) & 0xff, y = (yf + 8) & 0xff;
    m.wr(V.s_x + 2 * s + b, x); m.wr(V.s_y + 2 * s + b, y);
    m.plat('draw_spark', { a: x, l: y, s0: m.rd16(V.s_bufs + 4 * s + 2 * b) });
  }
}

module.exports = {
  V, spawnSparks, eraseSparks, updSparks,
  procs: [
    { at: 0x1878, name: 'spawn_sparks', fn: (m) => { spawnSparks(m); } },
    { at: 0x2a91, name: 'erase_sparks', fn: (m) => { eraseSparks(m); } },
    { at: 0x2b5b, name: 'upd_sparks', fn: (m) => { updSparks(m); } },
  ],
};
