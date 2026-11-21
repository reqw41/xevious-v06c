#!/usr/bin/env python3
"""Данные образа Вектора из файлов CPC (ref/cpc/unz) -> build/gen/vec_data.inc (только build/, в репозиторий не идёт).

Цвета Вектора: индекс c = 2*бит(C000) + бит(E000); c = перо CPC ^ 3 (0 чёрный, 1 бледно-жёлтый, 2 голубой,
3 зелёный), палитра от плоскостей 8000h/A000h не зависит.
  VPAL     16 байт палитры
  TILEMAP  256 байт (выровнено): номер тайла CPC (адрес картинки C000h + 64·номер) -> номер в TILES, FFh — нет
  TILES    тайлы 16×16: 16 строк × [C лев, C прав, E лев, E прав] = 64 байта
  MAPIDX, MAPPAIR, MAPZ — слой тайлов карты CPC 64×128, строки сжаты парами байтов (каждая отдельно):
           байт < B5h — номер тайла, B5h..FFh — пара MAPPAIR[код − B5h] (раскрывается рекурсивно);
           MAPIDX — 128 адресов строк (распаковка — map_ptr в src/vec/platform.asm)
  OVLT     тайлы наложения (xeviougt + 1000h, коды 00h..3Bh) в виде TILES; прозрачная четвёрка точек
           (нулевой байт CPC) — полубайт F в обеих плоскостях
Метки размещает src/vec/game.asm (org перед include).
"""
import os, sys
ROOT = os.path.join(os.path.dirname(__file__), '..')
U = os.path.join(ROOT, 'ref', 'cpc', 'unz')
g = open(os.path.join(U, 'xeviousg.dat'), 'rb').read()
lvl = open(os.path.join(U, 'xevlevel.dat'), 'rb').read()
tl = lvl[:0x2000]

def cpc_row(b4):
    px = []
    for b in b4:
        px += [((b >> (7 - k)) & 1) | (((b >> (3 - k)) & 1) << 1) for k in range(4)]
    return px

def planes(cols):
    out = []
    for bit in (1, 0):
        for half in (0, 8):
            v = 0
            for k in range(8):
                if (cols[half + k] >> bit) & 1: v |= 0x80 >> k
            out.append(v)
    return out

# тайлы: из карты + картинки, которые логика выводит по адресу (следы целей, флаг, пустой и т. п.)
used = sorted(set(tl) | {21, 22, 36, 37, 39} | set(range(246, 256)))
tmap = [0xff] * 256
tiles = []
for i, t in enumerate(used):
    tmap[t] = i
    for r in range(16):
        tiles += planes([p ^ 3 for p in cpc_row(g[t * 64 + r * 4: t * 64 + r * 4 + 4])])

