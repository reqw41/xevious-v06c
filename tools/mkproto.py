#!/usr/bin/env python3
"""Данные прототипа прокрутки (src/proto_scroll.asm) -> build/gen/proto_data.inc.

Цвета Вектора: индекс c = 2*бит(C000) + бит(E000); c = перо CPC ^ 3:
  0 чёрный (перо 3), 1 бледно-жёлтый (2), 2 голубой (1), 3 зелёный (0).
TILES  0x1000: 181 тайл × 16 строк × [C лев, C прав, E лев, E прав] = 64 байта.
MAP    0x4000: карта CPC 64×128 как есть (строка 0 — верх, игра идёт снизу вверх).
SPR    0x6000: спрайт 16×16: 16 строк × [маска л, C л, E л, маска п, E п, C п]; маска 1 = оставить экран.
HUD    0x6200: 2 плоскости × 32 столбца × 9 байт (8 строк сверху вниз + 0 — стирание строки под панелью).
"""
import os
ROOT = os.path.join(os.path.dirname(__file__), '..')
U = os.path.join(ROOT, 'ref', 'cpc', 'unz')
g = open(os.path.join(U, 'xeviousg.dat'), 'rb').read()
m = open(os.path.join(U, 'xevlevel.dat'), 'rb').read()[:0x2000]
NT = 181

def cpc_row(b4):  # 4 байта MODE 1 -> 16 перьев
    px = []
    for b in b4:
        px += [((b >> (7 - k)) & 1) | (((b >> (3 - k)) & 1) << 1) for k in range(4)]
    return px

def planes(cols):  # 16 индексов Вектора -> C л, C п, E л, E п
    out = []
    for bit in (1, 0):
        for half in (0, 8):
            v = 0
            for k in range(8):
                if (cols[half + k] >> bit) & 1: v |= 0x80 >> k
            out.append(v)
    return out

tiles = []
for t in range(NT):
    for r in range(16):
        tiles += planes([p ^ 3 for p in cpc_row(g[t * 64 + r * 4: t * 64 + r * 4 + 4])])

# спрайты-заглушки: . прозрачно, K чёрный, Y жёлтый, B голубой, G зелёный
CI = {'K': 0, 'Y': 1, 'B': 2, 'G': 3}
SHIP = """
.......YY.......
.......YY.......
......YKKY......
......YBBY......
.....YYBBYY.....
.....YKYYKY.....
..Y..YKYYKY..Y..
..Y.YYYYYYYY.Y..
.YYYYKYYYYKYYYY.
YYBYYKYYYYKYYBYY
YBBYYYYKKYYYYBBY
YBYY.YYKKYY.YYBY
YY...YK..KY...YY
.....YK..KY.....
....YY....YY....
................"""
CROSS = """
................
................
...KKKK..KKKK...
...KYY....YYK...
...KY......YK...
...K........K...
................
.......YY.......
.......YY.......
................
...K........K...
...KY......YK...
...KYY....YYK...
...KKKK..KKKK...
................
................"""

def sprite(art):
    rows = [r for r in art.strip('\n').split('\n')]
    out = []
    for r in rows:
        cols = [CI.get(ch, 0) for ch in r]
        mask = [ch == '.' for ch in r]
        ml = mr = 0
        for k in range(8):
            if mask[k]: ml |= 0x80 >> k
            if mask[8 + k]: mr |= 0x80 >> k
        p = planes(cols)                       # C л, C п, E л, E п
        out += [ml, p[0], p[2], mr, p[3], p[1]]  # порядок вывода: левый C, E; правый E, C
    return out

