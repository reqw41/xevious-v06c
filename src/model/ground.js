'use strict';
// Наземные объекты (8 слотов, i = 0..7): состояние 3E0Ch+i, тип 3E14h+i, X 3DF4h+i, Y мира 3DFCh+i,
// счётчик попадания/анимации 3E04h+i. Бомба поражает их в 1B1Ah; часть стреляет пулями (1A21h, слоты 3DD0h).
const core = require('./core.js');
const V = {
  buf_front: 0x3e52, cam_y: 0x3e4c, cam_neg: 0x3f28, stop: 0x3f1c, andor_on: 0x3f1d,
  g_x: 0x3df4, g_y: 0x3dfc, g_hv: 0x3e04, g_st: 0x3e0c, g_type: 0x3e14,
  bomb_x: 0x3e1d, bomb_y: 0x3e1f, bomb_st: 0x3e21, flag_st: 0x3f2a, flag_xy: 0x3f2b,
  player_x: 0x3d4d, player_y: 0x3d4f,
  b_st: 0x3dd0, b_x: 0x3da0, b_y: 0x3db8, b_dx: 0x3ddc, b_dy: 0x3de8,
  // самоизменяемые операнды: точка бомбы (1C77h X, 1C78h Y) и её смещения (1C84h, 1C7Bh), размеры попадания
  // (185Bh по X, 1868h по Y), предел слотов, что едут с картой (1B4Ch), выключатель стрельбы (1A21h: NOP/RET)
  bomb_px: 0x1c77, bomb_py: 0x1c78, bomb_oy: 0x1c7b, bomb_ox: 0x1c84, hit_w: 0x185b, hit_h: 0x1868, move_lim: 0x1b4c,
  fire_off: 0x1a21,
};

// 184Eh: точка бомбы (bx, by экранные) против наземного объекта (x, y мира); размеры — из операндов 185Bh/1868h
function hitBomb(m, x, y, bx, by) {
  if (((x + 8) & 0xff) < bx || ((bx + m.rd(V.hit_w)) & 0xff) < x) return 0;
  if (((y + 0x10) & 0xff) < by || ((by + m.rd(V.hit_h)) & 0xff) < y) return 0;
  return 1;
}

const sgn = (v) => (v & 0x80) !== 0;
// 1A21h: пуля от наземной цели (x, y экрана) в сторону игрока: свободный из 12 слотов, шаг по осям ±1/2/4
function groundFire(m, x, y) {
  if (m.rd(V.fire_off) === 0xc9) return;
  if (x < 6 || x >= 0x79) return;
  if (((m.rd(V.cam_neg) + y) & 0xff) >= 0xf0) return;
  let j = 0;
  while (m.rd(V.b_st + j)) if (++j === 12) return;
  const f = m.rd(V.buf_front), cam = m.rd(V.cam_y);
  m.wr(V.b_x + 2 * j + f, x); m.wr(V.b_y + 2 * j + f, y);
  let d = ((((m.rd(V.player_x + f) + 4) & 0xff) >> 3) - (x >> 3)) & 0xff;
  let e = ((((m.rd(V.player_y + f) - cam) & 0xff) >> 4) - (((y - cam) & 0xff) >> 4)) & 0xff;
  const c = sgn(e) ? -e & 0xff : e, b = sgn(d) ? -d & 0xff : d;
  if (b === c || !d || !e) {
    d = sgn(d) ? 0xfe : d ? 0x02 : 0;
    e = sgn(e) ? 0xfc : e ? 0x04 : 0;
  } else if (b < c) { d = sgn(d) ? 0xff : 0x01; e = sgn(e) ? 0xfc : 0x04; }
  else { d = sgn(d) ? 0xfe : 0x02; e = sgn(e) ? 0xfe : 0x02; }
  if (!(d | e)) return;
  m.wr(V.b_st + j, m.rd(V.b_st + j) + 1);
  m.wr(V.b_dx + j, d); m.wr(V.b_dy + j, e);
}

// картинки целей для вывода в фон (1334h) — по типу
const IMG_ROW9 = { 0x39: 0xfe40, 0x37: 0xfe00, 0x2d: 0xfdc0 };            // при Y = 9 (появление), иначе FD80h
const IMG_DEAD = { 0x27: 0xc9c0, 0x28: 0xffc0, 0x39: 0xff80, 0x37: 0xff40, 0x2d: 0xff00, 0x2b: 0xfec0, 0x26: 0xc980, 0x15: 0xc540 };

