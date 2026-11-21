'use strict';
// Воздушные враги (5 слотов a): состояние 3D7Bh+a (1 — летит; FBh..FEh — взрыв, FFh — стереть), направление X
// 3D80h+a, скорость Y 3D85h+a, счётчик въезда 3D8Ah+a, счётчик анимации/таймер 3D99h+a, спрайт (слово) 3D8Fh+2a;
// X 3D67h+2a+экран, Y 3D71h+2a+экран; буферы фона 0177h+4a+2·экран. Вид волны на зону — 3D9Eh (таблица 03E7h),
// живых — 3D9Fh.
const core = require('./core.js');
const ground = require('./ground.js');
const V = {
  buf_back: 0x3e51, buf_front: 0x3e52, cam_y: 0x3e4c, cam_neg: 0x3f28, stop: 0x3f1c, area: 0x3e5a, player_hit: 0x3f1b,
  player_x: 0x3d4d, player_y: 0x3d4f, shot_x: 0x3d53, shot_y: 0x3d5b, shot_st: 0x3d63,
  a_st: 0x3d7b, a_dir: 0x3d80, a_spd: 0x3d85, a_in: 0x3d8a, a_spr: 0x3d8f, a_t: 0x3d99, a_x: 0x3d67, a_y: 0x3d71,
  a_bufs: 0x0177, kind: 0x3d9e, alive: 0x3d9f, kind_tab: 0x03e7,
};
const SPR_BOOM = { 0xfb: 0x8480, 0xfc: 0x8500, 0xfd: 0x8880, 0xfe: 0x9a80 };

// spawn_air_start 1904h: волна из 5 в начале зоны
function spawnAirStart(m) {
  const f = m.rd(V.buf_front);
  const kind = m.rd(V.kind_tab + m.rd(V.area) * 2 + f);
  m.wr(V.kind, kind);
  for (let a = 0; a < 5; a++) {
    const k = m.rd(V.kind), xa = V.a_x + 2 * a + f;
    if (k < 2) {
      const e = core.rnd(m, 3) * 4, r = core.rnd(m, 1);
      m.wr(V.a_dir + a, r ? 0xff : 0x01);
      m.wr(xa, r ? e + 0x68 : 0x18 - e);
    } else {
      const v = core.rnd(m, 0x0f) * 4;
      m.wr(xa, k === 2 ? a * 8 + v : v + 0x10);
      m.wr(V.a_dir + a, m.rd(V.player_x + a) < m.rd(xa) ? 0xff : 0x01);   // так в коде: X игрока по номеру слота
    }
    m.wr(V.a_y + 2 * a + f, m.rd(V.cam_y));
    m.wr(V.a_in + a, a * 8);
    m.wr(V.a_st + a, 1);
    let spd = 2, spr;
    if (k === 0) spr = 0x8900;
    else if (k === 1) { spd = core.rnd(m, 1) + 1; spr = 0x8100; }
    else if (k === 2) spr = 0x8a00;
    else { spr = 0x9200; m.wr(V.a_t + a, 0); }
    m.wr(V.a_spd + a, spd);
    m.wr16(V.a_spr + 2 * a, spr);
    m.plat('put_tile16', { a: m.rd(xa), l: m.rd(V.a_y + 2 * a + f), s0: m.rd16(V.a_bufs + 4 * a + 2 * f) });
  }
  m.wr(V.alive, 5);
}

// erase_air 2BE9h: стереть (a = 4..0), таран игрока (7×15), взрыв досчитывает (на 0 — живых −1), выстрелы (+300),
// уход за края — FFh. Выстрелы берутся по индексу без экрана (3D53h+2i) — так в коде.
function eraseAir(m) {
  const b = m.rd(V.buf_back);
  for (let a = 4; a >= 0; a--) {
    const sa = V.a_st + a;
    if (!m.rd(sa)) continue;
    const x = m.rd(V.a_x + 2 * a + b), y = m.rd(V.a_y + 2 * a + b);
    m.plat('restore_16', { a: x, l: y, s0: m.rd16(V.a_bufs + 4 * a + 2 * b) });
    if (!m.rd(V.player_hit)) m.wr(V.player_hit, core.hitPlayer(m, x, y, 7, 0x0f, m.rd(V.player_x + b), m.rd(V.player_y + b)));
    const st = m.rd(sa);
    if (st & 0x80) {
      m.wr(sa, st + 1);
      if (((st + 1) & 0xff) === 0) m.wr(V.alive, m.rd(V.alive) - 1);
      continue;
    }
    for (let i = 0; i < 4; i++) {
      if (m.rd(V.shot_st + i) !== 3 || m.rd(sa) === 0xfd) continue;
      if (!core.hit16(m, x, y, m.rd(V.shot_x + 2 * i), m.rd(V.shot_y + 2 * i))) continue;
      m.wr(sa, 0xfb); m.wr(V.shot_st + i, 0xfe);
      m.plat('sfx', { d: 0x02, hl: 0x0f04, e: 0x40 });
      core.addScore(m, 1, 0x30);
      break;
    }
    if (x < 3 || x >= 0x76 || ((m.rd(V.cam_neg) + y) & 0xff) >= 0xd9) m.wr(sa, 0xff);
  }
}

