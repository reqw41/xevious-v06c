#!/usr/bin/env python3
"""Заставка загрузчика Вектора из картинки пользователя (ref/splash/xevious_splash.png, не в git): без логотипа
namco, 256×256, 16 цветов палитры Вектора (R3G3B2, четыре плоскости), упорядоченный растр.
Вывод: build/gen/splash.bin — 65536 индексов 0..15 (строка за строкой) + 16 байт палитры Вектора.
  python3 tools/vecsplash.py [--preview файл.png] [--dither 24]"""
import sys, os
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
args = sys.argv[1:]
def opt(k, d=None):
    return args[args.index(k) + 1] if k in args else d
im = Image.open(os.path.join(ROOT, 'ref/splash/xevious_splash.png')).convert('RGB')
W, H = im.size
sx, sy = W / 1448, H / 1086
# логотип namco (правый нижний угол) — закрыть травой с тех же столбцов выше (между октагоном и дорожкой)
box = (int(940 * sx), int(980 * sy), int(1395 * sx), int(1055 * sy))
im.paste(im.crop((box[0], int(730 * sy), box[2], int(730 * sy) + box[3] - box[1])), box[:2])
im = im.resize((256, 256), Image.LANCZOS)

def vec(c):          # цвет -> уровни Вектора R,G 0..7, B 0..3
    return (min(7, round(c[0] * 7 / 255)), min(7, round(c[1] * 7 / 255)), min(3, round(c[2] * 3 / 255)))
def rgb(v):
    return (v[0] * 255 // 7, v[1] * 255 // 7, v[2] * 255 // 3)
# 16 опорных цветов — медианным сечением, затем к уровням Вектора (повторы — следующими по частоте)
q = im.quantize(colors=32, method=Image.Quantize.MEDIANCUT)
pq = q.getpalette()[:96]
cnt = sorted(q.getcolors(), reverse=True)
pal = []
for n, i in cnt:
    v = vec(pq[3 * i:3 * i + 3])
    if v not in pal:
        pal.append(v)
    if len(pal) == 16:
        break
while len(pal) < 16:
    pal.append((0, 0, 0))
pal.sort(key=lambda v: (v == (0, 0, 0)) * -1)      # чёрный — индекс 0 (рамка)
P = [rgb(v) for v in pal]
B = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]
amt = float(opt('--dither', '24'))
px = im.load()
idx = bytearray(65536)
cache = {}
for y in range(256):
    for x in range(256):
        t = (B[y & 3][x & 3] / 16 - 0.47) * amt
        r, g, b = px[x, y]
        key = (int(r + t) >> 2, int(g + t) >> 2, int(b + t) >> 2)
        c = cache.get(key)
        if c is None:
            r2, g2, b2 = key[0] * 4, key[1] * 4, key[2] * 4
            c = min(range(16), key=lambda i: (r2 - P[i][0]) ** 2 * 3 + (g2 - P[i][1]) ** 2 * 4 + (b2 - P[i][2]) ** 2 * 2)
            cache[key] = c
        idx[y * 256 + x] = c
vb = bytes(v[0] | (v[1] << 3) | (v[2] << 6) for v in pal)
os.makedirs(os.path.join(ROOT, 'build/gen'), exist_ok=True)
open(os.path.join(ROOT, 'build/gen/splash.bin'), 'wb').write(bytes(idx) + vb)
if opt('--preview'):
    o = Image.new('RGB', (256, 256)); o.putdata([P[i] for i in idx]); o.resize((768, 768), Image.NEAREST).save(opt('--preview'))
print('заставка: 16 цветов', ' '.join('%d%d%d' % v for v in pal))
