'use strict';
// Прерывание (6 этапов за кадр, переход по операнду 0481h). Здесь — то, что меняет состояние игры; работа с
// CRTC/палитрой (OUT) — вывод, на Векторе своё. Звуковой драйвер и опрос клавиатуры — платформа.
const V = {
  next: 0x0481, scroll_fine: 0x3d3e, scroll_fine_cur: 0x3d3f, frames: 0x3d3d,
  snd_mode: 0x3d3a, snd_timer: 0x3d3b, joy: 0x3d42, pause: 0x3f2f,
  blink: 0x05ca, blink_sp: 0x0607, blink_tab: 0x0712, blink_src: 0x0736, isr_064a: 0x064a,
};

// этап 1 (0484h): тонкая прокрутка этого кадра — копия 3D3Eh
function s1(m) { m.wr(V.scroll_fine_cur, m.rd(V.scroll_fine)); m.wr16(V.next, 0x04cf); }
// этап 2 (04CFh): счётчик кадров
function s2(m) { m.wr(V.frames, m.rd(V.frames) + 1); m.wr16(V.next, 0x04e3); }
// этап 3 (04E3h): панель внизу — только вывод
function s3(m) { m.wr16(V.next, 0x0514); }

// этап 4 (0514h): звук. 3D3Ah: 0 — тишина; FFh — только эффекты (пауза); иначе музыка, таймер 3D3Bh:
// пока он идёт — играет текущая мелодия; по истечении режим −1 и, если не FFh, запуск модуля 4800h
function s4(m) {
  const mode = m.rd(V.snd_mode);
  let fx = false;
  if (mode === 0xff) fx = true;
  else if (mode) {
    let t = m.rd16(V.snd_timer);
    if (t) {
      t = (t - 1) & 0xffff; m.wr16(V.snd_timer, t);
      if (!t) { m.wr(V.snd_mode, mode - 1); fx = true; }
    }
    if (!fx) m.plat('snd_play', {});
  }
  if (fx) {
    m.plat('snd_fx_a', {}); m.plat('snd_fx_b', {});
    if (m.rd(V.snd_mode) !== 0xff) m.plat('snd_start', { de: 0x4800 });
  }
  m.wr16(V.next, 0x059f);
}

// этап 5 (059Fh): адрес панели — только вывод
function s5(m) { m.wr16(V.next, 0x05b7); }

// этап 6 (05B7h): опрос ввода; через кадр — перемигивание цветов (тетрады байтов в коде рисования по таблице
// 0712h, 6 байтов из 0736h/073Ch); при включённой панели (064Ah) — пауза: клавиша (строка клавиатуры, бит 3)
// при нечётном режиме звука ставит паузу и режим FFh, любое направление/огонь снимает (режим 1)
function s6(m) {
  m.plat('read_input', {});
  const c = (m.rd(V.blink) + 1) & 0xff;
  m.wr(V.blink, c);
  if (c & 1) {
    const k = ((c >> 1) & 1) * 6;
    m.wr16(V.blink_sp, m.r.sp);
    let t = V.blink_tab;
    for (let i = 0; i < 12; i++, t += 2) { const a = m.rd16(t), v = m.rd(a); m.wr(a, ((v >> 4) | (v << 4)) & 0xff); }
    for (let i = 0; i < 6; i++, t += 2) m.wr(m.rd16(t), m.rd(V.blink_src + k + i));
  }
  if (m.rd(V.isr_064a)) {
    let e = ~m.inp() & 0xff;
    if (!(m.rd(V.snd_mode) & 1)) e = 0;
    if (!m.rd(V.pause) && (e & 0x08)) { m.wr(V.pause, 1); m.wr(V.snd_mode, 0xff); }
    if (m.rd(V.pause) === 1 && m.rd(V.joy)) { m.wr(V.pause, 0); m.wr(V.snd_mode, 1); }
  }
  m.wr16(V.next, 0x0484);
}

module.exports = {
  V, s1, s2, s3, s4, s5, s6,
  procs: [
    { at: 0x0484, name: 'isr_s1', isr: true, fn: (m) => { s1(m); } },
    { at: 0x04cf, name: 'isr_s2', isr: true, fn: (m) => { s2(m); } },
    { at: 0x04e3, name: 'isr_s3', isr: true, fn: (m) => { s3(m); } },
    { at: 0x0514, name: 'isr_s4', isr: true, fn: (m) => { s4(m); } },
    { at: 0x059f, name: 'isr_s5', isr: true, fn: (m) => { s5(m); } },
    { at: 0x05b7, name: 'isr_s6', isr: true, fn: (m) => { s6(m); } },
  ],
};