// upd_air 2CCBh: поведение по виду волны, стрельба, въезд сверху, движение, вывод; взрыв — кадры по состоянию
function updAir(m) {
  const b = m.rd(V.buf_back), f = m.rd(V.buf_front);
  for (let a = 0; a < 5; a++) {
    const sa = V.a_st + a, xb = V.a_x + 2 * a + b, yb = V.a_y + 2 * a + b;
    const buf = () => m.rd16(V.a_bufs + 4 * a + 2 * (f ^ 1));
    if (m.rd(sa) === 1) {
      const kind = m.rd(V.kind), xf = () => m.rd(V.a_x + 2 * a + f), yf = m.rd(V.a_y + 2 * a + f);
      let randFire = true;
      if (kind === 0) {                                     // разворот над игроком
        if (m.rd(V.player_x + f) === xf()) m.wr(V.a_dir + a, -m.rd(V.a_dir + a));
      } else if (kind === 1) {                              // на середине — разгон вдвое и обратно
        if (xf() === 0x40) m.wr(V.a_dir + a, (-m.rd(V.a_dir + a) * 2) & 0xff);
        const d = m.rd(V.a_dir + a);
        if (d === 2 || d === 0xfe) {
          const t = m.rd(V.a_t + a); m.wr(V.a_t + a, t + 1);
          const v = (t >> 1) & 3;
          m.wr16(V.a_spr + 2 * a, 0x8280 + ((v >> 1) << 8) + ((v & 1) << 7));
        }
      } else if (kind === 2) {                              // через 64 шага — вверх и в сторону игрока
        const t = m.rd(V.a_t + a); m.wr(V.a_t + a, t + 1);
        m.wr16(V.a_spr + 2 * a, 0x8a00 + (((t >> 1) & 3) << 8));
        if (m.rd(V.a_t + a) === 0x40) {
          const px = m.rd(V.player_x + f);
          m.wr(V.a_spd + a, 0xfe);
          m.wr(V.a_dir + a, px >= xf() ? 0x01 : 0xff);
        }
      } else if (kind === 3) {                              // остановка на Y экрана 70h, раскрытие, выстрел, уход
        randFire = false;
        if (((m.rd(V.cam_neg) + yf) & 0xff) === 0x70 && !m.rd(V.a_t + a)) {
          m.wr(V.a_t + a, 1); m.wr(V.a_spd + a, 0); m.wr(V.a_dir + a, 0);
          m.wr(V.a_x + 2 * a + f, xf() & 0xfe);
          m.wr16(V.a_spr + 2 * a, 0x9300);
        }
        const t = m.rd(V.a_t + a);
        if (t) {
          m.wr(V.a_t + a, t + 1);
          if (((t + 1) & 0xff) === 8) {
            m.wr(V.a_spd + a, 0xfc);
            m.wr16(V.a_spr + 2 * a, 0x9380);
            ground.groundFire(m, xf(), yf);
          }
        }
      }
      if (randFire && core.rnd(m, 0xff) === 3) ground.groundFire(m, xf(), yf);
      const x = (m.rd(V.a_dir + a) + xf()) & 0xff;
      m.wr(xb, x);
      const n = m.rd(V.a_in + a);
      if (n) {                                              // въезд: 1 точка за шаг, фон — заново
        m.wr(V.a_in + a, n - 1);
        m.wr(yb, yf - 1);
        m.plat('put_tile16', { a: x, l: m.rd(yb), s0: buf() });
      } else {
        let e = (m.rd(V.stop) + m.rd(V.a_spd + a)) & 0xff;
        if (kind === 1) e = (e & 1) ? f : ((e >> 1) | (e & 0x80));
        m.wr(yb, e + yf);
        m.plat('draw_sprite', { a: x, l: m.rd(yb), s0: m.rd16(V.a_spr + 2 * a), s1: buf() });
      }
    }
    const spr = SPR_BOOM[m.rd(sa)];
    if (spr) m.plat('draw_sprite', { a: m.rd(xb) & 0xfe, l: m.rd(yb), s0: spr, s1: buf() });
  }
}

module.exports = {
  V, spawnAirStart, eraseAir, updAir,
  procs: [
    { at: 0x1904, name: 'spawn_air_start', fn: (m) => { spawnAirStart(m); } },
    { at: 0x2be9, name: 'erase_air', fn: (m) => { eraseAir(m); } },
    { at: 0x2ccb, name: 'upd_air', fn: (m) => { updAir(m); } },
  ],
};
