'use strict';
// Граница с платформой: вывод на экран CPC и звук. На Векторе это будет своё; модель логики их только вызывает.
// args — что сверять на входе: регистры a..l, пары bc/de/hl, s0..s2 — слова стековых аргументов, b0/b2 — их младшие байты.
module.exports = {
  entries: [
    { at: 0x17c2, name: 'sfx', args: ['d', 'hl', 'e'] },          // канал D, L эффект, H ослабление, E нота
    { at: 0x1085, name: 'put_char', args: ['a', 'de'] },           // знак A по адресу экрана DE
    { at: 0x1121, name: 'put_digit', args: ['a', 'de'] },          // крупная цифра (номер зоны): A — знак, DE — экран
    { at: 0x0efd, name: 'draw_sprite', args: ['a', 'l', 's0', 's1'] },   // X, Y мира; спрайт, буфер фона
    { at: 0x1334, name: 'restore_16', args: ['a', 'l', 's0'] },          // вернуть фон 16 строк: X, Y, буфер
    { at: 0x0a30, name: 'draw_shot', args: ['a', 'l', 's0'] },           // выстрел игрока: X, Y, буфер фона
    { at: 0x0a92, name: 'restore_shot', args: ['a', 'l', 's0'] },
    { at: 0x0904, name: 'draw_bullet', args: ['a', 'l', 's0'] },         // пуля врага: X, Y, буфер фона
    { at: 0x0850, name: 'draw_bomb', args: ['a', 'l', 's0'] },           // бомба игрока
    { at: 0x13df, name: 'put_tile16', args: ['a', 'l', 's0'] },          // сохранить фон 16×16 под объект (буфер s0)
    { at: 0x0cab, name: 'draw_spark', args: ['a', 'l', 's0'] },          // сбиваемый снаряд (рисуется кодом)
    { at: 0x0c7c, name: 'restore_2x6', args: ['a', 'l', 's0'] },
    { at: 0x116e, name: 'restore_z23a', args: ['a', 'l', 's0'] },        // особые объекты зон 2–3: фон по размеру кадра
    { at: 0x11a5, name: 'restore_z23b', args: ['a', 'l', 's0'] },
    { at: 0x11e0, name: 'restore_z23c', args: ['a', 'l', 's0'] },
    { at: 0x079f, name: 'draw_z23a', args: ['a', 'l', 's0'] },
    { at: 0x0754, name: 'draw_z23b', args: ['a', 'l', 's0'] },
    { at: 0x07e6, name: 'draw_z23c', args: ['a', 'l', 's0', 's1'] },     // s1 — картинка 8580h/85C0h
    { at: 0x0c1a, name: 'restore_z48', args: ['a', 'l', 's0'] },         // особые объекты зон 4 и 8
    { at: 0x0ad5, name: 'draw_z48', args: ['a', 'l', 's0'] },
    { at: 0x0eae, name: 'draw_glyph', args: ['a', 'l', 's0', 's1'] },    // знак/кадр 8×8: s0 — картинка, s1 — буфер
    { at: 0x3394, name: 'print_text', args: ['a', 'l', 's0', 's1'] },
    { at: 0x33db, name: 'put_blocks', args: ['a', 'l', 's0', 'b2'], pop: 3 },    // s0 — блоки, b2 — их число
    { at: 0x2832, name: 'print_score', args: ['hl', 'de'] },
    { at: 0x1593, name: 'wait_vsync', args: [] },                      // ждать кадровый импульс
    { at: 0x12f0, name: 'draw_ground', args: ['a', 'l', 's0'] },         // картинка наземного объекта/взрыва по X, Y
    { at: 0x1291, name: 'mark_a', args: ['a', 'l'] },                    // мелкие отметки на наземных целях
    { at: 0x12c1, name: 'mark_b', args: ['a', 'l'] },
    { at: 0x1248, name: 'mark_dead', args: ['a', 'l', 'ix'], v80: { ix: 'de' } },           // след разбитой цели (по типу в IX+8)
    { at: 0x09b5, name: 'restore_small', args: ['a', 'l', 's0'] },       // вернуть фон малой картинки (бомба, пули)
    // начало жизни и экран: на Векторе своё
    { at: 0x042e, name: 'clear_hud', args: [] },                         // очистить страницу панели 8000h
    { at: 0x0450, name: 'hud_pens', args: ['hl', 'de'] },                // перья панели (растровое прерывание)
    { at: 0x0458, name: 'raster_mode', args: ['a'] },                    // режим растров панели/титула
    { at: 0x154d, name: 'ga_config', args: ['a'] },                      // конфигурация памяти CPC
    { at: 0x17b5, name: 'music_start', args: ['hl'] },                   // мелодия (модуль HL)
    { at: 0x1354, name: 'draw_tile16', args: ['a', 'l', 's0'] },         // тайл 16×16 карты: X, Y, картинка
    // конец игры: титул и рекорды — свои экраны на Векторе. fx: их записи в память JS берёт из Z80
    { at: 0x0423, name: 'clear_4000', args: [] },
    { at: 0x1552, name: 'draw_logo', args: [] },
    { at: 0x3647, name: 'name_entry', args: [], fx: true },               // ввод имени в таблицу рекордов
    { at: 0x3711, name: 'hiscore_table', args: [], fx: true },            // показ таблицы
    { at: 0x31a8, name: 'title_menu', args: [], fx: true },               // титул, меню, ожидание старта
    // прерывание: опрос ввода (итог — 3D42h и матрица 3D43h…) и звуковой драйвер (банк 4; hi — адрес вне 0000–3FFFh)
    { at: 0x1487, name: 'read_input', args: [], fx: true },
    { at: 0x400a, name: 'snd_play', args: [], hi: true },               // шаг мелодии
    { at: 0x475c, name: 'snd_fx_a', args: [], hi: true },               // шаг эффектов
    { at: 0x4772, name: 'snd_fx_b', args: [], hi: true },
    { at: 0x4707, name: 'snd_start', args: ['de'], hi: true },          // запустить модуль DE
  ],
};