def pal_byte(r, g_, b):
    return (r * 7 // 255) | ((g_ * 7 // 255) << 3) | ((b * 3 // 255) << 6)
BASE = [pal_byte(0, 0, 0), pal_byte(255, 255, 128), pal_byte(0, 128, 255), pal_byte(0, 128, 0)]

def db(label, data):
    s = [f'{label}:']
    for i in range(0, len(data), 16):
        s.append('\tdb\t' + ','.join(str(x) for x in data[i:i + 16]))
    return '\n'.join(s) + '\n'

out = '; данные образа Вектора (tools/vecdata.py) — из файлов игры, не править\n'
out += 'VDATA_PAL:\n' + db('VPAL', [BASE[i & 3] for i in range(16)])
out += '\tif 0\n\tendif\n' if False else ''
open(os.path.join(ROOT, 'build', 'gen', 'vec_pal.inc'), 'w').write(out)
open(os.path.join(ROOT, 'build', 'gen', 'vec_tilemap.inc'), 'w').write(db('TILEMAP', tmap))
# TADR_H/TADR_L (по 256, с границы страницы): адрес тайла TILES_AT + 64·номер; старший 0 — тайла нет
th = ['0' if v == 0xff else f'(TILES_AT+{64 * v})>>8' for v in tmap]
tlo = ['0' if v == 0xff else f'(TILES_AT+{64 * v})&255' for v in tmap]
open(os.path.join(ROOT, 'build', 'gen', 'vec_tadr.inc'), 'w').write(
    'TADR_H:\n' + ''.join('\tdb\t' + ','.join(th[i:i + 8]) + '\n' for i in range(0, 256, 8)) +
    'TADR_L:\n' + ''.join('\tdb\t' + ','.join(tlo[i:i + 8]) + '\n' for i in range(0, 256, 8)))
open(os.path.join(ROOT, 'build', 'gen', 'vec_tiles.inc'), 'w').write(db('TILES', tiles))
# карта: пары байтов (BPE) по строкам
FIRST = 0xb5
assert max(tl) < FIRST, 'номер тайла залез на коды пар'
rows = [list(tl[r * 64:r * 64 + 64]) for r in range(128)]
pairs = []
for code in range(FIRST, 0x100):
    cnt = {}
    for r in rows:
        for i in range(len(r) - 1):
            cnt[(r[i], r[i + 1])] = cnt.get((r[i], r[i + 1]), 0) + 1
    if not cnt:
        break
    pr, c = max(cnt.items(), key=lambda x: (x[1], x[0]))
    if c < 4:
        break
    pairs.append(pr)
    for k, r in enumerate(rows):
        o, i = [], 0
        while i < len(r):
            if i < len(r) - 1 and (r[i], r[i + 1]) == pr:
                o.append(code); i += 2
            else:
                o.append(r[i]); i += 1
        rows[k] = o
def expand(v):
    return [v] if v < FIRST else expand(pairs[v - FIRST][0]) + expand(pairs[v - FIRST][1])
for r in range(128):
    assert sum((expand(v) for v in rows[r]), []) == list(tl[r * 64:r * 64 + 64])
m = 'MAPIDX:\n' + ''.join(f'\tdw\tMAPZ+{sum(len(x) for x in rows[:r])}\n' for r in range(128))
m += db('MAPPAIR', [b for pr in pairs for b in pr])
m += db('MAPZ', [b for r in rows for b in r])
open(os.path.join(ROOT, 'build', 'gen', 'vec_map.inc'), 'w').write(m)
zlen = sum(len(r) for r in rows) + 2 * len(pairs) + 256

gt = open(os.path.join(U, 'xeviougt.dat'), 'rb').read()
ovl, oix, seen = [], [], {}
for k in range(0x3c):                      # одинаковые картинки — одна (OVLT_IX: код -> номер в OVLT)
    raw = gt[0x1000 + k * 64: 0x1000 + k * 64 + 64]
    if raw not in seen:
        seen[raw] = len(seen)
        for r in range(16):
            ovl += planes([p ^ 3 for p in cpc_row(raw[r * 4: r * 4 + 4])])
    oix.append(seen[raw])
open(os.path.join(ROOT, 'build', 'gen', 'vec_ovlt.inc'), 'w').write(db('OVLT_IX', oix) + db('OVLT', ovl))

# отметки на наземных целях (mark_a 1291h, mark_b 12C1h, mark_dead 1248h): байты CPC из кода игры -> пункты
# [dy, dc, полубайты C|E] (dc — байт CPC от (X >> 1) + 1), конец — FFh
dsk = open(os.path.join(ROOT, 'ref', 'cpc', 'files', 'disc.bin'), 'rb').read()
B = lambda a: dsk[a - 0x100]
def nib(b):
    c = e = 0
    for k, p in enumerate(cpc_row([b])):
        v = p ^ 3
        if v & 2: c |= 8 >> k
        if v & 1: e |= 8 >> k
    return (c << 4) | e
ma = [(5, 0, B(0x12a1)), (5, 1, B(0x12a4))] + [(5 + i, d, B(a)) for i in range(1, 5) for d, a in ((0, 0x12b0), (1, 0x12b3))] + \
     [(10, 1, B(0x12bc)), (10, 0, B(0x12bf))]
mb = [(10 - i, d, B(0x12e3 + 2 * i + d)) for i in range(6) for d in (0, 1)]
md = [(6, 0, B(0x125c)), (8, 1, B(0x125c)), (10, 0, B(0x125c))]
mk = ''
for name, items in (('MARK_A', ma), ('MARK_B', mb), ('MARK_D', md)):
    mk += db(name, [v for dy, dc, b in items for v in (dy, dc, nib(b))] + [0xff])
open(os.path.join(ROOT, 'build', 'gen', 'vec_marks.inc'), 'w').write(mk)
print(f'тайлов {len(used)} ({len(tiles)} Б), карта {zlen} Б (пар {len(pairs)}), наложение {len(ovl)} Б')
