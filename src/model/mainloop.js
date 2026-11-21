'use strict';
// Главный цикл 3AAFh (обновление раз в 2 кадра) и его служебные части: строка карты в буфер, смена экранов,
// ожидание кадра с аппаратной прокруткой, надпись «готов».
const core = require('./core.js');
const player = require('./player.js');
const shots = require('./shots.js');
const map = require('./map.js');
const ground = require('./ground.js');
const bullets = require('./bullets.js');
const tabobj = require('./tabobj.js');
const sparks = require('./sparks.js');
const air = require('./air.js');
const zs = require('./zspecial.js');
const flow = require('./flow.js');
const V = {
  buf_back: 0x3e51, buf_front: 0x3e52, cam_y: 0x3e4c, stop: 0x3f1c, andor_on: 0x3f1d, andor_pos: 0x3f1f,
  area: 0x3e5a, area_row: 0x3e59, map_row_x: 0x3e55, row_buf: 0xb582, flag_map: 0x3f2d,
  player_x: 0x3d4d, player_y: 0x3d4f, dx: 0x3d51, dy: 0x3d52, sight_bufs: 0x0163,
  flag_st: 0x3f2a, flag_xy: 0x3f2b, ready: 0x3f32, alive: 0x3d9f, z_n: 0x3e8d, snd_mode: 0x3d3a,
  frame_cnt: 0x3d3d, crtc_r5: 0x3d3e, crtc_ma: 0x3d40, paused: 0x3f2f, fire_off: 0x1a21,
};
const SPR_SIGHT = 0x8200;

// draw_map_row 16B6h: строка карты (15 тайлов + 15 наложения) в буфер B582h..B59Fh; место флага (41h) — в 3F2Dh.
// Сам вывод строки на экран CPC — внутри процедуры (в сверке экран не участвует).
function drawMapRow(m) {
  const hl = m.rd16(V.map_row_x);
  for (let i = 0; i < 15; i++) m.wr(V.row_buf + i, m.rdP(6, hl + i));
  const ov = ((((hl + 14) >> 8) | 0x20) << 8) | (hl & 0xff);
  for (let i = 0; i < 15; i++) {
    const c = m.rdP(6, ov + i);
    m.wr(V.row_buf + 15 + i, c);
    if ((c & 0x41) === 0x41) m.wr16(V.flag_map, ((hl | 0x2000) & 0xff00) | ((hl + i) & 0xff));
  }
}

// flip_screens 1627h: экраны меняются местами; бит 5 старшего байта адреса экрана CRTC (3D41h)
function flipScreens(m) {
  const old = m.rd(V.buf_back), nb = (old + 1) & 1;
  m.wr(V.buf_back, nb); m.wr(V.buf_front, old);
  const c = m.rd(V.crtc_ma + 1);
  m.wr(V.crtc_ma + 1, nb ? c & ~0x20 : c | 0x20);
}

// wait_frame 1681h (после ожидания кадра): при движении — R5 +1, каждые 16 — адрес экрана на строку знаков выше
function waitFrame(m) {
  if (m.rd(V.stop)) return;
  const e = (m.rd(V.crtc_r5) + 1) & 0xff;
  if (e & 0x0f) { m.wr(V.crtc_r5, e & 0x0f); return; }
  const hl = m.rd16(V.crtc_ma), h = hl >> 8;
  const nl = ((hl & 0x3ff) - 0x20) & 0x3ff;
  m.wr16(V.crtc_ma, ((h & 0xfc) << 8) | nl);
  m.wr(V.crtc_r5, e >> 1);
}

// msg_ready 340Ch: надпись начала жизни, стрельба целей выключена (1A21h := RET)
function msgReady(m) {
  m.wr(V.fire_off, 0xc9);
  const l = (m.rd(V.cam_y) + 0x50) & 0xff;
  m.plat('print_text', { a: 0x2c, l, s0: 0x0407, s1: 0xa900 });
  m.plat('print_text', { a: 0x34, l: (l + 0x10) & 0xff, s0: 0x0412, s1: 0xa990 });
}

