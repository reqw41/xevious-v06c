'use strict';
// Карта: прокрутка, переход строки и зоны, наземные объекты из строки наложения, правки карты (флаг, база Андор).
// Карта — банк 6 (окно 4000h в конфигурации C6): 4000h..5FFFh тайлы 64×128, 6000h..7FFFh наложение.
const core = require('./core.js');
const V = {
  cam_y: 0x3e4c, cam_y_old: 0x3f27, cam_neg: 0x3f28, stop: 0x3f1c, area: 0x3e5a, area_row: 0x3e59, area_xoff: 0x3e58,
  map_row: 0x3e53, map_row_x: 0x3e55, ovl_row: 0xb590, gnd_slot: 0x3e1c,
  andor_on: 0x3f1d, andor_saved: 0x3f1e, andor_at: 0x3f19, andor_pos: 0x3f1f, andor_buf: 0x3ef5,
  flag_tab: 0x03f7, flag_rnd: 0x267a, area_xoff_tab: 0x03cb,
  // самоизменяемые операнды: состояние наземной цели из тайла (1F8Eh), 2999h, 389Fh — усложнение на втором круге
  gt_state: 0x1f8e, k2999: 0x2999, t389f: 0x389f,
  g_x: 0x3df4, g_y: 0x3dfc, g_arg: 0x3e04, g_st: 0x3e0c, g_type: 0x3e14,
};
const MAP = 6;

// 1E90h: байт в карту (банк 6) по адресу окна; сохраняет конфигурацию (регистр I) в свой операнд
function mapPut(m, addr, v) { m.wr(0x1ea1, m.r.i); m.wrP(MAP, addr, v); return v; }

// 1EAAh: врезать базу 6×6 по адресу HL: старые коды — в буфер DE, на их место 10h..33h
function andorPlace(m, hl, de) {
  m.wr(0x1eed, m.r.i);
  let c = 0x10;
  for (let r = 0; r < 6; r++) for (let i = 0; i < 6; i++) { m.wr(de++, m.rdP(MAP, hl + r * 0x40 + i)); m.wrP(MAP, hl + r * 0x40 + i, c++); }
  m.wr(V.andor_on, 1); m.wr(V.andor_saved, 1);
}
// 1EF5h: вернуть 6×6 из буфера DE в карту по HL
function andorRestore(m, hl, de) {
  m.wr(0x1f21, m.r.i);
  for (let r = 0; r < 6; r++) for (let i = 0; i < 6; i++) m.wrP(MAP, hl + r * 0x40 + i, m.rd(de++));
  m.wr(V.andor_on, 0); m.wr(V.andor_saved, 0);
}

// 2668h: код v в наложение на место флага зоны (таблица 03F7h + случайный сдвиг 267Ah)
function flagMark(m, v) {
  const t = V.flag_tab + m.rd(V.area) * 2, hi = m.rd(t + 1);
  if (!hi) return;
  return mapPut(m, (hi << 8) | ((m.rd(V.flag_rnd) + m.rd(t)) & 0xff), v);
}

// 2682h: в начале зоны — убрать прежнюю базу, в зонах 4 и 8 врезать новую
function andorSetup(m) {
  if (m.rd(V.andor_saved)) andorRestore(m, m.rd16(V.andor_at), V.andor_buf);
  const a = m.rd(V.area);
  const put = (pos, at) => { m.wr16(V.andor_pos, pos); m.wr16(V.andor_at, at); andorPlace(m, at, V.andor_buf); };
  if (a === 3) put(0x1e03, 0x6831);
  else if (a === 7) put(0x1807, 0x669f);
}

// 1F29h: завести наземный объект в свободный из 8 слотов (3E0Ch); номер слота+1 -> 3E1Ch
function groundSpawn(m, x, type, y, arg) {
  for (let i = 0; i < 8; i++) {
    if (m.rd(V.g_st + i)) continue;
    m.wr(V.gnd_slot, i + 1);
    m.wr(V.g_type + i, type); m.wr(V.g_x + i, x); m.wr(V.g_y + i, y);
    m.wr(V.g_arg + i, arg & 0xff); m.wr(V.g_st + i, arg >> 8);
    return;
  }
}

