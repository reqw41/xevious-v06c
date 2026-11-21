'use strict';
// Начало жизни (3438h): сброс состояния, зона с контрольной точки, экран карты на обе страницы, панель.
const map = require('./map.js');
const core = require('./core.js');
const ml = require('./mainloop.js');
const V = {
  snd_mode: 0x3d3a, snd_timer: 0x3d3b, ready: 0x3f32, player_hit: 0x3f1b,
  joy_a: 0x3d3e, joy_b: 0x3d40,
  cam_y: 0x3e4c, cam_y_old: 0x3f27, cam_neg: 0x3f28, flag_st: 0x3f2a, flag_hit: 0x3f2f,
  area: 0x3e5a, area_row: 0x3e59, area_xoff: 0x3e58, area_xoff_tab: 0x03cb, map_row: 0x3e53, map_row_x: 0x3e55,
  scr_rows: 0x3e4d, flag_pos: 0x3f30, player_x: 0x3d4d, player_y: 0x3d4f,
  over_msg: 0x3f33, buf_back: 0x3e51, f3f29: 0x3f29, flag_rnd: 0x267a,
  andor_saved: 0x3f1e, andor_at: 0x3f19, andor_buf: 0x3ef5,
  text_pen: 0x3e5f, isr_064a: 0x064a, lives: 0x3d39, score: 0x3f24, hiscore: 0x3f21,
};

// 32A3h
function resetJoy(m) { m.wr16(V.joy_a, 0x0808); m.wr16(V.joy_b, 0x3000); }

// 32B0h: корабль в исходную точку на обоих экранах, фон под ним и прицелом сохранить
function playerHome(m) {
  m.wr(V.player_x, 0x3c); m.wr(V.player_x + 1, 0x3c); m.wr(V.player_y, 0xc0); m.wr(V.player_y + 1, 0xc0);
  m.plat('put_tile16', { a: 0x3c, l: 0xc0, s0: 0xb0c0 });
  m.plat('put_tile16', { a: 0x3c, l: 0xc0, s0: 0xb080 });
  m.plat('put_tile16', { a: 0x3c, l: 0x80, s0: 0xb140 });
  m.plat('put_tile16', { a: 0x3c, l: 0x80, s0: 0xb100 });
}

// 32E8h: все слоты объектов пусты
function clearObjects(m) {
  const fill = (a, n, v) => { for (let i = 0; i < n; i++) m.wr(a + i, v); };
  fill(0x3d63, 4, 0); fill(0x3d7b, 5, 0); fill(0x3dd0, 12, 0); fill(0x3e3a, 6, 0); fill(0x3e60, 5, 0);
  fill(0x3eaf, 8, 0); fill(0x3eeb, 5, 0); fill(0x3e0c, 8, 0);
  m.wr(0x3e1c, 8);
  for (const a of [0x3d9f, 0x3e21, 0x3e8d, 0x3e8e, 0x3f1c, 0x3f1d]) m.wr(a, 0);
  m.wr(0x3f1f, 0xff); m.wr(0x3f20, 0xff);
}

// 3369h: контрольная точка: в первой половине зоны (строка < 40h) — с середины, экран с 15 строк карты;
// иначе с начала зоны, на экране только нижняя строка
function checkpoint(m) {
  if (m.rd(V.area_row) < 0x40) {
    m.wr(V.area_row, 0x40); m.wr(V.scr_rows, 0xf0);
    m.wr16(V.map_row, m.rd16(V.map_row) + 0xf000); m.wr16(V.map_row_x, m.rd16(V.map_row_x) + 0xf000);
    map.andorSetup(m);
  } else { m.wr(V.area_row, 0); m.wr(V.scr_rows, 0x10); }
}

// 1DECh: экран карты 15×15 тайлов; строки с Y < rows — из карты (банк 6), прочие пустые (E940h).
// Код 41h в наложении (флаг зоны) — запомнить его место на экране (3F30h: Y, X).
function drawScreen(m, rows) {
  let hl = (m.rd16(V.map_row_x) + 0x038e) & 0xffff;
  for (let y = 0xe0; y >= 0; y -= 0x10) {
    for (let x = 0x74; x >= 0; x -= 8) {
      let t = 0xe940;
      if (y < rows) {
        if (m.rdP(6, hl | 0x2000) === 0x41) m.wr16(V.flag_pos, (x << 8) | y);
        t = 0xc000 + m.rdP(6, hl) * 0x40;
      }
      m.plat('draw_tile16', { a: x, l: y, s0: t & 0xffff });
      hl = (hl - 1) & 0xffff;
    }
    hl = (hl - 0x31) & 0xffff;
  }
  // затем рамка экрана (4000h…) — запись в экран, не логика
}

// 3358h: флаг зоны на экране — завести его наземным объектом
function flagObject(m) {
  const p = m.rd16(V.flag_pos);
  if (p) map.groundSpawn(m, p >> 8, 0x41, p & 0xff, 0x0100);
}

// 20E1h: строка с адреса t (до 0) знаками по экрану панели с de, шаг 2
function printStr(m, t, de) {
  for (let c; (c = m.rd(t)); t++, de += 2) m.plat('put_char', { a: c, de });
}

