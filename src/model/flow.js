'use strict';
// Ход игры вокруг объектов: гибель, особый флаг, пауза между волнами, надписи, рекорд.
const core = require('./core.js');
const map = require('./map.js');
const V = {
  buf_back: 0x3e51, cam_y: 0x3e4c, cam_y_old: 0x3f27, player_hit: 0x3f1b, lives: 0x3d39, snd_mode: 0x3d3a, snd_timer: 0x3d3b,
  player_x: 0x3d4d, player_y: 0x3d4f, flag_st: 0x3f2a, flag_xy: 0x3f2b, flag_map: 0x3f2d,
  kind: 0x3d9e, alive: 0x3d9f, pause_len: 0x389f, over_msg: 0x3f33, ready: 0x3f32, fire_off: 0x1a21,
  score: 0x3f24, hiscore: 0x3f21, hi_flag: 0x285d,
};

// death_seq 3817h: счётчик гибели 3F1Bh растёт до 40h (на 0Ch — музыка гибели); затем жизнь −1 на нечётном экране
function deathSeq(m) {
  const ph = m.rd(V.player_hit);
  if (!ph) return;
  if (ph === 1) m.plat('sfx', { d: 0x02, hl: 0x0f03, e: 0x30 });
  if (ph === 0x0c) { m.wr(V.snd_mode, 1); m.wr(V.snd_timer, 1); m.wr(V.snd_timer + 1, 0); }
  const n = (ph + 1) & 0xff;
  m.wr(V.player_hit, n);
  if (!(n & 0x40)) return;
  if (!m.rd(V.buf_back)) { m.wr(V.player_hit, n - 1); return; }
  const l = (m.rd(V.lives) - 1) & 0xff;
  m.wr(V.lives, l);
  const life = require('./life.js');
  if (l) life.restartLife(m); else life.gameOver(m);
}

// special_flag 3850h: открытый флаг (3F2Ah = 1) подобран — стереть, убрать с карты, доп. жизнь
function specialFlag(m) {
  if (m.rd(V.flag_st) !== 1) return;
  const b = m.rd(V.buf_back), y = m.rd(V.flag_xy), x = m.rd(V.flag_xy + 1);
  if (!core.hitPlayer(m, x, y, 8, 0x10, m.rd(V.player_x + b), m.rd(V.player_y + b))) return;
  m.plat('restore_16', { a: x, l: y, s0: 0xbb00 });
  m.wr(V.flag_st, 2);
  map.mapPut(m, m.rd16(V.flag_map), 0x40);
  if (m.rd(V.lives)) core.extraLife(m);
}

// timer_3d9f 3890h: волна выбита — пауза (операнд 389Fh: 4Bh, на втором круге короче) с видом волны FFh, затем 0
function timer3d9f(m) {
  if (!m.rd(V.alive) && m.rd(V.kind) !== 0xff) { m.wr(V.alive, m.rd(V.pause_len)); m.wr(V.kind, 0xff); }
  if (m.rd(V.kind) !== 0xff || !m.rd(V.alive)) return;
  m.wr(V.alive, m.rd(V.alive) - 1);
}

// 38ABh: на последней жизни при гибели — надпись (3F33h), вывод
function overMsg(m) {
  if (m.rd(V.player_hit) && m.rd(V.lives) === 1 && !m.rd(V.over_msg)) m.wr(V.over_msg, 1);
  if (!m.rd(V.over_msg)) return;
  m.plat('print_text', { a: 0x30, l: (m.rd(V.cam_y) + 0x50) & 0xff, s0: 0x0419, s1: 0xbb40 });
}
// 38D7h: стереть надпись (со второго раза)
function overMsgErase(m) {
  const v = m.rd(V.over_msg);
  if (!v) return;
  if (v === 1) { m.wr(V.over_msg, 2); return; }
  const l = (m.rd(V.cam_y_old) + 0x50) & 0xff;
  m.plat('put_blocks', { a: 0x30, l, s0: 0xbb40, b2: 4 });
  m.plat('put_blocks', { a: 0x44, l, s0: 0xbb80, b2: 4 });
}
// 3905h: надпись начала жизни; на последнем шаге (3F32h = 1) включить стрельбу целей (1A21h := NOP)
function readyMsg(m) {
  const v = m.rd(V.ready);
  if (!v) return;
  if (v === 1) { m.wr(V.ready, 0); m.wr(V.fire_off, 0); }
  const l = (m.rd(V.cam_y_old) + 0x50) & 0xff;
  m.plat('put_blocks', { a: 0x2c, l, s0: 0xa900, b2: 6 });
  m.plat('put_blocks', { a: 0x48, l, s0: 0xa960, b2: 3 });
  m.plat('put_blocks', { a: 0x34, l: (l + 0x10) & 0xff, s0: 0xa990, b2: 6 });
}

// 27A1h: рекорд 3F21h..3F23h := очки, если больше; 285Dh — признак нового рекорда; вывод очков
function hiscore(m) {
  let cmp = 0;
  for (let i = 0; i < 3 && !cmp; i++) cmp = m.rd(V.hiscore + i) - m.rd(V.score + i);
  if (cmp < 0) { for (let i = 0; i < 3; i++) m.wr(V.hiscore + i, m.rd(V.score + i)); m.wr(V.hi_flag, 1); }
  else m.wr(V.hi_flag, 0);
  m.plat('print_score', { hl: V.score, de: 0x8044 });
}

module.exports = {
  V, deathSeq, specialFlag, timer3d9f, overMsg, overMsgErase, readyMsg, hiscore,
  procs: [
    { at: 0x3817, name: 'death_seq', screen: true, fn: (m) => { deathSeq(m); } },
    { at: 0x3850, name: 'special_flag', fn: (m) => { specialFlag(m); } },
    { at: 0x3890, name: 'timer_3d9f', fn: (m) => { timer3d9f(m); } },
    { at: 0x38ab, name: 'over_msg', fn: (m) => { overMsg(m); } },
    { at: 0x38d7, name: 'over_msg_erase', fn: (m) => { overMsgErase(m); } },
    { at: 0x3905, name: 'ready_msg', fn: (m) => { readyMsg(m); } },
    { at: 0x27a1, name: 'hiscore', fn: (m) => { hiscore(m); } },
  ],
};
