'use strict';
// Выстрелы игрока: 4 слота. Состояние 3D63h+i: 0 — свободен, 1..3 — летит (растёт до 3), FEh — снять,
// FFh — стереть и освободить. X/Y по экранам: 3D53h+2i+экран, 3D5Bh+2i+экран. Буферы фона: 0167h+4i+2·экран.
const V = { buf_back: 0x3e51, buf_front: 0x3e52, cam_y: 0x3e4c, shot_x: 0x3d53, shot_y: 0x3d5b, shot_st: 0x3d63,
  bufs: 0x0167, speed: 0x2454, slow: 0x3f1c };

// erase_shots 23A4h: стереть в заднем экране (слоты 3..0), FFh -> 0
function eraseShots(m) {
  const b = m.rd(V.buf_back);
  for (let i = 3; i >= 0; i--) {
    const st = m.rd(V.shot_st + i);
    if (st < 3) continue;
    m.plat('restore_shot', { a: m.rd(V.shot_x + 2 * i + b), l: m.rd(V.shot_y + 2 * i + b), s0: m.rd16(V.bufs + 4 * i + 2 * b) });
    if (st === 0xff) m.wr(V.shot_st + i, 0);
  }
}

// upd_shots 23F5h: шаг вверх на 9 (8 при 3F1Ch=1; скорость — операнд SUB по 2454h), уход за верх поля, вывод
function updShots(m) {
  m.wr(V.speed, (~m.rd(V.slow) + 0x0a) & 0xff);
  const b = m.rd(V.buf_back), f = m.rd(V.buf_front);
  for (let i = 0; i < 4; i++) {
    const st = m.rd(V.shot_st + i);
    if (!st) continue;
    if (st === 0xfe || ((m.rd(V.shot_y + 2 * i + f) - m.rd(V.cam_y)) & 0xff) < 0x10) { m.wr(V.shot_st + i, 0xff); continue; }
    if (st < 3) m.wr(V.shot_st + i, st + 1);
    const y = (m.rd(V.shot_y + 2 * i + f) - m.rd(V.speed)) & 0xff;
    m.wr(V.shot_y + 2 * i + b, y);
    const x = m.rd(V.shot_x + 2 * i + f);
    m.wr(V.shot_x + 2 * i + b, x);
    m.plat('draw_shot', { a: x, l: y, s0: m.rd16(V.bufs + 4 * i + 2 * b) });
  }
}

module.exports = {
  V, eraseShots, updShots,
  procs: [
    { at: 0x23a4, name: 'erase_shots', fn: (m) => { eraseShots(m); } },
    { at: 0x23f5, name: 'upd_shots', fn: (m) => { updShots(m); } },
  ],
};