# панель: «1UP 00   HI 50000   AREA 1» шрифтом 5×7 в клетке 8×8
FONT = {
 '0': ["01110","10001","10011","10101","11001","10001","01110"],
 '1': ["00100","01100","00100","00100","00100","00100","01110"],
 '5': ["11111","10000","11110","00001","00001","10001","01110"],
 'A': ["01110","10001","10001","11111","10001","10001","10001"],
 'E': ["11111","10000","10000","11110","10000","10000","11111"],
 'H': ["10001","10001","10001","11111","10001","10001","10001"],
 'I': ["01110","00100","00100","00100","00100","00100","01110"],
 'P': ["11110","10001","10001","11110","10000","10000","10000"],
 'R': ["11110","10001","10001","11110","10100","10010","10001"],
 'U': ["10001","10001","10001","10001","10001","10001","01110"],
 ' ': ["00000"] * 7,
}
TEXT = " 1UP 00     HI 50000     AREA 1 "
COLS = {'1UP': 2, 'HI': 1, 'AREA': 1}
hud = [[0] * 256 for _ in range(8)]
for i, ch in enumerate(TEXT[:32]):
    c = 2 if (i < 4 or ch.isdigit()) else 1
    for y, row in enumerate(FONT[ch]):
        for x, bit in enumerate(row):
            if bit == '1': hud[y][i * 8 + 1 + x] = c
hudb = []
for bit in (1, 0):
    for col in range(32):
        for y in range(8):
            v = 0
            for k in range(8):
                if (hud[y][col * 8 + k] >> bit) & 1: v |= 0x80 >> k
            hudb.append(v)
        hudb.append(0)

def pal_byte(r, g_, b):  # 0..255 -> б0-2 R, б3-5 G, б6-7 B
    return (r * 7 // 255) | ((g_ * 7 // 255) << 3) | ((b * 3 // 255) << 6)
BASE = [pal_byte(0, 0, 0), pal_byte(255, 255, 128), pal_byte(0, 128, 255), pal_byte(0, 128, 0)]
PAL = [BASE[i & 3] for i in range(16)]

def db(label, data):
    s = [f'{label}:'] if label else []
    for i in range(0, len(data), 16):
        s.append('\tdb\t' + ','.join(str(x) for x in data[i:i + 16]))
    return '\n'.join(s)

os.makedirs(os.path.join(ROOT, 'build', 'gen'), exist_ok=True)
with open(os.path.join(ROOT, 'build', 'gen', 'proto_data.inc'), 'w') as f:
    f.write('; создано tools/mkproto.py — не править\n')
    f.write('\torg\t0x1000\n' + db('TILES', tiles) + '\n')
    f.write('\torg\t0x4000\n' + db('MAP', list(m)) + '\n')
    f.write('\torg\t0x6000\n' + db('SPR_SHIP', sprite(SHIP)) + '\n')
    f.write('\torg\t0x6100\n' + db('SPR_CROSS', sprite(CROSS)) + '\n')
    f.write('\torg\t0x6500\n' + db('PAL', PAL) + '\n')
# панель — прямой код переноса: в каждой плоскости столбец с буквами — 8 строк (ld (hl),n / dec l),
# пустой — только верхняя строка (туда въехала нижняя строка поля). Строка под панелью и так 0 (шрифт 7 строк).
code = ['; создано tools/mkproto.py — не править', 'draw_hud:', '\tld\ta,(scroll)', '\tsub\tFIELD_H', '\tld\tc,a', '\tld\tb,0']
nwr = 0
for bit, base in ((1, 'SCR_C'), (0, 'SCR_E')):
    code.append(f'\tld\th,{base}')
    for col in range(32):
        vals = []
        for y in range(8):
            v = 0
            for k in range(8):
                if (hud[y][col * 8 + k] >> bit) & 1: v |= 0x80 >> k
            vals.append(v)
        code.append('\tld\tl,c')
        if any(vals):
            for i, v in enumerate(vals):
                code.append('\tld\t(hl),b' if v == 0 else f'\tld\t(hl),{v}')
                if i < 7: code.append('\tdec\tl')
            nwr += 8
        else:
            code.append('\tld\t(hl),b'); nwr += 1
        if col < 31: code.append('\tinc\th')
code.append('\tret')
open(os.path.join(ROOT, 'build', 'gen', 'hud_draw.inc'), 'w').write('\n'.join(code) + '\n')
print('панель: записей', nwr)
print('тайлы', len(tiles), 'карта', len(m), 'панель', len(hudb), 'палитра', [hex(x) for x in BASE])