// main_loop 3AAFh: одно обновление от ожидания кадра до смены экранов
function mainLoop(m) {
  m.plat('wait_vsync', {});
  flow.readyMsg(m);
  flow.overMsgErase(m);
  let b = m.rd(V.buf_back);
  m.plat('restore_16', { a: m.rd(V.player_x + b), l: (m.rd(V.player_y + b) + 0xc0) & 0xff, s0: m.rd16(V.sight_bufs + 2 * b) });
  sparks.eraseSparks(m); zs.eraseZ23(m); bullets.eraseBullets(m); zs.eraseZ48(m); shots.eraseShots(m); air.eraseAir(m);
  flow.timer3d9f(m); player.erasePlayer(m); tabobj.eraseTabobj(m);
  if (m.rd(V.flag_st) === 2) {
    m.plat('restore_16', { a: m.rd(V.flag_xy + 1), l: m.rd(V.flag_xy), s0: 0xbb00 });
    m.wr(V.flag_st, 0);
  }
  drawMapRow(m);
  if (!m.rd(V.ready) && !m.rd(V.stop) && !m.rd(V.alive) && m.rd(V.z_n) < 5) {
    const row = m.rd(V.area_row), area = m.rd(V.area);
    if (((row << 24) >> 24) > 0x24) air.spawnAirStart(m);
    else if (area === 3 || area === 7) zs.spawnZ48(m);
    else if (area === 1 || area === 2) zs.spawnZ23(m);
    else if (area && !(row & 7)) sparks.spawnSparks(m);
  }
  tabobj.spawnByRow(m);
  if (m.rd(V.area) === m.rd(V.andor_pos) && m.rd(V.area_row) < 0x80 && m.rd(V.area_row) === m.rd(V.andor_pos + 1)
      && m.rd(V.andor_on)) {
    m.wr(V.stop, 1); m.wr(V.andor_on, 0);                 // база Андор на месте — карта стоит
  }
  m.wr(V.dx, 0);
  m.wr(V.dy, m.rd(V.stop) - 1);
  player.playerMove(m);
  map.scrollStep(m);
  drawMapRow(m);
  b = m.rd(V.buf_back);
  const f = m.rd(V.buf_front);
  m.wr(V.player_x + b, m.rd(V.player_x + f) + m.rd(V.dx));
  m.wr(V.player_y + b, m.rd(V.player_y + f) + m.rd(V.dy));
  ground.updGroundTiles(m); flow.specialFlag(m); tabobj.updTabobj(m); player.drawPlayer(m); bullets.updBomb(m);
  air.updAir(m); shots.updShots(m); zs.updZ48(m); bullets.updBullets(m); zs.updZ23(m); sparks.updSparks(m);
  m.plat('draw_sprite', { a: m.rd(V.player_x + b), l: (m.rd(V.player_y + b) + 0xc0) & 0xff, s0: SPR_SIGHT,
    s1: m.rd16(V.sight_bufs + 2 * b) });
  if (m.rd(V.cam_y) !== 7) flow.hiscore(m);
  if (m.rd(V.ready) === 2) {
    if (m.rd(V.snd_mode) === 2) msgReady(m); else m.wr(V.ready, 1);
  }
  flow.overMsg(m);
  waitFrame(m);
  flow.deathSeq(m);
  flipScreens(m);
}

module.exports = {
  V, drawMapRow, flipScreens, waitFrame, msgReady, mainLoop,
  procs: [
    { at: 0x16b6, name: 'draw_map_row', screen: true, fn: (m) => { drawMapRow(m); } },
    { at: 0x1627, name: 'flip_screens', fn: (m) => { flipScreens(m); } },
    { at: 0x1681, name: 'wait_frame', fn: (m) => { waitFrame(m); } },
    { at: 0x340c, name: 'msg_ready', fn: (m) => { msgReady(m); } },
    { at: 0x3aaf, name: 'main_loop', loop: true, screen: true, fn: (m) => { mainLoop(m); } },
  ],
};
