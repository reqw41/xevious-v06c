'use strict';
// Особые объекты зон. Зоны 2–3 (5 слотов z, 2032h/20F1h/21F7h): неуязвимые, выстрел отражают; состояние 3E60h+z,
// X 3E65h+2z+экран, Y 3E6Fh+2z+экран, задержка 3E79h+2z+экран, кадр 3E83h+2z+экран; буферы 01BFh+4z+2·экран;
// всего 3E8Dh, таймер появления 3E8Eh.
// Зоны 4 и 8 (6 слотов w, 18B8h/2489h/2565h): состояние 3E3Ah+w (до 28h, затем выстрел и уход), dX 3E40h+w,
// dY 3E46h+w, X 3E22h+2w+экран, Y 3E2Eh+2w+экран; буферы 03B3h+4w+2·экран.
const core = require('./core.js');
const ground = require('./ground.js');
const V = {
  buf_back: 0x3e51, buf_front: 0x3e52, cam_y: 0x3e4c, player_hit: 0x3f1b,
  player_x: 0x3d4d, player_y: 0x3d4f, shot_x: 0x3d53, shot_y: 0x3d5b, shot_st: 0x3d63,
  z_st: 0x3e60, z_x: 0x3e65, z_y: 0x3e6f, z_dl: 0x3e79, z_fr: 0x3e83, z_bufs: 0x01bf, z_n: 0x3e8d, z_tm: 0x3e8e,
  w_st: 0x3e3a, w_dx: 0x3e40, w_dy: 0x3e46, w_x: 0x3e22, w_y: 0x3e2e, w_bufs: 0x03b3,
};

// spawn_z23 2032h: раз в 24 вызова — в свободный слот, X случайный из 4, на обоих экранах сразу
function spawnZ23(m) {
  const t = m.rd(V.z_tm);
  if (t) { m.wr(V.z_tm, t - 1); return; }
  let z = 0;
  while (m.rd(V.z_st + z)) if (++z === 5) return;
  m.wr(V.z_tm, 0x18);
  m.wr(V.z_st + z, 1);
  m.wr(V.z_fr + 2 * z, z); m.wr(V.z_fr + 2 * z + 1, z);
  const x = (core.rnd(m, 3) * 32 + 8) & 0xff;
  m.wr(V.z_x + 2 * z, x); m.wr(V.z_x + 2 * z + 1, x);
  const cam = m.rd(V.cam_y);
  m.wr(V.z_y + 2 * z, cam); m.wr(V.z_y + 2 * z + 1, cam);
  m.wr(V.z_dl + 2 * z, m.rd(V.buf_front)); m.wr(V.z_dl + 2 * z + 1, m.rd(V.buf_back));
  m.wr(V.z_n, m.rd(V.z_n) + 1);
}

function eraseZ23(m) {
  const b = m.rd(V.buf_back);
  for (let z = 0; z < 5; z++) {
    const sa = V.z_st + z;
    if (!m.rd(sa)) continue;
    const x = m.rd(V.z_x + 2 * z + b), y = m.rd(V.z_y + 2 * z + b);
    if (!m.rd(V.player_hit)) m.wr(V.player_hit, core.hitPlayer(m, x, y, 0x0b, 0x0f, m.rd(V.player_x + b), m.rd(V.player_y + b)));
    for (let i = 0; i < 4; i++) {
      if (m.rd(V.shot_st + i) !== 3) continue;
      if (!core.hit16(m, x, y, m.rd(V.shot_x + 2 * i + b), m.rd(V.shot_y + 2 * i + b))) continue;
      m.wr(V.shot_st + i, 0xfe);
      m.plat('sfx', { d: 0x02, hl: 0x0f05, e: 0x48 });
    }
    const dl = V.z_dl + 2 * z + b;
    if (m.rd(dl) < 1) { m.wr(dl, m.rd(dl) + 1); continue; }
    const k = ((m.rd(V.z_fr + 2 * z + b) << 24) >> 25) & 0xff;      // SRA
    const name = k === 0 ? 'restore_z23a' : k === 2 ? 'restore_z23b' : 'restore_z23c';
    m.plat(name, { a: x, l: y, s0: m.rd16(V.z_bufs + 4 * z + 2 * b) });
    if (m.rd(sa) === 0xff) { m.wr(sa, 0); m.wr(V.z_n, m.rd(V.z_n) - 1); continue; }
    if (((y - m.rd(V.cam_y)) & 0xff) >= 0xe8) m.wr(sa, 0xff);
  }
}

