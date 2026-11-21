#!/usr/bin/env python3
"""Крупнейшие нетронутые куски disc.bin по build/cov/{code,data}.txt: covgaps.py [N]"""
import sys, os
R = os.path.join(os.path.dirname(__file__), '..')
d = open(os.path.join(R, 'ref/cpc/files/disc.bin'), 'rb').read()
cov = set()
for f in ('code.txt', 'data.txt'):
    for l in open(os.path.join(R, 'build/cov', f)):
        a, b = [int(x, 16) for x in l.split()[0].split('-')]; cov.update(range(a, b + 1))
gaps, s = [], None
for a in range(0x100, 0x3f36):
    t = a < 0x3f35 and a not in cov
    if t and s is None: s = a
    elif not t and s is not None: gaps.append((s, a)); s = None
for s, e in sorted(gaps, key=lambda g: g[0] - g[1])[:int(sys.argv[1]) if len(sys.argv) > 1 else 15]:
    print(f'{s:04x}-{e - 1:04x} {e - s:5d}')
print('дыр', len(gaps), 'байт', sum(e - s for s, e in gaps))
