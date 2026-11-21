#!/usr/bin/env python3
"""Разметка SkoolKit для Xevious CPC: код disc.bin (0100h) и звуковой драйвер xeviosnd.bin (4000h, стр. 4).

  python3 tools/skool.py cover            # покрытие на модели CPC (tools/cpc/cover.js) -> build/cov
  python3 tools/skool.py genctl [--force] # черновики src/cpc/*.ctl: sna2ctl по карте исполнения + обход переходов
  python3 tools/skool.py build [--html]   # build/skool/*.{skool,asm} (+ html), побайтная проверка пересборки

src/cpc/*.ctl — границы блоков (источник истины); src/cpc/*_notes.py — смысл: метки, заголовки, описания,
переменные (tools/ctlpatch.py вливает их в ctl при build). genctl без --force существующие ctl не трогает.
"""
import argparse, pathlib, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
VENV = ROOT / 'tools/.venv/bin'
COV = ROOT / 'build/cov'
OUT = ROOT / 'build/skool'
PARTS = {
    'disc': dict(bin=ROOT / 'ref/cpc/files/disc.bin', org=0x100, map='exec.map', title='Xevious CPC: disc.bin (код)'),
    'snd': dict(bin=ROOT / 'ref/cpc/files/xeviosnd.bin', org=0x4000, map='exec_snd.map',
                title='Xevious CPC: xeviosnd.bin (звук, страница 4)'),
}


def run(cmd, out=None):
    r = subprocess.run([str(c) for c in cmd], capture_output=True, text=True)
    if r.returncode:
        sys.exit(f'ошибка: {" ".join(map(str, cmd))}\n{r.stderr[-2000:]}')
    if out:
        pathlib.Path(out).write_text(r.stdout)
    return r


def cover():
    run(['node', ROOT / 'tools/cpc/cover.js', '--out', COV])
    print((COV / 'summary.json').read_text()[:200])


def genctl(force):
    (ROOT / 'src/cpc').mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    for name, p in PARTS.items():
        ctl = ROOT / f'src/cpc/{name}.ctl'
        if ctl.exists() and not force:
            print(f'{ctl.name} есть, пропуск'); continue
        size = p['bin'].stat().st_size
        smap = COV / f'{name}_static.map'
        r = run(['python3', ROOT / 'tools/z80trace.py', p['bin'], hex(p['org']), COV / p['map'], smap])
        print(name, r.stdout.strip())
        r = run([VENV / 'sna2ctl.py', '-h', '-o', hex(p['org']), '-m', smap, p['bin']])
        ctl.write_text(f'; {p["title"]}, {p["org"]:04X}h–{p["org"] + size - 1:04X}h.\n'
                       f'; Черновик: sna2ctl по карте исполнения модели CPC (tools/cpc/cover.js) и обходу переходов\n'
                       f'; (tools/z80trace.py). Дальше — ручная разметка здесь.\n' + r.stdout)
        print(f'{name}: {ctl.relative_to(ROOT)}')


def build(html):
    OUT.mkdir(parents=True, exist_ok=True)
    bad = 0
    for name, p in PARTS.items():
        ctl = ROOT / f'src/cpc/{name}.ctl'
        notes = ROOT / f'src/cpc/{name}_notes.py'
        if notes.exists():   # смысловая разметка (метки, заголовки, переменные) вливается в ctl
            run(['python3', ROOT / 'tools/ctlpatch.py', ctl, notes])
        org, size = p['org'], p['bin'].stat().st_size
        skool = OUT / f'{name}.skool'
        run([VENV / 'sna2skool.py', '-H', '-o', hex(org), '-c', ctl, p['bin']], skool)
        rb = OUT / f'{name}.rebuilt'
        run([VENV / 'skool2bin.py', '-i', '-S', hex(org), '-E', hex(org + size), skool, rb])
        same = rb.read_bytes() == p['bin'].read_bytes()
        bad += not same
        run([VENV / 'skool2asm.py', '-H', skool], OUT / f'{name}.asm')
        if html:
            ref = OUT / f'{name}.ref'
            ref.write_text(f'[Game]\nGame={p["title"]}\n')
            run([VENV / 'skool2html.py', '-H', '-d', OUT / 'html', '-c', f'Config/GameDir={name}', skool, ref])
        print(f'{name} {org:04X}h: пересборка {"IDENTICAL" if same else "РАСХОЖДЕНИЕ"}')
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('cmd', choices=['cover', 'genctl', 'build'])
    ap.add_argument('--force', action='store_true')
    ap.add_argument('--html', action='store_true')
    a = ap.parse_args()
    {'cover': cover, 'genctl': lambda: genctl(a.force), 'build': lambda: build(a.html)}[a.cmd]()
