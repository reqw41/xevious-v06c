#!/usr/bin/env python3
"""Показать Z80-код из build/skool/disc.skool по диапазонам: python3 tools/z80show.py 2F52-2FDB 23A4-2489"""
import re, sys
L = open('build/skool/disc.skool').read().split('\n')
for rg in sys.argv[1:]:
    a, b = (int(x, 16) for x in rg.split('-'))
    on = False
    for l in L:
        m = re.match(r'^[cbsut* @]\$([0-9A-F]{4}) ', l)
        if m: on = a <= int(m.group(1), 16) < b
        if on and l.strip() and not l.startswith('; Used by') and not l.startswith(';\n'): print(l.rstrip(' ;'))
