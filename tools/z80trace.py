#!/usr/bin/env python3
"""Достройка карты кода: от исполненных команд (профиль Fuse 0xADDR,COUNT) — по всем переходам статически
(условные jp/jr/call/djnz, rst, продолжение после условных ret и call). Непрямые (jp (hl)) не следуются.

  z80trace.py BIN ORG MAP_IN MAP_OUT [--lo A --hi B]
MAP_OUT — тот же формат; добавленные адреса получают счётчик 0 (sna2ctl считает их кодом по наличию строки).
"""
import sys

def length(m, a):
    op = m(a)
    if op == 0xCB: return 2
    if op == 0xED:
        o2 = m(a + 1)
        return 4 if o2 in (0x43, 0x4B, 0x53, 0x5B, 0x63, 0x6B, 0x73, 0x7B) else 2
    if op in (0xDD, 0xFD):
        o2 = m(a + 1)
        if o2 == 0xCB: return 4
        if o2 in (0xDD, 0xFD, 0xED): return 1          # лишний префикс
        if o2 == 0x36: return 4
        if o2 in (0x21, 0x22, 0x2A): return 4
        base = length(m, a + 1)
        uses_d = o2 in (0x34, 0x35, 0x46, 0x4E, 0x56, 0x5E, 0x66, 0x6E, 0x7E, 0x86, 0x8E, 0x96, 0x9E, 0xA6, 0xAE, 0xB6, 0xBE) \
            or 0x70 <= o2 <= 0x77 and o2 != 0x76
        return 1 + base + (1 if uses_d else 0)
    if op in (0x06, 0x0E, 0x16, 0x1E, 0x26, 0x2E, 0x36, 0x3E, 0xC6, 0xCE, 0xD6, 0xDE, 0xE6, 0xEE, 0xF6, 0xFE,
              0xD3, 0xDB, 0x10, 0x18, 0x20, 0x28, 0x30, 0x38):
        return 2
    if op in (0x01, 0x11, 0x21, 0x31, 0x22, 0x2A, 0x32, 0x3A) or (op & 0xC7) in (0xC2, 0xC4) or op in (0xC3, 0xCD):
        return 3
    return 1

def succ(m, a):
    """(следующие адреса, конец потока?)"""
    op = m(a); n = length(m, a); nxt = a + n
    w = lambda: m(a + 1) | (m(a + 2) << 8)
    rel = lambda: (a + 2 + ((m(a + 1) ^ 0x80) - 0x80)) & 0xFFFF
    if op == 0xC3: return [w()], True
    if op == 0x18: return [rel()], True
    if op in (0xC9, 0xE9): return [], True
    if op == 0xED and m(a + 1) in (0x45, 0x4D): return [], True
    if op in (0xDD, 0xFD) and m(a + 1) == 0xE9: return [], True
    if (op & 0xC7) == 0xC2 or op == 0xCD or (op & 0xC7) == 0xC4: return [w(), nxt], False
    if op in (0x10, 0x20, 0x28, 0x30, 0x38): return [rel(), nxt], False
    if (op & 0xC7) == 0xC7: return [op & 0x38, nxt], False
    return [nxt], False

def main():
    a = sys.argv
    binf, org, mi, mo = a[1], int(a[2], 0), a[3], a[4]
    lo = int(a[a.index('--lo') + 1], 0) if '--lo' in a else org
    data = open(binf, 'rb').read()
    hi = int(a[a.index('--hi') + 1], 0) if '--hi' in a else org + len(data)
    m = lambda x: data[x - org] if org <= x < org + len(data) else 0
    ex = {}
    for line in open(mi):
        k, v = line.strip().split(','); ex[int(k, 16)] = int(v)
    seen = set(); work = [x for x in ex if lo <= x < hi]
    while work:
        x = work.pop()
        while lo <= x < hi and x not in seen:
            seen.add(x)
            s, end = succ(m, x)
            for t in s[:-1] if not end else s:
                if lo <= t < hi and t not in seen: work.append(t)
            if end: break
            x = s[-1]
    added = sorted(seen - set(ex))
    with open(mo, 'w') as f:
        for x in sorted(seen | set(ex)):
            f.write(f'0x{x:04x},{ex.get(x, 0)}\n')
    print(f'исполнено {len(ex)} команд, добавлено статически {len(added)}')

if __name__ == '__main__':
    main()
