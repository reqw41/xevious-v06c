#!/usr/bin/env node
'use strict';
/**
 * Релизный образ со сжатой игрой и полноцветной заставкой (rom/Xevious-v06c.rom, загрузка с 0100h).
 * Игра (build/xevious.rom, 0100h–BFFFh) при старте ещё сжата, поэтому весь экран 8000h–FFFFh (4 плоскости,
 * 16 цветов) свободен под заставку: build/gen/splash.bin (tools/vecsplash.py) или, без своей картинки,
 * build/gen/tload_idx.bin (загрузочный экран CPC, tools/vectitle.js).
 *
 * Память образа:  0100h  JP boot
 *                 0103h  поток игры (LZ, обратный: читается и пишется сверху вниз)
 *                 BOOT   загрузчик, хвост картинки, распаковщик игры (копируется в 0040h)
 *                 ...    поток картинки (LZ, прямой) — в конце, до FFFFh
 * Старт: картинка распаковывается на месте (вперёд с 8000h), до нажатия клавиши; палитра — чёрная; распаковщик
 * игры — в 0040h (игра туда не пишет), игра распаковывается на месте назад от BFFFh; нижние байты игры (под JP и
 * отступ) — из распаковщика; JP 0100h. Отступы распаковки на месте проверяются моделью потока при сборке.
 */
const fs = require('fs');
const path = require('path');
const { pack, walk } = require('./vec/lz.js');
const { build } = require('./vec/asm.js');
const ROOT = path.resolve(__dirname, '..');
const GEN = path.join(ROOT, 'build/gen');
const H = (v) => '0x' + v.toString(16);

const rom = fs.readFileSync(path.join(ROOT, 'build/xevious.rom'));
const GAME_END = 0xc000;
if (rom.length > GAME_END - 0x100 && rom.subarray(GAME_END - 0x100).some((b) => b)) throw new Error('игра заходит за BFFFh');
const game = Buffer.alloc(GAME_END - 0x100);
rom.copy(game, 0, 0, Math.min(rom.length, game.length));

const spf = fs.existsSync(path.join(GEN, 'splash.bin')) ? 'splash.bin' : 'tload_idx.bin';
const sp = fs.readFileSync(path.join(GEN, spf));
const pic = Buffer.alloc(0x8000);                     // 8000h: бит 3 индекса, A000h: 2, C000h: 1, E000h: 0
for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
  const c = sp[y * 256 + x], a = (x >> 3) * 256 + (255 - y), bit = 0x80 >> (x & 7);
  for (let p = 0; p < 4; p++) if (c & (8 >> p)) pic[p * 0x2000 + a] |= bit;
}
const PALP = sp.subarray(65536, 65552);

// прямой поток картинки в конце памяти: запись (8000h + o) только ниже непрочитанного (A + i)
let k1 = 0, s1;
for (;;) {
  const n = 0x8000 - k1; s1 = pack(pic.subarray(0, n));
  const A = 0x10000 - s1.length; let d = 0;
  walk(s1, n, (i, o) => { d = Math.max(d, 0x8000 + o - (A + i) + 1); });
  if (d <= 0) break;
  k1 += d;
}
// обратный поток игры снизу (с 0103h, читается сверху вниз): запись (BFFFh − o) только выше непрочитанного (T − i)
const Z2 = 0x103;
let k2 = 0, s2;
for (;;) {
  const src = Buffer.from(game.subarray(Z2 - 0x100 + k2)).reverse(); s2 = pack(src);
  const T = Z2 + s2.length - 1; let d = 0;
  walk(s2, src.length, (i, o) => { d = Math.max(d, (T - i) - (GAME_END - 1 - o) + 1); });
  if (d <= 0) break;
  k2 += d;
}
const GLO = game.subarray(0, Z2 - 0x100 + k2);       // нижние байты игры: кладёт распаковщик в конце
const ZTOP = Z2 + s2.length - 1, GEND = Z2 + k2 - 1;  // GEND — первый адрес ниже распакованного

