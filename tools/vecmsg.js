#!/usr/bin/env node
'use strict';
// Кромка надписей из собственного шрифта; исходный рисунок остаётся в font.asm.
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const letters = [...fs.readFileSync(path.join(root, 'src/vec/font.asm'), 'utf8').matchAll(/^\s*db\s+([^;]+)/gm)]
  .map(m => m[1].trim().split(',').map(Number));
const alphabet = 'PLAYERONDGMV ';
// Буквы в игре — только нужные (панель 1UP/AREA, надписи на поле, HIGH SCORE титула); весь алфавит — рисунок
// в font.asm (после букв — знаки © и точка, CH_CPY и CH_DOT). Код знака для font_adr — 13 + номер.
const LTR = 'ABCDEFGHIKLMNOPRSTUVWY', SYM = { CPY: 26, DOT: 27 };
{
  const list = [...[...LTR].map((ch) => [ch, ch.charCodeAt(0) - 65]), ...Object.entries(SYM)];
  let s = '; tools/vecmsg.js: буквы игры (рисунок — src/vec/font.asm), код знака = 13 + номер\nLETTERS:\n';
  for (const [ch, k] of list) s += `\tdb\t${letters[k].join(',')}\t; ${ch}\n`;
  for (const [i, [ch]] of list.entries()) s += `CH_${ch}\tequ\t${13 + i}\nLTR_${ch}\tequ\tLETTERS+${7 * i}\n`;
  fs.writeFileSync(path.join(root, 'build/gen/vec_letters.inc'), s);
}
let out = '; tools/vecmsg.js: адрес шрифта и девять масок кромки\nMSG_MASKS:\n';
for (const ch of alphabet) {
  const glyph = ch === ' ' ? Array(7).fill(0) : letters[ch.charCodeAt(0) - 65];
  const rows = [0, 0, ...glyph, 0, 0];
  const masks = Array.from({length: 9}, (_, i) => {
    const v = rows[i] | rows[i + 1] | rows[i + 2];
    return (~(v | (v << 1) | (v >>> 1))) & 255;
  });
  out += `\tdw\t${ch === ' ' ? 'HUD_FONT+70' : 'LTR_' + ch}\t; ${ch}\n`;
  out += '\tdb\t' + masks.join(',') + '\n';
}
fs.writeFileSync(path.join(root, 'build/gen/vec_msg.inc'), out);
let strings = '; tools/vecmsg.js: смещения в MSG_MASKS, конец FFh\n';
for (const [name, text] of [['S_PL1', 'PLAYER ONE'], ['S_RDY', 'READY'], ['S_OVER', 'GAME OVER']]) {
  strings += name + ':\tdb\t' + [...text].map(c => alphabet.indexOf(c) * 11).concat(255).join(',') + '\n';
}
fs.writeFileSync(path.join(root, 'build/gen/vec_msgstr.inc'), strings);
