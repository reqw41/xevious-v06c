'use strict';
// Пули врагов (12 слотов j): состояние 3DD0h+j (0 — свободен, 1..3 — летит, FFh — стереть), шаг dX 3DDCh+j,
// dY 3DE8h+j; X 3DA0h+2j+экран, Y 3DB8h+2j+экран; буферы фона 018Bh+4j+2·экран. И бомба игрока (3E21h).
const core = require('./core.js');
const V = {
  buf_back: 0x3e51, buf_front: 0x3e52, cam_y: 0x3e4c, stop: 0x3f1c, player_hit: 0x3f1b,
  player_x: 0x3d4d, player_y: 0x3d4f,
  b_st: 0x3dd0, b_x: 0x3da0, b_y: 0x3db8, b_dx: 0x3ddc, b_dy: 0x3de8, b_bufs: 0x018b,
  bomb_x: 0x3e1d, bomb_y: 0x3e1f, bomb_st: 0x3e21, bomb_bufs: 0x01bb,
};

// erase_bullets 2288h: стереть (слоты 11..0), попадание в игрока (окно 2×4 от пули), FFh -> 0
function eraseBullets(m) {
  const b = m.rd(V.buf_back);
  for (let j = 11; j >= 0; j--) {
    const st = m.rd(V.b_st + j);
    if (st < 3) continue;
    const x = m.rd(V.b_x + 2 * j + b), y = m.rd(V.b_y + 2 * j + b);
    m.plat('restore_small', { a: x, l: y, s0: m.rd16(V.b_bufs + 4 * j + 2 * b) });
    const px = (m.rd(V.player_x + b) + 1) & 0xff, py = (m.rd(V.player_y + b) + 1) & 0xff;
    if (core.hitPlayer(m, x, y, 2, 4, px, py) && !m.rd(V.player_hit)) m.wr(V.player_hit, 1);
    if (st === 0xff) m.wr(V.b_st + j, 0);
  }
}

// upd_bullets 2307h: шаг, уход за края поля, вывод
function updBullets(m) {
  const b = m.rd(V.buf_back), f = m.rd(V.buf_front);
  for (let j = 0; j < 12; j++) {
    const st = m.rd(V.b_st + j);
    if (!st) continue;
    const xf = m.rd(V.b_x + 2 * j + f);
    if (xf < 6 || xf >= 0x79 || ((m.rd(V.b_y + 2 * j + f) - m.rd(V.cam_y)) & 0xff) >= 0xe1) { m.wr(V.b_st + j, 0xff); continue; }
    if (st < 3) m.wr(V.b_st + j, st + 1);
    const y = (m.rd(V.b_dy + j) + m.rd(V.b_y + 2 * j + f)) & 0xff;
    m.wr(V.b_y + 2 * j + b, y);
    const x = (m.rd(V.b_dx + j) + m.rd(V.b_x + 2 * j + f)) & 0xff;
    m.wr(V.b_x + 2 * j + b, x);
    m.plat('draw_bullet', { a: x, l: y, s0: m.rd16(V.b_bufs + 4 * j + 2 * b) });
  }
}

// upd_bomb 1DA6h: полёт бомбы 15 шагов (вверх на 5 за шаг, с картой), на 10h — FFh (стереть)
function updBomb(m) {
  const st = m.rd(V.bomb_st);
  if (!st) return;
  if (st === 0x10) { m.wr(V.bomb_st, 0xff); return; }
  m.wr(V.bomb_st, st + 1);
  const b = m.rd(V.buf_back), f = m.rd(V.buf_front);
  const y = (m.rd(V.stop) + m.rd(V.bomb_y + f) - 5) & 0xff;
  m.wr(V.bomb_y + b, y);
  const x = m.rd(V.bomb_x + f);
  m.wr(V.bomb_x + b, x);
  m.plat('draw_bomb', { a: x, l: y, s0: m.rd16(V.bomb_bufs + 2 * b) });
}

module.exports = {
  V, eraseBullets, updBullets, updBomb,
  procs: [
    { at: 0x2288, name: 'erase_bullets', fn: (m) => { eraseBullets(m); } },
    { at: 0x2307, name: 'upd_bullets', fn: (m) => { updBullets(m); } },
    { at: 0x1da6, name: 'upd_bomb', fn: (m) => { updBomb(m); } },
  ],
};
