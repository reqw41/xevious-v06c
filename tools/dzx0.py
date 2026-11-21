#!/usr/bin/env python3
"""Распаковка ZX0 (v2, прямой порядок). dzx0.py in out"""
import sys
def dzx0(src):
    out = bytearray(); i = 0; bitbyte = 0; bitmask = 0; last_off = 1; backtrack = False; last_byte = 0
    def rbyte():
        nonlocal i, last_byte
        last_byte = src[i]; i += 1; return last_byte
    def rbit():
        nonlocal bitmask, bitbyte, backtrack
        if backtrack:
            backtrack = False; return last_byte & 1
        bitmask >>= 1
        if bitmask == 0:
            bitmask = 128; bitbyte = rbyte()
        return 1 if bitbyte & bitmask else 0
    def rgamma(inv=False):
        v = 1
        while not rbit():
            v = (v << 1) | (rbit() ^ inv)
        return v
    state = 'lit'
    while True:
        if state == 'lit':
            n = rgamma()
            for _ in range(n): out.append(rbyte())
            state = 'new' if rbit() else 'rep'
        elif state == 'rep':
            n = rgamma()
            for _ in range(n): out.append(out[-last_off])
            state = 'new' if rbit() else 'lit'
        else:
            msb = rgamma(True)
            if msb == 256: return bytes(out), i
            last_off = msb * 128 - (rbyte() >> 1)
            backtrack = True
            n = rgamma() + 1
            for _ in range(n): out.append(out[-last_off])
            state = 'new' if rbit() else 'lit'
if __name__ == '__main__':
    d, used = dzx0(open(sys.argv[1], 'rb').read())
    open(sys.argv[2], 'wb').write(d); print(sys.argv[1], 'packed', used, '-> unpacked', len(d))