// распаковщик LZB (tools/vec/lz.js): HL — поток, DE — куда, до DE = end; dir: +1 вперёд, −1 назад (поток и запись
// сверху вниз, источник повтора — DE + смещение)
function unpAsm(lab, end, dir) {
  const st = dir > 0 ? 'inc' : 'dec', src = dir > 0
    ? '\tld\ta,e\n\tsub\tl\n\tld\tl,a\n\tld\ta,d\n\tsbc\ta,h\n\tld\th,a\n' : '\tadd\thl,de\n';
  return `${lab}:\tld\ta,e
\tcp\t${end & 255}
\tjp\tnz,${lab}g
\tld\ta,d
\tcp\t${(end >> 8) & 255}
\tjp\tz,${lab}x
${lab}g:\tld\ta,(hl)
\t${st}\thl
\tcp\t0x40
\tjp\tnc,${lab}m
\tinc\ta
\tld\tb,a
${lab}l:\tld\ta,(hl)
\tld\t(de),a
\t${st}\thl
\t${st}\tde
\tdec\tb
\tjp\tnz,${lab}l
\tjp\t${lab}
${lab}m:\tcp\t0x80
\tjp\tnc,${lab}m2
\tld\tb,a
\trrca
\trrca
\trrca
\trrca
\tand\t3
\tadd\ta,3
\tld\tc,a
\tld\ta,b
\tand\t15
\tld\tb,a
\tjp\t${lab}ofs
${lab}m2:\tcp\t0xc0
\tjp\tnc,${lab}m3
\tand\t63
\tadd\ta,2
\tld\tc,a
\tld\tb,0
${lab}ofs:\tld\ta,(hl)
\t${st}\thl
\tpush\thl
\tld\tl,a
\tld\th,b
\tinc\thl
\tld\tb,0
\tjp\t${lab}src
${lab}m3:\tand\t63
\tadd\ta,3
\tld\tc,a
\tld\tb,0
\tcp\t66
\tjp\tnz,${lab}s
\tld\ta,(hl)
\t${st}\thl
\tadd\ta,c
\tld\tc,a
\tjp\tnc,${lab}s
\tinc\tb
${lab}s:\tpush\tbc
\tld\tc,(hl)
\t${st}\thl
\tld\tb,(hl)
\t${st}\thl
\tex\t(sp),hl
\tpush\thl
\tld\th,b
\tld\tl,c
\tpop\tbc
${lab}src:
${src}${lab}c:\tld\ta,(hl)
\tld\t(de),a
\t${st}\thl
\t${st}\tde
\tdec\tbc
\tld\ta,b
\tor\tc
\tjp\tnz,${lab}c
\tpop\thl
\tjp\t${lab}
`;
}
const db = (b) => Array.from({ length: Math.ceil(b.length / 16) }, (_, i) => '\tdb\t' + [...b.subarray(i * 16, i * 16 + 16)].join(',') + '\n').join('');
fs.mkdirSync(path.join(ROOT, 'build/boot'), { recursive: true });
const asm = (name, text, base) => {
  const f = path.join(ROOT, 'build/boot', name);
  fs.writeFileSync(f, text);
  return build(f, { base });
};
// Нижний отступ обычно 4 байта: непосредственные SHLD короче цикла и его данных.
const gloAsm = [];
for (let i = 0; i + 1 < GLO.length; i += 2) {
  gloAsm.push(`\tld\thl,${H(GLO[i] | GLO[i + 1] << 8)}\n\tld\t(${H(0x100 + i)}),hl\n`);
}
if (GLO.length & 1) {
  const i = GLO.length - 1;
  gloAsm.push(`\tld\ta,${GLO[i]}\n\tld\t(${H(0x100 + i)}),a\n`);
}

// распаковщик игры (выполняется из 0040h: ни игра, ни её поток туда не пишут; стек — под 0100h)
const UB = asm('unpb.asm', `\torg\t0x40
ub:\tld\tsp,0x100
\tld\thl,${H(ZTOP)}
\tld\tde,${H(GAME_END - 1)}
${unpAsm('u', GEND, -1)}ux:
${gloAsm.join('')}\tjp\t0x100
`, 0x40);
const ubImg = UB.img.subarray(0x40 - 0x40);
if (0x40 + ubImg.length > 0xf0) throw new Error(`распаковщик игры не помещается под стек: ${ubImg.length} Б`);

