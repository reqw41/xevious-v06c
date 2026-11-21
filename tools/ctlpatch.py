#!/usr/bin/env python3
"""Вливает разметку из python-файла (словари N, E, V) в .ctl: метки, заголовки, описания, переменные.
  ctlpatch.py CTL NOTES.py
N: {адрес: (метка, заголовок, описание)} — заголовок у блока или N-заметка внутри блока;
E: {адрес: метка} — точки входа; V: [(адрес, длина, метка, комментарий)] — подблоки данных.
Повторный запуск перезаписывает заголовки, метки не дублирует."""
import re, sys
ctl, notes = sys.argv[1], sys.argv[2]
g = {}; exec(open(notes).read(), g)
N, E, V = g.get('N', {}), g.get('E', {}), g.get('V', [])
lines = open(ctl).read().splitlines()
blocks = {}
for i, l in enumerate(lines):
    m = re.match(r'^([bcgistuw]) \$([0-9A-F]{4})', l)
    if m: blocks[int(m.group(2), 16)] = i
starts = sorted(blocks)
def block_of(a):
    s = [b for b in starts if b <= a]; return s[-1]
labels = {}
for a, (lab, t, d) in N.items(): labels[a] = lab
labels.update(E)
for a, n, lab, c in V: labels[a] = lab
lines = [l for l in lines if not (re.match(r'^@ \$([0-9A-F]{4}) label=', l) and int(l[3:7], 16) in labels)]
blocks = {int(m.group(2), 16): i for i, l in enumerate(lines) for m in [re.match(r'^([bcgistuw]) \$([0-9A-F]{4})', l)] if m}
have = set()
ins = {}   # индекс строки блока -> строки после
pre = {}
for a, (lab, t, d) in N.items():
    if a in blocks:
        i = blocks[a]
        lines[i] = re.match(r'^[a-z] \$[0-9A-F]{4}', lines[i]).group(0) + ' ' + t
        if d: ins.setdefault(i, []).append(f'D ${a:04X} {d}')
    else:
        ins.setdefault(blocks[block_of(a)], []).append(f'N ${a:04X} {t}. {d}'.rstrip())
for a, n, lab, c in V:
    ins.setdefault(blocks[block_of(a)], []).append(f'B ${a:04X},{n} {c}')
for a, lab in sorted(labels.items()):
    if a in have: continue
    pre.setdefault(blocks[block_of(a)], []).append(f'@ ${a:04X} label={lab}')
out = []
for i, l in enumerate(lines):
    if l.startswith('D $') or l.startswith('N $') or l.startswith('B $'):
        continue   # пересоздаются из заметок
    out += pre.get(i, []); out.append(l); out += ins.get(i, [])
open(ctl, 'w').write('\n'.join(out) + '\n')
print(f'{len(N)} заголовков, {len(labels)} меток, {len(V)} переменных')
