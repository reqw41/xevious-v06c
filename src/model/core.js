'use strict';
// Мелкие процедуры логики: случайные числа, очки, жизни, столкновения.
const V = { lives: 0x3d39, cam_y: 0x3e4c, score: 0x3f24, rnd_seed: 0x0745, life_step: 0x280c };

// rnd 0743h: A = следующее число & маска A; зерно — операнд команды по 0745h
function rnd(m, mask) {
  const s = m.rd(V.rnd_seed);
  const t = (((s >> 3) | (s << 5)) & 0xff) ^ 0x1f;
  const sum = t + s;
  const v = ((sum & 0xff) + 1 - (sum >> 8)) & 0xff;      // SBC A,FFh с переносом от сложения
  m.wr(V.rnd_seed, v);
  return v & mask;
}

// add_score 27DFh: очки BCD 3F24h..3F26h; kind 1 — к младшему байту, 2 — к среднему, иначе — к старшему
function bcdAdd(a, b) {             // ADD + DAA; возвращает [значение, перенос]
  let r = a + b, c = r > 0xff ? 1 : 0;
  let lo = (a & 0xf) + (b & 0xf) > 9 || (r & 0xf) > 9;
  r &= 0xff;
  let corr = lo ? 6 : 0;
  if (c || r > 0x99) { corr |= 0x60; c = 1; }
  return [(r + corr) & 0xff, c];
}
function addScore(m, kind, val) {
  let start = kind === 1 ? 2 : kind === 2 ? 1 : 0;
  let add = val, top;
  for (let i = start; i >= 0; i--) {
    const [v, c] = bcdAdd(m.rd(V.score + i), add);
    m.wr(V.score + i, v);
    if (i === 0) top = v;
    else if (!c) return;
    add = 1;
  }
  // доп. жизнь: на 20000, затем на каждом пороге из операнда LD HL,0707h (280Ch), порог растёт на 70000
  if (top === 2) return extraLife(m);
  const lim = m.rd(V.life_step);
  if (top < lim) return;
  m.wr(V.life_step, bcdAdd(lim, 7)[0]);
  return extraLife(m);
}
// extra_life 2815h: жизнь +1, значок на панели (до 6), звук
function extraLife(m) {
  const n = m.rd(V.lives);
  m.wr(V.lives, n + 1);
  if (n < 6) m.plat('put_char', { a: 0xaa, de: 0x8000 | (n * 2 + 8) });
  m.plat('sfx', { d: 0x00, hl: 0x0f06, e: 0x40 });
}

// hit_16 181Bh: точка (x, y мира) против объекта (ox, oy мира): |по X| — окно 8 точек в обе стороны,
// по Y (экранные, от камеры) — объект от y−16 до y+8. Сравнения беззнаковые с переполнением, как в коде. 1 — попал.
function hit16(m, x, y, ox, oy) {
  if (((x + 8) & 0xff) < ox || ((ox + 8) & 0xff) < x) return 0;
  const cam = m.rd(V.cam_y), d = (oy - cam) & 0xff, c = (y - cam) & 0xff;
  if (((c + 16) & 0xff) < d || ((d + 8) & 0xff) < c) return 0;
  return 1;
}
// hit_player 17E3h: то же с размером объекта (w, h) и окном игрока 6 по X, 13 по Y
function hitPlayer(m, x, y, w, h, ox, oy) {
  if (((x + w) & 0xff) < ox || ((ox + 6) & 0xff) < x) return 0;
  const cam = m.rd(V.cam_y), e = (oy - cam) & 0xff, c = (y - cam) & 0xff;
  if (((c + h) & 0xff) < e || ((e + 13) & 0xff) < c) return 0;
  return 1;
}

module.exports = {
  V, rnd, addScore, extraLife, hit16, hitPlayer,
  procs: [
    { at: 0x0743, name: 'rnd', out: ['a'], fn: (m) => ({ a: rnd(m, m.r.a) }) },
    { at: 0x27df, name: 'add_score', fn: (m) => { addScore(m, m.r.a, m.r.l); } },
    { at: 0x2815, name: 'extra_life', fn: (m) => { extraLife(m); } },
    { at: 0x181b, name: 'hit_16', out: ['a'], pop: 2, fn: (m) => ({ a: hit16(m, m.r.a, m.r.l, m.arg(0), m.arg(1)) }) },
    { at: 0x17e3, name: 'hit_player', out: ['a'], pop: 4,
      fn: (m) => ({ a: hitPlayer(m, m.r.a, m.r.l, m.arg(0), m.arg(1), m.arg(2), m.arg(3)) }) },
  ],
};
