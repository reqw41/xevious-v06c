#!/usr/bin/env python3
"""Карта Xevious CPC в PNG: тайлы 16x16 (xeviousg.dat, 64 байта), карта 64x128 (xevlevel.dat 0..0x1FFF).
cpcmap.py out.png [x0 ширина] — по умолчанию вся карта; палитра поля из игры: перья 16,17,03,14."""
import sys
from PIL import Image
HW = {0x16: (0, 128, 0), 0x17: (0, 128, 255), 0x03: (255, 255, 128), 0x14: (0, 0, 0)}
PAL = [HW[0x16], HW[0x17], HW[0x03], HW[0x14]]
R = __import__('os').path.join(__import__('os').path.dirname(__file__), '..', 'ref', 'cpc', 'unz')
g = open(R + '/xeviousg.dat', 'rb').read(); m = open(R + '/xevlevel.dat', 'rb').read()[:0x2000]
def tile(t):
    im = Image.new('RGB', (16, 16))
    for y in range(16):
        for xb in range(4):
            b = g[t * 64 + y * 4 + xb]
            for k in range(4): im.putpixel((xb * 4 + k, y), PAL[((b >> (7 - k)) & 1) | (((b >> (3 - k)) & 1) << 1)])
    return im
x0 = int(sys.argv[2]) if len(sys.argv) > 2 else 0; W = int(sys.argv[3]) if len(sys.argv) > 3 else 64
out = Image.new('RGB', (W * 16, 128 * 16)); cache = {}
for r in range(128):
    for c in range(W):
        t = m[r * 64 + (x0 + c) % 64]
        if t not in cache: cache[t] = tile(t)
        out.paste(cache[t], (c * 16, r * 16))
out.save(sys.argv[1]); print(out.size, 'тайлов использовано', len(cache), 'макс. номер', max(cache))