function restartLife(m) {
  m.plat('clear_hud', {});
  m.plat('hud_pens', { hl: 0x5454, de: 0x5454 });
  m.plat('raster_mode', { a: 0 });
  m.plat('ga_config', { a: 0xc4 });
  m.wr16(V.snd_timer, 0x012c);
  m.plat('music_start', { hl: 0x4b00 });
  m.wr(V.snd_mode, 2); m.wr(V.ready, 2); m.wr(V.player_hit, 0);
  m.plat('wait_vsync', {});
  resetJoy(m);
  for (const a of [V.cam_y, V.cam_y_old, V.cam_neg, V.flag_st, V.flag_hit]) m.wr(a, 0);
  const xo = m.rd(V.area_xoff_tab + m.rd(V.area));
  m.wr(V.area_xoff, xo);
  m.wr16(V.map_row, 0x5fc0); m.wr16(V.map_row_x, 0x5fc0 + xo);
  map.flagMark(m, 0x41);
  playerHome(m); clearObjects(m); checkpoint(m);
  m.wr16(V.flag_pos, 0);
  for (let i = 0; i < 2; i++) { ml.flipScreens(m); drawScreen(m, m.rd(V.scr_rows)); ml.msgReady(m); }
  flagObject(m);
  playerHome(m);
  m.plat('hud_pens', { hl: 0x5756, de: 0x5443 });
  m.wr(V.isr_064a, 1);
  m.wr(V.text_pen, 3);
  printStr(m, 0x354e, 0x8016); printStr(m, 0x355a, 0x8036);
  m.wr(V.text_pen, 1);
  m.plat('print_score', { hl: V.hiscore, de: 0x805a });
  m.plat('put_char', { a: (m.rd(V.area) + 0x31) & 0xff, de: 0x807a });
  if (!m.rd(V.score + 2)) m.plat('put_char', { a: 0x30, de: 0x804c });
  m.wr(V.text_pen, 2);
  printStr(m, 0x3560, 0x8002);
  m.wr(V.text_pen, 1);
  for (let c = 1; c < m.rd(V.lives) && c < 6; c++) m.plat('put_char', { a: 0xaa, de: 0x8008 + c * 2 });
}

// 3579h: вставить очки в таблицу рекордов (5 мест по 16 байт, нижнее — 3D2Dh, верхнее — 3CEDh; запись —
// 3 байта очков, 8 знаков имени, 0). Место (0 — первое) или 5, если очки не выше нижнего.
function hiscoreRank(m) {
  const sc = [0, 1, 2].map((i) => m.rd(V.score + i));
  let hl = 0x3d2d, de = 0, b = 5;
  for (;;) {
    let cmp = 0;
    for (let i = 0; i < 3 && !cmp; i++) cmp = sc[i] - m.rd(hl + i);
    if (cmp <= 0) break;
    if (b < 5) for (let i = 0; i < 12; i++) m.wr(hl + 16 + i, m.rd(hl + i));
    de = hl; hl -= 16;
    if (!--b) break;
  }
  if (b === 5) return b;
  for (let i = 0; i < 3; i++) m.wr(de + i, sc[i]);
  for (let i = 0; i < 8; i++) m.wr(de + 3 + i, 0x20);
  m.wr(de + 11, 0);
  return b;
}

// 378Ch: конец игры: экран, таблица рекордов (ввод имени), титул и меню; затем новая игра с зоны 1
function gameOver(m) {
  m.plat('hud_pens', { hl: 0x5454, de: 0x5454 });
  for (const a of [V.over_msg, V.buf_back, V.f3f29, V.area]) m.wr(a, 0);
  m.plat('ga_config', { a: 0xc3 }); m.plat('clear_4000', {}); m.plat('clear_hud', {});
  m.plat('ga_config', { a: 0xc1 }); m.plat('clear_4000', {});
  resetJoy(m);
  m.plat('wait_vsync', {});
  m.wr(V.isr_064a, 0);
  m.plat('hud_pens', { hl: 0x5754, de: 0x4c4b });
  m.plat('raster_mode', { a: 1 });
  m.plat('draw_logo', {});
  if (hiscoreRank(m) < 5) m.plat('name_entry', {});
  m.plat('hiscore_table', {});
  m.plat('title_menu', {});
  if (m.rd(V.andor_saved)) map.andorRestore(m, m.rd16(V.andor_at), V.andor_buf);
  for (let i = 0; i < 3; i++) m.wr(V.score + i, 0);
  m.wr(V.area_row, 0x78);
  map.flagMark(m, 0x40);
  m.wr(V.flag_rnd, core.rnd(m, 3));
  restartLife(m);
}

module.exports = {
  V, restartLife, gameOver, hiscoreRank, drawScreen, playerHome, clearObjects, checkpoint,
  procs: [
    { at: 0x3438, name: 'restart_life', screen: true, fn: (m) => { restartLife(m); } },
    { at: 0x378c, name: 'game_over', screen: true, fn: (m) => { gameOver(m); } },
    { at: 0x3579, name: 'hiscore_rank', out: ['a'], fn: (m) => ({ a: hiscoreRank(m) }) },
    { at: 0x1dec, name: 'draw_screen', screen: true, fn: (m) => { drawScreen(m, m.r.a); } },
  ],
};