// 1F60h: наземные объекты по строке наложения B590h..B59Fh (столбцы 14..0), затем хвост прокрутки
function mapRowObjects(m) {
  for (let b = 14; b >= 0; b--) {
    const c = m.rd(V.ovl_row + 1 + b);
    let x = b * 8, y = 0, t, arg;
    if (c === 0x17 || c === 0x19 || c === 0x23 || c === 0x25) {          // цели на тайлах
      const r = core.rnd(m, 0x0f);
      t = c + 0x14; arg = (m.rd(V.gt_state) << 8) | ((r * 16) & 0xff); x += 4; y = 8;
    } else if (c === 0x02) { t = 0x16; arg = 0xfe00; }
    else if (c === 0x00 || c === 0x07) { t = c ? 0x15 : 0x16; arg = 0x0400 | (((m.rd(V.gnd_slot) + 1) * 4) & 0xff); }
    else if (c === 0x41 || c === 0x08 || c === 0x0a) { t = c === 0x41 ? 0x41 : 0x15; arg = 0x0100; }
    else if (c === 0x09 || c === 0x01) { t = 0x16; arg = 0x0100; }
    else if (c === 0x1e) { t = 0x28; arg = 0xfe00; x += 4; y = 8; }
    else if (c === 0x34 || c === 0x38) { t = 0x27; arg = 0x1000; x += 4; y = 8; }
    else if (c === 0x03) { t = 0x26; arg = 0xff00; x += 4; y = 8; }
    else continue;
    groundSpawn(m, (x + 4) & 0xff, t, y, arg);
  }
  scrollTail(m);
}

function scrollTail(m) { m.wr(V.cam_neg, -m.rd(V.cam_y) & 0xff); }

// 26C1h: шаг прокрутки (камера −1), каждые 16 строк — объекты строки, на 8-й — переход строки карты
function scrollStep(m) {
  const cam = m.rd(V.cam_y);
  m.wr(V.cam_y_old, cam);
  if (m.rd(V.stop)) return scrollTail(m);
  m.wr(V.cam_y, cam - 1);
  const c = (cam - 1) & 0x0f;
  if (c === 0x0f) return mapRowObjects(m);
  if (c !== 0x07) return scrollTail(m);
  if (m.rd(V.area_row) === 0x7f) andorSetup(m);
  const r = m.rd(V.area_row);
  m.wr(V.area_row, r ? r - 1 : 0x7f);
  mapAdvanceRow(m);
}

// 26F1h: строка карты на 64 байта вверх; дошли до начала — следующая зона
function mapAdvanceRow(m) {
  let de = (m.rd16(V.map_row) - 0x40) & 0xffff;
  if (de === 0x3fc0) {
    flagMark(m, 0x40);
    const b = (m.rd(V.area) + 1) & 7;
    if (!b) {                          // второй круг
      m.wr(V.gt_state, 0x10); m.wr(V.k2999, 0x3f);
      const t = m.rd(V.t389f) - 0x19;
      if (t >= 0) m.wr(V.t389f, t);
    }
    m.wr(V.area, b);
    m.wr(V.area_xoff, m.rd(V.area_xoff_tab + b));
    m.plat('put_digit', { a: b + 0x31, de: 0x807a });
    m.wr(V.flag_rnd, core.rnd(m, 3));
    flagMark(m, 0x41);
    de = 0x5fc0;
  }
  m.wr16(V.map_row, de);
  m.wr16(V.map_row_x, (de & 0xff00) | ((de + m.rd(V.area_xoff)) & 0xff));
  scrollTail(m);
}

module.exports = {
  V, mapPut, andorPlace, andorRestore, flagMark, andorSetup, groundSpawn, mapRowObjects, scrollStep, mapAdvanceRow,
  procs: [
    { at: 0x1e90, name: 'map_put', out: ['a'], fn: (m) => ({ a: mapPut(m, (m.r.d << 8) | m.r.e, m.r.a) }) },
    { at: 0x1eaa, name: 'andor_place', fn: (m) => { andorPlace(m, (m.r.h << 8) | m.r.l, (m.r.d << 8) | m.r.e); } },
    { at: 0x1ef5, name: 'andor_restore', fn: (m) => { andorRestore(m, (m.r.h << 8) | m.r.l, (m.r.d << 8) | m.r.e); } },
    { at: 0x2668, name: 'flag_mark', fn: (m) => { flagMark(m, m.r.a); } },
    { at: 0x2682, name: 'andor_setup', fn: (m) => { andorSetup(m); } },
    { at: 0x1f29, name: 'ground_spawn', pop: 2, fn: (m) => { groundSpawn(m, m.r.a, m.r.c, m.r.l, m.arg16(0)); } },
    { at: 0x1f60, name: 'map_row_objects', fn: (m) => { mapRowObjects(m); } },
    { at: 0x26c1, name: 'scroll_step', fn: (m) => { scrollStep(m); } },
  ],
};