function updZ23(m) {
  const b = m.rd(V.buf_back), f = m.rd(V.buf_front);
  for (let z = 0; z < 5; z++) {
    if (!m.rd(V.z_st + z)) continue;
    const y = (m.rd(V.z_y + 2 * z + f) + 1) & 0xff;
    m.wr(V.z_y + 2 * z + b, y);
    const k = (m.rd(V.z_fr + 2 * z + b) + 1) & 7;
    m.wr(V.z_fr + 2 * z + b, k);
    const a = { a: m.rd(V.z_x + 2 * z + b), l: y, s0: m.rd16(V.z_bufs + 4 * z + 2 * (f ^ 1)) };
    const h = k >> 1;
    if (h === 0) m.plat('draw_z23a', a);
    else if (h === 2) m.plat('draw_z23b', a);
    else m.plat('draw_z23c', { ...a, s1: h === 3 ? 0x85c0 : 0x8580 });
  }
}

// spawn_z48 18B8h: каждые 16 строк — в свободный из 6, чётные слева (X 70h, dX −1), нечётные справа
function spawnZ48(m) {
  if (m.rd(V.cam_y) & 0x0f) return;
  let w = 0;
  while (m.rd(V.w_st + w)) if (++w === 6) return;
  const f = m.rd(V.buf_front);
  m.wr(V.w_st + w, 1);
  const odd = w & 1;
  m.wr(V.w_dx + w, odd ? 0x01 : 0xff);
  m.wr(V.w_x + 2 * w + f, odd ? 0x10 : 0x70);
  m.wr(V.w_dy + w, 1);
  m.wr(V.w_y + 2 * w + f, m.rd(V.cam_y) + w + 0x20);
}

function eraseZ48(m) {
  const b = m.rd(V.buf_back);
  for (let w = 5; w >= 0; w--) {
    const sa = V.w_st + w;
    if (m.rd(sa) >= 3) {
      const x = m.rd(V.w_x + 2 * w + b), y = m.rd(V.w_y + 2 * w + b);
      m.plat('restore_z48', { a: x, l: y, s0: m.rd16(V.w_bufs + 4 * w + 2 * b) });
      if (!m.rd(V.player_hit)) m.wr(V.player_hit, core.hitPlayer(m, x, y, 3, 7, m.rd(V.player_x + b), m.rd(V.player_y + b)));
      for (let i = 0; i < 4; i++) {
        if (m.rd(V.shot_st + i) !== 3 || m.rd(sa) >= 0xfc) continue;
        if (!core.hit16(m, x, y, m.rd(V.shot_x + 2 * i + b), m.rd(V.shot_y + 2 * i + b))) continue;
        m.wr(sa, 0xfc); m.wr(V.shot_st + i, 0xfe);
        m.plat('sfx', { d: 0x02, hl: 0x0f04, e: 0x40 });
        core.addScore(m, 2, 5);
        break;
      }
    }
    if (m.rd(sa) === 0xff) m.wr(sa, 0);
  }
}

function updZ48(m) {
  const b = m.rd(V.buf_back), f = m.rd(V.buf_front);
  for (let w = 0; w < 6; w++) {
    const sa = V.w_st + w, st = m.rd(sa);
    if (!st) continue;
    const xf = m.rd(V.w_x + 2 * w + f), yf = m.rd(V.w_y + 2 * w + f);
    if (st === 0xfe || xf < 3 || xf >= 0x7d || ((yf - m.rd(V.cam_y)) & 0xff) >= 0xe1) { m.wr(sa, 0xff); continue; }
    if (st === 0x28) { m.wr(sa, 0xff); ground.groundFire(m, xf, yf); continue; }
    m.wr(sa, st + 1);
    m.wr(V.w_x + 2 * w + b, xf + m.rd(V.w_dx + w));
    m.wr(V.w_y + 2 * w + b, yf + m.rd(V.w_dy + w));
    if (m.rd(sa) >= 0xfd) m.wr(V.w_x + 2 * w + b, m.rd(V.w_x + 2 * w + b) & 0xfe);
    const x = m.rd(V.w_x + 2 * w + b), y = m.rd(V.w_y + 2 * w + b), buf = m.rd16(V.w_bufs + 4 * w + 2 * b);
    const s2 = m.rd(sa);
    if (s2 === 0xfd || s2 === 0xfe) m.plat('draw_glyph', { a: x, l: y, s0: s2 === 0xfd ? 0x9880 : 0x98a0, s1: buf });
    else m.plat('draw_z48', { a: x, l: y, s0: buf });
  }
}

module.exports = {
  V, spawnZ23, eraseZ23, updZ23, spawnZ48, eraseZ48, updZ48,
  procs: [
    { at: 0x2032, name: 'spawn_z23', fn: (m) => { spawnZ23(m); } },
    { at: 0x20f1, name: 'erase_z23', fn: (m) => { eraseZ23(m); } },
    { at: 0x21f7, name: 'upd_z23', fn: (m) => { updZ23(m); } },
    { at: 0x18b8, name: 'spawn_z48', fn: (m) => { spawnZ48(m); } },
    { at: 0x2489, name: 'erase_z48', fn: (m) => { eraseZ48(m); } },
    { at: 0x2565, name: 'upd_z48', fn: (m) => { updZ48(m); } },
  ],
};