// 1B1Ah: наземные объекты — едут с картой, появляются/дорисовываются, попадание бомбы, взрыв, стрельба
function updGroundTiles(m) {
  if (m.rd(V.bomb_st) >= 0x0e) {
    const f = m.rd(V.buf_front);
    m.wr(V.bomb_px, m.rd(V.bomb_x + f)); m.wr(V.bomb_py, m.rd(V.bomb_y + f));
  }
  restart: for (;;) {
    for (let i = 0; i < 8; i++) {
      const B = 8 - i;
      const st = m.rd(V.g_st + i);
      if (!st) continue;
      if (!m.rd(V.stop) && B < m.rd(V.move_lim)) m.wr(V.g_y + i, m.rd(V.g_y + i) + 1);
      const y = m.rd(V.g_y + i), x = m.rd(V.g_x + i), type = m.rd(V.g_type + i);
      let L = (m.rd(V.cam_y) + y) & 0xff;
      if (y === 0xe0) m.wr(V.g_st + i, 0);
      const sNow = m.rd(V.g_st + i);
      const mark9 = () => { if (y === 9) m.plat('mark_a', { a: x, l: L }); };
      if (type < 0x2b || type === 0x41) {
        if (type < 0x2b && sNow === 0x10) mark9();
        else if (sNow === 0xfe) {
          if (type === 0x28 && y === 9) m.plat('restore_16', { a: x, l: L, s0: 0xfe80 });
          else mark9();
        }
      } else if (y === 9) m.plat('restore_16', { a: x, l: L, s0: IMG_ROW9[type] || 0xfd80 });

      const hv = m.rd(V.g_hv + i);
      if (hv & 1) {                                        // взрыв: кадры 8780h, 8700h, затем след
        const n = (hv + 2) & 0xff;
        m.wr(V.g_hv + i, n);
        let H = x;
        if (n < 5) m.plat('draw_ground', { a: x, l: L, s0: 0x8780 });
        else if (n < 7) m.plat('draw_ground', { a: x, l: L, s0: 0x8700 });
        else if (type === 0x41) {                           // особый флаг открылся
          m.wr(V.flag_st, 1); m.wr(V.flag_xy, L); m.wr(V.flag_xy + 1, x);
          m.plat('restore_16', { a: x, l: L, s0: 0xbb00 });
          L = m.rd(V.flag_xy); H = m.rd(V.flag_xy + 1);
          m.plat('draw_ground', { a: H, l: L, s0: 0x9a00 });
        } else m.plat('restore_16', { a: x, l: L, s0: IMG_DEAD[type] || 0xc580 });
        if (m.rd(V.g_hv + i) === 0x0b) { m.wr(V.g_st + i, 0); m.plat('mark_dead', { a: H, l: L, ix: V.g_st + i }); }
        continue;
      }
      let hit = 0;
      if (m.rd(V.bomb_st) >= 0x0e) {
        const by = (m.rd(V.bomb_py) - m.rd(V.bomb_oy) - m.rd(V.cam_y)) & 0xff;
        const bx = (m.rd(V.bomb_px) - m.rd(V.bomb_ox)) & 0xff;
        hit = hitBomb(m, x, y, bx, by);
      }
      if (hit) {
        if (sNow === 0xfe) {
          if (y >= 0x18) {                                  // база Андор: ядро — большая зона поражения, всё заново
            m.wr(V.g_st + i, 1);
            m.wr(V.bomb_ox, 8); m.wr(V.bomb_oy, 0x10); m.wr(V.hit_w, 0x12); m.wr(V.hit_h, 0x24); m.wr(V.move_lim, B);
            continue restart;
          }
        } else {
          m.plat('sfx', { d: 0x02, hl: 0x0f03, e: 0x30 });
          if (type & 0x40) m.plat('draw_sprite', { a: x, l: L, s0: 0x8780, s1: 0xbb00 });
          else m.plat('draw_ground', { a: x, l: L, s0: 0x8780 });
          m.wr(V.g_hv + i, 1);
          let pts = 1;
          if (sNow === 1) {
            if (type === 0x41) pts = 0x10;
            else if (type === 0x28) { m.wr(V.andor_on, 0); m.wr(V.stop, 0); pts = 0x10; }
          }
          core.addScore(m, 2, pts);
          continue;
        }
      }
      // не задета
      if (!m.rd(V.g_hv + i) && (sNow === 0x10 || sNow === 0x08 || sNow === 0x04)) {
        groundFire(m, (x + 4) & 0xff, (m.rd(V.cam_y) + y + 8) & 0xff);
      }
      if ((sNow - 2) & 0x80) continue;
      const d = (m.rd(V.g_hv + i) + sNow) & 0xff;
      m.wr(V.g_hv + i, d);
      if (sNow !== 4) continue;
      const Ly = (m.rd(V.cam_y) + y) & 0xff;
      if (d === 0xf8 || d === 0xfc) m.plat('mark_a', { a: x, l: Ly });
      else if (d === 0x04 || d === 0x08) m.plat('mark_b', { a: x, l: Ly });
    }
    break;
  }
  if (m.rd(V.move_lim) !== 9) {
    m.wr(V.move_lim, 9); m.wr(V.hit_w, 2); m.wr(V.hit_h, 4); m.wr(V.bomb_ox, 0); m.wr(V.bomb_oy, 0);
  }
}

module.exports = {
  V, hitBomb, groundFire, updGroundTiles,
  procs: [
    { at: 0x184e, name: 'hit_bomb', out: ['a'], pop: 2, fn: (m) => ({ a: hitBomb(m, m.r.a, m.r.l, m.arg(0), m.arg(1)) }) },
    { at: 0x1a21, name: 'ground_fire', fn: (m) => { groundFire(m, m.r.a, m.r.l); } },
    { at: 0x1b1a, name: 'upd_ground_tiles', fn: (m) => { updGroundTiles(m); } },
  ],
};
