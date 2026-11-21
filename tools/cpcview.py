#!/usr/bin/env python3
"""Просмотр данных CPC MODE 1 серыми. cpcview.py in out.png bytes_per_line [scr|lin]
scr — раскладка экрана CPC (8 блоков по 2048), lin — подряд по строкам."""
import sys
from PIL import Image
d = open(sys.argv[1], 'rb').read(); bpl = int(sys.argv[3]); mode = sys.argv[4] if len(sys.argv) > 4 else 'scr'
pal = [(0,0,0),(255,80,80),(80,255,80),(255,255,255)]
rows = (len(d) // bpl) if mode == 'lin' else (len(d)//2048)*(2048//bpl)
im = Image.new('RGB', (bpl*4, rows))
for y in range(rows):
    base = ((y & 7) * 2048 + (y >> 3) * bpl) if mode == 'scr' else y * bpl
    for x in range(bpl):
        if base + x >= len(d): continue
        b = d[base + x]
        for i in range(4):
            im.putpixel((x*4+i, y), pal[((b >> (7-i)) & 1) | (((b >> (3-i)) & 1) << 1)])
im = im.resize((im.width*2, im.height*2), Image.NEAREST); im.save(sys.argv[2])
