'use strict';
// Объекты из таблицы зоны 02B3h (8 слотов k = номер записи): состояние 3EAFh+k (1..80h — жив, FCh..FEh — взрыв,
// FFh — стереть), тип пути 3EB7h+k, стрельба/вид 3ECFh+k, счётчик пути (слово) 3EBFh+2k,
// X (в точках) 3E8Fh+2k+экран, Y 3E9Fh+2k+экран, буферы фона 01D3h+4k+2·экран. Путь — таблица 01F3h (16 шагов на тип).
const core = require('./core.js');
const ground = require('./ground.js');
const V = {
  buf_back: 0x3e51, buf_front: 0x3e52, cam_y: 0x3e4c, cam_neg: 0x3f28, area: 0x3e5a, area_row: 0x3e59,
  bomb_x: 0x3e1d, bomb_y: 0x3e1f, bomb_st: 0x3e21,
  t_st: 0x3eaf, t_type: 0x3eb7, t_flag: 0x3ecf, t_time: 0x3ebf, t_x: 0x3e8f, t_y: 0x3e9f, t_bufs: 0x01d3,
  wave_tab: 0x02b3, path_tab: 0x01f3,
};

// spawn_tabobj 208Bh: слот k по записи (x, y экрана, тип, флаг), фон под него — put_tile16
function spawnTabobj(m, k, x, y, arg) {
  if (m.rd(V.t_st + k)) return;
  const e = (y + 8) & 0xff, f = m.rd(V.buf_front);
  m.wr(V.t_type + k, arg & 0xff); m.wr(V.t_flag + k, arg >> 8); m.wr(V.t_st + k, 1);
  m.wr16(V.t_time + 2 * k, 0);
  m.wr(V.t_x + 2 * k + f, x); m.wr(V.t_y + 2 * k + f, e);
  m.plat('put_tile16', { a: x >> 1, l: e, s0: m.rd16(V.t_bufs + 4 * k + 2 * f) });
}

// spawn_by_row 2761h: записи зоны с номером строки = area_row
function spawnByRow(m) {
  const y = (m.rd(V.cam_y) - 0x10) & 0xff;
  const t = V.wave_tab + m.rd(V.area) * 32;
  for (let k = 0; k < 8; k++) {
    if (m.rd(t + 4 * k) !== m.rd(V.area_row)) continue;
    spawnTabobj(m, k, m.rd(t + 4 * k + 1), y, (m.rd(t + 4 * k + 3) << 8) | m.rd(t + 4 * k + 2));
  }
}

// erase_tabobj 287Eh: стереть (k = 7..0); взрыв досчитывает до 0; попадание бомбы; уход за края — FFh
function eraseTabobj(m) {
  const b = m.rd(V.buf_back);
  for (let k = 7; k >= 0; k--) {
    const sa = V.t_st + k;
    if (!m.rd(sa)) continue;
    const x = m.rd(V.t_x + 2 * k + b), y = m.rd(V.t_y + 2 * k + b);
    m.plat('restore_16', { a: x >> 1, l: y, s0: m.rd16(V.t_bufs + 4 * k + 2 * b) });
    if (m.rd(sa) & 0x80) { m.wr(sa, m.rd(sa) + 1); continue; }
    if (m.rd(V.bomb_st) >= 0x0e) {
      const f = m.rd(V.buf_front), cam = m.rd(V.cam_y);
      if (ground.hitBomb(m, x >> 1, (y - cam) & 0xff, m.rd(V.bomb_x + f), (m.rd(V.bomb_y + f) - cam) & 0xff)) {
        m.wr(sa, 0xfc);
        m.plat('sfx', { d: 0x02, hl: 0x0f03, e: 0x30 });
        core.addScore(m, 2, 3);
      }
    }
    if (((m.rd(V.cam_neg) + y) & 0xff) === 0xe1 || x < 2 || x >= 0xed) m.wr(sa, 0xff);
  }
}

// upd_tabobj 292Ah: взрыв (кадры 8700h/8780h), стрельба (флаг ≠ 0, раз в 128 шагов), шаг по пути, вывод
function updTabobj(m) {
  const b = m.rd(V.buf_back), f = m.rd(V.buf_front);
  for (let k = 0; k < 8; k++) {
    const st = m.rd(V.t_st + k);
    if (!st) continue;
    const buf = m.rd16(V.t_bufs + 4 * k + 2 * b);
    if (((st + 1) & 0xff) & 0x80) {
      const spr = ((st - 0xfe) & 0x80) ? 0x8700 : 0x8780;
      m.plat('draw_sprite', { a: m.rd(V.t_x + 2 * k + b) >> 1, l: m.rd(V.t_y + 2 * k + b), s0: spr, s1: buf });
    }
    if ((m.rd(V.t_st + k) - 1) & 0x80) continue;
    const fx = m.rd(V.t_x + 2 * k + f), fy = m.rd(V.t_y + 2 * k + f);
    if (!(m.rd(V.t_time + 2 * k) & 0x7f) && m.rd(V.t_flag + k)) ground.groundFire(m, ((fx >> 1) + 4) & 0xff, (fy + 8) & 0xff);
    let dx = 0, dy = 0;
    const t = (m.rd(V.t_type + k) - 1) & 0xff;
    if (!(t & 0x80)) {
      const tm = m.rd16(V.t_time + 2 * k);
      if (tm < 0xf0) m.wr16(V.t_time + 2 * k, tm + 1);
      const v = m.rd(V.path_tab + ((t * 16) & 0xff) + (tm >> 4));
      dx = ((v & 1) ? 1 : 0) - ((v & 2) ? 1 : 0);
      dy = ((v & 8) ? 1 : 0) - ((v & 4) ? 1 : 0);
    }
    const x = (fx + dx) & 0xff, y = (fy + dy) & 0xff;
    m.wr(V.t_x + 2 * k + b, x); m.wr(V.t_y + 2 * k + b, y);
    let spr = m.rd(V.t_flag + k) === 1 ? 0x8600 : 0x9080 + ((y >> 1) & 1 ? 0x80 : 0);
    if (x & 1) spr = 0x9900 | (spr & 0xff);
    m.plat('draw_sprite', { a: x >> 1, l: y, s0: spr, s1: buf });
  }
}

module.exports = {
  V, spawnTabobj, spawnByRow, eraseTabobj, updTabobj,
  procs: [
    { at: 0x208b, name: 'spawn_tabobj', pop: 2, fn: (m) => { spawnTabobj(m, (8 - m.r.b) & 0xff, m.r.a, m.r.l, m.arg16(0)); } },
    { at: 0x2761, name: 'spawn_by_row', fn: (m) => { spawnByRow(m); } },
    { at: 0x287e, name: 'erase_tabobj', fn: (m) => { eraseTabobj(m); } },
    { at: 0x292a, name: 'upd_tabobj', fn: (m) => { updTabobj(m); } },
  ],
};