const BOOT = ZTOP + 1;
const A1 = 0x10000 - s1.length;
const bootSrc = (k) => `\torg\t${H(BOOT)}
boot:\tdi
\tld\tsp,0x100
\tld\thl,0xc9fb\t\t; RST 7: EI; RET
\tld\t(0x38),hl
\tld\ta,0x88
\tout\t(0),a
\tcall\tsetpal
\tld\ta,0xff
\tout\t(3),a
\tld\thl,${H(A1)}
\tld\tde,0x8000
\tcall\tunpf
${k1 ? `\tld\thl,pict\n\tld\tde,${H(0x10000 - k1)}\n\tld\tb,${k1}\n\tcall\tcpy\n` : ''}\tld\thl,palp
\tld\ta,0x7e\t; LD A,(HL): цветная палитра
\tld\t(palbyte),a
\tcall\tsetpal
\tld\ta,0x83
\tout\t(4),a
\tld\ta,0x9f
\tout\t(5),a
\tin\ta,(6)
\tld\t(joy0),a
.wk:\tcall\tframe
\tcall\tanykey
\tjp\tz,.wk
.wr:\tcall\tframe
\tcall\tanykey
\tjp\tnz,.wr
\tld\ta,0xaf\t; XOR A: чёрная палитра
\tld\t(palbyte),a
\tcall\tsetpal
\tld\thl,ubb
\tld\tde,0x40
\tld\tb,${ubImg.length}
\tcall\tcpy
\tjp\t0x40
cpy:\tld\ta,(hl)
\tld\t(de),a
\tinc\thl
\tinc\tde
\tdec\tb
\tjp\tnz,cpy
\tret
frame:\tei
\thalt
\tdi
\tret
; frame/RST7 сохраняют HL; palbyte выбирает LD A,(HL) или XOR A.
setpal:\tcall\tframe
\tld\tde,15
\tadd\thl,de
\tld\te,15
palloop:\tld\ta,e
\tout\t(2),a
palbyte:\txor\ta
\tout\t(0x0c),a
\tout\t(0x0c),a
\tdec\thl
\tdec\te
\tjp\tp,palloop
\txor\ta
\tout\t(2),a
\tret
; любая клавиша (все ряды) или джойстик «П»; порт 03 — ещё и прокрутка: вернуть FFh
anykey:\tld\ta,0x8a
\tout\t(0),a
\txor\ta
\tout\t(3),a
\tin\ta,(2)
\tcpl
\tld\tb,a
\tld\ta,0x88
\tout\t(0),a
\tld\ta,0xff
\tout\t(3),a
\txor\ta
\tout\t(2),a
\tin\ta,(6)
\tld\thl,joy0
\txor\t(hl)
\tld\tc,a
\tand\t0x30
\tjp\tz,.j
\tld\tc,0
.j:\tld\ta,c
\tand\t0xcf
\tor\tb
\tret
${unpAsm('unpf', 0x10000 - k1, 1)}unpfx:\tret
joy0:\tdb\t0
palp:
${db(PALP)}pict:
${db(pic.subarray(0x8000 - k1))}ubb:
${db(ubImg)}boot_end:
`;
const BT = asm('boot.asm', bootSrc(k1), BOOT);
const bootImg = BT.img.subarray(BOOT - BOOT);
if (BOOT + bootImg.length > 0x8000) throw new Error(`загрузчик заходит в экран: до ${H(BOOT + bootImg.length)}`);

const img = Buffer.alloc(0x10000 - 0x100);
img[0] = 0xc3; img[1] = BOOT & 255; img[2] = BOOT >> 8;
for (let j = 0; j < s2.length; j++) img[ZTOP - j - 0x100] = s2[j];
bootImg.copy(img, BOOT - 0x100);
s1.copy(img, A1 - 0x100);
fs.mkdirSync(path.join(ROOT, 'rom'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'build/xevious_boot.rom'), img);
fs.writeFileSync(path.join(ROOT, 'rom/Xevious-v06c.rom'), img);
console.log(`загрузчик (${spf}): игра ${game.length} -> ${s2.length} Б (0103h–${H(ZTOP)}, отступ ${k2}), ` +
  `загрузчик ${H(BOOT)}–${H(BOOT + bootImg.length - 1)}, картинка 32768 -> ${s1.length} Б (с ${H(A1)}, хвост ${k1}); ` +
  `свободно ${A1 - BOOT - bootImg.length} Б`);
