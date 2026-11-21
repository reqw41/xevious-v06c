'use strict';
// Корабль игрока: вывод, стирание (с бомбой), движение, выстрел и бомба.
// Координаты по двум экранам: [back] — задний (рисуем), [front] — передний (последний показанный).
const V = {
  buf_back: 0x3e51, buf_front: 0x3e52, joy: 0x3d42, player_hit: 0x3f1b,
  player_x: 0x3d4d, player_y: 0x3d4f, dx: 0x3d51, dy: 0x3d52, cam_off: 0x3f28,
  fire_held: 0x3e57, shot_x: 0x3d53, shot_y: 0x3d5b, shot_st: 0x3d63,
  bomb_x: 0x3e1d, bomb_y: 0x3e1f, bomb_st: 0x3e21,
  player_bufs: 0x015f, bomb_bufs: 0x01bb,
};
const SPR_SHIP = 0x8080, SPR_DIE1 = 0x8700, SPR_DIE2 = 0x8780;
// Маски кнопок — операнды команд AND в самом коде: их ставит выбор управления при старте игры (326Eh).
// Для джойстика: влево 4, вправо 8, вверх 1, вниз 2, огонь 10h, бомба 20h.
const MASK = { left: 0x2ff0, right: 0x2fff, up: 0x3019, down: 0x3025, fire_rel: 0x3039, fire: 0x3041, bomb: 0x3090 };

// draw_player 2F52h
function drawPlayer(m) {
  const st = m.rd(V.player_hit);
  if (st >= 3) return;
  const b = m.rd(V.buf_back);
  const spr = st === 0 ? SPR_SHIP : st === 1 ? SPR_DIE1 : SPR_DIE2;
  m.plat('draw_sprite', { a: m.rd(V.player_x + b), l: m.rd(V.player_y + b), s0: spr, s1: m.rd16(V.player_bufs + b * 2) });
}

// erase_player 2F8Dh: стереть бомбу (если летит) и корабль в заднем экране
function erasePlayer(m) {
  const b = m.rd(V.buf_back);
  if (m.rd(V.bomb_st) >= 3) {
    m.plat('restore_small', { a: m.rd(V.bomb_x + b), l: m.rd(V.bomb_y + b), s0: m.rd16(V.bomb_bufs + b * 2) });
  }
  if (m.rd(V.bomb_st) === 0xff) m.wr(V.bomb_st, 0);
  if (m.rd(V.player_hit) >= 5) return;
  m.plat('restore_16', { a: m.rd(V.player_x + b), l: m.rd(V.player_y + b), s0: m.rd16(V.player_bufs + b * 2) });
}

// player_move 2FDBh: джойстик -> dx/dy, огонь (4 выстрела) и бомба
function playerMove(m) {
  if (m.rd(V.player_hit)) return;
  const b = m.rd(V.buf_back), f = m.rd(V.buf_front);
  const x = m.rd(V.player_x + f);
  const k = (name) => m.rd(V.joy) & m.rd(MASK[name]);
  if (k('left') && x !== 0x04) m.wr(V.dx, 0xfe);
  if (k('right') && x !== 0x74) m.wr(V.dx, 0x02);
  const ys = (m.rd(V.cam_off) + m.rd(V.player_y + f)) & 0xff;   // Y на экране
  if (ys >= 0x49 && k('up')) m.wr(V.dy, m.rd(V.dy) - 4);
  if (k('down') && ys < 0xd8) m.wr(V.dy, m.rd(V.dy) + 4);
  if (!k('fire_rel')) m.wr(V.fire_held, 0);
  if (k('fire') && !m.rd(V.fire_held)) {
    m.wr(V.fire_held, 1);
    for (let i = 0; i < 4; i++) {
      if (m.rd(V.shot_st + i)) continue;
      m.wr(V.shot_st + i, 1);
      m.wr(V.shot_x + f + 2 * i, m.rd(V.player_x + b));
      m.wr(V.shot_y + f + 2 * i, m.rd(V.player_y + b));
      m.plat('sfx', { d: 0x01, hl: 0x0f02, e: 0x40 });
      break;
    }
  }
  if (!k('bomb') || m.rd(V.bomb_st)) return;
  m.wr(V.bomb_st, 1);
  m.wr(V.bomb_y + f, m.rd(V.player_y + b));
  m.wr(V.bomb_x + f, m.rd(V.player_x + b) + 3);
  m.plat('sfx', { d: 0x01, hl: 0x0f01, e: 0x43 });
}

module.exports = {
  V, MASK, drawPlayer, erasePlayer, playerMove,
  procs: [
    { at: 0x2f52, name: 'draw_player', fn: (m) => { drawPlayer(m); } },
    { at: 0x2f8d, name: 'erase_player', fn: (m) => { erasePlayer(m); } },
    { at: 0x2fdb, name: 'player_move', fn: (m) => { playerMove(m); } },
  ],
};
