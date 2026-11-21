#!/usr/bin/env python3
"""Лист графики MODE 1, данные подряд: cpcsheet.py in out.png bytes_per_row rows_per_col [offset]"""
import sys
from PIL import Image
d = open(sys.argv[1], 'rb').read(); w = int(sys.argv[3]); h = int(sys.argv[4]); off = int(sys.argv[5], 0) if len(sys.argv) > 5 else 0
d = d[off:]; pal = [(0,0,0),(255,80,80),(80,255,80),(255,255,255)]
nrows = len(d) // w; ncol = (nrows + h - 1) // h
im = Image.new('RGB', (ncol * (w*4+2), h), (40,40,90))
for r in range(nrows):
    cx, y = divmod(r, h)
    for x in range(w):
        b = d[r*w + x]
        for i in range(4):
            im.putpixel((cx*(w*4+2) + x*4+i, y), pal[((b >> (7-i)) & 1) | (((b >> (3-i)) & 1) << 1)])
im = im.resize((im.width*2, im.height*2), Image.NEAREST); im.save(sys.argv[2])
